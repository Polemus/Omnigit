using System;
using System.Collections.ObjectModel;
using Avalonia.Threading;

namespace Omnigit.Services;

public enum ActivityLevel
{
    Trace,
    Info,
    Success,
    Warning,
    Error,
}

/// <summary>One line in the activity console.</summary>
public sealed class ActivityEntry
{
    public required ActivityLevel Level { get; init; }
    public required string Message { get; init; }

    /// <summary>Extra context (a stack trace, a server response) shown indented.</summary>
    public string? Detail { get; init; }

    public DateTimeOffset At { get; init; } = DateTimeOffset.Now;

    public string Timestamp => At.ToString("HH:mm:ss");
    public bool HasDetail => !string.IsNullOrWhiteSpace(Detail);

    // Styling hooks, bound to Classes.* in the view.
    public bool IsTrace => Level == ActivityLevel.Trace;
    public bool IsSuccess => Level == ActivityLevel.Success;
    public bool IsWarning => Level == ActivityLevel.Warning;
    public bool IsError => Level == ActivityLevel.Error;
}

/// <summary>
/// Collects what the app is doing so the user can see it, rather than operations
/// failing silently or the app breaking.
/// </summary>
public interface IActivityLog
{
    ReadOnlyObservableCollection<ActivityEntry> Entries { get; }

    /// <summary>Raised when an error is logged, so the UI can reveal the console.</summary>
    event EventHandler? ErrorLogged;

    void Write(ActivityLevel level, string message, string? detail = null);
    void Clear();
}

/// <summary>
/// In-memory log, capped so a chatty fetch can't grow without bound.
/// </summary>
/// <remarks>
/// Writes are marshalled to the UI thread. Git work runs on pooled threads and
/// libgit2's progress callbacks fire on whichever thread is doing the transfer, so
/// appending directly would mutate a bound collection off-thread.
/// </remarks>
public sealed class ActivityLog : IActivityLog
{
    /// <summary>
    /// How much of the session the console holds. It is a bound collection kept for the
    /// life of the process and laid out on screen, so it cannot grow forever - but 500
    /// was too tight to be the only copy of anything: a chatty clone would evict every
    /// line that explained itself long before anyone came to read it. The file below has
    /// no such limit, which is what lets this be a window rather than the record.
    /// </summary>
    private const int MaxEntries = 5000;

    private readonly ObservableCollection<ActivityEntry> _entries = [];
    private readonly LogFile? _file;

    /// <param name="file">
    /// Where the same lines are kept across restarts. Null keeps the log in memory only,
    /// which is what the tests want and what an opt-out gives.
    /// </param>
    public ActivityLog(LogFile? file = null)
    {
        _file = file;
        Entries = new ReadOnlyObservableCollection<ActivityEntry>(_entries);
    }

    public ReadOnlyObservableCollection<ActivityEntry> Entries { get; }

    public event EventHandler? ErrorLogged;

    public void Write(ActivityLevel level, string message, string? detail = null)
    {
        if (string.IsNullOrWhiteSpace(message))
            return;

        var entry = new ActivityEntry { Level = level, Message = message, Detail = detail };

        // On whichever thread logged, before the hop to the UI one: file writes have no
        // business on the thread drawing the window, and a line written by the thread
        // that produced it is one the app cannot lose on its way to being shown.
        _file?.Write(level, message, detail);

        if (Dispatcher.UIThread.CheckAccess())
            Append(entry);
        else
            Dispatcher.UIThread.Post(() => Append(entry));
    }

    public void Clear()
    {
        if (Dispatcher.UIThread.CheckAccess())
            _entries.Clear();
        else
            Dispatcher.UIThread.Post(_entries.Clear);
    }

    private void Append(ActivityEntry entry)
    {
        _entries.Add(entry);

        while (_entries.Count > MaxEntries)
            _entries.RemoveAt(0);

        if (entry.Level == ActivityLevel.Error)
            ErrorLogged?.Invoke(this, EventArgs.Empty);
    }
}
