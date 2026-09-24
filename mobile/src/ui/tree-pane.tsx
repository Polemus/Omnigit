/**
 * What the two sidebar trees share - the repository's beside a file (`file-tree.tsx`) and a
 * change's beside a diff (`changed-file-tree.tsx`) - so they cannot drift into looking like
 * two different things.
 *
 * A two-line heading over a virtualised list of compact, fixed-height rows: chevron, icon,
 * name, indented by depth. Compact because a phone on its side is short - the repository
 * screen's grouped rows fit about seven in that height, these fit about twelve. Fixed-height
 * so a long list costs only what is on screen, and so the row being read can be scrolled to
 * by index.
 */

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Host } from './host';
import { Icon } from './icon';
import { Icons, type IconName } from './icons';
import { Text } from './scaled-text';

const ROW_HEIGHT = 30;
const INDENT = 14;

export function TreePane<Row>({
  heading,
  detail,
  rows,
  rowKey,
  renderRow,
  currentIndex,
}: {
  heading: string;
  /** The line under the heading: a string, or `Text` runs where part of it is coloured. */
  detail: ReactNode;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  renderRow: (row: Row) => ReactElement;
  /** Where the row being read is, or -1 while it is not there yet. */
  currentIndex: number;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Row>>(null);
  const revealed = useRef(false);

  // Scrolled to once, when its row first exists: after that, the file changes by a tap on
  // a row already in view, and jumping the list under the finger would lose the place.
  useEffect(() => {
    if (revealed.current || currentIndex < 0) return;
    revealed.current = true;
    listRef.current?.scrollToIndex({ index: currentIndex, viewPosition: 0.35, animated: false });
  }, [currentIndex]);

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { borderBottomColor: palette.separator }]}>
        <Text numberOfLines={1} style={[styles.heading, { color: palette.textSecondary }]}>
          {heading}
        </Text>
        <Text numberOfLines={1} style={[styles.detail, { color: palette.textTertiary }]}>
          {detail}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={rowKey}
        renderItem={({ item }) => renderRow(item)}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        onScrollToIndexFailed={() => {}}
        initialNumToRender={24}
        windowSize={7}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: Spacing.one,
          // As in `CodeView`: iOS clears the home indicator by itself; Android's edge-to-edge
          // needs the inset added.
          paddingBottom: Spacing.two + (process.env.EXPO_OS === 'android' ? insets.bottom : 0),
        }}
      />
    </View>
  );
}

/** A file or a folder: a chevron if it is a folder, its icon, its name, and anything after. */
export function TreeItem({
  depth,
  name,
  icon,
  open,
  selected = false,
  struck = false,
  trailing,
  accessibilityLabel,
  onPress,
}: {
  depth: number;
  name: string;
  icon: IconName;
  /** Whether a folder is open. Left out for a file, which is what makes it one. */
  open?: boolean;
  /** The file being read. */
  selected?: boolean;
  /** Struck through, as VS Code draws a file the change deletes. */
  struck?: boolean;
  /** At the end of the row: the changed-file tree's status letter. */
  trailing?: ReactNode;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  const isFolder = open !== undefined;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      accessibilityState={isFolder ? { expanded: open } : { selected }}
      style={({ pressed }) => [
        styles.row,
        indent(depth),
        selected
          ? { backgroundColor: palette.accentMuted }
          : pressed
            ? { backgroundColor: palette.separator }
            : null,
      ]}>
      {/* Native icons inside a React Native row. `pointerEvents` keeps their hosts from
          taking the touch, so the whole row stays one target. */}
      <View style={styles.chevron} pointerEvents="none">
        {isFolder ? (
          <Host matchContents>
            <Icon name={open ? Icons.chevronDown : Icons.chevron} size={10} />
          </Host>
        ) : null}
      </View>
      <View pointerEvents="none">
        <Host matchContents>
          <Icon name={icon} size={15} />
        </Host>
      </View>
      <Text
        numberOfLines={1}
        // The middle, not the end, for files: the extension says what a file is, and a long
        // name cut before it would hide exactly that. The same for a run of folders shown as
        // one, `src/main/java`, where the last is the one its files are in.
        ellipsizeMode={isFolder && !name.includes('/') ? 'tail' : 'middle'}
        style={[
          styles.name,
          { color: palette.text },
          selected ? styles.selectedName : null,
          struck ? styles.struckName : null,
        ]}>
        {name}
      </Text>
      {trailing}
    </Pressable>
  );
}

/** In place of a folder's contents while they are not there: loading, or failed to. */
export function TreeNotice({
  depth,
  kind,
  onRetry,
}: {
  depth: number;
  kind: 'loading' | 'failed';
  onRetry?: () => void;
}) {
  const palette = usePalette();

  if (kind === 'loading') {
    return (
      <View style={[styles.row, indent(depth)]}>
        <View style={styles.chevron} />
        <ActivityIndicator size="small" color={palette.textTertiary} />
        <Text style={[styles.notice, { color: palette.textTertiary }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <Pressable onPress={onRetry} style={[styles.row, indent(depth)]} accessibilityRole="button">
      <View style={styles.chevron} />
      <Text numberOfLines={1} style={[styles.notice, { color: palette.danger }]}>
        Could not load · tap to retry
      </Text>
    </Pressable>
  );
}

function indent(depth: number) {
  return { paddingLeft: Spacing.two + depth * INDENT };
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heading: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  detail: {
    fontSize: 11,
    lineHeight: 14,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: Spacing.two,
  },
  chevron: {
    width: 12,
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: 13,
  },
  selectedName: {
    fontWeight: '600',
  },
  struckName: {
    textDecorationLine: 'line-through',
  },
  notice: {
    flex: 1,
    fontSize: 12,
  },
});
