/**
 * The small coloured things: review states, labels, counts.
 */

import { StyleSheet, Text, View } from 'react-native';

import { labelColours, Radius, Spacing } from '../theme/tokens';
import { useScheme, usePalette } from '../theme/use-palette';
import type { Issue, Label, PullRequest } from '../hosts/types';

export type ReviewState = 'open' | 'merged' | 'closed' | 'draft';

/**
 * What state a pull request is in, from whatever subset of fields the site filled in.
 *
 * Order matters. A merged pull request is also closed on most forges, and a draft is also
 * open, so the more specific answer has to be asked for first or every merged request
 * reads as closed.
 */
export function pullRequestState(pull: PullRequest): ReviewState {
  if (pull.isMerged) return 'merged';
  if (pull.isDraft) return 'draft';
  if (pull.state && pull.state.toLowerCase().startsWith('close')) return 'closed';
  return 'open';
}

export function issueState(issue: Issue): ReviewState {
  return issue.state.toLowerCase().startsWith('close') ? 'closed' : 'open';
}

const WORDS: Record<ReviewState, string> = {
  open: 'Open',
  merged: 'Merged',
  closed: 'Closed',
  draft: 'Draft',
};

export function StateBadge({ state }: { state: ReviewState }) {
  const palette = usePalette();
  const colour = palette[state];

  return (
    <View style={[styles.badge, { backgroundColor: colour }]}>
      <Text style={styles.badgeText}>{WORDS[state]}</Text>
    </View>
  );
}

/**
 * A row of labels, capped.
 *
 * Six labels on one issue is not unusual and would push everything else off a phone
 * screen, so the overflow is counted rather than wrapped onto a third line.
 */
export function LabelChips({ labels, max = 3 }: { labels: Label[] | undefined; max?: number }) {
  const scheme = useScheme();
  const palette = usePalette();

  if (!labels || labels.length === 0) return null;

  const shown = labels.slice(0, max);
  const extra = labels.length - shown.length;

  return (
    <View style={styles.chips}>
      {shown.map((label) => {
        const colours = labelColours(label.color, scheme);
        return (
          <View
            key={label.name}
            style={[
              styles.chip,
              { backgroundColor: colours.background, borderColor: colours.border },
            ]}>
            <Text style={[styles.chipText, { color: colours.text }]} numberOfLines={1}>
              {label.name}
            </Text>
          </View>
        );
      })}
      {extra > 0 ? (
        <Text style={[styles.chipText, { color: palette.textTertiary }]}>+{extra}</Text>
      ) : null}
    </View>
  );
}

/** Added and removed line counts, shown only where the site actually sent them. */
export function DiffCounts({
  additions,
  deletions,
}: {
  additions?: number;
  deletions?: number;
}) {
  const palette = usePalette();
  if (additions === undefined && deletions === undefined) return null;

  return (
    <View style={styles.diff}>
      {additions !== undefined ? (
        <Text style={[styles.diffText, { color: palette.added }]}>+{additions}</Text>
      ) : null}
      {deletions !== undefined ? (
        <Text style={[styles.diffText, { color: palette.removed }]}>-{deletions}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    // The state word is short and is the most useful thing on the line, so it is the last
    // to give ground rather than the first.
    flexShrink: 0,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: Spacing.one,
    overflow: 'hidden',
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 120,
    flexShrink: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  diff: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  diffText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
