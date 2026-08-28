using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// Colouring the diff. Most of what matters here is restraint and safety: which runs are
/// deliberately left plain, and that a span never points outside the line the view is
/// about to substring with it.
/// </summary>
public class SyntaxHighlightingTests
{
    private static IReadOnlyList<SyntaxSpan> Spans(string line, string path = "Foo.cs")
        => SyntaxHighlighter.For(path)!.Highlight(line, new SyntaxState());

    private static string Text(string line, SyntaxSpan span)
        => line.Substring(span.Start, span.Length);

    private static IEnumerable<string> TextsOf(string line, SyntaxCategory category)
        => Spans(line).Where(s => s.Category == category).Select(s => Text(line, s));

    [Theory]
    [InlineData("Foo.cs")]
    [InlineData("app.json")]
    [InlineData("script.py")]
    [InlineData("View.axaml")]
    [InlineData("readme.md")]
    [InlineData("run.sh")]
    public void ShipsAGrammarForTheLanguagesThisRepositoryIsWrittenIn(string path)
        => Assert.NotNull(SyntaxHighlighter.For(path));

    /// <summary>Not a failure - the diff renders as plain text, which is fine.</summary>
    [Theory]
    [InlineData("mystery.zzz")]
    [InlineData("LICENSE")]
    [InlineData(null)]
    public void HasNoGrammarForEverythingElse(string? path)
        => Assert.Null(SyntaxHighlighter.For(path));

    [Fact]
    public void ColoursTheThingsWorthPickingOut()
    {
        const string line = "    private int _count = 42;";

        Assert.Equal(["private", "int"], TextsOf(line, SyntaxCategory.Keyword));
        Assert.Equal(["42"], TextsOf(line, SyntaxCategory.Number));

        // The variable's own name is left alone: in a diff it is the thing being read,
        // not a thing to be picked out of what surrounds it.
        Assert.DoesNotContain("_count", TextsOf(line, SyntaxCategory.Type));
    }

    /// <summary>
    /// Operators and punctuation are keyword scopes in TextMate. Colouring them all
    /// turns a diff into confetti and competes with the green and red the row already
    /// carries, which is the thing actually being scanned for.
    /// </summary>
    [Fact]
    public void LeavesOperatorsAndPunctuationAlone()
    {
        const string line = "    var x = a + b;";

        Assert.DoesNotContain(Spans(line), s => Text(line, s) is "=" or "+" or ";");
    }

    /// <summary>
    /// The exception to that rule, and it has to be one: these carry
    /// punctuation.definition.* as their most specific scope, so demoting them leaves a
    /// grey comment whose marker is not grey.
    /// </summary>
    [Fact]
    public void KeepsTheMarkersThatOpenACommentOrAString()
    {
        const string comment = "x(); // why";
        Assert.Contains(Spans(comment), s => s.Category == SyntaxCategory.Comment && Text(comment, s) == "//");

        const string quoted = "var s = \"hi\";";
        Assert.Contains(Spans(quoted), s => s.Category == SyntaxCategory.String && Text(quoted, s) == "\"");
    }

    // ---- State across lines -------------------------------------------------

    private const string BlockCommentPatch = """
        @@ -1,4 +1,4 @@
         /* opening
            still inside
            closing */
         var after = 1;
        """;

    [Fact]
    public void CarriesABlockCommentOntoTheLinesBelowIt()
    {
        var lines = UnifiedDiffParser.Parse(BlockCommentPatch, "Foo.cs");

        var inside = lines.Single(l => l.Text.Contains("still inside"));
        Assert.All(inside.Spans, s => Assert.Equal(SyntaxCategory.Comment, s.Category));

        // And stops carrying it once the comment closes.
        var after = lines.Single(l => l.Text.Contains("var after"));
        Assert.Contains(after.Spans, s => s.Category == SyntaxCategory.Keyword);
    }

    /// <summary>
    /// A removed line and the added line under it are two versions of one place in the
    /// file, not consecutive lines of one. Sharing a tokeniser lets the old side's
    /// unclosed string swallow the new side.
    /// </summary>
    [Fact]
    public void KeepsTheTwoSidesOfAHunkOutOfEachOthersWay()
    {
        const string patch = """
            @@ -1,2 +1,2 @@
            -var s = "unterminated
            +var t = 1;
            """;

        var added = UnifiedDiffParser.Parse(patch, "Foo.cs").Single(l => l.IsAdded);

        // Coloured as the code it is, not as the continuation of the removed string.
        Assert.Contains(added.Spans, s => s.Category == SyntaxCategory.Keyword);
        Assert.DoesNotContain(added.Spans, s => s.Category == SyntaxCategory.String);
    }

    [Fact]
    public void StartsAgainAtEachHunk()
    {
        const string patch = """
            @@ -1,1 +1,1 @@
             /* opened and never closed
            @@ -9,1 +9,1 @@
             var fresh = 1;
            """;

        var fresh = UnifiedDiffParser.Parse(patch, "Foo.cs").Single(l => l.Text.Contains("fresh"));

        Assert.Contains(fresh.Spans, s => s.Category == SyntaxCategory.Keyword);
    }

    // ---- Safety -------------------------------------------------------------

    /// <summary>
    /// The view substrings each line with these. A span reaching past the end would be
    /// an exception while rendering someone's diff, so the bound is asserted rather than
    /// assumed - grammars are third-party data and byte offsets are theirs, not ours.
    /// </summary>
    [Fact]
    public void NeverPointsOutsideTheLine()
    {
        string[] awkward =
        [
            "",
            "   ",
            "var s = \"a\\\"b\";",
            "// ünïcödé and emoji 🎉 in a comment",
            new string('x', 5000),
        ];

        foreach (var line in awkward)
        {
            foreach (var span in Spans(line))
            {
                Assert.InRange(span.Start, 0, line.Length);
                Assert.InRange(span.Start + span.Length, 0, line.Length);
            }
        }
    }

    [Fact]
    public void LeavesAFileItHasNoGrammarForEntirelyPlain()
    {
        var lines = UnifiedDiffParser.Parse("""
            @@ -1,1 +1,1 @@
            +anything at all
            """, "notes.zzz");

        Assert.All(lines, l => Assert.Empty(l.Spans));
    }

    /// <summary>Parsing without a path is still valid, and still parses.</summary>
    [Fact]
    public void StillParsesAPatchWithNoPathGiven()
    {
        var lines = UnifiedDiffParser.Parse("""
            @@ -1,1 +1,1 @@
            +var x = 1;
            """);

        Assert.Contains(lines, l => l.IsAdded && l.Text == "var x = 1;");
        Assert.All(lines, l => Assert.Empty(l.Spans));
    }
}
