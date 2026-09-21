/**
 * The icon for a file or a folder, by its name - VS Code's explorer, on a phone.
 *
 * `file-types.ts` decides what a name is and what colour it gets; this file holds the
 * glyph for each kind. Where a kind has a glyph of its own on one platform and not the
 * other, each platform gets its best: iOS has the Swift bird, Java's cup and the letter
 * tiles that echo TypeScript's and JavaScript's logos, while Android's Material Symbols
 * have JavaScript, HTML, CSS and PHP marks that SF Symbols lack.
 *
 * `Icon` comes from `@expo/ui` itself for the same reason as in `icons.ts`: the Babel
 * plugin strips the other platform's half of `Icon.select` only for an `Icon` imported
 * from `@expo/ui` by name.
 */

import { Icon } from '@expo/ui';

import { fileType, folderHue, languageSample, type FileKind } from './file-types';
import { Icons, type AppIcon } from './icons';

const GLYPHS: Record<FileKind, AppIcon['glyph']> = {
  typescript: Icon.select({
    ios: 't.square.fill',
    android: import('@expo/material-symbols/code.xml'),
  }),
  javascript: Icon.select({
    ios: 'j.square.fill',
    android: import('@expo/material-symbols/javascript.xml'),
  }),
  react: Icon.select({ ios: 'atom', android: import('@expo/material-symbols/hub.xml') }),
  code: Icons.code.glyph,
  json: Icon.select({
    ios: 'curlybraces',
    android: import('@expo/material-symbols/data_object.xml'),
  }),
  markdown: Icon.select({
    ios: 'doc.richtext.fill',
    android: import('@expo/material-symbols/article.xml'),
  }),
  readme: Icons.readme.glyph,
  license: Icon.select({
    ios: 'checkmark.seal.fill',
    android: import('@expo/material-symbols/license.xml'),
  }),
  changelog: Icons.history.glyph,
  text: Icon.select({
    ios: 'doc.text.fill',
    android: import('@expo/material-symbols/description.xml'),
  }),
  file: Icon.select({ ios: 'doc.fill', android: import('@expo/material-symbols/draft.xml') }),
  image: Icon.select({ ios: 'photo.fill', android: import('@expo/material-symbols/image.xml') }),
  video: Icon.select({ ios: 'film.fill', android: import('@expo/material-symbols/movie.xml') }),
  audio: Icon.select({ ios: 'waveform', android: import('@expo/material-symbols/audio_file.xml') }),
  font: Icon.select({
    ios: 'textformat',
    android: import('@expo/material-symbols/font_download.xml'),
  }),
  archive: Icon.select({
    ios: 'doc.zipper',
    android: import('@expo/material-symbols/folder_zip.xml'),
  }),
  pdf: Icon.select({
    ios: 'doc.fill',
    android: import('@expo/material-symbols/picture_as_pdf.xml'),
  }),
  shell: Icon.select({
    ios: 'terminal.fill',
    android: import('@expo/material-symbols/terminal.xml'),
  }),
  config: Icon.select({
    ios: 'gearshape.fill',
    android: import('@expo/material-symbols/settings.xml'),
  }),
  lock: Icons.private.glyph,
  secret: Icons.token.glyph,
  git: Icons.branch.glyph,
  package: Icon.select({
    ios: 'shippingbox.fill',
    android: import('@expo/material-symbols/package_2.xml'),
  }),
  docker: Icon.select({
    ios: 'cube.fill',
    android: import('@expo/material-symbols/deployed_code.xml'),
  }),
  build: Icon.select({ ios: 'hammer.fill', android: import('@expo/material-symbols/build.xml') }),
  database: Icon.select({
    ios: 'cylinder.split.1x2.fill',
    android: import('@expo/material-symbols/database.xml'),
  }),
  css: Icon.select({ ios: 'number', android: import('@expo/material-symbols/css.xml') }),
  html: Icon.select({
    ios: 'chevron.left.forwardslash.chevron.right',
    android: import('@expo/material-symbols/html.xml'),
  }),
  php: Icon.select({
    ios: 'chevron.left.forwardslash.chevron.right',
    android: import('@expo/material-symbols/php.xml'),
  }),
  swift: Icon.select({ ios: 'swift', android: import('@expo/material-symbols/code.xml') }),
  java: Icon.select({
    ios: 'cup.and.saucer.fill',
    android: import('@expo/material-symbols/coffee.xml'),
  }),
  ruby: Icon.select({ ios: 'diamond.fill', android: import('@expo/material-symbols/diamond.xml') }),
  rust: Icon.select({
    ios: 'gearshape.2.fill',
    android: import('@expo/material-symbols/hexagon.xml'),
  }),
  csharp: Icon.select({
    ios: 'number.square.fill',
    android: import('@expo/material-symbols/tag.xml'),
  }),
  table: Icon.select({
    ios: 'tablecells.fill',
    android: import('@expo/material-symbols/table.xml'),
  }),
  test: Icon.select({ ios: 'testtube.2', android: import('@expo/material-symbols/science.xml') }),
  notebook: Icon.select({
    ios: 'book.closed.fill',
    android: import('@expo/material-symbols/menu_book.xml'),
  }),
};

/**
 * A file's icon: the glyph for its kind, in its language's or role's colour. Takes a name or
 * a whole path, since a changed file arrives as `src/app/index.tsx` - only the last part
 * says what it is.
 */
export function iconForFile(nameOrPath: string): AppIcon {
  const { kind, hue } = fileType(nameOrPath.slice(nameOrPath.lastIndexOf('/') + 1));
  return { glyph: GLYPHS[kind], hue };
}

/** A language's icon - its files' icon - or the plain code icon for one we do not know. */
export function iconForLanguage(language: string | undefined): AppIcon {
  const sample = languageSample(language);
  return sample ? iconForFile(sample) : Icons.code;
}

/** A folder's icon: always the folder, in folder-blue unless it is one of the usual ones. */
export function iconForFolder(name: string): AppIcon {
  return { glyph: Icons.folder.glyph, hue: folderHue(name) };
}
