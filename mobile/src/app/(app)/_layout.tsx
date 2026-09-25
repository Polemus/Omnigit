/**
 * The app's existing navigation stack.
 *
 * It lives one level below the root so iOS can optionally place the whole stack in the
 * secondary column of a native Split View. The pathless `(app)` group changes no URLs;
 * Android and the ordinary iOS tab layout still see exactly the same stack as before.
 */

import { Stack } from 'expo-router';

import { usePalette } from '@/theme/use-palette';
import { ContentWidthProvider } from '@/ui/screen';

export default function AppStackLayout() {
  const palette = usePalette();

  return (
    <ContentWidthProvider>
      <Stack
        screenOptions={{
          headerLargeTitleEnabled: false,
          // Android centres titles consistently; iOS keeps its native navigation alignment.
          headerTitleAlign: process.env.EXPO_OS === 'android' ? 'center' : undefined,
          // Paint behind native transitions so dark mode never briefly falls through to white.
          contentStyle: { backgroundColor: palette.background },
        }}>
        {/* Each tab owns its header, so the screen containing the tab bar stays bare. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="sign-in/index"
          options={{ title: 'Add an account', presentation: 'modal' }}
        />
        <Stack.Screen name="sign-in/host" options={{ title: 'Sign in' }} />
        <Stack.Screen
          name="account/index"
          options={{ title: 'Account', presentation: 'modal' }}
        />
        <Stack.Screen
          name="updates/index"
          options={{ title: 'Updates', presentation: 'modal' }}
        />
        <Stack.Screen name="updates/whats-new" options={{ title: "What's new" }} />
        <Stack.Screen
          name="app-lock/index"
          options={{ title: 'App lock', presentation: 'modal' }}
        />
        <Stack.Screen
          name="display/index"
          options={{ title: 'Display', headerBackTitle: 'Settings' }}
        />
        <Stack.Screen name="text-size/index" options={{ title: 'Text Size' }} />
        <Stack.Screen name="repo/index" options={{ title: '' }} />
        <Stack.Screen name="pull/index" options={{ title: '' }} />
        <Stack.Screen name="issue/index" options={{ title: '' }} />
        <Stack.Screen name="file/index" options={{ title: '' }} />
        <Stack.Screen name="diff/index" options={{ title: '' }} />
        <Stack.Screen name="commit/index" options={{ title: '' }} />
        <Stack.Screen name="commit/file" options={{ title: '' }} />
        {/* The assistant draws its own iMessage-style header. */}
        <Stack.Screen name="chat/index" options={{ headerShown: false }} />
      </Stack>
    </ContentWidthProvider>
  );
}
