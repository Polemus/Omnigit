/**
 * One row per kind of thing, built on the native list row.
 *
 * `ListItem` is a SwiftUI `Button` wrapping an `HStack` on iOS and a Compose `ListItem` on
 * Android, so the row itself - its press feedback, its separators, its height - is the
 * platform's rather than ours. What it will not take is a React Native view in the
 * headline or supporting slot: those go into a SwiftUI `VStack`, where an RN view has no
 * intrinsic size and stretches to fill whatever it is given.
 *
 * `RNHostView matchContents` is the way back in. It measures the RN content and pins the
 * native host to that size, which is exactly what `ListItem` does for its own leading and
 * trailing accessories. So the headline stays a plain string the platform styles, and
 * everything underneath it - host badges, labels, language dots - is ours.
 */

import { RNHostView } from '@expo/ui';
import { StyleSheet, View } from 'react-native';

import type { Account, Commit, Issue, Notification, PullRequest, Repository } from '../hosts/types';
import { commitSummary, shortSha } from '../hosts/types';
import { useNavigationPreferences } from '../state/navigation-preferences';
import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { DiffCounts, issueState, LabelChips, pullRequestState, StateBadge } from './badges';
import { languageColour } from './file-types';
import { Icon } from './icon';
import { Avatar, HostBadge, hostLabel } from './identity';
import { Icons } from './icons';
import { ListItem } from './list-item';
import { relativeTime } from './relative-time';
import { useContentWidth } from './screen';
import { Text } from './scaled-text';

/**
 * Roughly what a `ListItem` spends on everything that is not the middle column: the row's
 * own horizontal padding at both ends, the leading accessory, and the gaps around it.
 *
 * A guess, and it has to be. `RNHostView` takes only `matchContents` - it ignores `style`
 * on iOS - so the width cannot be imposed from outside, and the native row does not
 * report what it gave us. Erring generous costs a few points of unused width; erring mean
 * puts the end of the line off the side of the screen.
 */
const ROW_CHROME = 116;

/**
 * A rich React Native supporting row cannot learn the width SwiftUI actually gives a
 * `ListItem` inside Split View. In landscape its intrinsic width can therefore make the
 * native HStack wider than the detail column and push the headline and leading accessory
 * under the sidebar. Let SwiftUI draw one plain supporting string in that mode instead:
 * it then owns the measurement and truncation from end to end.
 */
function useSplitViewSupportingText(): boolean {
  const { splitViewEnabled } = useNavigationPreferences();
  return process.env.EXPO_OS === 'ios' && splitViewEnabled;
}

/**
 * The line under a row's title.
 *
 * The explicit width is the whole point of this component. `matchContents` sizes the host
 * to its content's *intrinsic* size, and a flex row of badges and text has no intrinsic
 * width - it measures as wide as its children want to be, which for a long repository
 * name and a host badge is wider than the phone. The row then runs off both sides. Giving
 * the inner view a width makes that measurement bounded, and the children shrink into it.
 *
 * Wrapped once here rather than at each call site, because forgetting it does not fail
 * loudly - it produces a row that has quietly walked off the edge of the screen.
 */
function Meta({
  children,
  hasTrailing = false,
  extraChrome = 0,
}: {
  children: React.ReactNode;
  hasTrailing?: boolean;
  /**
   * Width taken outside the row itself. A grouped row on Android is 32 narrower than one in
   * a plain list, because its section sits 16 in from either side; the row is the card
   * there, so that is all (`field-group.android.tsx`).
   */
  extraChrome?: number;
}) {
  const width = useContentWidth();

  return (
    <RNHostView matchContents>
      <View
        style={[
          styles.meta,
          {
            width: Math.max(156, width - ROW_CHROME - (hasTrailing ? 24 : 0) - extraChrome),
          },
        ]}>
        {children}
      </View>
    </RNHostView>
  );
}

function Dot() {
  const palette = usePalette();
  return <Text style={[styles.metaText, { color: palette.textTertiary }]}>·</Text>;
}

function MetaText({ children, muted = true }: { children: React.ReactNode; muted?: boolean }) {
  const palette = usePalette();
  return (
    <Text
      style={[styles.metaText, { color: muted ? palette.textSecondary : palette.text }]}
      numberOfLines={1}>
      {children}
    </Text>
  );
}

// ------------------------------------------------------------- Repository

