using Markdig.Syntax;
using Omnigit.Services;

namespace Omnigit.Tests;

public class MarkdownDiffTests
{
    private static List<(string Kind, BlockChange Change)> Shape(List<MarkdownBlockDiff> blocks)
        => blocks.Select(b => (b.Block.GetType().Name, b.Change)).ToList();

    [Fact]
    public void An_edited_paragraph_is_the_old_one_removed_then_the_new_one_added_in_place()
    {
        const string before = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n";
        const string after = "# Title\n\nFirst paragraph, edited.\n\nSecond paragraph.\n";

        var blocks = MarkdownDiff.Compare(before, after);

        Assert.Equal(
        [
            ("HeadingBlock", BlockChange.Same),
            ("ParagraphBlock", BlockChange.Removed),
            ("ParagraphBlock", BlockChange.Added),
            ("ParagraphBlock", BlockChange.Same),
        ], Shape(blocks));
    }

    [Fact]
    public void A_list_is_one_block_so_a_changed_item_marks_the_list()
    {
        var blocks = MarkdownDiff.Compare("- one\n- two\n", "- one\n- 2\n");

        Assert.Equal([BlockChange.Removed, BlockChange.Added], blocks.Select(b => b.Change));
        Assert.All(blocks, b => Assert.IsType<ListBlock>(b.Block));
    }

    [Fact]
    public void Trailing_whitespace_alone_is_not_a_change()
    {
        var blocks = MarkdownDiff.Compare("Some text.   \n", "Some text.\n");

        Assert.Equal(BlockChange.Same, Assert.Single(blocks).Change);
    }

    [Fact]
    public void An_added_file_is_every_block_added_and_a_deleted_one_every_block_removed()
    {
        Assert.All(MarkdownDiff.Compare(null, "# A\n\ntext\n"), b => Assert.Equal(BlockChange.Added, b.Change));
        Assert.All(MarkdownDiff.Compare("# A\n\ntext\n", null), b => Assert.Equal(BlockChange.Removed, b.Change));
    }

    [Fact]
    public void Tables_and_front_matter_parse_as_their_own_blocks()
    {
        var blocks = MarkdownDiff.Compare(null, "---\ntitle: x\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");

        Assert.Contains(blocks, b => b.Block is Markdig.Extensions.Yaml.YamlFrontMatterBlock);
        Assert.Contains(blocks, b => b.Block is Markdig.Extensions.Tables.Table);
    }
}
