using System.Collections.Generic;
using System.Linq;
using Omnigit.Models;

namespace Omnigit.Services;

/// <summary>
/// Turns a list of commits into the lanes drawn beside them in the history.
/// </summary>
/// <remarks>
/// <para>Pure, and deliberately so: given the commits in the order they are listed, it
/// answers where every line goes without touching a repository, which is what lets the
/// awkward shapes - an octopus merge, a branch that outlives the page, two roots - be
/// tested rather than looked at.</para>
///
/// <para>The model is one cell per row, split at the node. Above it, a segment for every
/// lane arriving from the row before; below it, one for every lane leaving towards the
/// row after. A lane index means the same column in both, so the bottom of one cell and
/// the top of the next always meet - which is what makes the drawing work under a
/// virtualising list that only ever knows about the rows on screen.</para>
/// </remarks>
public static class CommitGraph
{
    /// <summary>
    /// Beyond this the lanes are unreadable anyway, and each one costs horizontal room
    /// the summary needs more. Later lanes are folded onto the last column.
    /// </summary>
    public const int MaxLanes = 10;

    public static IReadOnlyList<CommitGraphRow> Build(
        IReadOnlyList<(string Sha, IReadOnlyList<string> Parents)> commits)
    {
        var rows = new List<CommitGraphRow>(commits.Count);

        // What each lane is waiting to see. A lane is free once the commit it expects
        // has been drawn and nothing else claimed it.
        var lanes = new List<Lane?>();

        foreach (var (sha, parents) in commits)
        {
            var arriving = Snapshot(lanes);

            // The lane this commit is drawn in: the first one waiting for it, or a free
            // one if nothing above referred to it - a branch tip, or the first commit.
            var lane = lanes.FindIndex(l => l?.Sha == sha);

            if (lane < 0)
                lane = Claim(lanes, new Lane(sha, FreeColour(lanes)));

            var colour = lanes[lane]!.Colour;

            // Every other lane waiting for this same commit merges into it here and is
            // then done: two children of one commit share the row it is drawn on.
            for (var i = 0; i < lanes.Count; i++)
            {
                if (i != lane && lanes[i]?.Sha == sha)
                    lanes[i] = null;
            }

            var above = arriving
                .Select((l, i) => (Lane: i, Waiting: l))
                .Where(x => x.Waiting is not null)
                .Select(x => x.Waiting!.Sha == sha
                    // Arrives at the node, curving across if it was in another column.
                    ? new GraphSegment(x.Lane, lane, x.Waiting.Colour)
                    : new GraphSegment(x.Lane, x.Lane, x.Waiting.Colour))
                .ToList();

            // The first parent continues this commit's own lane; the rest fork off, which
            // is what makes a merge two lines leaving one node rather than one.
            lanes[lane] = parents.Count > 0 ? new Lane(parents[0], colour) : null;

            foreach (var parent in parents.Skip(1))
            {
                // A parent already expected somewhere else keeps that lane: the second
                // parent of a merge is usually the branch it merged, still on screen.
                if (lanes.FindIndex(l => l?.Sha == parent) < 0)
                    Claim(lanes, new Lane(parent, FreeColour(lanes)));
            }

            Trim(lanes);

            var below = new List<GraphSegment>();

            for (var i = 0; i < lanes.Count; i++)
            {
                if (lanes[i] is not { } waiting)
                    continue;

                // A lane whose expectation this commit did not change carries its own
                // line straight down, whatever else happens on this row.
                var unchanged = i < arriving.Count && arriving[i]?.Sha == waiting.Sha;

                if (i == lane)
                {
                    below.Add(new GraphSegment(lane, lane, waiting.Colour));
                }
                else if (unchanged)
                {
                    below.Add(new GraphSegment(i, i, waiting.Colour));
                }
                else
                {
                    below.Add(new GraphSegment(lane, i, waiting.Colour));
                }

                // ...and a merge into a lane that was already running needs the curve as
                // well as that straight line. Emitting only one of the two was what left
                // a branch line stepping sideways where it should have carried on, with
                // the merge's own edge missing.
                if (unchanged && i != lane && parents.Contains(waiting.Sha))
                    below.Add(new GraphSegment(lane, i, waiting.Colour));
            }

            rows.Add(new CommitGraphRow
            {
                Lane = lane,
                Colour = colour,
                IsMerge = parents.Count > 1,
                Above = above,
                Below = below,
                Lanes = System.Math.Max(arriving.Count, lanes.Count),
            });
        }

        return rows;
    }

    /// <summary>
    /// The lowest colour no lane on screen is using, so two lines running side by side
    /// are never the same colour. Counting up instead put the ninth branch in lane one's
    /// colour beside it.
    /// </summary>
    private static int FreeColour(List<Lane?> lanes)
    {
        var taken = lanes.Where(l => l is not null).Select(l => l!.Colour).ToHashSet();

        for (var colour = 0; ; colour++)
        {
            if (!taken.Contains(colour))
                return colour;
        }
    }

    /// <summary>Puts a lane in the first free column, or on the end.</summary>
    private static int Claim(List<Lane?> lanes, Lane lane)
    {
        var free = lanes.FindIndex(l => l is null);

        if (free >= 0)
        {
            lanes[free] = lane;
            return free;
        }

        lanes.Add(lane);
        return lanes.Count - 1;
    }

    private static List<Lane?> Snapshot(List<Lane?> lanes) => [.. lanes];

    /// <summary>Drops empty columns off the end, so the gutter shrinks back.</summary>
    private static void Trim(List<Lane?> lanes)
    {
        while (lanes.Count > 0 && lanes[^1] is null)
            lanes.RemoveAt(lanes.Count - 1);
    }

    private sealed record Lane(string Sha, int Colour);
}
