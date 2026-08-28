namespace Omnigit.Models;

/// <summary>
/// A git forge Omnigit can talk to, identified by the domain its clones came from.
/// </summary>
/// <remarks>
/// It used to carry a <c>Kind</c> as well, guessed from the domain: github.com was
/// GitHub and everything else was Gitea. That guess was printed in the repository
/// picker, so a GitLab or Bitbucket remote was labelled Gitea to the user's face. The
/// comment beside it promised a probe of <c>/api/v1/version</c> to confirm the guess
/// before anything relied on the API dialect, and that design was overtaken: hosting
/// sites are manifests now, and which one handles a domain is answered by the account
/// signed in to it rather than by its name. So the field is gone rather than confirmed,
/// along with the accent and badge nothing ever rendered.
/// </remarks>
public sealed class GitHost
{
    public required string Id { get; init; }

    /// <summary>Display name, e.g. "GitHub" or "git.homelab.net".</summary>
    public required string Name { get; init; }

    /// <summary>API/web root, e.g. "https://github.com".</summary>
    public required string BaseUrl { get; init; }
}
