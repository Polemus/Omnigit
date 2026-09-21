/**
 * A pull-request patch presented like the ordinary code viewer.
 *
 * The forge gives us a unified diff rather than two complete files. Parsing its hunk
 * headers lets us restore the old and new line numbers while keeping the compact,
 * horizontally scrollable code layout that works on a phone.
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChangedFile } from '../hosts/types';
import { Fonts, Spacing, type Palette } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import {
  CATEGORY_TOKEN,
  grammarFor,
  highlightLine,
  initialState,
  type Span,
  type SyntaxState,
} from './syntax';

const MAX_LINES = 2000;

type DiffKind = 'added' | 'removed' | 'context' | 'hunk' | 'meta';

interface DiffLine {
  kind: DiffKind;
  marker: string;
  oldNumber?: number;
  newNumber?: number;
  spans: Span[];
}

export function DiffView({ file }: { file: ChangedFile }) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { lines, total, truncated } = useMemo(() => {
    const parsed = parsePatch(file.patch ?? '', file.path);
    return {
      lines: parsed.slice(0, MAX_LINES),
      total: parsed.length,
      truncated: parsed.length > MAX_LINES,
    };
  }, [file.patch, file.path]);

  const largestLine = lines.reduce(
    (largest, line) => Math.max(largest, line.oldNumber ?? 0, line.newNumber ?? 0),
    0
  );
  const gutterWidth = 10 + String(largestLine || 1).length * 8;

  return (
    <ScrollView
      style={styles.fill}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.vertical}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.horizontal}>
        {/* The visible width, as in `CodeView`: sideways the screen is inset from the
            notch, and rows the width of the whole window would scroll by that much. */}
        <View style={{ minWidth: width - insets.left - insets.right }}>
          {lines.map((line, index) => (
            <DiffRow
              key={index}
              line={line}
              gutterWidth={gutterWidth}
              palette={palette}
            />
          ))}
        </View>
      </ScrollView>

      {truncated ? (
        <Text selectable style={[styles.notice, { color: palette.textSecondary }]}>
          Showing the first {MAX_LINES.toLocaleString()} of {total.toLocaleString()} diff lines.
          Open the pull request on the site to read the rest.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function DiffRow({
  line,
  gutterWidth,
  palette,
}: {
  line: DiffLine;
  gutterWidth: number;
  palette: Palette;
}) {
  const background =
    line.kind === 'added'
      ? palette.addedSurface
      : line.kind === 'removed'
        ? palette.removedSurface
        : line.kind === 'hunk'
          ? palette.surfaceRaised
          : 'transparent';
  const markerColour =
    line.kind === 'added'
      ? palette.added
      : line.kind === 'removed'
        ? palette.removed
        : palette.textTertiary;

  return (
    <View style={[styles.row, { backgroundColor: background }]}>
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
        {line.oldNumber ?? ''}
      </Text>
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
        {line.newNumber ?? ''}
      </Text>
      <Text selectable style={[styles.marker, { color: markerColour }]}>
        {line.marker || ' '}
      </Text>
      <Text selectable style={styles.code}>
        {line.spans.length === 0
          ? ' '
          : line.spans.map((span, index) => (
              <Text
                key={index}
                style={{
                  color:
                    line.kind === 'hunk' || line.kind === 'meta'
                      ? palette.textTertiary
                      : palette[CATEGORY_TOKEN[span.category]],
                }}>
                {span.text}
              </Text>
            ))}
      </Text>
    </View>
  );
}

function parsePatch(patch: string, path: string): DiffLine[] {
  const grammar = grammarFor(path);
  let oldState: SyntaxState = { ...initialState };
  let newState: SyntaxState = { ...initialState };
  let oldNumber: number | undefined;
  let newNumber: number | undefined;

  return patch.replace(/\r\n/g, '\n').split('\n').map((raw): DiffLine => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[2]);
      oldState = { ...initialState };
      newState = { ...initialState };
      return { kind: 'hunk', marker: '', spans: [{ text: raw, category: 'plain' }] };
    }

    if (raw.startsWith('\\ ') || raw.startsWith('--- ') || raw.startsWith('+++ ')) {
      return { kind: 'meta', marker: '', spans: [{ text: raw, category: 'plain' }] };
    }

    const marker = raw.charAt(0);
    const source = marker === '+' || marker === '-' || marker === ' ' ? raw.slice(1) : raw;

    if (marker === '+') {
      const highlighted = highlightLine(source, grammar, newState);
      const line: DiffLine = {
        kind: 'added',
        marker,
        newNumber,
        spans: highlighted.spans,
      };
      newNumber = nextLine(newNumber);
      newState = highlighted.state;
      return line;
    }

    if (marker === '-') {
      const highlighted = highlightLine(source, grammar, oldState);
      const line: DiffLine = {
        kind: 'removed',
        marker,
        oldNumber,
        spans: highlighted.spans,
      };
      oldNumber = nextLine(oldNumber);
      oldState = highlighted.state;
      return line;
    }

    if (marker === ' ') {
      const oldHighlighted = highlightLine(source, grammar, oldState);
      const newHighlighted = highlightLine(source, grammar, newState);
      const line: DiffLine = {
        kind: 'context',
        marker: ' ',
        oldNumber,
        newNumber,
        spans: newHighlighted.spans,
      };
      oldNumber = nextLine(oldNumber);
      newNumber = nextLine(newNumber);
      oldState = oldHighlighted.state;
      newState = newHighlighted.state;
      return line;
    }

    return { kind: 'meta', marker: '', spans: [{ text: raw, category: 'plain' }] };
  });
}

function nextLine(line: number | undefined): number | undefined {
  return line === undefined ? undefined : line + 1;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  vertical: {
    paddingBottom: Spacing.four,
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
  marker: {
    width: 18,
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '700',
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    paddingRight: Spacing.three,
  },
  notice: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
