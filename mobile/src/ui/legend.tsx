/**
 * The row between a path bar and what it names: a label over each gutter the view below has
 * - `line`, or `old` and `new` - then what the file is, and at the end a switch where the
 * file can be seen two ways.
 *
 * The file viewer and both diff screens draw it, so a whole file, a changed file and a
 * picture read as three views of one thing, and a switch sits in the same place on each.
 */

import { SegmentedControl } from '@expo/ui/community/segmented-control';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { useHostScheme } from './host';
import { Text } from './scaled-text';

export function Legend({
  gutters = [],
  detail,
  trailing,
}: {
  /** One label per gutter, lined up over them: `['line']`, `['old', 'new']`. */
  gutters?: string[];
  detail: string;
  /** A `ViewSwitch`, for a file that has two views. */
  trailing?: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.legend, trailing ? styles.withSwitch : null]}>
      {gutters.map((gutter) => (
        <Text key={gutter} style={[styles.gutter, { color: palette.textTertiary }]}>
          {gutter}
        </Text>
      ))}
      <Text numberOfLines={1} style={[styles.detail, { color: palette.textSecondary }]}>
        {detail}
      </Text>
      {trailing}
    </View>
  );
}

/**
 * Two ways to see one file - Preview and Source, Preview and Diff - as the platform's own
 * segmented control, as the repository screen's view switcher is. In the legend rather
 * than the header, because it is about the file under it, and header bar items are
 * iOS-only.
 */
export function ViewSwitch({
  labels,
  second,
  onChange,
}: {
  labels: [string, string];
  /** Whether the second view is the one showing. */
  second: boolean;
  onChange: (second: boolean) => void;
}) {
  const palette = usePalette();
  const hostScheme = useHostScheme();
  return (
    <SegmentedControl
      values={labels}
      selectedIndex={second ? 1 : 0}
      onValueChange={(value) => {
        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
        onChange(value === labels[1]);
      }}
      tintColor={palette.accent}
      appearance={hostScheme}
      style={styles.switch}
    />
  );
}

// The values the diff's gutters and the code viewer's are drawn with, so the labels sit
// over them exactly.
const styles = StyleSheet.create({
  legend: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  withSwitch: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.three,
  },
  gutter: {
    width: 24,
    fontSize: 9,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  detail: {
    flex: 1,
    paddingLeft: Spacing.two,
    fontSize: 11,
  },
  switch: {
    width: 176,
  },
});
