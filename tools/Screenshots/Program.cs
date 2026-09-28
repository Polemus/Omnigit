using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Styling;
using Avalonia.Threading;
using Omnigit;
using Omnigit.HostProviders;
using Omnigit.Services;
using Omnigit.ViewModels;
using Omnigit.Views;

namespace Screenshots;

/// <summary>
/// Opens Omnigit headless against a config directory of its own and saves one PNG per
/// scene. Run it through <c>tools/Screenshots/run.sh</c>, which points
/// <c>XDG_CONFIG_HOME</c> at that directory - otherwise this would open whatever
/// repositories the person running it has, and put them in the README.
/// </summary>
public static class Program
{
    public const int Width = 1440;
    public const int Height = 900;

    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.Error.WriteLine("usage: Screenshots <output-dir> [scene ...]");
            return 2;
        }

        var output = Path.GetFullPath(args[0]);
        Directory.CreateDirectory(output);

        AppBuilder.Configure<App>()
            .UseSkia()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = false })
            .SetupWithoutStarting();

        var failures = 0;
        using var done = new CancellationTokenSource();

        Dispatcher.UIThread.Post(async () =>
        {
            try
            {
                failures = await Scenes.RunAsync(output, args.Skip(1).ToHashSet());
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex);
                failures = -1;
            }
            finally
            {
                done.Cancel();
            }
        });

        Dispatcher.UIThread.MainLoop(done.Token);
        return failures == 0 ? 0 : 1;
    }

    /// <summary>The same services App wires up, with nothing that would open a real window.</summary>
    public static MainWindowViewModel CreateViewModel(out IActivityLog log)
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        var credentials = CredentialStoreFactory.Create();
        log = new ActivityLog();

        return new MainWindowViewModel(
            new GitService(),
            new RepositoryStore(),
            new FolderPicker(),
            HostProviderRegistry.Create(http),
            new AccountStore(credentials),
            credentials,
            log,
            new SystemShell(),
            new RepositoryWatcher(),
            new UpdateService(),
            new SettingsStore());
    }

    public static void Theme(ThemeVariant variant)
    {
        if (Application.Current is { } app)
            app.RequestedThemeVariant = variant;
    }
}
