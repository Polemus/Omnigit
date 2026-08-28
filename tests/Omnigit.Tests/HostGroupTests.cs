using Omnigit.Models;
using Omnigit.ViewModels;

namespace Omnigit.Tests;

/// <summary>
/// What the repository picker prints above each group of clones.
/// </summary>
/// <remarks>
/// The site name used to be guessed from the domain - github.com was GitHub and
/// everything else was Gitea, so a GitLab host was labelled Gitea to the user's face.
/// It now comes from the account signed in to that host, and says nothing when there
/// is none.
/// </remarks>
public class HostGroupTests
{
    private static GitHost Host(string id, string name) =>
        new() { Id = id, Name = name, BaseUrl = $"https://{id}" };

    private static HostGroupViewModel Group(GitHost host, int repositories, string? siteName) =>
        new()
        {
            Host = host,
            SiteName = siteName,
            Repositories = Enumerable.Range(0, repositories)
                .Select(i => new RepositoryInfo
                {
                    Name = $"repo{i}",
                    LocalPath = $"/tmp/repo{i}",
                    Owner = "someone",
                    Host = host,
                    DefaultBranch = "main",
                })
                .ToList(),
        };

    [Fact]
    public void A_host_nobody_is_signed_in_to_is_not_labelled_anything()
    {
        var group = Group(Host("git.example.com", "git.example.com"), 3, siteName: null);

        Assert.Equal("git.example.com", group.Header);
        Assert.Equal("3 repositories", group.SubHeader);
    }

    [Fact]
    public void The_site_signed_in_to_is_what_names_it()
    {
        var group = Group(Host("git.example.com", "git.example.com"), 2, siteName: "GitLab");

        Assert.Equal("GitLab · 2 repositories", group.SubHeader);
    }

    /// <summary>On github.com the name and the site are both "GitHub", and repeating it stutters.</summary>
    [Fact]
    public void A_name_that_is_already_the_site_is_not_said_twice()
    {
        var group = Group(Host("github.com", "GitHub"), 1, siteName: "GitHub");

        Assert.Equal("1 repository", group.SubHeader);
    }
}
