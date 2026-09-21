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
  /** Whether the file tree shows beside the code when the phone is on its side. */
  fileTreeVisible?: boolean;
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
