using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using Avalonia.Controls; // GridLength, for the resizable pane widths below.
using Avalonia.Threading; // The timer behind the background fetch.
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Omnigit.HostProviders;
using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.ViewModels;

/// <summary>
/// Drives the shell against real repositories. Every git call is pushed onto a
/// background thread; the awaits resume on the UI thread, so collection updates
/// below each await are already marshalled correctly.
/// </summary>
public partial class MainWindowViewModel : ViewModelBase
{
    private const int HistoryLimit = 100;

    private readonly IGitService _git;
    private readonly IRepositoryStore _store;
    private readonly IFolderPicker _picker;
    private readonly HostProviderRegistry _hosts;
    private readonly IAccountStore _accountStore;
    private readonly ICredentialStore _credentials;
    private readonly IActivityLog _log;
    private readonly ISystemShell _shell;
    private readonly IRepositoryWatcher _watcher;
    private readonly bool _isDesignTime;

    /// <summary>Set by an automatic refresh so the commit's file list can restore itself.</summary>
    private string? _restoreCommitFilePath;

    /// <summary>Design-time constructor. Fills the previewer from sample data only.</summary>
    public MainWindowViewModel()
        : this(new GitService(), new RepositoryStore(), new FolderPicker(),
               HostProviderRegistry.Create(new System.Net.Http.HttpClient()),
               new AccountStore(new FileCredentialStore()), new FileCredentialStore(),
               new ActivityLog(), new SystemShell(), new RepositoryWatcher(), new UpdateService(),
               new SettingsStore(), designTime: true)
    {
        LoadDesignTimeData();
    }

    public MainWindowViewModel(
        IGitService git,
        IRepositoryStore store,
        IFolderPicker picker,
        HostProviderRegistry hosts,
        IAccountStore accountStore,
        ICredentialStore credentials,
        IActivityLog log,
        ISystemShell shell,
        IRepositoryWatcher watcher,
        IUpdateService update,
        ISettingsStore settings)
        : this(git, store, picker, hosts, accountStore, credentials, log, shell, watcher, update,
               settings, designTime: false)
    {
    }

