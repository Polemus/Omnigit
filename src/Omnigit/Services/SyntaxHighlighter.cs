using System;
using System.Collections.Generic;
using System.IO;
using TextMateSharp.Grammars;
using TextMateSharp.Registry;
using IStateStack = TextMateSharp.Grammars.IStateStack;

namespace Omnigit.Services;

/// <summary>What a run of characters is, for the purpose of colouring it.</summary>
/// <remarks>
/// Deliberately a handful of categories rather than TextMate's hundreds of scopes.
/// A diff is read for what changed, not admired: the eye needs comments and strings to
/// recede and keywords to stand out, and every extra colour past that competes with the
/// green and red the row is already carrying.
/// </remarks>
public enum SyntaxCategory
{
    Plain,
    Keyword,
    String,
    Comment,
    Number,
    Type,
    Function,
}

/// <summary>One coloured run within a line.</summary>
public sealed record SyntaxSpan(int Start, int Length, SyntaxCategory Category);

/// <summary>
/// Where the tokeniser had got to at the end of the previous line - inside a block
/// comment, part-way through a multi-line string, or nowhere in particular.
/// </summary>
/// <remarks>
/// Opaque on purpose. Nothing outside this file should have to reference TextMateSharp
/// to render a diff, so the grammar library's own stack type does not escape: swapping
/// the tokeniser later should be one file's work, not every caller's.
/// </remarks>
public sealed class SyntaxState
{
    internal IStateStack? Stack { get; set; }

    /// <summary>Forgets everything, for a hunk boundary - see the class remarks.</summary>
    public void Reset() => Stack = null;
}

/// <summary>
/// Colours code by tokenising it with the same TextMate grammars VS Code uses.
/// </summary>
/// <remarks>
/// <para>
/// TextMateSharp is used for its tokeniser only, never its themes: it says what each
/// run <em>is</em>, and <c>Tokens.axaml</c> says what colour that gets. Taking the
/// grammar's own colours would put a second palette in the app, outside the one file
/// that is supposed to hold them all, and it would not follow the light/dark variant.
/// </para>
/// <para>
/// State is carried line to line, because a block comment or a multi-line string is not
/// a property of the line it is on. That works within a hunk and cannot work across one:
/// a diff is an extract, so a construct opened above the first line we were given is
/// invisible to us. Callers reset at each hunk header and accept that the first lines of
/// a hunk inside a long comment are coloured as code. Every diff viewer has this.
/// </para>
/// </remarks>
public sealed class SyntaxHighlighter
{
    /// <summary>
    /// Shared: loading the grammar registry reads and parses a set of JSON grammars,
    /// which is far too slow to do per file, let alone per line.
    /// </summary>
    private static readonly RegistryOptions Options = new(ThemeName.DarkPlus);

    private static readonly Registry Registry = new(Options);

    private static readonly Dictionary<string, SyntaxHighlighter?> ByExtension =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly IGrammar _grammar;

    private SyntaxHighlighter(IGrammar grammar) => _grammar = grammar;

    /// <summary>
    /// A highlighter for this file, or null when we ship no grammar for it - which is
    /// an ordinary answer, not a failure. The caller renders plain text.
    /// </summary>
    public static SyntaxHighlighter? For(string? path)
    {
        var extension = string.IsNullOrEmpty(path) ? null : Path.GetExtension(path);

        if (string.IsNullOrEmpty(extension))
            return null;

        lock (ByExtension)
        {
            if (ByExtension.TryGetValue(extension, out var cached))
                return cached;

            SyntaxHighlighter? highlighter = null;

            try
            {
                var language = Options.GetLanguageByExtension(extension);

                if (language is not null
                    && Options.GetScopeByLanguageId(language.Id) is { Length: > 0 } scope
                    && Registry.LoadGrammar(scope) is { } grammar)
                {
                    highlighter = new SyntaxHighlighter(grammar);
                }
            }
            catch (Exception)
            {
                // A grammar that will not load is a file we colour plainly. Never a
                // reason to fail showing someone their diff.
                highlighter = null;
            }

            ByExtension[extension] = highlighter;
            return highlighter;
        }
    }

