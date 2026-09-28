using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace Omnigit.Services;

public enum PackageChangeKind
{
    Updated,
    Added,
    Removed,
}

/// <summary>One package whose resolved version moved, appeared or went away.</summary>
public sealed record PackageChange(string Name, PackageChangeKind Kind, string Before, string After)
{
    /// <summary>
    /// The first number moved - the semver promise that something may break. Worth a
    /// different colour, because it is the one row in a hundred-line update someone
    /// reviewing it needs to stop at.
    /// </summary>
    public bool IsMajor => Kind == PackageChangeKind.Updated && Major(Before) != Major(After);

    private static string Major(string versions)
    {
        var first = versions.Split(',')[0].Trim().TrimStart('v', 'V', '=', '^', '~');
        var dot = first.IndexOfAny(['.', '-', '+']);
        return dot < 0 ? first : first[..dot];
    }
}

/// <summary>
/// Reads the lockfiles package managers write and says which packages changed version.
/// </summary>
/// <remarks>
/// <para>
/// A lockfile diff is the least readable thing in a repository: bumping one dependency
/// rewrites hundreds of lines of hashes and URLs, and the question a reviewer has - what
/// actually moved - is answered nowhere on the page. Each format is reduced to the same
/// thing, package name to the versions resolved, and the two sides compared.
/// </para>
/// <para>
/// A package can be resolved at more than one version at once (npm nests them, Cargo
/// allows two majors side by side), so each name maps to a set and an update shows the
/// whole set on each side.
/// </para>
/// <para>
/// None of this throws on a malformed file. A reader that cannot make sense of one
/// returns null and the viewer says to switch to the text view, which is what someone
/// would do anyway.
/// </para>
/// </remarks>
public static class Lockfiles
{
    private static readonly Dictionary<string, Func<string, Packages?>> Readers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["package-lock.json"] = ReadNpm,
        ["npm-shrinkwrap.json"] = ReadNpm,
        ["yarn.lock"] = ReadYarn,
        ["pnpm-lock.yaml"] = ReadPnpm,
        ["Cargo.lock"] = ReadTomlPackages,
        ["poetry.lock"] = ReadTomlPackages,
        ["uv.lock"] = ReadTomlPackages,
        ["Gemfile.lock"] = ReadGemfile,
        ["composer.lock"] = ReadComposer,
        ["packages.lock.json"] = ReadNuGet,
        ["go.sum"] = ReadGoSum,
        ["Pipfile.lock"] = ReadPipfile,
    };

    /// <summary>The file names this understands, for the viewer's match.</summary>
    public static bool IsLockfile(string path) => Readers.ContainsKey(Path.GetFileName(path));

    /// <summary>
    /// Package name to its resolved versions, or null when the file cannot be read as the
    /// format its name promises. An empty or missing side is an empty set, not a failure:
    /// that is an added or deleted lockfile.
    /// </summary>
    public static IReadOnlyDictionary<string, SortedSet<string>>? Read(string path, string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return new Packages();

        if (!Readers.TryGetValue(Path.GetFileName(path), out var reader))
            return null;

        try
        {
            return reader(text);
        }
        catch (Exception ex) when (ex is JsonException or FormatException or InvalidOperationException
                                       or KeyNotFoundException or ArgumentException or IndexOutOfRangeException)
        {
            return null;
        }
    }

    /// <summary>Every package that changed, updates first, then additions, then removals, each by name.</summary>
    public static List<PackageChange>? Compare(string path, string? before, string? after)
    {
        if (Read(path, before) is not { } old || Read(path, after) is not { } now)
            return null;

        var changes = new List<PackageChange>();

        foreach (var name in old.Keys.Union(now.Keys, StringComparer.Ordinal))
        {
            var had = old.TryGetValue(name, out var o) ? o : null;
            var has = now.TryGetValue(name, out var n) ? n : null;

            if (had is null)
                changes.Add(new PackageChange(name, PackageChangeKind.Added, string.Empty, Join(has!)));
            else if (has is null)
                changes.Add(new PackageChange(name, PackageChangeKind.Removed, Join(had), string.Empty));
            else if (!had.SetEquals(has))
                changes.Add(new PackageChange(name, PackageChangeKind.Updated, Join(had), Join(has)));
        }

        return changes
            .OrderBy(c => c.Kind)
            .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string Join(SortedSet<string> versions) => string.Join(", ", versions);

    private sealed class Packages : Dictionary<string, SortedSet<string>>
    {
        public Packages() : base(StringComparer.Ordinal) { }

        public void Add(string? name, string? version)
        {
            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(version))
                return;

            if (!TryGetValue(name, out var set))
                this[name] = set = new SortedSet<string>(StringComparer.Ordinal);

            set.Add(version.Trim());
        }
    }

    // ---- JSON formats ---------------------------------------------------------

    /// <summary>
    /// npm 7+ lists every installed path under <c>packages</c>, keyed
    /// <c>node_modules/a/node_modules/b</c>; npm 6 nests <c>dependencies</c> instead.
    /// Both are read, since a v2 file carries both and a v1 file only the second.
    /// </summary>
    private static Packages? ReadNpm(string text)
    {
        using var doc = JsonDocument.Parse(text);
        var packages = new Packages();
        var root = doc.RootElement;

        if (root.TryGetProperty("packages", out var paths) && paths.ValueKind == JsonValueKind.Object)
        {
            foreach (var entry in paths.EnumerateObject())
            {
                var at = entry.Name.LastIndexOf("node_modules/", StringComparison.Ordinal);
                if (at < 0 || entry.Value.ValueKind != JsonValueKind.Object)
                    continue; // "" is the project itself

                packages.Add(entry.Name[(at + "node_modules/".Length)..], String(entry.Value, "version"));
            }

            return packages;
        }

        if (root.TryGetProperty("dependencies", out var nested))
            WalkNpmV1(nested, packages);

        return packages;
    }

    private static void WalkNpmV1(JsonElement dependencies, Packages packages)
    {
        if (dependencies.ValueKind != JsonValueKind.Object)
            return;

        foreach (var dependency in dependencies.EnumerateObject())
        {
            packages.Add(dependency.Name, String(dependency.Value, "version"));

            if (dependency.Value.ValueKind == JsonValueKind.Object
                && dependency.Value.TryGetProperty("dependencies", out var inner))
                WalkNpmV1(inner, packages);
        }
    }

    private static Packages? ReadComposer(string text)
    {
        using var doc = JsonDocument.Parse(text);
        var packages = new Packages();

        foreach (var section in new[] { "packages", "packages-dev" })
        {
            if (!doc.RootElement.TryGetProperty(section, out var list) || list.ValueKind != JsonValueKind.Array)
                continue;

            foreach (var package in list.EnumerateArray())
                packages.Add(String(package, "name"), String(package, "version"));
        }

        return packages;
    }

    /// <summary>NuGet's lock file: one block per target framework, each naming what it resolved.</summary>
    private static Packages? ReadNuGet(string text)
    {
        using var doc = JsonDocument.Parse(text);
        var packages = new Packages();

        if (!doc.RootElement.TryGetProperty("dependencies", out var frameworks) || frameworks.ValueKind != JsonValueKind.Object)
            return packages;

        foreach (var framework in frameworks.EnumerateObject())
        {
            if (framework.Value.ValueKind != JsonValueKind.Object)
                continue;

            foreach (var package in framework.Value.EnumerateObject())
            {
                // Projects in the same solution appear as "type": "Project" with no
                // version worth reporting.
                packages.Add(package.Name, String(package.Value, "resolved"));
            }
        }

        return packages;
    }

    private static Packages? ReadPipfile(string text)
    {
        using var doc = JsonDocument.Parse(text);
        var packages = new Packages();

        foreach (var section in new[] { "default", "develop" })
        {
            if (!doc.RootElement.TryGetProperty(section, out var list) || list.ValueKind != JsonValueKind.Object)
                continue;

            foreach (var package in list.EnumerateObject())
                packages.Add(package.Name, String(package.Value, "version")?.TrimStart('='));
        }

        return packages;
    }

    private static string? String(JsonElement element, string property)
        => element.ValueKind == JsonValueKind.Object
           && element.TryGetProperty(property, out var value)
           && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    // ---- Line formats ---------------------------------------------------------

    /// <summary>
    /// Yarn 1 and Yarn 2+ both write one block per set of specifiers:
    /// <c>"lodash@^4.17.0", lodash@^4.17.21:</c> then an indented <c>version "4.17.21"</c>
    /// (Yarn 1) or <c>version: 4.17.21</c> (Berry).
    /// </summary>
    private static Packages? ReadYarn(string text)
    {
        var packages = new Packages();
        string? current = null;

        foreach (var raw in Lines(text))
        {
            if (raw.Length == 0 || raw[0] == '#')
                continue;

            if (!char.IsWhiteSpace(raw[0]))
            {
                var first = raw.TrimEnd(':').Split(',')[0].Trim().Trim('"');
                current = first == "__metadata" ? null : PackageName(first);
                continue;
            }

            var line = raw.Trim();
            if (current is not null && line.StartsWith("version", StringComparison.Ordinal))
            {
                var version = line["version".Length..].TrimStart(':', ' ').Trim('"');
                packages.Add(current, version);
                current = null;
            }
        }

        return packages;
    }

    /// <summary>
    /// pnpm keys its <c>packages:</c> map by <c>name@version</c> - with a leading slash
    /// before v9, and with peer-dependency suffixes in brackets that are not part of the
    /// version. v9 also has a <c>snapshots:</c> map repeating the same keys, which is
    /// ignored so nothing is counted twice.
    /// </summary>
    private static Packages? ReadPnpm(string text)
    {
        var packages = new Packages();
        var inPackages = false;

        foreach (var raw in Lines(text))
        {
            if (raw.Length == 0 || raw.TrimStart().StartsWith('#'))
                continue;

            if (!char.IsWhiteSpace(raw[0]))
            {
                inPackages = raw.TrimEnd() == "packages:";
                continue;
            }

            // Exactly two spaces: an entry. Deeper lines are that entry's own fields.
            if (!inPackages || raw.Length < 3 || raw[0] != ' ' || raw[1] != ' ' || raw[2] == ' ')
                continue;

            var key = raw.Trim().TrimEnd(':').Trim('\'', '"').TrimStart('/');
            var bracket = key.IndexOf('(');
            if (bracket > 0)
                key = key[..bracket];

            var at = key.LastIndexOf('@');
            if (at > 0)
                packages.Add(key[..at], key[(at + 1)..]);
        }

        return packages;
    }

    /// <summary>
    /// Cargo, Poetry and uv all write <c>[[package]]</c> tables with a <c>name</c> and
    /// a <c>version</c>. A full TOML parser would read the same two keys, much slower.
    /// </summary>
    private static Packages? ReadTomlPackages(string text)
    {
        var packages = new Packages();
        string? name = null, version = null;
        var inPackage = false;

        void Flush()
        {
            if (inPackage)
                packages.Add(name, version);
            name = version = null;
        }

        foreach (var raw in Lines(text))
        {
            var line = raw.Trim();

            if (line.StartsWith('['))
            {
                // A sub-table such as [package.dependencies] still belongs to the
                // package above it; only a new [[package]] or another top-level table
                // ends it.
                if (line.StartsWith("[package.", StringComparison.Ordinal))
                    continue;

                Flush();
                inPackage = line == "[[package]]";
                continue;
            }

            if (!inPackage)
                continue;

            if (TomlString(line, "name") is { } n && name is null)
                name = n;
            else if (TomlString(line, "version") is { } v && version is null)
                version = v;
        }

        Flush();
        return packages;
    }

    private static string? TomlString(string line, string key)
    {
        if (!line.StartsWith(key, StringComparison.Ordinal))
            return null;

        var rest = line[key.Length..].TrimStart();
        if (!rest.StartsWith('='))
            return null;

        return rest[1..].Trim().Trim('"', '\'');
    }

    /// <summary>
    /// Bundler lists each gem under <c>specs:</c> at four spaces as <c>name (version)</c>;
    /// its own dependencies follow at six and are not resolutions.
    /// </summary>
    private static Packages? ReadGemfile(string text)
    {
        var packages = new Packages();
        var inSpecs = false;

        foreach (var raw in Lines(text))
        {
            if (raw.Length > 0 && !char.IsWhiteSpace(raw[0]))
            {
                inSpecs = false;
                continue;
            }

            if (raw.Trim() == "specs:")
            {
                inSpecs = true;
                continue;
            }

            if (!inSpecs || !raw.StartsWith("    ", StringComparison.Ordinal) || raw.StartsWith("     ", StringComparison.Ordinal))
                continue;

            var line = raw.Trim();
            var open = line.IndexOf(" (", StringComparison.Ordinal);
            if (open > 0 && line.EndsWith(')'))
                packages.Add(line[..open], line[(open + 2)..^1]);
        }

        return packages;
    }

    /// <summary>
    /// <c>module version hash</c>, twice per version - once for the module and once,
    /// with <c>/go.mod</c>, for its manifest alone. Only the first names a version that
    /// is actually built; a module listed only by its go.mod was consulted and not used.
    /// </summary>
    private static Packages? ReadGoSum(string text)
    {
        var packages = new Packages();

        foreach (var line in Lines(text))
        {
            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2 && !parts[1].EndsWith("/go.mod", StringComparison.Ordinal))
                packages.Add(parts[0], parts[1]);
        }

        return packages;
    }

    /// <summary>
    /// The name out of a specifier: <c>lodash@^4</c>, <c>@babel/core@7.2</c>,
    /// <c>react@npm:^18</c>. The first <c>@</c> after the first character separates it -
    /// not the first overall, since a scoped name starts with one, and not the last, since
    /// a range can hold another (<c>npm:@scope/x@1</c>).
    /// </summary>
    private static string? PackageName(string specifier)
    {
        var at = specifier.IndexOf('@', 1);
        return at > 0 ? specifier[..at] : null;
    }

    private static IEnumerable<string> Lines(string text)
        => text.Split('\n').Select(l => l.TrimEnd('\r'));
}
