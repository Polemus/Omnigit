using System.Collections.Generic;
using Omnigit.Models;

namespace Omnigit.ViewModels;

/// <summary>Repositories bucketed under the host they came from, for the repo picker.</summary>
public sealed class HostGroupViewModel
{
    public required GitHost Host { get; init; }
    public required IReadOnlyList<RepositoryInfo> Repositories { get; init; }

    /// <summary>
    /// What the site runs, according to the account signed in to it - "Gitea", "GitLab",
    /// or whatever a user-written manifest calls itself. Null when nobody is signed in
    /// to this host, which is the honest answer: a domain does not say what it runs.
    /// </summary>
    public string? SiteName { get; init; }

    public string Header => Host.Name;

    /// <summary>
    /// The site is only worth printing when it isn't already the name: on github.com
    /// both are "GitHub" and the heading stutters, whereas "git.homelab.net" gains from
    /// being labelled Gitea - once something knows that it is one.
    /// </summary>
    public string SubHeader
    {
        get
        {
            var count = Repositories.Count == 1
                ? "1 repository"
                : $"{Repositories.Count} repositories";

            return SiteName is null || SiteName == Host.Name ? count : $"{SiteName} · {count}";
        }
    }
}
