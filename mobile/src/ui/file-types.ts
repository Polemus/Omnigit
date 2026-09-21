/**
 * What kind of file or folder a name is, for its icon - the way VS Code's explorer does it.
 *
 * Every file gets a glyph for its kind and a colour for its language or role, so a tree
 * reads at a glance: TypeScript in TypeScript blue, JavaScript in its yellow, Swift with its
 * own bird, lockfiles locked, secrets keyed. Folders are folder-blue, except the ones every
 * repository has - `src`, `docs`, `.github`, `node_modules` - which are marked out the way
 * the Material Icon Theme marks them. The glyphs themselves are in `file-icons.ts`; this
 * file is plain data and rules, with nothing native in it, so it can be tested on its own.
 *
 * Checked in order, most specific first: whole names (`package.json`, `Dockerfile`), then
 * names with a meaning beyond their extension (tests, dotfile configs), then extensions.
 * Anything unrecognised is a plain grey document - the one honest colour for "no idea".
 */

import type { Hue, Palette } from '../theme/tokens';

export type FileKind =
  | 'typescript'
  | 'javascript'
  | 'react'
  | 'code'
  | 'json'
  | 'markdown'
  | 'readme'
  | 'license'
  | 'changelog'
  | 'text'
  | 'file'
  | 'image'
  | 'video'
  | 'audio'
  | 'font'
  | 'archive'
  | 'pdf'
  | 'shell'
  | 'config'
  | 'lock'
  | 'secret'
  | 'git'
  | 'package'
  | 'docker'
  | 'build'
  | 'database'
  | 'css'
  | 'html'
  | 'php'
  | 'swift'
  | 'java'
  | 'ruby'
  | 'rust'
  | 'csharp'
  | 'table'
  | 'test'
  | 'notebook';

export interface FileType {
  kind: FileKind;
  hue: Hue;
}

const type = (kind: FileKind, hue: Hue): FileType => ({ kind, hue });

/** Whole file names, lower-cased. */
const NAMES: Record<string, FileType> = {
  'package.json': type('package', 'red'),
  'package-lock.json': type('lock', 'brown'),
  'npm-shrinkwrap.json': type('lock', 'brown'),
  'yarn.lock': type('lock', 'brown'),
  'pnpm-lock.yaml': type('lock', 'brown'),
  'bun.lock': type('lock', 'brown'),
  'bun.lockb': type('lock', 'brown'),
  'cargo.lock': type('lock', 'brown'),
  'gemfile.lock': type('lock', 'brown'),
  'podfile.lock': type('lock', 'brown'),
  'composer.lock': type('lock', 'brown'),
  'poetry.lock': type('lock', 'brown'),
  'pipfile.lock': type('lock', 'brown'),
  'packages.lock.json': type('lock', 'brown'),
  'go.sum': type('lock', 'brown'),

  'cargo.toml': type('package', 'orange'),
  'go.mod': type('package', 'cyan'),
  gemfile: type('package', 'red'),
  podfile: type('package', 'red'),
  'composer.json': type('package', 'indigo'),
  'pyproject.toml': type('package', 'indigo'),
  'requirements.txt': type('package', 'indigo'),
  pipfile: type('package', 'indigo'),
  'pubspec.yaml': type('package', 'teal'),

  dockerfile: type('docker', 'blue'),
  containerfile: type('docker', 'blue'),
  '.dockerignore': type('docker', 'blue'),
  'docker-compose.yml': type('docker', 'blue'),
  'docker-compose.yaml': type('docker', 'blue'),
  'compose.yml': type('docker', 'blue'),
  'compose.yaml': type('docker', 'blue'),

  '.gitignore': type('git', 'orange'),
  '.gitattributes': type('git', 'orange'),
  '.gitmodules': type('git', 'orange'),
  '.gitkeep': type('git', 'orange'),
  '.mailmap': type('git', 'orange'),
  codeowners: type('git', 'orange'),

  makefile: type('build', 'orange'),
  gnumakefile: type('build', 'orange'),
  justfile: type('build', 'orange'),
  'cmakelists.txt': type('build', 'green'),
  rakefile: type('build', 'red'),
  'build.gradle': type('build', 'teal'),
  'build.gradle.kts': type('build', 'teal'),
  'settings.gradle': type('build', 'teal'),
  'settings.gradle.kts': type('build', 'teal'),
  gradlew: type('build', 'teal'),
  'gradlew.bat': type('build', 'teal'),
  'pom.xml': type('build', 'red'),
  'build.sbt': type('build', 'red'),
  'build.zig': type('build', 'orange'),
  'nuget.config': type('build', 'purple'),
  'global.json': type('config', 'purple'),
};

