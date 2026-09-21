using System.Collections.Generic;
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Omnigit.Services;

namespace Omnigit.ViewModels;

/// <summary>One row in the language picker.</summary>
/// <param name="Code">The catalogue's name, or null to mean "follow the machine".</param>
public sealed record LanguageOption(string? Code, string Label);

/// <summary>
/// Which language the app is in.
/// </summary>
/// <remarks>
/// The list is what this build actually carries, read from the embedded catalogues rather
/// than from a table somewhere - a language added by merging a translation appears here
/// with nothing else to edit, which is the whole point of the pipeline.
///
/// Choosing one takes effect immediately. Every piece of text in XAML is bound through
/// LocExtension and every view model relabels itself on Strings.Changed, so there is
/// nothing left that would need a restart to catch up.
/// </remarks>
public sealed partial class LanguageViewModel : ObservableObject
{
    private readonly ISettingsStore _settings;

    /// <summary>Guards the write-back while the initial selection is being set.</summary>
    private bool _loading;

    public LanguageViewModel(ISettingsStore settings)
    {
        _settings = settings;

        // Null first: "the same language as the rest of the machine" is the default and
        // the answer for almost everybody, so it is not hidden below the list.
        Options.Add(new LanguageOption(null, "System language"));

        foreach (var code in Strings.Available())
            Options.Add(new LanguageOption(code, Name(code)));

        _loading = true;
        var chosen = settings.Load().Language;
        SelectedOption = Find(chosen);
        _loading = false;
    }

    public ObservableCollection<LanguageOption> Options { get; } = [];

    [ObservableProperty]
    public partial LanguageOption? SelectedOption { get; set; }

    partial void OnSelectedOptionChanged(LanguageOption? value)
    {
        if (_loading || value is null)
            return;

        _settings.Save(new AppSettings { Language = value.Code });

        // Null means follow the machine, which is a question only SystemLanguage can
        // answer - the stored null is not itself a language.
        Strings.Use(value.Code ?? SystemLanguage.Detect());
    }

    private LanguageOption Find(string? code)
    {
        foreach (var option in Options)
        {
            if (option.Code == code)
                return option;
        }

        return Options[0];
    }

    /// <summary>
    /// The language's name in its own language, because someone looking for their own
    /// language does not know what English calls it.
    /// </summary>
    /// <remarks>
    /// A table rather than CultureInfo.NativeName, which returns the invariant culture's
    /// empty answer while InvariantGlobalization is set - and setting it is deliberate.
    /// It is short because the catalogue list is short; a code with no entry shows as
    /// itself, which is wrong-looking enough to be noticed when a language is added.
    /// </remarks>
    private static string Name(string code) => Names.TryGetValue(code, out var name) ? name : code;

    private static readonly Dictionary<string, string> Names = new()
    {
        ["en"] = "English",
        ["ar"] = "العربية",
        ["cs"] = "Čeština",
        ["de"] = "Deutsch",
        ["es"] = "Español",
        ["fr"] = "Français",
        ["it"] = "Italiano",
        ["ja"] = "日本語",
        ["ko"] = "한국어",
        ["nl"] = "Nederlands",
        ["pl"] = "Polski",
        ["pt"] = "Português",
        ["pt-BR"] = "Português (Brasil)",
        ["ru"] = "Русский",
        ["tr"] = "Türkçe",
        ["uk"] = "Українська",
        ["zh-Hans"] = "简体中文",
        ["zh-Hant"] = "繁體中文",

        // Not a language. It ships in every build on purpose: it is how a missed string
        // or a control too narrow for German is found, and it costs one generated file.
        ["qps-ploc"] = "Pseudolocale (for testing)",
    };
}
