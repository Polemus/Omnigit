/**
 * The header's "more" menu as a React element, for platforms that need one.
 *
 * Only Android does: iOS gets the system's own bar-button menu from
 * `unstable_headerRightItems` (see `header-menu.ts`), which Android never reads. This file
 * is iOS's and web's, and draws nothing; `header-menu-button.android.tsx` is the menu.
 */

import type { HeaderAction } from './header-menu';

export function HeaderMenuButton(_props: { actions: HeaderAction[] }) {
  return null;
}