    private MainWindowViewModel(
        IGitService git,
        IRepositoryStore store,
        IFolderPicker picker,
        HostProviderRegistry hosts,
        IAccountStore accountStore,
        ICredentialStore credentials,
        IActivityLog log,
        ISystemShell shell,
        IRepositoryWatcher watcher,
        IUpdateService update,
        ISettingsStore settings,
        bool designTime)
    {
        _git = git;
        _store = store;
        _picker = picker;
        _hosts = hosts;
        _accountStore = accountStore;
        _credentials = credentials;
        _log = log;
        _shell = shell;
        _watcher = watcher;
        _isDesignTime = designTime;

        Update = new UpdateViewModel(update, log, shell, designTime);
        Language = new LanguageViewModel(settings);

        // The dot on the settings button is the only part of the update state the rest
        // of the app shows, and it lives in a view model the header does not bind to.
        Update.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(UpdateViewModel.IsUpdateAvailable))
                OnPropertyChanged(nameof(IsUpdateAvailable));
        };

        if (!designTime)
            watcher.Changed += OnRepositoryChangedOnDisk;

        // Every label this view model computes is English assembled in C#, so changing
        // language has to make all of them re-read. INPC treats a null name as "every
        // property changed", which is exactly the claim being made and saves naming the
        // hundred and fifty properties that would otherwise be listed here and go stale.
        Strings.Changed += () => OnPropertyChanged((string?)null);

        // An error the user can't see is an error they can't act on.
        log.ErrorLogged += (_, _) => IsConsoleExpanded = true;

        // The ListBox mutates this rather than replacing it, so there is no property
        // change to hang the menu's labels off - only the collection's own event.
        SelectedChanges.CollectionChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(IsOneChangeSelected));
            OnPropertyChanged(nameof(CanIgnoreFolder));
            OnPropertyChanged(nameof(CanIgnoreExtension));
            OnPropertyChanged(nameof(CanOpenSelectedChange));
            OnPropertyChanged(nameof(DiscardChangesLabel));
        };

        foreach (var provider in hosts.Providers)
            Providers.Add(provider);

        SelectedProvider = Providers.FirstOrDefault();
    }

    public ObservableCollection<RepositoryInfo> Repositories { get; } = [];
    public ObservableCollection<HostGroupViewModel> RepositoryGroups { get; } = [];
    public ObservableCollection<BranchInfo> Branches { get; } = [];

    /// <summary>
    /// The same branches as <see cref="Branches"/>, filtered and grouped the way the
    /// picker draws them. A view over that list rather than a second source of truth.
    /// </summary>
    public ObservableCollection<BranchSectionViewModel> BranchSections { get; } = [];
    public ObservableCollection<CommitInfo> History { get; } = [];
    public ObservableCollection<FileChangeViewModel> Changes { get; } = [];
    public ObservableCollection<FileChange> SelectedCommitFiles { get; } = [];

    public ObservableCollection<HostAccount> Accounts { get; } = [];
    public ObservableCollection<IHostProvider> Providers { get; } = [];
    public ObservableCollection<GitHost> Hosts { get; } = [];

    // ---- Sign-in -----------------------------------------------------------

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanUseBrowserLogin))]
    [NotifyPropertyChangedFor(nameof(TokenHelpText))]
    public partial IHostProvider? SelectedProvider { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanUseBrowserLogin))]
    public partial string SignInServerUrl { get; set; } = "https://github.com";

    [ObservableProperty]
    public partial string SignInToken { get; set; } = string.Empty;

    [ObservableProperty]
    public partial DeviceLogin? PendingDeviceLogin { get; set; }

    public bool HasPendingDeviceLogin => PendingDeviceLogin is not null;

    /// <summary>
    /// Depends on the server as well as the provider: Omnigit's built-in client id is
    /// registered on github.com, so the button hides again if the URL points elsewhere.
    /// </summary>
    public bool CanUseBrowserLogin
        => SelectedProvider is GitHubProvider github
           && Uri.TryCreate(SignInServerUrl, UriKind.Absolute, out var baseUrl)
           && github.CanUseBrowserLogin(baseUrl);

    public string TokenHelpText => SelectedProvider is null
        ? string.Empty
        : Strings.Format("Create a token on {0} and paste it here. It is stored in {1}.",
                         SelectedProvider.DisplayName, _credentials.Description);

    public string CredentialBackendLabel =>
        Strings.Format("Tokens are stored in {0}.", _credentials.Description);

    public bool CredentialBackendIsWeak => !_credentials.IsSecure;

    public bool HasAccounts => Accounts.Count > 0;

    /// <summary>Manifest problems worth telling the user about.</summary>
    public string? HostWarnings => _hosts.Warnings.Count == 0
        ? null
        : string.Join("  ", _hosts.Warnings);

    public bool HasHostWarnings => HostWarnings is not null;

    // ---- Activity console --------------------------------------------------

    public ReadOnlyObservableCollection<ActivityEntry> LogEntries => _log.Entries;

    [ObservableProperty]
    public partial bool IsConsoleExpanded { get; set; }

    /// <summary>
    /// Height of the console's row. Auto while collapsed, so the header alone sets it;
    /// an absolute height once open, which is what makes the splitter able to drag it.
    /// </summary>
    [ObservableProperty]
    public partial GridLength ConsoleHeight { get; set; } = GridLength.Auto;

    /// <summary>Remembers how tall the user dragged it, so reopening returns there.</summary>
    private GridLength _lastConsoleHeight = new(260);

    /// <summary>
    /// Hooked rather than done in the toggle command, because an error opens the console
    /// on its own and would otherwise leave the row still sized for a collapsed one.
    /// </summary>
    partial void OnIsConsoleExpandedChanged(bool value)
    {
        if (value)
        {
            ConsoleHeight = _lastConsoleHeight;
            return;
        }

        if (ConsoleHeight.IsAbsolute && ConsoleHeight.Value > 0)
            _lastConsoleHeight = ConsoleHeight;

        ConsoleHeight = GridLength.Auto;
    }

    /// <summary>Most recent line, shown on the collapsed bar.</summary>
    public ActivityEntry? LatestEntry => _log.Entries.Count > 0 ? _log.Entries[^1] : null;

    public bool HasLogEntries => _log.Entries.Count > 0;

    [RelayCommand]
    private void ToggleConsole() => IsConsoleExpanded = !IsConsoleExpanded;

    private void Log(ActivityLevel level, string message, string? detail = null)
    {
        _log.Write(level, message, detail);
        OnPropertyChanged(nameof(LatestEntry));
        OnPropertyChanged(nameof(HasLogEntries));
    }

    // ---- Loading / errors --------------------------------------------------

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SyncCommand))]
    [NotifyCanExecuteChangedFor(nameof(FetchCommand))]
    [NotifyCanExecuteChangedFor(nameof(PullCommand))]
    [NotifyCanExecuteChangedFor(nameof(PushCommand))]
    public partial bool IsBusy { get; set; }

    public bool HasRepositories => Repositories.Count > 0;

    /// <summary>Whether anything is open to draw or act on.</summary>
    public bool HasSelectedRepository => SelectedRepository is not null;

    // ---- The commit graph --------------------------------------------------

    /// <summary>
    /// How much history the graph draws. Larger than the sidebar's list because the
    /// shape is the point here - a page of twenty commits shows no branching at all -
    /// and bounded because every row is laid out whether it is on screen or not.
    /// </summary>
    private const int GraphLimit = 400;

    /// <summary>What the header button would do if pressed now.</summary>
    public string GraphButtonLabel =>
        IsGraphPageVisible ? Strings.Get("Hide the commit graph") : Strings.Get("Commit graph");

    /// <summary>
    /// Every branch, not just the one checked out. A graph of one branch is a straight
    /// line, so the scope is not a setting here - it is what the page is for.
    /// </summary>
    public ObservableCollection<CommitInfo> GraphCommits { get; } = [];

    [ObservableProperty]
    public partial CommitInfo? SelectedGraphCommit { get; set; }

    /// <summary>
    /// Width of the gutter, in lanes: one number for the page rather than per row, or
    /// the summaries beside it would sit in a ragged column.
    /// </summary>
    [ObservableProperty]
    public partial int GraphLanes { get; set; } = 1;

    [ObservableProperty]
    public partial bool IsGraphLoading { get; set; }

    public string GraphTitle => SelectedRepository?.Name ?? Strings.Get("Graph");

    public string GraphSubtitle => GraphCommits.Count switch
    {
        0 => Strings.Get("Nothing to draw"),

        // The cap is its own sentence rather than the general one with a bigger number:
        // "the most recent" is the whole point of it, and it is never reached with one.
        var many when many >= GraphLimit =>
            Strings.Format("The most recent {0} commits across every branch", many),

        var many => Strings.Plural(
            "{0} commit across every branch", "{0} commits across every branch", many),
    };

    /// <summary>
    /// The header button is a toggle, not a way in. It is the only control that opens
    /// the graph, so pressing it again while the graph is up has to be the way back out
    /// - otherwise the one button that looks like it should close the page does nothing,
    /// and the only exit is the one inside the page.
    /// </summary>
    [RelayCommand]
    private async Task ShowGraphAsync()
    {
        if (IsGraphPageVisible)
        {
            ActivePage = Page.Repository;
            return;
        }

        if (SelectedRepository is not { } repository)
            return;

        // No return address recorded, unlike settings and clone: the graph is another
        // view of the repository rather than an interruption to what you were doing, so
        // it swaps with the repository and goes back to it.
        ActivePage = Page.Graph;
        IsGraphLoading = true;
        OnPropertyChanged(nameof(GraphTitle));

        try
        {
            var commits = await Task.Run(
                () => _git.GetHistory(repository.LocalPath, GraphLimit, everyBranch: true));

            Replace(GraphCommits, commits);

            GraphLanes = commits.Count == 0
                ? 1
                : Math.Min(commits.Max(c => c.Graph?.Lanes ?? 1), CommitGraph.MaxLanes);

            SelectedGraphCommit = null;
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Error, Strings.Format("Could not read the history: {0}", ex.Message));
        }
        finally
        {
            IsGraphLoading = false;
            OnPropertyChanged(nameof(GraphSubtitle));
        }
    }

    [RelayCommand]
    private void CloseGraph() => ActivePage = Page.Repository;

    [RelayCommand]
    private async Task CopyGraphCommitShaAsync()
    {
        if (SelectedGraphCommit is { } commit)
            await CopyAsync(commit.Sha, Strings.Get("Copied the commit SHA to the clipboard"));
    }

    [RelayCommand]
    private async Task CopyGraphCommitSummaryAsync()
    {
        if (SelectedGraphCommit is { } commit)
            await CopyAsync(commit.Summary, Strings.Get("Copied the commit summary to the clipboard"));
    }

    // ---- Selection ---------------------------------------------------------

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanListPullRequests))]
    [NotifyPropertyChangedFor(nameof(PullRequestsEmptyLabel))]
    [NotifyPropertyChangedFor(nameof(CreatePullRequestLabel))]
    [NotifyCanExecuteChangedFor(nameof(CreatePullRequestCommand))]
    [NotifyCanExecuteChangedFor(nameof(SyncCommand))]
    [NotifyCanExecuteChangedFor(nameof(FetchCommand))]
    [NotifyCanExecuteChangedFor(nameof(PullCommand))]
    [NotifyCanExecuteChangedFor(nameof(PushCommand))]
    [NotifyPropertyChangedFor(nameof(HasSelectedRepository))]
    public partial RepositoryInfo? SelectedRepository { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CommitButtonLabel))]
    [NotifyPropertyChangedFor(nameof(HeadLabel))]
    [NotifyPropertyChangedFor(nameof(CreatePullRequestLabel))]
    [NotifyCanExecuteChangedFor(nameof(CreatePullRequestCommand))]
    public partial BranchInfo? SelectedBranch { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsOneChangeSelected))]
    [NotifyPropertyChangedFor(nameof(CanIgnoreFolder))]
    [NotifyPropertyChangedFor(nameof(CanIgnoreExtension))]
    [NotifyPropertyChangedFor(nameof(CanOpenSelectedChange))]
    [NotifyPropertyChangedFor(nameof(DiscardChangesLabel))]
    public partial FileChangeViewModel? SelectedChange { get; set; }

    /// <summary>
    /// Every row the changes list has selected, which ctrl- and shift-click make more
    /// than one. The ListBox is handed this instance and maintains it, so nothing here
    /// writes to it except the refresh that restores a selection across a reload.
    /// <see cref="SelectedChange"/> stays the anchor row and is what the diff pane shows;
    /// this is what the discard acts on.
    /// </summary>
    public ObservableCollection<FileChangeViewModel> SelectedChanges { get; } = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAmendSelectedCommit))]
    [NotifyCanExecuteChangedFor(nameof(AmendSelectedCommitCommand))]
    public partial CommitInfo? SelectedCommit { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsChangesTab))]
    [NotifyPropertyChangedFor(nameof(IsHistoryTab))]
    public partial int SelectedTabIndex { get; set; }

    public bool IsChangesTab => SelectedTabIndex == 0;
    public bool IsHistoryTab => SelectedTabIndex == 1;

    // ---- Which page is showing ---------------------------------------------

    /// <summary>The four things the content area can be.</summary>
    public enum Page
    {
        Repository,
        Clone,
        Settings,
        Graph,
    }

    /// <summary>
    /// One value rather than a bool per page, so two pages showing at once stops being
    /// something that can be expressed.
    /// </summary>
    /// <remarks>
    /// It used to be three independent bools, and nothing kept them apart: ShowSettings
    /// cleared clone but not graph, and neither ShowClone nor ShowGraph cleared anything.
    /// The pages are stacked in one Panel, where the last visible child draws on top - so
    /// opening settings over the graph set the flag and left the graph painted over it,
    /// and the gear looked dead. Three methods each remembering to clear the other two is
    /// a convention; this is an invariant, and the next page added gets it for free.
    /// </remarks>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsClonePageVisible))]
    [NotifyPropertyChangedFor(nameof(IsSettingsPageVisible))]
    [NotifyPropertyChangedFor(nameof(IsGraphPageVisible))]
    [NotifyPropertyChangedFor(nameof(GraphButtonLabel))]
    [NotifyPropertyChangedFor(nameof(SettingsButtonLabel))]
    public partial Page ActivePage { get; set; }

    /// <summary>
    /// Where closing settings or the clone page goes back to. Depth of one on purpose:
    /// "where was I" only ever has one answer, and a history stack would be answering a
    /// question nobody asks.
    /// </summary>
    private Page _returnTo = Page.Repository;

    public bool IsClonePageVisible => ActivePage == Page.Clone;
    public bool IsSettingsPageVisible => ActivePage == Page.Settings;
    public bool IsGraphPageVisible => ActivePage == Page.Graph;

    /// <summary>What the header's gear would do if pressed now.</summary>
    public string SettingsButtonLabel =>
        IsSettingsPageVisible ? Strings.Get("Close settings") : Strings.Get("Settings");

    // ---- Making a repository, and putting it on a site ---------------------

    /// <summary>
    /// The new-repository form while it is open, or null. Local only - see the remarks
    /// on <see cref="NewRepositoryViewModel"/> for why the site comes afterwards.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNewRepositoryDraft))]
    public partial NewRepositoryViewModel? NewRepositoryDraft { get; set; }

    public bool HasNewRepositoryDraft => NewRepositoryDraft is not null;

    /// <summary>The publish form while it is open, or null.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPublishDraft))]
    public partial PublishRepositoryViewModel? PublishDraft { get; set; }

    public bool HasPublishDraft => PublishDraft is not null;

    /// <summary>
    /// Accounts on sites Omnigit knows how to create a repository on. A signed-in
    /// account whose provider cannot is deliberately left out rather than offered and
    /// then refused.
    /// </summary>
    private IReadOnlyList<HostAccount> AccountsThatCanCreate => [.. Accounts
        .Where(a => _hosts.ById(a.ProviderId)?.Capabilities.CanCreateRepositories == true)];

    [RelayCommand]
    private void ShowNewRepository()
    {
        IsRepositoryPickerOpen = false;

        var draft = new NewRepositoryViewModel(AccountsThatCanCreate);
        Watch(draft.Publish);

        NewRepositoryDraft = draft;
    }

    /// <summary>
    /// Refills a target's organisation list whenever its site changes, and once now.
    /// Organisations belong to one site and mean nothing on another, so the old list is
    /// thrown away rather than filtered.
    /// </summary>
    private void Watch(PublishTargetViewModel target)
    {
        target.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(PublishTargetViewModel.Target))
                _ = LoadOwnersAsync(target);
        };

        _ = LoadOwnersAsync(target);
    }

    [RelayCommand]
    private void CancelNewRepository() => NewRepositoryDraft = null;

    /// <summary>Picks the folder the new repository's own directory goes inside.</summary>
    [RelayCommand]
    private async Task PickNewRepositoryFolderAsync()
    {
        if (NewRepositoryDraft is not { } draft)
            return;

        if (await _picker.PickAsync(Strings.Get("Where should the repository go?")) is { Length: > 0 } path)
            draft.ParentPath = path;
    }

    /// <summary>
    /// Creates the repository, writes whatever starting files were asked for, and makes
    /// the first commit.
    /// </summary>
    /// <remarks>
    /// The commit is not optional decoration. A repository with no commits has no
    /// branch either - HEAD points at a name nothing has ever written - so the branch
    /// picker has nothing to show and the toolbar can say nothing true about it. Asking
    /// for no starting files is still allowed, and then there genuinely is no commit to
    /// make; that is the case someone importing existing work into an empty folder
    /// wants, and it resolves itself the moment they commit.
    /// </remarks>
    [RelayCommand]
    private async Task ConfirmNewRepositoryAsync()
    {
        if (NewRepositoryDraft is not { CanCreate: true } draft)
            return;

        var path = draft.TargetPath;
        var name = draft.Name.Trim();
        var account = draft.Publish.Account;
        var request = draft.Publish.ToRequest(name, draft.Description);
        NewRepositoryDraft = null;

        string? created = null;

        await RunAsync(async () =>
        {
            created = await Task.Run(() =>
            {
                var workdir = _git.Init(path, DefaultBranchForNewRepositories);
                var files = draft.StartingFiles(_git.GetAuthorName(workdir) ?? string.Empty);

                foreach (var (relative, contents) in files)
                    System.IO.File.WriteAllText(System.IO.Path.Combine(workdir, relative), contents);

                if (files.Count > 0)
                {
                    _git.Commit(
                        workdir,
                        files.Select(f => f.Path),
                        "Initial commit", // Not translated: this is written into the repository.
                        string.Empty);
                }

                return workdir;
            });

            Log(ActivityLevel.Success, Strings.Format("Created {0} at {1}", name, created));

            // Last, and only once everything above worked. A repository that exists on
            // a site but not on disk would be the one failure with nothing here to
            // press to finish it.
            if (account is not null && request is not null)
            {
                try
                {
                    await PublishAsync(created, account, request);
                }
                catch (Exception ex)
                {
                    // Deliberately not rethrown. The repository was created and
                    // committed; only the half that needed a server failed, and letting
                    // this reach RunAsync would report the whole press as a failure over
                    // a repository sitting there perfectly intact. Say which half, and
                    // what to press to finish it.
                    Log(
                        ActivityLevel.Error,
                        Strings.Format("{0} was created here, but not on {1} — {2}",
                                       name, account.BaseUrl.Host, ex.Message),
                        Strings.Format("Everything is committed locally. Press Publish repository "
                                       + "on the toolbar to try again.\n\n{0}", ex));
                }
            }
        });

        if (created is null)
            return;

        var added = await AddRepositoryPathAsync(created, persist: true);

        ShowRepository();

        if (added is not null)
            await OpenRepositoryAsync(added);
    }

    /// <summary>
    /// What a repository made here starts on. Fixed rather than read from git's
    /// <c>init.defaultBranch</c>, because every site Omnigit talks to now calls it main
    /// and a repository about to be published to one of them should agree with it.
    /// </summary>
    private const string DefaultBranchForNewRepositories = "main";

    /// <summary>
    /// Opens the publish form, and fills in its organisation list in the background.
    /// </summary>
    [RelayCommand]
    private async Task ShowPublishRepositoryAsync()
    {
        if (SelectedRepository is not { } repository)
            return;

        var accounts = AccountsThatCanCreate;

        if (accounts.Count == 0)
        {
            Log(
                ActivityLevel.Warning,
                Accounts.Count == 0
                    ? Strings.Get("Sign in to a hosting site first — there is nowhere to publish this yet.")
                    : Strings.Get("None of the sites you are signed in to can be asked to create a repository."));
            return;
        }

        var draft = new PublishRepositoryViewModel(repository.Name, string.Empty, accounts);
        Watch(draft.Target);

        PublishDraft = draft;
        await Task.CompletedTask;
    }

    [RelayCommand]
    private void CancelPublish() => PublishDraft = null;

    /// <summary>
    /// Asks the chosen site which organisations the account could publish under. A
    /// failure leaves the account itself in the list, which is the answer that is always
    /// true - see <see cref="IHostProvider.ListOwnersAsync"/>.
    /// </summary>
    private async Task LoadOwnersAsync(PublishTargetViewModel target)
    {
        if (target.Account is not { } account)
        {
            // Back to "just on this machine". The organisations of the site that was
            // picked a moment ago must not stay on screen under a different answer.
            target.SetOwners([]);
            return;
        }

        if (_hosts.ById(account.ProviderId) is not { } provider)
            return;

        target.IsLoadingOwners = true;

        try
        {
            var owners = await provider.ListOwnersAsync(account, default);

            // The site may have been changed again while this was in flight.
            if (ReferenceEquals(target.Account, account))
                target.SetOwners(owners);
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Warning,
                Strings.Format("Could not list organisations for {0}: {1}", account.Handle, ex.Message));

            if (ReferenceEquals(target.Account, account))
            {
                // Still offer the account itself - a token without read:org can publish
                // perfectly well - but say on the form that the site did not answer.
                // Silently falling back left the form looking healthy right up until
                // Create reached the network, which is where a stopped server showed up.
                target.SetOwners([new RepositoryOwner(account.Login, IsSelf: true)]);

                target.SiteProblem =
                    Strings.Format("Couldn't ask {0} which organisations you belong to — "
                                   + "{1} Publishing there will probably fail too.",
                                   account.BaseUrl.Host, ex.Message);
            }
        }
        finally
        {
            target.IsLoadingOwners = false;
        }
    }

    /// <summary>
    /// Creates the repository on the site, points origin at it and pushes.
    /// </summary>
    /// <remarks>
    /// The push is what makes this worth one button rather than three. It is also the
    /// step that can fail on its own - the repository exists on the site by then - so
    /// the remote is written first and left in place: a second press of the sync button
    /// is an ordinary push, not a second attempt at creating something already there.
    ///
    /// Called inside a <c>RunAsync</c> by both routes in, so it reports through the log
    /// and lets faults travel out to the banner rather than catching them itself.
    /// </remarks>
    private async Task PublishAsync(string path, HostAccount account, NewRepository request)
    {
        if (_hosts.ById(account.ProviderId) is not { } provider)
            return;

        var created = await provider.CreateRepositoryAsync(account, request, default);

        Log(ActivityLevel.Success,
            Strings.Format("Created {0} on {1}", created.FullName, account.BaseUrl.Host));

        await Task.Run(() => _git.AddRemote(path, "origin", created.CloneUrl));

        void Trace(string line) => _log.Write(ActivityLevel.Trace, line);

        var result = await Task.Run(
            () => _git.Push(path, provider.GetGitCredentials(account), Trace));

        Log(result.Succeeded ? ActivityLevel.Success : ActivityLevel.Error, result.Message);
    }

    /// <summary>
    /// Creates the repository on the site, points origin at it, and pushes.
    /// </summary>
    /// <remarks>
    /// The push is what makes this worth one button rather than three. It is also the
    /// step that can fail on its own - the repository exists on the site by then - so
    /// the remote is written first and left in place: a second press of the sync button
    /// is an ordinary push, not a second attempt at creating something that is already
    /// there.
    /// </remarks>
    [RelayCommand]
    private async Task ConfirmPublishAsync()
    {
        if (PublishDraft is not { CanPublish: true } draft
            || draft.Target.Account is not { } account
            || draft.ToRequest() is not { } request
            || SelectedRepository is not { } repository)
        {
            return;
        }

        var path = repository.LocalPath;
        PublishDraft = null;

        await RunAsync(() => PublishAsync(path, account, request));

        // Whether or not the push worked, origin is now set and the toolbar has to stop
        // saying this repository is only on this machine.
        await OpenRepositoryAsync(repository);
    }

    // ---- Browse and clone --------------------------------------------------

    /// <summary>What the list is filtered down to. Rebuilt rather than filtered in the view.</summary>
    public ObservableCollection<RemoteRepositoryViewModel> RemoteRepositories { get; } = [];

    /// <summary>Everything fetched, before the filter is applied.</summary>
    private readonly List<RemoteRepositoryViewModel> _allRemotes = [];

    [ObservableProperty]
    public partial bool IsLoadingRemotes { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasRemoteResults))]
    public partial string RemoteFilter { get; set; } = string.Empty;

    partial void OnRemoteFilterChanged(string value) => ApplyRemoteFilter();

    public bool HasRemoteResults => RemoteRepositories.Count > 0;

    public string RemoteEmptyLabel => _allRemotes.Count == 0
        ? Strings.Get("Sign in to a hosting site to browse what you can clone.")
        : Strings.Get("Nothing matches that filter.");

    // ---- Settings ----------------------------------------------------------

    /// <summary>
    /// Which section of settings is showing. An int rather than an enum so the tab rail
    /// can pass one through CommandParameter without a converter; there will be more.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsAccountsSection))]
    [NotifyPropertyChangedFor(nameof(IsHostsSection))]
    [NotifyPropertyChangedFor(nameof(IsAboutSection))]
    [NotifyPropertyChangedFor(nameof(IsGeneralSection))]
    public partial int SettingsSection { get; set; }

    public bool IsAccountsSection => SettingsSection == 0;
    public bool IsHostsSection => SettingsSection == 1;
    public bool IsAboutSection => SettingsSection == 2;

    // Numbered after the three that shipped first, and drawn above them: the numbers are
    // a rail's CommandParameter, not an order.
    public bool IsGeneralSection => SettingsSection == 3;

    /// <summary>The version, and the one button that changes it.</summary>
    public UpdateViewModel Update { get; }

    /// <summary>The language picker on the settings page.</summary>
    public LanguageViewModel Language { get; }

    /// <summary>
    /// Mirrors <see cref="UpdateViewModel.IsUpdateAvailable"/> so the header's settings
    /// button can carry the dot. The header binds to this view model, not to that one.
    /// </summary>
    public bool IsUpdateAvailable => Update.IsUpdateAvailable;

    /// <summary>Every site Omnigit knows about, whatever the description came from.</summary>
    public ObservableCollection<HostEntryViewModel> HostEntries { get; } = [];

    /// <summary>Non-null while the add/edit host form is open.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEditingHost))]
    public partial HostDraftViewModel? HostDraft { get; set; }

    public bool IsEditingHost => HostDraft is not null;

    // ---- Live repository status -------------------------------------------
    // Held here rather than on RepositoryInfo, which stays immutable identity.

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SyncActionLabel))]
    [NotifyPropertyChangedFor(nameof(SyncCountLabel))]
    [NotifyPropertyChangedFor(nameof(HasSyncCount))]
    [NotifyPropertyChangedFor(nameof(CanAmend))]
    [NotifyPropertyChangedFor(nameof(CanAmendSelectedCommit))]
    [NotifyCanExecuteChangedFor(nameof(AmendSelectedCommitCommand))]
    public partial int Ahead { get; set; }

    /// <summary>False when the branch is not on the remote yet; see <see cref="CanAmend"/>.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SyncActionLabel))]
    [NotifyPropertyChangedFor(nameof(CanAmend))]
    [NotifyPropertyChangedFor(nameof(CanAmendSelectedCommit))]
    [NotifyCanExecuteChangedFor(nameof(AmendSelectedCommitCommand))]
    public partial bool IsPublished { get; set; }

    /// <summary>False for a repository with no remote, where publishing means nothing.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SyncActionLabel))]
    [NotifyPropertyChangedFor(nameof(SyncDetailLabel))]
    [NotifyCanExecuteChangedFor(nameof(SyncCommand))]
    [NotifyCanExecuteChangedFor(nameof(FetchCommand))]
    [NotifyCanExecuteChangedFor(nameof(PullCommand))]
    [NotifyCanExecuteChangedFor(nameof(PushCommand))]
    public partial bool HasRemote { get; set; }

    /// <summary>The branch exists nowhere but here, and there is a remote to send it to.</summary>
    public bool CanPublish => HasRemote && !IsPublished;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SyncActionLabel))]
    [NotifyPropertyChangedFor(nameof(SyncCountLabel))]
    [NotifyPropertyChangedFor(nameof(HasSyncCount))]
    public partial int Behind { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SyncDetailLabel))]
    public partial DateTimeOffset? LastFetched { get; set; }

    /// <summary>
    /// True while HEAD points at a commit rather than a branch, which is where opening
    /// an older commit leaves you. Anything committed here belongs to no branch.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HeadLabel))]
    [NotifyPropertyChangedFor(nameof(HeadDetailLabel))]
    [NotifyPropertyChangedFor(nameof(CommitButtonLabel))]
    [NotifyPropertyChangedFor(nameof(CanAmend))]
    [NotifyPropertyChangedFor(nameof(CanAmendSelectedCommit))]
    [NotifyCanExecuteChangedFor(nameof(AmendSelectedCommitCommand))]
    [NotifyCanExecuteChangedFor(nameof(RevertSelectedCommitCommand))]
    [NotifyCanExecuteChangedFor(nameof(ResetToSelectedCommitCommand))]
    public partial bool IsDetachedHead { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HeadLabel))]
    [NotifyPropertyChangedFor(nameof(HeadDetailLabel))]
    public partial string HeadShortSha { get; set; } = string.Empty;

    /// <summary>What the toolbar shows where the branch name goes.</summary>
    public string HeadLabel => IsDetachedHead ? HeadShortSha : SelectedBranch?.Name ?? "—";

    public string HeadDetailLabel =>
        IsDetachedHead ? Strings.Get("Not on a branch") : Strings.Get("Current branch");

    // ---- An operation git could not finish on its own ----------------------

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPendingOperation))]
    [NotifyPropertyChangedFor(nameof(PendingOperationLabel))]
    [NotifyPropertyChangedFor(nameof(CommitButtonLabel))]
    public partial RepositoryOperation PendingOperation { get; set; }

    /// <summary>Paths git left for the user to decide about, newest listing first.</summary>
    public ObservableCollection<string> ConflictedPaths { get; } = [];

    public bool HasPendingOperation => PendingOperation != RepositoryOperation.None;

    public bool HasConflicts => ConflictedPaths.Count > 0;

    public string PendingOperationName => PendingOperation switch
    {
        RepositoryOperation.Merge => Strings.Get("merge"),
        RepositoryOperation.Revert => Strings.Get("revert"),
        RepositoryOperation.CherryPick => Strings.Get("cherry-pick"),
        RepositoryOperation.Rebase => Strings.Get("rebase"),
        _ => Strings.Get("operation"),
    };

    public string PendingOperationLabel => ConflictedPaths.Count switch
    {
        0 => Strings.Format("The {0} went through — commit it to finish.", PendingOperationName),
        var n => Strings.Plural(
            "This {1} stopped on {0} file git could not merge on its own.",
            "This {1} stopped on {0} files git could not merge on its own.",
            n, PendingOperationName),
    };

    public string ConflictHelpLabel =>
        Strings.Get("Keep one side whole, or edit the file yourself and mark it resolved. "
                    + "Committing finishes the operation; abandoning puts everything back.");

    /// <remarks>
    /// Four verbs became five. A repository with no remote at all is not a failed fetch
    /// - it is one that has never been anywhere, and the button says so and opens the
    /// publish dialog. That is GitHub Desktop's shape: the third toolbar button reads
    /// "Publish repository" until there is a remote, then goes back to being the sync
    /// button for the rest of the repository's life.
    ///
    /// Publish-the-branch comes before the counts for the same reason a rung down: a
    /// branch the remote has never seen has nothing to be ahead or behind of, and
    /// "Fetch origin" was the wrong offer there.
    /// </remarks>
    public string SyncActionLabel => !HasRemote ? Strings.Get("Publish repository")
                                   : CanPublish ? Strings.Get("Publish branch")
                                   : Behind > 0 ? Strings.Get("Pull origin")
                                   : Ahead > 0 ? Strings.Get("Push origin")
                                   : Strings.Get("Fetch origin");

    public string SyncDetailLabel => SelectedRepository is null ? string.Empty
        : !HasRemote ? Strings.Get("This repository is only on this machine")
        : LastFetched is { } when ? Strings.Format("Last fetched {0}", TimeFormat.Relative(when))
        : Strings.Get("Never fetched");

    /// <summary>What a press would send, and what it would bring down.</summary>
    public string SyncCountLabel => SyncCounts.Label(Ahead, Behind);

    public bool HasSyncCount => !string.IsNullOrEmpty(SyncCountLabel);

    /// <summary>
    /// Fetch, pull and push all need somewhere to go. A repository with no remote is not
    /// a failure to report every time one is pressed - they are buttons that should not
    /// be pressable.
    /// </summary>
    public bool CanSync => SelectedRepository is not null && HasRemote && !IsBusy;

    /// <summary>
    /// The sync button itself, which has one more state than the three verbs above: a
    /// repository with no remote, where pressing it opens the publish dialog.
    /// </summary>
    public bool CanPressSync => CanSync || (SelectedRepository is not null && !IsBusy);

    // ---- Commit box --------------------------------------------------------

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanCommit))]
    [NotifyCanExecuteChangedFor(nameof(CommitCommand))]
    public partial string CommitSummary { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string CommitDescription { get; set; } = string.Empty;

    public int StagedCount => Changes.Count(c => c.IsStaged);

    public string StagedCountLabel => Changes.Count == 0
        ? Strings.Get("No local changes")
        : Strings.Plural("{0} changed file", "{0} changed files", Changes.Count);

    // Amending only needs a message; re-wording the last commit without touching any
    // file is a perfectly ordinary thing to want. Conflicts are the one hard block:
    // committing markers is the mistake this whole panel exists to prevent.
    public bool CanCommit => (StagedCount > 0 || IsAmending)
                             && !string.IsNullOrWhiteSpace(CommitSummary)
                             && !HasConflicts
                             && !IsBusy;

    /// <summary>
    /// Amending rewrites history, so it is offered only while the last commit is still
    /// local. Once pushed, changing it would need a force-push, which is not something
    /// to make available from a menu.
    /// </summary>
    public bool CanAmend => SelectedRepository is not null
                            && !IsDetachedHead
                            && (Ahead > 0 || !IsPublished);

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanCommit))]
    [NotifyPropertyChangedFor(nameof(CommitButtonLabel))]
    [NotifyCanExecuteChangedFor(nameof(CommitCommand))]
    public partial bool IsAmending { get; set; }

    /// <summary>Loads or clears the previous message as amend mode goes on and off.</summary>
    partial void OnIsAmendingChanged(bool value)
    {
        if (SelectedRepository is not { } repo)
            return;

        if (!value)
        {
            CommitSummary = string.Empty;
            CommitDescription = string.Empty;
            return;
        }

        if (_git.GetLastCommitMessage(repo.LocalPath) is not { } message)
            return;

        CommitSummary = message.Summary;
        CommitDescription = message.Description;
    }

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(CreateBranchCommand))]
    public partial string NewBranchName { get; set; } = string.Empty;

    // ---- Branch picker -----------------------------------------------------

    /// <summary>
    /// What the picker's box is filtering the branch list down to. Plain substring,
    /// case-insensitive: a branch name is not a search query, and every git host lets
    /// people put slashes and dashes in one, which a smarter match would only get wrong.
    /// </summary>
    [ObservableProperty]
    public partial string BranchFilter { get; set; } = string.Empty;

    partial void OnBranchFilterChanged(string value) => RebuildBranchSections();

    public bool HasBranchMatches => BranchSections.Count > 0;

    public string BranchesEmptyLabel => string.IsNullOrWhiteSpace(BranchFilter)
        ? Strings.Get("No branches yet - the first commit makes one.")
        : Strings.Format("No branch here or on the remote matches \u201c{0}\u201d.", BranchFilter.Trim());

    private void RebuildBranchSections()
    {
        Replace(BranchSections, BranchSectionViewModel.Build(Branches, BranchFilter));

        OnPropertyChanged(nameof(HasBranchMatches));
        OnPropertyChanged(nameof(BranchesEmptyLabel));
    }

    /// <summary>
    /// Enter in the filter box takes the top match - the row the list is already pointing
    /// at. No match does nothing rather than creating a branch: the box at the bottom of
    /// the picker is where a new branch is named, and typing a filter is not a request
    /// for one to exist.
    /// </summary>
    [RelayCommand]
    private async Task CheckoutTopMatchAsync()
    {
        if (BranchSections.FirstOrDefault()?.Branches.FirstOrDefault() is { } branch)
            await SelectBranchAsync(branch);
    }

    // ---- Stashes -----------------------------------------------------------

    /// <summary>Stashes belonging to the branch that's checked out. Others stay hidden.</summary>
    public ObservableCollection<StashInfo> BranchStashes { get; } = [];

    public bool HasBranchStashes => BranchStashes.Count > 0;

    public string StashLabel => Strings.Plural(
        "You have stashed changes on this branch",
        "You have {0} sets of stashed changes on this branch", BranchStashes.Count);

    /// <summary>The prompt shown when switching branches would abandon uncommitted work.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPendingBranchSwitch))]
    public partial BranchSwitchViewModel? PendingBranchSwitch { get; set; }

    public bool HasPendingBranchSwitch => PendingBranchSwitch is not null;

    // ---- Questions asked about one commit ----------------------------------
    // One property per prompt rather than one shared slot: they ask different things,
    // and a shared slot would need a type test in every binding.

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasBranchFromCommit))]
    public partial BranchFromCommitViewModel? BranchFromCommit { get; set; }

    public bool HasBranchFromCommit => BranchFromCommit is not null;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTagDraft))]
    public partial TagDraftViewModel? TagDraft { get; set; }

    public bool HasTagDraft => TagDraft is not null;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasCherryPickDraft))]
    public partial CherryPickDraftViewModel? CherryPickDraft { get; set; }

    public bool HasCherryPickDraft => CherryPickDraft is not null;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasResetDraft))]
    public partial ResetDraftViewModel? ResetDraft { get; set; }

    public bool HasResetDraft => ResetDraft is not null;

    /// <summary>
    /// Set while abandoning an operation waits on confirmation. Abandoning resets hard,
    /// so whatever was resolved by hand goes with it — the same kind of unrecoverable
    /// step as discarding a file, and worth the same extra click.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AbortSummary))]
    public partial bool IsConfirmingAbort { get; set; }

    public string AbortSummary => Strings.Format(
        "Everything this {0} changed, including any conflicts you have already "
        + "sorted out, goes back to the last commit. This cannot be undone.", PendingOperationName);

    // ---- Changed-file context menu -----------------------------------------

    /// <summary>
    /// The files a discard is waiting on confirmation for. Discarding cannot be undone -
    /// the change was never committed, so there is nothing to recover it from - which is
    /// the one thing in this app worth an extra click. Held as paths rather than rows
    /// because a refresh replaces every row while the prompt is up.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPendingDiscard))]
    [NotifyPropertyChangedFor(nameof(PendingDiscardTitle))]
    [NotifyPropertyChangedFor(nameof(PendingDiscardSummary))]
    public partial IReadOnlyList<string>? PendingDiscard { get; set; }

    public bool HasPendingDiscard => PendingDiscard is { Count: > 0 };

    public string PendingDiscardTitle => PendingDiscard is not { Count: > 1 } pending
        ? Strings.Get("Discard changes?")
        : Strings.Plural("Discard changes to {0} file?",
                         "Discard changes to {0} files?", pending.Count);

    public string PendingDiscardSummary => PendingDiscard switch
    {
        null or { Count: 0 } => string.Empty,
        [var only] => Strings.Format(
            "{0} goes back to its last committed state. This cannot be undone.", only),

        // Named while the list is short enough to read, counted once it isn't: a discard
        // of thirty files would otherwise push the buttons off the bottom of the dialog.
        { Count: <= 8 } some => Strings.Format(
            "{0} go back to their last committed state. This cannot be undone.",
            string.Join(Strings.Particular("between items of a list", ", "), some)),

        var many => Strings.Plural(
            "{0} file goes back to its last committed state. This cannot be undone.",
            "{0} files go back to their last committed state. This cannot be undone.",
            many.Count),
    };

    /// <summary>
    /// The rows a file command should act on: the whole selection where the row under the
    /// pointer is part of it, and that row alone otherwise - which is what right-clicking
    /// outside a selection already reduced it to.
    /// </summary>
    private List<FileChangeViewModel> SelectedChangeSet => SelectedChanges.Count > 0
        ? [.. SelectedChanges]
        : SelectedChange is { } one ? [one] : [];

    /// <summary>
    /// True while exactly one row is selected. The single-file entries in the changed-file
    /// menu hide otherwise: they name one file, and with several rows selected there is no
    /// saying which one they would mean.
    /// </summary>
    public bool IsOneChangeSelected => SelectedChangeSet.Count <= 1;

    public bool CanIgnoreFolder => IsOneChangeSelected && SelectedChange?.HasDirectory == true;

    public bool CanIgnoreExtension => IsOneChangeSelected && SelectedChange?.HasExtension == true;

    /// <summary>A deleted file is still listed, but there is nothing left to hand an app.</summary>
    public bool CanOpenSelectedChange => IsOneChangeSelected && SelectedChange is { IsDeleted: false };

    public string DiscardChangesLabel => SelectedChangeSet is { Count: > 1 } many
        ? Strings.Plural("Discard changes to {0} file", "Discard changes to {0} files", many.Count)
        : Strings.Get("Discard changes");

    [RelayCommand]
    private void AskDiscardChanges()
    {
        if (SelectedChangeSet is { Count: > 0 } targets)
            PendingDiscard = [.. targets.Select(c => c.Path)];
    }

    [RelayCommand]
    private void CancelDiscard() => PendingDiscard = null;

    [RelayCommand]
    private async Task ConfirmDiscardAsync()
    {
        if (PendingDiscard is not { Count: > 0 } targets || SelectedRepository is not { } repo)
            return;

        var path = repo.LocalPath;
        PendingDiscard = null;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.DiscardChanges(path, targets));
            Log(ActivityLevel.Success, targets is [var only]
                ? Strings.Format("Discarded changes to {0}", only)
                : Strings.Plural("Discarded changes to {0} file",
                                 "Discarded changes to {0} files", targets.Count));
        });

        await OpenRepositoryAsync(repo);
    }

    [RelayCommand]
    private async Task IgnoreAsync(string? pattern)
    {
        if (string.IsNullOrWhiteSpace(pattern) || SelectedRepository is not { } repo)
            return;

        var path = repo.LocalPath;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.AddToGitignore(path, pattern));
            Log(ActivityLevel.Success, Strings.Format("Added {0} to .gitignore", pattern));
        });

        await OpenRepositoryAsync(repo);
    }

    [RelayCommand]
    private async Task CopyFilePathAsync(FileChangeViewModel? change)
    {
        if (change is null || SelectedRepository is not { } repo)
            return;

        var full = System.IO.Path.Combine(
            await Task.Run(() => _git.GetWorkingDirectory(repo.LocalPath)),
            change.Path);

        await CopyAsync(full, Strings.Get("Copied the file path to the clipboard"));
    }

    [RelayCommand]
    private async Task CopyRelativeFilePathAsync(FileChangeViewModel? change)
    {
        if (change is not null)
            await CopyAsync(change.Path, Strings.Get("Copied the relative file path to the clipboard"));
    }

    [RelayCommand]
    private async Task ShowInFileManagerAsync(FileChangeViewModel? change)
    {
        if (change is null || SelectedRepository is not { } repo)
            return;

        var full = System.IO.Path.Combine(
            await Task.Run(() => _git.GetWorkingDirectory(repo.LocalPath)),
            change.Path);

        if (!await _shell.ShowInFileManagerAsync(full))
            Log(ActivityLevel.Warning, Strings.Get("Could not open a file manager"));
    }

    /// <summary>
    /// What a double-click on a change does: hand the file to the app the desktop has for
    /// its type. A deleted file has nothing to open - the menu entry is hidden for one, but
    /// a double-click reaches here regardless, and so does a file deleted between the
    /// refresh and the click.
    /// </summary>
    [RelayCommand]
    private async Task OpenChangeAsync(FileChangeViewModel? change)
    {
        if (change is null || SelectedRepository is not { } repo)
            return;

        var full = System.IO.Path.Combine(
            await Task.Run(() => _git.GetWorkingDirectory(repo.LocalPath)),
            change.Path);

        if (!System.IO.File.Exists(full))
        {
            Log(ActivityLevel.Warning,
                Strings.Format("{0} is not on disk to open", change.FileName));
            return;
        }

        if (!await _shell.OpenFileAsync(full))
            Log(ActivityLevel.Warning,
                Strings.Format("Nothing is set up to open {0}", change.FileName));
    }

    /// <param name="copied">
    /// The whole sentence to log, not the noun to build one around. It was
    /// CopyAsync(text, "file path") producing "Copied the {what} to the clipboard", which
    /// needs the noun to take a form the call site cannot know - and one of the five call
    /// sites was already passing "tag" or "tags" to get English's plural right.
    /// </param>
    private async Task CopyAsync(string text, string copied)
    {
        if (await _shell.CopyTextAsync(text))
            Log(ActivityLevel.Info, copied);
        else
            Log(ActivityLevel.Warning, Strings.Get("Could not reach the clipboard"));
    }

    public bool CanCreateBranch => !string.IsNullOrWhiteSpace(NewBranchName)
                                   && SelectedRepository is not null
                                   && !IsBusy;

    public string CommitButtonLabel => IsAmending ? Strings.Get("Amend last commit")
        : HasPendingOperation ? Strings.Format("Finish the {0}", PendingOperationName)
        : IsDetachedHead ? Strings.Format("Commit onto {0}", HeadShortSha)
        : Strings.Format("Commit to {0}", SelectedBranch?.Name ?? Strings.Get("branch"));

    public string CommitSummaryPlaceholder
    {
        get
        {
            var staged = Changes.Where(c => c.IsStaged).ToList();
            return staged.Count == 1
                ? Strings.Format("Update {0}", staged[0].FileName)
                : Strings.Get("Summary (required)");
        }
    }

    public bool AreAllStaged
    {
        get => Changes.Count > 0 && Changes.All(c => c.IsStaged);
        set
        {
            foreach (var change in Changes)
                change.IsStaged = value;
        }
    }

    public string SelectedCommitFilesLabel =>
        Strings.Plural("{0} file changed", "{0} files changed", SelectedCommitFiles.Count);

    /// <summary>Which of the commit's files the diff pane is showing.</summary>
    [ObservableProperty]
    public partial FileChange? SelectedCommitFile { get; set; }

    // ---- Pane widths -------------------------------------------------------
    // Bound two-way so the GridSplitters write back here. The toolbar wordmark
    // reads SidebarWidth too, which is what keeps it flush with the sidebar.

    [ObservableProperty]
    public partial GridLength SidebarWidth { get; set; } = new(400);

    [ObservableProperty]
    public partial GridLength CommitFilesWidth { get; set; } = new(300);

    // ---- Startup -----------------------------------------------------------

    /// <summary>Loads the remembered repositories. Called once after the window opens.</summary>
    public async Task InitialiseAsync()
    {
        if (_isDesignTime)
            return;

        Log(ActivityLevel.Info,
            Strings.Plural("Omnigit ready — {0} hosting site: {1}",
                           "Omnigit ready — {0} hosting sites: {1}",
                           Providers.Count,
                           string.Join(Strings.Particular("between items of a list", ", "),
                                       Providers.Select(p => p.DisplayName))));

        Log(ActivityLevel.Trace,
            _credentials.Description is { } d ? Strings.Format("Tokens stored in {0}", d) : "");

        foreach (var warning in _hosts.Warnings)
            Log(ActivityLevel.Warning, warning);

        foreach (var account in await _accountStore.LoadAsync())
            Accounts.Add(account);

        OnPropertyChanged(nameof(HasAccounts));

        foreach (var account in Accounts)
            Log(ActivityLevel.Trace,
                Strings.Format("Signed in to {0} as {1}", account.BaseUrl.Host, account.Login));

        var stored = await Task.Run(() => _store.Load());

        foreach (var path in stored.Paths)
            await AddRepositoryPathAsync(path, persist: false);

        // What was open last time, falling back to the first in the list. A path is
        // matched against the working directory rather than the saved string, since a
        // repository added from a subdirectory resolves to its root on the way in.
        var reopen = Repositories.FirstOrDefault(
                         r => string.Equals(r.LocalPath, stored.LastOpened, StringComparison.Ordinal))
                     ?? Repositories.FirstOrDefault();

        if (reopen is not null)
            await OpenRepositoryAsync(reopen);

        StartBackgroundFetch();
        Update.StartChecking();
    }

    // ---- Fetching without being asked --------------------------------------

    /// <summary>
    /// How often the app fetches on its own. The same ten minutes GitHub Desktop uses,
    /// and for the same reason: a toolbar reading "Fetch origin" over a branch three
    /// commits behind is not so much wrong as useless - you have to press it to find out
    /// there was anything to find out.
    /// </summary>
    private static readonly TimeSpan BackgroundFetchInterval = TimeSpan.FromMinutes(10);

    private DispatcherTimer? _backgroundFetch;

    /// <summary>Guards against a slow fetch overlapping the next tick.</summary>
    private bool _fetchingInBackground;

    private void StartBackgroundFetch()
    {
        if (_isDesignTime || _backgroundFetch is not null)
            return;

        var timer = new DispatcherTimer { Interval = BackgroundFetchInterval };
        timer.Tick += (_, _) => _ = FetchInBackgroundAsync();
        timer.Start();

        _backgroundFetch = timer;
    }

    /// <summary>
    /// A fetch nobody asked for. It differs from the button's in three ways, all of them
    /// about not interrupting: no busy strip, since the user is in the middle of
    /// something; failures go to the log at trace level rather than the error banner,
    /// because being signed out is ordinary and an automatic action should not punish
    /// anyone for leaving the app open; and the reload afterwards is the quiet one, which
    /// keeps the selection and the staging ticks as they were. Nothing in the working
    /// tree is touched either way - a fetch only moves remote-tracking refs, which is
    /// what makes doing it unbidden acceptable at all.
    /// </summary>
    private async Task FetchInBackgroundAsync()
    {
        if (_isDesignTime || _fetchingInBackground || IsBusy || !HasRemote)
            return;

        if (SelectedRepository is not { } repository)
            return;

        _fetchingInBackground = true;
        var path = repository.LocalPath;

        try
        {
            var credentials = await Task.Run(() => CredentialsFor(_git.GetRemoteUrl(path)));
            var result = await Task.Run(() => _git.Fetch(path, credentials, null));

            Log(ActivityLevel.Trace, Strings.Format("Background fetch — {0}", result.Message));

            // The user may have switched repositories, or started something of their
            // own, while the fetch was in flight.
            if (!IsBusy && SelectedRepository is { } still && still.LocalPath == path)
                await LoadRepositoryAsync(still, announce: false);
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Trace, Strings.Format("Background fetch failed — {0}", ex.Message));
        }
        finally
        {
            _fetchingInBackground = false;
        }
    }

    // ---- Commands ----------------------------------------------------------

    [RelayCommand]
    private async Task AddRepositoryAsync()
    {
        var path = await _picker.PickAsync(Strings.Get("Select a git repository"));
        if (string.IsNullOrEmpty(path))
            return;

        if (!await Task.Run(() => _git.IsRepository(path)))
        {
            Log(ActivityLevel.Error, Strings.Format("'{0}' is not a git repository.", path));
            return;
        }

        var added = await AddRepositoryPathAsync(path, persist: true);
        if (added is not null)
            await OpenRepositoryAsync(added);
    }

    /// <summary>
    /// Whether the repository list is expanded in the sidebar. It pushes the tabs down
    /// rather than floating over them, so it has to be state the view model owns.
    /// </summary>
    [ObservableProperty]
    public partial bool IsRepositoryPickerOpen { get; set; }

    [RelayCommand]
    private void ToggleRepositoryPicker() => IsRepositoryPickerOpen = !IsRepositoryPickerOpen;

    [RelayCommand]
    private async Task SelectRepositoryAsync(RepositoryInfo repository)
    {
        IsRepositoryPickerOpen = false;
        await OpenRepositoryAsync(repository);
    }

    /// <summary>Non-null while the delete-from-disk question is on screen.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPendingRemoval))]
    public partial RepositoryRemovalViewModel? PendingRemoval { get; set; }

    public bool HasPendingRemoval => PendingRemoval is not null;

    /// <summary>
    /// Asks before deleting a clone, having first counted what is in it that the remote
    /// has not got.
    /// </summary>
    /// <remarks>
    /// The counting happens here rather than in the dialog because it touches the
    /// repository, and it happens before the dialog rather than after the answer because
    /// the answer is what it is meant to inform. A repository that cannot be opened -
    /// an unplugged drive, a folder already deleted by hand - still gets the dialog,
    /// with no warnings and the same offer, since removing it is exactly what the user
    /// is likely to want.
    /// </remarks>
    [RelayCommand]
    private async Task AskDeleteRepositoryAsync(RepositoryInfo repository)
    {
        var path = repository.LocalPath;

        var prompt = await Task.Run(() =>
        {
            var changes = 0;
            var ahead = 0;
            var unpublished = 0;
            var stashes = 0;

            try
            {
                changes = _git.GetWorkingChanges(path).Count;
                stashes = _git.GetStashes(path).Count;

                // Ahead and IsPublished are properties of the checked-out branch, not of
                // every branch: BranchInfo carries neither, and working them out for all
                // of them would mean walking each one against its remote counterpart.
                // The branch you are standing on is where unpushed work almost always is,
                // and a warning that names it beats an exact count nobody waited for.
                var open = _git.OpenRepository(path);
                ahead = open.Ahead;
                unpublished = open.IsPublished ? 0 : 1;
            }
            catch (Exception)
            {
                // Whatever could not be read is reported as nothing to lose rather than
                // as an error: the dialog's job is to warn where it can, not to stand
                // between the user and a folder they have asked to delete.
            }

            return new RepositoryRemovalViewModel
            {
                Repository = repository,
                Path = path,
                UncommittedChanges = changes,
                UnpushedCommits = ahead,
                UnpublishedBranches = unpublished,
                Stashes = stashes,
            };
        });

        PendingRemoval = prompt;
    }

    [RelayCommand]
    private void CancelRemoval() => PendingRemoval = null;

    [RelayCommand]
    private async Task ShowRepositoryInFileManagerAsync(RepositoryInfo repository)
    {
        if (!await _shell.ShowInFileManagerAsync(repository.LocalPath))
            Log(ActivityLevel.Warning,
                Strings.Format("Nothing here opens folders. It is at {0}", repository.LocalPath));
    }

    [RelayCommand]
    private async Task CopyRepositoryPathAsync(RepositoryInfo repository)
    {
        if (await _shell.CopyTextAsync(repository.LocalPath))
            Log(ActivityLevel.Trace, Strings.Format("Copied {0}", repository.LocalPath));
    }

    /// <summary>
    /// Takes the repository out of the list and puts the folder in the trash.
    /// </summary>
    /// <remarks>
    /// The list comes first. If the trash refuses - a filesystem that has none, a folder
    /// that is open elsewhere - the entry is already gone and the files are still there,
    /// which is the harmless half of what was asked for; the log says the rest. Doing it
    /// the other way round would leave a row in the sidebar pointing at nothing.
    ///
    /// The watcher has to be stopped before the move, not after. It holds a handle on
    /// the directory, and on Windows that alone is enough for the delete to fail.
    /// </remarks>
    [RelayCommand]
    private async Task ConfirmRemovalAsync()
    {
        if (PendingRemoval is not { } prompt)
            return;

        PendingRemoval = null;

        if (SelectedRepository == prompt.Repository)
            _watcher.Stop();

        await RemoveRepositoryAsync(prompt.Repository);

        var result = await Trash.MoveDirectoryAsync(prompt.Path);

        switch (result.Outcome)
        {
            case TrashOutcome.Trashed:
                Log(ActivityLevel.Success,
                    Strings.Format("Moved {0} to the trash.", prompt.Repository.Name));
                break;

            case TrashOutcome.NotFound:
                Log(ActivityLevel.Info,
                    Strings.Format("Removed {0}; its folder was already gone.", prompt.Repository.Name));
                break;

            default:
                Log(ActivityLevel.Warning,
                    Strings.Format("Removed {0} from Omnigit, but its folder is still on disk.",
                                   prompt.Repository.Name),
                    result.Detail);
                break;
        }
    }

    [RelayCommand]
    private async Task RemoveRepositoryAsync(RepositoryInfo repository)
    {
        Repositories.Remove(repository);
        RebuildGroups();

        if (SelectedRepository == repository)
        {
            _watcher.Stop();
            SelectedRepository = null;
            Branches.Clear();
            BranchSections.Clear();
            Changes.Clear();
            History.Clear();
            SelectedCommitFiles.Clear();
        }

        // After the selection is cleared, so the removed repository is not written back
        // as the one to reopen. Opening another below saves again with its path.
        SaveRepositories();

        if (Repositories.Count > 0)
            await OpenRepositoryAsync(Repositories[0]);
    }

    [RelayCommand(CanExecute = nameof(CanCreateBranch))]
    private async Task CreateBranchAsync()
    {
        var name = NewBranchName.Trim();
        NewBranchName = string.Empty;

        await BeginBranchSwitchAsync(name, create: true);
    }

    /// <summary>
    /// Switching or creating a branch. With uncommitted work in the tree, the user is
    /// asked what should happen to it first - git would silently carry it across, which
    /// is right often enough to be the default but wrong often enough to be worth asking.
    /// </summary>
    /// <param name="startPoint">
    /// Where a created branch begins. Null branches from HEAD, which is what the branch
    /// picker asks for; a sha comes from the history's "create branch from this commit".
    /// </param>
    private async Task BeginBranchSwitchAsync(string targetBranch, bool create, string? startPoint = null)
    {
        if (SelectedRepository is null)
            return;

        if (Changes.Count == 0)
        {
            await PerformBranchSwitchAsync(targetBranch, create, bringPaths: null, startPoint);
            return;
        }

        // What the changes are being carried away from, which is the commit rather than
        // the branch when the branch is being started somewhere further back.
        var from = startPoint is null
            ? SelectedBranch?.Name ?? Strings.Get("this branch")
            : startPoint.Length > 7 ? startPoint[..7] : startPoint;

        PendingBranchSwitch = new BranchSwitchViewModel(from, targetBranch, create, Changes, startPoint);
    }

    [RelayCommand]
    private void CancelBranchSwitch() => PendingBranchSwitch = null;

    // The radio buttons drive these rather than binding two-way, so that picking one
    // can't leave both looking unselected while the other updates.
    [RelayCommand]
    private void BringChanges()
    {
        if (PendingBranchSwitch is { } pending)
            pending.LeaveEverything = false;
    }

    [RelayCommand]
    private void LeaveChanges()
    {
        if (PendingBranchSwitch is { } pending)
            pending.LeaveEverything = true;
    }

    [RelayCommand]
    private async Task ConfirmBranchSwitchAsync()
    {
        if (PendingBranchSwitch is not { } pending)
            return;

        PendingBranchSwitch = null;

        await PerformBranchSwitchAsync(
            pending.TargetBranch, pending.Create, pending.BringPaths(), pending.StartPoint);
    }

    private async Task PerformBranchSwitchAsync(
        string targetBranch, bool create, IReadOnlyList<string>? bringPaths, string? startPoint = null)
    {
        if (SelectedRepository is not { } repo)
            return;

        var path = repo.LocalPath;
        var stashedSomething = bringPaths is not null;

        await RunAsync(async () =>
        {
            var result = await Task.Run(() => _git.SwitchBranch(path, targetBranch, create, bringPaths, startPoint));

            // Refused rather than failed: the working tree is untouched and the user is
            // still on the branch they started on, so say what to do about it.
            if (!result.Succeeded)
            {
                Log(ActivityLevel.Warning, result.Message);
                return;
            }

            Log(ActivityLevel.Success, create
                ? Strings.Format("Created and switched to branch {0}", targetBranch)
                : Strings.Format("Switched to branch {0}", targetBranch));

            if (stashedSomething)
                Log(ActivityLevel.Info,
                    Strings.Get("Changes left behind were stashed on the previous branch"));
        });

        await OpenRepositoryAsync(repo);
    }

    // ---- Stashes -----------------------------------------------------------

    [RelayCommand]
    private async Task RestoreStashAsync()
    {
        if (SelectedRepository is not { } repo || BranchStashes.FirstOrDefault() is not { } stash)
            return;

        var path = repo.LocalPath;
        var index = stash.Index;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.PopStash(path, index));
            Log(ActivityLevel.Success, Strings.Get("Restored your stashed changes"));
        });

        await OpenRepositoryAsync(repo);
    }

    [RelayCommand]
    private async Task DiscardStashAsync()
    {
        if (SelectedRepository is not { } repo || BranchStashes.FirstOrDefault() is not { } stash)
            return;

        var path = repo.LocalPath;
        var index = stash.Index;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.DropStash(path, index));
            Log(ActivityLevel.Warning, Strings.Get("Discarded the stashed changes"));
        });

        await OpenRepositoryAsync(repo);
    }

    /// <summary>
    /// Checks out a branch from the picker. A branch that is only on the remote is asked
    /// for by its short name and created here tracking it, which is what git does for
    /// <c>git checkout &lt;name&gt;</c> - so nothing on this side has to know which of the
    /// two it was.
    /// </summary>
    [RelayCommand]
    private async Task SelectBranchAsync(BranchInfo branch)
    {
        // The search that found it has served its purpose, and leaving it filled would
        // greet the next open with a list of one.
        BranchFilter = string.Empty;

        if (SelectedRepository is null || branch.IsCurrent)
        {
            SelectedBranch = branch;
            return;
        }

        // Git allows one worktree per branch, so this one cannot be checked out here
        // while another is standing on it. That worktree is a working directory of its
        // own, which is exactly what the sidebar is a list of - so the row goes there
        // rather than being a dead end that names a path and does nothing.
        if (branch.IsCheckedOutElsewhere)
        {
            await OpenWorktreeAsync(branch);
            return;
        }

        await BeginBranchSwitchAsync(branch.Name, create: false);
    }

    /// <summary>
    /// Opens the linked worktree holding <paramref name="branch"/>, adding it to the
    /// sidebar the first time. It is remembered like any other repository: having been
    /// taken there once, finding it again should not mean going through the picker.
    /// </summary>
    private async Task OpenWorktreeAsync(BranchInfo branch)
    {
        var path = branch.CheckedOutIn;

        var known = Repositories.FirstOrDefault(
            r => string.Equals(r.LocalPath, path, StringComparison.Ordinal));

        if (known is null)
        {
            await AddRepositoryPathAsync(path, persist: true);

            // Read back rather than taken from the return: a repository discovered from
            // a subdirectory resolves to its own root, which the add reports as already
            // present by returning null.
            known = Repositories.FirstOrDefault(
                r => string.Equals(r.LocalPath, path, StringComparison.Ordinal));
        }

        if (known is null)
        {
            Log(ActivityLevel.Error,
                Strings.Format("{0} is checked out in {1}, which could not be opened.",
                               branch.Name, path));
            return;
        }

        IsRepositoryPickerOpen = false;
        await OpenRepositoryAsync(known);

        Log(ActivityLevel.Info, Strings.Format("Opened the worktree holding {0}", branch.Name));
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        if (SelectedRepository is { } repo)
            await OpenRepositoryAsync(repo);
    }

    [RelayCommand(CanExecute = nameof(CanCommit))]
    private async Task CommitAsync()
    {
        if (SelectedRepository is not { } repo)
            return;

        var paths = Changes.Where(c => c.IsStaged).Select(c => c.Path).ToList();
        var summary = CommitSummary;
        var description = CommitDescription;
        var path = repo.LocalPath;

        var amending = IsAmending;
        var committed = false;

        await RunAsync(async () =>
        {
            if (amending)
            {
                var amended = await Task.Run(() => _git.AmendCommit(path, paths, summary, description));
                Log(ActivityLevel.Success,
                    Strings.Format("Amended the last commit — now {0}", amended[..7]));
            }
            else
            {
                var sha = await Task.Run(() => _git.Commit(path, paths, summary, description));
                Log(ActivityLevel.Success,
                    Strings.Plural("Committed {1} — {0} file", "Committed {1} — {0} files",
                                   paths.Count, sha[..7]));
            }

            committed = true;
        });

        if (!committed)
            return;

        // Clearing IsAmending would reload the old message into the boxes, so the flag
        // goes down first and the boxes are cleared after.
        IsAmending = false;
        CommitSummary = string.Empty;
        CommitDescription = string.Empty;
        await OpenRepositoryAsync(repo);
    }

    /// <summary>Which of git's three network verbs to run.</summary>
    private enum SyncAction { Fetch, Pull, Push }

    /// <summary>
    /// Performs whatever the sync button says: publish when the remote has never seen
    /// this branch, pull when behind, push when ahead, otherwise fetch.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanPressSync))]
    private Task SyncAsync()
    {
        // Nowhere to sync to yet. The button is offering to make somewhere, which is a
        // dialog rather than a network call, so it leaves this path entirely.
        if (!HasRemote)
            return ShowPublishRepositoryAsync();

        // Publishing a branch is a push - to a branch that isn't there yet. Push writes
        // the tracking config on the way, so this only ever happens once per branch.
        return PerformSyncAsync(CanPublish || (Behind == 0 && Ahead > 0) ? SyncAction.Push
                                : Behind > 0 ? SyncAction.Pull
                                : SyncAction.Fetch);
    }

    [RelayCommand(CanExecute = nameof(CanSync))]
    private Task FetchAsync() => PerformSyncAsync(SyncAction.Fetch);

    [RelayCommand(CanExecute = nameof(CanSync))]
    private Task PullAsync() => PerformSyncAsync(SyncAction.Pull);

    [RelayCommand(CanExecute = nameof(CanSync))]
    private Task PushAsync() => PerformSyncAsync(SyncAction.Push);

    private async Task PerformSyncAsync(SyncAction action)
    {
        if (SelectedRepository is not { } repo)
            return;

        var path = repo.LocalPath;

        await RunAsync(async () =>
        {
            var credentials = await Task.Run(() => CredentialsFor(_git.GetRemoteUrl(path)));

            void Trace(string line) => _log.Write(ActivityLevel.Trace, line);

            var result = await Task.Run(() => action switch
            {
                SyncAction.Push => _git.Push(path, credentials, Trace),
                SyncAction.Pull => _git.Pull(path, credentials, Trace),
                _ => _git.Fetch(path, credentials, Trace),
            });

            // Being signed out is an ordinary outcome, so it arrives as a result rather
            // than an exception; it still belongs in the error banner, not the status one.
            Log(result.Succeeded ? ActivityLevel.Success : ActivityLevel.Error, result.Message);
        });

        await OpenRepositoryAsync(repo);
    }

    /// <summary>
    /// What the site on this domain actually runs, taken from the account signed in to
    /// it. Null when there is none, and null is what gets shown - a heading that says
    /// nothing beats one that says Gitea about a GitLab.
    /// </summary>
    /// <remarks>
    /// This used to be guessed in <see cref="HostResolver"/>: github.com was GitHub and
    /// everything else was Gitea. Signing in is the moment a site stops being a domain
    /// and starts being a known thing, so the answer comes from there.
    /// </remarks>
    private string? SiteNameFor(GitHost host)
    {
        var account = Accounts.FirstOrDefault(a =>
            string.Equals(a.BaseUrl.Host, host.Id, StringComparison.OrdinalIgnoreCase));

        return account is null ? null : _hosts.ById(account.ProviderId)?.DisplayName;
    }

    /// <summary>
    /// Finds the signed-in account matching a remote URL's domain and asks its provider
    /// for git credentials. Null is fine - public HTTPS remotes need no sign-in.
    /// </summary>
    private GitCredentials? CredentialsFor(string? remoteUrl)
    {
        if (HostResolver.Parse(remoteUrl) is not { } identity)
            return null;

        var account = Accounts.FirstOrDefault(a =>
            string.Equals(a.BaseUrl.Host, identity.Host.Id, StringComparison.OrdinalIgnoreCase));

        if (account is null)
            return null;

        return _hosts.ById(account.ProviderId)?.GetGitCredentials(account);
    }

    [RelayCommand]
    private async Task SignInWithTokenAsync()
    {
        if (SelectedProvider is not { } provider)
            return;

        if (!Uri.TryCreate(SignInServerUrl, UriKind.Absolute, out var baseUrl))
        {
            Log(ActivityLevel.Error, Strings.Get("Enter a full server URL, including https://"));
            return;
        }

        await RunAsync(async () =>
        {
            var account = await provider.SignInWithTokenAsync(baseUrl, SignInToken.Trim(), default);
            await AddAccountAsync(account);

            SignInToken = string.Empty;
            Log(ActivityLevel.Success, Strings.Format("Signed in to {0} as {1}", provider.DisplayName, account.Login));
        });
    }

    [RelayCommand]
    private async Task StartBrowserLoginAsync()
    {
        if (SelectedProvider is not { } provider)
            return;

        if (!Uri.TryCreate(SignInServerUrl, UriKind.Absolute, out var baseUrl))
        {
            Log(ActivityLevel.Error, Strings.Get("Enter a full server URL, including https://"));
            return;
        }

        await RunAsync(async () =>
        {
            var login = await provider.StartBrowserLoginAsync(baseUrl, default);
            PendingDeviceLogin = login;
            OnPropertyChanged(nameof(HasPendingDeviceLogin));

            // The code is useless where it is: it has to reach a browser. Put it on the
            // clipboard and open the page, so the common path is paste-and-approve. Both
            // can fail on a bare desktop, hence the panel keeps its own buttons.
            if (await _shell.CopyTextAsync(login.UserCode))
                Log(ActivityLevel.Info,
                Strings.Format("Copied the code {0} to the clipboard", login.UserCode));

            if (!await _shell.OpenUrlAsync(login.VerificationUri))
                Log(ActivityLevel.Warning, Strings.Format("Couldn't open a browser. Go to {0} yourself.", login.VerificationUri));

            try
            {
                var account = await provider.CompleteBrowserLoginAsync(baseUrl, login, default);
                await AddAccountAsync(account);
                Log(ActivityLevel.Success, Strings.Format("Signed in to {0} as {1}", provider.DisplayName, account.Login));
            }
            finally
            {
                PendingDeviceLogin = null;
                OnPropertyChanged(nameof(HasPendingDeviceLogin));
            }
        });
    }

    [RelayCommand]
    private async Task OpenDeviceUrlAsync()
    {
        if (PendingDeviceLogin is not { } login)
            return;

        if (!await _shell.OpenUrlAsync(login.VerificationUri))
            Log(ActivityLevel.Warning, Strings.Format("Couldn't open a browser. Go to {0} yourself.", login.VerificationUri));
    }

    [RelayCommand]
    private async Task CopyDeviceCodeAsync()
    {
        if (PendingDeviceLogin is not { } login)
            return;

        if (await _shell.CopyTextAsync(login.UserCode))
            Log(ActivityLevel.Info, Strings.Format("Copied {0} to the clipboard", login.UserCode));
        else
            Log(ActivityLevel.Warning, Strings.Get("Couldn't reach the clipboard."));
    }

    [RelayCommand]
    private async Task SignOutAsync(HostAccount account)
    {
        await RunAsync(async () =>
        {
            await _accountStore.RemoveAsync(account);
            Accounts.Remove(account);
            OnPropertyChanged(nameof(HasAccounts));

            // The picker names each host from the account signed in to it, so signing
            // one out takes that name away with it.
            RebuildGroups();

            Log(ActivityLevel.Info, Strings.Format("Signed out {0}", account.Login));
        });
    }

    private async Task AddAccountAsync(HostAccount account)
    {
        await _accountStore.SaveAsync(account);

        // Signing in again with a fresh token replaces the old entry.
        if (Accounts.FirstOrDefault(a => a.Key == account.Key) is { } existing)
            Accounts.Remove(existing);

        Accounts.Add(account);
        OnPropertyChanged(nameof(HasAccounts));

        // And signing in is the moment a domain in the picker can start saying what it
        // is, rather than only where it is.
        RebuildGroups();
    }

    [RelayCommand]
    private void ShowChangesTab() => SelectedTabIndex = 0;

    [RelayCommand]
    private void ShowHistoryTab() => SelectedTabIndex = 1;

    // ---- Commit history context menu ---------------------------------------

    /// <summary>
    /// Only ever the newest commit. Amending an older one means rewriting everything
    /// after it, which is an interactive rebase and not something this app does.
    /// </summary>
    public bool CanAmendSelectedCommit => CanAmend
                                          && SelectedCommit is { } commit
                                          && History.FirstOrDefault()?.Sha == commit.Sha;

    /// <summary>
    /// Hands over to the commit box: that is where the message is edited and files are
    /// staged, so amending has to happen on the Changes tab whatever started it. Ticking
    /// the flag is what loads the old message into the boxes.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanAmendSelectedCommit))]
    private void AmendSelectedCommit()
    {
        SelectedTabIndex = 0;
        IsAmending = true;
    }

    /// <summary>Setting the flag down is what clears the loaded message out of the boxes.</summary>
    [RelayCommand]
    private void CancelAmend() => IsAmending = false;

    private bool HasSelectedCommit => SelectedCommit is not null;

    /// <summary>
    /// Reverting and resetting both need a branch to move or to write onto, and a
    /// detached HEAD has neither.
    /// </summary>
    private bool CanChangeHistoryHere => SelectedCommit is not null && !IsDetachedHead;

    private bool CanCopyCommitTag => SelectedCommit?.HasTags == true;

    [RelayCommand(CanExecute = nameof(HasSelectedCommit))]
    private async Task CopyCommitShaAsync()
    {
        if (SelectedCommit is not { } commit)
            return;

        if (await _shell.CopyTextAsync(commit.Sha))
            Log(ActivityLevel.Info, Strings.Format("Copied {0} to the clipboard", commit.ShortSha));
        else
            Log(ActivityLevel.Warning, Strings.Get("Could not reach the clipboard"));
    }

    [RelayCommand(CanExecute = nameof(HasSelectedCommit))]
    private async Task CopyCommitSummaryAsync()
    {
        if (SelectedCommit is not { } commit)
            return;

        if (await _shell.CopyTextAsync(commit.Summary))
            Log(ActivityLevel.Info, Strings.Get("Copied the commit summary to the clipboard"));
        else
            Log(ActivityLevel.Warning, Strings.Get("Could not reach the clipboard"));
    }

    /// <summary>Every tag on the commit, since a commit can carry more than one.</summary>
    [RelayCommand(CanExecute = nameof(CanCopyCommitTag))]
    private async Task CopyCommitTagAsync()
    {
        if (SelectedCommit is not { Tags.Count: > 0 } commit)
            return;

        await CopyAsync(string.Join(" ", commit.Tags),
            Strings.Plural("Copied the tag to the clipboard",
                           "Copied the tags to the clipboard", commit.Tags.Count));
    }

    // ---- Opening the commit on the site it came from ------------------------

    public bool CanViewCommitOnHost => SelectedCommit is not null && CommitUrl(SelectedCommit) is not null;

    /// <summary>Names the site, the way GitHub Desktop's "View on GitHub" does.</summary>
    public string ViewOnHostLabel =>
        Strings.Format("View on {0}",
            SelectedRepository?.Host is { BaseUrl.Length: > 0 } host
                ? host.Name
                : Strings.Get("the hosting site"));

    /// <summary>
    /// Where this commit lives on the web. A site we are signed in to describes its own
    /// URL shape; for one we aren't, the shape nearly everything uses is still a better
    /// answer than no link at all.
    /// </summary>
    private Uri? CommitUrl(CommitInfo commit)
    {
        if (SelectedRepository is not { Host.BaseUrl.Length: > 0 } repo)
            return null;

        var account = Accounts.FirstOrDefault(a =>
            string.Equals(a.BaseUrl.Host, repo.Host.Id, StringComparison.OrdinalIgnoreCase));

        var template = account is null ? null : _hosts.ById(account.ProviderId)?.CommitUrlTemplate;

        if (account?.BaseUrl is { } signedInUrl)
            return WebLinks.CommitUrl(signedInUrl, repo.Owner, repo.Name, commit.Sha, template);

        return Uri.TryCreate(repo.Host.BaseUrl, UriKind.Absolute, out var baseUrl)
            ? WebLinks.CommitUrl(baseUrl, repo.Owner, repo.Name, commit.Sha, template)
            : null;
    }

    [RelayCommand(CanExecute = nameof(CanViewCommitOnHost))]
    private async Task ViewCommitOnHostAsync()
    {
        if (SelectedCommit is not { } commit || CommitUrl(commit) is not { } url)
            return;

        if (!await _shell.OpenUrlAsync(url))
            Log(ActivityLevel.Warning,
                Strings.Format("Couldn't open a browser. The commit is at {0}", url));
    }

    // ---- Pull requests -----------------------------------------------------
    // Deliberately the same shape as GitHub Desktop's: list them, check one out, and
    // hand off to the browser to open a new one. Creating a pull request is a form with
    // reviewers, labels and a template on it, all of which differ per site and none of
    // which belong in a branch picker.

    public ObservableCollection<PullRequest> PullRequests { get; } = [];

    [ObservableProperty]
    public partial bool IsLoadingPullRequests { get; set; }

    /// <summary>Which half of the branch picker is showing.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsBranchesTab))]
    public partial bool IsPullRequestsTab { get; set; }

    public bool IsBranchesTab => !IsPullRequestsTab;

    /// <summary>The repository the list in hand was loaded for. Null means never loaded.</summary>
    private string? _pullRequestsPath;

    /// <summary>
    /// Hidden entirely for a site that can't list them, rather than shown empty: an
    /// empty list that can never fill reads as "this project has none".
    /// </summary>
    public bool CanListPullRequests
        => HostFor(SelectedRepository) is { Provider.Capabilities.CanListPullRequests: true };

    public bool HasPullRequests => PullRequests.Count > 0;

    public string PullRequestsEmptyLabel => IsLoadingPullRequests
        ? Strings.Get("Loading…")
        : SelectedRepository is null ? Strings.Get("No repository open.")
        : HostFor(SelectedRepository) is null
            ? Strings.Get("Sign in to this site to see its pull requests.")
            : Strings.Get("No open pull requests.");

    /// <summary>
    /// The signed-in account for a clone's host, with the provider that speaks to it.
    /// The same domain match the git credentials use, so the two never disagree about
    /// which account a repository belongs to.
    /// </summary>
    private (HostAccount Account, IHostProvider Provider)? HostFor(RepositoryInfo? repository)
    {
        if (repository is not { Host.Id.Length: > 0 })
            return null;

        var account = Accounts.FirstOrDefault(a =>
            string.Equals(a.BaseUrl.Host, repository.Host.Id, StringComparison.OrdinalIgnoreCase));

        if (account is null || _hosts.ById(account.ProviderId) is not { } provider)
            return null;

        return (account, provider);
    }

    [RelayCommand]
    private void ShowBranchesTab() => IsPullRequestsTab = false;

    /// <summary>
    /// Loads on first look rather than on opening the repository. This is a network call
    /// per repository, and the automatic refresh fires on every file saved - hanging it
    /// off that would have meant an API request each time an editor wrote to disk.
    /// </summary>
    [RelayCommand]
    private async Task ShowPullRequestsTabAsync()
    {
        IsPullRequestsTab = true;

        if (SelectedRepository is { } repository && _pullRequestsPath != repository.LocalPath)
            await LoadPullRequestsAsync(announce: false);
    }

    [RelayCommand]
    private async Task RefreshPullRequestsAsync() => await LoadPullRequestsAsync(announce: true);

    private async Task LoadPullRequestsAsync(bool announce)
    {
        if (SelectedRepository is not { } repository)
            return;

        if (HostFor(repository) is not { } host)
        {
            // Not an error: a clone of a site nobody has signed in to still works for
            // everything local, and saying so on every look would be noise.
            PullRequests.Clear();
            NotifyPullRequestsChanged();
            return;
        }

        IsLoadingPullRequests = true;
        NotifyPullRequestsChanged();

        try
        {
            var loaded = await host.Provider.ListPullRequestsAsync(
                host.Account, repository.Owner, repository.Name, default);

            PullRequests.Clear();
            foreach (var pullRequest in loaded)
                PullRequests.Add(pullRequest);

            _pullRequestsPath = repository.LocalPath;

            if (announce)
            {
                Log(ActivityLevel.Info, Strings.Plural(
                    "{0} open pull request", "{0} open pull requests", loaded.Count));
            }
        }
        catch (HostProviderException ex)
        {
            // The site refusing to list them is worth saying once, in the console, and
            // is not a reason to tear the picker down.
            Log(ActivityLevel.Warning,
                Strings.Format("Couldn't list pull requests: {0}", ex.Message));
            PullRequests.Clear();
        }
        finally
        {
            IsLoadingPullRequests = false;
            NotifyPullRequestsChanged();
        }
    }

    private void NotifyPullRequestsChanged()
    {
        OnPropertyChanged(nameof(HasPullRequests));
        OnPropertyChanged(nameof(PullRequestsEmptyLabel));
        OnPropertyChanged(nameof(CanListPullRequests));
    }

    /// <summary>
    /// Fetches the pull request's head and switches to it, going through the ordinary
    /// branch-switch prompt so uncommitted work is handled the same way it is everywhere
    /// else rather than by a second, subtly different path.
    /// </summary>
    [RelayCommand]
    private async Task CheckoutPullRequestAsync(PullRequest pullRequest)
    {
        if (SelectedRepository is not { } repository)
            return;

        var path = repository.LocalPath;
        var refSpec = HostFor(repository)?.Provider.PullRequestRefSpec;
        PullRequestFetch? fetch = null;

        await RunAsync(async () =>
        {
            var credentials = await Task.Run(() => CredentialsFor(_git.GetRemoteUrl(path)));

            void Trace(string line) => _log.Write(ActivityLevel.Trace, line);

            fetch = await Task.Run(() =>
                _git.FetchPullRequest(path, pullRequest.Number, refSpec, credentials, Trace));

            Log(fetch.Result.Succeeded ? ActivityLevel.Success : ActivityLevel.Error, fetch.Result.Message);
        });

        if (fetch is not { Result.Succeeded: true })
            return;

        if (fetch.IsStale)
        {
            Log(ActivityLevel.Warning,
                Strings.Format("{0} is already here and differs from the pull request — "
                               + "it was left as it is. Delete it, or move it yourself, "
                               + "to take the new version.", fetch.BranchName));
        }

        await BeginBranchSwitchAsync(
            fetch.BranchName,
            create: fetch.IsNew,
            startPoint: fetch.IsNew ? $"refs/remotes/origin/pr/{pullRequest.Number}" : null);
    }

    [RelayCommand]
    private async Task ViewPullRequestOnHostAsync(PullRequest pullRequest)
    {
        if (!Uri.TryCreate(pullRequest.WebUrl, UriKind.Absolute, out var url))
        {
            Log(ActivityLevel.Warning,
                Strings.Format("{0} came with no link to open.", pullRequest.Reference));
            return;
        }

        if (!await _shell.OpenUrlAsync(url))
            Log(ActivityLevel.Warning,
                Strings.Format("Couldn't open a browser. The pull request is at {0}", url));
    }

    /// <summary>
    /// Nothing to propose from the default branch, and nowhere to propose it without a
    /// remote. A branch the site has not seen yet is fine - the push below sees to that.
    /// </summary>
    public bool CanCreatePullRequest
        => SelectedRepository is { HasRemote: true, IsDetached: false }
           && SelectedBranch is not null
           && NewPullRequestUrl() is not null;

    /// <summary>
    /// Why the button is disabled, or what it would propose when it isn't. A greyed
    /// button that never says what is wrong with it is the thing being avoided here.
    /// </summary>
    public string CreatePullRequestLabel
    {
        get
        {
            if (SelectedRepository is not { } repository)
                return Strings.Get("Open a repository first.");

            if (!repository.HasRemote)
                return Strings.Get("This clone has no remote, so there is nowhere to open a pull request.");

            if (repository.IsDetached || SelectedBranch is not { } branch)
                return Strings.Get("You are not on a branch. Check one out to propose it.");

            if (string.Equals(branch.Name, repository.DefaultBranch, StringComparison.Ordinal))
            {
                return Strings.Format("You are on {0}, which is what pull requests "
                                      + "merge into. Switch to another branch to propose changes.",
                                      repository.DefaultBranch);
            }

            return NewPullRequestUrl() is null
                ? Strings.Format("{0} didn't give a usable address for its pull request form.",
                                 repository.Host.Name)
                : $"{branch.Name} → {repository.DefaultBranch}";
        }
    }

    /// <summary>
    /// Opens the site's own "new pull request" form, pushing first if the branch has
    /// commits the site hasn't seen - proposing a branch that isn't there yet gives a
    /// form with nothing to compare. This is the hand-off GitHub Desktop makes too.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanCreatePullRequest))]
    private async Task CreatePullRequestAsync()
    {
        if (SelectedRepository is not { } repository || NewPullRequestUrl() is not { } url)
            return;

        var path = repository.LocalPath;

        // Asked of git rather than read off the toolbar. The compare page needs the
        // branch to be *on the remote*, and the properties behind that answer are
        // whatever the last load left there - one refresh out of date is enough to skip
        // the push and hand the user a compare page against a branch that isn't there.
        var standing = await Task.Run(() => _git.OpenRepository(path));

        var published = false;

        if (!standing.IsPublished || standing.Ahead > 0)
        {
            Log(ActivityLevel.Info,
                Strings.Format("Pushing {0} before opening the pull request form",
                               SelectedBranch?.Name ?? Strings.Get("the branch")));

            await RunAsync(async () =>
            {
                var credentials = await Task.Run(() => CredentialsFor(_git.GetRemoteUrl(path)));

                void Trace(string line) => _log.Write(ActivityLevel.Trace, line);

                var result = await Task.Run(() => _git.Push(path, credentials, Trace));

                Log(result.Succeeded ? ActivityLevel.Success : ActivityLevel.Error, result.Message);
            });

            await LoadRepositoryAsync(repository, announce: false);

            // Re-read rather than trusting the push's own word for it: a fault anywhere
            // in there is reported and swallowed by RunAsync, and "did the push work"
            // was never the question - "is the branch on the remote" is.
            published = await Task.Run(() => _git.OpenRepository(path).IsPublished);
        }
        else
        {
            published = true;
        }

        if (!published)
        {
            // The form would open on "There isn't anything to compare", which reads as a
            // broken app rather than as a branch that never left this machine.
            Log(ActivityLevel.Error,
                Strings.Format("{0} isn't on {1} yet, so there is nothing to open a pull request "
                               + "from. The push above says why it didn't get there.",
                               SelectedBranch?.Name ?? Strings.Get("The branch"),
                               repository.Host.Name));
            return;
        }

        if (!await _shell.OpenUrlAsync(url))
            Log(ActivityLevel.Warning,
                Strings.Format("Couldn't open a browser. Open a pull request at {0}", url));
    }

    /// <summary>
    /// The site's page for proposing the current branch. Built from a template so a host
    /// added from the UI gets it too - GitLab's form is a different URL shape entirely.
    /// </summary>
    private Uri? NewPullRequestUrl()
    {
        if (SelectedRepository is not { Host.BaseUrl.Length: > 0 } repository
            || SelectedBranch is not { } branch
            || string.Equals(branch.Name, repository.DefaultBranch, StringComparison.Ordinal))
        {
            return null;
        }

        var host = HostFor(repository);
        var template = host?.Provider.NewPullRequestUrlTemplate;
        var baseUrl = host?.Account.BaseUrl;

        if (baseUrl is null && !Uri.TryCreate(repository.Host.BaseUrl, UriKind.Absolute, out baseUrl))
            return null;

        return WebLinks.NewPullRequestUrl(
            baseUrl, repository.Owner, repository.Name, branch.Name, repository.DefaultBranch, template);
    }

    // ---- Branching and tagging from a commit -------------------------------

    [RelayCommand(CanExecute = nameof(HasSelectedCommit))]
    private void BranchFromSelectedCommit()
    {
        if (SelectedCommit is { } commit)
            BranchFromCommit = new BranchFromCommitViewModel(commit);
    }

    /// <summary>
    /// The way back out of a detached HEAD: the commit sitting there becomes a branch.
    /// History is walked from HEAD, so its first entry is the commit we are on.
    /// </summary>
    [RelayCommand]
    private void BranchFromHere()
    {
        if (History.FirstOrDefault() is { } head)
            BranchFromCommit = new BranchFromCommitViewModel(head);
    }

    [RelayCommand]
    private void CancelBranchFromCommit() => BranchFromCommit = null;

    [RelayCommand]
    private async Task ConfirmBranchFromCommitAsync()
    {
        if (BranchFromCommit is not { CanCreate: true } draft)
            return;

        var (name, sha) = (draft.Name.Trim(), draft.Sha);
        BranchFromCommit = null;

        await BeginBranchSwitchAsync(name, create: true, startPoint: sha);
    }

    [RelayCommand(CanExecute = nameof(HasSelectedCommit))]
    private void TagSelectedCommit()
    {
        if (SelectedCommit is { } commit)
            TagDraft = new TagDraftViewModel(commit);
    }

    [RelayCommand]
    private void CancelTag() => TagDraft = null;

    [RelayCommand]
    private async Task ConfirmTagAsync()
    {
        if (TagDraft is not { CanCreate: true } draft || SelectedRepository is not { } repo)
            return;

        var (name, message, sha) = (draft.Name.Trim(), draft.Message, draft.Sha);
        var path = repo.LocalPath;
        TagDraft = null;

        await RunAsync(async () =>
        {
            var created = await Task.Run(() => _git.CreateTag(path, name, sha, message));

            // Two whole sentences rather than one with " (annotated)" bolted on: the
            // parenthetical is a word, and a word appended to a sentence is a sentence
            // the translation cannot rearrange.
            Log(ActivityLevel.Success, string.IsNullOrWhiteSpace(message)
                ? Strings.Format("Tagged {0} as {1}", sha[..7], created)
                : Strings.Format("Tagged {0} as {1} (annotated)", sha[..7], created));
        });

        await OpenRepositoryAsync(repo);
    }

    // ---- Opening an older commit -------------------------------------------

    [RelayCommand(CanExecute = nameof(HasSelectedCommit))]
    private async Task CheckoutSelectedCommitAsync()
    {
        if (SelectedCommit is not { } commit || SelectedRepository is not { } repo)
            return;

        var path = repo.LocalPath;
        var sha = commit.Sha;

        await RunAsync(async () =>
        {
            var result = await Task.Run(() => _git.CheckoutCommit(path, sha));

            if (!result.Succeeded)
            {
                Log(ActivityLevel.Warning, result.Message);
                return;
            }

            Log(ActivityLevel.Info,
                Strings.Format("Opened {0}. You are not on a branch — make one here, or pick a "
                               + "branch to go back.", commit.ShortSha));
        });

        await OpenRepositoryAsync(repo);
    }

    // ---- Undoing and copying commits ---------------------------------------

    [RelayCommand(CanExecute = nameof(CanChangeHistoryHere))]
    private async Task RevertSelectedCommitAsync()
    {
        if (SelectedCommit is not { } commit || SelectedRepository is not { } repo)
            return;

        var path = repo.LocalPath;
        var sha = commit.Sha;

        await RunAsync(async () =>
        {
            ReportOperation(await Task.Run(() => _git.RevertCommit(path, sha)));
        });

        await OpenRepositoryAsync(repo);
    }

    [RelayCommand(CanExecute = nameof(HasSelectedCommit))]
    private void CherryPickSelectedCommit()
    {
        if (SelectedCommit is { } commit)
        {
            CherryPickDraft = new CherryPickDraftViewModel(
                commit, Branches.Where(b => !b.IsCurrent).Select(b => b.Name));
        }
    }

    [RelayCommand]
    private void CancelCherryPick() => CherryPickDraft = null;

    [RelayCommand]
    private async Task ConfirmCherryPickAsync()
    {
        if (CherryPickDraft is not { CanApply: true } draft || SelectedRepository is not { } repo)
            return;

        var (sha, onto) = (draft.Sha, draft.TargetBranch!);
        var path = repo.LocalPath;
        CherryPickDraft = null;

        await RunAsync(async () =>
        {
            ReportOperation(await Task.Run(() => _git.CherryPickCommit(path, sha, onto)));
        });

        await OpenRepositoryAsync(repo);
    }

    // ---- Moving the branch back --------------------------------------------

    [RelayCommand(CanExecute = nameof(CanChangeHistoryHere))]
    private void ResetToSelectedCommit()
    {
        if (SelectedCommit is { } commit)
            ResetDraft = new ResetDraftViewModel(commit);
    }

    [RelayCommand]
    private void CancelReset() => ResetDraft = null;

    [RelayCommand]
    private async Task ConfirmResetAsync()
    {
        if (ResetDraft is not { } draft || SelectedRepository is not { } repo)
            return;

        var (sha, kind) = (draft.Sha, draft.Kind);
        var path = repo.LocalPath;
        ResetDraft = null;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.ResetToCommit(path, sha, kind));

            Log(kind == ResetKind.Hard ? ActivityLevel.Warning : ActivityLevel.Success,
                kind switch
                {
                    ResetKind.Soft => Strings.Format(
                        "Moved the branch back to {0} — the changes are staged", sha[..7]),
                    ResetKind.Hard => Strings.Format(
                        "Reset to {0} — everything after it was discarded", sha[..7]),
                    _ => Strings.Format(
                        "Moved the branch back to {0} — the changes are in your working tree", sha[..7]),
                });
        });

        await OpenRepositoryAsync(repo);
    }

    /// <summary>
    /// Reports how one of these ended. Conflicts move the user to the Changes tab, since
    /// that is where the panel that resolves them lives and there is nothing else to do
    /// until they are dealt with.
    /// </summary>
    private void ReportOperation(CommitOperationResult result)
    {
        Log(result.Outcome switch
        {
            CommitOperationOutcome.Succeeded => ActivityLevel.Success,
            CommitOperationOutcome.NothingToDo => ActivityLevel.Info,
            _ => ActivityLevel.Warning,
        }, result.Message);

        if (result.HasConflicts)
            SelectedTabIndex = 0;
    }

    // ---- Finishing what git could not --------------------------------------

    [RelayCommand]
    private Task KeepMineAsync(string? path) => ResolveAsync(path, ConflictSide.Mine);

    [RelayCommand]
    private Task KeepTheirsAsync(string? path) => ResolveAsync(path, ConflictSide.Theirs);

    private async Task ResolveAsync(string? file, ConflictSide side)
    {
        if (string.IsNullOrEmpty(file) || SelectedRepository is not { } repo)
            return;

        var local = repo.LocalPath;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.ResolveConflict(local, file, side));

            Log(ActivityLevel.Info, side == ConflictSide.Mine
                ? Strings.Format("Kept your version of {0}", file)
                : Strings.Format("Took the incoming version of {0}", file));
        });

        await OpenRepositoryAsync(repo);
    }

    [RelayCommand]
    private async Task MarkResolvedAsync(string? file)
    {
        if (string.IsNullOrEmpty(file) || SelectedRepository is not { } repo)
            return;

        var local = repo.LocalPath;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.MarkConflictResolved(local, [file]));
            Log(ActivityLevel.Info, Strings.Format("Marked {0} as resolved", file));
        });

        await OpenRepositoryAsync(repo);
    }

    [RelayCommand]
    private void AskAbortOperation() => IsConfirmingAbort = true;

    [RelayCommand]
    private void CancelAbort() => IsConfirmingAbort = false;

    [RelayCommand]
    private async Task ConfirmAbortAsync()
    {
        if (SelectedRepository is not { } repo)
            return;

        var what = PendingOperationName;
        var path = repo.LocalPath;
        IsConfirmingAbort = false;

        await RunAsync(async () =>
        {
            await Task.Run(() => _git.AbortOperation(path));
            Log(ActivityLevel.Warning,
                Strings.Format("Abandoned the {0} — everything is back as it was", what));
        });

        // The message git prepared belongs to the operation that no longer exists.
        CommitSummary = string.Empty;
        CommitDescription = string.Empty;

        await OpenRepositoryAsync(repo);
    }

    // ---- Browse and clone --------------------------------------------------

    [RelayCommand]
    private async Task ShowCloneAsync()
    {
        GoTo(Page.Clone);

        if (_allRemotes.Count == 0)
            await LoadRemoteRepositoriesAsync();
    }

    [RelayCommand]
    private void CloseClone() => GoBack();

    /// <summary>
    /// Asks every signed-in account what it can see. Sites are queried in parallel
    /// because one slow server shouldn't hold up the rest of the list.
    /// </summary>
    [RelayCommand]
    private async Task LoadRemoteRepositoriesAsync()
    {
        if (IsLoadingRemotes)
            return;

        IsLoadingRemotes = true;

        try
        {
            var known = Repositories
                .Select(r => _git.GetRemoteUrl(r.LocalPath))
                .Where(u => u is not null)
                .Select(NormaliseUrl!)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var loaded = new List<RemoteRepositoryViewModel>();

            var lookups = Accounts
                .Select(account => (account, provider: _hosts.ById(account.ProviderId)))
                .Where(pair => pair.provider is not null)
                .Select(async pair =>
                {
                    try
                    {
                        var repositories = await pair.provider!.ListRepositoriesAsync(pair.account, default);
                        return (pair.account, repositories, error: (string?)null);
                    }
                    catch (Exception ex)
                    {
                        // One unreachable site must not empty the whole list.
                        return (pair.account, (IReadOnlyList<RemoteRepository>)[], error: ex.Message);
                    }
                })
                .ToList();

            foreach (var (account, repositories, error) in await Task.WhenAll(lookups))
            {
                if (error is not null)
                {
                    Log(ActivityLevel.Warning,
                        Strings.Format("Could not list repositories for {0}: {1}", account.Handle, error));
                    continue;
                }

                foreach (var repository in repositories)
                {
                    loaded.Add(new RemoteRepositoryViewModel(
                        repository, account, known.Contains(NormaliseUrl(repository.CloneUrl))));
                }
            }

            _allRemotes.Clear();
            _allRemotes.AddRange(loaded
                .OrderByDescending(r => r.Model.UpdatedAt ?? DateTimeOffset.MinValue)
                .ThenBy(r => r.FullName, StringComparer.OrdinalIgnoreCase));

            ApplyRemoteFilter();

            if (_allRemotes.Count > 0)
                Log(ActivityLevel.Info, Strings.Plural(
                    "Found {0} repository you can clone",
                    "Found {0} repositories you can clone", _allRemotes.Count));
        }
        finally
        {
            IsLoadingRemotes = false;
        }
    }

    /// <summary>
    /// Clone URLs vary by spelling for the same repository - trailing .git, scp form,
    /// case - so they are compared through <see cref="HostResolver"/> instead.
    /// </summary>
    private static string NormaliseUrl(string url)
        => HostResolver.Parse(url) is { } identity
            ? $"{identity.Host.Id}/{identity.Owner}/{identity.Name}"
            : url;

    private void ApplyRemoteFilter()
    {
        var filter = RemoteFilter.Trim();

        RemoteRepositories.Clear();

        foreach (var repository in _allRemotes)
        {
            if (filter.Length == 0
                || repository.FullName.Contains(filter, StringComparison.OrdinalIgnoreCase)
                || repository.Description.Contains(filter, StringComparison.OrdinalIgnoreCase))
            {
                RemoteRepositories.Add(repository);
            }
        }

        OnPropertyChanged(nameof(HasRemoteResults));
        OnPropertyChanged(nameof(RemoteEmptyLabel));
    }

    [RelayCommand]
    private async Task CloneRepositoryAsync(RemoteRepositoryViewModel repository)
    {
        var parent = await _picker.PickAsync(
            Strings.Format("Where should {0} go?", repository.Name));
        if (string.IsNullOrEmpty(parent))
            return;

        var target = System.IO.Path.Combine(parent, repository.Name);
        var url = repository.CloneUrl;
        var credentials = _hosts.ById(repository.Account.ProviderId)
            ?.GetGitCredentials(repository.Account);

        var cloned = false;

        await RunAsync(async () =>
        {
            void Trace(string line) => _log.Write(ActivityLevel.Trace, line);

            var result = await Task.Run(() => _git.Clone(url, target, credentials, Trace));

            Log(result.Succeeded ? ActivityLevel.Success : ActivityLevel.Error, result.Message);
            cloned = result.Succeeded;
        });

        if (!cloned)
            return;

        var added = await AddRepositoryPathAsync(target, persist: true);

        // Straight to the repository, not back to whatever the clone page covered: the
        // point of the clone was the repository, and it is about to be opened.
        ShowRepository();

        if (added is not null)
            await OpenRepositoryAsync(added);

        // The row should now offer to open rather than clone again.
        await LoadRemoteRepositoriesAsync();
    }

    /// <summary>
    /// Opens settings, and does nothing if it is already open. Deliberately not the
    /// toggle: the + menu's "add a hosting site" row comes through here, and a toggle
    /// would close settings at the moment that menu asked to open it.
    /// </summary>
    [RelayCommand]
    private void ShowSettings()
    {
        if (IsSettingsPageVisible)
            return;

        RefreshHostEntries();
        GoTo(Page.Settings);
    }

    /// <summary>
    /// The header's gear. Settings is an interruption rather than a destination, so
    /// closing it puts back whatever it covered - press it while reading the graph and
    /// press it again, and the graph is still there.
    /// </summary>
    [RelayCommand]
    private void ToggleSettings()
    {
        if (IsSettingsPageVisible)
            GoBack();
        else
            ShowSettings();
    }

    /// <summary>
    /// Settings' own "← Back to repository", which says where it goes. Forgets the
    /// return address with it - the user asked for the repository, not for whatever
    /// they had been looking at before.
    /// </summary>
    [RelayCommand]
    private void ShowRepository()
    {
        _returnTo = Page.Repository;
        ActivePage = Page.Repository;
    }

    /// <summary>Opens a page that can be stepped out of, remembering what it covered.</summary>
    private void GoTo(Page page)
    {
        _returnTo = ActivePage;
        ActivePage = page;
    }

    /// <summary>Uncovers whatever the current page was opened over.</summary>
    private void GoBack()
    {
        ActivePage = _returnTo;
        _returnTo = Page.Repository;
    }

    /// <summary>
    /// Straight to the accounts page, for the + menu. Signing in is the first thing a
    /// new install needs and there is nothing else the menu can usefully offer until it
    /// has happened.
    /// </summary>
    [RelayCommand]
    private void AddAccount()
    {
        ShowSettings();
        SettingsSection = 0;
    }

    [RelayCommand]
    private void ShowSettingsSection(int section)
    {
        SettingsSection = section;
        HostDraft = null;
    }

    // ---- Hosts -------------------------------------------------------------

    [RelayCommand]
    private void AddHost() => HostDraft = HostDraftViewModel.GiteaLike();

    [RelayCommand]
    private void AddGitLabLikeHost() => HostDraft = HostDraftViewModel.GitLabLike();

    [RelayCommand]
    private void EditHost(HostEntryViewModel entry)
    {
        if (_hosts.LoadUserManifest(entry.Id) is not { } manifest)
        {
            Log(ActivityLevel.Error,
                Strings.Format("Could not read the description for '{0}'.", entry.Id));
            return;
        }

        HostDraft = HostDraftViewModel.FromManifest(manifest);
    }

    [RelayCommand]
    private void CancelHostDraft() => HostDraft = null;

    /// <summary>
    /// Tries the draft against a real server before it is saved. Sign-in used to be the
    /// first thing that touched these endpoints, which meant a typo showed up as a
    /// failed login with nothing pointing at the field that caused it.
    /// </summary>
    [RelayCommand]
    private async Task TestHostAsync()
    {
        if (HostDraft is not { CanTest: true } draft)
            return;

        if (!HostConnectionTester.TryParseBaseUrl(draft.TestUrl, out var baseUrl))
        {
            Log(ActivityLevel.Error, Strings.Get("Enter the address of a server to test against."));
            return;
        }

        draft.IsTesting = true;

        try
        {
            var report = await _hosts.TestAsync(draft.ToManifest(), baseUrl, draft.TestToken, default);
            draft.ShowTestResult(report);

            foreach (var step in report.Steps)
            {
                Log(step.Outcome switch
                    {
                        ProbeOutcome.Passed => ActivityLevel.Trace,
                        ProbeOutcome.Failed => ActivityLevel.Warning,
                        _ => ActivityLevel.Trace,
                    },
                    Strings.Format("{0} — {1}: {2}", baseUrl.Host, step.Name, step.Detail));
            }
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Error,
                Strings.Format("Could not test the site: {0}", ex.Message), ex.ToString());
        }
        finally
        {
            draft.IsTesting = false;
        }
    }

    [RelayCommand]
    private void SaveHost()
    {
        if (HostDraft is not { CanSave: true } draft)
            return;

        try
        {
            _hosts.SaveUserManifest(draft.ToManifest());
            AfterHostsChanged(Strings.Format("Saved the '{0}' hosting site", draft.DisplayName));
            HostDraft = null;
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Error,
                Strings.Format("Could not save the host: {0}", ex.Message), ex.ToString());
        }
    }

    [RelayCommand]
    private void DeleteHost(HostEntryViewModel entry)
    {
        try
        {
            _hosts.DeleteUserManifest(entry.Id);
            AfterHostsChanged(Strings.Format("Removed the '{0}' hosting site", entry.DisplayName));
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Error,
                Strings.Format("Could not remove the host: {0}", ex.Message), ex.ToString());
        }
    }

    /// <summary>
    /// The registry reloaded, so every collection holding providers is now stale - the
    /// sign-in picker included, which would otherwise keep a deleted site selected.
    /// </summary>
    private void AfterHostsChanged(string message)
    {
        var previouslySelected = SelectedProvider?.Id;

        Providers.Clear();
        foreach (var provider in _hosts.Providers)
            Providers.Add(provider);

        SelectedProvider = Providers.FirstOrDefault(p => p.Id == previouslySelected)
                           ?? Providers.FirstOrDefault();

        RefreshHostEntries();
        OnPropertyChanged(nameof(HostWarnings));
        OnPropertyChanged(nameof(HasHostWarnings));

        Log(ActivityLevel.Success, message);
    }

    private void RefreshHostEntries()
    {
        HostEntries.Clear();

        foreach (var provider in _hosts.Providers)
            HostEntries.Add(new HostEntryViewModel(provider, _hosts.IsUserDefined(provider.Id)));
    }

    // ---- Loading -----------------------------------------------------------

    private async Task<RepositoryInfo?> AddRepositoryPathAsync(string path, bool persist)
    {
        if (Repositories.Any(r => string.Equals(r.LocalPath, path, StringComparison.Ordinal)))
            return null;

        RepositoryInfo info;
        try
        {
            info = await Task.Run(() => _git.OpenRepository(path));
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Error, Strings.Format("Could not open '{0}'", path), ex.Message);
            return null;
        }

        // A repo discovered from a subdirectory resolves to its working-tree root,
        // which may already be in the list.
        if (Repositories.Any(r => string.Equals(r.LocalPath, info.LocalPath, StringComparison.Ordinal)))
            return null;

        Repositories.Add(info);
        RebuildGroups();
        OnPropertyChanged(nameof(HasRepositories));

        if (persist)
            SaveRepositories();

        return info;
    }

    /// <summary>
    /// Writes the repository list and which one is open. One helper rather than three
    /// call sites spelling it out, because a writer that forgot the second argument
    /// would silently clear the answer the next launch depends on.
    /// </summary>
    private void SaveRepositories()
        => _store.Save(Repositories.Select(r => r.LocalPath), SelectedRepository?.LocalPath);

    private async Task OpenRepositoryAsync(RepositoryInfo repository)
    {
        // The list in hand belongs to whatever was open before. Cleared rather than
        // reloaded: the picker fetches on first look, so a repository nobody opens the
        // pull request tab on costs no request at all.
        if (_pullRequestsPath is not null && _pullRequestsPath != repository.LocalPath)
        {
            PullRequests.Clear();
            _pullRequestsPath = null;
            IsPullRequestsTab = false;
            NotifyPullRequestsChanged();
        }

        // Reloads pass the repository that is already open; only a genuine switch is
        // worth a fetch, or every commit would trigger one.
        var switched = SelectedRepository?.LocalPath != repository.LocalPath;

        SelectedRepository = repository;
        OnPropertyChanged(nameof(SyncDetailLabel));
        _watcher.Watch(repository.LocalPath);

        // Recorded on the switch rather than on the way out. There is no reliable
        // moment at shutdown - a crash, a kill, or the updater restarting the app all
        // skip it - and the file is a few hundred bytes.
        if (switched)
            SaveRepositories();

        await RunAsync(() => LoadRepositoryAsync(repository, announce: true));

        if (switched && IsFetchStale)
            await FetchInBackgroundAsync();
    }

    /// <summary>
    /// Nothing has fetched this clone within the interval the timer keeps to. Opening a
    /// repository last touched days ago should not show a fortnight-old picture of the
    /// remote until the first tick comes round.
    /// </summary>
    private bool IsFetchStale =>
        LastFetched is not { } when || DateTimeOffset.Now - when > BackgroundFetchInterval;

    /// <summary>
    /// Something changed on disk under the repository - an editor saved, or git ran in a
    /// terminal. Reload without the busy strip and without disturbing what the user is in
    /// the middle of, since they did not ask for this.
    /// </summary>
    private async void OnRepositoryChangedOnDisk(object? sender, EventArgs e)
    {
        // Our own git operation is already going to reload when it finishes.
        if (IsBusy || SelectedRepository is not { } repository)
            return;

        try
        {
            await LoadRepositoryAsync(repository, announce: false);
        }
        catch (Exception ex)
        {
            // An automatic refresh is not worth interrupting anyone over; the next
            // deliberate action will surface the problem properly.
            Log(ActivityLevel.Trace, Strings.Format("Automatic refresh failed: {0}", ex.Message));
        }
    }

    /// <param name="announce">
    /// False for automatic refreshes: keeps the log quiet and preserves the user's
    /// selection and tick state instead of resetting to defaults.
    /// </param>
    private async Task LoadRepositoryAsync(RepositoryInfo repository, bool announce)
    {
        var path = repository.LocalPath;

        // Captured before the reload so they can be re-applied to the new instances.
        var knownPaths = Changes.Select(c => c.Path).ToHashSet();
        var stagedPaths = Changes.Where(c => c.IsStaged).Select(c => c.Path).ToHashSet();
        var selectedChangePath = SelectedChange?.Path;
        var selectedChangePaths = SelectedChanges.Select(c => c.Path).ToList();
        var selectedSha = SelectedCommit?.Sha;
        var selectedCommitFilePath = SelectedCommitFile?.Path;

        var (info, branches, changes, history, stashes, conflicts) = await Task.Run(() => (
            _git.OpenRepository(path),
            _git.GetBranches(path),
            _git.GetWorkingChanges(path),
            _git.GetHistory(path, HistoryLimit),
            _git.GetStashes(path),
            _git.GetConflictedPaths(path)));

        Ahead = info.Ahead;
        Behind = info.Behind;
        HasRemote = info.HasRemote;
        IsPublished = info.IsPublished;
        LastFetched = info.LastFetched;
        IsDetachedHead = info.IsDetached;
        HeadShortSha = info.HeadShortSha;

        PendingOperation = info.Operation;
        Replace(ConflictedPaths, conflicts);
        OnPropertyChanged(nameof(HasConflicts));
        OnPropertyChanged(nameof(PendingOperationLabel));

        // git writes the message for the commit that finishes a merge or a revert. Only
        // offered into an empty box, so an automatic refresh can't overwrite typing.
        if (info.Operation != RepositoryOperation.None
            && string.IsNullOrWhiteSpace(CommitSummary)
            && !IsAmending
            && await Task.Run(() => _git.GetPendingMessage(path)) is { } prepared)
        {
            CommitSummary = prepared.Summary;
            CommitDescription = prepared.Description;
        }

        Replace(Branches, branches);
        RebuildBranchSections();
        Replace(History, history);

        foreach (var change in Changes)
            change.PropertyChanged -= OnChangePropertyChanged;

        Changes.Clear();
        foreach (var change in changes)
        {
            var vm = new FileChangeViewModel(change);

            // A file we already knew about keeps its tick; anything new arrives ticked,
            // which is what a fresh listing would have done anyway.
            if (!announce)
                vm.IsStaged = !knownPaths.Contains(vm.Path) || stagedPaths.Contains(vm.Path);

            vm.PropertyChanged += OnChangePropertyChanged;
            Changes.Add(vm);
        }

        // Falls back to a local branch rather than to whatever is first: the list now
        // carries branches that are only on the remote, and the toolbar would otherwise
        // name one of those as the branch being committed to.
        SelectedBranch = Branches.FirstOrDefault(b => b.IsCurrent)
                         ?? Branches.FirstOrDefault(b => !b.IsRemoteOnly);

        // Only the current branch's stashes, since that's all the commit box can offer
        // to restore without switching first.
        BranchStashes.Clear();
        foreach (var stash in stashes.Where(s => s.BranchName == SelectedBranch?.Name))
            BranchStashes.Add(stash);

        OnPropertyChanged(nameof(HasBranchStashes));
        OnPropertyChanged(nameof(StashLabel));

        SelectedChange = (announce ? null : Changes.FirstOrDefault(c => c.Path == selectedChangePath))
                         ?? Changes.FirstOrDefault();

        // Setting the anchor row above collapsed the list down to it, so the rest of a
        // ctrl-selection has to be put back by hand - otherwise a save on disk while
        // several rows are picked out silently loses all but one of them.
        if (!announce && selectedChangePaths.Count > 1)
        {
            foreach (var change in Changes.Where(c => selectedChangePaths.Contains(c.Path)
                                                      && !SelectedChanges.Contains(c)))
                SelectedChanges.Add(change);
        }

        SelectedCommit = (announce ? null : History.FirstOrDefault(c => c.Sha == selectedSha))
                         ?? History.FirstOrDefault();

        // Reloading the commit replaces its file list, so restore the chosen file once
        // that has happened rather than now.
        if (!announce && selectedCommitFilePath is not null)
            _restoreCommitFilePath = selectedCommitFilePath;

        NotifyChangeCountsChanged();

        if (!announce)
            return;

        // Five fragments with two inline plurals and two optional tails. Each piece is
        // its own translatable sentence or clause now; the line is still assembled here
        // because which clauses appear depends on the numbers, but no piece of it is
        // built by splicing a suffix onto a word.
        var summary = Strings.Format("Opened {0} on {1}",
            repository.Name, SelectedBranch?.Name ?? "?");

        summary += Strings.Format(" — {0}",
            Strings.Plural("{0} change", "{0} changes", Changes.Count));

        summary += Strings.Format(", {0}",
            Strings.Plural("{0} branch", "{0} branches", Branches.Count));

        if (info.Ahead > 0)
            summary += Strings.Format(", {0}", Strings.Plural("{0} ahead", "{0} ahead", info.Ahead));

        if (info.Behind > 0)
            summary += Strings.Format(", {0}", Strings.Plural("{0} behind", "{0} behind", info.Behind));

        Log(ActivityLevel.Trace, summary);
    }

    /// <summary>Commit diffs are loaded only when a commit is actually selected.</summary>
    partial void OnSelectedCommitChanged(CommitInfo? value)
    {
        NotifyCommitCommandsChanged();

        if (_isDesignTime || value is null || SelectedRepository is not { } repo)
        {
            SelectedCommitFiles.Clear();
            OnPropertyChanged(nameof(SelectedCommitFilesLabel));
            return;
        }

        _ = LoadCommitFilesAsync(repo.LocalPath, value.Sha);
    }

    private async Task LoadCommitFilesAsync(string path, string sha)
    {
        try
        {
            var files = await Task.Run(() => _git.GetCommitFiles(path, sha));

            // The user may have clicked another commit while this was loading.
            if (SelectedCommit?.Sha != sha)
                return;

            Replace(SelectedCommitFiles, files);
            OnPropertyChanged(nameof(SelectedCommitFilesLabel));

            // Show the first file's diff rather than an empty pane - unless an automatic
            // refresh asked to put the user back on the file they were reading.
            SelectedCommitFile =
                (_restoreCommitFilePath is { } wanted
                    ? SelectedCommitFiles.FirstOrDefault(f => f.Path == wanted)
                    : null)
                ?? SelectedCommitFiles.FirstOrDefault();

            _restoreCommitFilePath = null;
        }
        catch (Exception ex)
        {
            Log(ActivityLevel.Error, ex.Message, ex.ToString());
        }
    }

    /// <summary>Runs a git operation with busy state and error capture around it.</summary>
    private async Task RunAsync(Func<Task> operation)
    {
        IsBusy = true;
        CommitCommand.NotifyCanExecuteChanged();

        try
        {
            await operation();
        }
        catch (Exception ex)
        {
            // Unexpected faults still reach the user rather than vanishing.
            Log(ActivityLevel.Error, ex.Message, ex.ToString());
        }
        finally
        {
            IsBusy = false;
            OnPropertyChanged(nameof(CanCommit));
            CommitCommand.NotifyCanExecuteChanged();
        }
    }

    private void RebuildGroups()
    {
        var groups = Repositories
            .GroupBy(r => r.Host)
            .Select(g => new HostGroupViewModel
            {
                Host = g.Key,
                Repositories = g.ToList(),
                SiteName = SiteNameFor(g.Key),
            })
            .OrderBy(g => g.Host.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        Replace(RepositoryGroups, groups);
        Replace(Hosts, Repositories.Select(r => r.Host).Distinct().ToList());
    }

    private static void Replace<T>(ObservableCollection<T> target, IReadOnlyList<T> items)
    {
        target.Clear();
        foreach (var item in items)
            target.Add(item);
    }

    private void OnChangePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(FileChangeViewModel.IsStaged))
            NotifyChangeCountsChanged();
    }

    /// <summary>
    /// Everything in the history's context menu acts on the selected commit. Done in one
    /// place rather than as a stack of attributes on the property, which by the ninth
    /// entry says less about what the menu offers than this does.
    /// </summary>
    private void NotifyCommitCommandsChanged()
    {
        CopyCommitShaCommand.NotifyCanExecuteChanged();
        CopyCommitSummaryCommand.NotifyCanExecuteChanged();
        CopyCommitTagCommand.NotifyCanExecuteChanged();
        ViewCommitOnHostCommand.NotifyCanExecuteChanged();
        BranchFromSelectedCommitCommand.NotifyCanExecuteChanged();
        TagSelectedCommitCommand.NotifyCanExecuteChanged();
        CheckoutSelectedCommitCommand.NotifyCanExecuteChanged();
        RevertSelectedCommitCommand.NotifyCanExecuteChanged();
        CherryPickSelectedCommitCommand.NotifyCanExecuteChanged();
        ResetToSelectedCommitCommand.NotifyCanExecuteChanged();

        OnPropertyChanged(nameof(CanViewCommitOnHost));
        OnPropertyChanged(nameof(ViewOnHostLabel));
    }

    private void NotifyChangeCountsChanged()
    {
        OnPropertyChanged(nameof(StagedCount));
        OnPropertyChanged(nameof(StagedCountLabel));
        OnPropertyChanged(nameof(CanCommit));
        OnPropertyChanged(nameof(AreAllStaged));
        OnPropertyChanged(nameof(CommitSummaryPlaceholder));
        CommitCommand.NotifyCanExecuteChanged();
    }

    private void LoadDesignTimeData()
    {
        Replace(Repositories, MockData.Repositories);
        Replace(Branches, MockData.Branches);
        RebuildBranchSections();
        Replace(History, MockData.History);
        Replace(Hosts, MockData.Hosts);

        foreach (var change in MockData.WorkingChanges)
            Changes.Add(new FileChangeViewModel(change));

        RebuildGroups();
        SelectedRepository = Repositories.FirstOrDefault();
        SelectedBranch = Branches.FirstOrDefault();
        SelectedChange = Changes.FirstOrDefault();
        SelectedCommit = History.FirstOrDefault();
    }
}
