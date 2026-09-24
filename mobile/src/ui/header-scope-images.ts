/** Android menu images for the account and owner header controls. */

import type { MenuAction } from '@expo/ui/community/menu';

import type { Account } from '../hosts/types';

export function everythingImage(): MenuAction['image'] {
  return require('@expo/material-symbols/groups.xml');
}

export function accountImage(account: Account): MenuAction['image'] {
  return account.avatarUrl
    ? { uri: account.avatarUrl }
    : require('@expo/material-symbols/account_circle.xml');
}

// The menu's type allows a colour or nothing; the `Icon` beneath it reads `null` as "no tint",
// which is the only way to leave a photo as it is.
const NO_TINT = null as unknown as MenuAction['imageColor'];

/**
 * How an account's image is coloured: not at all, when it is a photo.
 *
 * The Android menu draws every image with `@expo/ui`'s Compose `Icon`, which paints whatever
 * it draws in the text colour unless its tint is explicitly `null` - and the menu always
 * passes `imageColor` through as that tint. Left unset, each avatar downloaded perfectly and
 * then came out as a grey square. The glyph an account without a photo falls back to is a
 * vector, and takes the tint like every other icon in the menu.
 */
export function accountImageColor(account: Account): MenuAction['imageColor'] {
  return account.avatarUrl ? NO_TINT : undefined;
}

export function ownerImage(isPersonal: boolean): MenuAction['image'] {
  return isPersonal
    ? require('@expo/material-symbols/account_circle.xml')
    : require('@expo/material-symbols/corporate_fare.xml');
}
