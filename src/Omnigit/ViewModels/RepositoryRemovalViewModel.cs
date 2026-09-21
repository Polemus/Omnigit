using System.Collections.Generic;
using System.Linq;
using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.ViewModels;

/// <summary>
/// The question asked before a clone is moved to the trash: which one, from where, and
/// what is about to go with it that exists nowhere else.
/// </summary>
/// <remarks>
/// Removing a repository from the list needs no dialog - the files stay and re-adding
/// takes one folder picker. Deleting one does, and this is what it says.
///
/// The warnings are the reason this is a view model rather than a message string. A
/// clone that is level with its remote is a copy of something the server still has; one
/// with uncommitted edits, unpushed commits or a stash is not, and the difference is
/// invisible from the sidebar. Every git client that has ever lost someone's work lost
/// it because the destructive action looked the same in both cases.
/// </remarks>
public sealed class RepositoryRemovalViewModel
{
    public required RepositoryInfo Repository { get; init; }

    /// <summary>Where it is, shown in full: deleting the wrong one is the failure here.</summary>
    public required string Path { get; init; }

    /// <summary>Files changed but not committed.</summary>
    public required int UncommittedChanges { get; init; }

    /// <summary>Commits on the checked-out branch the remote has not got.</summary>
    public required int UnpushedCommits { get; init; }

    /// <summary>1 when the checked-out branch is on no server at all, 0 otherwise.</summary>
    public required int UnpublishedBranches { get; init; }

    public required int Stashes { get; init; }

    public string Title => Strings.Format("Delete {0}?", Repository.Name);

    /// <summary>
    /// Named for what actually happens. "Delete" would be a lie about the Recycle Bin and
    /// an alarm about nothing; "Move to trash" says both that it goes and that it can
    /// come back.
    /// </summary>
    public string ConfirmLabel => Strings.Get("Move to trash");

    public bool HasWarnings => Warnings.Count > 0;

    /// <summary>
    /// Everything in this clone that the remote does not have. Deliberately counted
    /// rather than summarised - "you have unsaved work" is ignorable, "4 uncommitted
    /// changes and 2 unpushed commits" is not.
    /// </summary>
    public IReadOnlyList<string> Warnings
    {
        get
        {
            var warnings = new List<string>();

            if (UncommittedChanges > 0)
                warnings.Add(Strings.Plural("{0} uncommitted change", "{0} uncommitted changes", UncommittedChanges));

            if (UnpushedCommits > 0)
                warnings.Add(Strings.Plural("{0} unpushed commit", "{0} unpushed commits", UnpushedCommits));

            if (UnpublishedBranches > 0)
                warnings.Add(Strings.Get("a branch that is on no server"));

            if (Stashes > 0)
                warnings.Add(Strings.Plural("{0} stash", "{0} stashes", Stashes));

            return warnings;
        }
    }

    /// <summary>
    /// One sentence with the list dropped into it, rather than a sentence built by
    /// concatenating a prefix and a suffix around it. The placeholder is the whole of
    /// what makes this translatable: the list is the object of the sentence, and plenty
    /// of languages do not put an object where English does.
    /// </summary>
    public string WarningSummary => Warnings.Count == 0
        ? string.Empty
        : Strings.Format("This clone holds {0} — none of which are on the remote.", Join(Warnings));

    public string Summary => HasWarnings
        ? Strings.Get("The whole folder goes to the trash, where you can put it back from.")
        : Strings.Get("The whole folder goes to the trash. Everything in it has been pushed, "
                      + "so the remote still has it either way.");

    /// <summary>"a, b and c" - an Oxford-comma-free list, because it is read aloud in the head.</summary>
    /// <remarks>
    /// The joining words are translated, and the two-item case is a string of its own
    /// rather than the general case with one item: several languages join a pair
    /// differently from a longer list, and none of them can say so through a separator
    /// that is only ever a comma.
    /// </remarks>
    private static string Join(IReadOnlyList<string> parts) => parts.Count switch
    {
        1 => parts[0],
        2 => Strings.Format("{0} and {1}", parts[0], parts[1]),
        _ => Strings.Format("{0} and {1}",
                 string.Join(Strings.Particular("between items of a list", ", "), parts.Take(parts.Count - 1)),
                 parts[^1]),
    };
}
