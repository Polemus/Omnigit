/**
 * The repository as a tree beside the code, for a file read sideways - VS Code's explorer.
 *
 * Folders open in place. The tree starts open at the file being read, with that file
 * highlighted and scrolled into view, and choosing another file swaps it in (`onOpenFile`)
 * rather than stacking a screen, so Back still returns to the repository. Which folders are
 * open, and the order rows come in, is `file-tree-model.ts`; the heading and the rows are
 * `tree-pane.tsx`, which the diff screens' tree of changed files shares.
 *
 * Every open folder is its own query - the same ones the repository's file browser makes -
 * so folders already visited there open here without asking the site again.
 */

import * as Haptics from 'expo-haptics';
import { useState } from 'react';

import { useTrees } from '../api/queries';
import type { HostProvider } from '../hosts/provider';
import type { TreeEntry } from '../hosts/types';
import { iconForFile, iconForFolder } from './file-icons';
import {
  isOpenFolder,
  treeRows,
  visibleFolders,
  type FolderState,
  type Toggled,
  type TreeRow,
} from './file-tree-model';
import { TreeItem, TreeNotice, TreePane } from './tree-pane';

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
    <TreePane
      heading={target.repo}
      detail={target.ref ? `${target.owner} · ${target.ref}` : target.owner}
      rows={rows}
      rowKey={rowKey}
      currentIndex={rows.findIndex(
        (row) => row.kind === 'entry' && row.entry.path === currentPath
      )}
      renderRow={(row) => {
        if (row.kind !== 'entry') {
          return (
            <TreeNotice
              depth={row.depth}
              kind={row.kind}
              onRetry={row.kind === 'failed' ? row.retry : undefined}
            />
          );
        }
        const { entry, open, depth } = row;
        const isFolder = entry.type === 'dir';
        return (
          <TreeItem
            depth={depth}
            name={entry.name}
            icon={isFolder ? iconForFolder(entry.name) : iconForFile(entry.name)}
            open={isFolder ? open : undefined}
            selected={entry.path === currentPath}
            onPress={() => press(entry)}
          />
        );
      }}
    />
  );
}

function rowKey(row: TreeRow): string {
  return row.kind === 'entry' ? row.entry.path : `${row.kind}:${row.path}`;
}
