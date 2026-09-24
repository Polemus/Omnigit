/** The palette selected by the app's Appearance preference. */

import { useDisplayPreferences } from '../state/display-preferences';
import { Palettes, type Palette } from './tokens';

export type Scheme = 'light' | 'dark';

export function useScheme(): Scheme {
  return useDisplayPreferences().scheme;
}

export function usePalette(): Palette {
  return Palettes[useScheme()];
}
