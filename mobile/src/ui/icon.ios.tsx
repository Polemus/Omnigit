/**
 * iOS: the icon's colour - its hue, or the one passed - goes on as `foregroundColor`,
 * rather than through the `color` prop, which becomes a `foregroundStyle` that native code
 * older than @expo/ui 57.0.15 drops. See `icon.tsx` and `swiftui-colour.ts`.
 */

import { Icon as UniversalIcon } from '@expo/ui';

import { usePalette } from '../theme/use-palette';
import type { AppIconProps } from './icon';
import { foreground } from './swiftui-colour';

export function Icon({ name, color, modifiers, ...props }: AppIconProps) {
  const palette = usePalette();
  return (
    <UniversalIcon
      {...props}
      name={name.glyph}
      modifiers={[...(modifiers ?? []), foreground(color ?? palette.hues[name.hue])]}
    />
  );
}
