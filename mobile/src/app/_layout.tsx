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
import { DisplayPreferencesProvider } from '@/state/display-preferences';
import { LockProvider } from '@/state/lock';
import { Palettes } from '@/theme/tokens';
import { useScheme } from '@/theme/use-palette';
import { AssistantGlowHost } from '@/ui/assistant-glow';
import { AppLockGate } from '@/ui/lock-screen';
import { useNavigationBarButtons } from '@/ui/navigation-bar';
import { OnboardingGate } from '@/ui/onboarding';
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
  return (
    <DisplayPreferencesProvider>
      <AppLayout />
    </DisplayPreferencesProvider>
  );
}

function AppLayout() {
  const scheme = useScheme();
  const palette = Palettes[scheme];
  useRefetchOnForeground();
  useNavigationBarButtons(scheme);

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
        <LockProvider>
            <AccountsProvider>
              <ThemeProvider value={navigationTheme}>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                <Stack
                  screenOptions={{
                    headerLargeTitleEnabled: false,
                    // The root stack owns every pushed page and modal. Set this once so
                    // Android centres their titles consistently; iOS keeps its native
                    // navigation-bar alignment.
                    headerTitleAlign: process.env.EXPO_OS === 'android' ? 'center' : undefined,
                    // Native-stack transitions briefly expose the scene behind the card.
                    // Paint it explicitly so dark mode never falls through to white.
                    contentStyle: { backgroundColor: palette.background },
                  }}>
                  {/* No header *here*, because each tab brings its own: one nav bar above the
                    whole tab bar could only ever show one title and one set of controls, and
                    the account and owner a list is drawn from differ per tab. So every tab
                    wraps its screen in a stack of its own - see `TabStack` - and this screen
                    stays bare so there are never two bars stacked up. */}
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
                  {/* A modal, like Add an account: a short errand you finish and dismiss,
                    rather than somewhere in the app you navigate to and come back from. */}
                  <Stack.Screen
                    name="updates/index"
                    options={{ title: 'Updates', presentation: 'modal' }}
                  />
                  {/* Pushed from inside the Updates modal, as the sign-in form is from Add an
                    account. */}
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
                  {/* The assistant draws its own header: the orb and its name over the
                    conversation, as iMessage puts a contact's photo over one. */}
                  <Stack.Screen name="chat/index" options={{ headerShown: false }} />
                </Stack>
                {/* Over the whole navigator, so the glow frames the display - header and all -
                  while the conversation slides in beneath it. */}
                <AssistantGlowHost />
                {/* A one-time gate rather than a route, so a deep link or restored navigator
                  cannot land past the introduction. The lock below remains last and therefore
                  wins for anyone who already protected the app. */}
                <OnboardingGate />
                {/* Last, and therefore over everything including the glow and any modal. Being
                  locked is a property of the app rather than a place in it: a lock that is a
                  route is a route something can navigate past, and it only has to be wrong
                  once. */}
                <AppLockGate />
              </ThemeProvider>
            </AccountsProvider>
        </LockProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
