/**
 * The cross-platform native menu used at the end of a labelled picker row.
 *
 * iOS replaces this file with `native-menu-picker.ios.tsx`, where the underlying SwiftUI
 * picker can be told to fill its proposed width. Android and web use the universal picker.
 */

import { Picker } from '@expo/ui';
import { StyleSheet } from 'react-native';

import { Host } from './host';

export interface NativeMenuPickerOption {
  label: string;
  value: string;
}

export interface NativeMenuPickerProps {
  options: NativeMenuPickerOption[];
  selected: string;
  onValueChange: (value: string) => void;
  /** Reports the open state on platforms whose native menu exposes it. */
  onExpandedChange?: (expanded: boolean) => void;
}

export function NativeMenuPicker({
  options,
  selected,
  onValueChange,
}: NativeMenuPickerProps) {
  return (
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <Picker selectedValue={selected} onValueChange={onValueChange} appearance="menu">
        {options.map((option) => (
          <Picker.Item key={option.value} label={option.label} value={option.value} />
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    minHeight: 28,
    justifyContent: 'center',
  },
});
