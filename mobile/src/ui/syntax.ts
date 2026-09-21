/**
 * Colouring code, in the same seven categories the desktop uses.
 *
 * The desktop tokenises with the TextMate grammars VS Code ships and reduces the result
 * to `Plain, Keyword, String, Comment, Number, Type, Function` - see
 * `Services/SyntaxHighlighter.cs`. Shipping those grammars to a phone is not on: they are
 * megabytes of JSON and a regex engine to run them. So the categories are kept and the
 * tokeniser is replaced by the small one below.
 *
 * That is a real trade and worth naming. This will mis-colour things a grammar would get
 * right - a keyword used as an identifier, a nested template literal, a regex that looks
 * like division. It is calibrated for the thing a person actually does with code on a
 * phone, which is read it: comments and strings recede, keywords stand out, and the shape
 * of the file is legible at a glance. Nothing here is load-bearing for correctness.
 *
 * State carries line to line, because a block comment is not a property of the line it is
 * on. Unlike the desktop's diff case there is no hunk boundary to reset at - a file is
 * whole - so the colouring is right from the first line.
 */

export type SyntaxCategory =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'type'
  | 'function';

export interface Span {
  text: string;
  category: SyntaxCategory;
}

/** Where the tokeniser had got to at the end of the previous line. */
export interface SyntaxState {
  inBlockComment: boolean;
}

export const initialState: SyntaxState = { inBlockComment: false };

export interface Grammar {
  lineComments: string[];
  blockComment?: [string, string];
  quotes: string[];
  keywords: Set<string>;
  types: Set<string>;
}

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

const C_TYPES = words(`
  int long short float double char bool boolean byte void var let const string String
  Int Double Float Bool Boolean Object Array Number Date Map Set Promise
  i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 usize isize str Vec Option Result
`);

