namespace Omnigit.Plugins;

/// <summary>What happened to a file, in the terms a viewer needs to choose itself.</summary>
public enum ChangeKind
{
    Added,
    Modified,
    Deleted,
    Renamed,
    Conflicted,
}

/// <summary>
/// One changed file, without its content. This is all <see cref="IChangeViewer.Match"/>
/// is given, so matching is cheap and never reads a file.
/// </summary>
/// <param name="Path">Repository-relative, with forward slashes.</param>
/// <param name="OldPath">The path before a rename, or null when it was not renamed.</param>
public sealed record ChangeInfo(string Path, string? OldPath, ChangeKind Kind)
{
    /// <summary>The extension without its dot, lower case, or empty. <c>"png"</c>, not <c>".PNG"</c>.</summary>
    public string Extension
    {
        get
        {
            var name = Path[(Path.LastIndexOf('/') + 1)..];
            var dot = name.LastIndexOf('.');
            return dot > 0 && dot < name.Length - 1
                ? name[(dot + 1)..].ToLowerInvariant()
                : string.Empty;
        }
    }
}