/** Extensions, lower-cased and without the dot. */
const EXTENSIONS: Record<string, FileType> = {
  ts: type('typescript', 'blue'),
  mts: type('typescript', 'blue'),
  cts: type('typescript', 'blue'),
  tsx: type('react', 'blue'),
  jsx: type('react', 'cyan'),
  js: type('javascript', 'yellow'),
  mjs: type('javascript', 'yellow'),
  cjs: type('javascript', 'yellow'),
  json: type('json', 'yellow'),
  jsonc: type('json', 'yellow'),
  json5: type('json', 'yellow'),

  md: type('markdown', 'blue'),
  mdx: type('markdown', 'blue'),
  markdown: type('markdown', 'blue'),
  rst: type('markdown', 'blue'),
  adoc: type('markdown', 'blue'),
  txt: type('text', 'grey'),
  text: type('text', 'grey'),
  log: type('text', 'grey'),

  png: type('image', 'purple'),
  jpg: type('image', 'purple'),
  jpeg: type('image', 'purple'),
  gif: type('image', 'purple'),
  webp: type('image', 'purple'),
  bmp: type('image', 'purple'),
  ico: type('image', 'purple'),
  icns: type('image', 'purple'),
  heic: type('image', 'purple'),
  heif: type('image', 'purple'),
  tif: type('image', 'purple'),
  tiff: type('image', 'purple'),
  avif: type('image', 'purple'),
  svg: type('image', 'orange'),
  mp4: type('video', 'pink'),
  mov: type('video', 'pink'),
  m4v: type('video', 'pink'),
  webm: type('video', 'pink'),
  mkv: type('video', 'pink'),
  avi: type('video', 'pink'),
  mp3: type('audio', 'indigo'),
  wav: type('audio', 'indigo'),
  ogg: type('audio', 'indigo'),
  flac: type('audio', 'indigo'),
  m4a: type('audio', 'indigo'),
  aac: type('audio', 'indigo'),
  aiff: type('audio', 'indigo'),
  ttf: type('font', 'red'),
  otf: type('font', 'red'),
  woff: type('font', 'red'),
  woff2: type('font', 'red'),
  eot: type('font', 'red'),
  pdf: type('pdf', 'red'),
  zip: type('archive', 'brown'),
  tar: type('archive', 'brown'),
  gz: type('archive', 'brown'),
  tgz: type('archive', 'brown'),
  '7z': type('archive', 'brown'),
  rar: type('archive', 'brown'),
  bz2: type('archive', 'brown'),
  xz: type('archive', 'brown'),
  zst: type('archive', 'brown'),
  jar: type('archive', 'brown'),
  apk: type('archive', 'brown'),
  aab: type('archive', 'brown'),
  ipa: type('archive', 'brown'),
  dmg: type('archive', 'brown'),

  sh: type('shell', 'green'),
  bash: type('shell', 'green'),
  zsh: type('shell', 'green'),
  fish: type('shell', 'green'),
  command: type('shell', 'green'),
  ps1: type('shell', 'blue'),
  psm1: type('shell', 'blue'),
  psd1: type('shell', 'blue'),
  bat: type('shell', 'teal'),
  cmd: type('shell', 'teal'),

  yml: type('config', 'purple'),
  yaml: type('config', 'purple'),
  toml: type('config', 'orange'),
  ini: type('config', 'teal'),
  cfg: type('config', 'teal'),
  conf: type('config', 'teal'),
  properties: type('config', 'teal'),
  editorconfig: type('config', 'teal'),
  tf: type('config', 'purple'),
  tfvars: type('config', 'purple'),
  hcl: type('config', 'purple'),
  lock: type('lock', 'brown'),
  pem: type('secret', 'yellow'),
  crt: type('secret', 'yellow'),
  cer: type('secret', 'yellow'),
  key: type('secret', 'yellow'),
  p12: type('secret', 'yellow'),
  pfx: type('secret', 'yellow'),
  jks: type('secret', 'yellow'),
  keystore: type('secret', 'yellow'),
  gpg: type('secret', 'yellow'),
  asc: type('secret', 'yellow'),

  html: type('html', 'orange'),
  htm: type('html', 'orange'),
  xhtml: type('html', 'orange'),
  xml: type('code', 'orange'),
  xsd: type('code', 'orange'),
  xsl: type('code', 'orange'),
  xslt: type('code', 'orange'),
  plist: type('code', 'orange'),
  storyboard: type('code', 'orange'),
  xib: type('code', 'orange'),
  xaml: type('code', 'purple'),
  axaml: type('code', 'purple'),
  resx: type('code', 'purple'),
  css: type('css', 'blue'),
  scss: type('css', 'pink'),
  sass: type('css', 'pink'),
  less: type('css', 'indigo'),
  styl: type('css', 'green'),
  php: type('php', 'indigo'),

  py: type('code', 'indigo'),
  pyi: type('code', 'indigo'),
  pyw: type('code', 'indigo'),
  ipynb: type('notebook', 'orange'),
  go: type('code', 'cyan'),
  rs: type('rust', 'orange'),
  java: type('java', 'brown'),
  kt: type('code', 'purple'),
  kts: type('code', 'purple'),
  swift: type('swift', 'orange'),
  cs: type('csharp', 'purple'),
  csx: type('csharp', 'purple'),
  fs: type('code', 'cyan'),
  fsx: type('code', 'cyan'),
  fsi: type('code', 'cyan'),
  vb: type('code', 'indigo'),
  c: type('code', 'blue'),
  h: type('code', 'blue'),
  cpp: type('code', 'pink'),
  cc: type('code', 'pink'),
  cxx: type('code', 'pink'),
  hpp: type('code', 'pink'),
  hh: type('code', 'pink'),
  hxx: type('code', 'pink'),
  m: type('code', 'blue'),
  mm: type('code', 'blue'),
  rb: type('ruby', 'red'),
  erb: type('ruby', 'red'),
  rake: type('ruby', 'red'),
  gemspec: type('ruby', 'red'),
  dart: type('code', 'teal'),
  lua: type('code', 'blue'),
  ex: type('code', 'purple'),
  exs: type('code', 'purple'),
  erl: type('code', 'red'),
  hrl: type('code', 'red'),
  hs: type('code', 'purple'),
  scala: type('code', 'red'),
  sc: type('code', 'red'),
  clj: type('code', 'green'),
  cljs: type('code', 'green'),
  cljc: type('code', 'green'),
  edn: type('code', 'green'),
  r: type('code', 'blue'),
  jl: type('code', 'purple'),
  pl: type('code', 'blue'),
  pm: type('code', 'blue'),
  zig: type('code', 'orange'),
  nim: type('code', 'yellow'),
  ml: type('code', 'orange'),
  mli: type('code', 'orange'),
  vue: type('code', 'green'),
  svelte: type('code', 'orange'),
  astro: type('code', 'orange'),
  graphql: type('code', 'pink'),
  gql: type('code', 'pink'),
  proto: type('code', 'teal'),
  nix: type('code', 'blue'),
  diff: type('code', 'mint'),
  patch: type('code', 'mint'),

  sql: type('database', 'pink'),
  db: type('database', 'pink'),
  sqlite: type('database', 'pink'),
  sqlite3: type('database', 'pink'),
  csv: type('table', 'green'),
  tsv: type('table', 'green'),
  xlsx: type('table', 'green'),
  xls: type('table', 'green'),
  ods: type('table', 'green'),

  gradle: type('build', 'teal'),
  cmake: type('build', 'green'),
  mk: type('build', 'orange'),
  sln: type('build', 'purple'),
  csproj: type('build', 'purple'),
  fsproj: type('build', 'purple'),
  vbproj: type('build', 'purple'),
  props: type('build', 'purple'),
  targets: type('build', 'purple'),
  dockerfile: type('docker', 'blue'),
};

