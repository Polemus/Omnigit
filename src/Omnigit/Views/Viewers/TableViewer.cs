using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Markup.Xaml.MarkupExtensions;
using Avalonia.Media;
using Omnigit.Plugins;
using Omnigit.Services;

namespace Omnigit.Views.Viewers;

/// <summary>CSV and TSV as a grid, with the changed cells marked.</summary>
public sealed class TableViewer : IChangeViewer
{
    public string Id => "omnigit.table";

    public string Name => Strings.Get("Table");

    public int Match(ChangeInfo change) => change.Extension is "csv" or "tsv" or "tab" ? 10 : 0;

    public Control Create(ChangeContext context) => new TableView(context);
}

/// <summary>
/// One Grid, built in code: the columns come from the data, and a cell has to know both
/// its row's kind and whether it alone changed, which is simpler to say here than to bind.
/// </summary>
public sealed class TableView : UserControl
{
    /// <summary>
    /// Visual rows, not table rows. Every one is a row of controls, and a comparison past
    /// this is not being read cell by cell anyway.
    /// </summary>
    private const int MaxVisualRows = 3000;

    private const double MaxCellWidth = 320;

    public TableView(ChangeContext context)
    {
        Content = Note(Strings.Get("Loading…"));
        _ = LoadAsync(context);
    }

    private async Task LoadAsync(ChangeContext context)
    {
        List<TableRow> rows;

        try
        {
            var before = Text(await context.ReadOldAsync());
            var after = Text(await context.ReadNewAsync());

            rows = await Task.Run(() =>
            {
                var delimiter = TableDiff.DelimiterFor(context.Change.Path, after ?? before);
                return TableDiff.Compare(
                    before is null ? [] : TableDiff.Parse(before, delimiter),
                    after is null ? [] : TableDiff.Parse(after, delimiter));
            }, context.Closed);
        }
        catch (OperationCanceledException)
        {
            return;
        }
        catch (FileTooLargeException)
        {
            Content = Note(Strings.Get("This file is too large to show as a table. Switch to Text to see the diff."));
            return;
        }

        if (context.Closed.IsCancellationRequested)
            return;

        if (rows.All(r => r.Kind is TableRowKind.Same or TableRowKind.Folded))
        {
            Content = Note(Strings.Get("No cell changed. The file changed in some other way - switch to Text to see how."));
            return;
        }

        Content = new ScrollViewer
        {
            HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto,
            Content = Build(rows),
        };
    }

    private static Control Build(List<TableRow> rows)
    {
        var columns = rows.Max(r => Math.Max(r.Cells.Count, r.OldCells?.Count ?? 0));
        var grid = new Grid { Margin = new Thickness(0, 0, 0, 8) };

        // Old number, new number, then the data.
        grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));
        grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));
        for (var c = 0; c < columns; c++)
            grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));

        var visual = 0;

        foreach (var row in rows)
        {
            if (visual >= MaxVisualRows)
            {
                AddSpanning(grid, visual++, columns,
                    Strings.Format("Showing the first {0} rows of the comparison.", MaxVisualRows));
                break;
            }

            switch (row.Kind)
            {
                case TableRowKind.Folded:
                    AddSpanning(grid, visual++, columns,
                        Strings.Plural("⋯ {0} unchanged row", "⋯ {0} unchanged rows", row.Folded));
                    break;

                case TableRowKind.Modified:
                    AddRow(grid, visual++, columns, row.OldCells!, row.OldNumber, 0, "DiffRemoveBackground", "DiffRemoveEmphasis", row);
                    AddRow(grid, visual++, columns, row.Cells, 0, row.NewNumber, "DiffAddBackground", "DiffAddEmphasis", row);
                    break;

                case TableRowKind.Added:
                    AddRow(grid, visual++, columns, row.Cells, 0, row.NewNumber, "DiffAddBackground", null, row);
                    break;

                case TableRowKind.Removed:
                    AddRow(grid, visual++, columns, row.Cells, row.OldNumber, 0, "DiffRemoveBackground", null, row);
                    break;

                default:
                    AddRow(grid, visual++, columns, row.Cells, row.OldNumber, row.NewNumber, null, null, row,
                        header: row.OldNumber == 1 && row.NewNumber == 1);
                    break;
            }
        }

        return grid;
    }

    private static void AddRow(
        Grid grid, int at, int columns, IReadOnlyList<string> cells, int oldNumber, int newNumber,
        string? rowBackground, string? changedBackground, TableRow row, bool header = false)
    {
        grid.RowDefinitions.Add(new RowDefinition(GridLength.Auto));

        Place(grid, at, 0, Number(oldNumber), rowBackground, gutter: true);
        Place(grid, at, 1, Number(newNumber), rowBackground, gutter: true);

        for (var c = 0; c < columns; c++)
        {
            var value = c < cells.Count ? cells[c] : string.Empty;
            var text = new TextBlock
            {
                Text = value,
                MaxWidth = MaxCellWidth,
                TextTrimming = TextTrimming.CharacterEllipsis,
                FontWeight = header ? FontWeight.SemiBold : FontWeight.Normal,
            };
            text.Classes.Add("mono");

            // Trimmed text is only useful if the rest of it is one hover away.
            if (value.Length > 40)
                ToolTip.SetTip(text, value);

            var background = changedBackground is not null && row.CellChanged(c) ? changedBackground : rowBackground;
            Place(grid, at, c + 2, text, background);
        }
    }

    private static void Place(Grid grid, int row, int column, Control content, string? backgroundKey, bool gutter = false)
    {
        var cell = new Border
        {
            Padding = gutter ? new Thickness(8, 3) : new Thickness(10, 3),
            BorderThickness = new Thickness(0, 0, 1, 1),
            Child = content,
        };
        cell.Bind(Border.BorderBrushProperty, new DynamicResourceExtension("BorderSubtle"));

        if (backgroundKey is not null)
            cell.Bind(Border.BackgroundProperty, new DynamicResourceExtension(backgroundKey));

        Grid.SetRow(cell, row);
        Grid.SetColumn(cell, column);
        grid.Children.Add(cell);
    }

    private static void AddSpanning(Grid grid, int at, int columns, string text)
    {
        grid.RowDefinitions.Add(new RowDefinition(GridLength.Auto));

        var label = new TextBlock { Text = text, Classes = { "diffText", "hunk" }, Padding = new Thickness(9, 3) };
        var cell = new Border { Child = label };
        cell.Bind(Border.BackgroundProperty, new DynamicResourceExtension("DiffHunkBackground"));

        Grid.SetRow(cell, at);
        Grid.SetColumnSpan(cell, columns + 2);
        grid.Children.Add(cell);
    }

    private static TextBlock Number(int number)
    {
        var text = new TextBlock { Text = number > 0 ? number.ToString() : string.Empty };
        text.Classes.Add("diffNumber");
        return text;
    }

    private static TextBlock Note(string text) => new()
    {
        Classes = { "muted" },
        Text = text,
        TextWrapping = TextWrapping.Wrap,
        Margin = new Thickness(16),
        HorizontalAlignment = HorizontalAlignment.Left,
    };

    private static string? Text(byte[]? bytes) => bytes is null ? null : Encoding.UTF8.GetString(bytes);
}
