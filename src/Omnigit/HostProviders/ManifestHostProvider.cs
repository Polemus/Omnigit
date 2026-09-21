using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Omnigit.Services;

namespace Omnigit.HostProviders;

/// <summary>
/// Turns a <see cref="HostManifest"/> into a working provider. This is what makes a
/// user-written JSON file a first-class hosting site rather than a second-tier one:
/// Gitea itself ships as a manifest and goes through this same code path.
/// </summary>
public sealed class ManifestHostProvider(HostManifest manifest, HttpClient http) : IHostProvider
{
    public string Id => manifest.Id;

    public string DisplayName => manifest.DisplayName;

    public HostCapabilities Capabilities { get; } = new()
    {
        // A manifest can only describe token auth; browser login is a conversation,
        // not a URL, so it needs real code.
        AuthMethods = [AuthMethod.PersonalAccessToken],
        CanListRepositories = !string.IsNullOrEmpty(manifest.Endpoints.Repositories),
        CanCreateRepositories = !string.IsNullOrEmpty(manifest.CreateRepository?.Path),
        CanListOwners = !string.IsNullOrEmpty(manifest.Endpoints.Owners),
        CanListPullRequests = !string.IsNullOrEmpty(manifest.Endpoints.PullRequests),
    };

    public async Task<bool> RecognisesAsync(Uri baseUrl, CancellationToken cancellationToken)
    {
        if (manifest.Recognise is not { } rule || string.IsNullOrEmpty(rule.Path))
            return false;

        try
        {
            using var response = await http.GetAsync(Combine(baseUrl, rule.Path), cancellationToken);
            if (!response.IsSuccessStatusCode)
                return false;

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            return string.IsNullOrEmpty(rule.ExpectField)
                   || document.RootElement.TryGetProperty(rule.ExpectField, out _);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            // A site that doesn't answer, or answers with something else, simply isn't
            // this kind of site. Not an error worth surfacing.
            return false;
        }
    }

    public async Task<HostAccount> SignInWithTokenAsync(Uri baseUrl, string token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw new HostProviderException("A token is required.");

        if (string.IsNullOrEmpty(manifest.Endpoints.CurrentUser))
            throw new HostProviderException($"{DisplayName} has no currentUser endpoint configured.");

        using var document = await GetJsonAsync(Combine(baseUrl, manifest.Endpoints.CurrentUser), token, cancellationToken);
        var root = document.RootElement;

        var login = manifest.UserFields.Login.GetString(root)
                    ?? throw new HostProviderException(
                        $"{DisplayName} did not return a login field at "
                        + $"'{manifest.UserFields.Login.Path}'. Check the manifest's userFields mapping.");

        return new HostAccount
        {
            ProviderId = Id,
            BaseUrl = baseUrl,
            Login = login,
            DisplayName = Blank(manifest.UserFields.DisplayName.GetString(root)) ?? login,
            AvatarUrl = manifest.UserFields.AvatarUrl.GetString(root),
            Token = token,
        };
    }

    public Task<DeviceLogin> StartBrowserLoginAsync(Uri baseUrl, CancellationToken cancellationToken)
        => throw new NotSupportedException(
            Strings.Format("{0} is defined by a manifest, which can only describe token sign-in. "
                           + "Create a personal access token on the site and paste it in.", DisplayName));

    public Task<HostAccount> CompleteBrowserLoginAsync(Uri baseUrl, DeviceLogin login, CancellationToken cancellationToken)
        => throw new NotSupportedException(
            $"{DisplayName} is defined by a manifest, which can only describe token sign-in.");

    public async Task<IReadOnlyList<RemoteRepository>> ListRepositoriesAsync(
        HostAccount account, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(manifest.Endpoints.Repositories))
            return [];

        // Paged the same way as GitHub, and for the same reason: the endpoints in our
        // own manifests ask for 100 at a time because that is all Gitea and GitLab will
        // give, and anyone with more than that was quietly missing the rest. Following
        // the Link header needs no per-site paging scheme in the manifest format - a
        // site that sends the header is paged, and one that does not returns one page.
        Uri? url = Combine(account.BaseUrl, manifest.Endpoints.Repositories);