const UNKNOWN = type('file', 'grey');

export function fileType(name: string): FileType {
  const lower = name.toLowerCase();

  const named = NAMES[lower];
  if (named) return named;

  // The documents a repository keeps at its root, in any of the spellings they come in:
  // README, README.md, readme.rst, LICENSE-MIT, CHANGELOG.md…
  if (lower.startsWith('readme')) return type('readme', 'cyan');
  if (/^(licen[cs]e|copying|unlicense)/.test(lower)) return type('license', 'yellow');
  // Only as documents: a `history.ts` is code that happens to be called history.
  if (/^(changelog|changes|history|releases)(\.(md|markdown|txt|rst))?$/.test(lower)) {
    return type('changelog', 'green');
  }

  if (lower.startsWith('dockerfile') || lower.endsWith('.dockerfile')) {
    return type('docker', 'blue');
  }
  if (lower === '.env' || lower.startsWith('.env.')) return type('secret', 'yellow');
  if (lower.startsWith('tsconfig') || lower.startsWith('jsconfig')) return type('config', 'blue');

  // Tests before their language, as VS Code themes draw them: `x.test.ts` is a test first.
  if (
    /\.(test|spec)\.[^.]+$/.test(lower) ||
    /_test\.go$/.test(lower) ||
    /^test_.+\.py$/.test(lower)
  ) {
    return type('test', 'mint');
  }

  // Tool configuration, however it is spelled: `.prettierrc`, `.eslintrc.json`,
  // `babel.config.js`, `metro.config.cjs`. Before the extension, or the JSON and JS ones
  // would be drawn as data and code.
  if (/^\.[\w-]+rc(\.[^.]+)?$/.test(lower) || /\.config\.[cm]?[jt]s(on)?$/.test(lower)) {
    return type('config', 'teal');
  }

  const dot = lower.lastIndexOf('.');
  if (dot >= 0 && dot < lower.length - 1) {
    const byExtension = EXTENSIONS[lower.slice(dot + 1)];
    if (byExtension) return byExtension;
  }

  // A dotfile with no extension of its own (`.nvmrc` is caught above, `.swiftlint` here)
  // is configuration far more often than anything else.
  if (lower.startsWith('.') && !lower.slice(1).includes('.')) return type('config', 'teal');

  return UNKNOWN;
}

