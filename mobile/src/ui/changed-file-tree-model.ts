/**
 * The changed-file tree's rules, apart from its drawing (`changed-file-tree.tsx`) so they
 * can be tested.
 *
 * A pull request's or a commit's files arrive as one flat list of paths, all at once, so
 * unlike the repository's tree (`file-tree-model.ts`) there is nothing to fetch folder by
 * folder: the whole tree is known before the first row is drawn. Every folder therefore
 * starts open - the list exists to show everything that changed - and a folder closed by
 * hand stays closed while other files are read.
 *
 * A run of folders holding nothing but the next folder is one row, `src/main/java`, the
 * way VS Code and GitHub both draw a change. The sidebar is a third of a phone on its side,
 * and a file six folders down would otherwise be indented most of the way across it before
 * its name began.
 */

import type { ChangedFile, ChangeStatus } from '../hosts/types';

/** Folders closed by hand, by path. */
export type Closed = ReadonlySet<string>;

export type ChangedTreeRow =
  | {
      kind: 'folder';
      /** The deepest folder of a compacted run, which is the one its rows sit in. */
      path: string;
      /** `src`, or `src/main/java` for a run of folders shown as one. */
      name: string;
      depth: number;
      open: boolean;
    }
  | { kind: 'file'; file: ChangedFile; name: string; depth: number };

interface Folder {
  folders: Map<string, Folder>;
  files: ChangedFile[];
}

/**
 * The tree, flattened into the rows a list draws: folders first and then files, by name,
 * as the repository's tree orders them - and under each open folder its own, a step in.
 */
export function changedTreeRows(files: readonly ChangedFile[], closed: Closed): ChangedTreeRow[] {
  const rows: ChangedTreeRow[] = [];

  const walk = (folder: Folder, path: string, depth: number) => {
    const folders = [...folder.folders].sort(([a], [b]) => byName(a, b));
    for (const [first, start] of folders) {
      let name = first;
      let at = joined(path, first);
      let inner = start;
      while (inner.files.length === 0 && inner.folders.size === 1) {
        const [[next, only]] = [...inner.folders];
        name = `${name}/${next}`;
        at = joined(at, next);
        inner = only;
      }

      const open = !closed.has(at);
      rows.push({ kind: 'folder', path: at, name, depth, open });
      if (open) walk(inner, at, depth + 1);
    }

    const named = folder.files.map((file) => ({ file, name: baseName(file.path) }));
    for (const { file, name } of named.sort((a, b) => byName(a.name, b.name))) {
      rows.push({ kind: 'file', file, name, depth });
    }
  };

  walk(tree(files), '', 0);
  return rows;
}

/**
 * The letter git itself gives what happened to a file - `A`, `M`, `D`, `R` - as VS Code's
 * source control view shows it at the end of each row. Nothing for a change the site did
 * not name, rather than a guess.
 */
export function statusLetter(status: ChangeStatus): string | undefined {
  switch (status) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'removed':
      return 'D';
    case 'renamed':
      return 'R';
    default:
      return undefined;
  }
}

/** A change's line totals, for the tree's heading. */
export function lineTotals(files: readonly ChangedFile[]): {
  additions: number;
  deletions: number;
} {
  return files.reduce(
    (totals, file) => ({
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 }
  );
}

function tree(files: readonly ChangedFile[]): Folder {
  const root: Folder = { folders: new Map(), files: [] };

  for (const file of files) {
    // Empty segments dropped, so a stray `a//b` still files `b` under `a`. The file keeps
    // its path exactly as the site sent it: that is what the screen is asked to open.
    const parts = file.path.split('/').filter((part) => part.length > 0);
    if (parts.length === 0) continue;

    let folder = root;
    for (const part of parts.slice(0, -1)) {
      let next = folder.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.files.push(file);
  }

  return root;
}

/**
 * The repository tree's order (`byFolderThenName` in `provider.ts`), so the same folder
 * reads the same way in both trees - with a tiebreak, since two names differing only in
 * case compare equal and a row that swaps places between renders is one nobody can find.
 */
function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
}

function baseName(path: string): string {
  const parts = path.split('/').filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

function joined(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}
