/**
 * The palette for whichever theme the phone is in.
 */

import { useColorScheme } from 'react-native';

import { Palettes, type Palette } from './tokens';

export type Scheme = 'light' | 'dark';

export function useScheme(): Scheme {
  // `useColorScheme` can answer null - before the system has said, and on web where the
  // preference may be unset. Only an explicit "dark" counts as dark, so an unknown
  // preference lands on the same theme the platform itself defaults to.
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function usePalette(): Palette {
  return Palettes[useScheme()];
}
