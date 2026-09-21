/**
 * Keeping content out from under the hardware and the system bars.
 *
 * The tab screens have no navigation header - the tab bar already says where you are -
 * and a header is what would otherwise have been holding content below the status bar.
 * Without one, the first thing on the screen draws over the clock and the battery, and on
 * Android `edgeToEdgeEnabled` puts it under the system bars as well. So the inset is
 * applied here instead, deliberately and in one place.
 *
 * The bottom is the same problem upside down. Both platforms float the tab bar over the
 * content - that is the look, and it is a good one - but the last row of a list has to be
 * able to scroll clear of it or it can never be tapped. Neither `NativeTabs` nor the
 * native list reports the bar's height, so the clearance is a constant. It is one number,
 * in one place, and erring generous only ever costs empty space at the end of a scroll.
 */

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The floating tab bar's own height, without the home indicator underneath it.
 *
 * iOS 26's bar is a pill that sits above the safe area; Android's Material bar is taller
 * and sits on it. Measured from the two, and the one dial to turn if the last row of a
 * list still ends up behind the bar.
 */
const TAB_BAR_HEIGHT = Platform.select({ ios: 56, android: 72 }) ?? 56;

/** Wraps a tab screen so its content starts below the status bar. */
export function TabScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return <View style={[styles.fill, { paddingTop: insets.top }]}>{children}</View>;
}

/**
 * How much room the bottom of a scrolling tab screen needs below its last row.
 *
 * The tab bar plus whatever the hardware takes under it - the home indicator on iOS, the
 * gesture bar on Android.
 */
export function useTabBarClearance(): number {
  return useSafeAreaInsets().bottom + TAB_BAR_HEIGHT;
}

/**
 * The same, for a screen pushed over the tabs.
 *
 * There is no tab bar on those, so only the hardware inset applies - but it still does,
 * and a button flush against the home indicator is a button that swipes the app away.
 */
export function useBottomInset(extra = 0): number {
  return useSafeAreaInsets().bottom + extra;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
