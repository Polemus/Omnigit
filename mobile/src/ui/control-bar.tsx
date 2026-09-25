/**
 * The controls pinned above a list, and the picker row that sits with them.
 *
 * Both came out of the repository screen, where the bar holds the view pills and the
 * branch picker. They live here so that anything else choosing *what a list shows* - the
 * account, on the tabs - is the same control rather than a lookalike that drifts.
 *
 * Pinned rather than scrolled away, because what it chooses applies to everything below:
 * the choice should stay in reach at the bottom of a long list, not only at the top.
 */

import {
  SegmentedControl,
  type SegmentedControlProps,
} from '@expo/ui/community/segmented-control';
import * as Haptics from 'expo-haptics';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Radius, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { GlassSurface } from './glass';
import { NativeMenuPicker, type NativeMenuPickerOption } from './native-menu-picker';
import { useNativeListFrameWidth } from './screen';
import { Text } from './scaled-text';

export function ControlBar({ children }: { children: ReactNode }) {
  const listFrameWidth = useNativeListFrameWidth();

  // Android's repository choices are individual pills that need the whole row in order
  // to wrap naturally. A surface around them would be a second, much larger pill behind
  // the real controls. iOS keeps the glass island around its native segmented control.
  if (process.env.EXPO_OS === 'android') {
    return <View style={styles.androidBar}>{children}</View>;
  }

  return (
    <GlassSurface variant="clear" style={[styles.bar, { width: listFrameWidth }]}>
      {children}
    </GlassSurface>
  );
}

export type MenuPickerOption = NativeMenuPickerOption;

/**
 * The platform's compact row used inside a control bar.
 *
 * iOS keeps its native segmented control. Android uses separate, content-sized pills: the
 * row fills the available width and `flexWrap` moves only the pills that no longer fit onto
 * the next line. That keeps every label whole at every app text size without a wide backing
 * container or horizontal scrolling.
 */
export function ControlBarSegments({ fillWidth, ...props }: ControlBarSegmentsProps) {
  if (process.env.EXPO_OS !== 'android') return <SegmentedControl {...props} />;

  return <AndroidControlBarSegments {...props} fillWidth={fillWidth} />;
}

export type ControlBarSegmentsProps = SegmentedControlProps & {
  /** Give every Android pill an equal share of the row. */
  fillWidth?: boolean;
};

function AndroidControlBarSegments({
  values = [],
  selectedIndex = 0,
  enabled = true,
  style,
  testID,
  onChange,
  onValueChange,
  fillWidth = false,
}: ControlBarSegmentsProps) {
  const palette = usePalette();

  return (
    <View testID={testID} style={[styles.androidPills, style]}>
      {values.map((value, index) => {
        const selected = index === selectedIndex;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ disabled: !enabled, selected }}
            disabled={!enabled}
            android_ripple={{ color: palette.accentMuted }}
            onPress={() => {
              onChange?.({ nativeEvent: { selectedSegmentIndex: index, value } });
              onValueChange?.(value);
            }}
            style={({ pressed }) => [
              styles.androidPill,
              fillWidth && styles.androidPillFill,
              {
                backgroundColor: selected ? palette.accentMuted : palette.surface,
                borderColor: selected ? palette.accent : palette.separator,
              },
              pressed && styles.androidPillPressed,
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.androidPillText,
                { color: selected ? palette.accent : palette.textSecondary },
              ]}>
              {value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
  symbol,
  tint,
  label,
  options,
  selected,
  onSelect,
}: {
  /**
   * The glyph, named per platform.
   *
   * `SymbolView` rather than the app's own `Icon`: on iOS this row lives inside a
   * `GlassSurface`, where a nested native host would break the effect, and on Android the
   * row stands on its own. `SymbolView` works in both places without another host.
   */
  symbol: { ios: SFSymbol; android: AndroidSymbol };
  /** The glyph's colour. Defaults to the label's, which is what a quiet row wants. */
  tint?: string;
  label: string;
  options: MenuPickerOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const palette = usePalette();
  const [pickerExpanded, setPickerExpanded] = useState(false);

  return (
    <View
      style={[
        styles.row,
        process.env.EXPO_OS === 'android' && styles.androidPickerRow,
        process.env.EXPO_OS === 'android' && {
          backgroundColor: pickerExpanded ? palette.surface : 'transparent',
          borderColor: palette.separator,
        },
      ]}>
      <SymbolView name={symbol} size={16} tintColor={tint ?? palette.textSecondary} />
      <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
      <NativeMenuPicker
        options={options}
        selected={selected}
        onExpandedChange={setPickerExpanded}
        onValueChange={(value) => {
          // The tick belongs to the choosing, so every picker in a bar gives it the same
          // way rather than each caller remembering to.
          if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
          onSelect(value);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: 'flex-start',
    marginLeft: Spacing.four,
    marginVertical: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  androidBar: {
    width: 'auto',
    marginHorizontal: Spacing.two,
    marginVertical: Spacing.three,
    gap: Spacing.two,
  },
  androidPills: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  androidPill: {
    minHeight: 38,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  androidPillFill: {
    minWidth: 0,
    flexBasis: 0,
    flexGrow: 1,
  },
  androidPillPressed: {
    opacity: 0.78,
  },
  androidPillText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
    paddingHorizontal: Spacing.two,
  },
  androidPickerRow: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
