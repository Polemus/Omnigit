using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using Omnigit.HostProviders;
using Omnigit.Services;

namespace Omnigit.ViewModels;

/// <summary>
/// Where a repository is going, and how much of the world may see it when it gets
/// there: a site, an owner on that site, and the private flag.
/// </summary>
/// <remarks>
/// One type used by both dialogs. The new-repository form embeds it with a "nowhere
/// yet" entry so creating and publishing can be one press; the publish form embeds it
/// without one, because a dialog whose entire job is to publish has nothing to offer if
/// the answer is "don't". Keeping it in one place is what stops the two forms drifting
/// into asking the same question two different ways.
///
/// It holds no registry and does no networking - <c>MainWindowViewModel</c> fills
/// <see cref="Owners"/> when <see cref="Target"/> changes, since organisations belong to
/// one site and mean nothing on another.
/// </remarks>
public partial class PublishTargetViewModel : ObservableObject
{
    /// <summary>What the "don't publish this anywhere" entry reads as.</summary>
    /// <summary>
    /// A property rather than a const: a const is baked into every call site at compile
    /// time, which is exactly the wrong thing for a string that changes with the language.
    /// </summary>
    public static string NowhereLabel => Strings.Get("Nowhere yet — just on this machine");

    public PublishTargetViewModel(IEnumerable<HostAccount> accounts, bool allowNone)
    {
        if (allowNone)
            Targets.Add(new PublishTarget(null, NowhereLabel));

        foreach (var account in accounts)
            Targets.Add(new PublishTarget(account, $"{account.Handle} on {account.BaseUrl.Host}"));

        Target = Targets.FirstOrDefault();
    }

    /// <summary>Design-time only.</summary>
    public PublishTargetViewModel() : this([], allowNone: true) { }

    /// <summary>The sites on offer, plus "nowhere" where that is allowed.</summary>
    public ObservableCollection<PublishTarget> Targets { get; } = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Account))]
    [NotifyPropertyChangedFor(nameof(HasSite))]
    [NotifyPropertyChangedFor(nameof(SiteHost))]
    public partial PublishTarget? Target { get; set; }

    /// <summary>The chosen account, or null for "just on this machine".</summary>
    public HostAccount? Account => Target?.Account;

    /// <summary>
    /// True once a site is chosen. Everything below - the owner, the private flag - is
    /// meaningless until then, so the form hides all of it rather than asking questions
    /// about a destination that does not exist.
    /// </summary>
    public bool HasSite => Account is not null;

    public string SiteHost => Account?.BaseUrl.Host ?? string.Empty;

    /// <summary>
    /// False when no signed-in account can create anything, and then the picker is
    /// hidden entirely - a dropdown offering only "nowhere" is a question with one
    /// answer.
    /// </summary>
    public bool CanChooseSite => Targets.Any(t => t.Account is not null);

    /// <summary>The account itself, and any organisation on it.</summary>
    public ObservableCollection<RepositoryOwner> Owners { get; } = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasOwner))]
    public partial RepositoryOwner? Owner { get; set; }

    public bool HasOwner => Owner is not null;

    /// <summary>Belonging to no organisation is not a choice, so the picker stays hidden.</summary>
    public bool HasChoiceOfOwner => Owners.Count > 1;

    [ObservableProperty]
    public partial bool IsLoadingOwners { get; set; }

    /// <summary>
    /// Why the site could not be asked about its organisations, or empty.
    /// </summary>
    /// <remarks>
    /// Shown in the form, because the fallback below it is otherwise silent: a site that
    /// refused the connection is still offered with the account's own name as the only
    /// owner, so the form looks entirely healthy right up until Create reaches the
    /// network and fails. Falling back is still right - a 403 from a token without
    /// <c>read:org</c> means fewer organisations, not a broken site - but it must not be
    /// invisible.
    /// </remarks>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSiteProblem))]
    public partial string SiteProblem { get; set; } = string.Empty;

    public bool HasSiteProblem => SiteProblem.Length > 0;

    /// <summary>
    /// Private by default. The cost of the two mistakes is not symmetric: a private
    /// repository made public later is a click, and code published by accident is on
    /// somebody's crawler before it can be taken back.
    /// </summary>
    [ObservableProperty]
    public partial bool IsPrivate { get; set; } = true;

    /// <summary>
    /// Ready to be acted on: either no site was chosen, or one was and its owner has
    /// arrived. The owner list is fetched, so there is a moment where a site is picked
    /// and the answer is still in flight.
    /// </summary>
    public bool IsSettled => !HasSite || Owner is not null;

    public void SetOwners(IEnumerable<RepositoryOwner> owners)
    {
        SiteProblem = string.Empty;
        Owners.Clear();

        foreach (var owner in owners)
            Owners.Add(owner);

        Owner = Owners.FirstOrDefault();
        OnPropertyChanged(nameof(HasChoiceOfOwner));
    }

    /// <summary>What to ask the site for, or null when nothing is being published.</summary>
    public NewRepository? ToRequest(string name, string description)
        => HasSite
            ? new NewRepository
            {
                Name = name.Trim(),
                Description = description.Trim(),
                IsPrivate = IsPrivate,
                Owner = Owner,
            }
            : null;
}

/// <summary>One row of the site picker: the account, and what to call it.</summary>
public sealed record PublishTarget(HostAccount? Account, string Label)
{
    public override string ToString() => Label;
}
