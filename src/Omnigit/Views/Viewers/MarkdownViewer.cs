using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Markup.Xaml.MarkupExtensions;
using Avalonia.Media;
using Markdig.Extensions.Tables;
using Markdig.Extensions.TaskLists;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using Omnigit.Plugins;
using Omnigit.Services;
using MdTable = Markdig.Extensions.Tables.Table;
using MdTableRow = Markdig.Extensions.Tables.TableRow;

namespace Omnigit.Views.Viewers;

/// <summary>A Markdown file rendered, with the blocks that changed marked in the margin.</summary>
public sealed class MarkdownViewer : IChangeViewer
{
    public string Id => "omnigit.markdown";

    public string Name => Strings.Get("Rendered");

    public int Match(ChangeInfo change) => change.Extension is "md" or "markdown" or "mdown" or "mkd" ? 10 : 0;

    public Control Create(ChangeContext context) => new MarkdownView(context);
}

/// <summary>
/// Draws Markdig's syntax tree as Avalonia controls.
/// </summary>
/// <remarks>
/// <para>
/// Ours rather than a Markdown control package, for two reasons. The control has to
/// wrap each top-level block in a change marker, which a finished renderer does not let
/// you reach into. And nothing in a rendered file from a repository may reach outside
/// it - the same rule the SVG viewer enforces - so an image is shown as its alt text and
/// never fetched, and a link is shown and never followed. A renderer written here cannot
/// do either by accident.
/// </para>
/// <para>
/// It covers what READMEs and docs actually use: headings, paragraphs, emphasis, code,
/// lists and task lists, quotes, rules, pipe tables and front matter. Raw HTML is shown as
/// source, since rendering it would be a browser's job.
/// </para>
/// </remarks>
public sealed class MarkdownView : UserControl
{
    private static readonly double[] HeadingSizes = [24, 20, 17, 15, 14, 13];

    public MarkdownView(ChangeContext context)
    {
        Content = Note(Strings.Get("Loading…"));
        _ = LoadAsync(context);
    }

    private async Task LoadAsync(ChangeContext context)
    {
        List<MarkdownBlockDiff> blocks;

        try
        {
            var before = Text(await context.ReadOldAsync());
            var after = Text(await context.ReadNewAsync());
            blocks = await Task.Run(() => MarkdownDiff.Compare(before, after), context.Closed);
        }
        catch (OperationCanceledException)
        {
            return;
        }
        catch (FileTooLargeException)
        {
            Content = Note(Strings.Get("This file is too large to render. Switch to Text to see the diff."));
            return;
        }

        if (context.Closed.IsCancellationRequested)
            return;

        var page = new StackPanel { Spacing = 10, Margin = new Thickness(0, 14, 24, 24), MaxWidth = 900, HorizontalAlignment = HorizontalAlignment.Left };

        foreach (var block in blocks)
            page.Children.Add(Marked(Render(block.Block), block.Change));

        if (page.Children.Count == 0)
            page.Children.Add(Note(Strings.Get("This document is empty.")));

        Content = new ScrollViewer
        {
            HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
            Content = page,
        };
    }

