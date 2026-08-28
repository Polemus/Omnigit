using System;
using System.Buffers;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using LibGit2Sharp;

namespace Omnigit.Services;

/// <summary>
/// Carries git's HTTPS traffic over .NET's <see cref="HttpClient"/> instead of libgit2's
/// own TLS. Registered on Windows only; everywhere else libgit2 talks to the server
/// itself, as it always has.
/// </summary>
/// <remarks>
/// <para><b>Why this exists.</b> libgit2's Windows TLS is
/// <c>src/libgit2/streams/schannel.c</c>. <c>connect_context</c> asks Schannel for
/// <c>SP_PROT_TLS1_2_CLIENT | SP_PROT_TLS1_3_CLIENT</c>, and the read loop then treats
/// every <c>DecryptMessage</c> result that is not <c>SEC_E_OK</c>,
/// <c>SEC_E_CONTEXT_EXPIRED</c> or <c>SEC_E_INCOMPLETE_MESSAGE</c> as fatal - including
/// <c>SEC_I_RENEGOTIATE</c>, which is how Schannel hands back TLS 1.3's post-handshake
/// traffic: a session ticket, a key update. The connection dies with "could not decrypt
/// tls message" whenever the server sends one, which is why the same clone fails
/// instantly, or at 90%, or occasionally not at all. It is not about the token, the
/// repository or the network.</para>
///
/// <para>There was nothing to do about it in place. The native library we ship
/// (libgit2 1.8.6, via LibGit2Sharp 0.32.0) is built without WinHTTP, so Schannel is the
/// only HTTPS it has, and there is no runtime switch for the protocols it asks for. The
/// same unhandled <c>SEC_I_RENEGOTIATE</c> is on v1.9.0 and on main, so upgrading
/// LibGit2Sharp fixes nothing either. What libgit2 does offer is this: a subtransport
/// registered for a scheme replaces its own, and then it asks us for bytes rather than
/// opening a socket. Everything that makes it git - the ref negotiation, the packfile,
/// the objects, the checkout - is still libgit2's. This is a pipe.</para>
///
/// <para><b>When libgit2 fixes it, this can go.</b> The test is whether the bundled
/// native handles <c>SEC_I_RENEGOTIATE</c>:
/// <c>curl -s https://raw.githubusercontent.com/libgit2/libgit2/vX.Y.Z/src/libgit2/streams/schannel.c
/// | grep RENEGOTIATE</c> for whatever version the LibGit2Sharp in use bundles. Once
/// that returns something, set <see cref="OptOutVariable"/> and run the Windows clone
/// and push through libgit2's own stack; if that is clean, delete this file and the call
/// in <c>App.OnFrameworkInitializationCompleted</c> and nothing else changes - no caller
/// knows this is here. Until then the variable is also the escape hatch for a user this
/// transport breaks and Schannel does not.</para>
///
/// <para>Two things are deliberately better than a like-for-like replacement, because
/// they come free with .NET: the system proxy is honoured, which corporate Windows
/// machines need, and certificates are validated by the platform rather than by
/// libgit2's own check.</para>
/// </remarks>
public sealed class GitHttpTransport : RpcSmartSubtransport
{
    /// <summary>Set to anything to keep libgit2's own HTTPS on Windows.</summary>
    public const string OptOutVariable = "OMNIGIT_LIBGIT2_HTTPS";

    private static SmartSubtransportRegistration<GitHttpTransport>? _registration;

    /// <summary>
    /// The failure a stream could not report properly. LibGit2Sharp's read and write
    /// entry points map an exception to an error code and drop its message - only
    /// <c>Action</c> passes one to <c>git_error_set_str</c> - so a POST that fails
    /// half-way would otherwise reach the user as libgit2's stale, generic error.
    /// Thread-static because the transport runs on whichever thread called into git,
    /// and a background fetch may be doing this at the same time as a clone.
    /// </summary>
    [ThreadStatic]
    private static string? _lastError;

    /// <summary>
    /// Reads and clears whatever the transport last failed with on this thread.
    /// </summary>
    public static string? TakeLastError()
    {
        var error = _lastError;
        _lastError = null;
        return error;
    }

