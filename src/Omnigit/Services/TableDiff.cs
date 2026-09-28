using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Omnigit.Services;

public enum TableRowKind
{
    Same,
    Added,
    Removed,

    /// <summary>The same row on both sides with some cells changed.</summary>
    Modified,

    /// <summary>A run of unchanged rows folded away, <see cref="TableRow.Folded"/> long.</summary>
    Folded,
}

public sealed class TableRow
{
    public required TableRowKind Kind { get; init; }

    /// <summary>The row as it is now, or as it was for a removed row.</summary>
    public IReadOnlyList<string> Cells { get; init; } = [];

    /// <summary>The row as it was, for a modified row only.</summary>
    public IReadOnlyList<string>? OldCells { get; init; }

    /// <summary>1-based line numbers in the old and new file, 0 where the row is not on that side.</summary>
    public int OldNumber { get; init; }
    public int NewNumber { get; init; }

    public int Folded { get; init; }

    public bool CellChanged(int column)
        => Kind == TableRowKind.Modified
           && !string.Equals(Cell(OldCells!, column), Cell(Cells, column), StringComparison.Ordinal);

    internal static string Cell(IReadOnlyList<string> cells, int column)
        => column < cells.Count ? cells[column] : string.Empty;
}

/// <summary>
/// Reads delimited text and compares two versions of a table row by row, cell by cell.
/// </summary>
/// <remarks>
/// <para>
/// A spreadsheet exported to CSV changes one cell and the line diff shows a whole line
/// swapped for another almost identical one, with nothing to say which of forty commas
/// moved. Laid out as a grid with the changed cell marked, it is obvious.
/// </para>
/// <para>
/// Rows are matched as a line diff matches lines - common prefix and suffix first, then
/// the longest common subsequence of what is left - and a removed row next to an added
/// one that shares at least half its cells is shown as one row modified. Rows are not
/// matched by a key column: nothing in a CSV says which column that would be, and
/// guessing wrong would pair rows that have nothing to do with each other.
/// </para>
/// </remarks>
public static class TableDiff
{
    /// <summary>Unchanged rows kept either side of a change; longer runs are folded.</summary>
    public const int Context = 3;

    /// <summary>Beyond this many old-by-new cells the middle is compared as replaced, not aligned.</summary>
    private const long MaxAlignment = 4_000_000;

