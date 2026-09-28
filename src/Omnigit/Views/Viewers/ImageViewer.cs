using System.Collections.Generic;
using Avalonia.Controls;
using Omnigit.Plugins;
using Omnigit.Services;

namespace Omnigit.Views.Viewers;

/// <summary>Shows the old and new image over each other, with a swipe or a fade between them.</summary>
public sealed class ImageViewer : IChangeViewer
{
    /// <summary>What Skia decodes. SVG is not here: it is text, and its diff is worth reading as text.</summary>
    private static readonly HashSet<string> Extensions = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];

    public string Id => "omnigit.image";

    public string Name => Strings.Get("Image");

    public int Match(ChangeInfo change) => Extensions.Contains(change.Extension) ? 10 : 0;

    public Control Create(ChangeContext context) => new ImageCompareView(context);
}
