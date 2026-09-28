using Avalonia.Controls;

namespace Omnigit.Plugins;

/// <summary>
/// Draws one changed file. Omnigit's own line diff and image comparison are written
/// against this interface too, so a plugin is a peer of the built-ins, not a guest.
/// </summary>
/// <remarks>
/// Omnigit creates one instance per viewer type and keeps it for the session, so an
/// instance must hold no per-file state; that belongs in the control
/// <see cref="Create"/> returns. Both methods are called on the UI thread.
/// </remarks>
public interface IChangeViewer
{
    /// <summary>Stable and unique, e.g. <c>"acme.spreadsheet"</c>. Used to remember the user's choice.</summary>
    string Id { get; }

    /// <summary>Shown in the viewer picker above the diff, e.g. "Spreadsheet".</summary>
    string Name { get; }

    /// <summary>
    /// How well this viewer suits the file: 0 means it cannot show it at all, and the
    /// highest score is shown first. Omnigit's text view scores 1 for everything and its
    /// image view 10 for the formats it decodes, so 20 comfortably beats both.
    /// </summary>
    /// <remarks>Called for every file the user selects, so it must be quick and must not read the file.</remarks>
    int Match(ChangeInfo change);

    /// <summary>
    /// The control to put in the diff pane. Return it straight away and load the file's
    /// content inside it; a viewer that blocks here freezes the window.
    /// </summary>
    Control Create(ChangeContext context);
}
