/**
 * A file, coloured and numbered - drawn with the same metrics as `DiffView`.
 *
 * The two viewers are one family and should read as one: same row height, same gutter
 * type and divider, same code size, rows that run the full width of the screen, text you
 * can select. The values below are `diff.tsx`'s, not near-misses of them, and the code
 * column starts where the diff's does - after a gap the width of its +/- marker column -
 * so moving from a changed file to the whole file does not shift anything.
 *
 * Scrolls in both directions and never wraps. Wrapping destroys the indentation that
 * carries a file's structure, which is most of what makes it skimmable on a phone.
 *
 * Long files are cut rather than rendered whole. Every line is React elements, and a
 * twenty-thousand-line file would lock the interface for seconds.
 */

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, Spacing, type Palette } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { CATEGORY_TOKEN, grammarFor, highlightSource, type Span } from './syntax';

/** Past this, the file is cut and the reader told. Matches `DiffView`. */
const MAX_LINES = 2000;

/** The diff's marker column, so code starts at the same place in both viewers. */
const MARKER_WIDTH = 18;

export interface CodeViewProps {
  source: string;
  /** Used to pick the grammar, so it wants the real path rather than just a name. */
  path: string;
}

/**
 * A file's lines, without the phantom empty one after a final newline.
 *
 * Nearly every source file ends in a newline, and splitting on it leaves an empty last
 * "line" that no editor numbers. Exported so the screen's line count agrees with the
 * gutter.
 */
export function sourceLines(source: string): string[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function CodeView({ source, path }: CodeViewProps) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The width the code actually has - less than the screen's beside the file tree, or
  // clear of the notch when sideways. Until the first layout, the screen's own width
  // less the side insets, which is the answer whenever the code has the screen to itself.
  const [viewport, setViewport] = useState(0);

  // The one place this departs from `DiffView`. `contentInsetAdjustmentBehavior` keeps
  // the last line clear of the home indicator on iOS, but it is iOS-only - and with
  // edge-to-edge on, Android draws the end of a long file under the gesture bar. So
  // Android adds the inset itself; iOS must not, or the automatic one would double it.
  const bottomPadding = Spacing.four + (process.env.EXPO_OS === 'android' ? insets.bottom : 0);

  // Highlighting is pure work over the whole file, so it happens once per file rather
  // than on every scroll frame.
  const { lines, truncated, total } = useMemo(() => {
    const all = sourceLines(source);
    return {
      lines: highlightSource(all.slice(0, MAX_LINES), grammarFor(path)),
      truncated: all.length > MAX_LINES,
      total: all.length,
    };
  }, [source, path]);

  // Wide enough for the longest line number, by the diff's own formula, so the code does
  // not shift as it scrolls past line 99 or 999.
  const gutterWidth = 10 + String(lines.length || 1).length * 8;

  return (
    <ScrollView
      style={styles.fill}
      onLayout={(event) => setViewport(event.nativeEvent.layout.width)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: bottomPadding }}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.horizontal}>
        {/* At least the visible width, so a short file still has full-width rows rather
            than a gutter that stops halfway across. Visible, not the window's: rows as wide
            as the whole window would scroll sideways by whatever the notch or the file
            tree takes. */}
        <View style={{ minWidth: viewport || width - insets.left - insets.right }}>
          {lines.map((spans, index) => (
            <CodeRow
              key={index}
              number={index + 1}
              spans={spans}
              gutterWidth={gutterWidth}
              palette={palette}
            />
          ))}
        </View>
      </ScrollView>

      {truncated ? (
        <Text selectable style={[styles.notice, { color: palette.textSecondary }]}>
          Showing the first {MAX_LINES.toLocaleString()} of {total.toLocaleString()} lines.
          Open the file on the site to read the rest.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function CodeRow({
  number,
  spans,
  gutterWidth,
  palette,
}: {
  number: number;
  spans: Span[];
  gutterWidth: number;
  palette: Palette;
}) {
  return (
    <View style={styles.row}>
      <Text
        selectable
        style={[
          styles.gutter,
          {
            width: gutterWidth,
            color: palette.textTertiary,
            borderRightColor: palette.separator,
          },
        ]}>
        {number}
      </Text>
      <Text selectable style={styles.code}>
        {spans.length === 0
          ? ' '
          : spans.map((span, index) => (
              <Text key={index} style={{ color: palette[CATEGORY_TOKEN[span.category]] }}>
                {span.text}
              </Text>
            ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  horizontal: {
    paddingRight: Spacing.five,
  },
  row: {
    minHeight: 18,
    flexDirection: 'row',
  },
  gutter: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    lineHeight: 18,
    textAlign: 'right',
    paddingRight: Spacing.one,
    borderRightWidth: StyleSheet.hairlineWidth,
    fontVariant: ['tabular-nums'],
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: MARKER_WIDTH,
    paddingRight: Spacing.three,
  },
  notice: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