    /// <summary>
    /// Registers this transport for https. Safe to call more than once.
    /// </summary>
    /// <returns>
    /// A line for the activity log, or null where nothing was done - every platform
    /// but Windows, whose libgit2 uses OpenSSL and has never had the bug.
    /// </returns>
    public static string? RegisterForWindows()
    {
        if (!OperatingSystem.IsWindows() || _registration is not null)
            return null;

        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable(OptOutVariable)))
            return $"HTTPS left to libgit2 — {OptOutVariable} is set";

        _registration = GlobalSettings.RegisterSmartSubtransport<GitHttpTransport>("https");
        return "HTTPS goes through .NET, around libgit2's TLS 1.3 bug on Windows";
    }

    /// <summary>
    /// One client for the process. Pooling connections is what keeps the second half of
    /// an operation - the POST after the ref advertisement - off a fresh handshake.
    /// </summary>
    private static readonly HttpClient Shared = CreateClient();

    private readonly HttpClient _client;

    /// <summary>The constructor libgit2 uses; it can only call a parameterless one.</summary>
    public GitHttpTransport()
        : this(Shared)
    {
    }

    /// <summary>Lets a test hand in a client over a stub handler.</summary>
    internal GitHttpTransport(HttpClient client) => _client = client;

    /// <summary>Opens a connection the way libgit2 would, for tests.</summary>
    internal SmartSubtransportStream Connect(string url, GitSmartSubtransportAction action)
        => Action(url, action);

    private static HttpClient CreateClient()
    {
        var handler = new SocketsHttpHandler
        {
            AutomaticDecompression = DecompressionMethods.All,
            ConnectTimeout = TimeSpan.FromSeconds(30),
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),

            // A redirect on the ref advertisement is ordinary (a site moving /x to /x.git,
            // an organisation rename). Following it here and then reading the address we
            // ended up at is what keeps the POST that follows on the same server - a 301
            // would otherwise turn that POST into a GET and lose the request body.
            AllowAutoRedirect = true,
            MaxAutomaticRedirections = 5,
        };

        return new HttpClient(handler)
        {
            // The whole-response timeout would apply to a clone that streams for twenty
            // minutes. ConnectTimeout above is the one that should fire.
            Timeout = Timeout.InfiniteTimeSpan,
        };
    }

    /// <summary>
    /// What we call ourselves. GitHub only speaks the smart protocol to a client whose
    /// user agent starts with "git/", and answers the plain web page to anything else.
    /// It goes on every request rather than on the client's default headers, so that it
    /// is the transport's own doing and not a property of how the client was built.
    /// </summary>
    private static readonly string UserAgent = $"git/2.0 (Omnigit {AppVersion.Display})";

    /// <summary>What one action turns into on the wire.</summary>
    internal readonly record struct Endpoint(
        Uri Uri, bool Post, string? ContentType, string Accept, string Base, string? Username);

    /// <summary>
    /// Maps libgit2's four actions onto git's HTTP endpoints.
    /// </summary>
    /// <remarks>
    /// A URL may carry a username (<c>https://someone@host/repo.git</c>), which has to
    /// come off before the request and go to the credential callback instead - sending
    /// it in the address gets a 400 from some servers and is ignored by the rest.
    /// </remarks>
    internal static Endpoint EndpointFor(string url, GitSmartSubtransportAction action)
    {
        var parsed = new Uri(url);
        var username = string.IsNullOrEmpty(parsed.UserInfo)
            ? null
            : Uri.UnescapeDataString(parsed.UserInfo.Split(':')[0]);

        var withoutUser = new UriBuilder(parsed) { UserName = string.Empty, Password = string.Empty };
        var root = withoutUser.Uri.ToString().TrimEnd('/');

        return action switch
        {
            GitSmartSubtransportAction.UploadPackList => new(
                new Uri($"{root}/info/refs?service=git-upload-pack"), false, null,
                "application/x-git-upload-pack-advertisement", root, username),

            GitSmartSubtransportAction.UploadPack => new(
                new Uri($"{root}/git-upload-pack"), true, "application/x-git-upload-pack-request",
                "application/x-git-upload-pack-result", root, username),

            GitSmartSubtransportAction.ReceivePackList => new(
                new Uri($"{root}/info/refs?service=git-receive-pack"), false, null,
                "application/x-git-receive-pack-advertisement", root, username),

            GitSmartSubtransportAction.ReceivePack => new(
                new Uri($"{root}/git-receive-pack"), true, "application/x-git-receive-pack-request",
                "application/x-git-receive-pack-result", root, username),

            _ => throw new NotSupportedException($"Unknown git transport action {action}"),
        };
    }

    /// <summary>Basic auth, once a 401 has told us the server wants some.</summary>
    private AuthenticationHeaderValue? _authorization;

    /// <summary>Where a redirect on the advertisement moved this repository to.</summary>
    private (string From, string To)? _moved;

    protected override SmartSubtransportStream Action(string url, GitSmartSubtransportAction action)
    {
        var endpoint = EndpointFor(url, action);
        var stream = new GitHttpStream(this, endpoint);

        // A GET has no body, so it can be sent now rather than on the first read - and
        // an exception thrown here still carries its message into libgit2, which is
        // where "404" or "not a git repository" has to come from.
        if (!endpoint.Post)
            stream.Begin();

        return stream;
    }

    protected override void Close()
    {
        _moved = null;
        _authorization = null;
        base.Close();
    }

    /// <summary>
    /// Sends one request, acquiring credentials if the server asks for them.
    /// </summary>
    /// <remarks>
    /// The 401 is answered once and then remembered for the rest of the connection: the
    /// advertisement is a GET, so it is the cheap request that pays for the challenge,
    /// and the pack that follows goes out already authenticated rather than being sent
    /// twice. That ordering is the whole reason a push of any size is affordable here.
    /// </remarks>
    internal HttpResponseMessage Send(Endpoint endpoint, MemoryStream? body)
    {
        for (var attempt = 0; ; attempt++)
        {
            using var request = new HttpRequestMessage(
                endpoint.Post ? HttpMethod.Post : HttpMethod.Get, Redirected(endpoint));

            request.Headers.Accept.ParseAdd(endpoint.Accept);
            request.Headers.UserAgent.ParseAdd(UserAgent);

            if (_authorization is not null)
                request.Headers.Authorization = _authorization;

            if (body is not null)
            {
                // The buffer itself, not a StreamContent over it: disposing the request
                // at the end of an attempt would dispose the stream a StreamContent
                // wraps, and the attempt that has to survive that is precisely the one
                // that got a 401 and is about to send the same body again.
                request.Content = new ByteArrayContent(body.GetBuffer(), 0, (int)body.Length);
                request.Content.Headers.ContentType = new MediaTypeHeaderValue(endpoint.ContentType!);
            }

            var response = _client.Send(request, HttpCompletionOption.ResponseHeadersRead);

            if (response.StatusCode == HttpStatusCode.Unauthorized
                && attempt == 0
                && TryAuthorize(endpoint.Username))
            {
                response.Dispose();
                continue;
            }

            if (!response.IsSuccessStatusCode)
            {
                var status = $"{(int)response.StatusCode} {response.ReasonPhrase}".TrimEnd();
                response.Dispose();
                throw new HttpRequestException(
                    $"{endpoint.Uri.Host} answered {status} for {endpoint.Uri.AbsolutePath}");
            }

            RememberRedirect(endpoint, response);
            EnsureGitResponse(endpoint, response);

            return response;
        }
    }

    /// <summary>
    /// Asks libgit2 for credentials, which reaches the same callback every other network
    /// call in this app uses.
    /// </summary>
    /// <remarks>
    /// <c>DefaultCredentials</c> is what that callback returns when nobody is signed in
    /// for this host. There is nothing to send, so the 401 is left to stand and becomes
    /// "you need to sign in" one layer up, which is the true statement.
    /// </remarks>
    private bool TryAuthorize(string? username)
    {
        if (AcquireCredentials(out var credentials, username,
                typeof(UsernamePasswordCredentials), typeof(DefaultCredentials)) != 0)
        {
            return false;
        }

        if (credentials is not UsernamePasswordCredentials password)
            return false;

        var pair = Convert.ToBase64String(
            Encoding.UTF8.GetBytes($"{password.Username}:{password.Password}"));

        _authorization = new AuthenticationHeaderValue("Basic", pair);
        return true;
    }

    private Uri Redirected(Endpoint endpoint)
    {
        if (_moved is not { } moved || !endpoint.Uri.ToString().StartsWith(moved.From, StringComparison.Ordinal))
            return endpoint.Uri;

        return new Uri(string.Concat(moved.To, endpoint.Uri.ToString().AsSpan(moved.From.Length)));
    }

    /// <summary>
    /// Records where the advertisement actually came from, so the POST after it goes to
    /// the same place.
    /// </summary>
    private void RememberRedirect(Endpoint endpoint, HttpResponseMessage response)
    {
        if (endpoint.Post || response.RequestMessage?.RequestUri is not { } landed)
            return;

        var suffix = landed.ToString().IndexOf("/info/refs", StringComparison.Ordinal);
        if (suffix < 0)
            return;

        var arrivedAt = landed.ToString()[..suffix];
        if (string.Equals(arrivedAt, endpoint.Base, StringComparison.Ordinal))
            return;

        _moved = (endpoint.Base, arrivedAt);

        // A redirect to another host is a different server, and the token was never
        // meant for it. Forget the header rather than posting it onwards; the new host
        // gets its own 401 and its own trip through the credential callback.
        if (!string.Equals(landed.Host, endpoint.Uri.Host, StringComparison.OrdinalIgnoreCase))
            _authorization = null;
    }

    /// <summary>
    /// A server that answers a git URL with a web page is the common shape of a URL
    /// typed slightly wrong, and libgit2 would report it as a protocol parse error
    /// somewhere further in.
    /// </summary>
    private static void EnsureGitResponse(Endpoint endpoint, HttpResponseMessage response)
    {
        var type = response.Content.Headers.ContentType?.MediaType;

        if (type is null || type.StartsWith("application/x-git", StringComparison.OrdinalIgnoreCase))
            return;

        response.Dispose();
        throw new HttpRequestException(
            $"{endpoint.Uri.Host} answered with {type} rather than the git protocol — "
            + "is that the repository's clone URL?");
    }

    /// <summary>One request and its response, which is what libgit2 thinks is a socket.</summary>
    private sealed class GitHttpStream : SmartSubtransportStream
    {
        private readonly GitHttpTransport _transport;
        private readonly Endpoint _endpoint;

        private MemoryStream? _body;
        private HttpResponseMessage? _response;
        private Stream? _reading;

        public GitHttpStream(GitHttpTransport transport, Endpoint endpoint)
            : base(transport)
        {
            _transport = transport;
            _endpoint = endpoint;
        }

        /// <summary>Sends a request that has no body to wait for.</summary>
        public void Begin() => Open();

        public override int Write(Stream dataStream, long length)
        {
            try
            {
                // libgit2 writes the whole request before reading a byte of the answer,
                // so this is buffered rather than streamed. It has to be: a 401 arriving
                // on the first attempt is answered by sending the same body again, and a
                // body already handed to the socket cannot be replayed.
                _body ??= new MemoryStream();
                Copy(dataStream, _body, length);
                return 0;
            }
            catch (Exception ex)
            {
                _lastError = ex.Message;
                throw;
            }
        }

        public override int Read(Stream dataStream, long length, out long bytesRead)
        {
            bytesRead = 0;

            try
            {
                var reading = Open();
                var buffer = ArrayPool<byte>.Shared.Rent((int)Math.Min(length, 64 * 1024));

                try
                {
                    // One read, the way a socket behaves: fewer bytes than asked for is
                    // ordinary, and zero is the end of the response.
                    var read = reading.Read(buffer, 0, (int)Math.Min(buffer.Length, length));
                    if (read > 0)
                        dataStream.Write(buffer, 0, read);

                    bytesRead = read;
                    return 0;
                }
                finally
                {
                    ArrayPool<byte>.Shared.Return(buffer);
                }
            }
            catch (Exception ex)
            {
                _lastError = ex.Message;
                throw;
            }
        }

        private Stream Open()
        {
            if (_reading is not null)
                return _reading;

            _response = _transport.Send(_endpoint, _body);
            _reading = _response.Content.ReadAsStream();
            return _reading;
        }

        private static void Copy(Stream from, Stream to, long length)
        {
            var buffer = ArrayPool<byte>.Shared.Rent((int)Math.Min(length, 64 * 1024));

            try
            {
                var remaining = length;

                while (remaining > 0)
                {
                    var read = from.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                    if (read <= 0)
                        break;

                    to.Write(buffer, 0, read);
                    remaining -= read;
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
            }
        }

        protected override void Free()
        {
            _reading?.Dispose();
            _response?.Dispose();
            _body?.Dispose();

            _reading = null;
            _response = null;
            _body = null;

            base.Free();
        }
    }
}
