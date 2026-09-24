/**
 * What each update brought, newest first - what the Updates screen's What's new shows.
 *
 * It travels inside the JavaScript an update carries, so what someone reads is always the
 * list for the version they are running: no server to ask, and nothing that can fall out of
 * step with the code it describes. The flip side is that a waiting update's notes cannot be
 * read before it is downloaded - they arrive with it.
 *
 * Add an entry at the top whenever an update is published, before publishing it: the
 * update is built from the files on disk, so an entry added afterwards ships with the next
 * one instead. The title is a good `eas update --message`. A platform-specific update or
 * change names its platforms here, so installing a later all-platform update never makes
 * an iPhone describe an Android-only fix, or the reverse.
 */

export interface Release {
  /** The day it was published, `YYYY-MM-DD`. */
  date: string;
  /** A short name for it. */
  title: string;
  /** What someone using the app will notice - a sentence each, in their words, not ours. */
  changes: string[];
}

type ReleasePlatform = 'android' | 'ios';

type ReleaseChange =
  | string
  | {
      text: string;
      platforms: ReleasePlatform[];
    };

interface ReleaseDefinition {
  date: string;
  title: string;
  /** Omit for an update sent to both platforms. */
  platforms?: ReleasePlatform[];
  changes: ReleaseChange[];
}

