using System;
using System.Collections.Generic;
using System.Linq;
using Omnigit.Plugins;

namespace Omnigit.Services.Plugins;

/// <summary>
/// Every viewer Omnigit can offer, built in or from a plugin, and which of them suit a file.
/// </summary>
/// <remarks>
/// The built-ins are registered through exactly the interface a plugin implements. That
/// is not tidiness: it means our own line diff is the first user of the plugin API, so
/// the API cannot quietly stop being enough to write a viewer with.
/// </remarks>
public sealed class ChangeViewerRegistry
{
    private readonly List<(IChangeViewer Viewer, string? Source)> _viewers = [];
    private readonly HashSet<string> _complainedAbout = new(StringComparer.Ordinal);
    private readonly IActivityLog? _log;

    public ChangeViewerRegistry(IEnumerable<IChangeViewer> builtIns, IActivityLog? log = null)
    {
        _log = log;

        foreach (var viewer in builtIns)
            _viewers.Add((viewer, null));
    }

    /// <summary>Raised when a plugin adds viewers, so the file on screen can offer them.</summary>
    public event Action? Changed;

    /// <param name="source">The plugin's name, for the log when one of its viewers misbehaves.</param>
    public void Add(IEnumerable<IChangeViewer> viewers, string source)
    {
        foreach (var viewer in viewers)
        {
            // A second viewer claiming an id already taken would make the remembered
            // choice ambiguous. The first one registered keeps it - built-ins first.
            if (_viewers.Any(v => v.Viewer.Id == viewer.Id))
            {
                Complain(viewer.Id, null,
                    Strings.Format("{0} offers a viewer with the id \"{1}\", which is already taken - it was skipped.", source, viewer.Id),
                    null);
                continue;
            }

            _viewers.Add((viewer, source));
        }

        Changed?.Invoke();
    }

    /// <summary>
    /// The viewers that can show <paramref name="change"/>, best first. Never empty while
    /// the text viewer is registered, since it matches everything.
    /// </summary>
    public IReadOnlyList<IChangeViewer> For(ChangeInfo change)
    {
        var scored = new List<(IChangeViewer Viewer, int Score, int Order)>();

        for (var i = 0; i < _viewers.Count; i++)
        {
            var (viewer, source) = _viewers[i];
            int score;

            try
            {
                score = viewer.Match(change);
            }
            catch (Exception ex)
            {
                // Skipped rather than fatal, and logged once rather than on every click:
                // the same broken viewer would otherwise write a line per file selected.
                Complain(viewer.Id, source,
                    Strings.Format("The viewer \"{0}\" failed while deciding whether it could show a file, and has been skipped.", viewer.Name),
                    ex.ToString());
                continue;
            }

            if (score > 0)
                scored.Add((viewer, score, i));
        }

        // Ties go to whoever registered first, so a plugin can't displace a built-in by
        // merely matching it.
        return scored
            .OrderByDescending(s => s.Score)
            .ThenBy(s => s.Order)
            .Select(s => s.Viewer)
            .ToList();
    }

    /// <summary>Which plugin a viewer came from, or null for a built-in.</summary>
    public string? SourceOf(IChangeViewer viewer)
        => _viewers.FirstOrDefault(v => ReferenceEquals(v.Viewer, viewer)).Source;

    internal void Complain(string viewerId, string? source, string message, string? detail)
    {
        if (!_complainedAbout.Add(viewerId))
            return;

        _log?.Write(ActivityLevel.Warning,
            source is null ? message : Strings.Format("Plugin {0}: {1}", source, message),
            detail);
    }
}
