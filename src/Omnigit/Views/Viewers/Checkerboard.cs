using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace Omnigit.Views.Viewers;

/// <summary>
/// The grey squares image editors draw behind a picture, so that a transparent pixel
/// looks transparent instead of looking like the colour of the pane.
/// </summary>
public sealed class Checkerboard : Control
{
    private const double Square = 8;

    public override void Render(DrawingContext context)
    {
        var light = Brush("CheckerLight", Brushes.White);
        var dark = Brush("CheckerDark", Brushes.LightGray);
        var size = Bounds.Size;

        context.FillRectangle(light, new Rect(size));

        for (var y = 0; y * Square < size.Height; y++)
        for (var x = y % 2; x * Square < size.Width; x += 2)
        {
            context.FillRectangle(dark, new Rect(
                x * Square, y * Square,
                System.Math.Min(Square, size.Width - x * Square),
                System.Math.Min(Square, size.Height - y * Square)));
        }
    }

    private IBrush Brush(string key, IBrush fallback)
        => this.TryFindResource(key, ActualThemeVariant, out var value) && value is IBrush brush
            ? brush
            : fallback;
}
