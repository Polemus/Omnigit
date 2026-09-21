using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Omnigit.Services;

/// <summary>
/// One language, read from a gettext .po file.
/// </summary>
/// <remarks>
/// The msgid is the English text itself rather than an invented key, which is what makes
/// a missing or half-finished translation fall back to English for free: there is nothing
/// to fall back *to* except the key, and the key is the sentence. It also means no
/// separate English catalogue exists or can drift.
///
/// Nothing here throws. A catalogue that cannot be read is an empty one, and an empty one
/// renders the app in English - which is the correct failure for a file a stranger on a
/// translation site wrote.
/// </remarks>
internal sealed class PoCatalogue
{
    /// <summary>What gettext puts between a context and its msgid. Two entries can share
    /// English text and mean different things; keying on the pair keeps them apart.</summary>
    private const char ContextSeparator = '\u0004';

    private readonly Dictionary<string, string[]> _entries;

    public static PoCatalogue Empty { get; } = new([], PluralRule.Default);

    /// <summary>The language's own counting rule, out of its own header.</summary>
    public PluralRule Plural { get; }

    private PoCatalogue(Dictionary<string, string[]> entries, PluralRule plural)
    {
        _entries = entries;
        Plural = plural;
    }

    /// <summary>The translation, or null to mean "use the English that was asked for".</summary>
    public string? Lookup(string id) =>
        _entries.TryGetValue(id, out var forms) ? forms[0] : null;

    /// <summary>
    /// The form this language uses for <paramref name="count"/>. Falls back whole rather
    /// than per-form: a catalogue that translated the singular and left the plural blank
    /// would otherwise produce an English plural inside a translated sentence.
    /// </summary>
    public string? Lookup(string id, int count)
    {
        if (!_entries.TryGetValue(id, out var forms))
            return null;

        var index = Plural.Index(count);
        return index < forms.Length ? forms[index] : forms[0];
    }

    public static PoCatalogue Parse(TextReader reader)
    {
        try
        {
            return Read(reader);
        }
        catch (IOException)
        {
            return Empty;
        }
    }

    private static PoCatalogue Read(TextReader reader)
    {
        var entries = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var header = string.Empty;
        var entry = new Entry();

        while (reader.ReadLine() is { } line)
        {
            var text = line.Trim();

            if (text.Length == 0)
            {
                Flush(entries, ref entry, ref header);
                continue;
            }

            // "#~" is an entry gettext retired; "#," carries flags, of which only fuzzy
            // matters here. Everything else on a "#" line is a comment - the source
            // references the extractor writes, mostly.
            if (text[0] == '#')
            {
                // A comment belongs to the entry *below* it, so one arriving while an
                // entry is still open ends that entry. Blank lines between entries are
                // conventional rather than required, and a "#, fuzzy" landing on the
                // previous entry would mark the wrong sentence unreviewed - or, where the
                // previous entry is the header, mark nothing at all.
                if (entry.Id is not null)
                    Flush(entries, ref entry, ref header);

                if (text.StartsWith("#~", StringComparison.Ordinal))
                    entry.Obsolete = true;
                else if (text.StartsWith("#,", StringComparison.Ordinal)
                         && text.Contains("fuzzy", StringComparison.Ordinal))
                {
                    entry.Fuzzy = true;
                }

                continue;
            }

            if (Keyword(text, "msgctxt", out var rest))
            {
                Flush(entries, ref entry, ref header);
                entry.Context = Unquote(rest);
                entry.Target = Field.Context;
            }
            else if (Keyword(text, "msgid_plural", out rest))
            {
                entry.Target = Field.Plural;
            }
            else if (Keyword(text, "msgid", out rest))
            {
                // A msgid with no blank line before it still starts a new entry; .po files
                // in the wild are not reliably separated.
                if (entry.Id is not null)
                    Flush(entries, ref entry, ref header);

                entry.Id = Unquote(rest);
                entry.Target = Field.Id;
            }
            else if (Keyword(text, "msgstr", out rest))
            {
                var slot = 0;

                if (rest.StartsWith('['))
                {
                    var close = rest.IndexOf(']');
                    if (close < 0 || !int.TryParse(rest[1..close], out slot))
                        continue;

                    rest = rest[(close + 1)..].TrimStart();
                }

                entry.SetTranslation(slot, Unquote(rest));
                entry.Target = Field.Translation;
                entry.Slot = slot;
            }
            else if (text[0] == '"')
            {
                // A bare quoted line continues whichever field came last. This is how a
                // long sentence, and the header block, are written.
                entry.Append(Unquote(text));
            }
        }

        Flush(entries, ref entry, ref header);

        return new PoCatalogue(entries, PluralRule.Parse(PluralForms(header)));
    }

