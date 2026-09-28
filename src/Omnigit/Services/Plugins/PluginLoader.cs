using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Omnigit.Plugins;

namespace Omnigit.Services.Plugins;

/// <summary>
/// Finds plugins in a folder and loads the ones the user turned on.
/// </summary>
/// <remarks>
/// <para>
/// A plugin is a folder holding a <c>plugin.json</c> and the DLLs it names. There is no
/// store and nothing is vetted: a plugin runs inside Omnigit with the same access
/// Omnigit has, and whoever installs one is trusting its author the same way they would
/// trust any program they install. What Omnigit controls is what it <i>hands</i> a
/// plugin - a viewer is given a file's path and its two versions, and nothing about
/// accounts - and that it runs nothing the user has not switched on.
/// </para>
/// <para>
/// Nothing here throws. A folder that is not a plugin, a manifest that is not JSON and a
/// DLL that will not load all come back as an entry saying so, because Settings is where
/// the user will look for why a plugin is missing and an exception would tell them nowhere.
/// </para>
/// </remarks>
public static class PluginLoader
{
    public const string ManifestFile = "plugin.json";

    /// <summary>Where plugins are installed: a folder of folders, one per plugin.</summary>
    public static string DefaultRoot => AppPaths.In("plugins");

    /// <summary>Reads every plugin's manifest under <paramref name="root"/>. Loads no code.</summary>
    public static List<PluginEntry> Discover(string root)
    {
        var found = new List<PluginEntry>();

        try
        {
            if (!Directory.Exists(root))
                return found;

            foreach (var folder in Directory.EnumerateDirectories(root).Order(StringComparer.Ordinal))
                found.Add(Describe(folder));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // An unreadable plugins folder is the same as an empty one.
        }

        return found;
    }

    private static PluginEntry Describe(string folder)
    {
        var file = Path.Combine(folder, ManifestFile);

        if (!File.Exists(file))
            return Failed(folder, null, Strings.Format("There is no {0} in this folder.", ManifestFile));

        PluginManifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize(File.ReadAllText(file), PluginJsonContext.Default.PluginManifest);
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return Failed(folder, null, Strings.Format("{0} could not be read: {1}", ManifestFile, ex.Message));
        }

        if (manifest is null || string.IsNullOrWhiteSpace(manifest.Id) || string.IsNullOrWhiteSpace(manifest.Assembly))
            return Failed(folder, manifest, Strings.Format("{0} must give at least an id and an assembly.", ManifestFile));

        if (!IsCompatible(manifest.ApiVersion))
        {
            return new PluginEntry
            {
                Folder = folder,
                Manifest = manifest,
                State = PluginState.NeedsNewerOmnigit,
                Problem = Strings.Format(
                    "Built for plugin API {0}; this copy of Omnigit has {1}.",
                    string.IsNullOrWhiteSpace(manifest.ApiVersion) ? "?" : manifest.ApiVersion,
                    PluginApi.Version),
            };
        }

        return new PluginEntry { Folder = folder, Manifest = manifest, State = PluginState.Off };
    }

    /// <summary>
    /// Same major version, or an older one of the same major. A missing or garbled
    /// version is refused: guessing would load exactly the plugins that are most likely
    /// to fail halfway through drawing something.
    /// </summary>
    internal static bool IsCompatible(string? apiVersion)
    {
        if (string.IsNullOrWhiteSpace(apiVersion))
            return false;

        var parts = apiVersion.Split('.');
        if (!int.TryParse(parts[0], out var major))
            return false;

        var minor = parts.Length > 1 && int.TryParse(parts[1], out var m) ? m : 0;
        return major == PluginApi.Major && minor <= PluginApi.Minor;
    }

    /// <summary>
    /// Loads the plugin's assembly and creates one of each public viewer type in it.
    /// Leaves the entry <see cref="PluginState.Loaded"/> or <see cref="PluginState.Failed"/>.
    /// </summary>
    public static void Load(PluginEntry entry)
    {
        if (entry.Manifest is not { } manifest || entry.State != PluginState.Off)
            return;

        entry.Viewers.Clear();

        try
        {
            var dll = Path.GetFullPath(Path.Combine(entry.Folder, manifest.Assembly));

            // A manifest naming "../../something.dll" is a plugin reaching outside its own
            // folder, which nothing legitimate needs to do.
            if (!dll.StartsWith(Path.GetFullPath(entry.Folder) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                throw new InvalidOperationException(Strings.Get("The assembly must be inside the plugin's own folder."));

            if (!File.Exists(dll))
                throw new FileNotFoundException(Strings.Format("{0} is not in the plugin's folder.", manifest.Assembly));

            var context = new PluginLoadContext(dll);
            var assembly = context.LoadFromAssemblyPath(dll);

            foreach (var type in ViewerTypes(assembly))
                entry.Viewers.Add((IChangeViewer)Activator.CreateInstance(type)!);

            if (entry.Viewers.Count == 0)
                throw new InvalidOperationException(Strings.Get("It loaded, but has nothing in it Omnigit can use."));

            entry.State = PluginState.Loaded;
            entry.Problem = null;
        }
        catch (Exception ex)
        {
            // Everything, deliberately: this is someone else's code, and whatever it throws
            // while loading must not take the app down with it.
            entry.Viewers.Clear();
            entry.State = PluginState.Failed;
            entry.Problem = (ex as TargetInvocationException)?.InnerException?.Message ?? ex.Message;
        }
    }

    private static IEnumerable<Type> ViewerTypes(Assembly assembly)
    {
        Type?[] types;
        try
        {
            types = assembly.GetExportedTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            types = ex.Types;
        }

        return types
            .OfType<Type>()
            .Where(t => t is { IsClass: true, IsAbstract: false }
                        && typeof(IChangeViewer).IsAssignableFrom(t)
                        && t.GetConstructor(Type.EmptyTypes) is not null);
    }

    private static PluginEntry Failed(string folder, PluginManifest? manifest, string problem) => new()
    {
        Folder = folder,
        Manifest = manifest,
        State = PluginState.Failed,
        Problem = problem,
    };
}
