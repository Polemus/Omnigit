using Avalonia.Controls;
using Omnigit.Plugins;
using Omnigit.Services;

namespace Omnigit.Views.Viewers;

/// <summary>
/// The line diff in two columns. Offered for everything the text view is, and scored
/// the same, so it comes second: the unified view stays the default and this is one
/// choice away - and remembered per extension once chosen.
/// </summary>
public sealed class SideBySideViewer : IChangeViewer
{
    public string Id => "omnigit.side-by-side";

    public string Name => Strings.Get("Side by side");

    public int Match(ChangeInfo change) => 1;

    public Control Create(ChangeContext context) => new SideBySideView(TextViewer.LinesOf(context));
}
