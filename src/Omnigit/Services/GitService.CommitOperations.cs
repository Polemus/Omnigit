using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Omnigit.Models;
using LibGit2Sharp;

namespace Omnigit.Services;

/// <summary>
/// The things you can do to a commit that already exists: tag it, branch from it, open
/// it, undo it, copy it onto another branch, or move the branch back to it.
/// </summary>
/// <remarks>
/// Split from the rest of <see cref="GitService"/> because these share a shape the other
/// methods don't: each one can leave the repository part-way through an operation, so
/// they check the tree is clean first and report conflicts as a result rather than
/// throwing. What they leave behind is what <see cref="GetConflictedPaths"/> and
/// <see cref="AbortOperation"/> then work on.
/// </remarks>
public sealed partial class GitService
{
    /// <summary>Marker files that, between them, are git's record of a paused operation.</summary>
    private static readonly string[] OperationMarkers =
    [
        "MERGE_HEAD", "MERGE_MSG", "MERGE_MODE",
        "REVERT_HEAD", "CHERRY_PICK_HEAD",
    ];

    // ------------------------------------------------------------------- tags

    public string CreateTag(string path, string name, string sha, string? message)
    {
        var tagName = name.Trim();

        if (tagName.Length == 0)
            throw new InvalidOperationException("A tag needs a name.");

        using var repo = new Repository(Discover(path));

        var commit = Require(repo, sha);

        try
        {
            // Inside the try because even looking a tag up validates the name, and a name
            // git will not accept has to come back as our own message either way.
            if (repo.Tags[tagName] is not null)
                throw new InvalidOperationException(Strings.Format("Tag '{0}' already exists.", tagName));

            // With a message git writes a tag object recording who made it and why;
            // without one the tag is just a name pointing at the commit, which is what
            // `git tag <name>` does. Both are offered because both are ordinary.
            var tag = string.IsNullOrWhiteSpace(message)
                ? repo.ApplyTag(tagName, commit.Sha)
                : repo.ApplyTag(tagName, commit.Sha, SignatureFor(repo), message.Trim());

            return tag.FriendlyName;
        }
        catch (LibGit2SharpException ex)
        {
            // Refs have rules - no spaces, no "..", no trailing slash - and libgit2's own
            // wording for breaking them names the internal ref, not the tag.
            throw new InvalidOperationException(
                $"'{tagName}' is not a name git will accept for a tag: {ex.Message}", ex);
        }
    }

    // -------------------------------------------------------- opening a commit

    /// <summary>
    /// Puts the working tree at one commit, with HEAD pointing straight at it.
    /// </summary>
    /// <remarks>
    /// Refuses while anything is uncommitted. git would carry those changes onto a
    /// detached HEAD, which is the one place they are easy to lose track of - and unlike
    /// a branch switch there is nothing here worth stashing for, since coming back is a
    /// single click.
    /// </remarks>
    public SwitchResult CheckoutCommit(string path, string sha)
    {
        using var repo = new Repository(Discover(path));

        var commit = Require(repo, sha);

        if (ChangedPaths(repo).Count > 0)
        {
            return new SwitchResult(
                SwitchOutcome.Conflicts,
                Strings.Get("Commit or stash your changes before opening an older commit."),
                []);
        }

        Commands.Checkout(repo, commit);
        return SwitchResult.Ok();
    }

    // ---------------------------------------------------------------- undoing

    public CommitOperationResult RevertCommit(string path, string sha)
    {
        using var repo = new Repository(Discover(path));

        if (NotReady(repo,
                Strings.Format("Finish or abandon the {0} already in progress before you "
                               + "revert anything else.", Describe(repo.Info.CurrentOperation)),
                Strings.Get("Commit or stash your changes before you revert a commit — git needs "
                            + "a clean working tree to tell its own conflicts from yours."))
            is { } refusal)
            return refusal;

        var commit = Require(repo, sha);

        if (repo.Info.IsHeadDetached)
        {
            return CommitOperationResult.Refused(
                Strings.Get("Reverting writes a new commit, so check out a branch for it to go on first."));
        }

        var result = repo.Revert(commit, SignatureFor(repo));

        return result.Status switch
        {
            RevertStatus.Reverted => CommitOperationResult.Ok(
                Strings.Format("Reverted {0} — {1}",
                               Abbreviate(commit.Sha), Abbreviate(result.Commit.Sha))),

            RevertStatus.Conflicts => Conflicted(repo,
                Strings.Format("Undoing {0} clashes with what has changed since",
                               Abbreviate(commit.Sha))),

            _ => new CommitOperationResult(
                CommitOperationOutcome.NothingToDo,
                Strings.Format("{0} has already been undone — nothing to revert.",
                               Abbreviate(commit.Sha)),
                []),
        };
    }

