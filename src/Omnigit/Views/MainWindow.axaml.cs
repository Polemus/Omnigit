using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml.MarkupExtensions;
using Avalonia.Styling;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Omnigit.Services;
using Omnigit.ViewModels;

namespace Omnigit.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        UpdateThemeIcon();
        DataContextChanged += OnDataContextChanged;

        // Coming back to the window is when someone might act on a new release, so it is
        // the moment worth spending a request on. The view model decides whether enough
        // time has passed to bother; a timer alone cannot help a window left open for
        // days, because it fires on its own schedule rather than on anyone's attention.
        Activated += (_, _) =>
        {
            if (DataContext is MainWindowViewModel model)
                model.Update.OnWindowActivated();
        };

        // The branch picker opens onto its filter box, so it can be driven from the
        // keyboard alone. The flyout builds its content on open, which is why this hangs
        // off the flyout's event rather than the box's own Loaded.
        if (BranchPickerButton.Flyout is { } picker)
        {
            picker.Opened += (_, _) =>
                Dispatcher.UIThread.Post(() => BranchFilterBox.Focus(), DispatcherPriority.Input);

            // A filter left behind would greet the next open with a list of one.
            picker.Closed += (_, _) =>
            {
                if (DataContext is MainWindowViewModel model)
                    model.BranchFilter = string.Empty;
            };
        }
    }

    /// <summary>
    /// Enter takes the top match, Escape clears the box before the flyout gets the key
    /// and closes on the first press - a filter is worth undoing without losing the list.
    /// </summary>
    private void OnBranchFilterKeyDown(object? sender, KeyEventArgs e)
    {
        if (DataContext is not MainWindowViewModel model)
            return;

        if (e.Key == Key.Enter)
        {
            e.Handled = true;

            // Order matters: hiding the flyout clears the filter below, which rebuilds
            // the list unfiltered - and the top match would then be the top of every
            // branch in the repository rather than of the ones that were on screen.
            model.CheckoutTopMatchCommand.Execute(null);
            BranchPickerButton.Flyout?.Hide();
            return;
        }

        if (e.Key == Key.Escape && model.BranchFilter.Length > 0)
        {
            e.Handled = true;
            model.BranchFilter = string.Empty;
        }
    }

    /// <summary>
    /// Keeps the activity console pinned to the newest line, the way a terminal does.
    /// Without this the interesting part scrolls out of view during a fetch.
    /// </summary>
    private void OnDataContextChanged(object? sender, EventArgs e)
    {
        if (DataContext is not MainWindowViewModel model)
            return;

        // Text is only as tall as the lines in it, so with a short log everything below
        // the last one would belong to the ScrollViewer and a drag started there would
        // select nothing. Keeping the surface at least as tall as what is on screen is
        // what makes the empty part of the console draggable.
        LogScroller.SizeChanged += (_, size) => LogText.MinHeight = size.NewSize.Height;

        ((INotifyCollectionChanged)model.LogEntries).CollectionChanged += (_, args) =>
        {
            switch (args.Action)
            {
                case NotifyCollectionChangedAction.Add:
                    foreach (var entry in args.NewItems!.OfType<ActivityEntry>())
                        AppendLogLine(entry);
                    break;

                // The log is capped, so once it is full every new line drops the oldest.
                // Rebuilding the whole surface for that would run five hundred times a
                // fetch, so the runs that line contributed come off the front instead.
                case NotifyCollectionChangedAction.Remove:
                    for (var i = 0; i < args.OldItems!.Count; i++)
                        DropOldestLogLine();
                    break;

                default:
                    LogText.Inlines?.Clear();
                    _logLineRuns.Clear();
                    foreach (var entry in model.LogEntries)
                        AppendLogLine(entry);
                    break;
            }

            if (args.Action == NotifyCollectionChangedAction.Add)
                Dispatcher.UIThread.Post(() => LogScroller.ScrollToEnd(), DispatcherPriority.Background);
        };

        foreach (var entry in model.LogEntries)
            AppendLogLine(entry);
    }

    /// <summary>How many runs each line put into the surface, oldest first.</summary>
    private readonly Queue<int> _logLineRuns = new();

    /// <summary>
    /// Writes one entry as its own runs, so the whole log is a single selectable text
    /// while each line keeps the colour of what it was saying.
    /// </summary>
    private void AppendLogLine(ActivityEntry entry)
    {
        if (LogText.Inlines is not { } inlines)
            return;

        var runs = 2;

        inlines.Add(Coloured($"{entry.Timestamp}  ", "DiffGutterText"));
        inlines.Add(Coloured($"{entry.Message}\n", LevelResource(entry)));

        if (entry.HasDetail)
        {
            // Indented under its line, the way it was shown when each entry was a row.
            var detail = string.Join("\n          ", entry.Detail!.Split('\n').Select(l => l.TrimEnd('\r')));
            inlines.Add(Coloured($"          {detail}\n", "TextMuted"));
            runs++;
        }

        _logLineRuns.Enqueue(runs);
    }

    private void DropOldestLogLine()
    {
        if (LogText.Inlines is not { } inlines || !_logLineRuns.TryDequeue(out var runs))
            return;

        for (var i = 0; i < runs && inlines.Count > 0; i++)
            inlines.RemoveAt(0);
    }

    /// <summary>
    /// A run whose colour follows the theme. The brush is bound rather than looked up,
    /// so switching between light and dark repaints the log with everything else.
    /// </summary>
    private static Run Coloured(string text, string resourceKey)
    {
        var run = new Run(text);
        run.Bind(TextElement.ForegroundProperty, new DynamicResourceExtension(resourceKey));
        return run;
    }

    private static string LevelResource(ActivityEntry entry) => entry.Level switch
    {
        ActivityLevel.Trace => "TextMuted",
        ActivityLevel.Success => "StatusAdded",
        ActivityLevel.Warning => "StatusModified",
        ActivityLevel.Error => "StatusDeleted",
        _ => "TextPrimary",
    };

    private void OnCopyLogSelection(object? sender, RoutedEventArgs e) => LogText.Copy();

    private void OnSelectAllLog(object? sender, RoutedEventArgs e) => LogText.SelectAll();

    // Flyouts don't dismiss themselves when a templated row is clicked, so these
    // close them explicitly.
    //
    // The Post is load-bearing. Button raises Click *before* invoking Command, and
    // hiding a flyout tears down the popup's visual tree - which detaches the row's
    // DataContext and makes CommandParameter re-evaluate to null. Deferring the hide
    // to the next dispatcher pass lets the command run first, with its parameter
    // still intact.
    private void OnBranchRowClick(object? sender, RoutedEventArgs e)
        => Dispatcher.UIThread.Post(() => BranchPickerButton.Flyout?.Hide());

    /// <summary>
    /// Hiding the flyout is deferred: Click runs before Command, and tearing down the
    /// popup detaches the DataContext the command reads from.
    /// </summary>
    private void OnAddRepositoryRowClick(object? sender, RoutedEventArgs e)
        => Dispatcher.UIThread.Post(() => AddRepositoryButton.Flyout?.Hide());

    private void OnToggleTheme(object? sender, RoutedEventArgs e)
    {
        if (Application.Current is not { } app)
            return;

        app.RequestedThemeVariant = app.ActualThemeVariant == ThemeVariant.Dark
            ? ThemeVariant.Light
            : ThemeVariant.Dark;

        UpdateThemeIcon();
    }

    private void UpdateThemeIcon()
    {
        var key = Application.Current?.ActualThemeVariant == ThemeVariant.Dark
            ? "IconMoon"
            : "IconSun";

        if (this.TryFindResource(key, out var geometry) && geometry is Avalonia.Media.Geometry g)
            ThemeIcon.Data = g;
    }
}
