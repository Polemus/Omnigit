/**
 * Small choices about how the app looks, kept between launches.
 *
 * A JSON file beside `accounts.json`, read synchronously so a screen can start in the
 * state it was left in rather than flicking into it a frame later. Nothing here matters
 * enough to fail over: an unreadable or missing file is every preference at its default,
 * and a write that fails costs only remembering the choice next time.
 */

import { File, Paths } from 'expo-file-system';

const PREFERENCES_FILE = 'preferences.json';

export interface Preferences {
  /** How the app chooses between its light and dark palettes. */
  appearance?: 'automatic' | 'dark' | 'light' | 'system';
  /** The last explicitly chosen palette, restored when Automatic or System is turned off. */
  manualAppearance?: 'dark' | 'light';
  /** Whether ordinary-weight text should be promoted to bold throughout the app. */
  boldText?: boolean;
  /** Whether a file tree shows beside the code or a diff when the phone is on its side. */
  fileTreeVisible?: boolean;
  /** Whether iOS uses the experimental native sidebar instead of its tab bar. */
  splitViewEnabled?: boolean;
  /**
   * How much bigger than its designed size the app draws its text - 1 to 1.5, and 1 unless
   * the reader has moved the slider in Settings. The phone's own text size is deliberately
   * not consulted; see `src/state/text-scale.tsx`.
   */
  textScale?: number;
}

function preferencesFile(): File {
  return new File(Paths.document, PREFERENCES_FILE);
}

export function loadPreferences(): Preferences {
  try {
    const file = preferencesFile();
    if (!file.exists) return {};
    const parsed: unknown = JSON.parse(file.textSync());
    return parsed !== null && typeof parsed === 'object' ? (parsed as Preferences) : {};
  } catch {
    return {};
  }
}

export function savePreferences(update: Partial<Preferences>): void {
  try {
    const file = preferencesFile();
    const next = { ...loadPreferences(), ...update };
    if (!file.exists) file.create({ intermediates: true });
    file.write(JSON.stringify(next, null, 2));
  } catch {
    // Forgetting a layout choice is not worth interrupting anyone over.
  }
}
