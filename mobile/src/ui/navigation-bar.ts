/**
 * Android's navigation bar buttons, kept in step with the theme.
 *
 * React Native decides their colour once, when the activity is created: `enableEdgeToEdge()`
 * reads the phone's ui mode and sets `isAppearanceLightNavigationBars` from it. The activity
 * handles a change of theme itself rather than restarting - which is what keeps a switch
 * from throwing away the screen someone is on - so nothing ever sets it again, and the
 * buttons keep the colour they launched with: white buttons over a white bar after a switch
 * to light mode, which is a navigation bar nobody can see. It is the staleness
 * `host.android.tsx` exists for, one layer further out.
 *
 * `setStyle` names the *content*, not the bar: `dark` means dark buttons, for a light
 * background. The system draws its own scrim behind the buttons from the same flag, so this
 * one call decides both what the buttons look like and what is behind them.
 *
 * It is a native module, so a build made before it was added has nothing to call. The
 * require is guarded and the bar keeps the colour it launched with there - which is what
 * lets everything else in the same change ship as an ordinary update.
 */

import { useEffect } from 'react';

import type { Scheme } from '../theme/use-palette';

export function useNavigationBarButtons(scheme: Scheme) {
  useEffect(() => {
    if (process.env.EXPO_OS !== 'android') return;
    try {
      // A static import is evaluated at startup and would throw there instead, taking the
      // app with it on any build that does not have the module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const navigationBar = require('expo-navigation-bar') as typeof import('expo-navigation-bar');
      navigationBar.NavigationBar.setStyle(scheme === 'dark' ? 'light' : 'dark');
    } catch {
      // A build from before the module was added: nothing to call, and nothing to fix here.
    }
  }, [scheme]);
}