    /// <summary>
    /// Tokenises one line, advancing <paramref name="state"/> so the next line knows it
    /// is inside a comment or a string. Reset the state at a hunk boundary.
    /// </summary>
    public IReadOnlyList<SyntaxSpan> Highlight(string line, SyntaxState state)
    {
        if (string.IsNullOrEmpty(line))
            return [];

        ITokenizeLineResult result;
        try
        {
            result = _grammar.TokenizeLine(line, state.Stack, TimeSpan.FromMilliseconds(TokeniseBudgetMs));
        }
        catch (Exception)
        {
            return [];
        }

        state.Stack = result.RuleStack;

        var spans = new List<SyntaxSpan>();

        foreach (var token in result.Tokens)
        {
            var start = Math.Clamp(token.StartIndex, 0, line.Length);
            var end = Math.Clamp(token.EndIndex, start, line.Length);

            if (end == start)
                continue;

            var category = Categorise(token.Scopes);

            // Plain runs carry the row's own colour, so emitting them would be a span
            // per word for no visible difference.
            if (category == SyntaxCategory.Plain)
                continue;

            spans.Add(new SyntaxSpan(start, end - start, category));
        }

        return spans;
    }

    /// <summary>
    /// A line long enough to be pathological - minified JavaScript, an embedded blob -
    /// must not stall the UI. The tokeniser gives up and we colour that line plainly.
    /// </summary>
    private const int TokeniseBudgetMs = 25;

    /// <summary>
    /// Scopes run least to most specific, so the last one that matches wins. Matching on
    /// prefixes rather than exact names is what makes one mapping serve every grammar:
    /// "string.quoted.double.cs" and "string.quoted.single.python" are both a string.
    /// <para>
    /// Operators and punctuation are pushed back to plain deliberately, ahead of the
    /// keyword rule they would otherwise match - "keyword.operator.assignment" is a
    /// keyword scope, and colouring every <c>=</c>, <c>.</c> and <c>;</c> as loudly as
    /// <c>public</c> turns a diff into confetti. VS Code leaves them alone too.
    /// </para>
    /// <para>
    /// <c>punctuation.definition.*</c> is exempt from that, and has to be: the <c>//</c>
    /// opening a comment and the quotes around a string carry it as their most specific
    /// scope, so demoting them leaves a grey comment whose marker is not grey and a
    /// coloured string with colourless quotes.
    /// </para>
    /// </summary>
    private static SyntaxCategory Categorise(IList<string> scopes)
    {
        var category = SyntaxCategory.Plain;

        foreach (var scope in scopes)
        {
            if (scope.StartsWith("comment", StringComparison.Ordinal))
                category = SyntaxCategory.Comment;
            else if (scope.StartsWith("string", StringComparison.Ordinal))
                category = SyntaxCategory.String;
            else if (scope.StartsWith("constant.numeric", StringComparison.Ordinal))
                category = SyntaxCategory.Number;
            else if (scope.StartsWith("punctuation.definition.", StringComparison.Ordinal))
                continue; // The // of a comment and the quotes of a string belong to it.
            else if (scope.StartsWith("keyword.operator", StringComparison.Ordinal)
                     || scope.StartsWith("punctuation", StringComparison.Ordinal))
                category = SyntaxCategory.Plain;
            else if (scope.StartsWith("keyword", StringComparison.Ordinal)
                     || scope.StartsWith("storage", StringComparison.Ordinal)
                     || scope.StartsWith("constant.language", StringComparison.Ordinal))
                category = SyntaxCategory.Keyword;
            else if (scope.StartsWith("entity.name.type", StringComparison.Ordinal)
                     || scope.StartsWith("entity.name.class", StringComparison.Ordinal)
                     || scope.StartsWith("support.type", StringComparison.Ordinal)
                     || scope.StartsWith("support.class", StringComparison.Ordinal))
                category = SyntaxCategory.Type;
            else if (scope.StartsWith("entity.name.function", StringComparison.Ordinal)
                     || scope.StartsWith("support.function", StringComparison.Ordinal))
                category = SyntaxCategory.Function;
        }

        return category;
    }
}
