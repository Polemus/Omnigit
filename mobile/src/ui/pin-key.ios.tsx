/**
 * iOS: the PIN keys are Liquid Glass, because that is what the passcode screen is made of.
 *
 * A flat grey circle is the shape of Apple's key without being the material. The real one
 * is glass: it refracts what is behind it, brightens at its edge, and reacts to the finger
 * on it. `glassEffect` is the SwiftUI modifier for exactly that, applied to the native
 * button itself rather than by putting a `GlassView` around it - a React Native view
 * wrapped around a SwiftUI button would be native inside React Native inside native, which
 * is the arrangement that breaks glass compositing rather than producing it.
 *
 * `GlassEffectContainer` is what lets neighbouring keys know about each other, and its
 * `spacing` is the distance at which they start to *merge*. That is the effect Apple uses
 * for a toolbar whose buttons flow into one another - and it is wrong for a keypad: passing
 * the gap between keys as the spacing made every key reach for the ones above and below it
 * and the grid came out as a column of teardrops. Zero keeps them in one container, where
 * they light each other's edges, without letting them join.
 *
 * `interactive` is on, which is the property that makes a key feel pressed rather than
 * merely tapped - the material itself responds. Below iOS 26 there is no glass to ask for,
 * so this falls back to the same filled circle Android uses.
 */

import { GlassEffectContainer } from '@expo/ui/swift-ui';
import { glassEffect } from '@expo/ui/swift-ui/modifiers';
import type { ButtonProps } from '@expo/ui';
import type { ReactNode } from 'react';

import { hasGlass } from './glass';

export function KeyGroup({ children, spacing }: { children: ReactNode; spacing?: number }) {
  if (!hasGlass) return <>{children}</>;
  return <GlassEffectContainer spacing={spacing ?? 0}>{children}</GlassEffectContainer>;
}

export function keyModifiers(): ButtonProps['modifiers'] {
  if (!hasGlass) return undefined;
  return [
    glassEffect({
      // `regular` rather than `clear`: a keypad has to be readable over whatever is behind
      // it, and `clear` is for a bar that wants the content to come through.
      glass: { variant: 'regular', interactive: true },
      shape: 'circle',
    }),
  ];
}

/**
 * The fill, which glass supplies itself.
 *
 * Returning a colour here as well would put an opaque disc underneath the glass, leaving it
 * nothing to refract - the same mistake as wrapping the button in a solid view.
 */
export function keyBackground(surface: string): string | undefined {
  return hasGlass ? undefined : surface;
}