        var fields = manifest.RepositoryFields;
        var repositories = new List<RemoteRepository>();

        for (var page = 0; url is not null && page < MaxPages; page++)
        {
            var (document, next) = await GetJsonPageAsync(url, account.Token, cancellationToken);

            using (document)
            {
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Array)
                    throw new HostProviderException($"{DisplayName} returned an unexpected repository list.");

                foreach (var item in root.EnumerateArray())
                {
                    var name = fields.Name.GetString(item);
                    var cloneUrl = fields.CloneUrl.GetString(item);

                    // A repo we can't name or clone is useless; skip rather than fail the lot.
                    if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(cloneUrl))
                        continue;

                    repositories.Add(new RemoteRepository
                    {
                        Name = name,
                        Owner = fields.Owner.GetString(item) ?? string.Empty,
                        CloneUrl = cloneUrl,
                        DefaultBranch = Blank(fields.DefaultBranch.GetString(item)) ?? "main",
                        IsPrivate = fields.IsPrivate.GetBool(item),
                        Description = fields.Description.GetString(item),
                        UpdatedAt = fields.UpdatedAt.GetDate(item),
                    });
                }
            }

            url = next;
        }

        return repositories;
    }

    public async Task<IReadOnlyList<RepositoryOwner>> ListOwnersAsync(
        HostAccount account, CancellationToken cancellationToken)
    {
        var self = new RepositoryOwner(account.Login, IsSelf: true);

        if (string.IsNullOrEmpty(manifest.Endpoints.Owners))
            return [self];

        var owners = new List<RepositoryOwner> { self };
        var fields = manifest.OwnerFields;

        Uri? url = Combine(account.BaseUrl, manifest.Endpoints.Owners);

        for (var page = 0; url is not null && page < MaxPages; page++)
        {
            var (document, next) = await GetJsonPageAsync(url, account.Token, cancellationToken);

            using (document)
            {
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Array)
                    throw new HostProviderException($"{DisplayName} returned an unexpected organisation list.");

                foreach (var item in root.EnumerateArray())
                {
                    if (Blank(fields.Login.GetString(item)) is not { } login)
                        continue;

                    owners.Add(new RepositoryOwner(login, Blank(fields.Id.GetString(item))));
                }
            }

            url = next;
        }

        return owners;
    }

    public async Task<RemoteRepository> CreateRepositoryAsync(
        HostAccount account, NewRepository repository, CancellationToken cancellationToken)
    {
        if (manifest.CreateRepository is not { } rule || string.IsNullOrEmpty(rule.Path))
        {
            throw new NotSupportedException(
                Strings.Format("{0}'s manifest has no createRepository block, so Omnigit does not "
                               + "know how to make a repository there. Create it on the site and add the remote.",
                               DisplayName));
        }

        var owner = repository.Owner;
        var underOrganisation = owner is { IsSelf: false };

        // An organisation either changes the address or adds a field to the body; the
        // manifest says which, because the sites we ship do one each.
        var path = underOrganisation && !string.IsNullOrEmpty(rule.OwnerPath)
            ? rule.OwnerPath.Replace("{owner}", Uri.EscapeDataString(owner!.Login), StringComparison.Ordinal)
            : rule.Path;

        var body = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            [rule.NameField] = repository.Name,
        };

        if (!string.IsNullOrEmpty(rule.DescriptionField) && !string.IsNullOrWhiteSpace(repository.Description))
            body[rule.DescriptionField] = repository.Description.Trim();

        if (!string.IsNullOrEmpty(rule.Privacy.Field))
        {
            body[rule.Privacy.Field] = rule.Privacy.IsBoolean
                ? repository.IsPrivate
                : repository.IsPrivate ? rule.Privacy.WhenPrivate : rule.Privacy.WhenPublic;
        }

        if (underOrganisation && rule.OwnerField is { Field.Length: > 0 } ownerField)
        {
            var value = string.Equals(ownerField.Source, "login", StringComparison.OrdinalIgnoreCase)
                ? owner!.Login
                : owner!.Id;

            if (string.IsNullOrEmpty(value))
            {
                throw new HostProviderException(
                    $"{DisplayName} identifies an organisation by {ownerField.Source}, and none came "
                    + $"back for {owner!.Login}. Check the manifest's ownerFields mapping.");
            }

            // A numeric id has to go out as a number: a site expecting namespace_id
            // rejects "42" in quotes, and the manifest cannot say what type it is.
            body[ownerField.Field] = long.TryParse(value, out var numeric) ? numeric : value;
        }

        using var document = await PostJsonAsync(
            Combine(account.BaseUrl, path), account.Token, body, cancellationToken);

        var fields = manifest.RepositoryFields;
        var root = document.RootElement;

        var cloneUrl = Blank(fields.CloneUrl.GetString(root))
                       ?? throw new HostProviderException(
                           $"{DisplayName} created the repository but returned no clone URL at "
                           + $"'{fields.CloneUrl.Path}'. Check the manifest's repositoryFields mapping.");

        return new RemoteRepository
        {
            Name = Blank(fields.Name.GetString(root)) ?? repository.Name,
            Owner = fields.Owner.GetString(root) ?? owner?.Login ?? account.Login,
            CloneUrl = cloneUrl,
            DefaultBranch = Blank(fields.DefaultBranch.GetString(root)) ?? "main",
            IsPrivate = fields.IsPrivate.GetBool(root),
            Description = fields.Description.GetString(root),
            UpdatedAt = fields.UpdatedAt.GetDate(root),
        };
    }

    public async Task<IReadOnlyList<PullRequest>> ListPullRequestsAsync(
        HostAccount account, string owner, string repository, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(manifest.Endpoints.PullRequests))
            return [];

        var path = manifest.Endpoints.PullRequests
            .Replace("{owner}", Uri.EscapeDataString(owner), StringComparison.Ordinal)
            .Replace("{repo}", Uri.EscapeDataString(repository), StringComparison.Ordinal);

        // One page only. A branch picker showing every pull request an active project
        // ever opened would be unusable, and the endpoint in each manifest asks the
        // site to sort them so the page it does return is the useful one.
        var (document, _) = await GetJsonPageAsync(
            Combine(account.BaseUrl, path), account.Token, cancellationToken);

        var fields = manifest.PullRequestFields;
        var pullRequests = new List<PullRequest>();

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Array)
                throw new HostProviderException($"{DisplayName} returned an unexpected pull request list.");

            foreach (var item in root.EnumerateArray())
            {
                // Without a number there is nothing to fetch and nothing to open, so
                // the row would be decoration. Skip it rather than fail the list.
                if (fields.Number.GetInt(item) is not { } number)
                    continue;

                pullRequests.Add(new PullRequest
                {
                    Number = number,
                    Title = Blank(fields.Title.GetString(item)) ?? $"#{number}",
                    Author = fields.Author.GetString(item) ?? string.Empty,
                    SourceBranch = fields.SourceBranch.GetString(item) ?? string.Empty,
                    TargetBranch = fields.TargetBranch.GetString(item) ?? string.Empty,
                    IsDraft = fields.IsDraft.GetBool(item),
                    UpdatedAt = fields.UpdatedAt.GetDate(item),
                    WebUrl = fields.WebUrl.GetString(item),
                });
            }
        }

        return pullRequests;
    }

    /// <summary>The same stop on runaway paging as GitHubProvider applies.</summary>
    private const int MaxPages = 50;

    public GitCredentials GetGitCredentials(HostAccount account) => new(
        Substitute(manifest.GitCredentials.Username, account),
        Substitute(manifest.GitCredentials.Password, account));

    public string CommitUrlTemplate => manifest.WebUrls.Commit;

    public string NewPullRequestUrlTemplate => manifest.WebUrls.NewPullRequest;

    public string PullRequestRefSpec => manifest.PullRequestRef;

    // ---------------------------------------------------------------- helpers

    private async Task<JsonDocument> GetJsonAsync(Uri url, string token, CancellationToken cancellationToken)
        => (await GetJsonPageAsync(url, token, cancellationToken)).Document;

    /// <summary>
    /// POSTs a JSON body and reads the site's answer back.
    /// </summary>
    /// <remarks>
    /// The 422 case is worth its own message. Every forge here answers a name that is
    /// already taken with one, and "422 Unprocessable Content" tells the user nothing
    /// they can act on - so the site's own explanation is dug out of the body instead.
    /// </remarks>
    private async Task<JsonDocument> PostJsonAsync(
        Uri url, string token, Dictionary<string, object> body, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"),
        };

        if (manifest.AuthHeader is { } header)
        {
            request.Headers.TryAddWithoutValidation(
                header.Name, header.Value.Replace("{token}", token, StringComparison.Ordinal));
        }

        request.Headers.TryAddWithoutValidation("Accept", "application/json");

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new HostProviderException(Strings.Format("Could not reach {0}: {1}", url, ex.Message), ex);
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                throw new HostProviderException(
                    Strings.Get("The token was rejected. Check it has not expired and has the right scopes."));

            if (!response.IsSuccessStatusCode)
            {
                throw new HostProviderException(
                    Explain(text) ?? Strings.Format("{0} returned {1} {2}.",
                                                    url, (int)response.StatusCode, response.ReasonPhrase));
            }

            try
            {
                return JsonDocument.Parse(text);
            }
            catch (JsonException ex)
            {
                throw new HostProviderException($"{url} returned something that isn't JSON.", ex);
            }
        }
    }

    /// <summary>
    /// The site's own words for why it refused, or null if it did not say. The three
    /// keys covered are what GitHub, Gitea and GitLab actually send back.
    /// </summary>
    private static string? Explain(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return null;

        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Object)
                return null;

            foreach (var key in (string[])["message", "error", "error_description"])
            {
                if (root.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String)
                    return value.GetString();
            }

            // GitLab returns { "message": { "name": ["has already been taken"] } }, so
            // the flat lookup above misses it and the nested shape is worth unpacking.
            if (root.TryGetProperty("message", out var nested) && nested.ValueKind == JsonValueKind.Object)
            {
                foreach (var property in nested.EnumerateObject())
                {
                    if (property.Value.ValueKind == JsonValueKind.Array
                        && property.Value.EnumerateArray().FirstOrDefault() is
                            { ValueKind: JsonValueKind.String } first)
                    {
                        return $"{property.Name} {first.GetString()}";
                    }
                }
            }

            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<(JsonDocument Document, Uri? Next)> GetJsonPageAsync(
        Uri url, string token, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);

        if (manifest.AuthHeader is { } header)
        {
            request.Headers.TryAddWithoutValidation(
                header.Name, header.Value.Replace("{token}", token, StringComparison.Ordinal));
        }

        request.Headers.TryAddWithoutValidation("Accept", "application/json");

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            // The whole URL, not just the host: when this is wrong it is nearly always
            // the path that is wrong, and the host alone gives nothing to correct.
            throw new HostProviderException(Strings.Format("Could not reach {0}: {1}", url, ex.Message), ex);
        }

        using (response)
        {
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                throw new HostProviderException(
                    Strings.Get("The token was rejected. Check it has not expired and has the right scopes."));

            if (!response.IsSuccessStatusCode)
                throw new HostProviderException(Strings.Format("{0} returned {1} {2}.",
                    url, (int)response.StatusCode, response.ReasonPhrase));

            // Read before the response is disposed at the end of this block.
            var next = response.Headers.TryGetValues("Link", out var link)
                ? LinkHeader.Next(link, url)
                : null;

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);

            try
            {
                return (await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken), next);
            }
            catch (JsonException ex)
            {
                throw new HostProviderException($"{url} returned something that isn't JSON.", ex);
            }
        }
    }

    private static string Substitute(string template, HostAccount account) => template
        .Replace("{login}", account.Login, StringComparison.Ordinal)
        .Replace("{token}", account.Token, StringComparison.Ordinal);

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    /// <summary>
    /// Joins a base URL with a manifest path, keeping any path prefix on the base
    /// (a Gitea hosted at example.com/git must keep the /git).
    /// </summary>
    private static Uri Combine(Uri baseUrl, string path)
    {
        var left = baseUrl.GetLeftPart(UriPartial.Path).TrimEnd('/');
        return new Uri($"{left}/{path.TrimStart('/')}");
    }
}
