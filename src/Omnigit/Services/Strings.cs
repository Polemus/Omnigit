using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;

namespace Omnigit.Services;

/// <summary>
/// Every sentence the app shows a user goes through here.
/// </summary>
/// <remarks>
/// The English text is the key. There is no English catalogue and no key to invent, so a
/// string cannot drift from its own name, and a language that has translated four fifths
/// of the app shows the other fifth in English with nothing to arrange.
///
/// Static rather than injected because the alternative is threading a service into every
/// model and view model that computes a display string, including the ones that are
/// static themselves (<see cref="Models.TimeFormat"/>, <see cref="Models.SyncCounts"/>).
/// </remarks>
public static class Strings
{
    /// <summary>Where the embedded catalogues live; see the csproj, which sets this as
    /// their LogicalName explicitly because MSBuild mangles "pt-BR" otherwise.</summary>
    private const string Prefix = "Omnigit.Resources.Locale.";

    private const string Extension = ".po";

    /// <summary>The language every catalogue falls back to, and the one in the source.</summary>
    public const string Fallback = "en";

    private static PoCatalogue _catalogue = PoCatalogue.Empty;

    /// <summary>What <see cref="Use"/> last settled on - not what it was asked for.</summary>
    public static string Current { get; private set; } = Fallback;

    /// <summary>Raised after the language changes, on whichever thread changed it.</summary>
    public static event Action? Changed;

    /// <summary>The translated text, or the English that was asked for.</summary>
    public static string Get(string english) => _catalogue.Lookup(english) ?? english;

    /// <summary>
    /// The translated text with its placeholders filled.
    /// </summary>
    /// <remarks>
    /// Separate from <see cref="Get"/> rather than an optional parameter: a sentence with
    /// a literal brace in it - a URL template, a JSON example - would throw from
    /// string.Format if every lookup went through it.
    /// </remarks>
    public static string Format(string english, params object?[] arguments) =>
        string.Format(CultureInfo.InvariantCulture, Get(english), arguments);

    /// <summary>
    /// The form this language uses for <paramref name="count"/>, with {0} filled in.
    /// </summary>
    /// <remarks>
    /// Both English forms are passed because the singular is the key and the plural is
    /// what an untranslated catalogue falls back to. Which form a translation uses is the
    /// catalogue's own business - English asks for two, Japanese wants one and Arabic six,
    /// and the .po header says which.
    /// </remarks>
    /// <param name="rest">
    /// Anything else the sentence names, from {1} onwards. The count is always {0}, so a
    /// translation can move it anywhere in the sentence without the call site changing -
    /// which is the point, since a pluralized noun phrase spliced into a sentence is the
    /// shape this whole exercise exists to remove.
    /// </param>
    public static string Plural(string one, string many, int count, params object?[] rest)
    {
        var form = _catalogue.Lookup(one, count)
                   ?? (count == 1 ? one : many);

        if (rest.Length == 0)
            return string.Format(CultureInfo.InvariantCulture, form, count);

        var arguments = new object?[rest.Length + 1];
        arguments[0] = count;
        rest.CopyTo(arguments, 1);

        return string.Format(CultureInfo.InvariantCulture, form, arguments);
    }

    /// <summary>
    /// For two English words that are spelled the same and mean different things - a
    /// "Switch" you press and a "Switch" that happened. gettext calls this pgettext; the
    /// context is a note to the translator and is never shown.
    /// </summary>
    public static string Particular(string context, string english) =>
        _catalogue.Lookup(context + '\u0004' + english) ?? english;

    /// <summary>
    /// Loads a language. Anything unknown, unreadable or empty leaves the app in English,
    /// which is the right answer for a file a stranger on a translation site wrote.
    /// </summary>
    public static void Use(string? language)
    {
        var wanted = Normalise(language);
        var resolved = Resolve(wanted);

        _catalogue = resolved is null ? PoCatalogue.Empty : Load(resolved);
        Current = resolved ?? Fallback;

        Changed?.Invoke();
    }

    /// <summary>Which languages this build carries, English first.</summary>
    public static IReadOnlyList<string> Available()
    {
        var names = Assembly.GetExecutingAssembly().GetManifestResourceNames()
            .Where(name => name.StartsWith(Prefix, StringComparison.Ordinal)
                           && name.EndsWith(Extension, StringComparison.Ordinal))
            .Select(name => name[Prefix.Length..^Extension.Length])
            .Where(language => !string.Equals(language, Fallback, StringComparison.OrdinalIgnoreCase))
            .OrderBy(language => language, StringComparer.Ordinal);

        return new[] { Fallback }.Concat(names).ToArray();
    }

    /// <summary>
    /// "pt_BR.UTF-8" and "pt-br" both mean the catalogue called pt-BR. A region we do not
    /// ship falls back to the bare language, so a Brazilian gets Portuguese rather than
    /// English when only pt exists.
    /// </summary>
    private static string Normalise(string? language)
    {
        if (string.IsNullOrWhiteSpace(language))
            return Fallback;

        var value = language.Trim();

        foreach (var cut in new[] { '.', '@' })
        {
            var at = value.IndexOf(cut);
            if (at >= 0)
                value = value[..at];
        }

        return value.Replace('_', '-');
    }

    private static string? Resolve(string wanted)
    {
        if (wanted.Equals(Fallback, StringComparison.OrdinalIgnoreCase))
            return null;

        var names = Assembly.GetExecutingAssembly().GetManifestResourceNames();

        foreach (var candidate in Candidates(wanted))
        {
            var resource = Prefix + candidate + Extension;

            foreach (var name in names)
            {
                if (name.Equals(resource, StringComparison.OrdinalIgnoreCase))
                    return candidate;
            }
        }

        return null;
    }

    private static IEnumerable<string> Candidates(string wanted)
    {
        yield return wanted;

        var dash = wanted.IndexOf('-');
        if (dash > 0)
            yield return wanted[..dash];
    }

    private static PoCatalogue Load(string language)
    {
        try
        {
            using var stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream(Prefix + language + Extension);

            if (stream is null)
                return PoCatalogue.Empty;

            using var reader = new StreamReader(stream);
            return PoCatalogue.Parse(reader);
        }
        catch (Exception ex) when (ex is IOException or BadImageFormatException)
        {
            return PoCatalogue.Empty;
        }
    }
}
