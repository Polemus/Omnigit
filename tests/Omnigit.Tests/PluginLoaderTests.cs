using System.Runtime.Loader;
using Omnigit.Plugins;
using Omnigit.Services.Plugins;

namespace Omnigit.Tests;

/// <summary>
/// Finding, refusing and loading plugins, against the sample plugin in <c>samples/</c> -
/// a real DLL built against the SDK, so what is proven is what a stranger's plugin gets.
/// </summary>
public sealed class PluginLoaderTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(), "omnigit-tests", "plugins-" + Guid.NewGuid().ToString("n"));

    public PluginLoaderTests() => Directory.CreateDirectory(_root);

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // A loaded plugin's DLL can stay open on Windows; a leftover temp folder is fine.
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    [Fact]
    public void A_plugin_is_listed_without_any_of_its_code_being_loaded()
    {
        InstallSample("sizes");

        var entry = Assert.Single(PluginLoader.Discover(_root));

        Assert.Equal(PluginState.Off, entry.State);
        Assert.Equal("omnigit.sample.sizes", entry.Manifest!.Id);
        Assert.Empty(entry.Viewers);
        Assert.DoesNotContain(AssemblyLoadContext.All, c => c.Name?.Contains(entry.Folder) == true);
    }

    [Fact]
    public void Loading_finds_the_viewer_as_the_hosts_own_interface()
    {
        InstallSample("sizes");
        var entry = Assert.Single(PluginLoader.Discover(_root));

        PluginLoader.Load(entry);

        Assert.Equal(PluginState.Loaded, entry.State);
        var viewer = Assert.Single(entry.Viewers);

        // The point of sharing the SDK with the default context: a plugin with its own
        // copy would define an IChangeViewer that is not this one, and the cast in the
        // loader would have failed instead of reaching here.
        Assert.IsAssignableFrom<IChangeViewer>(viewer);
        Assert.Same(typeof(IChangeViewer).Assembly, viewer.GetType().GetInterfaces()
            .Single(i => i.Name == nameof(IChangeViewer)).Assembly);

        // ...while the plugin itself lives in a context of its own.
        Assert.NotSame(AssemblyLoadContext.Default, AssemblyLoadContext.GetLoadContext(viewer.GetType().Assembly));

        Assert.Equal(1, viewer.Match(new ChangeInfo("any.bin", null, ChangeKind.Modified)));
    }

    [Fact]
    public void A_plugin_built_for_a_newer_api_is_refused_before_loading()
    {
        InstallSample("future", manifest => manifest.Replace("\"1.0\"", $"\"{PluginApi.Major + 1}.0\""));

        var entry = Assert.Single(PluginLoader.Discover(_root));
        PluginLoader.Load(entry);

        Assert.Equal(PluginState.NeedsNewerOmnigit, entry.State);
        Assert.Empty(entry.Viewers);
    }

    [Theory]
    [InlineData("1.0", true)]
    [InlineData("1", true)]
    [InlineData("1.99", false)]
    [InlineData("2.0", false)]
    [InlineData("0.9", false)]
    [InlineData("", false)]
    [InlineData("one", false)]
    public void Api_versions_are_compared_by_major_then_minor(string version, bool compatible)
        => Assert.Equal(compatible, PluginLoader.IsCompatible(version));

    [Fact]
    public void A_broken_manifest_is_reported_rather_than_thrown()
    {
        var folder = Directory.CreateDirectory(Path.Combine(_root, "broken")).FullName;
        File.WriteAllText(Path.Combine(folder, PluginLoader.ManifestFile), "{ this is not json");

        var entry = Assert.Single(PluginLoader.Discover(_root));

        Assert.Equal(PluginState.Failed, entry.State);
        Assert.False(string.IsNullOrWhiteSpace(entry.Problem));
    }

    [Fact]
    public void A_folder_with_no_manifest_is_reported_by_its_folder_name()
    {
        Directory.CreateDirectory(Path.Combine(_root, "just-a-folder"));

        var entry = Assert.Single(PluginLoader.Discover(_root));

        Assert.Equal(PluginState.Failed, entry.State);
        Assert.Equal("just-a-folder", entry.DisplayName);
    }

    [Fact]
    public void A_manifest_cannot_point_outside_its_own_folder()
    {
        InstallSample("escape", manifest => manifest.Replace("\"SizeViewer.dll\"", "\"../elsewhere/SizeViewer.dll\""));

        var entry = Assert.Single(PluginLoader.Discover(_root));
        PluginLoader.Load(entry);

        Assert.Equal(PluginState.Failed, entry.State);
        Assert.Empty(entry.Viewers);
    }

    [Fact]
    public void A_missing_plugins_folder_is_an_empty_list()
        => Assert.Empty(PluginLoader.Discover(Path.Combine(_root, "does-not-exist")));

    /// <summary>
    /// Copies the sample's DLL and its real plugin.json - both land beside the tests,
    /// because the test project references the sample - into a folder of its own.
    /// </summary>
    private void InstallSample(string folderName, Func<string, string>? editManifest = null)
    {
        var folder = Directory.CreateDirectory(Path.Combine(_root, folderName)).FullName;
        var here = AppContext.BaseDirectory;

        File.Copy(Path.Combine(here, "SizeViewer.dll"), Path.Combine(folder, "SizeViewer.dll"));

        var manifest = File.ReadAllText(Path.Combine(here, PluginLoader.ManifestFile));
        File.WriteAllText(Path.Combine(folder, PluginLoader.ManifestFile), editManifest?.Invoke(manifest) ?? manifest);
    }
}
