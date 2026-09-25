/**
 * Keeping content out from under the hardware and the system bars.
 *
 * Only the bottom, now that every tab has a native header of its own. A header holds
 * content below the status bar by itself - that is half of what it is for - so padding the
 * top here as well would push every list down by the height of the clock a second time.
 *
 * The bottom is the problem the header cannot solve. Both platforms float the tab bar over the
 * content - that is the look, and it is a good one - but the last row of a list has to be
 * able to scroll clear of it or it can never be tapped. Neither `NativeTabs` nor the
 * native list reports the bar's height, so the clearance is a constant. It is one number,
 * in one place, and erring generous only ever costs empty space at the end of a scroll.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigationPreferences } from '../state/navigation-preferences';
import { usePalette } from '../theme/use-palette';

/**
 * The floating tab bar's own height, without the home indicator underneath it.
 *
 * iOS 26's bar is a pill that sits above the safe area; Android's Material bar is taller
 * and sits on it. Measured from the two, and the one dial to turn if the last row of a
 * list still ends up behind the bar.
 */
const TAB_BAR_HEIGHT = Platform.select({ ios: 56, android: 72 }) ?? 56;

/**
 * The width a screen actually received from its navigator.
 *
 * In the ordinary tab layout that is the window width. In iOS Split View it is only the
 * secondary column, while `useWindowDimensions()` still reports the entire device. Native
 * rows with measured React Native content need the former or their content grows under the
 * sidebar and is clipped at both ends.
 */
const ContentWidthContext = createContext<number | undefined>(undefined);

/**
 * SwiftUI's inset grouped lists stop growing once a regular-width column becomes wide
 * enough to read comfortably. React Native content beside those lists does not know about
 * that limit, so it needs the same ceiling when Split View is using a wide detail column.
 */
const IOS_SPLIT_LIST_MAX_WIDTH = 540;
const LIST_HORIZONTAL_INSET = 32;

/**
 * Wraps a tab screen's content below its header.
 *
 * It fills, and that is all it does - the top inset it used to apply belongs to the header
 * now. Kept as a name rather than inlined so there is still one place to change if the
 * headers ever go again.
 */
export function TabScreen({ children }: { children: ReactNode }) {
  return <ContentWidthProvider>{children}</ContentWidthProvider>;
}

/** Measures the navigator column once and shares that width with every screen below it. */
export function ContentWidthProvider({ children }: { children: ReactNode }) {
  const [contentWidth, setContentWidth] = useState<number>();
  const measure = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setContentWidth((current) => (current === next ? current : next));
  }, []);

  return (
    <ContentWidthContext.Provider value={contentWidth}>
      <View style={styles.fill} onLayout={measure}>
        {children}
      </View>
    </ContentWidthContext.Provider>
  );
}

/** The current navigator column width, falling back to the window before first layout. */
export function useContentWidth(): number {
  const measured = useContext(ContentWidthContext);
  const { width: windowWidth } = useWindowDimensions();
  return measured ?? windowWidth;
}

/**
 * The outer width of an inset native list section in the current navigator column.
 *
 * On a phone-sized column the section keeps 16 points clear on either side. In a wide
 * iOS Split View detail column, SwiftUI additionally applies its readable-width ceiling;
 * matching that here keeps controls above the list and React Native islands inside the
 * list on the same leading edge and prevents either from disappearing below the sidebar.
 */
export function useNativeListFrameWidth(): number {
  const width = useContentWidth();
  const { splitViewEnabled } = useNavigationPreferences();
  const insetWidth = Math.max(1, width - LIST_HORIZONTAL_INSET);

  if (process.env.EXPO_OS === 'ios' && splitViewEnabled) {
    return Math.min(insetWidth, IOS_SPLIT_LIST_MAX_WIDTH);
  }

  return insetWidth;
}

/**
 * How much room the bottom of a scrolling destination needs below its last row.
 *
 * Ordinarily this is the tab bar plus whatever the hardware takes under it. The iOS Split
 * View experiment removes the tab bar, so its destinations keep only the home-indicator
 * inset instead of ending in a tab-bar-sized band of empty space.
 */
export function useTabBarClearance(): number {
  const { bottom } = useSafeAreaInsets();
  const { splitViewEnabled } = useNavigationPreferences();
  return bottom + (process.env.EXPO_OS === 'ios' && splitViewEnabled ? 0 : TAB_BAR_HEIGHT);
}

/**
 * Where a gesture handle stops and a bar of buttons starts.
 *
 * Android does not tell JavaScript which kind of navigation the phone is set to, so the
 * inset's own size stands in for it: the gesture handle asks for 24, sometimes less, and
 * the three buttons ask for 48.
 */
const BUTTON_BAR_MIN = 40;

/**
 * The room Android's navigation bar needs at the bottom of a screen pushed over the tabs -
 * the three buttons where the phone has them, nothing where it has gestures.
 *
 * Content is meant to run under a gesture handle: it is a thin line over the end of a list,
 * the system draws no scrim behind it, and that is the edge-to-edge look. Buttons are not
 * that. They are a strip 48 high that the system darkens behind, so a list whose last row
 * ends under them has a row nobody can read or tap - and on a screen pushed over the tabs
 * there is no tab bar standing on the inset to keep it clear, which is what makes this the
 * one place it has to be asked for. Tab screens already have `useTabBarClearance`.
 *
 * iOS gets nothing: its own safe area is the home indicator, which SwiftUI already keeps
 * its lists clear of.
 */
export function useNavigationBarInset(): number {
  const { bottom } = useSafeAreaInsets();
  if (process.env.EXPO_OS !== 'android') return 0;
  return bottom >= BUTTON_BAR_MIN ? bottom : 0;
}

/**
 * The room those buttons need, drawn in the colour a header is drawn in.
 *
 * Edge-to-edge is Android's own rule from 15 onwards, and under it an app cannot colour the
 * navigation bar: the window property that used to do it is ignored. What it can decide is
 * what lies behind the bar, and left alone that is the page - which is the grey a list sits
 * on, or in the dark theme plain black, neither of which is what the bar reads as part of.
 * A strip in `surface` puts the app's own chrome there instead, the same colour as the
 * header at the other end of the screen, so the buttons sit on the app rather than over it.
 *
 * It takes the room rather than padding it, so a screen puts this *after* its content and
 * lets the content fill what is left. Nothing on iOS, and nothing where the phone navigates
 * by gestures, where the handle is meant to float over the page.
 */
/**
 * What is left of the bottom inset once `NavigationBarStrip` has taken its share: the home
 * indicator on iOS, the gesture handle on Android, and nothing at all where the strip has
 * already reserved the room the three buttons need.
 *
 * A screen that draws the strip pads its content with this rather than with the whole
 * inset, or it keeps the same room twice and ends in a band of empty space.
 */
export function useBottomClearance(): number {
  return useSafeAreaInsets().bottom - useNavigationBarInset();
}

export function NavigationBarStrip() {
  const inset = useNavigationBarInset();
  const palette = usePalette();
  if (inset === 0) return null;
  return <View style={{ height: inset, backgroundColor: palette.surface }} />;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
