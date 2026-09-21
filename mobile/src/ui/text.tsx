/**
 * The app's native text: `@expo/ui`'s own, except on iOS, where `text.ios.tsx` applies a
 * `textStyle.color` in a form every native version reads (see `swiftui-colour.ts`).
 * Import this `Text` rather than `@expo/ui`'s - lint enforces it. React Native's own `Text`
 * is a different component and is untouched.
 *
 * This file is Android's and web's, where the colour was never the problem, and the one
 * TypeScript reads.
 */

export { Text } from '@expo/ui';
