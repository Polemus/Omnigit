/**
 * What a PIN key is made of where there is no Liquid Glass.
 *
 * Android keeps the Material `TextButton` surface clear and lets its native circular
 * ripple provide the touch feedback. Painting an iOS-like disc behind every number made
 * the keypad look imported rather than like an Android credential pad. The file exists
 * because iOS's keys are glass, and `pin-key.ios.tsx` is where that lives.
 *
 * This file is Android's and web's, and the one TypeScript reads.
 */

import type { ButtonProps } from '@expo/ui';
import type { ReactNode } from 'react';

/**
 * Groups the keys so that neighbouring glass can blend. Nothing to group on Android, where
 * a Material circle is opaque and has no relationship with the one beside it.
 */
export function KeyGroup({ children }: { children: ReactNode; spacing?: number }) {
  return <>{children}</>;
}

/** No extra modifiers: the circle comes from the style. */
export function keyModifiers(): ButtonProps['modifiers'] {
  return undefined;
}

/** Material's native ripple is the surface; there is no permanent disc underneath it. */
export function keyBackground(_surface: string): string | undefined {
  return undefined;
}
