using System.Collections.Concurrent;
using System.ComponentModel;
using Avalonia.Threading;

namespace Omnigit.Services;

/// <summary>
/// The bindable half of <see cref="Strings"/>: one small notifying object per distinct
/// piece of UI text, so changing language redraws the window instead of restarting it.
/// </summary>
/// <remarks>
/// A plain property on a per-key object rather than an indexer on a shared one. An
/// indexer binding relies on the "Item[]" invalidation convention, which is a detail of
/// the binding implementation; a property named Value is the plainest thing a binding can
/// be pointed at and cannot stop working underneath us.
///
/// The objects are cached and live for the process. There are as many as there are
/// distinct strings in XAML - under two hundred - so nothing is gained by letting them go,
/// and holding them is what keeps this free of weak references and unsubscribe bugs.
/// </remarks>
public sealed class LocalizedText : INotifyPropertyChanged
{
    internal LocalizedText(string key) => Key = key;

    /// <summary>The English text, which is also the lookup key.</summary>
    public string Key { get; }

    public string Value => Strings.Get(Key);

    public event PropertyChangedEventHandler? PropertyChanged;

    internal void Refresh() => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Value)));
}

/// <summary>Hands out <see cref="LocalizedText"/> and refreshes them all at once.</summary>
public static class Localizer
{
    private static readonly ConcurrentDictionary<string, LocalizedText> Texts = new();

    static Localizer() => Strings.Changed += Refresh;

    public static LocalizedText Text(string english) =>
        Texts.GetOrAdd(english, static key => new LocalizedText(key));

    /// <summary>
    /// Marshalled, because the language can be changed from anywhere and a property
    /// change that reaches a control off the UI thread is a crash rather than a redraw.
    /// </summary>
    private static void Refresh()
    {
        if (Dispatcher.UIThread.CheckAccess())
        {
            RefreshNow();
            return;
        }

        Dispatcher.UIThread.Post(RefreshNow);
    }

    private static void RefreshNow()
    {
        foreach (var text in Texts.Values)
            text.Refresh();
    }
}
