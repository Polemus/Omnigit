using System;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;

namespace Omnigit.Services;

/// <summary>
/// The activity log, written to disk as well as shown.
/// </summary>
/// <remarks>
/// <para>The console is capped and lives in memory, so it only ever answers "what is
/// happening now". The question that actually gets asked is "what happened", by someone
/// on another machine who has already closed the app - or whose app closed itself. This
/// is that answer: every line the console shows, dated, with the level spelled out, kept
/// across restarts.</para>
///
/// <para>It never gets to break the app. Every failure disables the file and leaves the
/// console alone: a log that cannot be written is worth less than an app that keeps
/// running, and the writes happen on whichever thread logged, off the UI thread.</para>
///
/// <para><b>Credentials are scrubbed on the way in.</b> Nothing deliberately logs a
/// token, but a remote URL can carry one - <c>https://user:token@host/repo.git</c> is a
/// perfectly ordinary git remote, and git's own errors quote the URL back. On screen
/// that is the user's own secret in front of the user; in a file it is a secret in
/// something they are about to email to us.</para>
/// </remarks>
public sealed partial class LogFile : IDisposable
{
    /// <summary>Set to anything to keep the log in memory only.</summary>
    public const string OptOutVariable = "OMNIGIT_NO_LOG_FILE";

    /// <summary>
    /// Rolled at this size, keeping one previous file. Big enough to hold a session of
    /// anything Omnigit does, small enough to attach to a message.
    /// </summary>
    private const long DefaultMaxBytes = 5 * 1024 * 1024;

    private readonly object _gate = new();
    private readonly long _maxBytes;

    private StreamWriter? _writer;
    private bool _disabled;

    public LogFile(string? path = null, long maxBytes = DefaultMaxBytes)
    {
        Path = path ?? AppPaths.In("omnigit.log");
        Previous = Path + ".1";
        _maxBytes = maxBytes;
        _disabled = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(OptOutVariable));
    }

    /// <summary>Where the log is being written, for telling the user.</summary>
    public string Path { get; }

    /// <summary>The previous file, kept so a rotation does not lose the session before.</summary>
    public string Previous { get; }

    public bool IsWriting => !_disabled;

    public void Write(ActivityLevel level, string message, string? detail = null)
    {
        if (_disabled)
            return;

        lock (_gate)
        {
            try
            {
                var writer = _writer ??= Open();

                var stamp = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
                writer.WriteLine($"{stamp}  {level.ToString().ToLowerInvariant(),-7} {Scrub(message)}");

                if (!string.IsNullOrWhiteSpace(detail))
                {
                    foreach (var line in detail.Split('\n'))
                        writer.WriteLine($"{new string(' ', 30)}{Scrub(line.TrimEnd('\r'))}");
                }

                Roll(writer);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                                       or NotSupportedException or ArgumentException)
            {
                // A read-only home, a full disk, a path the sandbox will not have. The
                // console still has everything; there is nothing to tell the user that
                // would not itself be a line in a log they cannot keep.
                _disabled = true;
                Close();
            }
        }
    }

    private StreamWriter Open()
    {
        var stream = new FileStream(Path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
        var writer = new StreamWriter(stream) { AutoFlush = true };

        // Flushed on every line, because the session worth reading is usually the one
        // that ended badly - and a buffer holds exactly the lines that explain why.

        writer.WriteLine();
        writer.WriteLine($"--- Omnigit {AppVersion.Display} on {Environment.OSVersion.VersionString} "
                         + $"— {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz} ---");

        return writer;
    }

    /// <summary>
    /// Starts a new file once this one is large enough, keeping the one before it.
    /// </summary>
    private void Roll(StreamWriter writer)
    {
        if (writer.BaseStream.Length < _maxBytes)
            return;

        Close();

        // Overwriting the previous file is the point: two files is the whole history
        // kept, and an unbounded pile of them is the thing a cap exists to avoid.
        File.Move(Path, Previous, overwrite: true);
    }

    /// <summary>
    /// Replaces the password in any URL that carries one.
    /// </summary>
    /// <remarks>
    /// The username stays: it is not a secret, and it is often the thing that explains
    /// the failure - the wrong account for that host.
    /// </remarks>
    internal static string Scrub(string text)
        => UrlCredentials().Replace(text, "$1://$2:***@");

    [GeneratedRegex(@"(\w+)://([^/\s:@]+):([^/\s@]+)@")]
    private static partial Regex UrlCredentials();

    private void Close()
    {
        _writer?.Dispose();
        _writer = null;
    }

    public void Dispose()
    {
        lock (_gate)
            Close();
    }
}
