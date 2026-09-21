using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// The app's own preferences file, which so far holds one thing: the language.
/// </summary>
/// <remarks>
/// Its whole job is to never be the reason the app fails to start, so most of what is
/// worth pinning here is what happens when the file is missing, empty or nonsense.
/// </remarks>
public class SettingsStoreTests : IDisposable
{
    private readonly string _directory =
        Path.Combine(Path.GetTempPath(), "omnigit-settings-" + Guid.NewGuid().ToString("N"));

    private string File => Path.Combine(_directory, "settings.json");

    public SettingsStoreTests() => Directory.CreateDirectory(_directory);

    public void Dispose()
    {
        try
        {
            Directory.Delete(_directory, recursive: true);
        }
        catch (IOException)
        {
        }

        GC.SuppressFinalize(this);
    }

    [Fact]
    public void A_first_run_has_no_file_and_no_preference()
        => Assert.Null(new SettingsStore(File).Load().Language);

    [Fact]
    public void What_was_saved_comes_back()
    {
        new SettingsStore(File).Save(new AppSettings { Language = "pt-BR" });

        Assert.Equal("pt-BR", new SettingsStore(File).Load().Language);
    }

    /// <summary>
    /// Null is "follow the machine", and it has to survive a round trip as itself rather
    /// than becoming the language the machine happened to be set to when it was written.
    /// </summary>
    [Fact]
    public void Following_the_system_is_saved_as_an_answer_not_as_an_absence()
    {
        var store = new SettingsStore(File);

        store.Save(new AppSettings { Language = "de" });
        store.Save(new AppSettings { Language = null });

        Assert.Null(store.Load().Language);
    }

    [Fact]
    public void A_file_written_before_this_setting_existed_reads_as_no_preference()
    {
        System.IO.File.WriteAllText(File, "{}");

        Assert.Null(new SettingsStore(File).Load().Language);
    }

    [Fact]
    public void A_corrupt_file_does_not_stop_the_app_starting()
    {
        System.IO.File.WriteAllText(File, "not json at all {{{");

        Assert.Null(new SettingsStore(File).Load().Language);
    }

    [Fact]
    public void Saving_somewhere_unwritable_is_swallowed()
    {
        var store = new SettingsStore(Path.Combine(_directory, "no", "such", "place.json"));

        var thrown = Record.Exception(() => store.Save(new AppSettings { Language = "fr" }));

        Assert.Null(thrown);
    }
}
