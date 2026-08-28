using System.Net;
using System.Text;
using LibGit2Sharp;
using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// The HTTPS transport Omnigit hands to libgit2 on Windows, exercised without libgit2:
/// the streams are driven the way it drives them, against a stub server.
/// </summary>
/// <remarks>
/// It exists because libgit2's own Windows TLS cannot survive TLS 1.3 - see
/// GitHttpTransport. What can be tested here is that we speak git's HTTP protocol: the
/// right method, path, content types and headers, the request body arriving whole, and a
/// server that answers with something other than git being named as such rather than
/// reaching libgit2 as a parse error.
///
/// The 401 path is deliberately not tested. Answering one means asking libgit2 for
/// credentials through a native transport handle, which a transport built outside
/// libgit2 does not have.
/// </remarks>
public class GitHttpTransportTests
{
    // ---- The four endpoints ------------------------------------------------

    [Fact]
    public void The_ref_advertisement_is_a_get_with_the_service_in_the_query()
    {
        var endpoint = GitHttpTransport.EndpointFor(
            "https://example.com/owner/repo.git", GitSmartSubtransportAction.UploadPackList);

        Assert.Equal("https://example.com/owner/repo.git/info/refs?service=git-upload-pack",
            endpoint.Uri.ToString());
        Assert.False(endpoint.Post);
        Assert.Equal("application/x-git-upload-pack-advertisement", endpoint.Accept);
    }

    [Fact]
    public void Fetching_posts_to_git_upload_pack()
    {
        var endpoint = GitHttpTransport.EndpointFor(
            "https://example.com/owner/repo.git", GitSmartSubtransportAction.UploadPack);

        Assert.Equal("https://example.com/owner/repo.git/git-upload-pack", endpoint.Uri.ToString());
        Assert.True(endpoint.Post);
        Assert.Equal("application/x-git-upload-pack-request", endpoint.ContentType);
        Assert.Equal("application/x-git-upload-pack-result", endpoint.Accept);
    }

    [Fact]
    public void Pushing_asks_for_receive_pack_on_both_halves()
    {
        var list = GitHttpTransport.EndpointFor(
            "https://example.com/repo.git", GitSmartSubtransportAction.ReceivePackList);
        var push = GitHttpTransport.EndpointFor(
            "https://example.com/repo.git", GitSmartSubtransportAction.ReceivePack);

        Assert.EndsWith("/info/refs?service=git-receive-pack", list.Uri.ToString());
        Assert.EndsWith("/git-receive-pack", push.Uri.ToString());
        Assert.Equal("application/x-git-receive-pack-request", push.ContentType);
    }

    [Fact]
    public void A_trailing_slash_does_not_become_a_double_one()
    {
        var endpoint = GitHttpTransport.EndpointFor(
            "https://example.com/owner/repo/", GitSmartSubtransportAction.UploadPackList);

        Assert.Equal("https://example.com/owner/repo/info/refs?service=git-upload-pack",
            endpoint.Uri.ToString());
    }

    /// <summary>
    /// A username in the URL is for the credential callback, not for the request: some
    /// servers answer 400 to one in the address and the rest ignore it.
    /// </summary>
    [Fact]
    public void A_username_in_the_url_comes_off_the_address()
    {
        var endpoint = GitHttpTransport.EndpointFor(
            "https://someone@example.com/repo.git", GitSmartSubtransportAction.UploadPackList);

        Assert.Equal("someone", endpoint.Username);
        Assert.DoesNotContain("someone@", endpoint.Uri.ToString());
    }

    // ---- Talking to a server -----------------------------------------------

    [Fact]
    public void The_advertisement_arrives_as_libgit2_asked_for_it()
    {
        var advertisement = "001e# service=git-upload-pack\n0000";
        var server = new StubGit(advertisement, "application/x-git-upload-pack-advertisement");

        var transport = new GitHttpTransport(new HttpClient(server));
        var stream = transport.Connect(
            "https://example.com/repo.git", GitSmartSubtransportAction.UploadPackList);

        Assert.Equal(advertisement, ReadAll(stream));

        Assert.Equal(HttpMethod.Get, server.Method);
        Assert.Equal("/repo.git/info/refs", server.Path);
        Assert.Equal("service=git-upload-pack", server.Query.TrimStart('?'));
        Assert.Contains("application/x-git-upload-pack-advertisement", server.Accept);

        // GitHub only speaks the smart protocol to something calling itself git.
        Assert.StartsWith("git/", server.UserAgent);
    }

