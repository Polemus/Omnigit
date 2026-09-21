using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using Omnigit.HostProviders;
using Omnigit.Services;

namespace Omnigit.ViewModels;

/// <summary>
/// The "new repository" form: a name, where to put it, which starting files to write
/// before the first commit, and - optionally - the site to publish it to on the way.
/// </summary>
/// <remarks>
/// The site is asked for here but still acted on <em>last</em>. Init, the starting
/// files and the first commit all happen before anything is sent anywhere, which is the
/// order that avoids an empty clone: the first commit exists before the site's
/// repository does, so the very first push is a fast-forward rather than two unrelated
/// roots to reconcile.
///
/// GitHub Desktop splits this into two dialogs and Omnigit did too, briefly. It reads
/// as a missing feature rather than a sequence - the form asks for a name and a licence
/// and then appears not to care where the thing goes - so the destination is on this
/// form with "nowhere yet" as the default. The publish dialog stays, because a
/// repository started locally or added from disk has never seen this form.
/// </remarks>
public partial class NewRepositoryViewModel : ObservableObject
{
    public NewRepositoryViewModel(IEnumerable<HostAccount> accounts)
    {
        Publish = new PublishTargetViewModel(accounts, allowNone: true);

        // The caption changes with the destination, and so does whether Create can run
        // at all while an owner list is still arriving.
        Publish.PropertyChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(CanCreate));
            OnPropertyChanged(nameof(CreateButtonLabel));
            OnPropertyChanged(nameof(SummaryLabel));
        };
    }

    /// <summary>Design-time only; the real one is handed the accounts that can create.</summary>
    public NewRepositoryViewModel() : this([]) { }

    /// <summary>Where it goes afterwards, if anywhere. Never null - see its remarks.</summary>
    public PublishTargetViewModel Publish { get; }

    /// <summary>
    /// What a repository is called here when nothing has been typed yet. Only ever used
    /// for the path preview - <see cref="CanCreate"/> refuses an empty name.
    /// </summary>
    private const string Unnamed = "…";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanCreate))]
    [NotifyPropertyChangedFor(nameof(TargetPath))]
    [NotifyPropertyChangedFor(nameof(PathLabel))]
    [NotifyPropertyChangedFor(nameof(Problem))]
    [NotifyPropertyChangedFor(nameof(HasProblem))]
    public partial string Name { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Description { get; set; } = string.Empty;

    /// <summary>The folder the repository's own directory is made inside.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanCreate))]
    [NotifyPropertyChangedFor(nameof(TargetPath))]
    [NotifyPropertyChangedFor(nameof(PathLabel))]
    [NotifyPropertyChangedFor(nameof(Problem))]
    [NotifyPropertyChangedFor(nameof(HasProblem))]
    public partial string ParentPath { get; set; } = string.Empty;

    /// <summary>
    /// Whether to write a README. On by default, because it is what makes the first
    /// commit worth having: a repository with no commits has no branch either, so the
    /// toolbar can say nothing useful about it until something lands.
    /// </summary>
    [ObservableProperty]
    public partial bool WriteReadme { get; set; } = true;

    [ObservableProperty]
    public partial string GitignoreName { get; set; } = RepositoryTemplates.None;

    /// <summary>
    /// The chosen licence, or the "None" entry. An object rather than a bare id because
    /// the picker shows the licence's own title - "GNU General Public License v3.0", not
    /// "gpl-3.0" - and a ComboBox of strings has nowhere to put the other half.
    /// </summary>
    [ObservableProperty]
    public partial LicenceOption Licence { get; set; } = Licences[0];

    public IReadOnlyList<string> GitignoreNames => RepositoryTemplates.GitignoreNames;

    public static IReadOnlyList<LicenceOption> Licences { get; } =
        [.. RepositoryTemplates.LicenceIds.Select(id => new LicenceOption(id, RepositoryTemplates.LicenceTitle(id)))];

    /// <summary>Where the repository will actually be made, parent and name together.</summary>
    public string TargetPath => string.IsNullOrWhiteSpace(ParentPath)
        ? string.Empty
        : Path.Combine(ParentPath.Trim(), Name.Trim() is { Length: > 0 } name ? name : Unnamed);

    public string PathLabel => string.IsNullOrEmpty(TargetPath)
        ? Strings.Get("Choose where to put it.")
        : Strings.Format("It will be created at {0}", TargetPath);

    /// <summary>
    /// What is wrong with the answers so far, or empty. Said out loud rather than left
    /// to a disabled button, since "already exists" is the case people hit and a greyed
    /// Create with no explanation reads as the app being broken.
    /// </summary>
    public string Problem
    {
        get
        {
            var name = Name.Trim();

            if (name.Length == 0 || string.IsNullOrWhiteSpace(ParentPath))
                return string.Empty;

            if (name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                return Strings.Get("That name has characters a folder can't have in it.");

            // A directory with something in it is the one git itself refuses, and the
            // one worth naming: an empty folder made a moment ago in the picker is fine.
            if (Directory.Exists(TargetPath) && Directory.EnumerateFileSystemEntries(TargetPath).Any())
                return $"{TargetPath} already exists and isn't empty.";

            return string.Empty;
        }
    }

    public bool HasProblem => Problem.Length > 0;

    public bool CanCreate => !string.IsNullOrWhiteSpace(Name)
                             && !string.IsNullOrWhiteSpace(ParentPath)
                             && Problem.Length == 0

                             // A site picked a moment ago whose organisations are still
                             // in flight. Pressing Create then would publish to whatever
                             // the list settled on, which is not what was on screen.
                             && Publish.IsSettled;

    /// <summary>
    /// The verb on the confirming button. One press does noticeably more once a site is
    /// chosen - it reaches the network and creates something on someone else's server -
    /// and a button that says the same thing either way hides that until afterwards.
    /// </summary>
    public string CreateButtonLabel =>
        Publish.HasSite ? Strings.Get("Create and publish") : Strings.Get("Create repository");

    /// <summary>The sentence above the buttons, which is a different one per destination.</summary>
    public string SummaryLabel => Publish.HasSite
        ? Strings.Format("Omnigit creates it here, then on {0}, and pushes what it committed.",
                         Publish.SiteHost)
        : Strings.Get("Omnigit creates it here and commits whatever you asked for above. "
                      + "Publishing it to a site later is the sync button.");

    /// <summary>
    /// The files to write before the first commit, as relative path and contents. Empty
    /// when the user asked for none, which leaves a repository with no commits - valid,
    /// and what someone importing existing work into a fresh folder wants.
    /// </summary>
    public IReadOnlyList<(string Path, string Contents)> StartingFiles(string authorName)
    {
        var files = new List<(string, string)>();
        var name = Name.Trim();

        if (WriteReadme)
            files.Add(("README.md", RepositoryTemplates.Readme(name, Description)));

        if (RepositoryTemplates.Gitignore(GitignoreName) is { } ignore)
            files.Add((".gitignore", ignore));

        if (RepositoryTemplates.Licence(Licence.Id, authorName, name, DateTime.Now.Year) is { } licence)
            files.Add(("LICENSE", licence));

        return files;
    }
}

/// <summary>One row of the licence picker: what to write, and what to call it.</summary>
public sealed record LicenceOption(string Id, string Title)
{
    public override string ToString() => Title;
}
