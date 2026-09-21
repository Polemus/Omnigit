# Translating Omnigit

Omnigit is translated by the people who use it. You do not need to write code or know
git.

## If you want to translate

**The easy way is not available yet.** Omnigit is not on Weblate — a translation site
where you would pick a language and fill in boxes, with the pull request opened for you.
It is coming; until then the route below is the one that works, and it asks more of you
than it should.

<!-- TODO: when the Weblate project exists, this becomes "go there and fill in boxes" and
     the section below becomes the alternative rather than the only way. The setup is a
     maintainer task and lives in CLAUDE.md's roadmap, not here. -->

### Until then, by hand

You need a text editor and a GitHub account. You do not need git installed, and you do not
need to know how to use it.

1. **Get [Poedit](https://poedit.net/)** — free, on Windows, macOS and Linux, and made for
   exactly this. A plain text editor works too, but Poedit writes the file header for you
   and shows the right number of plural boxes for your language, which are the two things
   that are fiddly to get right by hand.
2. **Open `src/Omnigit/Resources/Locale/Omnigit.pot`** from this repository. Poedit will
   ask which language you are translating into and create the file.
3. **Fill in what you like.** Nothing has to be finished — see the notes above about `{0}`,
   context notes and plurals.
4. **Save it as `<language>.po`** — `af.po`, `de.po`, `pt_BR.po` — using the code Poedit
   suggests.
5. **Open a pull request.** On GitHub, go to `src/Omnigit/Resources/Locale/`, press **Add
   file → Upload files**, drop your `.po` in, and choose *Create a new branch and start a
   pull request*. GitHub makes the fork and the branch for you.

That is the whole thing. Nobody will ask you to rebase anything.

If a string looks wrong in English, say so in the pull request rather than fixing it in
your language alone — it is wrong for everybody.

Three things worth knowing before you start:

- **Leave `{0}` alone.** It is where a number, a name or a path is substituted. Move it
  wherever your language needs it, but do not translate it or change its number.
- **Some English strings look identical and are not.** Where that happens the string
  carries a context note, shown beside it in Weblate — `between items of a list` on the
  `", "` separator, for example.
- **Plurals are not two boxes everywhere.** Weblate shows as many as your language has:
  one for Japanese, two for German, three for Russian, six for Arabic. Fill in all of
  them — a plural with a form left blank falls back to English *whole*, deliberately,
  rather than showing a singular against every number.

Nothing needs to be finished. A language ships at whatever percentage it has reached, and
anything untranslated shows in English.

## If you want to add a string to the app

Every user-facing sentence goes through `Strings`:

```csharp
Strings.Get("Fetch origin")
Strings.Format("Last fetched {0}", relative)
Strings.Plural("{0} file changed", "{0} files changed", count)
Strings.Particular("between items of a list", ", ")
```

and in XAML:

```xml
<Button Content="{Loc 'Fetch origin'}" />
```

The English text *is* the key. There is no `en.po` and no key to invent, so a string
cannot drift from its own name and an unfinished language falls back to English for free.

Then regenerate the catalogues:

```bash
python3 build/i18n/extract.py
```

CI runs `extract.py --check` and fails if you forgot. That check exists because a string
added without regenerating is a string nobody can translate, and nothing else would ever
say so — the app builds, the tests pass, and the sentence is simply missing from every
language.

### Three things the extractor will refuse

It reads plain string literals, so the text has to be *in the call*:

```csharp
Strings.Get(IsPrivate ? "Private" : "Public")   // refused: names the call, not the text
IsPrivate ? Strings.Get("Private") : Strings.Get("Public")   // right
```

A sentence written across lines with `+` is read as one string, as the compiler sees it.
A `@verbatim` or `"""raw"""` literal is refused by name rather than skipped.

### What is deliberately not translated

Git refs and the `pr/<n>` names; the diff-format tokens in `UnifiedDiffParser`; `OMNIGIT_*`
variable names; style resource keys; the licence and gitignore templates in `Resources/`
(a translated MIT licence is not the MIT licence); the shell commands inside advice
messages, which are typed rather than read; the `Initial commit` message, which is written
into the repository and travels to everyone who clones it; and API paths, JSON field names
and example identifiers in the hosting-site form, which are copied rather than read.

Text from libgit2, from git servers and from host APIs stays in its own words. Only the
sentence wrapped around it is translated.

## Finding what you missed

Pick **Pseudolocale (for testing)** in Settings → General. It accents every letter and pads
by about a third:

```
Cancel  ->  [!!Çåñçéļ ··!!]
```

Two bugs show up under it and under nothing else. A string still hardcoded reads as plain
English on a page of accents. And a control sized to its English text clips as soon as the
words get longer — which is what German does to most buttons.

It is generated from the same strings as the template, ships in every build, and is never
translated by a person.

## How it works underneath

Catalogues are gettext `.po` files in `src/Omnigit/Resources/Locale/`, embedded in the
assembly. `.po` rather than `.resx` for one reason that decides the rest: a `.po` states
its own plural rule in its header, so Russian's three forms and Arabic's six are the
translation's business rather than ours.

That is also what lets the csproj keep `InvariantGlobalization`. The app shows no absolute
dates — every timestamp goes through `TimeFormat.Relative` — and one formatted number, so
ICU would buy nothing and cost an `icu` dependency in the AUR package, a regenerated
`nuget-sources` for the offline Flatpak build, and the English-substring matching in
`GitService.Hint` and `IsAuthFailure`, which .NET would start handing back translated.

Changing language takes effect immediately: XAML binds through `LocExtension`, and view
models raise a null property name on `Strings.Changed`, which INPC defines as "every
property changed".

Two things a language change does not reach, both on purpose:

- **The activity log.** Entries hold finished sentences, so what was already written stays
  in the language it was written in. A log is a transcript.
- **`HostResolver.LocalOnly`.** One instance that repositories hold by reference and the
  sidebar groups by; rebuilding it with a new name would orphan everything loaded before
  the change. It follows on the next launch.