const GRAMMARS: Record<string, Grammar> = {
  'c-like': {
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'", '`'],
    keywords: words(`
      abstract as async await base break case catch class const constructor continue
      declare default delegate delete do else enum event export extends extern false
      finally fn for from func function get go goto if impl implements import in
      instanceof interface internal is let lock match mod module mut namespace new null
      operator override package params partial private protected public pub readonly
      record ref return sealed set static struct super switch this throw throws trait
      true try type typeof union unsafe use using var virtual void volatile when where
      while with yield
    `),
    types: C_TYPES,
  },
  hash: {
    lineComments: ['#'],
    quotes: ['"', "'"],
    keywords: words(`
      and as assert async await break case class continue def del do done elif else
      elsif end esac except exec fi finally for from global if import in is lambda local
      module nonlocal not or pass raise return then try unless until when while with
      yield echo export function local readonly set source unset
    `),
    types: words(`
      True False None nil true false null int str float bool list dict tuple set bytes
    `),
  },
  sql: {
    lineComments: ['--'],
    blockComment: ['/*', '*/'],
    quotes: ["'", '"'],
    keywords: words(`
      select from where join inner left right outer full on group by order having limit
      offset insert into values update set delete create table alter drop index view as
      and or not null is in exists between like distinct union all case when then else
      end primary key foreign references default constraint cascade with returning
    `),
    types: words(`int bigint smallint varchar text boolean date timestamp numeric decimal uuid jsonb`),
  },
  markup: {
    lineComments: [],
    blockComment: ['<!--', '-->'],
    quotes: ['"', "'"],
    keywords: new Set<string>(),
    types: new Set<string>(),
  },
  json: {
    lineComments: [],
    quotes: ['"'],
    keywords: words('true false null'),
    types: new Set<string>(),
  },
  css: {
    lineComments: [],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'"],
    keywords: words('important media import supports keyframes from to and not only'),
    types: new Set<string>(),
  },
  plain: {
    lineComments: [],
    quotes: [],
    keywords: new Set<string>(),
    types: new Set<string>(),
  },
};

const BY_EXTENSION: Record<string, keyof typeof GRAMMARS> = {
  c: 'c-like', h: 'c-like', cpp: 'c-like', cc: 'c-like', hpp: 'c-like', cs: 'c-like',
  java: 'c-like', kt: 'c-like', kts: 'c-like', swift: 'c-like', go: 'c-like',
  rs: 'c-like', js: 'c-like', jsx: 'c-like', mjs: 'c-like', cjs: 'c-like',
  ts: 'c-like', tsx: 'c-like', php: 'c-like', scala: 'c-like', dart: 'c-like',
  groovy: 'c-like', gradle: 'c-like', proto: 'c-like', zig: 'c-like',

  py: 'hash', rb: 'hash', sh: 'hash', bash: 'hash', zsh: 'hash', fish: 'hash',
  yml: 'hash', yaml: 'hash', toml: 'hash', ini: 'hash', conf: 'hash', r: 'hash',
  pl: 'hash', ps1: 'hash', dockerfile: 'hash', tf: 'hash', nix: 'hash',

  sql: 'sql',
  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
  xaml: 'markup', axaml: 'markup', csproj: 'markup', plist: 'markup',
  json: 'json', jsonc: 'json',
  css: 'css', scss: 'css', less: 'css',
};

/** The grammar for a path, by extension, falling back to no colouring at all. */
export function grammarFor(path: string): Grammar {
  const name = path.split('/').pop() ?? '';
  // A few files are named rather than extended - Dockerfile, Makefile.
  const bare = name.toLowerCase();
  if (bare === 'dockerfile' || bare === 'makefile' || bare.startsWith('.env')) {
    return GRAMMARS.hash;
  }

  const extension = bare.includes('.') ? bare.slice(bare.lastIndexOf('.') + 1) : '';
  return GRAMMARS[BY_EXTENSION[extension] ?? 'plain'];
}

/** True when a file is worth colouring at all, for showing a "plain text" note. */
export function isHighlightable(path: string): boolean {
  return grammarFor(path) !== GRAMMARS.plain;
}

/**
 * What a person calls the language a file is written in, for labels.
 *
 * Separate from the grammar table because the two answer different questions: `.tsx` and
 * `.cs` share a grammar - both scan as C-like - but nobody would call them the same
 * language. Names match the ones `file-types.ts` knows, so a file and its repository
 * describe - and colour - their language the same way.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  cs: 'C#', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', swift: 'Swift', go: 'Go',
  rs: 'Rust', c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', php: 'PHP',
  scala: 'Scala', dart: 'Dart', zig: 'Zig', py: 'Python', rb: 'Ruby', sh: 'Shell',
  bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', sql: 'SQL', html: 'HTML', htm: 'HTML',
  xml: 'XML', xaml: 'XAML', axaml: 'XAML', svg: 'SVG', vue: 'Vue', css: 'CSS', scss: 'SCSS',
  less: 'Less', json: 'JSON', jsonc: 'JSON', yml: 'YAML', yaml: 'YAML', toml: 'TOML',
  md: 'Markdown', mdx: 'Markdown', csproj: 'MSBuild', slnx: 'MSBuild', gradle: 'Gradle',
  tf: 'Terraform', nix: 'Nix', lua: 'Lua', ex: 'Elixir', exs: 'Elixir',
};

export function languageFor(path: string): string | undefined {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  if (name === 'dockerfile') return 'Dockerfile';
  if (name === 'makefile') return 'Makefile';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return undefined;
  return LANGUAGE_NAMES[name.slice(dot + 1)];
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;

/**
 * Splits one line into coloured runs, carrying state to the next.
 *
 * Deliberately a hand-rolled scanner rather than a set of regexes over the whole line: a
 * `//` inside a string is not a comment, and a `"` inside a comment does not open one, and
 * only left-to-right scanning gets both right.
 */
export function highlightLine(
  line: string,
  grammar: Grammar,
  state: SyntaxState
): { spans: Span[]; state: SyntaxState } {
  const spans: Span[] = [];
  let plain = '';
  let inBlockComment = state.inBlockComment;
  let i = 0;

  const flush = () => {
    if (plain) {
      spans.push({ text: plain, category: 'plain' });
      plain = '';
    }
  };
  const push = (text: string, category: SyntaxCategory) => {
    flush();
    spans.push({ text, category });
  };

  while (i < line.length) {
    // A block comment already open swallows everything up to its close.
    if (inBlockComment && grammar.blockComment) {
      const close = line.indexOf(grammar.blockComment[1], i);
      if (close < 0) {
        push(line.slice(i), 'comment');
        i = line.length;
        break;
      }
      push(line.slice(i, close + grammar.blockComment[1].length), 'comment');
      i = close + grammar.blockComment[1].length;
      inBlockComment = false;
      continue;
    }

    const rest = line.slice(i);

    if (grammar.blockComment && rest.startsWith(grammar.blockComment[0])) {
      inBlockComment = true;
      push(grammar.blockComment[0], 'comment');
      i += grammar.blockComment[0].length;
      continue;
    }

    const lineComment = grammar.lineComments.find((marker) => rest.startsWith(marker));
    if (lineComment) {
      push(line.slice(i), 'comment');
      i = line.length;
      break;
    }

    const quote = grammar.quotes.find((q) => rest.startsWith(q));
    if (quote) {
      const end = findStringEnd(line, i + quote.length, quote);
      push(line.slice(i, end), 'string');
      i = end;
      continue;
    }

    NUMBER.lastIndex = i;
    const number = NUMBER.exec(line);
    // Only when it starts a token: the `1` in `a1` is not a number.
    if (number && !/[\w$]/.test(line[i - 1] ?? '')) {
      push(number[0], 'number');
      i += number[0].length;
      continue;
    }

    IDENTIFIER.lastIndex = i;
    const word = IDENTIFIER.exec(line);
    if (word) {
      const text = word[0];
      const after = line.slice(i + text.length);
      const category: SyntaxCategory = grammar.keywords.has(text)
        ? 'keyword'
        : grammar.types.has(text)
          ? 'type'
          : // Followed by an open bracket, so it is being called or declared.
            /^\s*\(/.test(after)
            ? 'function'
            : // Capitalised in a language that has types: near enough, and it is what
              // makes a C# or TypeScript file readable at a glance.
              grammar.types.size > 0 && /^[A-Z]/.test(text)
              ? 'type'
              : 'plain';

      if (category === 'plain') plain += text;
      else push(text, category);

      i += text.length;
      continue;
    }

    plain += line[i];
    i += 1;
  }

  flush();
  return { spans, state: { inBlockComment } };
}

/**
 * A whole file, line by line, carrying the tokeniser's state between them.
 *
 * Lives here rather than in the view because the state is the tokeniser's business: a
 * block comment opened on line 10 and closed on line 40 is the reason this cannot be a
 * per-line `map` from the caller's side.
 */
export function highlightSource(lines: string[], grammar: Grammar): Span[][] {
  const out: Span[][] = [];
  let state: SyntaxState = initialState;

  for (const line of lines) {
    const result = highlightLine(line, grammar, state);
    state = result.state;
    out.push(result.spans);
  }

  return out;
}

/** Where a string ends, respecting backslash escapes. Unterminated ends at the line. */
function findStringEnd(line: string, from: number, quote: string): number {
  let i = from;
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line.startsWith(quote, i)) return i + quote.length;
    i += 1;
  }
  return line.length;
}

/** The colour token name for a category, resolved against the palette by the caller. */
export const CATEGORY_TOKEN = {
  plain: 'text',
  keyword: 'syntaxKeyword',
  string: 'syntaxString',
  comment: 'syntaxComment',
  number: 'syntaxNumber',
  type: 'syntaxType',
  function: 'syntaxFunction',
} as const;
