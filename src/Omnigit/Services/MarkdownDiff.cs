using System;
using System.Collections.Generic;
using Markdig;
using Markdig.Syntax;

namespace Omnigit.Services;

public enum BlockChange
{
    Same,
    Added,
    Removed,
}

/// <summary>One top-level block of a Markdown document - a heading, a paragraph, a list - and what happened to it.</summary>
public sealed record MarkdownBlockDiff(Block Block, BlockChange Change);

/// <summary>
/// Compares two versions of a Markdown document block by block, so the rendered page
/// can mark what changed.
/// </summary>
/// <remarks>
/// <para>
/// The unit is the top-level block because that is the unit a reader sees: a paragraph
/// with one word changed is a changed paragraph. Finer than that means marking inside
/// rendered text whose layout no longer matches the source, and coarser means marking a
/// whole list for one item.
/// </para>
/// <para>
/// Blocks are compared by their source text with trailing whitespace ignored, so a
/// paragraph that only re-wrapped still shows as changed - it is, in the file - but one
/// that only lost a trailing space does not.
/// </para>
/// </remarks>
public static class MarkdownDiff
{
    /// <summary>Beyond this many block pairs the documents are shown as replaced, not aligned.</summary>
    private const long MaxAlignment = 4_000_000;

    public static MarkdownPipeline Pipeline { get; } = new MarkdownPipelineBuilder()
        .UsePipeTables()
        .UseTaskLists()
        .UseEmphasisExtras()
        .UseAutoLinks()
        .UseYamlFrontMatter()
        .Build();

    public static MarkdownDocument Parse(string? text) => Markdown.Parse(text ?? string.Empty, Pipeline);

    /// <summary>The new document's blocks in order, with the removed ones where they used to be.</summary>
    public static List<MarkdownBlockDiff> Compare(string? before, string? after)
    {
        var oldText = before ?? string.Empty;
        var newText = after ?? string.Empty;
        var oldBlocks = Blocks(Parse(before));
        var newBlocks = Blocks(Parse(after));

        var a = oldBlocks.ConvertAll(b => Source(oldText, b));
        var b = newBlocks.ConvertAll(b => Source(newText, b));

        var result = new List<MarkdownBlockDiff>();
        var n = a.Count;
        var m = b.Count;

        if ((long)n * m > MaxAlignment)
        {
            result.AddRange(oldBlocks.ConvertAll(x => new MarkdownBlockDiff(x, BlockChange.Removed)));
            result.AddRange(newBlocks.ConvertAll(x => new MarkdownBlockDiff(x, BlockChange.Added)));
            return result;
        }

        var table = new int[n + 1, m + 1];
        for (var i = n - 1; i >= 0; i--)
        for (var j = m - 1; j >= 0; j--)
        {
            table[i, j] = a[i] == b[j]
                ? table[i + 1, j + 1] + 1
                : Math.Max(table[i + 1, j], table[i, j + 1]);
        }

        int x = 0, y = 0;
        while (x < n || y < m)
        {
            if (x < n && y < m && a[x] == b[y])
            {
                result.Add(new MarkdownBlockDiff(newBlocks[y], BlockChange.Same));
                x++;
                y++;
            }
            // Removals first where either would do, so a replaced paragraph reads as the
            // old version followed by the new - "this became that".
            else if (x < n && (y == m || table[x + 1, y] >= table[x, y + 1]))
            {
                result.Add(new MarkdownBlockDiff(oldBlocks[x], BlockChange.Removed));
                x++;
            }
            else
            {
                result.Add(new MarkdownBlockDiff(newBlocks[y], BlockChange.Added));
                y++;
            }
        }

        return result;
    }

    private static List<Block> Blocks(MarkdownDocument document)
    {
        var blocks = new List<Block>(document.Count);
        foreach (var block in document)
        {
            // Link reference definitions render as nothing, and a changed one would show
            // as a bar beside an empty space.
            if (block is not LinkReferenceDefinitionGroup)
                blocks.Add(block);
        }

        return blocks;
    }

    private static string Source(string text, Block block)
    {
        var start = Math.Clamp(block.Span.Start, 0, text.Length);
        var end = Math.Clamp(block.Span.End + 1, start, text.Length);
        return text[start..end].TrimEnd();
    }
}
