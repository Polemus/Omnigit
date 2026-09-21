/**
 * The "..." menu in a native header, on both platforms.
 *
 * On iOS it is `unstable_headerRightItems`: real `UIBarButtonItem`s in the navigation bar,
 * so the menu is the system's - the right animation, the right blur, and on iOS 26 the
 * right glass. That option is iOS-only, though: Android never reads it, so on Android these
 * menus - copy, open on the site - did not appear at all. There the same actions go into
 * `headerRight` as Material's own overflow button and dropdown
 * (`header-menu-button.android.tsx`), which is just as much that platform's.
 *
 * A screen declares its actions once and spreads the result into its options:
 * `options={{ title, ...headerMenu([...]) }}`.
 */

import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationOptions } from 'expo-router';
import { createElement } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

import { HeaderMenuButton } from './header-menu-button';

export interface HeaderAction {
  label: string;
  /** Shown beside the label on iOS. Android's overflow menu is text only. */
  sf?: SFSymbol;
  onPress: () => void;
  /** Reads as destructive where the platform has a way to say so. */
  destructive?: boolean;
  disabled?: boolean;
  /**
   * `none` for an action that confirms itself - a copy that buzzes with a success haptic
   * once it has landed - so the menu's own tick does not stack on top of it. Everything
   * else gets the tick, which is the only way to say "chosen" for an action whose effect
   * happens elsewhere, like opening the browser.
   */
  feedback?: 'selection' | 'none';
}

/**
 * The tick for choosing a menu item.
 *
 * Fired on the item rather than on the "..." button because the button has nothing to
 * hang it on: a native menu item in the header exposes no open or press callback, only
 * `onPress` on the actions inside. iOS only, as everywhere else in the app - Android's
 * native menus already give their own press feedback.
 */
function tick(action: HeaderAction) {
  if (action.feedback === 'none') return;
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
}

/**
 * One overflow menu holding every action.
 *
 * A menu rather than a row of buttons: a header has room for perhaps two, and which two
 * differ per screen, so a single predictable "..." beats a bar that reshuffles itself.
 * Actions that are disabled are left out rather than greyed, and with none left there is
 * no menu at all.
 */
export function headerMenu(
  actions: HeaderAction[]
): Pick<NativeStackNavigationOptions, 'unstable_headerRightItems' | 'headerRight'> {
  const usable = actions.filter((action) => !action.disabled);
  if (usable.length === 0) return { unstable_headerRightItems: () => [] };

  return {
    unstable_headerRightItems: () => [
      {
        type: 'menu',
        label: 'More',
        icon: { type: 'sfSymbol', name: 'ellipsis.circle' },
        accessibilityLabel: 'More actions',
        menu: {
          items: usable.map((action) => ({
            type: 'action' as const,
            label: action.label,
            onPress: () => {
              tick(action);
              action.onPress();
            },
            ...(action.sf ? { icon: { type: 'sfSymbol' as const, name: action.sf } } : {}),
            ...(action.destructive ? { attributes: { destructive: true } } : {}),
          })),
        },
      },
    ],
    // Android only, so iOS is exactly as it was: there `unstable_headerRightItems`
    // overrides `headerRight` anyway, but not setting it leaves nothing to reason about.
    ...(process.env.EXPO_OS === 'android'
      ? { headerRight: () => createElement(HeaderMenuButton, { actions: usable }) }
      : {}),
  };
}
