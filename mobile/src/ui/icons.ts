/**
 * Every icon in the app, named once for both platforms - and coloured once.
 *
 * `Icon.select` picks the SF Symbol on iOS and the Material Symbols vector on Android,
 * and tree-shakes the other side out of the bundle. The point is that a screen writes
 * `<Icon name={Icons.pullRequest} />` and never learns which platform it is on - the same
 * reason the desktop keeps its glyphs in `Tokens.axaml` rather than in each view.
 *
 * Each icon also carries its hue, which `Icon` draws it in unless a screen passes a colour
 * of its own. So a commit is orange on every screen without every screen remembering to
 * say so, and an icon cannot quietly ship grey because a call site forgot. A screen passes
 * `color` only when the colour means something about *this* thing - a pull request's
 * state, an error - rather than about what kind of thing it is. File and folder icons,
 * which depend on the name, are in `file-icons.ts`.
 *
 * The SF Symbol names are checked at compile time by `sf-symbols-typescript`, so a
 * misspelling here is a build error rather than an empty square on a device.
 *
 * `Icon` must come from `@expo/ui` itself here, not from `./icon` like everywhere else. The
 * tree-shaking is @expo/ui's Babel plugin rewriting each `Icon.select(...)` at build time,
 * and it only recognises an `Icon` imported from `@expo/ui` by name. Imported any other way,
 * the calls run as written: the iOS bundle keeps every `import('…xml')` for Android and
 * tries to load all of them on launch, which fails. Nothing here draws an icon, so none of
 * the colour trouble `./icon` exists for applies.
 */

import { Icon, type IconProps } from '@expo/ui';

import type { Hue } from '../theme/tokens';

/** A glyph, and the colour it is drawn in wherever it appears. */
export interface AppIcon {
  /** What `@expo/ui`'s `Icon` draws: the SF Symbol on iOS, the Material Symbol on Android. */
  glyph: IconProps['name'];
  hue: Hue;
}

export function icon(hue: Hue, glyph: IconProps['name']): AppIcon {
  return { glyph, hue };
}

