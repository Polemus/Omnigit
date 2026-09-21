/**
 * The file tree's rules, apart from its drawing (`file-tree.tsx`) so they can be tested.
 *
 * A folder is open when someone opened it by hand, or - unless someone closed it - when it
 * holds the file being read. So the tree always opens at the current file, choosing another
 * file from the tree needs no bookkeeping, and a folder closed by hand stays closed.
 */

import type { TreeEntry } from '../hosts/types';

/** The folders a path sits in, outermost first: `a/b/c.ts` is in `a` and `a/b`. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** Folders opened (`true`) or closed (`false`) by hand, by path. */
export type Toggled = Readonly<Record<string, boolean>>;

export function isOpenFolder(path: string, currentPath: string, toggled: Toggled): boolean {
  return toggled[path] ?? ancestorsOf(currentPath).includes(path);
}

/**
 * Every folder whose contents are on screen, root first: the root always, then each open
 * folder whose own folders are all open. These are the directories to ask the site for.
 */
export function visibleFolders(currentPath: string, toggled: Toggled): string[] {
  const open = (path: string) => isOpenFolder(path, currentPath, toggled);
  const candidates = new Set([
    ...ancestorsOf(currentPath),
    ...Object.keys(toggled).filter((path) => toggled[path]),
  ]);
  const shown = [...candidates].filter((path) => open(path) && ancestorsOf(path).every(open));
  return ['', ...shown.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))];
}

/** What a folder's contents are, as far as the tree knows. */
export type FolderState =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ready'; entries: TreeEntry[] };

export type TreeRow =
  | { kind: 'entry'; entry: TreeEntry; depth: number; open: boolean }
  | { kind: 'loading'; path: string; depth: number }
  | { kind: 'failed'; path: string; depth: number; retry: () => void };

/**
 * The tree, flattened into the rows a list draws: each folder's entries, and under each
 * open folder its own, indented a step - or a row saying it is loading or failed.
 */
export function treeRows(
  folder: (path: string) => FolderState | undefined,
  currentPath: string,
  toggled: Toggled
): TreeRow[] {
  const rows: TreeRow[] = [];

  const walk = (path: string, level: number) => {
    const state = folder(path);
    if (!state || state.status === 'loading') {
      rows.push({ kind: 'loading', path, depth: level });
      return;
    }
    if (state.status === 'failed') {
      rows.push({ kind: 'failed', path, depth: level, retry: state.retry });
      return;
    }
    for (const entry of state.entries) {
      const open = entry.type === 'dir' && isOpenFolder(entry.path, currentPath, toggled);
      rows.push({ kind: 'entry', entry, depth: level, open });
      if (open) walk(entry.path, level + 1);
    }
  };

  walk('', 0);
  return rows;
}

function depth(path: string): number {
  return path.split('/').length;
}
