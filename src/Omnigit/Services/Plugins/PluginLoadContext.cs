using System;
using System.IO;
using System.Reflection;
using System.Runtime.Loader;

namespace Omnigit.Services.Plugins;

/// <summary>
/// Where one plugin's assemblies are loaded, so two plugins can each bring their own
/// version of the same library without meeting.
/// </summary>
/// <remarks>
/// <para>
/// The SDK and Avalonia are deliberately <b>not</b> loaded here. A type is identified by
/// the assembly that loaded it, so a plugin holding its own copy of Omnigit.Plugins.dll
/// would define an <c>IChangeViewer</c> that is not ours - every plugin would load
/// cleanly and none of its viewers would ever be found. Avalonia is shared for the same
/// reason, twice over: a control built from a second copy cannot be put in our window.
/// Returning null hands those names back to the default context, which has them.
/// </para>
/// <para>
/// Not collectible. A plugin's controls are on screen and referenced from all over the
/// visual tree, so unloading one reliably is not something the runtime can promise;
/// switching a plugin off takes effect at the next launch instead.
/// </para>
/// </remarks>
internal sealed class PluginLoadContext : AssemblyLoadContext
{
    private readonly string _folder;
    private readonly AssemblyDependencyResolver? _resolver;

    public PluginLoadContext(string mainAssembly)
        : base(name: $"plugin:{mainAssembly}", isCollectible: false)
    {
        _folder = Path.GetDirectoryName(mainAssembly)!;

        // The resolver reads the plugin's .deps.json through the host, and a macOS build
        // is published single-file, where that host is not the one the resolver expects.
        // Unverified either way - there is no Mac - so rather than find out from a user,
        // a failure here falls back to looking for the DLL by name in the plugin's
        // folder, which is all a plugin without native dependencies needs.
        try
        {
            _resolver = new AssemblyDependencyResolver(mainAssembly);
        }
        catch (Exception ex) when (ex is InvalidOperationException or DllNotFoundException or ArgumentException)
        {
            _resolver = null;
        }
    }

    internal static bool IsShared(AssemblyName name)
        => name.Name is { } n
           && (n == "Omnigit.Plugins"
               || n == "Avalonia"
               || n.StartsWith("Avalonia.", StringComparison.Ordinal));

    protected override Assembly? Load(AssemblyName name)
    {
        if (IsShared(name) || name.Name is not { } simple)
            return null;

        var path = _resolver?.ResolveAssemblyToPath(name) ?? InFolder(simple + ".dll");
        return path is null ? null : LoadFromAssemblyPath(path);
    }

    protected override IntPtr LoadUnmanagedDll(string name)
        => (_resolver?.ResolveUnmanagedDllToPath(name) ?? InFolder(name)) is { } path
            ? LoadUnmanagedDllFromPath(path)
            : IntPtr.Zero;

    private string? InFolder(string fileName)
    {
        var path = Path.Combine(_folder, fileName);
        return File.Exists(path) ? path : null;
    }
}
