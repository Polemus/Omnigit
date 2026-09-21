using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using Omnigit.Services;

namespace Omnigit.ViewModels;

/// <summary>
/// The question asked when you switch branches with uncommitted work: does it come with
/// you, or stay here. Only exists while the prompt is on screen.
/// </summary>
public partial class BranchSwitchViewModel : ObservableObject
{
    public BranchSwitchViewModel(
        string fromBranch, string targetBranch, bool create, IEnumerable<FileChangeViewModel> changes,
        string? startPoint = null)
    {
        FromBranch = fromBranch;
        TargetBranch = targetBranch;
        Create = create;
        StartPoint = startPoint;

        foreach (var change in changes)
        {
            // Everything comes along unless the user says otherwise, matching what git
            // does when it can.
            var item = new FileChangeViewModel(change.Model) { IsStaged = true };
            item.PropertyChanged += OnFileChanged;
            Files.Add(item);
        }
    }

    public string FromBranch { get; }

    public string TargetBranch { get; }

    /// <summary>True when the target branch doesn't exist yet.</summary>
    public bool Create { get; }

    /// <summary>
    /// The commit a created branch starts at, when that isn't HEAD. Carried through the
    /// prompt so confirming it lands on the same commit the menu was opened over.
    /// </summary>
    public string? StartPoint { get; }

    /// <summary>The uncommitted files. IsStaged means "bring this one across".</summary>
    public ObservableCollection<FileChangeViewModel> Files { get; } = [];

    /// <summary>
    /// True to carry the ticked files, false to leave every change behind. Kept separate
    /// from the ticks so unticking everything and choosing "leave" read the same.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsBringing))]
    [NotifyPropertyChangedFor(nameof(Summary))]
    [NotifyPropertyChangedFor(nameof(ConfirmLabel))]
    public partial bool LeaveEverything { get; set; }

    public bool IsBringing => !LeaveEverything;

    public int BringCount => Files.Count(f => f.IsStaged);

    public bool AllSelected
    {
        get => Files.Count > 0 && Files.All(f => f.IsStaged);
        set
        {
            foreach (var file in Files)
                file.IsStaged = value;
        }
    }

    public string Title => Create
        ? Strings.Format("Create {0} from {1}", TargetBranch, FromBranch)
        : Strings.Format("Switch to {0}", TargetBranch);

    public string Summary
    {
        get
        {
            var total = Files.Count;

            // Whole sentences rather than a pluralized noun phrase built once and dropped
            // into either of them: "{0} uncommitted changes" cannot be declined on its own,
            // and where it sits in the sentence is the translation's business.
            return LeaveEverything
                ? Strings.Plural(
                    "{0} uncommitted change will be stashed on {1}.",
                    "{0} uncommitted changes will be stashed on {1}.",
                    total, FromBranch)
                : Strings.Plural(
                    "{1} of {0} uncommitted change will come with you; the rest is stashed on {2}.",
                    "{1} of {0} uncommitted changes will come with you; the rest is stashed on {2}.",
                    total, BringCount, FromBranch);
        }
    }

    public string ConfirmLabel => LeaveEverything
        ? Strings.Get("Stash and switch")
        : Strings.Get("Switch");

    /// <summary>Null means "bring everything", which lets the service do a plain checkout.</summary>
    public IReadOnlyList<string>? BringPaths()
    {
        if (LeaveEverything)
            return [];

        return AllSelected ? null : Files.Where(f => f.IsStaged).Select(f => f.Path).ToList();
    }

    private void OnFileChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(FileChangeViewModel.IsStaged))
            return;

        OnPropertyChanged(nameof(BringCount));
        OnPropertyChanged(nameof(AllSelected));
        OnPropertyChanged(nameof(Summary));
    }
}
