using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// The activity log's copy on disk: what it writes, what it refuses to write, and what
/// it does when it gets large.
/// </summary>
public class LogFileTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName());

    public LogFileTests() => Directory.CreateDirectory(_directory);

    public void Dispose() => Directory.Delete(_directory, recursive: true);

    private string Path_(string name) => System.IO.Path.Combine(_directory, name);

    [Fact]
    public void Every_line_is_dated_and_says_what_it_was()
    {
        var path = Path_("omnigit.log");

        using (var log = new LogFile(path))
        {
            log.Write(ActivityLevel.Info, "Opened IMChat on main");
            log.Write(ActivityLevel.Error, "git.example.com refused", "the server said no");
        }

        var text = File.ReadAllText(path);

        Assert.Contains("info", text);
        Assert.Contains("Opened IMChat on main", text);
        Assert.Contains("error", text);
        Assert.Contains("the server said no", text);

        // A date, not just a time: the console shows HH:mm:ss because it is about now,
        // and a file read next week is not.
        Assert.Contains(DateTime.Now.ToString("yyyy-MM-dd"), text);
    }

    /// <summary>
    /// Which session a line belongs to is the first thing anyone asks of a log that
    /// spans restarts, and the version is the second.
    /// </summary>
    [Fact]
    public void Each_run_is_headed_and_the_one_before_is_kept()
    {
        var path = Path_("omnigit.log");

        using (var first = new LogFile(path))
            first.Write(ActivityLevel.Info, "first run");

        using (var second = new LogFile(path))
            second.Write(ActivityLevel.Info, "second run");

        var text = File.ReadAllText(path);

        Assert.Contains("first run", text);
        Assert.Contains("second run", text);
        Assert.Equal(2, text.Split("--- Omnigit").Length - 1);
        Assert.Contains($"--- Omnigit {AppVersion.Display}", text);
    }

    /// <summary>
    /// A remote can carry a token - https://user:token@host/repo.git is an ordinary git
    /// remote, and git's own errors quote the URL back. In a file about to be sent to
    /// somebody, that is the one thing that must not be in it.
    /// </summary>
    [Theory]
    [InlineData("cloning https://jean:ghp_secret@git.example.com/a/b.git",
                "cloning https://jean:***@git.example.com/a/b.git")]
    [InlineData("http://tester:Test-Pass-123!@localhost:3333/x.git",
                "http://tester:***@localhost:3333/x.git")]
    [InlineData("https://git.example.com/a/b.git", "https://git.example.com/a/b.git")]
    [InlineData("mailto: someone@example.com", "mailto: someone@example.com")]
    public void A_token_in_a_url_never_reaches_the_file(string written, string expected)
    {
        Assert.Equal(expected, LogFile.Scrub(written));
    }

    [Fact]
    public void The_username_survives_because_it_explains_the_failure()
    {
        Assert.Contains("jean", LogFile.Scrub("https://jean:ghp_secret@git.example.com/a/b.git"));
        Assert.DoesNotContain("ghp_secret", LogFile.Scrub("https://jean:ghp_secret@git.example.com/a/b.git"));
    }

    [Fact]
    public void The_scrubbing_reaches_the_file_itself()
    {
        var path = Path_("omnigit.log");

        using (var log = new LogFile(path))
            log.Write(ActivityLevel.Trace, "fetch https://jean:ghp_secret@git.example.com/a/b.git");

        Assert.DoesNotContain("ghp_secret", File.ReadAllText(path));
    }

    /// <summary>
    /// Rolled rather than grown, and the previous file kept: two files is the history,
    /// and an unbounded pile of them is what a cap exists to avoid.
    /// </summary>
    [Fact]
    public void A_large_log_rolls_over_and_keeps_the_one_before()
    {
        var path = Path_("omnigit.log");

        using (var log = new LogFile(path, maxBytes: 512))
        {
            for (var i = 0; i < 200; i++)
                log.Write(ActivityLevel.Trace, $"line {i} — {new string('x', 40)}");
        }

        Assert.True(File.Exists(path));
        Assert.True(File.Exists(path + ".1"), "the previous file should be kept");

        // The newest line is in the current file, not in the one rolled away.
        Assert.Contains("line 199", File.ReadAllText(path));
        Assert.True(new FileInfo(path).Length < 4096, "the current file should be the small one");
    }

    /// <summary>
    /// A read-only home or a full disk must cost the console nothing: the app keeps
    /// running and keeps showing everything, with the file quietly given up on.
    /// </summary>
    [Fact]
    public void A_path_that_cannot_be_written_is_given_up_on_rather_than_thrown()
    {
        var log = new LogFile(Path_("no-such-directory/omnigit.log"));

        log.Write(ActivityLevel.Info, "this goes nowhere");

        Assert.False(log.IsWriting);
        log.Dispose();
    }
}
