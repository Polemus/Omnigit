using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Avalonia.Controls;
using CommunityToolkit.Mvvm.ComponentModel;
using Omnigit.Models;
using Omnigit.Plugins;
using Omnigit.Services;
using Omnigit.Services.Plugins;

namespace Omnigit.ViewModels;

/// <summary>One entry in the viewer picker above a diff.</summary>
public sealed record ViewerOption(IChangeViewer Viewer, string Name);

/// <summary>
/// The context Omnigit's own viewers are handed: the public one plus the change as the
/// app already holds it, so the text viewer can reuse rows that are already parsed.
/// A plugin sees only the base type.
/// </summary>
public sealed class RepositoryChangeContext(
    FileChange fileChange,
    ChangeInfo change,
    Func<CancellationToken, Task<byte[]?>> readOld,
    Func<CancellationToken, Task<byte[]?>> readNew,
    CancellationToken closed)
    : ChangeContext(change, fileChange.Patch, readOld, readNew, closed)
{
    public FileChange FileChange { get; } = fileChange;
}

/// <summary>
/// Which viewer the user last picked for each extension. For the session only: it is a
/// convenience, and a choice that outlived a plugin being removed would need its own
/// clean-up for no real gain.
/// </summary>
public sealed class ViewerChoices
{
    private readonly Dictionary<string, string> _byExtension = new(StringComparer.Ordinal);

    public string? For(string extension) => _byExtension.GetValueOrDefault(extension);

    public void Remember(string extension, string viewerId) => _byExtension[extension] = viewerId;
}

/// <summary>
/// The diff pane for one selected file: which viewers can show it, which one is, and
/// the control that viewer made.
/// </summary>
/// <remarks>
/// One of these per selection, thrown away when the selection moves. Disposing it
/// cancels <see cref="ChangeContext.Closed"/>, which is how a viewer still reading a
/// large image learns to stop - and why switching quickly between files never paints
/// the previous one's picture.
/// </remarks>
public sealed partial class ChangeViewerViewModel : ObservableObject, IDisposable
{
    /// <summary>What a viewer may read into memory per side.</summary>
    public const long MaxSideBytes = 50L * 1024 * 1024;

    private readonly string _repositoryPath;
    private readonly IGitService _git;
    private readonly ChangeViewerRegistry _registry;
    private readonly ViewerChoices _choices;
    private readonly ChangeInfo _info;
    private CancellationTokenSource? _closed;
    private bool _populating;

    public ChangeViewerViewModel(
        FileChange change, string repositoryPath, IGitService git,
        ChangeViewerRegistry registry, ViewerChoices choices)
    {
        Change = change;
        _repositoryPath = repositoryPath;
        _git = git;
        _registry = registry;
        _choices = choices;
        _info = ToInfo(change);

        _registry.Changed += Populate;
        Populate();
    }

    public FileChange Change { get; }

    public ObservableCollection<ViewerOption> Viewers { get; } = [];

    /// <summary>The picker only appears when there is something to pick between.</summary>
    public bool HasChoice => Viewers.Count > 1;

    [ObservableProperty]
    public partial ViewerOption? SelectedViewer { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasProblem))]
    public partial string? Problem { get; set; }

    public bool HasProblem => !string.IsNullOrEmpty(Problem);

    [ObservableProperty]
    public partial Control? Content { get; set; }

    internal static ChangeInfo ToInfo(FileChange change) => new(
        change.Path,
        change.OldPath,
        change.Status switch
        {
            ChangeStatus.Added => ChangeKind.Added,
            ChangeStatus.Deleted => ChangeKind.Deleted,
            ChangeStatus.Renamed => ChangeKind.Renamed,
            ChangeStatus.Conflicted => ChangeKind.Conflicted,
            _ => ChangeKind.Modified,
        });

    private void Populate()
    {
        var current = SelectedViewer?.Viewer.Id;

        _populating = true;
        Viewers.Clear();
        foreach (var viewer in _registry.For(_info))
            Viewers.Add(new ViewerOption(viewer, viewer.Name));
        _populating = false;

        OnPropertyChanged(nameof(HasChoice));

        // Keep what is showing if it is still offered, then the user's last choice for
        // this kind of file, then the best match.
        var wanted = current ?? _choices.For(_info.Extension);
        var pick = Viewers.FirstOrDefault(v => v.Viewer.Id == wanted) ?? Viewers.FirstOrDefault();

        if (pick?.Viewer.Id == current && Content is not null)
            SelectedViewer = Viewers.First(v => v.Viewer.Id == current);
        else
        {
            _populating = true;
            SelectedViewer = pick;
            _populating = false;
            Build();
        }
    }

    partial void OnSelectedViewerChanged(ViewerOption? value)
    {
        if (_populating || value is null)
            return;

        _choices.Remember(_info.Extension, value.Viewer.Id);
        Build();
    }

    private void Build()
    {
        CloseCurrent();
        Problem = null;
        Content = null;

        if (SelectedViewer?.Viewer is not { } viewer)
            return;

        var closed = new CancellationTokenSource();
        _closed = closed;

        var context = new RepositoryChangeContext(
            Change, _info,
            ct => Read(FileSide.Old, ct),
            ct => Read(FileSide.New, ct),
            closed.Token);

        try
        {
            Content = viewer.Create(context);
        }
        catch (Exception ex)
        {
            // Someone else's code, running on the UI thread: whatever it throws stays here.
            Problem = Strings.Format("The {0} viewer couldn't show this file: {1}", viewer.Name, ex.Message);
            _registry.Complain(viewer.Id, _registry.SourceOf(viewer), Problem, ex.ToString());
        }
    }

    private Task<byte[]?> Read(FileSide side, CancellationToken cancellation)
        => Task.Run(() =>
        {
            cancellation.ThrowIfCancellationRequested();
            return _git.ReadSide(_repositoryPath, Change, side, MaxSideBytes);
        }, cancellation);

    private void CloseCurrent()
    {
        // Cleared before it is cancelled and disposed, so nothing can reach a disposed source.
        if (_closed is not { } closed)
            return;

        _closed = null;
        closed.Cancel();
        closed.Dispose();
    }

    public void Dispose()
    {
        _registry.Changed -= Populate;
        CloseCurrent();
        Content = null;
    }
}
