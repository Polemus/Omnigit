/**
 * Android status dot rendered inside the surrounding Compose tree.
 *
 * A React Native `View` cannot be placed directly in a Compose `ListItem` slot. Using
 * Material's own badge keeps the accessory in one native layout system and avoids the
 * crash that occurred when the Updates row switched from an icon to a React Native dot.
 */

import { Badge } from '@expo/ui/jetpack-compose';
import { size } from '@expo/ui/jetpack-compose/modifiers';

export function StatusDot({ color }: { color: string }) {
  return <Badge containerColor={color} modifiers={[size(9, 9)]} />;
}
