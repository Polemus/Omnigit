using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// The reader that turns a translator's .po file into the app's words.
/// </summary>
/// <remarks>
/// Two claims are worth pinning above all others. A catalogue states its own plural rule
/// in its header, and that is what lets Russian and Arabic count correctly while the
/// csproj still sets InvariantGlobalization - so the rules below are the real ones from
/// the real headers, not simplified. And nothing a stranger uploads to a translation site
/// can throw: every malformed shape here has to come back as English rather than as an
/// exception in the middle of drawing a window.
/// </remarks>
public class LocalizationTests
{
    private static PoCatalogue Parse(string po) => PoCatalogue.Parse(new StringReader(po));

    private const string Germanic =
        """
        msgid ""
        msgstr ""
        "Plural-Forms: nplurals=2; plural=(n != 1);\n"

        """;

    // ---- plural rules ------------------------------------------------------

    [Theory]
    [InlineData(0, 1)]
    [InlineData(1, 0)]
    [InlineData(2, 1)]
    [InlineData(21, 1)]
    public void English_has_one_form_for_exactly_one(int count, int form)
        => Assert.Equal(form, PluralRule.Parse("nplurals=2; plural=(n != 1);").Index(count));

    /// <summary>1, 21, 31 take the first form; 2-4, 22-24 the second; the rest the third.</summary>
    [Theory]
    [InlineData(1, 0)]
    [InlineData(21, 0)]
    [InlineData(2, 1)]
    [InlineData(24, 1)]
    [InlineData(5, 2)]
    [InlineData(11, 2)]
    [InlineData(111, 2)]
    public void Russian_has_three(int count, int form)
        => Assert.Equal(form, PluralRule.Parse(
            "nplurals=3; plural=n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2;")
            .Index(count));