/**
 * A file each language is written in, by the name a site reports the language under -
 * GitHub's linguist names, which Gitea and GitLab share.
 *
 * So a repository's language is drawn exactly as its files are: a TypeScript repository
 * in TypeScript's tile and blue, a Swift one with the bird. One table of colours for
 * languages rather than two that drift apart - the language dot beside a repository used
 * GitHub's own brand colours, which include a navy for Lua that vanishes on black and a
 * yellow for JavaScript that all but vanishes on white.
 */
const LANGUAGES: Record<string, string> = {
  TypeScript: 'x.ts',
  JavaScript: 'x.js',
  'C#': 'x.cs',
  Python: 'x.py',
  Go: 'x.go',
  Rust: 'x.rs',
  Java: 'x.java',
  Kotlin: 'x.kt',
  Swift: 'x.swift',
  Ruby: 'x.rb',
  PHP: 'x.php',
  'C++': 'x.cpp',
  C: 'x.c',
  'Objective-C': 'x.m',
  'Objective-C++': 'x.mm',
  Shell: 'x.sh',
  PowerShell: 'x.ps1',
  Batchfile: 'x.bat',
  HTML: 'x.html',
  CSS: 'x.css',
  SCSS: 'x.scss',
  Sass: 'x.sass',
  Less: 'x.less',
  Vue: 'x.vue',
  Svelte: 'x.svelte',
  Astro: 'x.astro',
  Dart: 'x.dart',
  Scala: 'x.scala',
  Elixir: 'x.ex',
  Erlang: 'x.erl',
  Lua: 'x.lua',
  Zig: 'x.zig',
  'F#': 'x.fs',
  'Visual Basic .NET': 'x.vb',
  Haskell: 'x.hs',
  Clojure: 'x.clj',
  R: 'x.r',
  Julia: 'x.jl',
  Perl: 'x.pl',
  OCaml: 'x.ml',
  Nim: 'x.nim',
  Nix: 'x.nix',
  HCL: 'x.tf',
  Terraform: 'x.tf',
  GraphQL: 'x.graphql',
  'Protocol Buffer': 'x.proto',
  SQL: 'x.sql',
  PLpgSQL: 'x.sql',
  TSQL: 'x.sql',
  XML: 'x.xml',
  XAML: 'x.xaml',
  MSBuild: 'x.csproj',
  Gradle: 'build.gradle',
  CMake: 'CMakeLists.txt',
  Makefile: 'Makefile',
  Dockerfile: 'Dockerfile',
  'Jupyter Notebook': 'x.ipynb',
  Markdown: 'x.md',
  MDX: 'x.mdx',
  JSON: 'x.json',
  YAML: 'x.yml',
  TOML: 'x.toml',
  SVG: 'x.svg',
};

