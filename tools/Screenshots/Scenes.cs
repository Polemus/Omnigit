using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Styling;
using Avalonia.Threading;
using Omnigit.Models;
using Omnigit.ViewModels;
using Omnigit.Views;

namespace Screenshots;

/// <summary>
/// Each README screenshot, as the steps that put the app into that state. A scene that
/// cannot find what it needs says so and is skipped, rather than saving a picture of the
/// wrong thing under the right name.
/// </summary>
public static class Scenes
{
    private sealed record Scene(string Name, Func<Task<bool>> Prepare, Func<Task>? After = null);

    public static async Task<int> RunAsync(string output, HashSet<string> only)
    {
        var root = Environment.GetEnvironmentVariable("SCREENSHOT_REPOS")
                   ?? throw new InvalidOperationException("SCREENSHOT_REPOS is not set - run this through run.sh.");
        var playground = Environment.GetEnvironmentVariable("SCREENSHOT_PLAYGROUND")
                         ?? throw new InvalidOperationException("SCREENSHOT_PLAYGROUND is not set - run this through run.sh.");

        var omnigit = Path.Combine(root, "Omnigit");
        var storefront = Path.Combine(root, "storefront");

        var vm = Program.CreateViewModel(out _);
        var window = new MainWindow { DataContext = vm, Width = Program.Width, Height = Program.Height };
        window.Show();

        await vm.InitialiseAsync();
        await Settle(2000);

        var branchPicker = window.FindControl<Button>("BranchPickerButton");

        async Task<bool> Open(string path, int tab = 0)
        {
            if (vm.Repositories.FirstOrDefault(r => r.LocalPath.TrimEnd('/') == path.TrimEnd('/')) is not { } repository)
                return Missing($"repository {path}");

            vm.ShowRepositoryCommand.Execute(null);
            if (vm.SelectedRepository?.LocalPath != repository.LocalPath)
                await vm.SelectRepositoryCommand.ExecuteAsync(repository);

            vm.SelectedTabIndex = tab;
            await Settle(2500);
            return true;
        }

        async Task<bool> Change(string path, string? viewer = null)
        {
            if (vm.Changes.FirstOrDefault(c => c.Path == path) is not { } change)
                return Missing($"change {path}");

            vm.SelectedChange = change;
            await Settle(300);

            if (viewer is not null)
            {
                if (vm.ChangeViewer?.Viewers.FirstOrDefault(v => v.Name == viewer) is not { } option)
                    return Missing($"viewer {viewer} for {path}");
                vm.ChangeViewer.SelectedViewer = option;
            }

            await Settle(1500);
            return true;
        }

        var scenes = new List<Scene>
        {
            new("changes-dark", async () => await Open(playground) && await Change("src/pricing.cs", "Text")),
            new("side-by-side-dark", async () => await Open(playground) && await Change("src/pricing.cs", "Side by side"),
                After: async () => await Change("src/pricing.cs", "Text")),
            new("viewer-image-dark", async () => await Open(playground) && await Change("images/large.png", "Image")),
            new("viewer-svg-dark", async () => await Open(playground) && await Change("web/icon.svg", "Image")),
            new("viewer-packages-dark", async () => await Open(playground) && await Change("web/package-lock.json", "Packages")),
            new("viewer-table-dark", async () => await Open(playground) && await Change("data/products.csv", "Table")),
            new("viewer-markdown-dark", async () => await Open(playground) && await Change("GUIDE.md", "Rendered")),

            new("pull-requests-dark", async () =>
            {
                if (!await Open(playground) || branchPicker?.Flyout is not { } flyout)
                    return Missing("the branch picker");

                flyout.ShowAt(branchPicker);
                await vm.ShowPullRequestsTabCommand.ExecuteAsync(null);
                await Settle(3000);
                return vm.PullRequests.Count > 0 || Missing("any open pull requests");
            }, After: async () =>
            {
                branchPicker?.Flyout?.Hide();
                vm.ShowBranchesTabCommand.Execute(null);
                await Settle(300);
            }),

            new("history-dark", async () =>
            {
                if (!await Open(omnigit, tab: 1))
                    return false;

                // The newest commit: selecting an older one scrolls the list to it and
                // hides the top of the history, which is the part worth showing.
                var commit = vm.History.FirstOrDefault();
                if (commit is null)
                    return Missing("any history");

                vm.SelectedCommit = commit;
                await Settle(1500);

                vm.SelectedCommitFile = vm.SelectedCommitFiles.FirstOrDefault(f => f.Path.EndsWith(".cs"))
                                        ?? vm.SelectedCommitFiles.FirstOrDefault();
                await Settle(1000);
                return true;
            }),

            new("graph-dark", async () =>
            {
                if (!await Open(omnigit, tab: 1))
                    return false;

                await vm.ShowGraphCommand.ExecuteAsync(null);
                await Settle(3000);
                return vm.GraphCommits.Count > 0 || Missing("the commit graph");
            }, After: async () =>
            {
                vm.CloseGraphCommand.Execute(null);
                await Settle(300);
            }),

            new("conflicts-dark", async () => await Open(storefront) && await Change("src/cart.js")),

            new("repository-picker", async () =>
            {
                if (!await Open(playground))
                    return false;

                vm.IsRepositoryPickerOpen = true;
                await Settle(800);
                return true;
            }, After: async () =>
            {
                vm.IsRepositoryPickerOpen = false;
                await Settle(300);
            }),

            new("new-repository-dark", async () =>
            {
                if (!await Open(playground))
                    return false;

                vm.ShowNewRepositoryCommand.Execute(null);
                if (vm.NewRepositoryDraft is not { } draft)
                    return Missing("the new-repository form");

                draft.Name = "recipes";
                draft.Description = "Things worth cooking twice";
                draft.ParentPath = Path.GetDirectoryName(root) ?? root;
                draft.GitignoreName = draft.GitignoreNames.FirstOrDefault(n => n == "Node") ?? draft.GitignoreName;
                draft.Licence = NewRepositoryViewModel.Licences.FirstOrDefault(l => l.Id.Contains("mit", StringComparison.OrdinalIgnoreCase))
                                ?? draft.Licence;
                draft.Publish.Target = draft.Publish.Targets.FirstOrDefault(t => t.Account?.ProviderId == "gitea")
                                       ?? draft.Publish.Target;
                await Settle(2500);
                return true;
            }, After: async () =>
            {
                vm.CancelNewRepositoryCommand.Execute(null);
                await Settle(300);
            }),

            new("settings-plugins-dark", async () =>
            {
                vm.ShowSettingsCommand.Execute(null);
                vm.ShowSettingsSectionCommand.Execute(4);
                await Settle(800);
                return vm.Plugins.Plugins.Count > 0 || Missing("an installed plugin");
            }, After: async () =>
            {
                vm.ShowRepositoryCommand.Execute(null);
                await Settle(300);
            }),

            // Last, because it changes the theme under everything after it.
            new("changes-light", async () =>
            {
                Program.Theme(ThemeVariant.Light);
                return await Open(playground) && await Change("src/pricing.cs", "Text");
            }, After: async () =>
            {
                Program.Theme(ThemeVariant.Dark);
                await Settle(300);
            }),
        };

        var failures = 0;

        foreach (var scene in scenes)
        {
            if (only.Count > 0 && !only.Contains(scene.Name))
                continue;

            if (await scene.Prepare())
                Capture(window, output, scene.Name);
            else
            {
                Console.Error.WriteLine($"  skipped {scene.Name}");
                failures++;
            }

            if (scene.After is not null)
                await scene.After();
        }

        return failures;
    }

    private static bool Missing(string what)
    {
        Console.Error.WriteLine($"  could not find {what}");
        return false;
    }

    /// <summary>Lets async loads, bindings and layout finish. The dispatcher keeps running meanwhile.</summary>
    public static async Task Settle(int milliseconds = 400)
    {
        await Task.Delay(milliseconds);
        await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);
    }

    private static void Capture(Window window, string output, string name)
    {
        // Two ticks: the first lays out and renders what the last await changed, the
        // second picks up anything that only measured correctly once the first had run.
        AvaloniaHeadlessPlatform.ForceRenderTimerTick();
        AvaloniaHeadlessPlatform.ForceRenderTimerTick();

        var frame = window.CaptureRenderedFrame()
                    ?? throw new InvalidOperationException("Nothing was rendered.");

        frame.Save(Path.Combine(output, name + ".png"));
        Console.WriteLine($"  {name}.png");
    }
}
