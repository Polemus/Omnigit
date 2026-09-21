/**
 * iOS: a plain string under the headline is drawn here, in SwiftUI's secondary grey.
 *
 * `ListItem` colours that line itself by naming `secondaryLabel`, which native cannot parse
 * from a bare string, so on every version the second line came out in the headline's
 * colour. See `swiftui-colour.ts`. Anything that is not a string - `ListItem.Supporting`
 * with a row's own content, `ChangeText` - is left exactly as it was.
 */

import { ListItem as UniversalListItem, type ListItemProps } from '@expo/ui';
import { Text } from '@expo/ui/swift-ui';

import { secondaryForeground } from './swiftui-colour';

function ListItemRow({ supportingText, ...props }: ListItemProps) {
  return (
    <UniversalListItem
      {...props}
      supportingText={
        typeof supportingText === 'string' ? (
          <Text modifiers={[secondaryForeground]}>{supportingText}</Text>
        ) : (
          supportingText
        )
      }
    />
  );
}

// The slots are the universal ones, unchanged: `ListItem` finds them by identity.
export const ListItem = Object.assign(ListItemRow, {
  Leading: UniversalListItem.Leading,
  Trailing: UniversalListItem.Trailing,
  Supporting: UniversalListItem.Supporting,
});
