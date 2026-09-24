/** SF Symbols for the iOS account and owner menus. */

import type { MenuAction } from '@expo/ui/community/menu';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { Account } from '../hosts/types';

export function everythingImage(): MenuAction['image'] {
  return 'person.2' as SFSymbol;
}

export function accountImage(_account: Account): MenuAction['image'] {
  return 'person.crop.circle' as SFSymbol;
}

/** A symbol takes the menu's own colour, so iOS never needs one. See the Android file. */
export function accountImageColor(_account: Account): MenuAction['imageColor'] {
  return undefined;
}

export function ownerImage(isPersonal: boolean): MenuAction['image'] {
  return (isPersonal ? 'person.crop.circle' : 'building.2') as SFSymbol;
}
