using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Omnigit.Plugins;
using Omnigit.Services;

namespace Omnigit.Views.Viewers;

/// <summary>
/// The old image under the new one. Swipe shows the old to the left of a line and the
/// new to the right; onion skin fades the new in over the old. Dragging on the picture
/// moves the line, which is quicker than reaching for the slider.
/// </summary>
public partial class ImageCompareView : UserControl
{
    private Bitmap? _old;
    private Bitmap? _new;

    /// <summary>Design-time only.</summary>
    public ImageCompareView() => InitializeComponent();

    public ImageCompareView(ChangeContext context)
    {
        InitializeComponent();

        Mix.PropertyChanged += (_, e) =>
        {
            if (e.Property == Avalonia.Controls.Primitives.RangeBase.ValueProperty)
                Arrange();
        };
        SwipeMode.IsCheckedChanged += (_, _) => Arrange();

        // The fitted scale changes with the pane, and the divider is drawn inside it.
        Fit.SizeChanged += (_, _) => Arrange();

        Stage.PointerPressed += OnStagePointer;
        Stage.PointerMoved += OnStagePointer;

        // Bitmaps own native memory; a viewer is thrown away every time the selection
        // moves, so leaving them to the finaliser would let a quick scroll through a
        // folder of screenshots pile up hundreds of megabytes.
        DetachedFromVisualTree += (_, _) =>
        {
            OldImage.Source = NewImage.Source = null;
            _old?.Dispose();
            _new?.Dispose();
            _old = _new = null;
        };

        Show(Strings.Get("Loading…"));
        _ = LoadAsync(context);
    }

    private async Task LoadAsync(ChangeContext context)
    {
        try
        {
            var (oldImage, newImage) = await Task.Run(async () =>
            {
                var oldBytes = await context.ReadOldAsync();
                var newBytes = await context.ReadNewAsync();
                var vector = context.Change.Extension == "svg";
                return (Decode(oldBytes, vector), Decode(newBytes, vector));
            }, context.Closed);

            if (context.Closed.IsCancellationRequested)
            {
                oldImage.Bitmap?.Dispose();
                newImage.Bitmap?.Dispose();
                return;
            }

            Present(oldImage, newImage);
        }
        catch (OperationCanceledException)
        {
            // The user moved on; this control is already on its way out.
        }
        catch (FileTooLargeException ex)
        {
            Show(Strings.Format("This image is too large to preview ({0}).", Size(ex.Size)));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            Show(Strings.Format("Couldn't read the image: {0}", ex.Message));
        }
    }

    private readonly record struct Decoded(Bitmap? Bitmap, long Bytes, bool Failed);

    private static Decoded Decode(byte[]? bytes, bool vector)
    {
        if (bytes is null)
            return new Decoded(null, 0, false);

        try
        {
            using var stream = new MemoryStream(vector ? SvgRaster.ToPng(bytes) : bytes);
            return new Decoded(new Bitmap(stream), bytes.Length, false);
        }
        catch (Exception)
        {
            // Skia's own exceptions vary by format and platform, and they all mean the
            // same thing to the reader: the file is not a picture it can draw.
            return new Decoded(null, bytes.Length, true);
        }
    }

    private void Present(Decoded oldImage, Decoded newImage)
    {
        if (oldImage.Failed || newImage.Failed)
        {
            oldImage.Bitmap?.Dispose();
            newImage.Bitmap?.Dispose();
            Show(Strings.Get("This file couldn't be decoded as an image. Switch to Text to see what changed."));
            return;
        }

        _old = oldImage.Bitmap;
        _new = newImage.Bitmap;

        if (_old is null && _new is null)
        {
            Show(Strings.Get("Neither version of this file could be found."));
            return;
        }

        OldImage.Source = _old;
        NewImage.Source = _new;

        var width = Math.Max(_old?.Size.Width ?? 0, _new?.Size.Width ?? 0);
        var height = Math.Max(_old?.Size.Height ?? 0, _new?.Size.Height ?? 0);
        Stage.Width = width;
        Stage.Height = height;

        Facts.Text = (_old, _new) switch
        {
            (null, { } n) => Describe(n, newImage.Bytes),
            ({ } o, null) => Describe(o, oldImage.Bytes),
            ({ } o, { } n) => $"{Describe(o, oldImage.Bytes)}  →  {Describe(n, newImage.Bytes)}",
            _ => string.Empty,
        };

        // Only one side: an added or deleted image has nothing to compare against.
        var both = _old is not null && _new is not null;
        ModePanel.IsVisible = Mix.IsVisible = Divider.IsVisible = both;

        Message.IsVisible = false;
        Stage.IsVisible = true;
        Arrange();
    }

    private void Arrange()
    {
        if (Fit.Bounds.Width > 0 && Stage.Width > 0)
            Board.Scale = Fit.Bounds.Width / Stage.Width;

        if (_old is null || _new is null)
        {
            NewImage.Clip = null;
            NewImage.Opacity = 1;
            return;
        }

        var width = Stage.Width;
        var height = Stage.Height;

        if (SwipeMode.IsChecked == true)
        {
            // Old to the left of the line, new to the right.
            var split = Math.Round(width * Mix.Value);
            NewImage.Opacity = 1;
            NewImage.Clip = new RectangleGeometry(new Rect(split, 0, Math.Max(0, width - split), height));
            // The divider is inside the Viewbox, so it shrinks with the picture - to a
            // fraction of a pixel on a large one. Dividing by the scale keeps it two
            // pixels on screen whatever size the image is drawn.
            var scale = Fit.Bounds.Width > 0 && width > 0 ? Fit.Bounds.Width / width : 1;
            var thickness = 2 / scale;

            Divider.IsVisible = true;
            Divider.Width = thickness;
            Divider.Margin = new Thickness(Math.Clamp(split - thickness / 2, 0, Math.Max(0, width - thickness)), 0, 0, 0);
            Divider.Height = height;
        }
        else
        {
            NewImage.Clip = null;
            NewImage.Opacity = Mix.Value;
            Divider.IsVisible = false;
        }
    }

    private void OnStagePointer(object? sender, PointerEventArgs e)
    {
        if (SwipeMode.IsChecked != true || !e.GetCurrentPoint(Stage).Properties.IsLeftButtonPressed
            || Stage.Width is not > 0)
            return;

        Mix.Value = Math.Clamp(e.GetPosition(Stage).X / Stage.Width, 0, 1);
    }

    private void Show(string message)
    {
        Dispatcher.UIThread.VerifyAccess();
        Message.Text = message;
        Message.IsVisible = true;
        Stage.IsVisible = false;
        ModePanel.IsVisible = Mix.IsVisible = false;
        Facts.Text = string.Empty;
    }

    private static string Describe(Bitmap bitmap, long bytes)
        => $"{bitmap.PixelSize.Width}×{bitmap.PixelSize.Height} · {Size(bytes)}";

    private static string Size(long bytes) => bytes switch
    {
        < 1024 => $"{bytes} B",
        < 1024 * 1024 => $"{bytes / 1024.0:0.#} KB",
        _ => $"{bytes / (1024.0 * 1024):0.#} MB",
    };
}
