using System;
using System.Collections.Generic;
using Omnigit.Models;

namespace Omnigit.Services;

/// <summary>
/// One row of a side-by-side diff: the old line on the left, the new on the right, or a
/// hunk header across both.
/// </summary>
public sealed class SideBySideRow
{
    /// <summary>Set only on a hunk-header row, which spans both columns.</summary>
    public DiffLine? Hunk { get; init; }

    /// <summary>The old side, or null where the new side has a line and the old had none.</summary>
    public DiffLine? Left { get; init; }

    /// <summary>The new side, or null where the old side had a line and the new has none.</summary>
    public DiffLine? Right { get; init; }

    public bool IsHunk => Hunk is not null;
    public bool IsLines => Hunk is null;

    // Styling hooks, bound to Classes.* in the view.
    public bool LeftIsRemoved => Left?.IsRemoved == true;
    public bool LeftIsEmpty => Hunk is null && Left is null;
    public bool RightIsAdded => Right?.IsAdded == true;
    public bool RightIsEmpty => Hunk is null && Right is null;
}

/// <summary>Lays the rows of a unified diff out as two columns.</summary>
public static class SideBySide
{
    /// <remarks>
    /// Context lines sit on both sides. A block of removals and the additions straight
    /// after it are paired by position - the same pairing <see cref="WordDiff"/> uses,
    /// so the words it marked line up with their partner across the gap - and the
    /// longer side runs on against blank cells.
    /// </remarks>
    public static IReadOnlyList<SideBySideRow> Rows(IReadOnlyList<DiffLine> lines)
    {
        var rows = new List<SideBySideRow>(lines.Count);
        var i = 0;

        while (i < lines.Count)
        {
            var line = lines[i];

            switch (line.Kind)
            {
                case DiffLineKind.HunkHeader:
                    rows.Add(new SideBySideRow { Hunk = line });
                    i++;
                    break;

                case DiffLineKind.Context:
                    rows.Add(new SideBySideRow { Left = line, Right = line });
                    i++;
                    break;

                default:
                    var removed = new List<DiffLine>();
                    var added = new List<DiffLine>();

                    while (i < lines.Count && lines[i].Kind == DiffLineKind.Removed)
                        removed.Add(lines[i++]);
                    while (i < lines.Count && lines[i].Kind == DiffLineKind.Added)
                        added.Add(lines[i++]);

                    for (var p = 0; p < Math.Max(removed.Count, added.Count); p++)
                    {
                        rows.Add(new SideBySideRow
                        {
                            Left = p < removed.Count ? removed[p] : null,
                            Right = p < added.Count ? added[p] : null,
                        });
                    }

                    break;
            }
        }

        return rows;
    }
}
