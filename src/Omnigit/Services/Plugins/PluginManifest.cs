using System.Text.Json.Serialization;

namespace Omnigit.Services.Plugins;

/// <summary>
/// <c>plugin.json</c>: what a plugin says about itself, read without loading any of its
/// code. That is what lets Settings list a plugin that is switched off.
/// </summary>
public sealed class PluginManifest
{
    /// <summary>Stable and unique, e.g. <c>"acme.spreadsheets"</c>. Enabling is remembered against it.</summary>
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Version { get; set; } = string.Empty;

    public string Author { get; set; } = string.Empty;

    /// <summary>The DLL to load, relative to the plugin's folder, e.g. <c>"Acme.Spreadsheets.dll"</c>.</summary>
    public string Assembly { get; set; } = string.Empty;

    /// <summary>The <see cref="Omnigit.Plugins.PluginApi.Version"/> the plugin was built against, e.g. <c>"1.0"</c>.</summary>
    public string ApiVersion { get; set; } = string.Empty;
}

[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true, ReadCommentHandling = System.Text.Json.JsonCommentHandling.Skip, AllowTrailingCommas = true)]
[JsonSerializable(typeof(PluginManifest))]
internal sealed partial class PluginJsonContext : JsonSerializerContext;
