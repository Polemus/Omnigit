/**
 * How a change is described wherever one appears: a changed file's row in a pull
 * request's or a commit's file list, the totals in their Details, and the bar above a
 * file's diff.
 *
 * Both lists and both diff screens draw from here, so a file from a commit cannot come to
 * look different from the same file in a pull request. The screens differ only in what
 * they fetch. Every count is green for lines added and red for lines removed, as in the
 * diff itself.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { lineCounts } from '../hosts/diff';
import type { ChangedFile, ChangeStatus } from '../hosts/types';
import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { ChangeText, type TextRun } from './change-text';
import { Legend } from './legend';
import { Text } from './scaled-text';

/**
 * The line under a changed file's row: what happened to it, and by how many lines.
 * A row's supporting content, for `ListItem`'s `supportingText`.
 */
export function ChangedFileSummary({ file }: { file: ChangedFile }) {
  const status =
    file.status === 'unknown'
      ? 'Changed'
      : file.status.charAt(0).toUpperCase() + file.status.slice(1);

  if (file.additions === 0 && file.deletions === 0) {
    return <ChangeText runs={[{ text: `${status} · No line counts provided` }]} />;
  }

  return (
    <ChangeText
      runs={[
        { text: `${status} · ` },
        { text: `+${file.additions}`, tone: 'added' },
        { text: '  ' },
        { text: `−${file.deletions}`, tone: 'removed' },
      ]}
    />
  );
}

/**
 * A pull request's or a commit's line totals and file count, for its Details row:
 * `+12 · -3 · 4 files`, leaving out whatever the site did not say.
 */
export function ChangeTotals({
  additions,
  deletions,
  files,
}: {
  additions?: number;
  deletions?: number;
  files?: number;
}) {
  const parts: TextRun[] = [];
  if (additions !== undefined) parts.push({ text: `+${additions}`, tone: 'added' });
  if (deletions !== undefined) parts.push({ text: `-${deletions}`, tone: 'removed' });
  if (files !== undefined) parts.push({ text: `${files} file${files === 1 ? '' : 's'}` });

  if (parts.length === 0) {
    return <ChangeText runs={[{ text: 'Line counts were not provided.' }]} />;
  }

  return (
    <ChangeText
      runs={parts.flatMap((part, index) => (index === 0 ? [part] : [{ text: ' · ' }, part]))}
    />
  );
}

/**
 * The file's path, where it came from, and its counts - then, over a diff, the old/new
 * legend lined up over its two gutters.
 *
 * Drawn whatever state the file is in - still arriving, binary, gone from the change - so
 * the path bar and the tree toggle at its start stay put while the next file is chosen.
 * `patch` is the one about to be shown. When the file arrived without counts, they are
 * read off that patch, rather than the bar claiming +0 −0 over a diff that plainly
 * changed lines; with neither, there are no counts to show.
 */
export function DiffHeader({
  path,
  context,
  file,
  patch,
  leading,
}: {
  /** From the route, so it is there before the file is. */
  path: string;
  /** What the file belongs to - `owner/name · #12`, or `owner/name · 1a2b3c4`. */
  context: string;
  /** Once it has arrived and is in the change. */
  file?: ChangedFile;
  /** The diff about to be shown. The legend is drawn only over one. */
  patch?: string;
  /** Before the path: the sidebar's toggle (`SidebarToggle`). */
  leading?: ReactNode;
}) {
  const palette = usePalette();
  const counts =
    file && (file.additions > 0 || file.deletions > 0)
      ? file
      : patch
        ? lineCounts(patch)
        : undefined;

  return (
    <>
      <View style={[styles.pathBar, { borderBottomColor: palette.separator }]}>
        {leading}
        <View style={styles.pathText}>
          <Text
            selectable
            style={[styles.path, { color: palette.textSecondary }]}
            numberOfLines={2}>
            {path}
          </Text>
          <Text selectable style={[styles.context, { color: palette.textTertiary }]}>
            {context}
          </Text>
        </View>
        {counts ? (
          <View style={styles.counts}>
            <Text selectable style={[styles.count, { color: palette.added }]}>
              +{counts.additions}
            </Text>
            <Text selectable style={[styles.count, { color: palette.removed }]}>
              −{counts.deletions}
            </Text>
          </View>
        ) : null}
      </View>

      {file && patch ? <Legend gutters={['old', 'new']} detail={statusLabel(file.status)} /> : null}
    </>
  );
}

/** What the legend over a diff says happened: `Modified file`, `Added file`… */
export function statusLabel(status: ChangeStatus): string {
  if (status === 'unknown') return 'Changed lines';
  return `${status.charAt(0).toUpperCase()}${status.slice(1)} file`;
}

const styles = StyleSheet.create({
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pathText: {
    flex: 1,
    gap: Spacing.half,
  },
  path: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  context: {
    fontSize: 11,
    lineHeight: 14,
  },
  counts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  count: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
