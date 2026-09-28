using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// Which words a changed line marks. The failure worth guarding is not a crash but noise:
/// highlighting that covers most of a line is harder to read than none.
/// </summary>
public class WordDiffTests
{
    private static string Marked(string text, IReadOnlyList<TextRange> ranges)
        => string.Join("|", ranges.Select(r => text.Substring(r.Start, r.Length)));

    [Fact]
    public void A_changed_number_marks_the_number_and_nothing_else()
    {
        var result = WordDiff.Compare("var count = 1;", "var count = 2;");

        Assert.NotNull(result);
        Assert.Equal("1", Marked("var count = 1;", result.Value.Old));
        Assert.Equal("2", Marked("var count = 2;", result.Value.New));
    }

    [Fact]
    public void Punctuation_is_its_own_token_so_an_argument_is_marked_not_the_call()
    {
        var result = WordDiff.Compare("Draw(width, height);", "Draw(width, depth);");

        Assert.Equal("height", Marked("Draw(width, height);", result!.Value.Old));
        Assert.Equal("depth", Marked("Draw(width, depth);", result.Value.New));
    }

    [Fact]
    public void Adjacent_changed_words_are_one_phrase_not_words_with_gaps()
    {
        const string before = "the old words stay here";
        const string after = "the new text stay here";

        var result = WordDiff.Compare(before, after);

        Assert.Equal("old words", Marked(before, result!.Value.Old));
        Assert.Equal("new text", Marked(after, result.Value.New));
    }

    [Fact]
    public void A_pure_insertion_marks_only_the_new_side()
    {
        const string before = "call(a, b)";
        const string after = "call(a, extra, b)";

        var result = WordDiff.Compare(before, after);

        Assert.Empty(result!.Value.Old);
        Assert.Equal("extra, ", Marked(after, result.Value.New));
    }

    [Fact]
    public void A_line_rewritten_from_scratch_gets_no_emphasis()
        => Assert.Null(WordDiff.Compare("return total / count;", "throw new NotSupportedException();"));

    [Fact]
    public void Sharing_only_whitespace_does_not_count_as_similar()
        => Assert.Null(WordDiff.Compare("    alpha beta", "    gamma delta"));

    [Fact]
    public void Removed_and_added_lines_are_paired_by_position_and_leftovers_are_left_alone()
    {
        var lines = new List<DiffLine>
        {
            Line(DiffLineKind.Context, "unchanged"),
            Line(DiffLineKind.Removed, "int a = 1;"),
            Line(DiffLineKind.Removed, "int b = 2;"),
            Line(DiffLineKind.Added, "int a = 10;"),
            Line(DiffLineKind.Added, "int b = 20;"),
            Line(DiffLineKind.Added, "int c = 30;"),
        };

        WordDiff.Apply(lines);

        Assert.Empty(lines[0].Emphasis);
        Assert.Equal("1", Marked(lines[1].Text, lines[1].Emphasis));
        Assert.Equal("10", Marked(lines[3].Text, lines[3].Emphasis));
        Assert.Equal("2", Marked(lines[2].Text, lines[2].Emphasis));
        Assert.Equal("20", Marked(lines[4].Text, lines[4].Emphasis));
        Assert.Empty(lines[5].Emphasis);
    }

    [Fact]
    public void The_parser_applies_it_to_a_real_patch()
    {
        const string patch = """
            @@ -1,2 +1,2 @@
             keep
            -colour = "red"
            +colour = "blue"
            """;

        var lines = UnifiedDiffParser.Parse(patch);
        var added = lines.Single(l => l.IsAdded);

        Assert.Equal("blue", Marked(added.Text, added.Emphasis));
    }

    [Fact]
    public void Side_by_side_pairs_the_same_lines_and_pads_the_shorter_side()
    {
        var lines = new List<DiffLine>
        {
            Line(DiffLineKind.HunkHeader, "@@ -1,3 +1,2 @@"),
            Line(DiffLineKind.Context, "same"),
            Line(DiffLineKind.Removed, "one"),
            Line(DiffLineKind.Removed, "two"),
            Line(DiffLineKind.Added, "uno"),
            Line(DiffLineKind.Context, "end"),
        };

        var rows = SideBySide.Rows(lines);

        Assert.Equal(5, rows.Count);
        Assert.True(rows[0].IsHunk);
        Assert.Same(rows[1].Left, rows[1].Right);
        Assert.Equal(("one", "uno"), (rows[2].Left!.Text, rows[2].Right!.Text));
        Assert.Equal("two", rows[3].Left!.Text);
        Assert.True(rows[3].RightIsEmpty);
        Assert.Equal("end", rows[4].Right!.Text);
    }

    private static DiffLine Line(DiffLineKind kind, string text) => new() { Kind = kind, Text = text };
}
