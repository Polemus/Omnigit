namespace Omnigit.Plugins;

/// <summary>The version of this SDK, which a plugin states in its <c>plugin.json</c>.</summary>
/// <remarks>
/// Only the major number is compared. A plugin built against a newer major version is
/// refused rather than loaded, because it may call something this copy of Omnigit does
/// not have, and that would fail somewhere in the middle of drawing a diff instead of
/// once, at load, with a sentence saying why. Minor versions only ever add.
/// </remarks>
public static class PluginApi
{
    public const int Major = 1;
    public const int Minor = 0;

    public static string Version => $"{Major}.{Minor}";
}
