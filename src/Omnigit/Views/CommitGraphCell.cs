using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.Views;

/// <summary>
/// Draws one row of the commit graph: the lines crossing it and the node on it.
/// </summary>
/// <remarks>
/// <para>One control per row rather than one for the whole column, because the history
/// is a virtualising list: nothing knows about the rows off screen, and a single canvas
/// would have to. A cell only ever draws between its own top and bottom edges, and lanes
/// line up because a lane index is the same column in every row.</para>
///
/// <para>Height comes from the row it is stretched into, so a wrapped summary makes the
/// lines longer rather than making them stop short.</para>
/// </remarks>
public sealed class CommitGraphCell : Control
{
    /// <summary>Column pitch. Wide enough for a node and the curve into the next lane.</summary>
    private const double LaneWidth = 14;

    private const double NodeRadius = 4.5;
    private const double LineThickness = 2;

    public static readonly StyledProperty<CommitGraphRow?> RowProperty =
        AvaloniaProperty.Register<CommitGraphCell, CommitGraphRow?>(nameof(Row));

    /// <summary>
    /// How many lanes the gutter is sized for. Every cell is told the same number, which
    /// is what keeps the summaries beside them in one straight column rather than each
    /// row starting wherever its own lanes happen to end.
    /// </summary>
    public static readonly StyledProperty<int> LaneCountProperty =
        AvaloniaProperty.Register<CommitGraphCell, int>(nameof(LaneCount), 1);

    static CommitGraphCell()
    {
        AffectsRender<CommitGraphCell>(RowProperty, LaneCountProperty);
        AffectsMeasure<CommitGraphCell>(LaneCountProperty);
    }

    public CommitGraphRow? Row
    {
        get => GetValue(RowProperty);
        set => SetValue(RowProperty, value);
    }

    public int LaneCount
    {
        get => GetValue(LaneCountProperty);
        set => SetValue(LaneCountProperty, value);
    }

    protected override Size MeasureOverride(Size availableSize)
        => new(Math.Max(1, Math.Min(LaneCount, CommitGraph.MaxLanes)) * LaneWidth, 0);

    public override void Render(DrawingContext context)
    {
        if (Row is not { } row)
            return;

        var height = Bounds.Height;
        var middle = height / 2;

        foreach (var segment in row.Above)
            DrawSegment(context, segment, 0, middle);

        foreach (var segment in row.Below)
            DrawSegment(context, segment, middle, height);

        var brush = Brush(row.Colour);
        var centre = new Point(X(row.Lane), middle);

        // A merge is drawn hollow. It is the one commit in a history that did not write
        // anything itself, and the ring is how every other client says so.
        if (row.IsMerge)
        {
            context.DrawEllipse(BackgroundBrush(), new Pen(brush, LineThickness), centre,
                NodeRadius, NodeRadius);
        }
        else
        {
            context.DrawEllipse(brush, null, centre, NodeRadius, NodeRadius);
        }
    }

    /// <summary>
    /// A line across half a cell. Straight down when it stays in its lane; an S-curve
    /// when it changes lane, because a diagonal reads as a different kind of line and a
    /// right angle reads as two.
    /// </summary>
    private void DrawSegment(DrawingContext context, GraphSegment segment, double top, double bottom)
    {
        var pen = new Pen(Brush(segment.Colour), LineThickness, lineCap: PenLineCap.Round);
        var from = new Point(X(segment.From), top);
        var to = new Point(X(segment.To), bottom);

        if (Math.Abs(from.X - to.X) < 0.01)
        {
            context.DrawLine(pen, from, to);
            return;
        }

        var geometry = new StreamGeometry();

        using (var draw = geometry.Open())
        {
            draw.BeginFigure(from, isFilled: false);
            draw.CubicBezierTo(
                new Point(from.X, from.Y + ((bottom - top) * 0.55)),
                new Point(to.X, bottom - ((bottom - top) * 0.55)),
                to);
            draw.EndFigure(false);
        }

        context.DrawGeometry(null, pen, geometry);
    }

    /// <summary>
    /// The centre of a lane. Lanes past the last column are folded onto it rather than
    /// drawn off the edge: past ten the shape is unreadable anyway, and the alternative
    /// is a gutter that eats the summary.
    /// </summary>
    private static double X(int lane)
        => (Math.Min(lane, CommitGraph.MaxLanes - 1) * LaneWidth) + (LaneWidth / 2);

    private IBrush Brush(int colour)
    {
        var key = $"GraphLane{colour % LanePalette}";

        return this.TryFindResource(key, out var value) && value is IBrush brush
            ? brush
            : Brushes.Gray;
    }

    /// <summary>
    /// What a hollow node is filled with, so the lines behind it do not show through the
    /// middle of a merge.
    /// </summary>
    private IBrush BackgroundBrush()
        => this.TryFindResource("SurfaceBackground", out var value) && value is IBrush brush
            ? brush
            : Brushes.Transparent;

    /// <summary>How many lane colours Tokens.axaml defines.</summary>
    private const int LanePalette = 8;
}

/// <summary>Resource lookup that follows the control's place in the tree and its theme.</summary>
internal static class ResourceLookup
{
    public static bool TryFindResource(this Control control, string key, out object? value)
        => control.TryFindResource(key, control.ActualThemeVariant, out value);
}
