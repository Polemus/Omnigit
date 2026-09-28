using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Markup.Xaml.MarkupExtensions;
using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.Views;

/// <summary>
/// Renders one diff line as coloured runs, from the spans the parser worked out.
/// </summary>
/// <remarks>
/// An attached property rather than a binding, because <c>TextBlock.Inlines</c> is a
/// collection that has to be built rather than assigned - there is nothing to bind to.
/// <para>
/// Each coloured run is bound to a resource key rather than handed a brush, so the
/// palette stays in <c>Tokens.axaml</c> with every other colour and the diff repaints on
/// a theme switch instead of keeping the colours it was built with.
/// </para>
/// <para>
/// A binding rather than a style, and that part is not cosmetic. A style on the run only
/// beats the row's own <c>Foreground</c> if it is applied first, and the add/remove
/// classes arrive from a binding <em>after</em> these runs are built - so styled runs
/// came out coloured on context lines, whose classes are static, and flat green on every
/// added line. A binding on the run itself outranks the value it would inherit from the
/// row whenever it is applied.
/// </para>
/// </remarks>
public static class SyntaxText
{
    public static readonly AttachedProperty<DiffLine?> LineProperty =
        AvaloniaProperty.RegisterAttached<TextBlock, DiffLine?>("Line", typeof(SyntaxText));

    public static void SetLine(TextBlock target, DiffLine? value) => target.SetValue(LineProperty, value);

    public static DiffLine? GetLine(TextBlock target) => target.GetValue(LineProperty);

    static SyntaxText() => LineProperty.Changed.AddClassHandler<TextBlock>(OnLineChanged);

    private static void OnLineChanged(TextBlock target, AvaloniaPropertyChangedEventArgs e)
    {
        var line = e.NewValue as DiffLine;

        // Rows are recycled as the list changes, so the previous line's runs have to go
        // whether or not this one has any of its own.
        target.Inlines?.Clear();

        if (line is null)
        {
            target.Text = string.Empty;
            return;
        }

        if (line.Spans.Count == 0 && line.Emphasis.Count == 0)
        {
            // No grammar, or nothing worth colouring. Plain Text is cheaper than a
            // single Run and is what the great majority of lines get.
            target.Text = line.Text;
            return;
        }

        target.Text = null;
        target.Inlines ??= [];

        // The line is cut wherever a colour starts or stops *or* a changed word does,
        // since the two are worked out separately and overlap freely: a changed word can
        // be half of a string literal, and a keyword can straddle an edit.
        var cuts = new SortedSet<int> { 0, line.Text.Length };
        foreach (var span in line.Spans)
        {
            cuts.Add(Math.Clamp(span.Start, 0, line.Text.Length));
            cuts.Add(Math.Clamp(span.Start + span.Length, 0, line.Text.Length));
        }
        foreach (var range in line.Emphasis)
        {
            cuts.Add(Math.Clamp(range.Start, 0, line.Text.Length));
            cuts.Add(Math.Clamp(range.End, 0, line.Text.Length));
        }

        var emphasisKey = line.IsAdded ? "DiffAddEmphasis" : "DiffRemoveEmphasis";
        int? from = null;

        foreach (var cut in cuts)
        {
            if (from is { } start && cut > start)
            {
                Add(target, line.Text[start..cut],
                    CategoryAt(line.Spans, start),
                    Covers(line.Emphasis, start) ? emphasisKey : null);
            }

            from = cut;
        }
    }

    private static SyntaxCategory? CategoryAt(IReadOnlyList<SyntaxSpan> spans, int at)
    {
        foreach (var span in spans)
        {
            if (at >= span.Start && at < span.Start + span.Length)
                return span.Category;
        }

        return null;
    }

    private static bool Covers(IReadOnlyList<TextRange> ranges, int at)
    {
        foreach (var range in ranges)
        {
            if (at >= range.Start && at < range.End)
                return true;
        }

        return false;
    }

    /// <summary>
    /// Adds the run, <em>then</em> binds its colours. That order is load-bearing: a
    /// dynamic resource is resolved by searching up from the element that wants it, and
    /// a run that has not been added to the block yet has no parent to search from. Bound
    /// first, it silently resolves to nothing and the run falls back to inheriting the
    /// row's colour - which is why every line of an added file came out flat green.
    /// </summary>
    private static void Add(TextBlock target, string text, SyntaxCategory? category, string? backgroundKey)
    {
        var run = new Run(text);
        target.Inlines!.Add(run);

        if (category is { } c && ResourceKeyFor(c) is { } key)
            run.Bind(TextElement.ForegroundProperty, new DynamicResourceExtension(key));

        if (backgroundKey is not null)
            run.Bind(TextElement.BackgroundProperty, new DynamicResourceExtension(backgroundKey));
    }

    private static string? ResourceKeyFor(SyntaxCategory category) => category switch
    {
        SyntaxCategory.Keyword => "SyntaxKeyword",
        SyntaxCategory.String => "SyntaxString",
        SyntaxCategory.Comment => "SyntaxComment",
        SyntaxCategory.Number => "SyntaxNumber",
        SyntaxCategory.Type => "SyntaxType",
        SyntaxCategory.Function => "SyntaxFunction",
        _ => null,
    };
}
