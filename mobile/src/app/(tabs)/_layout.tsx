/**
 * The tab bar, which is the platform's own rather than a JavaScript imitation.
 *
 * Four tabs, and the ceiling is five: Android's Material tab bar refuses more. Anything
 * further in - a repository, a pull request - is pushed onto the stack instead, which is
 * also what makes the back gesture behave the way people expect.
 */

import * as Haptics from 'expo-haptics';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { unstable_getMaterialSymbolSourceAsync, type AndroidSymbol } from 'expo-symbols';
import { Platform } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useNotifications } from '@/api/queries';
import { Palettes } from '@/theme/tokens';
import { useScheme } from '@/theme/use-palette';

/**
 * One icon, named for both platforms.
 *
 * iOS takes an SF Symbol by name. Android renders a Material Symbol into an image, which
 * is asynchronous, so the promise is made once at module load rather than on every render
 * - a fresh promise each time would have the tab bar re-decoding its icons as you tap.
 *
 * The colour passed to Android is white because the icon is used as a template: the tab
 * bar tints it selected or unselected itself, and a coloured source would fight that.
 */
function tabIcon(sf: SFSymbol, md: AndroidSymbol) {
  return Platform.OS === 'android'
    ? { src: unstable_getMaterialSymbolSourceAsync(md, 24, 'white') }
    : { sf };
}

const ICONS = {
  repositories: tabIcon('book.closed', 'book_2'),
  inbox: tabIcon('tray.full', 'inbox'),
  search: tabIcon('magnifyingglass', 'search'),
  settings: tabIcon('gearshape', 'settings'),
};

export default function TabLayout() {
  const scheme = useScheme();
  const palette = Palettes[scheme];
  const { data } = useNotifications();

  const unread = data?.items.filter((entry) => entry.item.isUnread).length ?? 0;

  return (
    <NativeTabs
      tintColor={palette.accent}
      // iOS 26 shrinks the bar to a pill as you scroll down and restores it on the way
      // back up, which is the system behaviour people already know from Safari and Mail.
      minimizeBehavior="onScrollDown"
      // Android only: keeps the bar above the keyboard instead of behind it.
      tabBarRespectsIMEInsets
      // A selection tick on every tab press, including a re-tap of the current tab - that
      // still does something, scrolling back to the top. iOS only, as everywhere else in
      // the app: Android's Material tab bar already gives its own press feedback.
      screenListeners={{
        tabPress: () => {
          if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
        },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon {...ICONS.repositories} />
        <NativeTabs.Trigger.Label>Repositories</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon {...ICONS.inbox} />
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        {/* An empty badge would show a bare dot, so the tab carries none at zero. */}
        {unread > 0 ? (
          <NativeTabs.Trigger.Badge>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon {...ICONS.settings} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* Last on purpose: iOS 26 can combine the system search tab with the native
          navigation search bar owned by this tab's nested stack. Other platforms keep
          the ordinary native tab and show their native search UI in the header. */}
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon {...ICONS.search} />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