    /// <summary>
    /// Copies one commit's changes onto another branch, switching to it first.
    /// </summary>
    /// <remarks>
    /// The branch is switched to rather than cherry-picked into from a distance because
    /// that is the only version git can actually do: a cherry-pick applies to whatever
    /// HEAD is on. Leaving the user there afterwards is also what they want when it
    /// conflicts - the half-applied state is on that branch, not this one.
    /// </remarks>
    public CommitOperationResult CherryPickCommit(string path, string sha, string ontoBranch)
    {
        using var repo = new Repository(Discover(path));

        if (NotReady(repo,
                Strings.Format("Finish or abandon the {0} already in progress before you "
                               + "copy a commit anywhere else.", Describe(repo.Info.CurrentOperation)),
                Strings.Get("Commit or stash your changes before you copy a commit — git needs "
                            + "a clean working tree to tell its own conflicts from yours."))
            is { } refusal)
            return refusal;

        var commit = Require(repo, sha);
        var target = ontoBranch.Trim();

        if (target.Length > 0 && !string.Equals(target, repo.Head.FriendlyName, StringComparison.Ordinal))
        {
            // Same refusal a branch switch makes, and for the same reason: the checkout
            // below writes the tree before it fails on HEAD, so a branch another worktree
            // is standing on has to be turned away before it runs.
            if (CheckedOutElsewhere(repo, target) is { } worktree)
            {
                return CommitOperationResult.Refused(
                    Strings.Format("{0} is already checked out in {1}. Switch that copy to "
                                   + "another branch first, or remove it.", target, worktree));
            }

            // Adopt for the same reason the branch picker checks one out: the target list
            // is the branch list, and that now holds branches which are only on the
            // remote. Copying a commit onto one means creating it here first.
            var branch = repo.Branches[target]
                         ?? Adopt(repo, target)
                         ?? throw new InvalidOperationException(
                                Strings.Format("Branch '{0}' not found.", target));

            Commands.Checkout(repo, branch);
        }

        var onto = repo.Head.FriendlyName;
        var result = repo.CherryPick(commit, SignatureFor(repo));

        return result.Status switch
        {
            CherryPickStatus.CherryPicked => CommitOperationResult.Ok(
                Strings.Format("Copied {0} onto {1} — {2}",
                               Abbreviate(commit.Sha), onto, Abbreviate(result.Commit.Sha))),

            _ => Conflicted(repo, Strings.Format("Copying {0} onto {1} hit conflicts",
                                                 Abbreviate(commit.Sha), onto)),
        };
    }

    /// <summary>
    /// Moves the current branch back to a commit.
    /// <see cref="ResetKind.Hard"/> throws away uncommitted work and cannot be undone;
    /// the caller confirms that first.
    /// </summary>
    public void ResetToCommit(string path, string sha, ResetKind kind)
    {
        using var repo = new Repository(Discover(path));

        var commit = Require(repo, sha);

        repo.Reset(kind switch
        {
            ResetKind.Soft => ResetMode.Soft,
            ResetKind.Hard => ResetMode.Hard,
            _ => ResetMode.Mixed,
        }, commit);
    }

    // ------------------------------------------------------------- conflicts

    public IReadOnlyList<string> GetConflictedPaths(string path)
    {
        using var repo = new Repository(Discover(path));
        return ConflictedPaths(repo);
    }

    /// <summary>
    /// Resolves one file by keeping one side of it whole, which is what the two obvious
    /// answers to a conflict are. Editing the markers by hand and then
    /// <see cref="MarkConflictResolved"/> covers everything else.
    /// </summary>
    public void ResolveConflict(string path, string file, ConflictSide side)
    {
        using var repo = new Repository(Discover(path));

        if (repo.Index.Conflicts[file] is not { } conflict)
            throw new InvalidOperationException($"{file} is not conflicted.");

        var keep = side == ConflictSide.Mine ? conflict.Ours : conflict.Theirs;
        var full = Path.Combine(repo.Info.WorkingDirectory, file);

        // No entry on that side means that side deleted the file, so keeping it means
        // the file goes - there is no blob to write.
        if (keep is null)
        {
            if (File.Exists(full))
                File.Delete(full);

            repo.Index.Remove(file);
            repo.Index.Write();
            return;
        }

        if (repo.Lookup<Blob>(keep.Id) is not { } blob)
            throw new InvalidOperationException(
                Strings.Format("The chosen version of {0} is missing from the repository.", file));

        Directory.CreateDirectory(Path.GetDirectoryName(full)!);

        using (var source = blob.GetContentStream())
        using (var target = File.Create(full))
        {
            source.CopyTo(target);
        }

        // Staging is what clears the three conflict entries and records the answer.
        Commands.Stage(repo, file);
    }

    /// <summary>Accepts the file as it now stands, markers presumably removed by hand.</summary>
    public void MarkConflictResolved(string path, IEnumerable<string> files)
    {
        var wanted = files.ToList();
        if (wanted.Count == 0)
            return;

        using var repo = new Repository(Discover(path));
        Commands.Stage(repo, wanted);
    }

    /// <summary>
    /// Abandons the operation in progress and puts the tree back to the last commit.
    /// Anything uncommitted goes with it, so the caller confirms first.
    /// </summary>
    public void AbortOperation(string path)
    {
        using var repo = new Repository(Discover(path));

        if (repo.Head.Tip is { } tip)
            repo.Reset(ResetMode.Hard, tip);

        ClearOperationState(repo);
    }

