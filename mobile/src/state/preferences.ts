/**
 * Layout choices a person makes, remembered between launches (`storage/preferences.ts`).
 */

import { useState } from 'react';

import { loadPreferences, savePreferences } from '../storage/preferences';

/**
 * Whether the file tree shows beside the code when the phone is sideways, and a toggle.
 *
 * Shown until someone hides it: they turned the phone to see more of the file, and the
 * tree is the other half of seeing more of it. Hidden stays hidden - on the next file and
 * the next launch - because hiding it says the full width of the code matters more to
 * them than the tree does.
 *
 * One choice for every code screen, the repository's tree beside a file and the changed
 * files beside a diff alike: the question it answers is the same on each, and a toggle
 * that had to be found and pressed again on every kind of screen would read as one that
 * did not stick.
 */
export function useFileTreeVisible(): [boolean, () => void] {
  const [visible, setVisible] = useState(() => loadPreferences().fileTreeVisible ?? true);

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    savePreferences({ fileTreeVisible: next });
  };

  return [visible, toggle];
}
