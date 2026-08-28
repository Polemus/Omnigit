using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// The lanes drawn beside the history.
/// </summary>
/// <remarks>
/// Every case here is a shape that is awkward to check by eye and easy to get subtly
/// wrong: a merge whose second parent is already on screen, a branch that outlives the
/// page, two roots. The layout is a pure function of the listed commits precisely so
/// these can be asserted rather than squinted at.
///
/// Commits are given newest first, the order the list shows them in.
/// </remarks>
public class CommitGraphTests
{
    private static (string, IReadOnlyList<string>) C(string sha, params string[] parents)
        => (sha, parents);

    [Fact]
    public void A_straight_history_is_one_lane()
    {
        var rows = CommitGraph.Build([C("c", "b"), C("b", "a"), C("a")]);

        Assert.All(rows, r => Assert.Equal(0, r.Lane));
        Assert.All(rows, r => Assert.Equal(0, r.Colour));
        Assert.All(rows, r => Assert.False(r.IsMerge));

        // The last commit has no parent, so nothing leaves the bottom of its cell.
        Assert.Empty(rows[^1].Below);
        Assert.Single(rows[0].Below);
    }

    /// <summary>
    /// The first row of a list is a tip: nothing above it, so nothing arrives.
    /// </summary>
    [Fact]
    public void Nothing_arrives_at_the_newest_commit()
    {
        var rows = CommitGraph.Build([C("c", "b"), C("b")]);

        Assert.Empty(rows[0].Above);
        Assert.Single(rows[1].Above);
    }

    /// <summary>
    /// A merge: two lines arrive at the node from the row above, and the branch it
    /// merged gets a lane of its own on the way down.
    /// </summary>
    [Fact]
    public void A_merge_is_hollow_and_takes_a_second_lane()
    {
        //  m       merge of "a" (first parent) and "b"
        //  |\
        //  a b
        //  |/
        //  r
        var rows = CommitGraph.Build(
        [
            C("m", "a", "b"),
            C("a", "r"),
            C("b", "r"),
            C("r"),
        ]);

        Assert.True(rows[0].IsMerge);
        Assert.Equal(0, rows[0].Lane);

        // Both parents leave the merge, in two different lanes.
        Assert.Equal(2, rows[0].Below.Count);
        Assert.Contains(rows[0].Below, s => s.From == 0 && s.To == 0);
        Assert.Contains(rows[0].Below, s => s.From == 0 && s.To == 1);

        // The second parent is drawn in the lane the merge sent it to.
        Assert.Equal(1, rows[2].Lane);
        Assert.NotEqual(rows[1].Colour, rows[2].Colour);

        // Both lanes arrive at the shared root, which is one node not two.
        Assert.Equal(0, rows[3].Lane);
        Assert.Equal(2, rows[3].Above.Count);
        Assert.Contains(rows[3].Above, s => s.From == 1 && s.To == 0);
    }

    /// <summary>
    /// A branch whose tip is newer than the branch beside it: the second tip takes a
    /// free lane, and the two run in parallel until they meet.
    /// </summary>
    [Fact]
    public void Two_tips_run_in_parallel_until_they_meet()
    {
        var rows = CommitGraph.Build(
        [
            C("x", "r"),
            C("y", "r"),
            C("r"),
        ]);

        Assert.Equal(0, rows[0].Lane);
        Assert.Equal(1, rows[1].Lane);
        Assert.Equal(0, rows[2].Lane);

        // The row between them carries the first branch's line straight through.
        Assert.Contains(rows[1].Above, s => s is { From: 0, To: 0 });
    }

    /// <summary>
    /// A lane freed by one branch is reused by the next rather than the gutter growing
    /// forever - which is what keeps a long history from drifting off to the right.
    /// </summary>
    [Fact]
    public void A_finished_lane_is_reused()
    {
        var rows = CommitGraph.Build(
        [
            C("b", "a"),
            C("a"),          // a root: lane 0 is free after this
            C("d", "c"),     // an unrelated tip, which can have lane 0 back
            C("c"),
        ]);

        Assert.Equal(0, rows[0].Lane);
        Assert.Equal(0, rows[2].Lane);
        Assert.Equal(1, rows[2].Lanes);
    }

