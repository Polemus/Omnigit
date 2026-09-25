/**
 * Which screens may turn sideways: code screens, plus the whole iOS app while the optional
 * Split View shell is enabled.
 *
 * Everywhere else - lists, forms, settings - landscape only shortens the list and crowds
 * the tab bar, so the ordinary app stays upright. Code is the opposite: its lines are long,
 * and turning the phone is how a person asks to see more of each one. Split View also needs
 * the space and adaptability of either orientation, so its root policy unlocks every screen.
 * The file viewer and the two diff screens still unlock rotation independently when the
 * ordinary tab layout is active.
 *
 * `app.json` has to allow every orientation for this to work at all: a build can only lock
 * to orientations it declares, so a portrait-only app could never unlock for a file. The
 * plugin's `initialOrientation` makes an iOS build start upright before any JavaScript
 * runs; Expo Go and Android get the lock a moment later, from the root layout.
 */

import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useLayoutEffect } from 'react';

import { useNavigationPreferences } from '../state/navigation-preferences';

function applyAppRotation(splitViewEnabled: boolean): void {
  const lock =
    process.env.EXPO_OS === 'ios' && splitViewEnabled
      ? ScreenOrientation.OrientationLock.DEFAULT
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;

  ScreenOrientation.lockAsync(lock).catch(() => {});
}

/** Keeps the whole iOS app rotatable while its Split View navigation shell is enabled. */
export function useAppRotationPolicy(): void {
  const { splitViewEnabled } = useNavigationPreferences();

  useLayoutEffect(() => {
    applyAppRotation(splitViewEnabled);
  }, [splitViewEnabled]);
}

/** Lets the calling screen turn sideways - any way but upside down - while it is in front. */
export function useRotationWhileFocused(): void {
  const { splitViewEnabled } = useNavigationPreferences();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
      return () => applyAppRotation(splitViewEnabled);
    }, [splitViewEnabled])
  );
}
