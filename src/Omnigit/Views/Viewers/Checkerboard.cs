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
    private const double ScreenSquare = 8;

    private double _scale = 1;

    /// <summary>
    /// How much the board is being scaled by whatever contains it. The squares are
    /// divided by it so they stay eight pixels on screen, rather than shrinking into
    /// grey noise when a large image is fitted to a small pane.
    /// </summary>
    public double Scale
    {
        get => _scale;
        set
        {
            if (value <= 0 || System.Math.Abs(value - _scale) < 0.001)
                return;

            _scale = value;
            InvalidateVisual();
        }
    }

    public override void Render(DrawingContext context)
    {
        var square = ScreenSquare / _scale;
        var light = Brush("CheckerLight", Brushes.White);
        var dark = Brush("CheckerDark", Brushes.LightGray);
        var size = Bounds.Size;

        context.FillRectangle(light, new Rect(size));

        for (var y = 0; y * square < size.Height; y++)
        for (var x = y % 2; x * square < size.Width; x += 2)
        {
            context.FillRectangle(dark, new Rect(
                x * square, y * square,
                System.Math.Min(square, size.Width - x * square),
                System.Math.Min(square, size.Height - y * square)));
        }
    }

    private IBrush Brush(string key, IBrush fallback)
        => this.TryFindResource(key, ActualThemeVariant, out var value) && value is IBrush brush
            ? brush
            : fallback;
}
