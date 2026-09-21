/**
 * Every colour in the app, declared once per theme.
 *
 * The same decision the desktop makes in `Styles/Tokens.axaml`, and for the same reason:
 * restyling the app should mean editing one file. Nothing outside here should contain a
 * hex code - if a screen needs a colour that is not in this file, the colour is missing
 * from the design rather than from that screen.
 */

import { Platform } from 'react-native';

/**
 * The colours icons are drawn in, by name.
 *
 * Every icon has one of these - see `src/ui/icons.ts` and `src/ui/file-icons.ts` - so the
 * same kind of thing is the same colour on every screen: a commit is orange wherever it
 * appears, a key is yellow, a folder is folder-blue. Where the app already has a colour
 * for the idea, the hue *is* that colour - `purple` is the merged state, `green` the open
 * one, `red` danger, `blue` the accent - so an icon never disagrees with the badge or the
 * text beside it.
 *
 * Each hue has a light and a dark value, tuned for contrast against that theme's rows:
 * the pure brand colours GitHub uses for its language dots are mostly unreadable as a
 * 20-point glyph on one theme or the other, yellow on white worst of all.
 */
export type Hue =
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'mint'
  | 'teal'
  | 'cyan'
  | 'brown'
  | 'folder'
  | 'grey';

export interface Palette {
  background: string;
  surface: string;
  surfaceRaised: string;
  separator: string;

  text: string;
  textSecondary: string;
  textTertiary: string;

  accent: string;
  accentMuted: string;

  /** Review states, which every forge shares even where it names them differently. */
  open: string;
  merged: string;
  closed: string;
  draft: string;

  /** Diff gutters. */
  added: string;
  removed: string;
  addedSurface: string;
  removedSurface: string;

  warning: string;
  danger: string;

  /**
   * Code, in the seven categories the desktop reduces TextMate's hundreds of scopes to.
   *
   * The values are lifted from `Styles/Tokens.axaml` unchanged, so the same file is the
   * same colours on a laptop and on a phone. Seven and no more is the desktop's decision
   * and a good one: past that, every extra colour competes with the ones already
   * carrying meaning.
   */
  syntaxKeyword: string;
  syntaxString: string;
  syntaxComment: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxFunction: string;

  /** Behind a glass surface where the platform has none, so the shape still reads. */
  glassFallback: string;

  /** Icon colours - see `Hue`. */
  hues: Record<Hue, string>;

  /**
   * The assistant's conversation, in iMessage's own colours: the system blue for what
   * you send, the system grey for what comes back, on white or black. The background is
   * its own token because the bubbles' tails are cut out of it (`chat-bubble.tsx`).
   */
  chatBackground: string;
  chatOutgoing: string;
  chatOutgoingText: string;
  chatIncoming: string;
}

const light: Palette = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  separator: '#D8D8DE',

  text: '#11141A',
  textSecondary: '#5B616E',
  textTertiary: '#8A909C',

  accent: '#2E6BE6',
  accentMuted: '#E4EDFD',

  open: '#1A7F37',
  merged: '#8250DF',
  closed: '#CF222E',
  draft: '#6E7781',

  added: '#1A7F37',
  removed: '#CF222E',
  addedSurface: '#E6FFEC',
  removedSurface: '#FFEBE9',

  warning: '#9A6700',
  danger: '#CF222E',

  syntaxKeyword: '#8250DF',
  syntaxString: '#A24E28',
  syntaxComment: '#6E7781',
  syntaxNumber: '#3F6E28',
  syntaxType: '#1B7C83',
  syntaxFunction: '#0550AE',

  glassFallback: 'rgba(255,255,255,0.82)',

  hues: {
    blue: '#2E6BE6',
    indigo: '#5856D6',
    purple: '#8250DF',
    pink: '#D6336C',
    red: '#CF222E',
    orange: '#DB6D16',
    yellow: '#B08800',
    green: '#1A7F37',
    mint: '#11897A',
    teal: '#0E7C8C',
    cyan: '#0A8BC2',
    brown: '#94693D',
    folder: '#3A8DD8',
    grey: '#8A909C',
  },

  chatBackground: '#FFFFFF',
  chatOutgoing: '#007AFF',
  chatOutgoingText: '#FFFFFF',
  chatIncoming: '#E9E9EB',
};

