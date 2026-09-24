/**
 * The app's list row: `@expo/ui`'s own, with a platform file each where the platform needs
 * something from it. On iOS `list-item.ios.tsx` gives a plain supporting string the grey it
 * is meant to have (see `swiftui-colour.ts`); on Android `list-item.android.tsx` keeps a row
 * that stops taking taps from sending Compose a removed prop. Import `ListItem` from here,
 * never from `@expo/ui` - lint enforces it.
 *
 * This file is web's, where neither was ever the problem, and the one TypeScript reads.
 */

export { ListItem } from '@expo/ui';
