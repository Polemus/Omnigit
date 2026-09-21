/**
 * The app's icon: `@expo/ui`'s own, drawn in the icon's hue unless a colour is passed.
 *
 * `name` is one of `Icons`, or a file's or folder's icon from `file-icons.ts` - a glyph
 * that knows its colour - so every icon is coloured without every call site saying so.
 * `color` overrides it where the colour means something about this particular thing: a
 * pull request's state, an error.
 *
 * On iOS, `icon.ios.tsx` also applies the colour in a form every native version reads (see
 * `swiftui-colour.ts`). Import `Icon` from here, never from `@expo/ui` - lint enforces it.
 * This file is Android's and web's, and the one TypeScript reads.
 */

import { Icon as UniversalIcon, type IconProps } from '@expo/ui';

import { usePalette } from '../theme/use-palette';
import type { AppIcon } from './icons';

export type AppIconProps = Omit<IconProps, 'name'> & { name: AppIcon };

export function Icon({ name, color, ...props }: AppIconProps) {
  const palette = usePalette();
  return <UniversalIcon {...props} name={name.glyph} color={color ?? palette.hues[name.hue]} />;
}
