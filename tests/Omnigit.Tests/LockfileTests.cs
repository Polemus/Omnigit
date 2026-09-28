using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// One fixture per format, written the way each tool writes it. The shapes differ in the
/// places that matter - nesting, scoped names, peer suffixes, dependencies listed beside
/// resolutions - and each test pins the one a naive reader would get wrong.
/// </summary>
public class LockfileTests
{
    private static Dictionary<string, string> Versions(string path, string text)
        => Lockfiles.Read(path, text)!.ToDictionary(p => p.Key, p => string.Join(",", p.Value));

    [Fact]
    public void Npm_v3_reads_packages_by_install_path_including_nested_copies()
    {
        const string lockfile = """
            {
              "lockfileVersion": 3,
              "packages": {
                "": { "name": "app", "version": "1.0.0" },
                "node_modules/react": { "version": "18.2.0" },
                "node_modules/@babel/core": { "version": "7.24.0" },
                "node_modules/a/node_modules/react": { "version": "17.0.2" }
              }
            }
            """;

        var versions = Versions("package-lock.json", lockfile);

        Assert.Equal("17.0.2,18.2.0", versions["react"]);
        Assert.Equal("7.24.0", versions["@babel/core"]);
        Assert.DoesNotContain("app", versions.Keys);
    }

    [Fact]
    public void Npm_v1_walks_nested_dependencies()
    {
        const string lockfile = """
            { "lockfileVersion": 1, "dependencies": {
                "left-pad": { "version": "1.3.0", "dependencies": { "tiny": { "version": "0.1.0" } } } } }
            """;

        var versions = Versions("package-lock.json", lockfile);

        Assert.Equal("1.3.0", versions["left-pad"]);
        Assert.Equal("0.1.0", versions["tiny"]);
    }

    [Fact]
    public void Yarn_classic_and_berry_both_name_the_package_from_the_first_specifier()
    {
        const string classic = """
            # yarn lockfile v1

            "@types/node@^20", "@types/node@^20.1":
              version "20.11.5"
              resolved "https://registry.yarnpkg.com/..."

            lodash@^4.17.21:
              version "4.17.21"
            """;

        const string berry = """
            __metadata:
              version: 8

            "react@npm:^18.2.0":
              version: 18.3.1
              resolution: "react@npm:18.3.1"
            """;

        Assert.Equal("20.11.5", Versions("yarn.lock", classic)["@types/node"]);
        Assert.Equal("4.17.21", Versions("yarn.lock", classic)["lodash"]);
        Assert.Equal(["react"], Versions("yarn.lock", berry).Keys);
        Assert.Equal("18.3.1", Versions("yarn.lock", berry)["react"]);
    }

    [Fact]
    public void Pnpm_strips_the_leading_slash_and_peer_suffixes_and_ignores_snapshots()
    {
        const string lockfile = """
            lockfileVersion: '9.0'

            packages:

              '@scope/pkg@2.0.1':
                resolution: {integrity: sha512-x}

              /old-style@1.0.0:
                resolution: {integrity: sha512-y}

              react-dom@18.3.1(react@18.3.1):
                resolution: {integrity: sha512-z}

            snapshots:

              ghost@9.9.9: {}
            """;

        var versions = Versions("pnpm-lock.yaml", lockfile);

        Assert.Equal("2.0.1", versions["@scope/pkg"]);
        Assert.Equal("1.0.0", versions["old-style"]);
        Assert.Equal("18.3.1", versions["react-dom"]);
        Assert.DoesNotContain("ghost", versions.Keys);
    }

    [Fact]
    public void Cargo_poetry_and_uv_read_package_tables_and_not_their_dependency_lists()
    {
        const string cargo = """
            version = 3

            [[package]]
            name = "serde"
            version = "1.0.197"
            dependencies = [
             "serde_derive",
            ]

            [[package]]
            name = "syn"
            version = "1.0.109"

            [[package]]
            name = "syn"
            version = "2.0.52"
            """;

        const string poetry = """
            [[package]]
            name = "requests"
            version = "2.31.0"

            [package.dependencies]
            version = "should-not-be-read"

            [metadata]
            python-versions = "^3.11"
            """;

        Assert.Equal("1.0.109,2.0.52", Versions("Cargo.lock", cargo)["syn"]);
        Assert.Equal("1.0.197", Versions("Cargo.lock", cargo)["serde"]);
        Assert.Equal("2.31.0", Versions("poetry.lock", poetry)["requests"]);
        Assert.Equal("2.31.0", Versions("uv.lock", poetry)["requests"]);
    }

