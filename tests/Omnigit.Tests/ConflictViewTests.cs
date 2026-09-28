using LibGit2Sharp;
using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// A conflicted file used to show +0 -0 and an empty pane, because libgit2 writes no
/// patch for a path with three versions in the index. It is now drawn from the working
/// file, and these pin what that looks like.
/// </summary>
public class ConflictViewTests
{
    [Fact]
    public void A_real_merge_conflict_shows_both_sides_instead_of_nothing()
    {
        using var temp = new TempRepository();
        temp.Write("cart.js", "const shipping = 4.99;\nconst other = 1;\n");
        temp.Commit("start");

        using (var repo = new Repository(temp.Path))
            Commands.Checkout(repo, repo.CreateBranch("cheaper"));
        temp.Write("cart.js", "const shipping = 3.49;\nconst other = 1;\n");
        temp.Commit("cheaper shipping");

        using (var repo = new Repository(temp.Path))
        {
            Commands.Checkout(repo, repo.Branches["master"] ?? repo.Branches["main"]);
        }
        temp.Write("cart.js", "const shipping = 5.99;\nconst other = 1;\n");
        temp.Commit("dearer shipping");

        using (var repo = new Repository(temp.Path))
        {
            var signature = new Signature("Test", "test@example.com", DateTimeOffset.Now);
            var result = repo.Merge(repo.Branches["cheaper"], signature);
            Assert.Equal(MergeStatus.Conflicts, result.Status);
        }

        var change = Assert.Single(new GitService().GetWorkingChanges(temp.Path));

        Assert.Equal(ChangeStatus.Conflicted, change.Status);
        Assert.Equal((1, 1), (change.Additions, change.Deletions));

        var ours = Assert.Single(change.Diff, l => l.IsRemoved);
        var theirs = Assert.Single(change.Diff, l => l.IsAdded);
        Assert.Equal("const shipping = 5.99;", ours.Text);
        Assert.Equal("const shipping = 3.49;", theirs.Text);

        // Paired like any other edit, so the one number that differs is what is marked.
        Assert.Equal("5", ours.Text.Substring(ours.Emphasis[0].Start, ours.Emphasis[0].Length));
        Assert.Contains(change.Diff, l => l.IsHunkHeader && l.Text.StartsWith("<<<<<<<"));
        Assert.Contains(change.Diff, l => l.Kind == DiffLineKind.Context && l.Text == "const other = 1;");
    }

    [Fact]
    public void A_diff3_base_section_is_context_and_an_equals_line_outside_a_conflict_is_just_text()
    {
        var dir = Directory.CreateTempSubdirectory("omnigit-conflict-").FullName;
        try
        {
            File.WriteAllText(Path.Combine(dir, "notes.md"), """
                Title
                =======
                <<<<<<< HEAD
                mine
                ||||||| base
                original
                =======
                yours
                >>>>>>> feature
                """);

            var change = GitService.DescribeConflict(dir, "notes.md");
            var kinds = change.Diff.Select(l => (l.Kind, l.Text)).ToList();

            Assert.Equal((DiffLineKind.Context, "Title"), kinds[0]);
            Assert.Equal((DiffLineKind.Context, "======="), kinds[1]);
            Assert.Contains((DiffLineKind.Removed, "mine"), kinds);
            Assert.Contains((DiffLineKind.Context, "original"), kinds);
            Assert.Contains((DiffLineKind.Added, "yours"), kinds);
            Assert.Equal(4, change.Diff.Count(l => l.IsHunkHeader));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
