/**
 * iOS: `@expo/ui`'s `Host`, fixed at the appearance and text size the reader chose rather
 * than the ones the phone is set to.
 *
 * Everything drawn inside a host here is SwiftUI, and SwiftUI text follows Dynamic Type -
 * which is the phone's setting for every app at once. The app does not follow it (see
 * `src/state/text-scale.tsx`), so each host is pinned to the size that matches the reader's
 * own scale, and the slider in Settings moves every row, header and button in step with the
 * app's own text.
 *
 * `dynamicTypeSize` takes a named size rather than a number, so the scale picks the nearest
 * one: `large` is the size iOS ships at, with `small` and `medium` available below it and
 * the larger accessibility choices above it.
 * A caller's own modifiers come after, so a screen can still override it.
 */

import { Host as UniversalHost } from '@expo/ui';
import {
  bold,
  dynamicTypeSize,
  type DynamicTypeSizeValue,
} from '@expo/ui/swift-ui/modifiers';
import type { ComponentProps } from 'react';

import { useDisplayPreferences } from '../state/display-preferences';
import { useScheme, type Scheme } from '../theme/use-palette';

/** iOS's own steps, by how much bigger than `large` each one draws body text. */
const STEPS: { from: number; size: DynamicTypeSizeValue }[] = [
  { from: 1.3, size: 'xxxLarge' },
  { from: 1.18, size: 'xxLarge' },
  { from: 1.06, size: 'xLarge' },
  { from: 0.963, size: 'large' },
  { from: 0.888, size: 'medium' },
  { from: 0, size: 'small' },
];

/** What a modifier is, taken from one rather than imported: the package publishes the type
    only from the module that defines it. */
type Modifier = ReturnType<typeof dynamicTypeSize>;

type HostProps = ComponentProps<typeof UniversalHost> & { modifiers?: Modifier[] };

export function Host({ colorScheme, modifiers, ...props }: HostProps) {
  const { boldText, scale, scheme } = useDisplayPreferences();
  const size = STEPS.find((step) => scale >= step.from)?.size ?? 'large';

  // The universal props do not name `modifiers`, but on iOS the universal host *is* the
  // SwiftUI one, which takes them - so the prop is real and only the type is short of it.
  const withSize = {
    modifiers: [dynamicTypeSize(size), ...(boldText ? [bold()] : []), ...(modifiers ?? [])],
  } as Partial<ComponentProps<typeof UniversalHost>>;

  return <UniversalHost {...props} colorScheme={colorScheme ?? scheme} {...withSize} />;
}

/** The scheme for native controls that create a SwiftUI host outside our wrapper. */
export function useHostScheme(): Scheme {
  return useScheme();
}
