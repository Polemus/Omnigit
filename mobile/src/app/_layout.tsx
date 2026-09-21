/**
 * The root of the app: caching, accounts, theme, and the stack the tabs sit inside.
 */

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountsProvider } from '@/state/accounts';
import { Palettes } from '@/theme/tokens';
import { useScheme } from '@/theme/use-palette';
import { AssistantGlowHost } from '@/ui/assistant-glow';
import { lockUpright } from '@/ui/rotation';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A phone is picked up, looked at, and put down. Anything older than a minute is
      // worth asking about again; anything newer is what the person just looked at.
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: (failureCount, error) => {
        // Retrying a rejected token just spends battery producing the same 401.
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        // No status at all means the site was never reached: a timeout, or no route to it.
        // That has already cost a full twenty seconds, so it gets one more attempt rather
        // than two - three in a row is a minute of spinner on a screen that is not going to
        // load. Anything the site actually answered still gets the usual two.
        if (status === undefined) return failureCount < 1;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
  },
});

/**
 * React Query listens for window focus, which a phone does not have. Wiring it to the app
 * lifecycle instead is what makes coming back to the app show current data rather than
 * whatever was on screen when it was backgrounded.
 */
function useRefetchOnForeground() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  const scheme = useScheme();
  const palette = Palettes[scheme];
  useRefetchOnForeground();

  // Upright until a code screen says otherwise. A layout effect so that it lands before
  // any screen's focus effect: opened straight onto a file from a link, the file's unlock
  // has to come second, or this would lock the one screen that may turn.
  useLayoutEffect(() => {
    lockUpright();
  }, []);

  useEffect(() => {
    // Nothing here waits on the network - the account list is a local file - so the
    // splash can go as soon as the first frame is ready.
    void SplashScreen.hideAsync();
  }, []);

  const navigationTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.separator,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AccountsProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerLargeTitleEnabled: false }}>
              {/* No header over the tabs: the tab bar already says which screen you are
                  on, and a nav bar above it would be a second title taking a fifth of the
                  screen. The cost is that nothing is holding content below the status bar
                  any more, so each tab screen applies the inset itself - see `TabScreen`.
                  Anything a tab needs to offer goes in its content, not a header. */}
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
              <Stack.Screen name="repo/index" options={{ title: '' }} />
              <Stack.Screen name="pull/index" options={{ title: '' }} />
              <Stack.Screen name="issue/index" options={{ title: '' }} />
              <Stack.Screen name="file/index" options={{ title: '' }} />
              <Stack.Screen name="diff/index" options={{ title: '' }} />
              <Stack.Screen name="commit/index" options={{ title: '' }} />
              <Stack.Screen name="commit/file" options={{ title: '' }} />
              {/* The assistant draws its own header: the orb and its name over the
                  conversation, as iMessage puts a contact's photo over one. */}
              <Stack.Screen name="chat/index" options={{ headerShown: false }} />
            </Stack>
            {/* Over the whole navigator, so the glow frames the display - header and all -
                while the conversation slides in beneath it. */}
            <AssistantGlowHost />
          </ThemeProvider>
        </AccountsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
