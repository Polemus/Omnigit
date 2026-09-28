using Omnigit.Services;

namespace Omnigit.Tests;

public class TableDiffTests
{
    private static List<string[]> Csv(string text) => TableDiff.Parse(text, ',');

    [Fact]
    public void Quoted_fields_keep_their_commas_quotes_and_line_breaks()
    {
        var rows = Csv("name,note\r\n\"Smith, J\",\"said \"\"hi\"\"\nthen left\"\r\nplain,x");

        Assert.Equal(3, rows.Count);
        Assert.Equal(["Smith, J", "said \"hi\"\nthen left"], rows[1]);
        Assert.Equal(["plain", "x"], rows[2]);
    }

    [Fact]
    public void A_byte_order_mark_is_not_part_of_the_first_header()
        => Assert.Equal("id", Csv("﻿id,name\n1,a")[0][0]);

    [Theory]
    [InlineData("data.tsv", "a,b,c", '\t')]
    [InlineData("data.csv", "a;b;c,d", ';')]
    [InlineData("data.csv", "a,b,c", ',')]
    [InlineData("data.csv", "a\tb\tc", '\t')]
    public void The_delimiter_follows_the_extension_then_the_first_line(string path, string sample, char expected)
        => Assert.Equal(expected, TableDiff.DelimiterFor(path, sample));

    [Fact]
    public void One_changed_cell_is_one_modified_row_marking_that_cell()
    {
        var before = Csv("id,name,price\n1,apple,1.00\n2,pear,2.00\n");
        var after = Csv("id,name,price\n1,apple,1.20\n2,pear,2.00\n");

        var rows = TableDiff.Compare(before, after);
        var modified = Assert.Single(rows, r => r.Kind == TableRowKind.Modified);

        Assert.Equal([false, false, true], Enumerable.Range(0, 3).Select(modified.CellChanged));
        Assert.Equal("1.00", modified.OldCells![2]);
        Assert.Equal((2, 2), (modified.OldNumber, modified.NewNumber));
    }

    [Fact]
    public void An_inserted_row_is_added_and_the_rows_around_it_still_line_up()
    {
        var before = Csv("h\na\nb\nc\n");
        var after = Csv("h\na\nNEW\nb\nc\n");

        var rows = TableDiff.Compare(before, after);

        var added = Assert.Single(rows, r => r.Kind != TableRowKind.Same);
        Assert.Equal(TableRowKind.Added, added.Kind);
        Assert.Equal(3, added.NewNumber);
        Assert.Equal((3, 4), rows.Where(r => r.Cells[0] == "b").Select(r => (r.OldNumber, r.NewNumber)).Single());
    }

    [Fact]
    public void A_row_replaced_by_an_unrelated_one_is_removed_and_added_not_modified()
    {
        var before = Csv("id,name,city\n1,Ann,Oslo\n");
        var after = Csv("id,name,city\n9,Bob,Rome\n");

        var kinds = TableDiff.Compare(before, after).Select(r => r.Kind).ToList();

        Assert.Equal([TableRowKind.Same, TableRowKind.Removed, TableRowKind.Added], kinds);
    }

    [Fact]
    public void Long_unchanged_runs_fold_but_the_header_stays()
    {
        var lines = Enumerable.Range(1, 50).Select(i => $"{i},x").ToList();
        var before = Csv("id,v\n" + string.Join("\n", lines));
        lines[39] = "40,CHANGED";
        var after = Csv("id,v\n" + string.Join("\n", lines));

        var rows = TableDiff.Compare(before, after);

        Assert.Equal("id", rows[0].Cells[0]);
        Assert.Contains(rows, r => r.Kind == TableRowKind.Folded && r.Folded > 20);
        Assert.Single(rows, r => r.Kind == TableRowKind.Modified);
        Assert.True(rows.Count < 20);
    }

    [Fact]
    public void An_added_file_is_every_row_added()
    {
        var rows = TableDiff.Compare([], Csv("a,b\n1,2\n"));

        Assert.All(rows, r => Assert.Equal(TableRowKind.Added, r.Kind));
    }
}