export function RepositoryRow({
  account,
  repository,
  onPress,
  showChevron = false,
  grouped = false,
}: {
  account: Account;
  repository: Repository;
  onPress: () => void;
  showChevron?: boolean;
  grouped?: boolean;
}) {
  const palette = usePalette();
  const usePlainSupportingText = useSplitViewSupportingText();

  // Android draws this line as the native row's own supporting text rather than as a React
  // Native island. `Meta` costs one Jetpack Compose host per row, and a real account's
  // worth of repositories - thirty-odd, all rendered at once - is thirty-odd Compose hosts
  // built on the main thread, which is what froze this list. SwiftUI hosts are cheap enough
  // that iOS keeps the badges and the language dot.
  if (process.env.EXPO_OS === 'android' || usePlainSupportingText) {
    return (
      <ListItem
        onPress={onPress}
        leading={<Avatar url={repository.avatarUrl} size={34} fallback={repository.owner} />}
        supportingText={repositoryMeta(account, repository)}
        trailing={showChevron ? <Icon name={Icons.chevron} size={16} /> : undefined}>
        {`${repository.owner}/${repository.name}`}
      </ListItem>
    );
  }

  return (
    <ListItem onPress={onPress}>
      <ListItem.Leading>
        <Avatar url={repository.avatarUrl} size={34} fallback={repository.owner} />
      </ListItem.Leading>

      {`${repository.owner}/${repository.name}`}

      <ListItem.Supporting>
        <Meta
          hasTrailing={showChevron}
          extraChrome={grouped && process.env.EXPO_OS === 'android' ? 32 : 0}>
          <HostBadge account={account} />
          {repository.isPrivate ? (
            <>
              <Dot />
              <MetaText>Private</MetaText>
            </>
          ) : null}
          {repository.language ? (
            <>
              <Dot />
              <View
                style={[
                  styles.languageDot,
                  { backgroundColor: languageColour(repository.language, palette) },
                ]}
              />
              <MetaText>{repository.language}</MetaText>
            </>
          ) : null}
          {repository.stars !== undefined && repository.stars > 0 ? (
            <>
              <Dot />
              <MetaText>{repository.stars} ★</MetaText>
            </>
          ) : null}
          {repository.updatedAt ? (
            <>
              <Dot />
              <MetaText>{relativeTime(repository.updatedAt)}</MetaText>
            </>
          ) : null}
        </Meta>
      </ListItem.Supporting>

      {showChevron ? (
        <ListItem.Trailing>
          <Icon name={Icons.chevron} size={16} />
        </ListItem.Trailing>
      ) : null}
    </ListItem>
  );
}

/**
 * The same line `Meta` draws, as one string: the site, whether it is private, the language,
 * the stars and when it last changed. Android reads it into the native row's supporting
 * slot, which costs nothing, where the React Native version costs a Compose host per row.
 * The colour is what is lost - the host badge and the language dot - and a list that
 * scrolls is worth more than either.
 */