    /// <summary>
    /// The message git prepared for the commit that finishes the operation — the
    /// "Revert ..." line, or the merge summary. Null when there is nothing pending.
    /// </summary>
    public (string Summary, string Description)? GetPendingMessage(string path)
    {
        using var repo = new Repository(Discover(path));

        var file = Path.Combine(repo.Info.Path, "MERGE_MSG");
        if (!File.Exists(file))
            return null;

        // Comment lines are git's own instructions to the user, which mean nothing in a
        // text box that already says what is happening.
        var text = string.Join('\n', File.ReadAllLines(file)
            .Where(line => !line.StartsWith('#')))
            .Trim();

        if (text.Length == 0)
            return null;

        var split = text.IndexOf('\n');

        return split < 0
            ? (text, string.Empty)
            : (text[..split].Trim(), text[(split + 1)..].Trim());
    }

    /// <summary>
    /// Clears git's record that an operation was in progress.
    /// </summary>
    /// <remarks>
    /// libgit2 has <c>git_repository_state_cleanup</c>, but LibGit2Sharp does not expose
    /// it, and these files are the whole of that state. Committing goes through
    /// LibGit2Sharp, which does clean up after itself; this is only for abandoning.
    /// </remarks>
    private static void ClearOperationState(Repository repo)
    {
        foreach (var marker in OperationMarkers)
        {
            var file = Path.Combine(repo.Info.Path, marker);

            if (File.Exists(file))
                File.Delete(file);
        }

        var sequencer = Path.Combine(repo.Info.Path, "sequencer");

        if (Directory.Exists(sequencer))
            Directory.Delete(sequencer, recursive: true);
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>
    /// Why the repository can't take another operation right now, or null if it can.
    /// Checked up front so a refusal changes nothing at all.
    /// </summary>
    /// <param name="busy">
    /// What to say when another operation is already under way. Built by the caller,
    /// because it used to be one sentence with a bare English verb - "revert",
    /// "cherry-pick" - dropped into it, and a verb in a slot is the shape that does not
    /// survive a language which inflects.
    /// </param>
    /// <param name="dirty">The same, for a working tree with changes in it.</param>
    private static CommitOperationResult? NotReady(Repository repo, string busy, string dirty)
    {
        if (repo.Info.CurrentOperation != CurrentOperation.None)
            return CommitOperationResult.Refused(busy);

        if (ChangedPaths(repo).Count > 0)
            return CommitOperationResult.Refused(dirty);

        return null;
    }

    private static CommitOperationResult Conflicted(Repository repo, string what)
    {
        var paths = ConflictedPaths(repo);

        var names = string.Join(Strings.Particular("between items of a list", ", "), paths.Take(3))
                    + (paths.Count > 3
                        ? Strings.Plural(" and {0} more", " and {0} more", paths.Count - 3)
                        : string.Empty);

        return new CommitOperationResult(
            CommitOperationOutcome.Conflicts,
            Strings.Format("{0}: {1}. Choose a version for each, then commit — or abandon it.",
                           what, names),
            paths);
    }

    /// <summary>
    /// Conflicted paths, read from the index rather than from status: a conflict is
    /// recorded as up to three index entries, and the file may not exist in the tree at
    /// all when one side deleted it.
    /// </summary>
    private static List<string> ConflictedPaths(Repository repo)
        => repo.Index.Conflicts
            .Select(c => (c.Ours ?? c.Theirs ?? c.Ancestor)?.Path)
            .Where(p => p is not null)
            .Select(p => p!)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(p => p, StringComparer.Ordinal)
            .ToList();

    private static Commit Require(Repository repo, string sha)
        => repo.Lookup<Commit>(sha)
           ?? throw new InvalidOperationException(
                  Strings.Format("Commit {0} is not in this repository.", Abbreviate(sha)));

    private static Signature SignatureFor(Repository repo)
        => repo.Config.BuildSignature(DateTimeOffset.Now)
           ?? new Signature("Omnigit", "omnigit@localhost", DateTimeOffset.Now);

    private static string Abbreviate(string sha)
        => sha.Length > 7 ? sha[..7] : sha;

    private static RepositoryOperation ToOperation(CurrentOperation operation) => operation switch
    {
        CurrentOperation.None => RepositoryOperation.None,
        CurrentOperation.Merge => RepositoryOperation.Merge,
        CurrentOperation.Revert or CurrentOperation.RevertSequence => RepositoryOperation.Revert,
        CurrentOperation.CherryPick or CurrentOperation.CherryPickSequence => RepositoryOperation.CherryPick,
        CurrentOperation.Rebase or CurrentOperation.RebaseInteractive or CurrentOperation.RebaseMerge
            => RepositoryOperation.Rebase,
        _ => RepositoryOperation.Other,
    };

    private static string Describe(CurrentOperation operation)
        => ToOperation(operation) switch
        {
            RepositoryOperation.Merge => Strings.Get("merge"),
            RepositoryOperation.Revert => Strings.Get("revert"),
            RepositoryOperation.CherryPick => Strings.Get("cherry-pick"),
            RepositoryOperation.Rebase => Strings.Get("rebase"),
            _ => Strings.Get("operation"),
        };
}
