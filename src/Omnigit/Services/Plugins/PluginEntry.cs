using System.Collections.Generic;
using Omnigit.Plugins;

namespace Omnigit.Services.Plugins;

public enum PluginState
{
    /// <summary>Found and understood, and the user has not turned it on.</summary>
    Off,

    /// <summary>Loaded; its viewers are offered.</summary>
    Loaded,

    /// <summary>Turned off this session, still loaded until Omnigit restarts.</summary>
    OffAfterRestart,

    /// <summary>Built against a newer plugin API than this copy of Omnigit has.</summary>
    NeedsNewerOmnigit,

    /// <summary>plugin.json is missing or unreadable, or the DLL would not load.</summary>
    Failed,
}

/// <summary>One folder under the plugins directory and what became of it.</summary>
public sealed class PluginEntry
{
    public required string Folder { get; init; }

    /// <summary>Null when plugin.json could not be read at all.</summary>
    public PluginManifest? Manifest { get; init; }

    public PluginState State { get; set; }

    /// <summary>Why it is <see cref="PluginState.Failed"/> or refused, in a sentence.</summary>
    public string? Problem { get; set; }

    public List<IChangeViewer> Viewers { get; } = [];

    /// <summary>The name to show: the manifest's, or the folder's when there is no manifest.</summary>
    public string DisplayName => Manifest is { Name.Length: > 0 } m ? m.Name
        : System.IO.Path.GetFileName(Folder);
}
