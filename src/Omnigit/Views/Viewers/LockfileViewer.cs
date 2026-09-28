using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Markup.Xaml.MarkupExtensions;
using Omnigit.Plugins;
using Omnigit.Services;

namespace Omnigit.Views.Viewers;

/// <summary>
/// A lockfile as the list of packages that moved, rather than the hundreds of lines of
/// hashes the move rewrote.
/// </summary>
public sealed class LockfileViewer : IChangeViewer
{
    public string Id => "omnigit.lockfile";

    public string Name => Strings.Get("Packages");

    public int Match(ChangeInfo change) => Lockfiles.IsLockfile(change.Path) ? 20 : 0;

    public Control Create(ChangeContext context) => new LockfileView(context);
}

/// <summary>Built in code: it is a list of rows whose shape depends on the data, and nothing else.</summary>
public sealed class LockfileView : UserControl
{
    private readonly StackPanel _body = new() { Spacing = 14, Margin = new Thickness(16, 12) };

    public LockfileView(ChangeContext context)
    {
        Content = new ScrollViewer
        {
            HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
            Content = _body,
        };

        _body.Children.Add(Muted(Strings.Get("Loading…")));
        _ = LoadAsync(context);
    }

    private async Task LoadAsync(ChangeContext context)
    {
        List<PackageChange>? changes;

        try
        {
            var before = await context.ReadOldAsync();
            var after = await context.ReadNewAsync();

            changes = await Task.Run(() => Lockfiles.Compare(context.Change.Path, Text(before), Text(after)));
        }
        catch (OperationCanceledException)
        {
            return;
        }
        catch (FileTooLargeException)
        {
            Show(Muted(Strings.Get("This lockfile is too large to read. Switch to Text to see the raw diff.")));
            return;
        }

        if (context.Closed.IsCancellationRequested)
            return;

        if (changes is null)
        {
            Show(Muted(Strings.Get("This lockfile couldn't be read. Switch to Text to see the raw diff.")));
            return;
        }

        if (changes.Count == 0)
        {
            Show(Muted(Strings.Get("No package changed version. The file changed in some other way - switch to Text to see how.")));
            return;
        }

        Render(changes);
    }

    private void Render(List<PackageChange> changes)
    {
        _body.Children.Clear();

        var updated = changes.FindAll(c => c.Kind == PackageChangeKind.Updated);
        var added = changes.FindAll(c => c.Kind == PackageChangeKind.Added);
        var removed = changes.FindAll(c => c.Kind == PackageChangeKind.Removed);

        var summary = new List<string>();
        if (updated.Count > 0)
            summary.Add(Strings.Plural("{0} updated", "{0} updated", updated.Count));
        if (added.Count > 0)
            summary.Add(Strings.Plural("{0} added", "{0} added", added.Count));
        if (removed.Count > 0)
            summary.Add(Strings.Plural("{0} removed", "{0} removed", removed.Count));

        var majors = updated.FindAll(c => c.IsMajor).Count;
        if (majors > 0)
            summary.Add(Strings.Plural("{0} major version change", "{0} major version changes", majors));

        _body.Children.Add(new TextBlock { Classes = { "h2" }, Text = string.Join(" · ", summary) });

        Section(Strings.Get("Updated"), updated, "StatusModified");
        Section(Strings.Get("Added"), added, "StatusAdded");
        Section(Strings.Get("Removed"), removed, "StatusDeleted");
    }

    private void Section(string title, List<PackageChange> rows, string colourKey)
    {
        if (rows.Count == 0)
            return;

        var list = new StackPanel { Spacing = 3 };
        list.Children.Add(new TextBlock { Classes = { "sectionLabel" }, Text = title.ToUpperInvariant(), Margin = new Thickness(0, 0, 0, 4) });

        foreach (var change in rows)
            list.Children.Add(Row(change, colourKey));

        _body.Children.Add(list);
    }

    private static Control Row(PackageChange change, string colourKey)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*"), ColumnSpacing = 10 };

        var marker = new TextBlock
        {
            Classes = { "mono" },
            FontWeight = Avalonia.Media.FontWeight.SemiBold,
            Text = change.Kind switch
            {
                PackageChangeKind.Added => "+",
                PackageChangeKind.Removed => "−",
                _ => "↑",
            },
            VerticalAlignment = VerticalAlignment.Top,
        };
        marker.Bind(TextBlock.ForegroundProperty, new DynamicResourceExtension(change.IsMajor ? "BannerWarningBorder" : colourKey));
        grid.Children.Add(marker);

        var text = new SelectableTextBlock { Classes = { "mono" }, TextWrapping = Avalonia.Media.TextWrapping.Wrap };
        text.Inlines = [];
        text.Inlines.Add(new Run(change.Name) { FontWeight = Avalonia.Media.FontWeight.SemiBold });

        var versions = change.Kind switch
        {
            PackageChangeKind.Added => change.After,
            PackageChangeKind.Removed => change.Before,
            _ => $"{change.Before}  →  {change.After}",
        };

        var detail = new Run("   " + versions);
        text.Inlines.Add(detail);
        detail.Bind(TextElement.ForegroundProperty, new DynamicResourceExtension(change.IsMajor ? "BannerWarningBorder" : "TextSecondary"));

        if (change.IsMajor)
            ToolTip.SetTip(grid, Strings.Get("A major version change - by semver's promise, one that may break things."));

        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        return grid;
    }

    private void Show(Control only)
    {
        _body.Children.Clear();
        _body.Children.Add(only);
    }

    private static TextBlock Muted(string text)
        => new() { Classes = { "muted" }, Text = text, TextWrapping = Avalonia.Media.TextWrapping.Wrap };

    private static string? Text(byte[]? bytes) => bytes is null ? null : Encoding.UTF8.GetString(bytes);
}
