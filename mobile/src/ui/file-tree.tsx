/**
 * The repository as a tree beside the code, for a file read sideways - VS Code's explorer.
 *
 * Compact rows - chevron, icon, name, indented by depth - because a phone on its side is
 * short: the repository screen's grouped rows fit about seven in that height, these fit
 * about twelve. Folders open in place. The tree starts open at the file being read, with
 * that file highlighted and scrolled into view, and choosing another file swaps it in
 * (`onOpenFile`) rather than stacking a screen, so Back still returns to the repository.
 * Which folders are open, and the order rows come in, is `file-tree-model.ts`.
 *
 * Virtualised, with fixed-height rows, so a large folder costs only what is on screen and
 * the current file can be scrolled to by index. Every open folder is its own query - the
 * same ones the repository's file browser makes - so folders already visited there open
 * here without asking the site again.
 */

import { Host } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTrees } from '../api/queries';
import type { HostProvider } from '../hosts/provider';
import type { TreeEntry } from '../hosts/types';
import { Spacing, type Palette } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { iconForFile, iconForFolder } from './file-icons';
import {
  isOpenFolder,
  treeRows,
  visibleFolders,
  type FolderState,
  type Toggled,
  type TreeRow,
} from './file-tree-model';
import { Icon } from './icon';
import { Icons } from './icons';

const ROW_HEIGHT = 30;
const INDENT = 14;

interface Target {
  provider: HostProvider | undefined;
  owner: string;
  repo: string;
  ref?: string;
}

export function FileTree({
  target,
  currentPath,
  onOpenFile,
}: {
  target: Target;
  /** The file being read: its folders start open, and its row is highlighted. */
  currentPath: string;
  onOpenFile: (entry: TreeEntry) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<TreeRow>>(null);
  const revealed = useRef(false);
  const [toggled, setToggled] = useState<Toggled>({});

  const folders = visibleFolders(currentPath, toggled);
  const results = useTrees(target, folders);

  const rows = treeRows(
    (path): FolderState | undefined => {
      const result = results[folders.indexOf(path)];
      if (!result) return undefined;
      if (result.data) return { status: 'ready', entries: result.data };
      if (result.isError) return { status: 'failed', retry: () => void result.refetch() };
      return { status: 'loading' };
    },
    currentPath,
    toggled
  );

  // Scrolled to once, when its row first exists: after that, the file changes by a tap on
  // a row already in view, and jumping the list under the finger would lose the place.
  const currentIndex = rows.findIndex(
    (row) => row.kind === 'entry' && row.entry.path === currentPath
  );
  useEffect(() => {
    if (revealed.current || currentIndex < 0) return;
    revealed.current = true;
    listRef.current?.scrollToIndex({ index: currentIndex, viewPosition: 0.35, animated: false });
  }, [currentIndex]);

  const press = (entry: TreeEntry) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    if (entry.type !== 'dir') {
      if (entry.path !== currentPath) onOpenFile(entry);
      return;
    }
    setToggled((current) => ({
      ...current,
      [entry.path]: !isOpenFolder(entry.path, currentPath, current),
    }));
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { borderBottomColor: palette.separator }]}>
        <Text numberOfLines={1} style={[styles.heading, { color: palette.textSecondary }]}>
          {target.repo}
        </Text>
        <Text numberOfLines={1} style={[styles.subheading, { color: palette.textTertiary }]}>
          {target.ref ? `${target.owner} · ${target.ref}` : target.owner}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={rowKey}
        renderItem={({ item }) => (
          <Row
            row={item}
            selected={item.kind === 'entry' && item.entry.path === currentPath}
            palette={palette}
            onPress={item.kind === 'entry' ? () => press(item.entry) : undefined}
          />
        )}
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

function Row({
  row,
  selected,
  palette,
  onPress,
}: {
  row: TreeRow;
  selected: boolean;
  palette: Palette;
  onPress?: () => void;
}) {
  const indent = { paddingLeft: Spacing.two + row.depth * INDENT };

  if (row.kind === 'loading') {
    return (
      <View style={[styles.row, indent]}>
        <View style={styles.chevron} />
        <ActivityIndicator size="small" color={palette.textTertiary} />
        <Text style={[styles.status, { color: palette.textTertiary }]}>Loading…</Text>
      </View>
    );
  }

  if (row.kind === 'failed') {
    return (
      <Pressable onPress={row.retry} style={[styles.row, indent]} accessibilityRole="button">
        <View style={styles.chevron} />
        <Text numberOfLines={1} style={[styles.status, { color: palette.danger }]}>
          Could not load · tap to retry
        </Text>
      </Pressable>
    );
  }

  const { entry, open } = row;
  const isFolder = entry.type === 'dir';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.name}
      accessibilityState={isFolder ? { expanded: open } : { selected }}
      style={({ pressed }) => [
        styles.row,
        indent,
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
          <Icon name={isFolder ? iconForFolder(entry.name) : iconForFile(entry.name)} size={15} />
        </Host>
      </View>
      <Text
        numberOfLines={1}
        // The middle, not the end, for files: the extension says what a file is, and a long
        // name cut before it would hide exactly that.
        ellipsizeMode={isFolder ? 'tail' : 'middle'}
        style={[styles.name, { color: palette.text }, selected ? styles.selectedName : null]}>
        {entry.name}
      </Text>
    </Pressable>
  );
}

function rowKey(row: TreeRow): string {
  return row.kind === 'entry' ? row.entry.path : `${row.kind}:${row.path}`;
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
  subheading: {
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
  status: {
    flex: 1,
    fontSize: 12,
  },
});
