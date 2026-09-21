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
/// GitHub, written as code rather than a manifest because its browser sign-in is a
/// multi-step conversation - ask for a code, wait for the user to approve it in a
/// browser, poll until it flips - which cannot be expressed as endpoint descriptions.
/// Everything else about GitHub could have been a manifest.
/// </summary>
public sealed class GitHubProvider(HttpClient http, string? configuredClientId) : IHostProvider
{
    private const string DeviceGrantType = "urn:ietf:params:oauth:grant-type:device_code";

    /// <summary>Scopes needed to list repositories and to push over HTTPS.</summary>
    /// <remarks>
    /// <c>workflow</c> is not optional for a git client, and Omnigit proved it on itself:
    /// GitHub refuses to let an OAuth token create or update anything under
    /// <c>.github/workflows/</c> without it, so a push carrying a workflow change uploads
    /// every object and is then rejected at the ref update - "refusing to allow an OAuth
    /// App to create or update workflow ... without `workflow` scope". Omnigit could not
    /// push its own CI. GitHub Desktop asks for the same three for the same reason.
    ///
    /// A token already issued keeps the scopes it was issued with, so this reaches an
    /// existing account only after signing out and back in. Worth a line in the release
    /// notes rather than leaving people to find it.
    /// </remarks>
    private const string Scopes = "repo workflow read:org";

    /// <summary>
    /// Omnigit's own OAuth App, registered on github.com. A client id is public by design:
    /// it names the application on the approval screen and authorises nothing by itself,
    /// and the device flow uses no client secret. There is nothing here to keep out of the
    /// repository, and shipping it is what saves every user from registering their own.
    /// </summary>
    private const string DefaultClientId = "Ov23liTTmSX5cD9G8Ywg";

    public string Id => "github";

    public string DisplayName => "GitHub";

    public HostCapabilities Capabilities { get; } = new()
    {
        AuthMethods = [AuthMethod.BrowserDeviceLogin, AuthMethod.PersonalAccessToken],
        CanCreateRepositories = true,
        CanListOwners = true,
        CanListPullRequests = true,
    };

    /// <summary>
    /// Whether browser sign-in can run against this server. It needs a client id, and
    /// <see cref="DefaultClientId"/> is registered on github.com, so it means nothing to an
    /// Enterprise install - those need OMNIGIT_GITHUB_CLIENT_ID naming an app on that server.
    /// </summary>
    public bool CanUseBrowserLogin(Uri baseUrl) => ClientIdFor(baseUrl) is not null;

    /// <summary>A configured id wins everywhere; the built-in one applies only to github.com.</summary>
    private string? ClientIdFor(Uri baseUrl)
        => !string.IsNullOrWhiteSpace(configuredClientId) ? configuredClientId
            : IsDotCom(baseUrl) ? DefaultClientId
            : null;

    public async Task<bool> RecognisesAsync(Uri baseUrl, CancellationToken cancellationToken)
    {
        if (IsDotCom(baseUrl))
            return true;

        // GitHub Enterprise answers /api/v3 with a rate-limit document.
        try
        {
            using var request = Request(HttpMethod.Get, new Uri(ApiBase(baseUrl), "rate_limit"), token: null);
            using var response = await http.SendAsync(request, cancellationToken);

            return response.Headers.Contains("X-GitHub-Media-Type")
                   || response.Headers.Contains("x-github-request-id");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }

    public async Task<HostAccount> SignInWithTokenAsync(Uri baseUrl, string token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw new HostProviderException("A token is required.");

        return await FetchAccountAsync(baseUrl, token, cancellationToken);
    }

    public async Task<DeviceLogin> StartBrowserLoginAsync(Uri baseUrl, CancellationToken cancellationToken)
    {
        if (ClientIdFor(baseUrl) is not { } clientId)
        {
            throw new HostProviderException(
                Strings.Format(
                    "Browser sign-in to {0} needs an OAuth App registered on that server, "
                    + "which identifies Omnigit to it and cannot be shared or invented. Register one at "
                    + "Settings → Developer settings → OAuth Apps (tick 'Enable Device Flow'), then set "
                    + "OMNIGIT_GITHUB_CLIENT_ID. A personal access token works without any of that.",
                    baseUrl.Host));
        }

        using var content = Form(new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["scope"] = Scopes,
        });

        using var document = await PostFormAsync(new Uri(WebBase(baseUrl), "login/device/code"), content, cancellationToken);
        var root = document.RootElement;

        if (root.TryGetProperty("error", out var error))
            throw new HostProviderException(
                Strings.Format("GitHub refused the sign-in request: {0}", error.GetString()));

        var verification = root.TryGetProperty("verification_uri", out var v) ? v.GetString() : null;

        return new DeviceLogin
        {
            DeviceCode = root.GetProperty("device_code").GetString()!,
            UserCode = root.GetProperty("user_code").GetString()!,
            VerificationUri = new Uri(verification ?? "https://github.com/login/device"),
            IntervalSeconds = root.TryGetProperty("interval", out var i) ? i.GetInt32() : 5,
            ExpiresAt = DateTimeOffset.Now.AddSeconds(
                root.TryGetProperty("expires_in", out var e) ? e.GetInt32() : 900),
        };
    }