function repositoryMeta(account: Account, repository: Repository): string {
  return [
    hostLabel(account),
    repository.isPrivate ? 'Private' : undefined,
    repository.language,
    repository.stars !== undefined && repository.stars > 0 ? `${repository.stars} ★` : undefined,
    repository.updatedAt ? relativeTime(repository.updatedAt) : undefined,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}

// ----------------------------------------------------------- Pull request

export function PullRequestRow({
  pull,
  account,
  onPress,
  showChevron = false,
  grouped = false,
}: {
  pull: PullRequest;
  account?: Account;
  onPress: () => void;
  showChevron?: boolean;
  grouped?: boolean;
}) {
  const usePlainSupportingText = useSplitViewSupportingText();

  if (usePlainSupportingText) {
    return (
      <ListItem
        onPress={onPress}
        leading={<Avatar url={pull.authorAvatarUrl} size={30} fallback={pull.author} />}
        supportingText={pullRequestMeta(pull, account)}
        trailing={showChevron ? <Icon name={Icons.chevron} size={16} /> : undefined}>
        {pull.title}
      </ListItem>
    );
  }

  return (
    <ListItem onPress={onPress}>
      <ListItem.Leading>
        <Avatar url={pull.authorAvatarUrl} size={30} fallback={pull.author} />
      </ListItem.Leading>

      {pull.title}

      <ListItem.Supporting>
        <Meta
          hasTrailing={showChevron}
          extraChrome={grouped && process.env.EXPO_OS === 'android' ? 32 : 0}>
          <StateBadge state={pullRequestState(pull)} />
          <MetaText>#{pull.number}</MetaText>
          {pull.author ? (
            <>
              <Dot />
              <MetaText>{pull.author}</MetaText>
            </>
          ) : null}
          {account ? (
            <>
              <Dot />
              <HostBadge account={account} />
            </>
          ) : null}
          {pull.updatedAt ? (
            <>
              <Dot />
              <MetaText>{relativeTime(pull.updatedAt)}</MetaText>
            </>
          ) : null}
          <DiffCounts additions={pull.additions} deletions={pull.deletions} />
        </Meta>
      </ListItem.Supporting>

      {showChevron ? (
        <ListItem.Trailing>
          <Icon name={Icons.chevron} size={16} />
        </ListItem.Trailing>
      ) : null}
    </ListItem>
  );
}

// ------------------------------------------------------------------ Issue

export function IssueRow({
  issue,
  onPress,
  showChevron = false,
  grouped = false,
}: {
  issue: Issue;
  onPress: () => void;
  showChevron?: boolean;
  grouped?: boolean;
}) {
  const usePlainSupportingText = useSplitViewSupportingText();

  if (usePlainSupportingText) {
    return (
      <ListItem
        onPress={onPress}
        leading={<Avatar url={issue.authorAvatarUrl} size={30} fallback={issue.author} />}
        supportingText={issueMeta(issue)}
        trailing={showChevron ? <Icon name={Icons.chevron} size={16} /> : undefined}>
        {issue.title}
      </ListItem>
    );
  }

  return (
    <ListItem onPress={onPress}>
      <ListItem.Leading>
        <Avatar url={issue.authorAvatarUrl} size={30} fallback={issue.author} />
      </ListItem.Leading>

      {issue.title}

      <ListItem.Supporting>
        <Meta
          hasTrailing={showChevron}
          extraChrome={grouped && process.env.EXPO_OS === 'android' ? 32 : 0}>
          <StateBadge state={issueState(issue)} />
          <MetaText>#{issue.number}</MetaText>
          {issue.updatedAt ? (
            <>
              <Dot />
              <MetaText>{relativeTime(issue.updatedAt)}</MetaText>
            </>
          ) : null}
          <LabelChips labels={issue.labels} max={2} />
        </Meta>
      </ListItem.Supporting>

      {showChevron ? (
        <ListItem.Trailing>
          <Icon name={Icons.chevron} size={16} />
        </ListItem.Trailing>
      ) : null}
    </ListItem>
  );
}

// ----------------------------------------------------------------- Commit

export function CommitRow({
  commit,
  onPress,
  showChevron = false,
}: {
  commit: Commit;
  onPress?: () => void;
  showChevron?: boolean;
}) {
  const palette = usePalette();
  const usePlainSupportingText = useSplitViewSupportingText();

  // Android draws this line as the row's own supporting text, as `RepositoryRow` and
  // `NotificationRow` do, and for the reason that matters most here: history is the one
  // list with no end to it. "Load more commits" adds fifty rows to what is already on
  // screen, and a React Native island in each one is a Compose host per row that the phone
  // keeps building as the list grows. The short sha loses its monospace, which is the whole
  // cost.
  if (process.env.EXPO_OS === 'android' || usePlainSupportingText) {
    return (
      <ListItem
        onPress={onPress}
        leading={<Avatar url={commit.authorAvatarUrl} size={30} fallback={commit.author} />}
        supportingText={commitMeta(commit)}
        trailing={showChevron ? <Icon name={Icons.chevron} size={16} /> : undefined}>
        {commitSummary(commit.message)}
      </ListItem>
    );
  }

  return (
    <ListItem onPress={onPress}>
      <ListItem.Leading>
        <Avatar url={commit.authorAvatarUrl} size={30} fallback={commit.author} />
      </ListItem.Leading>

      {commitSummary(commit.message)}

      <ListItem.Supporting>
        <Meta hasTrailing={showChevron} extraChrome={0}>
          <Text style={[styles.sha, { color: palette.textSecondary }]}>{shortSha(commit.sha)}</Text>
          {commit.author ? (
            <>
              <Dot />
              <MetaText>{commit.author}</MetaText>
            </>
          ) : null}
          {commit.committedAt ? (
            <>
              <Dot />
              <MetaText>{relativeTime(commit.committedAt)}</MetaText>
            </>
          ) : null}
        </Meta>
      </ListItem.Supporting>

      {/* Only where the commit opens on another screen here. A site that describes no
          single-commit read still sends it to the site, and a chevron would promise
          otherwise. */}
      {showChevron ? (
        <ListItem.Trailing>
          <Icon name={Icons.chevron} size={16} />
        </ListItem.Trailing>
      ) : null}
    </ListItem>
  );
}

// ----------------------------------------------------------- Notification

export function NotificationRow({
  notification,
  account,
  onPress,
  showChevron = false,
}: {
  notification: Notification;
  account: Account;
  onPress?: () => void;
  showChevron?: boolean;
}) {
  const palette = usePalette();
  const usePlainSupportingText = useSplitViewSupportingText();

  const mark = (
    <View
      style={[
        styles.unread,
        { backgroundColor: notification.isUnread ? palette.accent : 'transparent' },
      ]}
    />
  );

  // Android draws this line as the row's own supporting text, for the reason `RepositoryRow`
  // does: `Meta` is a React Native island, and an island inside a native row costs a Compose
  // host. The inbox is the longest list in the app - one account's fifty notifications, and
  // a second account's fifty under them - so it is where that cost lands hardest, and where
  // the hosts are built and thrown away again every time the list changes shape. The colour
  // is what is lost: the host badge becomes the host's name in the same grey as the rest.
  if (process.env.EXPO_OS === 'android' || usePlainSupportingText) {
    return (
      <ListItem
        onPress={onPress}
        leading={mark}
        supportingText={notificationMeta(account, notification)}
        trailing={showChevron ? <Icon name={Icons.chevron} size={16} /> : undefined}>
        {notification.title}
      </ListItem>
    );
  }

  return (
    <ListItem onPress={onPress}>
      <ListItem.Leading>{mark}</ListItem.Leading>

      {notification.title}

      <ListItem.Supporting>
        <Meta hasTrailing={showChevron} extraChrome={0}>
          <HostBadge account={account} />
          {notification.repository ? (
            <>
              <Dot />
              <MetaText>{notification.repository}</MetaText>
            </>
          ) : null}
          {notification.updatedAt ? (
            <>
              <Dot />
              <MetaText>{relativeTime(notification.updatedAt)}</MetaText>
            </>
          ) : null}
        </Meta>
      </ListItem.Supporting>

      {showChevron ? (
        <ListItem.Trailing>
          <Icon name={Icons.chevron} size={16} />
        </ListItem.Trailing>
      ) : null}
    </ListItem>
  );
}

/** The same line as `Meta` above, as a plain string for the native row to draw. */
function commitMeta(commit: Commit): string {
  return [
    shortSha(commit.sha),
    commit.author || undefined,
    commit.committedAt ? relativeTime(commit.committedAt) : undefined,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}

/** The same line as `Meta` above, as a plain string for the native row to draw. */
function notificationMeta(account: Account, notification: Notification): string {
  return [
    hostLabel(account),
    notification.repository || undefined,
    notification.updatedAt ? relativeTime(notification.updatedAt) : undefined,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}

function pullRequestMeta(pull: PullRequest, account?: Account): string {
  return [
    stateWord(pullRequestState(pull)),
    `#${pull.number}`,
    pull.author || undefined,
    account ? hostLabel(account) : undefined,
    pull.updatedAt ? relativeTime(pull.updatedAt) : undefined,
    diffMeta(pull.additions, pull.deletions),
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}

function issueMeta(issue: Issue): string {
  const shownLabels = issue.labels?.slice(0, 2).map((label) => label.name) ?? [];
  const extraLabels = Math.max(0, (issue.labels?.length ?? 0) - shownLabels.length);

  return [
    stateWord(issueState(issue)),
    `#${issue.number}`,
    issue.updatedAt ? relativeTime(issue.updatedAt) : undefined,
    shownLabels.length > 0
      ? `${shownLabels.join(', ')}${extraLabels > 0 ? ` +${extraLabels}` : ''}`
      : undefined,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}

function stateWord(state: ReturnType<typeof pullRequestState>): string {
  return {
    open: 'Open',
    merged: 'Merged',
    closed: 'Closed',
    draft: 'Draft',
  }[state];
}

function diffMeta(additions?: number, deletions?: number): string | undefined {
  const parts = [
    additions !== undefined ? `+${additions}` : undefined,
    deletions !== undefined ? `-${deletions}` : undefined,
  ].filter((part): part is string => !!part);

  return parts.length > 0 ? parts.join(' ') : undefined;
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.half,
    // A last resort. Everything in the line shrinks first, so reaching this means the
    // line genuinely cannot fit - better clipped inside the row than drawn over the
    // screen beside it.
    overflow: 'hidden',
  },
  metaText: {
    fontSize: 12,
    // Lets a long author or repository name truncate instead of pushing the timestamp
    // and the counts off the end.
    flexShrink: 1,
  },
  languageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sha: {
    fontSize: 12,
    fontFamily: 'ui-monospace',
  },
  unread: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
});
