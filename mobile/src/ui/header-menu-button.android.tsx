/**
 * Android: the header's "more" menu - Material's overflow button and dropdown, from
 * @expo/ui's Jetpack Compose layer, holding the same actions iOS shows in its bar menu.
 *
 * The menu is Compose's own `DropdownMenu`: its position, animation, elevation and
 * dismissal are the platform's rather than a lookalike's. It is controlled - open exactly
 * while `expanded` - so the ⋮ button opens it, and choosing an item or tapping outside
 * closes it. Items are text only, as Android's overflow menus conventionally are.
 */

import { DropdownMenu, DropdownMenuItem, Host, IconButton, Text } from '@expo/ui/jetpack-compose';
import { useState } from 'react';

import { usePalette } from '../theme/use-palette';
import type { HeaderAction } from './header-menu';
import { Icon } from './icon';
import { Icons } from './icons';

export function HeaderMenuButton({ actions }: { actions: HeaderAction[] }) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);

  return (
    <Host matchContents>
      <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
        <DropdownMenu.Trigger>
          <IconButton onClick={() => setOpen(true)}>
            <Icon name={Icons.more} size={24} accessibilityLabel="More actions" />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              elementColors={action.destructive ? { textColor: palette.danger } : undefined}
              onClick={() => {
                // Closed first, so whatever the action opens - the browser, a sheet - is
                // not drawn under a menu still on its way out.
                setOpen(false);
                action.onPress();
              }}>
              <DropdownMenuItem.Text>
                <Text>{action.label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