    /// <summary>A bar in the left margin, green for added and red for removed; a removed block is also dimmed.</summary>
    private static Control Marked(Control content, BlockChange change)
    {
        var bar = new Border { Width = 3, CornerRadius = new CornerRadius(1.5), Margin = new Thickness(0, 0, 13, 0) };

        switch (change)
        {
            case BlockChange.Added:
                bar.Bind(Border.BackgroundProperty, new DynamicResourceExtension("StatusAdded"));
                ToolTip.SetTip(bar, Strings.Get("Added"));
                break;
            case BlockChange.Removed:
                bar.Bind(Border.BackgroundProperty, new DynamicResourceExtension("StatusDeleted"));
                ToolTip.SetTip(bar, Strings.Get("Removed"));
                content.Opacity = 0.55;
                break;
        }

        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("16,*"), Margin = new Thickness(0) };
        bar.HorizontalAlignment = HorizontalAlignment.Right;
        row.Children.Add(bar);
        Grid.SetColumn(content, 1);
        row.Children.Add(content);
        return row;
    }

    // ---- Blocks -------------------------------------------------------------

    private static Control Render(Block block) => block switch
    {
        HeadingBlock heading => Heading(heading),
        ParagraphBlock paragraph => Paragraph(paragraph.Inline),
        ListBlock list => List(list),
        QuoteBlock quote => Quote(quote),
        MdTable table => Table(table),
        ThematicBreakBlock => Rule(),
        HtmlBlock html => Code(html.Lines.ToString(), muted: true),
        CodeBlock code => Code(code.Lines.ToString()),
        ContainerBlock container => Stack(container),
        _ => Note(block.GetType().Name),
    };

    private static Control Heading(HeadingBlock heading)
    {
        var text = Paragraph(heading.Inline);
        text.FontSize = HeadingSizes[Math.Clamp(heading.Level, 1, 6) - 1];
        text.FontWeight = FontWeight.SemiBold;
        text.Margin = new Thickness(0, heading.Level <= 2 ? 8 : 4, 0, 0);
        return text;
    }

    private static SelectableTextBlock Paragraph(ContainerInline? inline)
    {
        var text = new SelectableTextBlock { TextWrapping = TextWrapping.Wrap, LineHeight = 21 };
        text.Inlines = [];

        if (inline is not null)
            AddInlines(text.Inlines, inline, new Style());

        return text;
    }

    private static Control List(ListBlock list)
    {
        var items = new StackPanel { Spacing = 4 };
        var number = int.TryParse(list.OrderedStart, out var start) ? start : 1;

        foreach (var item in list.OfType<ListItemBlock>())
        {
            var marker = list.IsOrdered ? $"{number++}." : "•";

            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("22,*") };
            var bullet = new TextBlock { Text = marker, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 0, 8, 0) };
            bullet.Bind(TextBlock.ForegroundProperty, new DynamicResourceExtension("TextSecondary"));
            row.Children.Add(bullet);

            var body = Stack(item);
            Grid.SetColumn(body, 1);
            row.Children.Add(body);
            items.Children.Add(row);
        }

        return items;
    }

    private static Control Quote(QuoteBlock quote)
    {
        var border = new Border
        {
            BorderThickness = new Thickness(3, 0, 0, 0),
            Padding = new Thickness(12, 2, 0, 2),
            Child = Stack(quote),
        };
        border.Bind(Border.BorderBrushProperty, new DynamicResourceExtension("BorderStrong"));
        border.Child.Bind(TextElement.ForegroundProperty, new DynamicResourceExtension("TextSecondary"));
        return border;
    }

    private static Control Table(MdTable table)
    {
        var grid = new Grid();
        var columns = table.OfType<MdTableRow>().Select(r => r.Count).DefaultIfEmpty(0).Max();
        for (var c = 0; c < columns; c++)
            grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));

        var r = 0;
        foreach (var row in table.OfType<MdTableRow>())
        {
            grid.RowDefinitions.Add(new RowDefinition(GridLength.Auto));

            var c = 0;
            foreach (var cell in row.OfType<TableCell>())
            {
                var content = Stack(cell);
                if (row.IsHeader)
                    content.SetValue(TextElement.FontWeightProperty, FontWeight.SemiBold);

                var border = new Border
                {
                    BorderThickness = new Thickness(0, 0, 1, 1),
                    Padding = new Thickness(10, 5),
                    Child = content,
                };
                border.Bind(Border.BorderBrushProperty, new DynamicResourceExtension("BorderSubtle"));
                if (row.IsHeader)
                    border.Bind(Border.BackgroundProperty, new DynamicResourceExtension("ElevatedBackground"));

                Grid.SetRow(border, r);
                Grid.SetColumn(border, c++);
                grid.Children.Add(border);
            }

            r++;
        }

        var frame = new Border { BorderThickness = new Thickness(1, 1, 0, 0), Child = grid, HorizontalAlignment = HorizontalAlignment.Left };
        frame.Bind(Border.BorderBrushProperty, new DynamicResourceExtension("BorderSubtle"));
        return frame;
    }

    private static Control Rule()
    {
        var line = new Border { Height = 1, Margin = new Thickness(0, 6) };
        line.Bind(Border.BackgroundProperty, new DynamicResourceExtension("BorderSubtle"));
        return line;
    }

    private static Control Code(string text, bool muted = false)
    {
        var code = new SelectableTextBlock { Text = text.TrimEnd('\n', '\r'), Classes = { "mono" } };
        if (muted)
            code.Bind(TextBlock.ForegroundProperty, new DynamicResourceExtension("TextSecondary"));

        var border = new Border
        {
            CornerRadius = new CornerRadius(6),
            Padding = new Thickness(12, 9),
            Child = new ScrollViewer
            {
                HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto,
                VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
                Content = code,
            },
        };
        border.Bind(Border.BackgroundProperty, new DynamicResourceExtension("ElevatedBackground"));
        return border;
    }

    private static StackPanel Stack(ContainerBlock container)
    {
        var stack = new StackPanel { Spacing = 8 };
        foreach (var child in container)
            stack.Children.Add(Render(child));
        return stack;
    }

    // ---- Inlines ------------------------------------------------------------

    private readonly record struct Style(bool Bold = false, bool Italic = false, bool Strike = false, bool Link = false);

    private static void AddInlines(InlineCollection target, ContainerInline container, Style style)
    {
        foreach (var inline in container)
        {
            switch (inline)
            {
                case LiteralInline literal:
                    Add(target, literal.Content.ToString(), style);
                    break;

                case EmphasisInline emphasis:
                    var inner = emphasis.DelimiterChar == '~'
                        ? style with { Strike = true }
                        : emphasis.DelimiterCount >= 2 ? style with { Bold = true } : style with { Italic = true };
                    AddInlines(target, emphasis, inner);
                    break;

                case CodeInline code:
                    var run = new Run(code.Content) { FontFamily = MonoFont() };
                    target.Add(run);
                    run.Bind(TextElement.BackgroundProperty, new DynamicResourceExtension("ElevatedBackground"));
                    break;

                case LinkInline { IsImage: true } image:
                    // Shown, never loaded: see the class remarks.
                    var alt = PlainText(image);
                    Add(target, $"[{Strings.Get("image")}: {(alt.Length > 0 ? alt : image.Url)}]", style with { Italic = true });
                    break;

                case LinkInline link:
                    AddInlines(target, link, style with { Link = true });
                    break;

                case AutolinkInline autolink:
                    Add(target, autolink.Url, style with { Link = true });
                    break;

                case LineBreakInline lineBreak:
                    target.Add(lineBreak.IsHard ? new LineBreak() : new Run(" "));
                    break;

                case HtmlEntityInline entity:
                    Add(target, entity.Transcoded.ToString(), style);
                    break;

                case HtmlInline html:
                    Add(target, html.Tag, style);
                    break;

                case TaskList task:
                    Add(target, task.Checked ? "☑ " : "☐ ", style);
                    break;

                case ContainerInline nested:
                    AddInlines(target, nested, style);
                    break;
            }
        }
    }

    private static void Add(InlineCollection target, string text, Style style)
    {
        var run = new Run(text)
        {
            FontWeight = style.Bold ? FontWeight.SemiBold : FontWeight.Normal,
            FontStyle = style.Italic ? FontStyle.Italic : FontStyle.Normal,
        };

        if (style.Strike || style.Link)
            run.TextDecorations = style.Strike ? TextDecorations.Strikethrough : TextDecorations.Underline;

        target.Add(run);

        if (style.Link)
            run.Bind(TextElement.ForegroundProperty, new DynamicResourceExtension("AccentBrush"));
    }

    private static string PlainText(ContainerInline container)
    {
        var text = new StringBuilder();
        foreach (var inline in container.Descendants<LiteralInline>())
            text.Append(inline.Content.ToString());
        return text.ToString();
    }

    private static FontFamily MonoFont()
        => Application.Current?.TryFindResource("MonoFont", out var value) == true && value is FontFamily font
            ? font
            : FontFamily.Default;

    private static TextBlock Note(string text) => new()
    {
        Classes = { "muted" },
        Text = text,
        TextWrapping = TextWrapping.Wrap,
        Margin = new Thickness(16),
    };

    private static string? Text(byte[]? bytes) => bytes is null ? null : Encoding.UTF8.GetString(bytes);
}
