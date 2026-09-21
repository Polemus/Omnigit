using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnigit.Services;

/// <summary>Preferences that belong to the app rather than to a repository or account.</summary>
public interface ISettingsStore
{
    AppSettings Load();

    void Save(AppSettings settings);
}

/// <summary>
/// The app's own settings file.
/// </summary>
/// <remarks>
/// A third file beside accounts.json and repositories.json rather than a field added to
/// one of them: those two are lists of things the user added, and both are rewritten
/// wholesale whenever that list changes. A preference has nothing to do with either, and
/// putting it in one would mean a language choice could be lost by a repository being
/// removed.
/// </remarks>
public sealed class SettingsStore : ISettingsStore
{
    private readonly string _file;

    public SettingsStore() : this(AppPaths.In("settings.json")) { }

    /// <summary>Internal for the same reason RepositoryStore's is: only the tests want it.</summary>
    internal SettingsStore(string file) => _file = file;

    public AppSettings Load()
    {
        try
        {
            if (!File.Exists(_file))
                return new AppSettings();

            return JsonSerializer.Deserialize(File.ReadAllText(_file), SettingsJsonContext.Default.AppSettings)
                   ?? new AppSettings();
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            // Defaults beat not starting.
            return new AppSettings();
        }
    }

    public void Save(AppSettings settings)
    {
        try
        {
            File.WriteAllText(_file,
                JsonSerializer.Serialize(settings, SettingsJsonContext.Default.AppSettings));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Losing a preference is an annoyance, not a failure worth a banner.
        }
    }
}

public sealed class AppSettings
{
    /// <summary>
    /// The language the user picked, or null for "whatever the machine is set to".
    /// Null is also what a file written before this field existed reads as, which is the
    /// same answer and needs no migration.
    /// </summary>
    public string? Language { get; set; }
}

// Source-generated, like the other stores, so this keeps working under trimming.
[JsonSourceGenerationOptions(WriteIndented = true)]
[JsonSerializable(typeof(AppSettings))]
internal sealed partial class SettingsJsonContext : JsonSerializerContext;