    /// <summary>
    /// RFC 4180: fields separated by <paramref name="delimiter"/>, quoted fields may hold
    /// the delimiter, line breaks and doubled quotes.
    /// </summary>
    public static List<string[]> Parse(string text, char delimiter)
    {
        var rows = new List<string[]>();
        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        var i = 0;

        // A byte-order mark is not part of the first header.
        if (text.Length > 0 && text[0] == '﻿')
            i = 1;

        for (; i < text.Length; i++)
        {
            var c = text[i];

            if (quoted)
            {
                if (c == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"')
                    {
                        field.Append('"');
                        i++;
                    }
                    else
                        quoted = false;
                }
                else
                    field.Append(c);

                continue;
            }

            if (c == '"' && field.Length == 0)
                quoted = true;
            else if (c == delimiter)
            {
                row.Add(field.ToString());
                field.Clear();
            }
            else if (c is '\n' or '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n')
                    i++;

                row.Add(field.ToString());
                field.Clear();
                rows.Add([.. row]);
                row.Clear();
            }
            else
                field.Append(c);
        }

        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add([.. row]);
        }

        return rows;
    }

    /// <summary>
    /// Tab for .tsv. For anything else, whichever of comma, semicolon and tab is commonest
    /// in the first line - a spreadsheet saved as CSV where the decimal separator is a
    /// comma uses semicolons, and splitting that on commas makes one wide column of noise.
    /// </summary>
    public static char DelimiterFor(string path, string? sample)
    {
        if (path.EndsWith(".tsv", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".tab", StringComparison.OrdinalIgnoreCase))
            return '\t';

        if (string.IsNullOrEmpty(sample))
            return ',';

        var end = sample.IndexOf('\n');
        var first = end < 0 ? sample : sample[..end];

        return new[] { ',', ';', '\t' }
            .OrderByDescending(d => first.Count(c => c == d))
            .First();
    }

    /// <summary>Every row of the new table, the removed rows where they were, and unchanged runs folded.</summary>
    public static List<TableRow> Compare(IReadOnlyList<string[]> before, IReadOnlyList<string[]> after)
    {
        var raw = Align(before, after);
        return Fold(raw);
    }

    private static List<TableRow> Align(IReadOnlyList<string[]> a, IReadOnlyList<string[]> b)
    {
        var rows = new List<TableRow>();

        var prefix = 0;
        while (prefix < a.Count && prefix < b.Count && Same(a[prefix], b[prefix]))
            prefix++;

        var suffix = 0;
        while (suffix < a.Count - prefix && suffix < b.Count - prefix
               && Same(a[a.Count - 1 - suffix], b[b.Count - 1 - suffix]))
            suffix++;

        for (var i = 0; i < prefix; i++)
            rows.Add(new TableRow { Kind = TableRowKind.Same, Cells = b[i], OldNumber = i + 1, NewNumber = i + 1 });

        var aEnd = a.Count - suffix;
        var bEnd = b.Count - suffix;
        var n = aEnd - prefix;
        var m = bEnd - prefix;

        // Old index, new index, as pairs of matched rows in the middle.
        var matches = (long)n * m <= MaxAlignment ? Lcs(a, b, prefix, aEnd, prefix, bEnd) : [];

        var ai = prefix;
        var bi = prefix;

        foreach (var (ma, mb) in matches.Append((aEnd, bEnd)))
        {
            Replaced(rows, a, ai, ma, b, bi, mb);

            if (ma < aEnd)
                rows.Add(new TableRow { Kind = TableRowKind.Same, Cells = b[mb], OldNumber = ma + 1, NewNumber = mb + 1 });

            ai = ma + 1;
            bi = mb + 1;
        }

        for (var k = 0; k < suffix; k++)
        {
            var oi = aEnd + k;
            var ni = bEnd + k;
            rows.Add(new TableRow { Kind = TableRowKind.Same, Cells = b[ni], OldNumber = oi + 1, NewNumber = ni + 1 });
        }

        return rows;
    }

    /// <summary>
    /// A run of old rows replaced by a run of new ones. Paired by position where the pair
    /// shares at least half its cells; otherwise the old row is removed and the new added.
    /// </summary>
    private static void Replaced(
        List<TableRow> rows, IReadOnlyList<string[]> a, int aFrom, int aTo, IReadOnlyList<string[]> b, int bFrom, int bTo)
    {
        var removed = aTo - aFrom;
        var added = bTo - bFrom;

        for (var p = 0; p < Math.Max(removed, added); p++)
        {
            var old = p < removed ? a[aFrom + p] : null;
            var now = p < added ? b[bFrom + p] : null;

            if (old is not null && now is not null && Similar(old, now))
            {
                rows.Add(new TableRow
                {
                    Kind = TableRowKind.Modified,
                    Cells = now,
                    OldCells = old,
                    OldNumber = aFrom + p + 1,
                    NewNumber = bFrom + p + 1,
                });
                continue;
            }

            if (old is not null)
                rows.Add(new TableRow { Kind = TableRowKind.Removed, Cells = old, OldNumber = aFrom + p + 1 });
            if (now is not null)
                rows.Add(new TableRow { Kind = TableRowKind.Added, Cells = now, NewNumber = bFrom + p + 1 });
        }
    }

    private static List<(int A, int B)> Lcs(
        IReadOnlyList<string[]> a, IReadOnlyList<string[]> b, int aFrom, int aTo, int bFrom, int bTo)
    {
        var n = aTo - aFrom;
        var m = bTo - bFrom;
        var table = new int[n + 1, m + 1];

        for (var i = n - 1; i >= 0; i--)
        for (var j = m - 1; j >= 0; j--)
        {
            table[i, j] = Same(a[aFrom + i], b[bFrom + j])
                ? table[i + 1, j + 1] + 1
                : Math.Max(table[i + 1, j], table[i, j + 1]);
        }

        var pairs = new List<(int, int)>();
        for (int i = 0, j = 0; i < n && j < m;)
        {
            if (Same(a[aFrom + i], b[bFrom + j]))
            {
                pairs.Add((aFrom + i, bFrom + j));
                i++;
                j++;
            }
            else if (table[i + 1, j] >= table[i, j + 1])
                i++;
            else
                j++;
        }

        return pairs;
    }

    private static bool Same(string[] x, string[] y) => x.AsSpan().SequenceEqual(y);

    private static bool Similar(string[] old, string[] now)
    {
        var columns = Math.Max(old.Length, now.Length);
        if (columns == 0)
            return true;

        var same = 0;
        for (var c = 0; c < columns; c++)
        {
            if (string.Equals(TableRow.Cell(old, c), TableRow.Cell(now, c), StringComparison.Ordinal))
                same++;
        }

        return same * 2 >= columns;
    }

    /// <summary>
    /// Keeps <see cref="Context"/> unchanged rows around each change and folds the rest -
    /// except the first row, which is almost always the header and is what makes the
    /// columns readable at all.
    /// </summary>
    private static List<TableRow> Fold(List<TableRow> rows)
    {
        var keep = new bool[rows.Count];

        for (var i = 0; i < rows.Count; i++)
        {
            if (rows[i].Kind == TableRowKind.Same && i != 0)
                continue;

            for (var k = Math.Max(0, i - Context); k <= Math.Min(rows.Count - 1, i + Context); k++)
                keep[k] = true;
        }

        var folded = new List<TableRow>();
        var run = 0;

        for (var i = 0; i < rows.Count; i++)
        {
            if (keep[i])
            {
                if (run > 0)
                    folded.Add(new TableRow { Kind = TableRowKind.Folded, Folded = run });
                run = 0;
                folded.Add(rows[i]);
            }
            else
                run++;
        }

        if (run > 0)
            folded.Add(new TableRow { Kind = TableRowKind.Folded, Folded = run });

        return folded;
    }
}