const dark: Palette = {
  background: '#000000',
  surface: '#14161A',
  surfaceRaised: '#1D2026',
  separator: '#2C3038',

  text: '#F0F2F5',
  textSecondary: '#9BA3B0',
  textTertiary: '#6E7681',

  accent: '#5B9DFF',
  accentMuted: '#16283F',

  open: '#3FB950',
  merged: '#A371F7',
  closed: '#F85149',
  draft: '#8B949E',

  added: '#3FB950',
  removed: '#F85149',
  addedSurface: '#0F2D17',
  removedSurface: '#3A1417',

  warning: '#D29922',
  danger: '#F85149',

  syntaxKeyword: '#C48FE0',
  syntaxString: '#C99A6E',
  syntaxComment: '#6E7A86',
  syntaxNumber: '#9FBF7F',
  syntaxType: '#5FB3B3',
  syntaxFunction: '#7EA6E0',

  glassFallback: 'rgba(20,22,26,0.82)',

  hues: {
    blue: '#5B9DFF',
    indigo: '#8B89FF',
    purple: '#A371F7',
    pink: '#FF6B9D',
    red: '#F85149',
    orange: '#F0883E',
    yellow: '#E3B341',
    green: '#3FB950',
    mint: '#4FD1BE',
    teal: '#39C5CF',
    cyan: '#56CCF2',
    brown: '#C69C6D',
    folder: '#6CB6F2',
    grey: '#6E7681',
  },

  chatBackground: '#000000',
  chatOutgoing: '#0A84FF',
  chatOutgoingText: '#FFFFFF',
  chatIncoming: '#26252A',
};

export const Palettes = { light, dark } as const;

/**
 * The assistant's colours: the warm-to-cool spectrum Apple Intelligence glows in, for the
 * edge glow as the assistant opens (`assistant-glow.tsx`) and the orb that stands for it
 * (`assistant-orb.tsx`). The same on both themes - a glow is light, not a surface, and it
 * reads against white and black alike.
 */
export const AssistantColours = {
  peach: '#FFBA71',
  coral: '#FF6778',
  pink: '#F5B9EA',
  lavender: '#BC82F3',
  periwinkle: '#8D9FFF',
  sky: '#70C5FF',
  /** The sparkle drawn on the orb, over the spectrum. */
  glyph: '#FFFFFF',
} as const;

/** Spacing, in the same steps the desktop's styles use. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
} as const;

export const Radius = {
  small: 6,
  medium: 12,
  large: 18,
  pill: 999,
} as const;

/**
 * The system's own typefaces. Naming them rather than bundling a font keeps the app
 * looking like the platform it is on, which is most of what makes it feel native.
 */
export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'system-ui, sans-serif', rounded: 'system-ui, sans-serif', mono: 'ui-monospace, monospace' },
})!;

/**
 * A label's own colour, made readable on this theme.
 *
 * Forges store one hex and expect the client to work out the rest. A dark label on a dark
 * background is unreadable, so the background is the label colour at low opacity and the
 * text is the label colour lifted to a legible lightness.
 */
export function labelColours(
  hex: string,
  scheme: 'light' | 'dark'
): { background: string; text: string; border: string } {
  const clean = hex.replace(/^#/, '');
  const valid = /^[0-9a-fA-F]{6}$/.test(clean) ? clean : '8A909C';

  const r = parseInt(valid.slice(0, 2), 16);
  const g = parseInt(valid.slice(2, 4), 16);
  const b = parseInt(valid.slice(4, 6), 16);

  if (scheme === 'dark') {
    return {
      background: `rgba(${r},${g},${b},0.18)`,
      text: lighten(r, g, b),
      border: `rgba(${r},${g},${b},0.4)`,
    };
  }
  return {
    background: `rgba(${r},${g},${b},0.16)`,
    text: darken(r, g, b),
    border: `rgba(${r},${g},${b},0.35)`,
  };
}

/** Pushes a colour up to something readable on black, keeping its hue. */
function lighten(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b, 1);
  const scale = Math.min(255 / max, 1.9);
  return `rgb(${clamp(r * scale)},${clamp(g * scale)},${clamp(b * scale)})`;
}

/** And down to something readable on white. */
function darken(r: number, g: number, b: number): string {
  return `rgb(${clamp(r * 0.55)},${clamp(g * 0.55)},${clamp(b * 0.55)})`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
