using System.Collections.Generic;
using Avalonia.Controls;
using Omnigit.Plugins;
using Omnigit.Services;

namespace Omnigit.Views.Viewers;

/// <summary>Shows the old and new image over each other, with a swipe or a fade between them.</summary>
public sealed class ImageViewer : IChangeViewer
{
    /// <summary>
    /// What Skia decodes, plus SVG, which is drawn to a bitmap first. An SVG is text as
    /// well and its diff is sometimes the more useful view - a changed attribute can
    /// move nothing visible - so Text stays one choice away in the picker.
    /// </summary>
    private static readonly HashSet<string> Extensions = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"];

    public string Id => "omnigit.image";

    public string Name => Strings.Get("Image");

    public int Match(ChangeInfo change) => Extensions.Contains(change.Extension) ? 10 : 0;

    public Control Create(ChangeContext context) => new ImageCompareView(context);
}