    /// <summary>Zero, one, two, a few, many and other - six, and the reason a boolean
    /// "is it 1" cannot be the shape of this API.</summary>
    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 1)]
    [InlineData(2, 2)]
    [InlineData(3, 3)]
    [InlineData(11, 4)]
    [InlineData(100, 5)]
    public void Arabic_has_six(int count, int form)
        => Assert.Equal(form, PluralRule.Parse(
            "nplurals=6; plural=n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5;")
            .Index(count));

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(99)]
    public void Japanese_has_one_form_for_every_number(int count)
        => Assert.Equal(0, PluralRule.Parse("nplurals=1; plural=0;").Index(count));

    [Fact]
    public void A_rule_that_cannot_be_read_counts_like_English()
    {
        var rule = PluralRule.Parse("nplurals=3; plural=n ? ? 2;");

        Assert.Equal(0, rule.Index(1));
        Assert.Equal(1, rule.Index(7));
    }

    /// <summary>
    /// A header claiming two forms with an expression that can return 2 is a typo, and it
    /// must not become an IndexOutOfRangeException behind a label.
    /// </summary>
    [Fact]
    public void A_rule_reaching_past_its_own_form_count_is_clamped()
        => Assert.Equal(0, PluralRule.Parse("nplurals=2; plural=2;").Index(5));

    [Fact]
    public void Dividing_by_zero_in_a_rule_does_not_throw()
        => Assert.Equal(0, PluralRule.Parse("nplurals=2; plural=n%0;").Index(3));

    // ---- reading a catalogue -----------------------------------------------

    [Fact]
    public void A_translated_entry_comes_back_translated()
    {
        var po = Germanic +
            """
            msgid "Fetch origin"
            msgstr "Origin abrufen"
            """;

        Assert.Equal("Origin abrufen", Parse(po).Lookup("Fetch origin"));
    }

    [Fact]
    public void An_entry_nobody_has_translated_yet_comes_back_as_nothing()
    {
        var po = Germanic +
            """
            msgid "Fetch origin"
            msgstr ""
            """;

        Assert.Null(Parse(po).Lookup("Fetch origin"));
    }

    [Fact]
    public void A_string_the_catalogue_has_never_heard_of_comes_back_as_nothing()
        => Assert.Null(Parse(Germanic).Lookup("Publish branch"));

    /// <summary>Fuzzy means a machine guessed it and no one has looked. Showing it would
    /// put a sentence in front of a user that nobody has read.</summary>
    [Fact]
    public void A_fuzzy_entry_is_treated_as_untranslated()
    {
        var po = Germanic +
            """
            #, fuzzy
            msgid "Fetch origin"
            msgstr "Origin holen"
            """;

        Assert.Null(Parse(po).Lookup("Fetch origin"));
    }

    [Fact]
    public void An_obsolete_entry_is_ignored()
    {
        var po = Germanic +
            """
            #~ msgid "Fetch origin"
            #~ msgstr "Origin abrufen"
            """;

        Assert.Null(Parse(po).Lookup("Fetch origin"));
    }

    [Fact]
    public void A_sentence_split_across_lines_is_joined_back_up()
    {
        var po = Germanic +
            """
            msgid ""
            "This repository has no remote to fetch from."
            msgstr ""
            "Dieses Repository hat kein Remote, "
            "von dem abgerufen werden kann."
            """;

        Assert.Equal(
            "Dieses Repository hat kein Remote, von dem abgerufen werden kann.",
            Parse(po).Lookup("This repository has no remote to fetch from."));
    }

    [Fact]
    public void Comments_and_source_references_are_skipped()
    {
        var po = Germanic +
            """
            # a translator's note
            #: src/Omnigit/ViewModels/MainWindowViewModel.cs:931
            msgid "Fetch origin"
            msgstr "Origin abrufen"
            """;

        Assert.Equal("Origin abrufen", Parse(po).Lookup("Fetch origin"));
    }

    [Fact]
    public void Escapes_survive_the_round_trip()
    {
        var po = Germanic +
            """
            msgid "Linked worktree of {0}\n{1}"
            msgstr "Verknüpfter Worktree von {0}\n{1}"
            """;

        Assert.Equal("Verknüpfter Worktree von {0}\n{1}", Parse(po).Lookup("Linked worktree of {0}\n{1}"));
    }

    [Fact]
    public void A_file_that_is_not_a_catalogue_at_all_loads_nothing_rather_than_throwing()
    {
        var catalogue = Parse("<html><body>404 Not Found</body></html>");

        Assert.Null(catalogue.Lookup("Fetch origin"));
        Assert.Equal(2, catalogue.Plural.Forms);
    }

    [Fact]
    public void An_entry_cut_off_half_way_through_loses_only_itself()
    {
        var po = Germanic +
            """
            msgid "Fetch origin"
            msgstr "Origin abrufen"

            msgid "Push origin
            """;

        Assert.Equal("Origin abrufen", Parse(po).Lookup("Fetch origin"));
    }

    // ---- plurals through a catalogue ---------------------------------------

    private const string RussianMinutes =
        """
        msgid ""
        msgstr ""
        "Plural-Forms: nplurals=3; plural=n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2;\n"

        msgid "{0} minute ago"
        msgid_plural "{0} minutes ago"
        msgstr[0] "{0} минуту назад"
        msgstr[1] "{0} минуты назад"
        msgstr[2] "{0} минут назад"
        """;

    [Theory]
    [InlineData(1, "{0} минуту назад")]
    [InlineData(3, "{0} минуты назад")]
    [InlineData(7, "{0} минут назад")]
    [InlineData(21, "{0} минуту назад")]
    public void A_count_picks_the_form_the_catalogue_says_it_should(int count, string expected)
        => Assert.Equal(expected, Parse(RussianMinutes).Lookup("{0} minute ago", count));

    /// <summary>
    /// Half a plural is not a translation. Taking the one form that was filled in would
    /// put a Russian singular against every number on the screen.
    /// </summary>
    [Fact]
    public void A_plural_with_a_form_left_blank_falls_back_whole()
    {
        var po =
            """
            msgid ""
            msgstr ""
            "Plural-Forms: nplurals=3; plural=n%10==1 && n%100!=11 ? 0 : 2;\n"

            msgid "{0} minute ago"
            msgid_plural "{0} minutes ago"
            msgstr[0] "{0} минуту назад"
            msgstr[1] ""
            msgstr[2] ""
            """;

        Assert.Null(Parse(po).Lookup("{0} minute ago", 1));
    }

    // ---- the facade --------------------------------------------------------

    [Fact]
    public void With_no_language_loaded_every_string_is_the_English_it_was_asked_for()
    {
        Strings.Use(null);

        Assert.Equal("en", Strings.Current);
        Assert.Equal("Fetch origin", Strings.Get("Fetch origin"));
        Assert.Equal("Publish branch", Strings.Get("Publish branch"));
    }

    [Fact]
    public void A_language_this_build_does_not_carry_leaves_the_app_in_English()
    {
        Strings.Use("qq-ZZ");

        Assert.Equal("en", Strings.Current);
        Assert.Equal("Fetch origin", Strings.Get("Fetch origin"));
    }

    [Fact]
    public void English_is_always_offered_and_is_offered_first()
        => Assert.Equal("en", Strings.Available()[0]);

    /// <summary>
    /// The one test that exercises the whole chain rather than a piece of it: the csproj
    /// embedding a file whose name is not an identifier, Strings.Use finding it by that
    /// name, the reader parsing what extract.py wrote, and a lookup coming back changed.
    /// The fake language is the only catalogue this repo generates, so it is the only one
    /// that can be asserted on without a translator.
    /// </summary>
    [Fact]
    public void The_generated_fake_language_loads_and_changes_what_the_app_says()
    {
        try
        {
            Assert.Contains("qps-ploc", Strings.Available());

            Strings.Use("qps-ploc");

            Assert.Equal("qps-ploc", Strings.Current);

            var cancel = Strings.Get("Cancel");
            Assert.NotEqual("Cancel", cancel);
            Assert.StartsWith("[!!", cancel);

            // The padding is the point: a control sized to "Cancel" has to cope with this.
            Assert.True(cancel.Length > "Cancel".Length);
        }
        finally
        {
            Strings.Use(null);
        }
    }

    /// <summary>
    /// A string that was never put through Strings shows as plain English under the fake
    /// language - which is exactly how a missed one is spotted by looking at the app.
    /// </summary>
    [Fact]
    public void A_string_the_extractor_never_saw_stays_English_under_the_fake_language()
    {
        try
        {
            Strings.Use("qps-ploc");
            Assert.Equal("nobody ran the extractor over this", Strings.Get("nobody ran the extractor over this"));
        }
        finally
        {
            Strings.Use(null);
        }
    }

    /// <summary>
    /// Without a catalogue the count still decides, so every call site can be written as
    /// a plural from the start rather than being revisited when a translation arrives.
    /// </summary>
    [Theory]
    [InlineData(1, "1 minute ago")]
    [InlineData(4, "4 minutes ago")]
    [InlineData(0, "0 minutes ago")]
    public void Untranslated_plurals_still_count_in_English(int count, string expected)
    {
        Strings.Use(null);

        Assert.Equal(expected, Strings.Plural("{0} minute ago", "{0} minutes ago", count));
    }

    [Fact]
    public void Format_fills_placeholders_in_the_English_when_untranslated()
    {
        Strings.Use(null);

        Assert.Equal(
            "Last fetched 3 minutes ago",
            Strings.Format("Last fetched {0}", "3 minutes ago"));
    }

    /// <summary>
    /// A sentence can contain a brace - a URL template in the hosting-site form does -
    /// so plain lookup must not go anywhere near string.Format.
    /// </summary>
    [Fact]
    public void A_string_containing_a_brace_survives_an_untranslated_lookup()
    {
        Strings.Use(null);

        Assert.Equal("{base}/{owner}/{repo}", Strings.Get("{base}/{owner}/{repo}"));
    }
}
