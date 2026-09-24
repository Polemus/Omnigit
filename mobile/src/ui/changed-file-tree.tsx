/**
 * A pull request's or a commit's changed files as a tree beside the diff, for a changed
 * file read sideways - the code viewer's sidebar (`file-tree.tsx`), listing what changed
 * rather than the whole repository. GitHub's review page puts the same tree in the same
 * place, and for the same reason: reading a change is moving between its files.
 *
 * The heading counts the files and totals their lines. Each row ends in git's letter for
 * what happened to the file, in the change's colours, and a deleted file is struck through,
 * as VS Code's source control view draws them. Choosing a file swaps it in (`onOpenFile`)
 * rather than stacking a screen, so Back still returns to the pull request or the commit.
 * Which rows there are, and in what order, is `changed-file-tree-model.ts`.
 */

import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import type { ChangedFile, ChangeStatus } from '../hosts/types';
import type { Palette } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import {
  changedTreeRows,
  lineTotals,
  statusLetter,
  type ChangedTreeRow,
  type Closed,
} from './changed-file-tree-model';
import { iconForFile, iconForFolder } from './file-icons';
import { Text } from './scaled-text';
import { TreeItem, TreePane } from './tree-pane';

export function ChangedFileTree({
  files,
  currentPath,
  onOpenFile,
}: {
  files: readonly ChangedFile[];
  /** The file being read: its row is highlighted, and scrolled to when the tree opens. */
  currentPath: string;
  onOpenFile: (file: ChangedFile) => void;
}) {
  const palette = usePalette();
  const [closed, setClosed] = useState<Closed>(() => new Set<string>());
  const rows = useMemo(() => changedTreeRows(files, closed), [files, closed]);
  const totals = useMemo(() => lineTotals(files), [files]);

  const press = (row: ChangedTreeRow) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    if (row.kind === 'file') {
      if (row.file.path !== currentPath) onOpenFile(row.file);
      return;
    }
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(row.path)) next.add(row.path);
      return next;
    });
  };

  return (
    <TreePane
      heading={`${files.length} changed ${files.length === 1 ? 'file' : 'files'}`}
      detail={
        <>
          <Text style={{ color: palette.added }}>+{totals.additions.toLocaleString()}</Text>
          {'  '}
          <Text style={{ color: palette.removed }}>−{totals.deletions.toLocaleString()}</Text>
        </>
      }
      rows={rows}
      rowKey={rowKey}
      currentIndex={rows.findIndex((row) => row.kind === 'file' && row.file.path === currentPath)}
      renderRow={(row) =>
        row.kind === 'folder' ? (
          <TreeItem
            depth={row.depth}
            name={row.name}
            // The last of a run of folders shown as one: that is the folder the rows under
            // it are actually in.
            icon={iconForFolder(row.name.slice(row.name.lastIndexOf('/') + 1))}
            open={row.open}
            onPress={() => press(row)}
          />
        ) : (
          <TreeItem
            depth={row.depth}
            name={row.name}
            icon={iconForFile(row.name)}
            selected={row.file.path === currentPath}
            struck={row.file.status === 'removed'}
            trailing={<StatusLetter status={row.file.status} palette={palette} />}
            accessibilityLabel={
              row.file.status === 'unknown' ? row.name : `${row.name}, ${row.file.status}`
            }
            onPress={() => press(row)}
          />
        )
      }
    />
  );
}

function StatusLetter({ status, palette }: { status: ChangeStatus; palette: Palette }) {
  const letter = statusLetter(status);
  if (!letter) return null;

  const colour =
    status === 'added'
      ? palette.added
      : status === 'removed'
        ? palette.removed
        : status === 'renamed'
          ? palette.renamed
          : palette.modified;

  return <Text style={[styles.letter, { color: colour }]}>{letter}</Text>;
}

// Prefixed, because a change can delete a file `foo` and add a folder `foo` beside it.
function rowKey(row: ChangedTreeRow): string {
  return row.kind === 'folder' ? `dir:${row.path}` : `file:${row.file.path}`;
}

const styles = StyleSheet.create({
  // A fixed column, so names end at the same place whichever letter follows them.
  letter: {
    width: 12,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
