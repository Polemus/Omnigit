/**
 * The root of the app: caching, accounts, theme, and the optional iOS navigation shell.
 */

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Observe, ObserveRoot } from 'expo-observe';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountsProvider } from '@/state/accounts';
import { DisplayPreferencesProvider } from '@/state/display-preferences';
import { LockProvider } from '@/state/lock';
import { NavigationPreferencesProvider } from '@/state/navigation-preferences';
import { Palettes } from '@/theme/tokens';
import { useScheme } from '@/theme/use-palette';
import { AssistantGlowHost } from '@/ui/assistant-glow';
import { AppNavigation } from '@/ui/app-navigation';
import { AppLockGate } from '@/ui/lock-screen';
import { useNavigationBarButtons } from '@/ui/navigation-bar';
import { OnboardingGate } from '@/ui/onboarding';
import { useAppRotationPolicy } from '@/ui/rotation';

// Navigation metrics must be enabled before any route mounts. Omnigit passes repository,
// account and file identity in query parameters, so hide those values (and therefore the
// resolved URL) while keeping the stable route pattern available for performance reports.
Observe.configure({
  integrations: {
    'expo-router': {
      filteredParams: [
        'account',
        'owner',
        'name',
        'number',
        'path',
        'sha',
        'ref',
        'baseUrl',
        'replace',
      ],
    },
  },
});

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

function RootLayout() {
  return (
    <DisplayPreferencesProvider>
      <NavigationPreferencesProvider>
        <AppLayout />
      </NavigationPreferencesProvider>
    </DisplayPreferencesProvider>
  );
}

export default ObserveRoot.wrap(RootLayout);

function AppLayout() {
  const scheme = useScheme();
  const palette = Palettes[scheme];
  useRefetchOnForeground();
  useNavigationBarButtons(scheme);
  useAppRotationPolicy();

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
                <AppNavigation />
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
