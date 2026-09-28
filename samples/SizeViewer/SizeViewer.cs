using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Threading;
using Omnigit.Plugins;

namespace SizeViewer;

/// <summary>
/// Says how big the file was and is. Not useful in itself - it is here to show every
/// part of a viewer in as few lines as possible: matching, reading both sides off the
/// UI thread, and stopping when the user moves on.
/// </summary>
public sealed class SizeViewer : IChangeViewer
{
    public string Id => "omnigit.sample.sizes";

    public string Name => "Sizes";

    // Any file at all. Scored 1, like Omnigit's own text view, and a tie goes to
    // whoever registered first - so this never displaces the text view by default.
    public int Match(ChangeInfo change) => 1;

    public Control Create(ChangeContext context)
    {
        var text = new TextBlock
        {
            Text = "Reading…",
            Margin = new Avalonia.Thickness(13),
            HorizontalAlignment = HorizontalAlignment.Left,
        };

        // Return the control straight away and fill it in later: Create runs on the
        // UI thread, and a slow read here would freeze the window.
        _ = FillAsync(text, context);
        return text;
    }

    private static async Task FillAsync(TextBlock text, ChangeContext context)
    {
        string summary;

        try
        {
            var before = await context.ReadOldAsync();
            var after = await context.ReadNewAsync();
            summary = $"{Describe(before)}  →  {Describe(after)}";
        }
        catch (OperationCanceledException)
        {
            return; // The user moved to another file; this control is being thrown away.
        }
        catch (FileTooLargeException ex)
        {
            summary = $"Over {ex.Limit:N0} bytes - too large to read.";
        }

        await Dispatcher.UIThread.InvokeAsync(() => text.Text = summary);
    }

    private static string Describe(byte[]? bytes)
        => bytes is null ? "(none)" : $"{bytes.Length:N0} bytes";
}
