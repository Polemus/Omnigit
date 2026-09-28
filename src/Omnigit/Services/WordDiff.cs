using System;
using System.Collections.Generic;
using Omnigit.Models;

namespace Omnigit.Services;

/// <summary>A run of characters within a line: where it starts and how long it is.</summary>
public readonly record struct TextRange(int Start, int Length)
{
    public int End => Start + Length;
}

/// <summary>
/// Picks out the words that changed between a removed line and the added line that
/// replaced it, so a one-character fix does not read as a whole line rewritten.
/// </summary>
/// <remarks>
/// <para>
/// Pairing is by position inside each block of removals followed by additions: the
/// first removed line against the first added one, and so on. That is what git's own
/// <c>--word-diff</c> display and every side-by-side view assume, and it is right for
/// the edits people actually make. Lines left over when one side is longer have no
/// partner and get no emphasis - the whole line is the change.
/// </para>
/// <para>
/// A pair that shares too little is left alone too. Highlighting nine words of ten
/// says nothing the red and green did not already say, and makes the line harder to
/// read than no highlighting at all.
/// </para>
/// </remarks>
public static class WordDiff
{
    /// <summary>Below this share of unchanged text, a pair is a rewrite rather than an edit.</summary>
    private const double MinimumShared = 0.4;

    /// <summary>
    /// The comparison is quadratic in tokens, so a minified line of ten thousand is not
    /// worth it - nobody reads the word changes in one of those anyway.
    /// </summary>
    private const int MaxTokens = 600;

    /// <summary>Sets <see cref="DiffLine.Emphasis"/> on every paired removed and added line.</summary>
    public static void Apply(IReadOnlyList<DiffLine> lines)
    {
        var i = 0;

        while (i < lines.Count)
        {
            if (lines[i].Kind != DiffLineKind.Removed)
            {
                i++;
                continue;
            }

            var removedStart = i;
            while (i < lines.Count && lines[i].Kind == DiffLineKind.Removed)
                i++;

            var addedStart = i;
            while (i < lines.Count && lines[i].Kind == DiffLineKind.Added)
                i++;

            var pairs = Math.Min(addedStart - removedStart, i - addedStart);

            for (var p = 0; p < pairs; p++)
            {
                var removed = lines[removedStart + p];
                var added = lines[addedStart + p];

                if (Compare(removed.Text, added.Text) is { } result)
                {
                    removed.Emphasis = result.Old;
                    added.Emphasis = result.New;
                }
            }
        }
    }

    /// <summary>
    /// The changed ranges on each side, or null when the two lines are too different, or
    /// too long, for word emphasis to help.
    /// </summary>
    public static (IReadOnlyList<TextRange> Old, IReadOnlyList<TextRange> New)? Compare(string before, string after)
    {
        if (before == after)
            return null;

        var a = Tokenise(before);
        var b = Tokenise(after);

        if (a.Count == 0 || b.Count == 0 || a.Count > MaxTokens || b.Count > MaxTokens)
            return null;

        var (keptA, keptB, sharedChars) = CommonTokens(a, b, before, after);

        var longest = Math.Max(before.Trim().Length, after.Trim().Length);
        if (longest == 0 || (double)sharedChars / longest < MinimumShared)
            return null;

        return (Ranges(a, keptA, before), Ranges(b, keptB, after));
    }

    /// <summary>
    /// Words, runs of whitespace, and single punctuation characters. Punctuation on its
    /// own so that <c>foo(a)</c> to <c>foo(b)</c> marks the <c>a</c>, not the whole call.
    /// </summary>
    internal static List<TextRange> Tokenise(string text)
    {
        var tokens = new List<TextRange>();
        var i = 0;

        while (i < text.Length)
        {
            var start = i;
            var c = text[i];

            if (char.IsLetterOrDigit(c) || c == '_')
            {
                while (i < text.Length && (char.IsLetterOrDigit(text[i]) || text[i] == '_'))
                    i++;
            }
            else if (char.IsWhiteSpace(c))
            {
                while (i < text.Length && char.IsWhiteSpace(text[i]))
                    i++;
            }
            else
            {
                i++;
            }

            tokens.Add(new TextRange(start, i - start));
        }

        return tokens;
    }

    /// <summary>The longest common subsequence of tokens, as a kept-flag per token on each side.</summary>
    private static (bool[] KeptA, bool[] KeptB, int SharedChars) CommonTokens(
        List<TextRange> a, List<TextRange> b, string textA, string textB)
    {
        var n = a.Count;
        var m = b.Count;
        var table = new int[n + 1, m + 1];

        for (var i = n - 1; i >= 0; i--)
        for (var j = m - 1; j >= 0; j--)
        {
            table[i, j] = Same(a[i], b[j], textA, textB)
                ? table[i + 1, j + 1] + 1
                : Math.Max(table[i + 1, j], table[i, j + 1]);
        }

        var keptA = new bool[n];
        var keptB = new bool[m];
        var shared = 0;

        for (int i = 0, j = 0; i < n && j < m;)
        {
            if (Same(a[i], b[j], textA, textB))
            {
                keptA[i] = keptB[j] = true;

                // Whitespace is kept for alignment but not counted as agreement: two
                // lines sharing only their spaces have nothing in common worth showing.
                if (!string.IsNullOrWhiteSpace(textA.Substring(a[i].Start, a[i].Length)))
                    shared += a[i].Length;

                i++;
                j++;
            }
            else if (table[i + 1, j] >= table[i, j + 1])
                i++;
            else
                j++;
        }

        return (keptA, keptB, shared);
    }

    private static bool Same(TextRange x, TextRange y, string textA, string textB)
        => x.Length == y.Length
           && string.CompareOrdinal(textA, x.Start, textB, y.Start, x.Length) == 0;

    /// <summary>
    /// Changed tokens joined into ranges. A single unchanged space between two changed
    /// tokens is swallowed, so "old words" to "new text" marks one phrase rather than two
    /// words with a gap.
    /// </summary>
    private static List<TextRange> Ranges(List<TextRange> tokens, bool[] kept, string text)
    {
        var ranges = new List<TextRange>();
        var i = 0;

        while (i < tokens.Count)
        {
            if (kept[i])
            {
                i++;
                continue;
            }

            var start = tokens[i].Start;
            var end = tokens[i].End;
            i++;

            while (i < tokens.Count)
            {
                if (!kept[i])
                {
                    end = tokens[i].End;
                    i++;
                }
                else if (i + 1 < tokens.Count && !kept[i + 1]
                         && string.IsNullOrWhiteSpace(text.Substring(tokens[i].Start, tokens[i].Length)))
                {
                    end = tokens[i + 1].End;
                    i += 2;
                }
                else
                    break;
            }

            ranges.Add(new TextRange(start, end - start));
        }

        return ranges;
    }
}