const RELEASES: ReleaseDefinition[] = [
  {
    date: '2026-09-24',
    title: 'Android Settings stability',
    platforms: ['android'],
    changes: [
      'Settings now opens safely when an app update is waiting, with native Android status indicators throughout the screen.',
    ],
  },
  {
    date: '2026-09-24',
    title: 'Cleaner Android branch selector',
    platforms: ['android'],
    changes: [
      'The branch selector on Code and Commits now stays transparent while closed, then fills the full pill only while its menu is open.',
    ],
  },
  {
    date: '2026-09-24',
    title: 'Updates stay in your hands',
    platforms: ['android'],
    changes: [
      'Opening Omnigit no longer downloads an update in the background. Settings can still check availability and show its update dot.',
      'Downloading and restarting now happen only after you choose them on the Updates screen.',
    ],
  },
  {
    date: '2026-09-24',
    title: 'Android repository controls',
    platforms: ['android'],
    changes: [
      "Open and Closed on a repository's Issues tab now share the full width evenly.",
      'The branch picker on Code and Commits now carries its background cleanly to the end of the pill.',
    ],
  },
  {
    date: '2026-09-24',
    title: 'Android navigation polish',
    platforms: ['android'],
    changes: [
      'Search now keeps the same icon and label alignment as the other navigation tabs after you leave a search.',
      'Moving between screens in dark mode now stays dark throughout the transition instead of briefly flashing white.',
      'Repository sections now use individual pills without a container behind them. They use almost the full width and wrap onto another row on smaller phones.',
    ],
  },
  {
    date: '2026-09-24',
    title: 'Display and readability on every screen',
    changes: [
      'On iPhone and Android, Settings now has a Display screen where you can choose Light, Dark, the phone setting, or an automatic daytime and nighttime appearance.',
      'Text has seven sizes from 85% to 130%, including smaller text, with a live preview and a Bold Text option.',
      {
        text: 'On iPhone, the tab bar, menus, pickers and other native controls now follow the appearance you choose.',
        platforms: ['ios'],
      },
      {
        text: 'On iPhone, the Display screen now returns to Settings with a correctly labelled back button.',
        platforms: ['ios'],
      },
      {
        text: 'On Android, the tab bar, menus, system bars and other native controls now change with the rest of the app instead of keeping the old theme.',
        platforms: ['android'],
      },
      {
        text: "On Android, a repository's About, Code, Pulls, Issues and Commits are pills again, matching iPhone. They stay on one line and scroll on smaller phones instead of wrapping or being cut off.",
        platforms: ['android'],
      },
      {
        text: 'On Android, titles now sit in the centre of the header throughout the app.',
        platforms: ['android'],
      },
    ],
  },
  {
    date: '2026-09-23',
    title: 'Repository views that fit the phone',
    platforms: ['android'],
    changes: [
      "On Android, a repository's About, Code, Pulls, Issues and Commits no longer squeeze into five pills that have to be scrolled sideways to be read. On a phone they are one picker, like the branch beside them; on a tablet, where five pills genuinely fit, they stay pills.",
      'Open and Closed on the Issues view are still pills - two short words fit anywhere.',
    ],
  },
  {
    date: '2026-09-23',
    title: 'Text size is yours to set',
    changes: [
      "Settings has a Text size slider. Omnigit draws at its own size whatever the phone is set to, so a phone set large for messages no longer leaves a repository list three rows tall - and the slider makes everything bigger when you want it.",
      'Labels and state pills grow with the text instead of cutting their words off.',
      {
        text: 'On Android, the rows the system draws follow the slider too, from the next version of the app onwards.',
        platforms: ['android'],
      },
    ],
  },
  {
    date: '2026-09-23',
    title: 'Search and the navigation buttons on Android',
    platforms: ['android'],
    changes: [
      'On Android, Search has a field of its own above the list. The old one lived in the bar at the top, where its magnifying glass was drawn across the owner and account controls as soon as it closed, and it left no room between itself and the first result.',
      'The strip behind the three navigation buttons now reaches the screens that were missing it: the file viewer, both diffs, a picture, and every passcode screen - including the one that greets you when you open the app.',
    ],
  },
  {
    date: '2026-09-23',
    title: 'A lighter commit list on Android',
    platforms: ['android'],
    changes: [
      "On Android, a repository's commits are built the same plain way the inbox now is, so a long history - and every press of Load more commits - no longer slows the phone to a stop.",
      "A commit's line reads sha, author and time as ordinary text; the sha loses its typewriter face.",
    ],
  },
  {
    date: '2026-09-23',
    title: 'A lighter inbox on Android',
    platforms: ['android'],
    changes: [
      'On Android, the inbox builds its rows the plain way the repositories list does, so a long inbox - two accounts and a hundred notifications between them - costs the phone far less to draw.',
      'The site a notification came from now reads as plain text beside the repository and the time, rather than as a coloured badge.',
    ],
  },
  {
    date: '2026-09-22',
    title: 'Room for the navigation buttons',
    platforms: ['android'],
    changes: [
      "On Android phones that navigate with three buttons, the buttons now sit on a strip the colour of the header instead of over the page, and no screen runs its last row underneath them - including the keypad when you set a PIN, and Settings, whose last row sat under the tab bar.",
      'On the lock screen, the padlock sits in the middle of its circle rather than on the top edge of it.',
      "Android's own navigation buttons follow light and dark mode now, instead of keeping whichever colour they had when the app opened. That one arrives with the next version of the app rather than with an update.",
    ],
  },
  {
    date: '2026-09-22',
    title: 'Cleaner cards on Android',
    platforms: ['android'],
    changes: [
      'On Android, each row is one card again instead of a box inside a card - its text and icons sit at the edge of the card, and a tap lights up the whole of it.',
    ],
  },
  {
    date: '2026-09-22',
    title: 'Light mode on Android',
    platforms: ['android'],
    changes: [
      'On Android, every screen now follows the phone into light or dark mode - including ones on another tab or further back, which used to keep the old look and show dark cards in light mode.',
      'The account and owner menus, the ⋮ menu and the view switchers follow along too.',
    ],
  },
  {
    date: '2026-09-22',
    title: 'Account pictures on Android',
    platforms: ['android'],
    changes: [
      'On Android, the account switcher shows each account with its own picture instead of a grey square.',
    ],
  },
  {
    date: '2026-09-22',
    title: 'Fixes on Android',
    platforms: ['android'],
    changes: [
      "On Android, rows that are meant to be inactive - like the Updates screen's button while it is checking - no longer respond to taps.",
      "On Android, the repository screen's sections have their usual spacing again.",
    ],
  },
  {
    date: '2026-09-22',
    title: 'Passcode screens follow light and dark mode',
    changes: [
      "The lock screen, creating a PIN and App lock in Settings now follow the phone's light or dark setting, like the rest of the app.",
      {
        text: 'On iPhone in light mode, the passcode keys show their numbers again instead of blank circles.',
        platforms: ['ios'],
      },
    ],
  },
  {
    date: '2026-09-22',
    title: 'Pictures in pull requests',
    changes: [
      'A changed picture in a pull request or a commit is shown as it was and as it is - one above the other, or side by side with the phone on its side.',
      'A changed SVG switches between its picture and its diff.',
      "What's new, here: every update now says what it brought.",
    ],
  },
  {
    date: '2026-09-21',
    title: 'Pictures in the code viewer',
    changes: [
      'Pictures open in the code viewer - PNG, JPEG, GIF, WebP, HEIC, AVIF, SVG and more - over a checkerboard wherever they are transparent.',
      {
        text: 'On iPhone, pinch a picture to zoom in.',
        platforms: ['ios'],
      },
      'SVG and Markdown files switch between their preview and their source.',
      'Copy image puts a picture on the clipboard.',
      'Videos, sound files, fonts, PDFs and archives say what they are, with the way to the site, instead of showing garbled text.',
      'A file kept in Git LFS says so.',
    ],
  },
  {
    date: '2026-09-21',
    title: 'Changed files beside the diff',
    changes: [
      "Turn the phone on its side on a pull request's changed file, and the pull request's files sit beside the diff as a tree.",
      "Each file ends in git's letter for what happened to it - A, M, D or R - and a deleted one is struck through.",
      "A commit's changed files get the same tree.",
    ],
  },
];

/**
 * The release history for one bundle target. Shared changes stay; platform-specific
 * releases and lines are removed before either Updates screen sees them.
 */
export function releasesForPlatform(platform: string | undefined): Release[] {
  return RELEASES.filter((release) => appliesTo(release.platforms, platform))
    .map((release) => ({
      date: release.date,
      title: release.title,
      changes: release.changes
        .filter((change) =>
          typeof change === 'string' ? true : appliesTo(change.platforms, platform)
        )
        .map((change) => (typeof change === 'string' ? change : change.text)),
    }))
    .filter((release) => release.changes.length > 0);
}

function appliesTo(platforms: ReleasePlatform[] | undefined, platform: string | undefined) {
  return platforms === undefined ||
    ((platform === 'android' || platform === 'ios') && platforms.includes(platform));
}

export const WHATS_NEW = releasesForPlatform(process.env.EXPO_OS);

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * `22 September 2026`. Written out by hand rather than through `Intl`, because the date is
 * a day rather than an instant, and no time zone should be able to move it.
 */
export function describeDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const name = MONTHS[month - 1];
  return name && day && year ? `${day} ${name} ${year}` : date;
}
