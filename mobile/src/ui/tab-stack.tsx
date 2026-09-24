/**
 * The native navigation stack each tab sits in, and therefore the header each tab has.
 *
 * A tab needs a stack of its own to have a header at all: `NativeTabs` draws the bar at
 * the bottom and nothing at the top, so without this the first row of a list drew against
 * the status bar and there was nowhere for the account and owner controls to live except
 * a strip of our own underneath - a header in everything but name, and not the platform's.
 *
 * Four tabs, one component, because a header that differs between tabs is the thing a
 * person notices. Every screen still names its own title and its own header items with a
 * `Stack.Screen` of its own: the title here is only what shows before it does, which keeps
 * the route name from flashing up on the way in.
 *
 * `headerLargeTitleEnabled` is off: a large title is a second, taller copy of what the tab
 * bar already says, and on the search tab it fights the system search field for the same
 * space.
 */

import { Stack } from 'expo-router';

import { usePalette } from '../theme/use-palette';

export function TabStack({ title }: { title: string }) {
  const palette = usePalette();

  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: false,
        headerShadowVisible: false,
        // Android defaults to leading titles; the rest of Omnigit's controls and iOS's
        // own navigation bars are centred, so keep the page name in the middle there too.
        headerTitleAlign: process.env.EXPO_OS === 'android' ? 'center' : undefined,
        // The root stack has the same canvas. This one covers tab-to-tab and nested-stack
        // transitions before the next screen has drawn its own background.
        contentStyle: { backgroundColor: palette.background },
      }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
