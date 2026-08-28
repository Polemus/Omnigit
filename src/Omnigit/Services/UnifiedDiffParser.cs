using System;
using System.Collections.Generic;
using Omnigit.Models;

namespace Omnigit.Services;

/// <summary>
/// Turns the unified-diff text libgit2 produces into the <see cref="DiffLine"/>
/// rows the diff view renders.
/// </summary>
/// <remarks>
/// libgit2 hands back a patch as plain text. We parse it rather than render it raw
/// so the view can style each line and show both old and new line numbers, which a
/// plain text block can't do.
/// </remarks>
public static class UnifiedDiffParser
{
    /// <summary>Caps how much of a very large patch we materialise into the UI.</summary>
    public const int MaxLines = 4000;

    /// <param name="path">
    /// The file the patch is of, used only to pick a syntax grammar. Omit it and the
    /// diff renders as plain text, which is what a file we ship no grammar for gets
    /// anyway.
    /// </param>
    public static IReadOnlyList<DiffLine> Parse(string? patchText, string? path = null)
    {
        var lines = new List<DiffLine>();

        if (string.IsNullOrEmpty(patchText))
            return lines;

        var oldNo = 0;
        var newNo = 0;

        // Two states, not one. A removed line and the added line under it are two
        // versions of the same place in the file, not consecutive lines of one - so
        // feeding both through a single tokeniser would have the old side's unclosed
        // string swallow the new side. Context lines are in both files and advance both.
        var highlighter = SyntaxHighlighter.For(path);
        var oldState = new SyntaxState();
        var newState = new SyntaxState();

        foreach (var raw in patchText.Split('\n'))
        {
            if (lines.Count >= MaxLines)
            {
                lines.Add(new DiffLine
                {
                    Kind = DiffLineKind.HunkHeader,
                    Text = $"… diff truncated at {MaxLines} lines",
                });
                break;
            }

            // Strip a trailing \r so CRLF repositories don't render stray glyphs.
            var line = raw.EndsWith('\r') ? raw[..^1] : raw;

            // File headers repeat information already shown in the view's own
            // header bar, so they are dropped.
            if (line.StartsWith("diff --git ", StringComparison.Ordinal)
                || line.StartsWith("index ", StringComparison.Ordinal)
                || line.StartsWith("--- ", StringComparison.Ordinal)
                || line.StartsWith("+++ ", StringComparison.Ordinal)
                || line.StartsWith("new file mode", StringComparison.Ordinal)
                || line.StartsWith("deleted file mode", StringComparison.Ordinal)
                || line.StartsWith("similarity index", StringComparison.Ordinal)
                || line.StartsWith("rename from", StringComparison.Ordinal)
                || line.StartsWith("rename to", StringComparison.Ordinal)
                || line.StartsWith("old mode", StringComparison.Ordinal)
                || line.StartsWith("new mode", StringComparison.Ordinal))
            {
                continue;
            }

            if (line.StartsWith("@@", StringComparison.Ordinal))
            {
                if (TryParseHunkHeader(line, out var oldStart, out var newStart))
                {
                    oldNo = oldStart;
                    newNo = newStart;
                }

                // A hunk is an extract. Whatever was open above it - a block comment,
                // a multi-line string - started on lines we were never given, so the
                // only honest thing is to start again and colour the first lines of a
                // hunk as code even when they are inside a comment.
                oldState.Reset();
                newState.Reset();

                lines.Add(new DiffLine { Kind = DiffLineKind.HunkHeader, Text = line });
                continue;
            }

            if (line.Length == 0)
                continue;

            switch (line[0])
            {
                case '+':
                    lines.Add(new DiffLine
                    {
                        Kind = DiffLineKind.Added,
                        Text = line[1..],
                        NewNumber = newNo.ToString(),
                        Spans = Highlight(highlighter, line[1..], newState),
                    });
                    newNo++;
                    break;

                case '-':
                    lines.Add(new DiffLine
                    {
                        Kind = DiffLineKind.Removed,
                        Text = line[1..],
                        OldNumber = oldNo.ToString(),
                        Spans = Highlight(highlighter, line[1..], oldState),
                    });
                    oldNo++;
                    break;

                case ' ':
                    var context = line[1..];

                    // Tokenised twice on purpose: the run is what the new side renders,
                    // and the old side has to be walked past the same text or its state
                    // falls behind by every context line in the hunk.
                    var spans = Highlight(highlighter, context, newState);
                    Highlight(highlighter, context, oldState);

                    lines.Add(new DiffLine
                    {
                        Kind = DiffLineKind.Context,
                        Text = context,
                        OldNumber = oldNo.ToString(),
                        NewNumber = newNo.ToString(),
                        Spans = spans,
                    });
                    oldNo++;
                    newNo++;
                    break;

                case '\\':
                    // "\ No newline at end of file"
                    lines.Add(new DiffLine { Kind = DiffLineKind.Context, Text = line });
                    break;
            }
        }

        return lines;
    }

    private static IReadOnlyList<SyntaxSpan> Highlight(
        SyntaxHighlighter? highlighter, string text, SyntaxState state)
        => highlighter is null ? [] : highlighter.Highlight(text, state);

    /// <summary>
    /// Reads the starting line numbers out of a hunk header such as
    /// <c>@@ -14,9 +14,18 @@ optional context</c>.
    /// </summary>
    private static bool TryParseHunkHeader(string header, out int oldStart, out int newStart)
    {
        oldStart = 0;
        newStart = 0;

        var minus = header.IndexOf('-');
        var plus = header.IndexOf('+');
        if (minus < 0 || plus < 0)
            return false;

        oldStart = ReadNumber(header, minus + 1);
        newStart = ReadNumber(header, plus + 1);
        return true;
    }

    private static int ReadNumber(string text, int start)
    {
        var end = start;
        while (end < text.Length && char.IsAsciiDigit(text[end]))
            end++;

        return end > start && int.TryParse(text[start..end], out var value) ? value : 0;
    }
}
