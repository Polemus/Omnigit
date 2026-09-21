using System.Collections.Generic;
using CommunityToolkit.Mvvm.ComponentModel;
using Omnigit.HostProviders;
using Omnigit.Services;

namespace Omnigit.ViewModels;

/// <summary>
/// Putting a repository that already exists here onto a hosting site.
/// </summary>
/// <remarks>
/// The new-repository form can do this on the way, so this is not the only route - but
/// it is the only one for the two cases that never saw that form: a clone whose remote
/// is gone, and a folder added from disk that never had one. It differs from the
/// section embedded there in one way, which is why <see cref="PublishTargetViewModel"/>
/// takes a flag rather than being used identically: a dialog whose entire job is to
/// publish has nothing to offer if the answer is "nowhere".
/// </remarks>
public partial class PublishRepositoryViewModel : ObservableObject
{
    public PublishRepositoryViewModel(string name, string description, IEnumerable<HostAccount> accounts)
    {
        Name = name;
        Description = description;
        Target = new PublishTargetViewModel(accounts, allowNone: false);

        Target.PropertyChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(CanPublish));
            OnPropertyChanged(nameof(SummaryLabel));
        };
    }

    /// <summary>Design-time only; the real one is handed the accounts that can create.</summary>
    public PublishRepositoryViewModel() : this("my-project", string.Empty, []) { }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanPublish))]
    [NotifyPropertyChangedFor(nameof(SummaryLabel))]
    public partial string Name { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Description { get; set; } = string.Empty;

    /// <summary>Which site, which owner, and whether the world may see it.</summary>
    public PublishTargetViewModel Target { get; }

    public bool CanPublish => !string.IsNullOrWhiteSpace(Name) && Target.HasSite && Target.HasOwner;

    /// <summary>What is about to happen, named in full so it can be read back before pressing.</summary>
    public string SummaryLabel => Target is { Owner: { } owner, HasSite: true }
        ? Strings.Format("Creates {0}/{1} on {2}, points origin at it and pushes.",
                         owner.Login, Name.Trim(), Target.SiteHost)
        : Strings.Get("Omnigit creates it empty on the site, points origin at it and pushes what is here.");

    public NewRepository? ToRequest() => Target.ToRequest(Name, Description);
}
