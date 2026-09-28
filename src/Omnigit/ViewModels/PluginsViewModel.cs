using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Omnigit.Services;
using Omnigit.Services.Plugins;

namespace Omnigit.ViewModels;

/// <summary>One plugin folder in Settings → Plugins.</summary>
public sealed partial class PluginRowViewModel : ObservableObject
{
    private readonly PluginsViewModel _owner;
    private bool _loading;

    internal PluginRowViewModel(PluginEntry entry, bool enabled, PluginsViewModel owner)
    {
        Entry = entry;
        _owner = owner;
        _loading = true;
        IsEnabled = enabled;
        _loading = false;
    }

    internal PluginEntry Entry { get; }

    public string Name => Entry.DisplayName;

    public string Details => Entry.Manifest is { } m
        ? string.Join(" · ", new[] { m.Version, m.Author, m.Id }.Where(s => !string.IsNullOrWhiteSpace(s)))
        : Entry.Folder;

    /// <summary>Only a plugin that was understood can be switched on.</summary>
    public bool CanToggle => Entry.Manifest is not null
                             && Entry.State is PluginState.Off or PluginState.Loaded or PluginState.OffAfterRestart;

    [ObservableProperty]
    public partial bool IsEnabled { get; set; }

    public string Status => Entry.State switch
    {
        PluginState.Loaded => Strings.Plural("Loaded, {0} viewer", "Loaded, {0} viewers", Entry.Viewers.Count),
        PluginState.OffAfterRestart => Strings.Get("Switched off - Omnigit keeps it loaded until it restarts."),
        PluginState.NeedsNewerOmnigit => Entry.Problem ?? string.Empty,
        PluginState.Failed => Strings.Format("Didn't load: {0}", Entry.Problem ?? string.Empty),
        _ => Strings.Get("Off"),
    };

    public bool IsProblem => Entry.State is PluginState.Failed or PluginState.NeedsNewerOmnigit;

    partial void OnIsEnabledChanged(bool value)
    {
        if (_loading)
            return;

        _owner.SetEnabled(this, value);
        OnPropertyChanged(nameof(Status));
        OnPropertyChanged(nameof(IsProblem));
        OnPropertyChanged(nameof(CanToggle));
    }

    internal void Refresh()
    {
        OnPropertyChanged(nameof(Status));
        OnPropertyChanged(nameof(IsProblem));
        OnPropertyChanged(nameof(CanToggle));
    }
}

/// <summary>
/// Settings → Plugins, and the one place plugins are loaded from.
/// </summary>
/// <remarks>
/// Nothing is loaded that the user has not switched on, and a switch is remembered by
/// the plugin's id. Turning one on loads it straight away; turning one off only takes
/// effect at the next launch, because its code cannot be reliably unloaded while its
/// controls may still be on screen - the page says so rather than pretending.
/// </remarks>
public sealed partial class PluginsViewModel : ObservableObject
{
    private readonly ISettingsStore _settings;
    private readonly ChangeViewerRegistry _registry;
    private readonly IActivityLog _log;
    private readonly ISystemShell _shell;

    public PluginsViewModel(
        ISettingsStore settings, ChangeViewerRegistry registry, IActivityLog log, ISystemShell shell,
        string root, bool designTime = false)
    {
        _settings = settings;
        _registry = registry;
        _log = log;
        _shell = shell;
        Root = root;

        if (!designTime)
            Scan();
    }

    public string Root { get; }

    public ObservableCollection<PluginRowViewModel> Plugins { get; } = [];

    public bool HasPlugins => Plugins.Count > 0;

    /// <summary>Reads the plugins folder and loads every plugin the user turned on before.</summary>
    public void Scan()
    {
        var enabled = _settings.Load().EnabledPlugins.ToHashSet();

        foreach (var entry in PluginLoader.Discover(Root))
        {
            var on = entry.Manifest is { } m && enabled.Contains(m.Id);

            if (on && entry.State == PluginState.Off)
                LoadInto(entry);

            Plugins.Add(new PluginRowViewModel(entry, on, this));
        }

        OnPropertyChanged(nameof(HasPlugins));
    }

    internal void SetEnabled(PluginRowViewModel row, bool enabled)
    {
        if (row.Entry.Manifest is not { } manifest)
            return;

        var settings = _settings.Load();
        var ids = settings.EnabledPlugins.Where(id => id != manifest.Id).ToList();
        if (enabled)
            ids.Add(manifest.Id);
        settings.EnabledPlugins = ids;
        _settings.Save(settings);

        switch (row.Entry.State)
        {
            case PluginState.Off when enabled:
                LoadInto(row.Entry);
                break;

            case PluginState.Loaded when !enabled:
                row.Entry.State = PluginState.OffAfterRestart;
                break;

            case PluginState.OffAfterRestart when enabled:
                row.Entry.State = PluginState.Loaded;
                break;
        }

        row.Refresh();
    }

    private void LoadInto(PluginEntry entry)
    {
        PluginLoader.Load(entry);

        if (entry.State == PluginState.Loaded)
        {
            _registry.Add(entry.Viewers, entry.DisplayName);
            _log.Write(ActivityLevel.Info, Strings.Format("Loaded plugin {0}", entry.DisplayName));
        }
        else
        {
            _log.Write(ActivityLevel.Warning,
                Strings.Format("Plugin {0} didn't load", entry.DisplayName), entry.Problem);
        }
    }

    [RelayCommand]
    private async Task OpenFolderAsync()
    {
        try
        {
            Directory.CreateDirectory(Root);
        }
        catch (IOException)
        {
            // Opening will fail and say where it would have been.
        }

        // ShowInFileManager opens the folder a path sits in, so aim it at something inside.
        if (!await _shell.ShowInFileManagerAsync(Path.Combine(Root, PluginLoader.ManifestFile)))
            _log.Write(ActivityLevel.Warning, Strings.Format("Couldn't open {0}", Root));
    }
}