/** A file written in `language`, to draw the language as - or undefined if unknown. */
export function languageSample(language: string | undefined): string | undefined {
  return language ? LANGUAGES[language] : undefined;
}

/** The colour a language is drawn in: its files' colour, or grey for one we do not know. */
export function languageColour(language: string | undefined, palette: Palette): string {
  const sample = languageSample(language);
  return sample ? palette.hues[fileType(sample).hue] : palette.textTertiary;
}

/** Folders every repository has, marked out as the Material Icon Theme marks them. */
const FOLDERS: Record<string, Hue> = {
  src: 'green',
  source: 'green',
  lib: 'green',
  app: 'green',

  test: 'mint',
  tests: 'mint',
  __tests__: 'mint',
  __mocks__: 'mint',
  spec: 'mint',
  specs: 'mint',
  e2e: 'mint',
  fixtures: 'mint',

  docs: 'blue',
  doc: 'blue',
  documentation: 'blue',
  wiki: 'blue',

  assets: 'yellow',
  images: 'yellow',
  img: 'yellow',
  icons: 'yellow',
  media: 'yellow',
  static: 'yellow',
  public: 'yellow',
  res: 'yellow',
  resources: 'yellow',
  fonts: 'yellow',

  '.github': 'orange',
  '.gitlab': 'orange',
  '.gitea': 'orange',
  '.git': 'orange',
  '.husky': 'orange',
  '.circleci': 'orange',

  '.vscode': 'indigo',
  '.idea': 'indigo',
  '.vs': 'indigo',
  '.devcontainer': 'indigo',

  scripts: 'teal',
  tools: 'teal',
  bin: 'teal',
  ci: 'teal',

  config: 'cyan',
  configs: 'cyan',
  '.config': 'cyan',
  settings: 'cyan',

  components: 'purple',
  ui: 'purple',
  views: 'purple',
  screens: 'purple',
  pages: 'purple',

  api: 'pink',
  services: 'pink',
  server: 'pink',
  styles: 'pink',
  theme: 'pink',

  node_modules: 'brown',
  vendor: 'brown',
  third_party: 'brown',
  pods: 'brown',

  build: 'red',
  dist: 'red',
  out: 'red',
  target: 'red',
  obj: 'red',
  coverage: 'red',
  '.expo': 'red',
  '.next': 'red',

  android: 'green',
};

export function folderHue(name: string): Hue {
  return FOLDERS[name.toLowerCase()] ?? 'folder';
}
