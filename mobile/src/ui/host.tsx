/**
 * The app's native host. Import `Host` from here, never from `@expo/ui` - lint enforces it.
 *
 * Each platform's file tells its host something it would otherwise read off the phone:
 * the app's chosen appearance on all platforms, plus the reader's own Dynamic Type size
 * on iOS. This file is web's and the one TypeScript reads.
 */

import { Host as UniversalHost } from '@expo/ui';
import type { ComponentProps } from 'react';

import { useScheme, type Scheme } from '../theme/use-palette';

export function Host({ colorScheme, ...props }: ComponentProps<typeof UniversalHost>) {
  const scheme = useScheme();
  return <UniversalHost {...props} colorScheme={colorScheme ?? scheme} />;
}

/**
 * The scheme to hand a native control that opens a host of its own - `MenuView`'s
 * `colorScheme` or `SegmentedControl`'s `appearance`. These controls open native surfaces
 * outside our Host tree, so each receives the app preference directly.
 */
export function useHostScheme(): Scheme {
  return useScheme();
}
