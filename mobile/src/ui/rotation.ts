/**
 * Which screens may turn sideways: only the ones showing code.
 *
 * Everywhere else - lists, forms, settings - landscape only shortens the list and crowds
 * the tab bar, so the app stays upright. Code is the opposite: its lines are long, and
 * turning the phone is how a person asks to see more of each one. So the app locks itself
 * upright at launch (`lockUpright`, from the root layout), and the file viewer and the two
 * diff screens unlock rotation while they are in front (`useRotationWhileFocused`),
 * locking upright again the moment they are not - going back, or anything opening on top.
 *
 * `app.json` has to allow every orientation for this to work at all: a build can only lock
 * to orientations it declares, so a portrait-only app could never unlock for a file. The
 * plugin's `initialOrientation` makes an iOS build start upright before any JavaScript
 * runs; Expo Go and Android get the lock a moment later, from the root layout.
 */

import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback } from 'react';

/**
 * Upright only, for everything that is not code.
 *
 * A lock the platform refuses - web, or an iPad in Split View, where iPadOS ignores app
 * locks altogether - leaves the orientation as it was, which is harmless, so the rejection
 * is not worth surfacing.
 */
export function lockUpright(): void {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

/** Lets the calling screen turn sideways - any way but upside down - while it is in front. */
export function useRotationWhileFocused(): void {
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
      return lockUpright;
    }, [])
  );
}
