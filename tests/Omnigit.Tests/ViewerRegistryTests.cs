using System.Collections.ObjectModel;
using Avalonia.Controls;
using Omnigit.Plugins;
using Omnigit.Services;
using Omnigit.Services.Plugins;
using Omnigit.Views.Viewers;

namespace Omnigit.Tests;

/// <summary>
/// Which viewers a file is offered, in what order. The order is the default the pane
/// opens on, so getting it wrong means every PNG opening as a wall of "Binary files differ".
/// </summary>
public class ViewerRegistryTests
{
    private static ChangeViewerRegistry BuiltIns(IActivityLog? log = null)
        => new([new TextViewer(), new ImageViewer()], log);

    [Fact]
    public void An_image_offers_the_image_view_first_and_text_second()
    {
        var offered = BuiltIns().For(new ChangeInfo("art/logo.PNG", null, ChangeKind.Modified));

        Assert.Equal(["omnigit.image", TextViewer.ViewerId], offered.Select(v => v.Id));
    }

    [Fact]
    public void Source_code_offers_text_only()
    {
        var offered = BuiltIns().For(new ChangeInfo("src/Program.cs", null, ChangeKind.Modified));

        Assert.Equal([TextViewer.ViewerId], offered.Select(v => v.Id));
    }

    [Fact]
    public void A_file_with_no_extension_still_gets_the_text_view()
    {
        var offered = BuiltIns().For(new ChangeInfo("Makefile", null, ChangeKind.Added));

        Assert.Equal([TextViewer.ViewerId], offered.Select(v => v.Id));
    }

    [Fact]
    public void A_plugin_that_ties_with_a_built_in_comes_after_it()
    {
        var registry = BuiltIns();
        registry.Add([new Stub("x.also-text", score: 1)], "Stub plugin");

        var offered = registry.For(new ChangeInfo("notes.txt", null, ChangeKind.Modified));

        Assert.Equal([TextViewer.ViewerId, "x.also-text"], offered.Select(v => v.Id));
    }

    [Fact]
    public void A_plugin_that_scores_higher_goes_first()
    {
        var registry = BuiltIns();
        registry.Add([new Stub("x.better-images", score: 20)], "Stub plugin");

        var offered = registry.For(new ChangeInfo("a.png", null, ChangeKind.Modified));

        Assert.Equal("x.better-images", offered[0].Id);
    }

    [Fact]
    public void A_viewer_that_throws_while_matching_is_skipped_and_logged_once()
    {
        var log = new RecordingLog();
        var registry = BuiltIns(log);
        registry.Add([new Stub("x.broken", score: 0, throws: true)], "Broken plugin");

        var change = new ChangeInfo("a.png", null, ChangeKind.Modified);
        var first = registry.For(change);
        registry.For(change);

        Assert.DoesNotContain(first, v => v.Id == "x.broken");
        Assert.Contains(first, v => v.Id == TextViewer.ViewerId);

        var warning = Assert.Single(log.Written);
        Assert.Contains("Broken plugin", warning);
    }

    [Fact]
    public void A_plugin_cannot_take_an_id_already_in_use()
    {
        var registry = BuiltIns(new RecordingLog());
        registry.Add([new Stub("omnigit.image", score: 50)], "Impostor");

        var offered = registry.For(new ChangeInfo("a.png", null, ChangeKind.Modified));

        Assert.IsType<ImageViewer>(offered[0]);
    }

    private sealed class Stub(string id, int score, bool throws = false) : IChangeViewer
    {
        public string Id => id;
        public string Name => id;

        public int Match(ChangeInfo change)
            => throws ? throw new InvalidOperationException("boom") : score;

        public Control Create(ChangeContext context) => throw new NotSupportedException();
    }

    internal sealed class RecordingLog : IActivityLog
    {
        public List<string> Written { get; } = [];

        public ReadOnlyObservableCollection<ActivityEntry> Entries { get; } = new([]);

        public event EventHandler? ErrorLogged
        {
            add { }
            remove { }
        }

        public void Write(ActivityLevel level, string message, string? detail = null) => Written.Add(message);

        public void Clear() => Written.Clear();
    }
}
