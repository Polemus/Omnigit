using System;
using System.Globalization;

namespace Omnigit.Services;

/// <summary>
/// The plural rule a gettext catalogue declares about itself, compiled once.
/// </summary>
/// <remarks>
/// A .po file's Plural-Forms header carries a C expression over n. Russian's is
/// <c>nplurals=3; plural=n%10==1 &amp;&amp; n%100!=11 ? 0 : n%10&gt;=2 &amp;&amp; n%10&lt;=4
/// &amp;&amp; (n%100&lt;10 || n%100&gt;=20) ? 1 : 2</c>.
///
/// Reading the rule out of the file is what lets plurals be correct without ICU: the
/// translation states how its own language counts, so nothing here has to know, and no
/// table in this repo has to be kept in step with CLDR. That is the whole reason the
/// catalogues are .po rather than .resx - see the csproj, which still sets
/// InvariantGlobalization.
/// </remarks>
internal sealed class PluralRule
{
    /// <summary>
    /// English, and what an unreadable header falls back to: one form for exactly 1.
    /// Wrong for some languages, but wrong in a way that still shows words rather than
    /// throwing in the middle of drawing a label.
    /// </summary>
    public static PluralRule Default { get; } = new(2, n => n == 1 ? 0 : 1);

    private readonly Func<int, int> _select;

    /// <summary>How many msgstr[i] entries this language's catalogue carries.</summary>
    public int Forms { get; }

    private PluralRule(int forms, Func<int, int> select)
    {
        Forms = forms;
        _select = select;
    }

    /// <summary>
    /// Which form a count takes. Clamped rather than trusted: a header whose expression
    /// can return an index its own nplurals does not cover is a translator's typo, and
    /// it must not become an IndexOutOfRangeException while a label is being drawn.
    /// </summary>
    public int Index(int n)
    {
        var index = _select(n);
        return index < 0 || index >= Forms ? 0 : index;
    }

    /// <summary>Reads the value of a Plural-Forms header. Never throws.</summary>
    public static PluralRule Parse(string? header)
    {
        if (string.IsNullOrWhiteSpace(header))
            return Default;

        var forms = 0;
        string? expression = null;

        foreach (var part in header.Split(';'))
        {
            var halves = part.Split('=', 2);
            if (halves.Length != 2)
                continue;

            var name = halves[0].Trim();
            var value = halves[1].Trim();

            if (name == "nplurals")
                int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out forms);
            else if (name == "plural")
                expression = value;
        }

        if (forms <= 0 || string.IsNullOrWhiteSpace(expression))
            return Default;

        try
        {
            return new PluralRule(forms, new Parser(expression).Compile());
        }
        catch (FormatException)
        {
            return Default;
        }
    }

    /// <summary>
    /// A recursive-descent parser for the expression subset gettext allows, compiled to
    /// a delegate so the string is walked once rather than on every label.
    /// </summary>
    /// <remarks>
    /// Comparisons yield 0 or 1 exactly as they do in C, which is what lets the common
    /// two-form rule be written as the bare expression <c>n != 1</c> with no ternary.
    /// </remarks>
    private sealed class Parser(string text)
    {
        private int _at;

        public Func<int, int> Compile()
        {
            var expression = Ternary();
            SkipSpace();

            // Trailing ";" is ordinary; anything else means this was not the grammar we
            // think it was, and guessing at a plural rule is worse than using English's.
            if (_at < text.Length && text[_at] != ';')
                throw new FormatException($"unexpected '{text[_at]}' at {_at}");

            return expression;
        }

        private Func<int, int> Ternary()
        {
            var condition = Binary(0);
            if (!Take('?'))
                return condition;

            var whenTrue = Ternary();
            if (!Take(':'))
                throw new FormatException("'?' without ':'");
            var whenFalse = Ternary();

            return n => condition(n) != 0 ? whenTrue(n) : whenFalse(n);
        }

        // Lowest precedence first; each level consumes the one below it.
        private static readonly string[][] Levels =
        [
            ["||"],
            ["&&"],
            ["==", "!="],
            ["<=", ">=", "<", ">"],
            ["+", "-"],
            ["*", "/", "%"],
        ];

        private Func<int, int> Binary(int level)
        {
            if (level >= Levels.Length)
                return Unary();

            var left = Binary(level + 1);

            while (true)
            {
                var op = TakeAny(Levels[level]);
                if (op is null)
                    return left;

                var right = Binary(level + 1);
                left = Combine(op, left, right);
            }
        }

        private static Func<int, int> Combine(string op, Func<int, int> a, Func<int, int> b) => op switch
        {
            "||" => n => a(n) != 0 || b(n) != 0 ? 1 : 0,
            "&&" => n => a(n) != 0 && b(n) != 0 ? 1 : 0,
            "==" => n => a(n) == b(n) ? 1 : 0,
            "!=" => n => a(n) != b(n) ? 1 : 0,
            "<=" => n => a(n) <= b(n) ? 1 : 0,
            ">=" => n => a(n) >= b(n) ? 1 : 0,
            "<" => n => a(n) < b(n) ? 1 : 0,
            ">" => n => a(n) > b(n) ? 1 : 0,
            "+" => n => a(n) + b(n),
            "-" => n => a(n) - b(n),
            "*" => n => a(n) * b(n),

            // Division by zero is a malformed rule, not a crash to take down a window.
            "/" => n => b(n) == 0 ? 0 : a(n) / b(n),
            "%" => n => b(n) == 0 ? 0 : a(n) % b(n),
            _ => throw new FormatException($"unknown operator '{op}'"),
        };

        private Func<int, int> Unary()
        {
            if (Take('!'))
            {
                var operand = Unary();
                return n => operand(n) == 0 ? 1 : 0;
            }

            if (Take('-'))
            {
                var operand = Unary();
                return n => -operand(n);
            }

            return Primary();
        }

        private Func<int, int> Primary()
        {
            SkipSpace();

            if (_at >= text.Length)
                throw new FormatException("expression ends early");

            if (Take('('))
            {
                var inner = Ternary();
                if (!Take(')'))
                    throw new FormatException("'(' without ')'");
                return inner;
            }

            if (text[_at] == 'n')
            {
                _at++;
                return n => n;
            }

            var start = _at;
            while (_at < text.Length && char.IsAsciiDigit(text[_at]))
                _at++;

            if (_at == start)
                throw new FormatException($"unexpected '{text[start]}' at {start}");

            var literal = int.Parse(text.AsSpan(start, _at - start), CultureInfo.InvariantCulture);
            return _ => literal;
        }

        private void SkipSpace()
        {
            while (_at < text.Length && char.IsWhiteSpace(text[_at]))
                _at++;
        }

        private bool Take(char c)
        {
            SkipSpace();
            if (_at >= text.Length || text[_at] != c)
                return false;

            _at++;
            return true;
        }

        /// <summary>
        /// Longest match wins within a level, so "&lt;=" is never read as "&lt;" followed
        /// by a stray "="; the tables above are ordered accordingly.
        /// </summary>
        private string? TakeAny(string[] operators)
        {
            SkipSpace();

            foreach (var op in operators)
            {
                if (_at + op.Length > text.Length || !text.AsSpan(_at, op.Length).SequenceEqual(op))
                    continue;

                // "!" and "!=" share a prefix with nothing here, but "=" alone is not an
                // operator we accept - guard against reading "==" as two levels.
                _at += op.Length;
                return op;
            }

            return null;
        }
    }
}
