/**
 * Android: `@expo/ui`'s own row, replaced rather than updated when it starts or stops taking
 * taps.
 *
 * The row hands Compose its tap handler as a `clickable` modifier, and sends no `modifiers`
 * prop at all when there is no handler (`itemModifiers.length ? itemModifiers : undefined`).
 * So a row whose `onPress` goes away - the Updates screen's button row while it is busy, an
 * inbox row whose account has gone - has the prop *removed*, which React Native delivers to
 * native as `null`. The Kotlin side declares the list non-nullable and refuses the whole
 * update: "Cannot set prop 'modifiers' on view ComposeFunctionHolder ... Could not cast
 * dynamic value to ReadableMap". That is logged as an error, and it leaves the old handler
 * attached, so the row goes on answering taps it should have stopped answering.
 *
 * A row made without a handler never has the prop removed. So each row is keyed by whether
 * it can be pressed, and a change in that makes a new row. Every other universal component
 * sends an empty list rather than nothing (`transformToModifiers`), which is why only this
 * one needs it.
 *
 * Inside a section the row is also the card: `FieldGroup` (`field-group.android.tsx`) draws
 * the rounded shape and leaves filling it to the row, so a row there paints itself in the
 * card's colour rather than Material's `surface` - which is what made it a box inside the
 * card instead of the card.
 */

import { ListItem as UniversalListItem, type ListItemProps } from '@expo/ui';
import { useMaterialColors } from '@expo/ui/jetpack-compose';

import { useDisplayPreferences } from '../state/display-preferences';
import { useSectionRow } from './field-group';
import { Text } from './text';

function ListItemRow({ children, supportingText, ...props }: ListItemProps) {
  const { boldText } = useDisplayPreferences();
  const row = useSectionRow();
  const { surfaceContainer } = useMaterialColors();
  const colors = row ? { containerColor: surfaceContainer, ...props.colors } : props.colors;
  return (
    <UniversalListItem
      key={props.onPress ? 'pressable' : 'plain'}
      {...props}
      colors={colors}
      supportingText={
        boldText && typeof supportingText === 'string' ? (
          <Text textStyle={{ fontWeight: '700' }}>{supportingText}</Text>
        ) : (
          supportingText
        )
      }>
      {boldText && typeof children === 'string' ? (
        <Text textStyle={{ fontWeight: '700' }}>{children}</Text>
      ) : (
        children
      )}
    </UniversalListItem>
  );
}

// The slots are the universal ones, unchanged: `ListItem` finds them by identity.
export const ListItem = Object.assign(ListItemRow, {
  Leading: UniversalListItem.Leading,
  Trailing: UniversalListItem.Trailing,
  Supporting: UniversalListItem.Supporting,
});
