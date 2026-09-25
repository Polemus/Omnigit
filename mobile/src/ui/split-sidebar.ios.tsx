/** The native SwiftUI sidebar shown by the experimental iOS Split View. */

import { Button, Label, List } from '@expo/ui/swift-ui';
import {
  badge,
  buttonStyle,
  listStyle,
  navigationTitle,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useNotifications } from '../api/queries';
import { useUpdateWaiting } from '../api/updates';
import { usePalette } from '../theme/use-palette';
import { Host } from './host';

export type SplitDestination = '/' | '/inbox' | '/search' | '/settings';

interface SidebarItem {
  destination: SplitDestination;
  icon: SFSymbol;
  label: string;
}

const ITEMS: SidebarItem[] = [
  { destination: '/', icon: 'book.closed', label: 'Repositories' },
  { destination: '/inbox', icon: 'tray.full', label: 'Inbox' },
  { destination: '/search', icon: 'magnifyingglass', label: 'Search' },
  { destination: '/settings', icon: 'gearshape', label: 'Settings' },
];

const SETTINGS_PATHS = [
  '/settings',
  '/account',
  '/sign-in',
  '/display',
  '/text-size',
  '/app-lock',
  '/updates',
];

export function SplitSidebar({ onSelect }: { onSelect: (to: SplitDestination) => void }) {
  const pathname = usePathname();
  const palette = usePalette();
  const { data } = useNotifications();
  const updateWaiting = useUpdateWaiting();
  const selected = destinationForPath(pathname);
  const unread = data?.items.filter((entry) => entry.item.isUnread).length ?? 0;

  return (
    <Host style={{ flex: 1 }}>
      <List
        selection={[selected]}
        modifiers={[listStyle('sidebar'), navigationTitle('Omnigit'), tint(palette.accent)]}>
        {ITEMS.map((item) => {
          const count =
            item.destination === '/inbox' && unread > 0
              ? unread > 99
                ? '99+'
                : String(unread)
              : item.destination === '/settings' && updateWaiting
                ? '1'
                : undefined;

          return (
            <Button
              key={item.destination}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelect(item.destination);
              }}
              modifiers={[
                buttonStyle('plain'),
                tag(item.destination),
                ...(count ? [badge(count)] : []),
              ]}>
              <Label title={item.label} systemImage={item.icon} />
            </Button>
          );
        })}
      </List>
    </Host>
  );
}

function destinationForPath(pathname: string): SplitDestination {
  if (pathname === '/inbox' || pathname.startsWith('/inbox/')) return '/inbox';
  if (pathname === '/search' || pathname.startsWith('/search/')) return '/search';
  if (SETTINGS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return '/settings';
  }
  return '/';
}
