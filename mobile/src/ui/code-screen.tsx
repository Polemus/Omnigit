/**
 * The body of a screen that shows code - the file viewer and the two diff screens - which
 * are the screens that may turn sideways (`rotation.ts`).
 *
 * Sideways, a phone's notch or Dynamic Island sits at one end of every line, and Android's
 * camera cutout does the same. The header keeps clear of it by itself; the path bar and the
 * code below it do not, so the body is inset from both sides by the safe area - which is
 * nothing at all when the phone is upright. `CodeView` and `DiffView` size their full-width
 * rows to match.
 *
 * Sideways is also the only time there is room beside the code, and each of these screens
 * puts a tree of files there: the file viewer the repository's, the diff screens the
 * change's own. The frame, its width and the button that shows and hides it are here, so
 * the three cannot come to disagree about any of them; which tree goes in it is the
 * screen's business. Upright, the screen is what it always was.
 */

import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFileTreeVisible } from '../state/preferences';
import { NavigationBarStrip } from './screen';
import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Host } from './host';
import { Icon } from './icon';
import { Icons } from './icons';

export interface CodeSidebar {
  /** Sideways: there is room beside the code, so the toggle shows. */
  available: boolean;
  /** Sideways, and not hidden by hand. */
  shown: boolean;
  toggle: () => void;
}

/**
 * Whether a code screen's sidebar has room and is showing, and the toggle for its button.
 * The choice is one for every code screen, and remembered (`useFileTreeVisible`).
 */
export function useCodeSidebar(): CodeSidebar {
  const { width, height } = useWindowDimensions();
  const [visible, toggleVisible] = useFileTreeVisible();
  const available = width > height;

  return {
    available,
    shown: available && visible,
    toggle: () => {
      if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
      toggleVisible();
    },
  };
}

export function CodeScreenBody({
  children,
  sidebar,
}: {
  children: ReactNode;
  /** The tree to draw beside the code - given only while `useCodeSidebar` says it shows. */
  sidebar?: ReactNode;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();

  // About a third of the screen, within bounds: narrower and names are all ellipsis, wider
  // and it is eating the line length that turning the phone was for.
  const sidebarWidth = Math.round(Math.min(300, Math.max(220, width * 0.3)));

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.fill}>
      <View style={styles.split}>
        {sidebar ? (
          <View
            style={[
              styles.sidebar,
              {
                width: sidebarWidth,
                backgroundColor: palette.surface,
                borderRightColor: palette.separator,
              },
            ]}>
            {sidebar}
          </View>
        ) : null}
        <View style={styles.fill}>{children}</View>
      </View>
      {/* Code runs to the bottom of the screen here, so the strip is what keeps it from
          running under the navigation buttons - and what puts the app's own colour behind
          them, as every other screen does. */}
      <NavigationBarStrip />
    </SafeAreaView>
  );
}

/**
 * The button at the start of a path bar that shows and hides the sidebar - there, rather
 * than in the header, because header bar items are iOS-only. Nothing at all upright, where
 * there is no sidebar to show.
 */
export function SidebarToggle({ sidebar }: { sidebar: CodeSidebar }) {
  const palette = usePalette();
  if (!sidebar.available) return null;

  return (
    <Pressable
      onPress={sidebar.toggle}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={sidebar.shown ? 'Hide files' : 'Show files'}
      accessibilityState={{ selected: sidebar.shown }}
      style={({ pressed }) => [
        styles.toggle,
        sidebar.shown || pressed ? { backgroundColor: palette.accentMuted } : null,
      ]}>
      <View pointerEvents="none">
        <Host matchContents>
          <Icon name={Icons.sidebar} size={17} />
        </Host>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  toggle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.two,
  },
});