    [Fact]
    public void What_libgit2_writes_is_what_the_server_is_posted()
    {
        var want = "0032want 0123456789012345678901234567890123456789\n0000";
        var server = new StubGit("0008NAK\n", "application/x-git-upload-pack-result");

        var transport = new GitHttpTransport(new HttpClient(server));
        var stream = transport.Connect(
            "https://example.com/repo.git", GitSmartSubtransportAction.UploadPack);

        // libgit2 writes the whole request before it reads a byte of the answer.
        using var body = new MemoryStream(Encoding.UTF8.GetBytes(want));
        Assert.Equal(0, stream.Write(body, body.Length));

        Assert.Equal("0008NAK\n", ReadAll(stream));

        Assert.Equal(HttpMethod.Post, server.Method);
        Assert.Equal("/repo.git/git-upload-pack", server.Path);
        Assert.Equal(want, server.Body);
        Assert.Equal("application/x-git-upload-pack-request", server.ContentType);
    }

    /// <summary>
    /// A read asks for as much as libgit2's buffer holds and is answered with whatever
    /// has arrived, the way a socket behaves - and zero once, and only once, at the end.
    /// </summary>
    [Fact]
    public void Reading_past_the_end_reports_the_end()
    {
        var server = new StubGit("0000", "application/x-git-upload-pack-advertisement");

        var transport = new GitHttpTransport(new HttpClient(server));
        var stream = transport.Connect(
            "https://example.com/repo.git", GitSmartSubtransportAction.UploadPackList);

        using var into = new MemoryStream();

        Assert.Equal(0, stream.Read(into, 8192, out var first));
        Assert.Equal(4, first);

        Assert.Equal(0, stream.Read(into, 8192, out var then));
        Assert.Equal(0, then);
    }

    [Fact]
    public void A_status_that_is_not_success_says_which_one_it_was()
    {
        var server = new StubGit("nope", "text/plain", HttpStatusCode.NotFound);
        var transport = new GitHttpTransport(new HttpClient(server));

        var failure = Assert.Throws<HttpRequestException>(() => transport.Connect(
            "https://example.com/repo.git", GitSmartSubtransportAction.UploadPackList));

        Assert.Contains("404", failure.Message);
        Assert.Contains("example.com", failure.Message);
    }

    /// <summary>
    /// The shape of a clone URL typed slightly wrong. Passed through, libgit2 reports it
    /// as a protocol parse error somewhere further in, which names nothing the user can
    /// act on.
    /// </summary>
    [Fact]
    public void A_web_page_is_not_a_git_repository()
    {
        var server = new StubGit("<html>Sign in</html>", "text/html");
        var transport = new GitHttpTransport(new HttpClient(server));

        var failure = Assert.Throws<HttpRequestException>(() => transport.Connect(
            "https://example.com/repo", GitSmartSubtransportAction.UploadPackList));

        Assert.Contains("text/html", failure.Message);
        Assert.Contains("clone URL", failure.Message);
    }

    // ---- Helpers -----------------------------------------------------------

    private static string ReadAll(SmartSubtransportStream stream)
    {
        using var into = new MemoryStream();

        while (true)
        {
            Assert.Equal(0, stream.Read(into, 8192, out var read));

            if (read == 0)
                return Encoding.UTF8.GetString(into.ToArray());
        }
    }

    /// <summary>
    /// A server that answers one canned response and remembers what it was asked.
    /// Synchronous: libgit2 calls the transport on its own thread and waits, so the
    /// transport sends synchronously and never touches the async path.
    /// </summary>
    private sealed class StubGit(string body, string contentType, HttpStatusCode status = HttpStatusCode.OK)
        : HttpMessageHandler
    {
        public HttpMethod? Method { get; private set; }
        public string? Path { get; private set; }
        public string? Query { get; private set; }
        public string? Accept { get; private set; }
        public string? UserAgent { get; private set; }
        public string? ContentType { get; private set; }
        public string? Body { get; private set; }

        protected override HttpResponseMessage Send(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Method = request.Method;
            Path = request.RequestUri!.AbsolutePath;
            Query = request.RequestUri.Query;
            Accept = request.Headers.Accept.ToString();
            UserAgent = request.Headers.UserAgent.ToString();

            if (request.Content is { } content)
            {
                ContentType = content.Headers.ContentType?.MediaType;
                Body = content.ReadAsStringAsync(cancellationToken).GetAwaiter().GetResult();
            }

            var response = new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, contentType),
                RequestMessage = request,
            };

            return response;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(Send(request, cancellationToken));
    }
}
