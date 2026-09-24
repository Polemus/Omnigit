/**
 * Android: `@expo/ui`'s `Host`, told whether it is light or dark rather than left to work it
 * out.
 *
 * Left to itself a Compose host reads the theme with `isSystemInDarkTheme()`, off its own
 * view's configuration - and Android delivers a change of theme only to views on screen at
 * that moment. The activity handles `uiMode` itself instead of restarting, so a host on a tab
 * or a screen further back in a stack, detached when the phone switched to light, kept the
 * dark scheme: dark cards around content that React Native had already redrawn light. The
 * scheme passed here is the palette's own (`useScheme`), which reaches every host as a prop,
 * attached or not, so the cards and what is in them can no longer disagree. It resolves to
 * the same dynamic Material colours the host would have picked for itself.
 *
 * `MenuView` and `SegmentedControl` open hosts of their own, out of reach of this one, so
 * they are handed `useHostScheme()` instead.
 */

import { Host as UniversalHost } from '@expo/ui';
import type { ComponentProps } from 'react';

import { useScheme, type Scheme } from '../theme/use-palette';

export function useHostScheme(): Scheme {
  return useScheme();
}

export function Host({ colorScheme, ...props }: ComponentProps<typeof UniversalHost>) {
  const scheme = useHostScheme();
  return <UniversalHost {...props} colorScheme={colorScheme ?? scheme} />;
}
