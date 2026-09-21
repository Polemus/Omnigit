/**
 * The app's list row: `@expo/ui`'s own, except on iOS, where `list-item.ios.tsx` gives a
 * plain supporting string the grey it is meant to have (see `swiftui-colour.ts`). Import
 * `ListItem` from here, never from `@expo/ui` - lint enforces it.
 *
 * This file is Android's and web's, where the grey was never the problem, and the one
 * TypeScript reads.
 */

export { ListItem } from '@expo/ui';