    public async Task<HostAccount> CompleteBrowserLoginAsync(
        Uri baseUrl, DeviceLogin login, CancellationToken cancellationToken)
    {
        // Start already refused if there were no id for this server, so this cannot be null;
        // asking again keeps the two halves of the flow reading the same value.
        var clientId = ClientIdFor(baseUrl)
            ?? throw new HostProviderException(
                   Strings.Format("Browser sign-in is not configured for {0}.", baseUrl.Host));

        var delay = TimeSpan.FromSeconds(Math.Max(1, login.IntervalSeconds));

        while (DateTimeOffset.Now < login.ExpiresAt)
        {
            await Task.Delay(delay, cancellationToken);

            using var content = Form(new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["device_code"] = login.DeviceCode,
                ["grant_type"] = DeviceGrantType,
            });

            using var document = await PostFormAsync(
                new Uri(WebBase(baseUrl), "login/oauth/access_token"), content, cancellationToken);

            var root = document.RootElement;

            if (root.TryGetProperty("access_token", out var tokenElement)
                && tokenElement.GetString() is { Length: > 0 } token)
            {
                return await FetchAccountAsync(baseUrl, token, cancellationToken);
            }

            var error = root.TryGetProperty("error", out var e) ? e.GetString() : null;

            switch (error)
            {
                case "authorization_pending":
                    continue; // The user hasn't finished in the browser yet.

                case "slow_down":
                    // GitHub asks us to back off; it also sends a new interval.
                    var extra = root.TryGetProperty("interval", out var i) ? i.GetInt32() : 5;
                    delay = TimeSpan.FromSeconds(extra + 1);
                    continue;

                case "expired_token":
                    throw new HostProviderException(Strings.Get("The sign-in code expired. Start again."));

                case "access_denied":
                    throw new HostProviderException(Strings.Get("Sign-in was declined in the browser."));

                default:
                    throw new HostProviderException(Strings.Format("GitHub sign-in failed: {0}",
                        error ?? Strings.Get("unknown error")));
            }
        }

