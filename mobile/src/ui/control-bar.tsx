/**
 * The glass bar pinned above a list, and the picker row that sits in it.
 *
 * Both came out of the repository screen, where the bar holds the view pills and the
 * branch picker. They live here so that anything else choosing *what a list shows* - the
 * account, on the tabs - is the same control rather than a lookalike that drifts.
 *
 * Pinned rather than scrolled away, because what it chooses applies to everything below:
 * the choice should stay in reach at the bottom of a long list, not only at the top.
 */

import { Host, Picker } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { GlassSurface } from './glass';
import { Icon } from './icon';
import type { IconName } from './icons';

export function ControlBar({ children }: { children: ReactNode }) {
  return (
    <GlassSurface variant="clear" style={styles.bar}>
      {children}
    </GlassSurface>
  );
}

export interface MenuPickerOption {
  label: string;
  value: string;
}

/**
 * A labelled native menu picker: an icon, what is being chosen, and the platform's own
 * picker showing the current choice - SwiftUI's menu picker on iOS, a Compose dropdown on
 * Android, with a checkmark against the current option when opened.
 *
 * A menu rather than pills because the options can be many - dozens of branches, several
 * accounts - and a menu scrolls where a segmented control needs a segment each.
 *
 * The picker's host is sized by the row rather than by its content (`vertical` only), so a
 * long option - `feature/…`, or an account on a long host name - is truncated inside the
 * bar instead of pushing it wider than the phone: the same trap as an unbounded row inside
 * `RNHostView`.
 */
export function MenuPickerRow({
  icon,
  label,
  options,
  selected,
  onSelect,
}: {
  icon: IconName;
  label: string;
  options: MenuPickerOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const palette = usePalette();

  return (
    <View style={styles.row}>
      <Host matchContents>
        <Icon name={icon} size={16} />
      </Host>
      <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
      <Host matchContents={{ vertical: true }} style={styles.picker}>
        <Picker
          selectedValue={selected}
          onValueChange={(value) => {
            // The tick belongs to the choosing, so every picker in a bar gives it the same
            // way rather than each caller remembering to.
            if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
            onSelect(value);
          }}
          appearance="menu">
          {options.map((option) => (
            <Picker.Item key={option.value} label={option.label} value={option.value} />
          ))}
        </Picker>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: Spacing.four,
    marginVertical: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
    paddingHorizontal: Spacing.two,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  picker: {
    flex: 1,
    minHeight: 28,
    justifyContent: 'center',
  },
});