export const Icons = {
  // Navigation
  repositories: icon(
    'indigo',
    Icon.select({ ios: 'book.closed', android: import('@expo/material-symbols/book_2.xml') })
  ),
  inbox: icon(
    'blue',
    Icon.select({ ios: 'tray.full', android: import('@expo/material-symbols/inbox.xml') })
  ),
  search: icon(
    'blue',
    Icon.select({ ios: 'magnifyingglass', android: import('@expo/material-symbols/search.xml') })
  ),
  settings: icon(
    'indigo',
    Icon.select({ ios: 'gearshape', android: import('@expo/material-symbols/settings.xml') })
  ),

  // The things a forge holds. Pull requests and issues are drawn in their state's colour
  // wherever the state is known; these hues are for where they stand for the kind.
  pullRequest: icon(
    'blue',
    Icon.select({
      ios: 'arrow.triangle.pull',
      android: import('@expo/material-symbols/call_merge.xml'),
    })
  ),
  merged: icon(
    'purple',
    Icon.select({
      ios: 'arrow.triangle.merge',
      android: import('@expo/material-symbols/merge.xml'),
    })
  ),
  issue: icon(
    'green',
    Icon.select({ ios: 'smallcircle.circle', android: import('@expo/material-symbols/adjust.xml') })
  ),
  issueClosed: icon(
    'purple',
    Icon.select({ ios: 'checkmark.circle', android: import('@expo/material-symbols/task_alt.xml') })
  ),
  commit: icon(
    'orange',
    Icon.select({
      ios: 'smallcircle.filled.circle',
      android: import('@expo/material-symbols/commit.xml'),
    })
  ),
  branch: icon(
    'teal',
    Icon.select({
      ios: 'arrow.triangle.branch',
      android: import('@expo/material-symbols/alt_route.xml'),
    })
  ),
  code: icon(
    'blue',
    Icon.select({
      ios: 'chevron.left.forwardslash.chevron.right',
      android: import('@expo/material-symbols/code.xml'),
    })
  ),
  // The info mark VS Code gives a README, so a README file in the tree and the README
  // section of a repository are the same icon.
  readme: icon(
    'cyan',
    Icon.select({ ios: 'info.circle.fill', android: import('@expo/material-symbols/info.xml') })
  ),
  folder: icon(
    'folder',
    Icon.select({ ios: 'folder.fill', android: import('@expo/material-symbols/folder.xml') })
  ),
  parentFolder: icon(
    'blue',
    Icon.select({
      ios: 'arrow.turn.left.up',
      android: import('@expo/material-symbols/subdirectory_arrow_left.xml'),
    })
  ),
  diff: icon(
    'mint',
    Icon.select({ ios: 'plusminus', android: import('@expo/material-symbols/difference.xml') })
  ),
  history: icon(
    'indigo',
    Icon.select({
      ios: 'clock.arrow.circlepath',
      android: import('@expo/material-symbols/history.xml'),
    })
  ),

  // Repository attributes
  star: icon(
    'yellow',
    Icon.select({ ios: 'star.fill', android: import('@expo/material-symbols/star.xml') })
  ),
  fork: icon(
    'cyan',
    Icon.select({ ios: 'tuningfork', android: import('@expo/material-symbols/fork_right.xml') })
  ),
  public: icon(
    'green',
    Icon.select({ ios: 'globe', android: import('@expo/material-symbols/language.xml') })
  ),
  private: icon(
    'orange',
    Icon.select({ ios: 'lock.fill', android: import('@expo/material-symbols/lock.xml') })
  ),
  archived: icon(
    'brown',
    Icon.select({ ios: 'archivebox.fill', android: import('@expo/material-symbols/archive.xml') })
  ),
  label: icon(
    'pink',
    Icon.select({ ios: 'tag.fill', android: import('@expo/material-symbols/label.xml') })
  ),

  // Actions
  openInBrowser: icon(
    'blue',
    Icon.select({
      ios: 'arrow.up.forward.app',
      android: import('@expo/material-symbols/open_in_new.xml'),
    })
  ),
  copy: icon(
    'blue',
    Icon.select({ ios: 'doc.on.doc', android: import('@expo/material-symbols/content_copy.xml') })
  ),
  signOut: icon(
    'red',
    Icon.select({
      ios: 'rectangle.portrait.and.arrow.right',
      android: import('@expo/material-symbols/logout.xml'),
    })
  ),
  add: icon(
    'green',
    Icon.select({ ios: 'plus.circle.fill', android: import('@expo/material-symbols/add.xml') })
  ),
  refresh: icon(
    'blue',
    Icon.select({ ios: 'arrow.clockwise', android: import('@expo/material-symbols/refresh.xml') })
  ),
  link: icon(
    'blue',
    Icon.select({ ios: 'link', android: import('@expo/material-symbols/link.xml') })
  ),
  // The one grey icon, on purpose: a disclosure chevron is the platform's own tertiary
  // grey on both systems, and a coloured one would compete with the row it points into.
  chevron: icon(
    'grey',
    Icon.select({
      ios: 'chevron.right',
      android: import('@expo/material-symbols/chevron_right.xml'),
    })
  ),
  // An open folder's chevron, in the file tree beside the code. Grey for the same reason.
  chevronDown: icon(
    'grey',
    Icon.select({
      ios: 'chevron.down',
      android: import('@expo/material-symbols/keyboard_arrow_down.xml'),
    })
  ),
  // The header's "more" menu. iOS draws its own in the bar; Android's ⋮ is ours.
  more: icon(
    'blue',
    Icon.select({
      ios: 'ellipsis.circle',
      android: import('@expo/material-symbols/more_vert.xml'),
    })
  ),
  // Shows and hides the file tree beside the code.
  sidebar: icon(
    'blue',
    Icon.select({
      ios: 'sidebar.left',
      android: import('@expo/material-symbols/left_panel_open.xml'),
    })
  ),
  check: icon(
    'blue',
    Icon.select({ ios: 'checkmark', android: import('@expo/material-symbols/check.xml') })
  ),

  // The assistant
  sparkles: icon(
    'purple',
    Icon.select({ ios: 'sparkles', android: import('@expo/material-symbols/star_shine.xml') })
  ),
  send: icon(
    'blue',
    Icon.select({ ios: 'arrow.up', android: import('@expo/material-symbols/arrow_upward.xml') })
  ),
  back: icon(
    'blue',
    Icon.select({ ios: 'chevron.left', android: import('@expo/material-symbols/arrow_back.xml') })
  ),

  // Identity and hosts
  account: icon(
    'blue',
    Icon.select({
      ios: 'person.crop.circle.fill',
      android: import('@expo/material-symbols/account_circle.xml'),
    })
  ),
  host: icon(
    'indigo',
    Icon.select({ ios: 'server.rack', android: import('@expo/material-symbols/dns.xml') })
  ),
  token: icon(
    'yellow',
    Icon.select({ ios: 'key.fill', android: import('@expo/material-symbols/key.xml') })
  ),

  // States the app has to explain
  offline: icon(
    'orange',
    Icon.select({ ios: 'wifi.slash', android: import('@expo/material-symbols/cloud_off.xml') })
  ),
  warning: icon(
    'orange',
    Icon.select({
      ios: 'exclamationmark.triangle.fill',
      android: import('@expo/material-symbols/warning.xml'),
    })
  ),
  empty: icon(
    'cyan',
    Icon.select({ ios: 'tray', android: import('@expo/material-symbols/folder_open.xml') })
  ),
} as const;

/** Any icon the app draws - one of `Icons`, or a file's or folder's from `file-icons.ts`. */
export type IconName = AppIcon;
