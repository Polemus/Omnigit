using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// Covers the rewrite that turns the packaged desktop entry into one that points at
/// an AppImage. The rest of DesktopIntegration is filesystem work behind an
/// APPIMAGE environment variable, so there is nothing to run here without one.
/// </summary>
public class DesktopIntegrationTests
{
    private const string Packaged = """
        # Named after the app id rather than the binary.
        [Desktop Entry]
        Type=Application
        Name=Omnigit
        Exec=omnigit
        Icon=io.github.polemus.Omnigit
        Terminal=false
        StartupWMClass=Omnigit
        """;

    private static string[] Lines(string entry) =>
        entry.TrimEnd('\n').Split('\n');

    [Fact]
    public void Localise_points_exec_at_the_appimage()
    {
        var result = DesktopIntegration.Localise(Packaged, "/home/u/Apps/Omnigit.AppImage");

        Assert.Contains("Exec=/home/u/Apps/Omnigit.AppImage", Lines(result));
        Assert.DoesNotContain("Exec=omnigit", Lines(result));
    }

    [Fact]
    public void Localise_keeps_the_keys_the_shell_matches_on()
    {
        var result = Lines(DesktopIntegration.Localise(Packaged, "/opt/Omnigit.AppImage"));

        // Icon= is what stops the cog; StartupWMClass is what ties the running
        // window to this entry in the first place.
        Assert.Contains("Icon=io.github.polemus.Omnigit", result);
        Assert.Contains("StartupWMClass=Omnigit", result);
        Assert.Contains("[Desktop Entry]", result);
    }

    [Fact]
    public void Localise_adds_tryexec_so_a_deleted_appimage_hides_the_entry()
    {
        var result = Lines(DesktopIntegration.Localise(Packaged, "/opt/Omnigit.AppImage"));

        Assert.Contains("TryExec=/opt/Omnigit.AppImage", result);
    }

    [Fact]
    public void Localise_replaces_rather_than_repeats_when_run_over_its_own_output()
    {
        var once = DesktopIntegration.Localise(Packaged, "/old/Omnigit.AppImage");
        var twice = DesktopIntegration.Localise(once, "/new/Omnigit.AppImage");

        Assert.Single(Lines(twice), l => l.StartsWith("Exec="));
        Assert.Single(Lines(twice), l => l.StartsWith("TryExec="));
        Assert.Contains("Exec=/new/Omnigit.AppImage", Lines(twice));
    }

    [Fact]
    public void Localise_appends_inside_the_group_when_the_source_ends_blank()
    {
        var result = Lines(DesktopIntegration.Localise("[Desktop Entry]\nName=Omnigit\n\n\n", "/o/G.AppImage"));

        // A key after a blank line is still in the group, but a key after a *second*
        // group header would not be - keep them adjacent to what they belong to.
        Assert.Equal(
            Array.IndexOf(result, "Name=Omnigit") + 1,
            Array.IndexOf(result, "Exec=/o/G.AppImage"));
    }

    [Fact]
    public void Localise_drops_the_packaged_comments_and_keeps_the_group_first()
    {
        var result = Lines(DesktopIntegration.Localise(Packaged, "/o/G.AppImage"));

        // They describe Exec=omnigit, which is exactly what this rewrite undoes.
        Assert.DoesNotContain(result, l => l.Contains("Named after the app id"));

        // A stray "# Exec=..." must not be mistaken for the real key either way.
        Assert.Equal("[Desktop Entry]", result.First(l => !l.StartsWith('#') && l.Length > 0));
    }

    // ---- refreshing the installed icons ------------------------------------
    //
    // The desktop entry names only the AppImage, so a build whose artwork changed
    // while its path did not writes an identical entry. Deciding "already current"
    // from that alone left the old icon installed with no way to ever replace it.

    private static string AppDirWithIcon(string contents)
    {
        var root = Path.Combine(Path.GetTempPath(), "omnigit-tests", Guid.NewGuid().ToString("n"));
        var icons = Path.Combine(root, "usr", "share", "icons", "hicolor", "256x256", "apps");
        Directory.CreateDirectory(icons);
        File.WriteAllText(Path.Combine(icons, $"{DesktopIntegration.AppId}.png"), contents);
        return root;
    }

    [Fact]
    public void CopyIcons_replaces_an_icon_whose_contents_changed()
    {
        var appDir = AppDirWithIcon("old pixels");
        var dataHome = Path.Combine(Path.GetTempPath(), "omnigit-tests", Guid.NewGuid().ToString("n"));
        var installed = Path.Combine(
            dataHome, "icons", "hicolor", "256x256", "apps", $"{DesktopIntegration.AppId}.png");

        try
        {
            Assert.Equal(1, DesktopIntegration.CopyIcons(appDir, dataHome));
            Assert.Equal("old pixels", File.ReadAllText(installed));

            // Nothing changed, so nothing is written - which is what tells the caller
            // the installation is up to date.
            Assert.Equal(0, DesktopIntegration.CopyIcons(appDir, dataHome));

            File.WriteAllText(
                Path.Combine(appDir, "usr", "share", "icons", "hicolor", "256x256", "apps",
                    $"{DesktopIntegration.AppId}.png"),
                "new pixels");

            Assert.Equal(1, DesktopIntegration.CopyIcons(appDir, dataHome));
            Assert.Equal("new pixels", File.ReadAllText(installed));
        }
        finally
        {
            Directory.Delete(appDir, recursive: true);
            Directory.Delete(dataHome, recursive: true);
        }
    }

    [Theory]
    [InlineData("/opt/Omnigit.AppImage", "/opt/Omnigit.AppImage")]
    [InlineData("/home/u/My Apps/Omnigit.AppImage", "\"/home/u/My Apps/Omnigit.AppImage\"")]
    [InlineData("/home/u/$HOME/G.AppImage", "\"/home/u/\\$HOME/G.AppImage\"")]
    [InlineData("/home/u/a\"b/G.AppImage", "\"/home/u/a\\\"b/G.AppImage\"")]
    public void QuoteExec_follows_the_desktop_entry_rules(string path, string expected)
    {
        Assert.Equal(expected, DesktopIntegration.QuoteExec(path));
    }
}