    [Fact]
    public void Bundler_reads_specs_and_skips_each_gems_own_dependencies()
    {
        const string lockfile = """
            GEM
              remote: https://rubygems.org/
              specs:
                rails (7.1.3)
                  actioncable (= 7.1.3)
                rake (13.1.0)

            PLATFORMS
              ruby
            """;

        var versions = Versions("Gemfile.lock", lockfile);

        Assert.Equal(["rails", "rake"], versions.Keys.Order());
        Assert.Equal("7.1.3", versions["rails"]);
    }

    [Fact]
    public void Composer_NuGet_Pipfile_and_go_sum()
    {
        Assert.Equal("7.0.0", Versions("composer.lock",
            """{ "packages": [ { "name": "symfony/console", "version": "7.0.0" } ], "packages-dev": [] }""")["symfony/console"]);

        Assert.Equal("13.0.3", Versions("packages.lock.json",
            """{ "version": 1, "dependencies": { "net8.0": { "Newtonsoft.Json": { "type": "Direct", "resolved": "13.0.3" } } } }""")["Newtonsoft.Json"]);

        Assert.Equal("2.31.0", Versions("Pipfile.lock",
            """{ "default": { "requests": { "version": "==2.31.0" } }, "develop": {} }""")["requests"]);

        var go = Versions("go.sum", """
            golang.org/x/text v0.14.0 h1:abc=
            golang.org/x/text v0.14.0/go.mod h1:def=
            golang.org/x/net v0.20.0/go.mod h1:ghi=
            """);
        Assert.Equal("v0.14.0", go["golang.org/x/text"]);
        Assert.DoesNotContain("golang.org/x/net", go.Keys);
    }

    [Fact]
    public void Comparing_sorts_updates_then_additions_then_removals_and_flags_a_major_bump()
    {
        const string before = """{ "packages": { "node_modules/a": { "version": "1.2.0" }, "node_modules/b": { "version": "2.0.0" }, "node_modules/gone": { "version": "1.0.0" } } }""";
        const string after = """{ "packages": { "node_modules/a": { "version": "1.3.0" }, "node_modules/b": { "version": "3.0.0" }, "node_modules/new": { "version": "0.1.0" } } }""";

        var changes = Lockfiles.Compare("package-lock.json", before, after)!;

        Assert.Equal(["a", "b", "new", "gone"], changes.Select(c => c.Name));
        Assert.False(changes[0].IsMajor);
        Assert.True(changes[1].IsMajor);
        Assert.Equal((PackageChangeKind.Added, "0.1.0"), (changes[2].Kind, changes[2].After));
        Assert.Equal(PackageChangeKind.Removed, changes[3].Kind);
    }

    [Fact]
    public void An_added_lockfile_is_all_additions_and_a_broken_one_is_null_not_a_throw()
    {
        var added = Lockfiles.Compare("Cargo.lock", null, "[[package]]\nname = \"x\"\nversion = \"1.0.0\"\n")!;
        Assert.Equal(PackageChangeKind.Added, Assert.Single(added).Kind);

        Assert.Null(Lockfiles.Compare("package-lock.json", "{ not json", "{}"));
    }

    [Theory]
    [InlineData("frontend/package-lock.json", true)]
    [InlineData("Cargo.lock", true)]
    [InlineData("src/App/packages.lock.json", true)]
    [InlineData("package.json", false)]
    [InlineData("notes.lock", false)]
    public void Recognises_lockfiles_by_name_wherever_they_are(string path, bool expected)
        => Assert.Equal(expected, Lockfiles.IsLockfile(path));
}