        throw new HostProviderException(Strings.Get("The sign-in code expired. Start again."));
    }

    public async Task<IReadOnlyList<RemoteRepository>> ListRepositoriesAsync(
        HostAccount account, CancellationToken cancellationToken)
    {
        // 100 is the most GitHub will return at once. An organisation with more than
        // that - which is most of them - needs the rest fetching page by page, or the
        // repositories simply are not there to be cloned and nothing says why.
        Uri? url = new(ApiBase(account.BaseUrl),
            "user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");

        var repositories = new List<RemoteRepository>();

        for (var page = 0; url is not null && page < MaxPages; page++)
        {
            var (document, next) = await GetJsonPageAsync(url, account.Token, cancellationToken);

            using (document)
            {
                var root = document.RootElement;

                if (root.ValueKind != JsonValueKind.Array)
                    throw new HostProviderException("GitHub returned an unexpected repository list.");

                foreach (var item in root.EnumerateArray())
                {
                    if (ReadRepository(item) is { } repository)
                        repositories.Add(repository);
                }
            }

            url = next;
        }

        return repositories;
    }

    /// <remarks>
    /// The <c>read:org</c> scope is already asked for at sign-in, so this needs nothing
    /// new. An account whose token predates that scope gets a 403; the organisations are
    /// dropped rather than failing the dialog, since publishing under your own name is
    /// still perfectly possible and is what most people are doing anyway.
    /// </remarks>
    public async Task<IReadOnlyList<RepositoryOwner>> ListOwnersAsync(
        HostAccount account, CancellationToken cancellationToken)
    {
        var owners = new List<RepositoryOwner> { new(account.Login, IsSelf: true) };

        Uri? url = new(ApiBase(account.BaseUrl), "user/orgs?per_page=100");

        try
        {
            for (var page = 0; url is not null && page < MaxPages; page++)
            {
                var (document, next) = await GetJsonPageAsync(url, account.Token, cancellationToken);

                using (document)
                {
                    if (document.RootElement.ValueKind != JsonValueKind.Array)
                        break;

                    foreach (var item in document.RootElement.EnumerateArray())
                    {
                        if (Str(item, "login") is { Length: > 0 } login)
                            owners.Add(new RepositoryOwner(login));
                    }
                }

                url = next;
            }
        }
        catch (HostProviderException)
        {
            // See the remark above: an account that cannot list organisations can still
            // publish, so this is a shorter list rather than a failure.
        }

        return owners;
    }

    public async Task<RemoteRepository> CreateRepositoryAsync(
        HostAccount account, NewRepository repository, CancellationToken cancellationToken)
    {
        // An organisation is a different address, not a field in the body - which is
        // why the manifest format has ownerPath as well as ownerField.
        var url = repository.Owner is { IsSelf: false } owner
            ? new Uri(ApiBase(account.BaseUrl), $"orgs/{Uri.EscapeDataString(owner.Login)}/repos")
            : new Uri(ApiBase(account.BaseUrl), "user/repos");

        var body = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            ["name"] = repository.Name,
            ["private"] = repository.IsPrivate,

            // Deliberately no auto_init. The local repository already has a first
            // commit; a README written on the server would be a second root the very
            // first push could not fast-forward past.
            ["auto_init"] = false,
        };

        if (!string.IsNullOrWhiteSpace(repository.Description))
            body["description"] = repository.Description.Trim();

        using var document = await PostJsonAsync(url, account.Token, body, cancellationToken);

        return ReadRepository(document.RootElement)
               ?? throw new HostProviderException(
                   "GitHub created the repository but did not return a clone URL for it.");
    }

    public async Task<IReadOnlyList<PullRequest>> ListPullRequestsAsync(
        HostAccount account, string owner, string repository, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(owner) || string.IsNullOrEmpty(repository))
            return [];

        // One page, most recently touched first: this fills a dropdown, not a report.
        var url = new Uri(ApiBase(account.BaseUrl),
            $"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repository)}"
            + "/pulls?state=open&sort=updated&direction=desc&per_page=50");

        var (document, _) = await GetJsonPageAsync(url, account.Token, cancellationToken);
        var pullRequests = new List<PullRequest>();

        using (document)
        {
            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Array)
                throw new HostProviderException("GitHub returned an unexpected pull request list.");

            foreach (var item in root.EnumerateArray())
            {
                if (!item.TryGetProperty("number", out var numberElement)
                    || !numberElement.TryGetInt32(out var number))
                {
                    continue;
                }

                pullRequests.Add(new PullRequest
                {
                    Number = number,
                    Title = Str(item, "title") is { Length: > 0 } title ? title : $"#{number}",
                    Author = item.TryGetProperty("user", out var user) ? Str(user, "login") ?? string.Empty : string.Empty,
                    SourceBranch = item.TryGetProperty("head", out var head) ? Str(head, "ref") ?? string.Empty : string.Empty,
                    TargetBranch = item.TryGetProperty("base", out var wanted) ? Str(wanted, "ref") ?? string.Empty : string.Empty,
                    IsDraft = item.TryGetProperty("draft", out var draft) && draft.ValueKind == JsonValueKind.True,
                    UpdatedAt = DateTimeOffset.TryParse(Str(item, "updated_at"), out var when) ? when : null,
                    WebUrl = Str(item, "html_url"),
                });
            }
        }

        return pullRequests;
    }

    /// <summary>
    /// GitHub accepts the token as the password over HTTPS. The username is ignored
    /// but must not be empty.
    /// </summary>
    public GitCredentials GetGitCredentials(HostAccount account) => new(account.Login, account.Token);

    /// <summary>GitHub, and Enterprise with it, uses the shape everything else copied.</summary>
    public string CommitUrlTemplate => Services.WebLinks.DefaultCommitTemplate;

    public string NewPullRequestUrlTemplate => Services.WebLinks.DefaultNewPullRequestTemplate;

    /// <summary>
    /// GitHub keeps every pull request's head on the base repository under
    /// <c>refs/pull/&lt;n&gt;/head</c>, forks included. That is the whole reason a fork's
    /// pull request can be checked out without its remote being added.
    /// </summary>
    public string PullRequestRefSpec => Services.WebLinks.DefaultPullRequestRefSpec;

    // ---------------------------------------------------------------- helpers

    private async Task<HostAccount> FetchAccountAsync(Uri baseUrl, string token, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync(new Uri(ApiBase(baseUrl), "user"), token, cancellationToken);
        var root = document.RootElement;

        var login = Str(root, "login")
                    ?? throw new HostProviderException("GitHub did not return an account login.");

        return new HostAccount
        {
            ProviderId = Id,
            BaseUrl = baseUrl,
            Login = login,
            DisplayName = Str(root, "name") is { Length: > 0 } n ? n : login,
            AvatarUrl = Str(root, "avatar_url"),
            Token = token,
        };
    }

    private static bool IsDotCom(Uri baseUrl)
        => baseUrl.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
           || baseUrl.Host.Equals("www.github.com", StringComparison.OrdinalIgnoreCase);

    /// <summary>github.com has a separate API domain; Enterprise serves it under /api/v3.</summary>
    private static Uri ApiBase(Uri baseUrl)
        => IsDotCom(baseUrl)
            ? new Uri("https://api.github.com/")
            : new Uri($"{baseUrl.GetLeftPart(UriPartial.Path).TrimEnd('/')}/api/v3/");

    private static Uri WebBase(Uri baseUrl)
        => new($"{baseUrl.GetLeftPart(UriPartial.Path).TrimEnd('/')}/");

    private HttpRequestMessage Request(HttpMethod method, Uri url, string? token)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.TryAddWithoutValidation("Accept", "application/vnd.github+json");
        request.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");

        // GitHub rejects API requests without a User-Agent.
        request.Headers.TryAddWithoutValidation("User-Agent", "Omnigit");

        if (!string.IsNullOrEmpty(token))
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");

        return request;
    }

    private static FormUrlEncodedContent Form(Dictionary<string, string> values) => new(values);

    private async Task<JsonDocument> PostFormAsync(Uri url, HttpContent content, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, url, token: null);
        request.Content = content;

        // The device endpoints return form-encoded data unless JSON is requested.
        request.Headers.Remove("Accept");
        request.Headers.TryAddWithoutValidation("Accept", "application/json");

        // The device flow is never paged; only the document matters.
        return (await SendJsonAsync(request, cancellationToken)).Document;
    }

    /// <summary>
    /// A stop on runaway paging. Fifty pages is five thousand repositories, past any
    /// real account, and a server that answered every page with a link to another one
    /// would otherwise be followed until the request was cancelled.
    /// </summary>
    private const int MaxPages = 50;

    private async Task<JsonDocument> GetJsonAsync(Uri url, string token, CancellationToken cancellationToken)
        => (await GetJsonPageAsync(url, token, cancellationToken)).Document;

    private async Task<(JsonDocument Document, Uri? Next)> GetJsonPageAsync(
        Uri url, string token, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Get, url, token);
        return await SendJsonAsync(request, cancellationToken);
    }

    private async Task<(JsonDocument Document, Uri? Next)> SendJsonAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new HostProviderException(
                Strings.Format("Could not reach {0}: {1}", request.RequestUri?.Host, ex.Message), ex);
        }

        using (response)
        {
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                throw new HostProviderException(
                    Strings.Get("GitHub rejected the token. Check it has not expired and carries the 'repo' scope."));
            }

            // Read before the response is disposed at the end of this block.
            var next = response.Headers.TryGetValues("Link", out var link)
                ? LinkHeader.Next(link, request.RequestUri)
                : null;

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);

            try
            {
                return (await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken), next);
            }
            catch (JsonException ex)
            {
                throw new HostProviderException(
                    Strings.Format("GitHub returned {0} with a body that isn't JSON.",
                                   (int)response.StatusCode), ex);
            }
        }
    }

    /// <summary>
    /// One repository from GitHub's JSON, or null when it carries no name or no clone
    /// URL. Shared by the list and by what a creation returns, which are the same shape.
    /// </summary>
    private static RemoteRepository? ReadRepository(JsonElement item)
    {
        var name = Str(item, "name");
        var cloneUrl = Str(item, "clone_url");

        if (name is null || cloneUrl is null)
            return null;

        return new RemoteRepository
        {
            Name = name,
            Owner = item.TryGetProperty("owner", out var owner) ? Str(owner, "login") ?? string.Empty : string.Empty,
            CloneUrl = cloneUrl,
            DefaultBranch = Str(item, "default_branch") ?? "main",
            IsPrivate = item.TryGetProperty("private", out var p) && p.ValueKind == JsonValueKind.True,
            Description = Str(item, "description"),
            UpdatedAt = DateTimeOffset.TryParse(Str(item, "updated_at"), out var when) ? when : null,
        };
    }

    /// <summary>
    /// POSTs JSON and insists on a success code.
    /// </summary>
    /// <remarks>
    /// <see cref="SendJsonAsync"/> parses whatever comes back without looking at the
    /// status, which is harmless for a GET - a failure is not an array and the caller
    /// says so - but not here: GitHub answers a name already in use with 422 and a body
    /// that would otherwise be read as a repository with no clone URL. So the status is
    /// checked, and GitHub's own explanation is what the user is shown.
    /// </remarks>
    private async Task<JsonDocument> PostJsonAsync(
        Uri url, string token, Dictionary<string, object> body, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, url, token);
        request.Content = new StringContent(
            JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new HostProviderException(
                Strings.Format("Could not reach {0}: {1}", url.Host, ex.Message), ex);
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                throw new HostProviderException(
                    Strings.Get("GitHub rejected the token. Check it has not expired and carries the 'repo' scope."));
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new HostProviderException(
                    Explain(text) ?? Strings.Format("GitHub returned {0} {1}.",
                                                    (int)response.StatusCode, response.ReasonPhrase));
            }

            try
            {
                return JsonDocument.Parse(text);
            }
            catch (JsonException ex)
            {
                throw new HostProviderException(
                    $"GitHub returned {(int)response.StatusCode} with a body that isn't JSON.", ex);
            }
        }
    }

    /// <summary>
    /// GitHub's reason for a refusal. The nested <c>errors</c> array is where the useful
    /// half lives - the top-level message for a duplicate name is only "Repository
    /// creation failed", while the error beneath it says "name already exists on this
    /// account", which is the sentence the user can act on.
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

            var message = Str(root, "message");

            if (root.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Array)
            {
                var detail = errors.EnumerateArray()
                    .Select(e => Str(e, "message") ?? Str(e, "field"))
                    .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m));

                if (detail is not null)
                    return message is null ? detail : $"{message}: {detail}";
            }

            return message;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? Str(JsonElement element, string name)
        => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