    private static void Flush(Dictionary<string, string[]> entries, ref Entry entry, ref string header)
    {
        var finished = entry;
        entry = new Entry();

        var id = finished.Id;
        if (id is null)
            return;

        var translations = finished.Translations;

        // The header is the entry with an empty msgid. It is routinely marked fuzzy by
        // tooling, so it is taken before the fuzzy test rather than after.
        if (id.Length == 0)
        {
            if (translations.Count > 0)
                header = translations[0] ?? string.Empty;

            return;
        }

        if (finished.Obsolete || finished.Fuzzy)
            return;

        var forms = new string[Math.Max(translations.Count, 1)];

        for (var i = 0; i < forms.Length; i++)
        {
            var value = i < translations.Count ? translations[i] : null;

            // One blank form means the entry is not finished. Taking it would put an
            // empty label on a button.
            if (string.IsNullOrEmpty(value))
                return;

            forms[i] = value;
        }

        entries[finished.Context is null ? id : finished.Context + ContextSeparator + id] = forms;
    }

    private static string? PluralForms(string header)
    {
        foreach (var line in header.Split('\n'))
        {
            var colon = line.IndexOf(':');
            if (colon > 0 && line.AsSpan(0, colon).Trim().Equals("Plural-Forms", StringComparison.OrdinalIgnoreCase))
                return line[(colon + 1)..];
        }

        return null;
    }

    private static bool Keyword(string line, string word, out string rest)
    {
        rest = string.Empty;

        if (!line.StartsWith(word, StringComparison.Ordinal))
            return false;

        var after = line.Length > word.Length ? line[word.Length] : ' ';

        // "msgid_plural" must not be read as "msgid" with a trailing underscore.
        if (after is not (' ' or '\t' or '"' or '['))
            return false;

        rest = line[word.Length..].TrimStart();
        return true;
    }

    /// <summary>Takes the text out of one "..." and undoes gettext's escaping.</summary>
    private static string Unquote(string value)
    {
        var open = value.IndexOf('"');
        if (open < 0)
            return string.Empty;

        var builder = new StringBuilder(value.Length);

        for (var i = open + 1; i < value.Length; i++)
        {
            var c = value[i];

            if (c == '"')
                break;

            if (c != '\\' || i + 1 >= value.Length)
            {
                builder.Append(c);
                continue;
            }

            i++;
            builder.Append(value[i] switch
            {
                'n' => '\n',
                't' => '\t',
                'r' => '\r',
                '0' => '\0',
                var escaped => escaped,
            });
        }

        return builder.ToString();
    }

    private enum Field { None, Context, Id, Plural, Translation }

    private sealed class Entry
    {
        public string? Context = null;
        public string? Id = null;
        public bool Fuzzy = false;
        public bool Obsolete = false;
        public Field Target = Field.None;
        public int Slot = 0;
        public List<string?> Translations = [];

        public void SetTranslation(int slot, string value)
        {
            while (Translations.Count <= slot)
                Translations.Add(null);

            Translations[slot] = value;
        }

        /// <summary>Continues the field the last keyword opened.</summary>
        public void Append(string more)
        {
            switch (Target)
            {
                case Field.Context:
                    Context += more;
                    break;
                case Field.Id:
                    Id += more;
                    break;
                case Field.Translation when Slot < Translations.Count:
                    Translations[Slot] += more;
                    break;

                // msgid_plural is never looked up - the singular is the key for both
                // forms - so its continuations are read and dropped.
                case Field.Plural:
                case Field.None:
                default:
                    break;
            }
        }
    }
}
