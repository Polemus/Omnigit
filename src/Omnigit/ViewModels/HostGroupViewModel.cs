using System.Collections.Generic;
using Omnigit.Models;
using Omnigit.Services;

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
            // The count decides which form, so there is no branch here any more: what was
            // an if for English's two cases is the catalogue's business now.
            var count = Strings.Plural("{0} repository", "{0} repositories", Repositories.Count);

            return SiteName is null || SiteName == Host.Name ? count : $"{SiteName} · {count}";
        }
    }
}
