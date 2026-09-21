/**
 * Colour for the SwiftUI side of @expo/ui, sent in the one form every native version reads.
 *
 * Only the `.ios.tsx` components import this, so Android never bundles it. Two separate
 * faults turn the obvious way to colour something - `foregroundStyle` - white:
 *
 * - @expo/ui 57.0.15 changed what `foregroundStyle` sends to native, from flat fields to a
 *   nested `ShapeStyle`. Native code built before that - an Expo Go that has not caught up
 *   with the package - cannot read the new shape and drops the colour without a word. That
 *   is every coloured `Icon`, since the icon's `color` prop becomes a `foregroundStyle`.
 * - A SwiftUI colour *name* travels to native as a bare string, and native resolves only
 *   CSS names, hex, and SwiftUI's own short list (`primary`, `secondary`, `red`…). So the
 *   `secondaryLabel` that `ListItem` gives a supporting string is dropped on every version,
 *   old or new - `PlatformColor` would carry it, a bare name cannot.
 *
 * `foregroundColor` sidesteps the first: deprecated, but it sends a bare colour the same way
 * in every version. `secondary` sidesteps the second, and is SwiftUI's own colour for exactly
 * this - the grey of a row's second line - in light, dark and increased contrast alike.
 */

import { foregroundColor } from '@expo/ui/swift-ui/modifiers';

/** Paints a SwiftUI view - an icon, a text, a run of text - in `colour`. */
export function foreground(colour: Parameters<typeof foregroundColor>[0]) {
  return foregroundColor(colour);
}

/** The grey of a list row's second line. */
export const secondaryForeground = foregroundColor('secondary');