    /// <summary>
    /// Parents below the last row are cut off by the caller, and a lane that runs off
    /// the bottom of the page has to keep running rather than stopping short.
    /// </summary>
    [Fact]
    public void A_parent_off_the_page_still_leaves_the_cell()
    {
        var rows = CommitGraph.Build([C("c", "b")]);

        Assert.Single(rows[0].Below);
        Assert.Equal(0, rows[0].Below[0].From);
    }

    [Fact]
    public void An_octopus_merge_sends_a_lane_to_every_parent()
    {
        var rows = CommitGraph.Build(
        [
            C("m", "a", "b", "c"),
            C("a"),
            C("b"),
            C("c"),
        ]);

        Assert.True(rows[0].IsMerge);
        Assert.Equal(3, rows[0].Below.Count);
        Assert.Equal(3, rows[0].Lanes);
        Assert.Equal([0, 1, 2], new[] { rows[1].Lane, rows[2].Lane, rows[3].Lane });
    }

    /// <summary>
    /// A merge into a lane that is already running needs two lines below the node: that
    /// lane carrying on down, and the merge's own edge curving into it. Drawing only one
    /// of the two made the branch line step sideways where it should have continued, and
    /// left the merge apparently joined to nothing.
    /// </summary>
    [Fact]
    public void A_merge_into_a_running_lane_draws_both_the_line_and_the_edge()
    {
        var rows = CommitGraph.Build(
        [
            C("x", "b"),        // lane 0 is already waiting for b
            C("m", "a", "b"),   // ...and this merge also has b as a parent
            C("a", "b"),
            C("b"),
        ]);

        var below = rows[1].Below;

        Assert.Equal(1, rows[1].Lane);
        Assert.Contains(below, s => s is { From: 0, To: 0 });   // lane 0 carries on
        Assert.Contains(below, s => s is { From: 1, To: 1 });   // first parent continues
        Assert.Contains(below, s => s is { From: 1, To: 0 });   // the merge edge
    }

    [Fact]
    public void An_empty_history_draws_nothing()
    {
        Assert.Empty(CommitGraph.Build([]));
    }

    // ---- Against a real repository -----------------------------------------

    /// <summary>
    /// The scope is the whole reason the graph is worth drawing: a log of one branch is
    /// a straight line however good the layout is.
    /// </summary>
    [Fact]
    public void Every_branch_lists_work_the_checked_out_one_cannot_reach()
    {
        using var repo = new TempRepository();
        var git = new GitService();

        repo.Write("a.txt", "one");
        repo.Commit("on the default branch");

        var trunk = repo.CurrentBranch();
        git.CreateBranch(repo.Path, "sideline");
        repo.Write("b.txt", "two");
        repo.Commit("on the sideline");

        git.SwitchBranch(repo.Path, trunk, create: false, bringPaths: null);

        var mine = git.GetHistory(repo.Path, 50);
        var all = git.GetHistory(repo.Path, 50, everyBranch: true);

        Assert.DoesNotContain(mine, c => c.Summary == "on the sideline");
        Assert.Contains(all, c => c.Summary == "on the sideline");

        // And every row knows where it is drawn, which is what the gutter binds to.
        Assert.All(all, c => Assert.NotNull(c.Graph));
    }

    /// <summary>
    /// The badges beside a summary are what say which lane is which; without them a
    /// graph of several branches is a set of anonymous coloured lines.
    /// </summary>
    [Fact]
    public void A_branch_tip_is_labelled_with_its_branch()
    {
        using var repo = new TempRepository();
        var git = new GitService();

        repo.Write("a.txt", "one");
        repo.Commit("first");

        git.CreateBranch(repo.Path, "sideline");
        repo.Write("b.txt", "two");
        repo.Commit("second");

        var history = git.GetHistory(repo.Path, 50, everyBranch: true);
        var tip = history[0];

        Assert.Equal("second", tip.Summary);
        Assert.Contains("sideline", tip.Refs);
    }
}
