/**
 * One repository, in the same native grouped structure as the pull request and issue
 * screens - a summary, the details, and the chosen content as a section of its own -
 * with the glass pill switcher pinned above it choosing what that content is.
 *
 * The pills stay outside the list on purpose. On iOS the segmented control is its own
 * SwiftUI island (a `Host` around a segmented `Picker`), so inside the list it would be
 * SwiftUI in React Native in SwiftUI. Pinned above, it is exactly the control that was
 * already working here, and it stays in reach however far down a README you are.
 *
 * The outer container is `List` rather than `FieldGroup`, as on the Repositories tab: the
 * pull requests, issues and commits page and want pull-to-refresh, which only `List` has.
 * That also makes it safe for each view to be its own component returning a whole
 * section - `List` passes children straight through, where `FieldGroup` on Android
 * decides what is a section by element type and would wrap a component in another one.
 * Each view owning its queries means the views you are not looking at never fetch.
 */

import { FieldGroup, Host, List } from '@expo/ui';
import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  useBranches,
  useCommits,
  useIssues,
  usePullRequests,
  useReadme,
  useRepository,
} from '@/api/queries';
import type { HostCapabilities } from '@/hosts/manifest';
import type { HostProvider } from '@/hosts/provider';
import { accountKey } from '@/hosts/types';
import { useProvider } from '@/state/accounts';
import { Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { AssistantButton } from '@/ui/assistant-button';
import { FileBrowserSection } from '@/ui/file-browser';
import { iconForLanguage } from '@/ui/file-icons';
import { ControlBar, MenuPickerRow } from '@/ui/control-bar';
import { GroupedContent } from '@/ui/grouped-content';
import { headerMenu } from '@/ui/header-menu';
import { Icon } from '@/ui/icon';
import { hostLabel } from '@/ui/identity';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Markdown } from '@/ui/markdown';
import { relativeTime } from '@/ui/relative-time';
import { CommitRow, IssueRow, PullRequestRow } from '@/ui/rows';
import { Empty } from '@/ui/states';
import { Text } from '@/ui/text';

// TEMPORARY (Android freeze diagnosis): deliberately passing no style to this screen's
// `FieldGroup.Section`s. The 'modifiers' prop error either comes from our style being
// converted into Compose modifiers (`transformToModifiers`), or from the ones FieldSection
// builds for itself - and only one of those is ours to fix. If the error stops on this
// screen, it is the former. Restore the padding below once that is known.
const androidSectionStyle = undefined;

type RepoView = 'about' | 'code' | 'pulls' | 'issues' | 'commits';

/**
 * The views, in order, each shown only where the site's manifest describes it - a missing
 * endpoint is a missing pill, never a view that can only ever say "nothing".
 *
 * Five and no more, and short labels, because they share one row on a phone: six equal
 * segments on a 393pt iPhone leave about 45pt a label, and "Commits" alone needs about
 * 52. That is why the README lives inside About rather than on a pill of its own - About
 * is the repository's front page, the way it is on the site itself, and the details only
 * appear there instead of above every view.
 */
const VIEWS: {
  id: RepoView;
  label: string;
  available: (can: HostCapabilities) => boolean;
}[] = [
  // Always present: the summary and details come from the repository endpoint the whole
  // screen already rests on. The README joins them where the site describes one.
  { id: 'about', label: 'About', available: () => true },
  { id: 'code', label: 'Code', available: (can) => can.canReadFiles },
  {
    id: 'pulls',
    label: 'Pulls',
    available: (can) => can.canListPullRequests,
  },
  { id: 'issues', label: 'Issues', available: (can) => can.canListIssues },
  { id: 'commits', label: 'Commits', available: (can) => can.canListCommits },
];

export default function RepositoryScreen() {
  const { account, owner, name } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
  }>();
  const router = useRouter();
  const palette = usePalette();
  const provider = useProvider(account);
  const queryClient = useQueryClient();

  // A preference rather than the truth: the provider can arrive a render after the
  // screen, and a view the site turns out not to describe falls through to the first one
  // it does.
  const [preferred, setPreferred] = useState<RepoView>('about');

  // Held here rather than in `IssuesSection` because its pills are drawn up in the pinned
  // bar, outside the list the section lives in. Kept across view switches, so going to
  // Code and back returns to the issues you were reading.
  const [issueState, setIssueState] = useState<'open' | 'closed'>('open');

  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '' }),
    [provider, owner, name]
  );

  // The branch Code and Commits read from; undefined until someone picks one, which
  // means the repository's own default. Kept across view switches, so a branch chosen on
  // Code is still chosen on Commits.
  const [branch, setBranch] = useState<string | undefined>();

  const repository = useRepository(target);
  const item = repository.data;
  const ref = branch ?? item?.defaultBranch;
  const fileTarget = useMemo(() => ({ ...target, ref }), [target, ref]);

  // Asked for only while a view that uses branches is showing.
  const branches = useBranches(target, preferred === 'code' || preferred === 'commits');

  // The default branch first, then the rest as the site ordered them. Added even when the
  // site's first page of branches did not include it, so the branch a repository opens on
  // is always one you can get back to.
  const branchNames = useMemo(() => {
    const names = (branches.data ?? []).map((candidate) => candidate.name);
    const main = item?.defaultBranch;
    return main ? [main, ...names.filter((candidate) => candidate !== main)] : names;
  }, [branches.data, item?.defaultBranch]);

  const webUrl = item?.webUrl ?? provider?.webUrl('repository', { owner, repo: name });
  const cloneUrl = item?.cloneUrl;

  const menu = headerMenu([
    {
      label: 'Open on the site',
      sf: 'safari',
      disabled: !webUrl,
      onPress: () => webUrl && void WebBrowser.openBrowserAsync(webUrl),
    },
    {
      label: 'Copy clone URL',
      sf: 'doc.on.doc',
      disabled: !cloneUrl,
      feedback: 'none',
      onPress: () => {
        if (!cloneUrl) return;
        void Clipboard.setStringAsync(cloneUrl);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    },
  ]);

  // Pull-to-refresh refetches everything on screen for this repository - the details and
  // whichever view is showing - and nothing else. Every repository-scoped query key is
  // `[kind, account, owner, repo, ...]`, and `active` skips the views not being shown.
  const accountId = provider ? accountKey(provider.account) : 'none';
  const refresh = useCallback(async () => {
    await queryClient.refetchQueries({
      type: 'active',
      predicate: (query) =>
        query.queryKey[1] === accountId &&
        query.queryKey[2] === target.owner &&
        query.queryKey[3] === target.repo,
    });
  }, [queryClient, accountId, target.owner, target.repo]);

  if (!provider) {
    return (
      <Empty
        icon={Icons.token}
        title="Signed out"
        detail="The token for this account has gone. Sign in again to open this."
        actionLabel="Go to settings"
        onAction={() => router.push('/settings')}
      />
    );
  }

  const available = VIEWS.filter((view) => view.available(provider.capabilities));
  const active = available.some((view) => view.id === preferred)
    ? preferred
    : (available[0]?.id ?? preferred);

  function choose(view: RepoView) {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setPreferred(view);
  }

  function chooseIssues(state: 'open' | 'closed') {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setIssueState(state);
  }

  const branchView = active === 'code' || active === 'commits';
  const showViewPills = available.length > 1;
  const showIssuePills = active === 'issues';
  // Only where there is a choice to make: one branch is no branch to switch to.
  const showBranchPicker = branchView && branchNames.length > 1;

  // Code and Commits need a concrete branch to ask for, and the default one is only known
  // once the repository has loaded. GitLab in particular refuses a file request with an
  // empty ref, so those views wait for it rather than firing a request that cannot work.
  const waitingForBranch = branchView && ref === undefined && repository.isLoading;

  const fullName = item ? `${item.owner}/${item.name}` : `${owner}/${name}`;

  return (
    <>
      <Stack.Screen
        options={{
          title: name ?? 'Repository',
          headerBackTitle: 'Back',
          ...menu,
        }}
      />

      <View style={styles.fill}>
        {/* One glass bar for every choice that shapes the content: which view, and then
            whatever refines it - open or closed on Issues, the branch on Code and Commits.
            They join this bar rather than getting their own because they refine the view
            choice above them, and stacked glass capsules read as unrelated toolbars. A
            site with one view shows no view pills but still gets the refinements. */}
        {showViewPills || showIssuePills || showBranchPicker ? (
          <ControlBar>
            {showViewPills ? (
              <SegmentedControl
                values={available.map((view) => view.label)}
                selectedIndex={Math.max(
                  0,
                  available.findIndex((view) => view.id === active)
                )}
                onValueChange={(value) => {
                  const next = available.find((view) => view.label === value);
                  if (next) choose(next.id);
                }}
                tintColor={palette.accent}
              />
            ) : null}
            {showIssuePills ? (
              <SegmentedControl
                values={['Open', 'Closed']}
                selectedIndex={issueState === 'open' ? 0 : 1}
                onValueChange={(value) => chooseIssues(value === 'Open' ? 'open' : 'closed')}
                tintColor={palette.accent}
              />
            ) : null}
            {showBranchPicker ? (
              <MenuPickerRow
                icon={Icons.branch}
                label="Branch"
                options={branchNames.map((name) => ({ label: name, value: name }))}
                selected={ref ?? branchNames[0]}
                onSelect={setBranch}
              />
            ) : null}
          </ControlBar>
        ) : null}

        <Host style={styles.fill}>
          <List onRefresh={refresh}>
            {active === 'about' ? (
              <>
                <FieldGroup.Section style={androidSectionStyle}>
                  <ListItem
                    leading={<Icon name={Icons.repositories} size={40} />}
                    supportingText={
                      item?.description || `Repository on ${hostLabel(provider.account)}`
                    }>
                    {fullName}
                  </ListItem>
                </FieldGroup.Section>

                <FieldGroup.Section title="Details" style={androidSectionStyle}>
                  {repository.isLoading ? (
                    <ListItem leading={<Icon name={Icons.refresh} size={20} />}>
                      Loading details…
                    </ListItem>
                  ) : null}
                  {repository.error ? (
                    <ListItem
                      onPress={() => void repository.refetch()}
                      leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
                      supportingText={errorMessage(repository.error)}
                      trailing={<Icon name={Icons.refresh} size={17} />}>
                      Try loading the details again
                    </ListItem>
                  ) : null}

                  <ListItem
                    leading={<Icon name={Icons.host} size={20} />}
                    supportingText={`Signed in as @${provider.account.login}`}>
                    {hostLabel(provider.account)}
                  </ListItem>

                  {item ? (
                    <>
                      <ListItem
                        leading={
                          <Icon name={item.isPrivate ? Icons.private : Icons.public} size={20} />
                        }
                        supportingText={
                          item.isPrivate
                            ? 'Only people with access can see it.'
                            : 'Anyone can see it.'
                        }>
                        {item.isPrivate ? 'Private' : 'Public'}
                      </ListItem>

                      {item.isArchived ? (
                        <ListItem
                          leading={<Icon name={Icons.archived} size={20} />}
                          supportingText="Read-only. It accepts no new changes.">
                          Archived
                        </ListItem>
                      ) : null}

                      {item.isFork ? (
                        <ListItem
                          leading={<Icon name={Icons.fork} size={20} />}
                          supportingText="Forked from another repository.">
                          Fork
                        </ListItem>
                      ) : null}

                      {item.language ? (
                        <ListItem
                          leading={<Icon name={iconForLanguage(item.language)} size={20} />}
                          supportingText="Primary language">
                          {item.language}
                        </ListItem>
                      ) : null}

                      {item.defaultBranch ? (
                        <ListItem
                          leading={<Icon name={Icons.branch} size={20} />}
                          supportingText="Default branch">
                          {item.defaultBranch}
                        </ListItem>
                      ) : null}

                      {item.stars !== undefined ? (
                        <ListItem
                          leading={<Icon name={Icons.star} size={20} />}
                          supportingText={
                            item.forks !== undefined
                              ? `${item.forks} fork${item.forks === 1 ? '' : 's'}`
                              : 'Stars'
                          }>
                          {`${item.stars} star${item.stars === 1 ? '' : 's'}`}
                        </ListItem>
                      ) : null}

                      {item.updatedAt ? (
                        <ListItem
                          leading={<Icon name={Icons.history} size={20} />}
                          supportingText="Last updated">
                          {relativeTime(item.updatedAt)}
                        </ListItem>
                      ) : null}
                    </>
                  ) : null}
                </FieldGroup.Section>

                {provider.capabilities.canReadReadme ? <ReadmeSection target={target} /> : null}
              </>
            ) : null}

            {waitingForBranch ? (
              <FieldGroup.Section style={androidSectionStyle}>
                <ListItem leading={<Icon name={Icons.branch} size={20} />}>
                  Finding the default branch…
                </ListItem>
              </FieldGroup.Section>
            ) : null}

            {active === 'code' && !waitingForBranch ? (
              <FileBrowserSection
                // Keyed by branch so switching starts again at the root: the folder open
                // on one branch may not exist on the next.
                key={ref ?? 'default'}
                target={fileTarget}
                style={androidSectionStyle}
                onOpenFile={(entry) =>
                  router.push({
                    pathname: '/file',
                    params: {
                      account,
                      owner: target.owner,
                      name: target.repo,
                      path: entry.path,
                      ref: ref ?? '',
                    },
                  })
                }
              />
            ) : null}
            {active === 'pulls' ? <PullsSection target={target} /> : null}
            {active === 'issues' ? <IssuesSection target={target} state={issueState} /> : null}
            {active === 'commits' && !waitingForBranch ? (
              <CommitsSection target={target} branch={ref} />
            ) : null}
          </List>
        </Host>

        {/* Floating over the list's lower corner, where every view ends in a footer or
            padding rather than something to tap. */}
        <AssistantButton account={account ?? ''} owner={owner ?? ''} name={name ?? ''} />
      </View>
    </>
  );
}

interface Target {
  provider: HostProvider | undefined;
  owner: string;
  repo: string;
}

function ReadmeSection({ target }: { target: Target }) {
  const palette = usePalette();
  const { data, isLoading, error, refetch } = useReadme(target);

  return (
    <FieldGroup.Section title="Read me" style={androidSectionStyle}>
      {isLoading ? (
        <ListItem leading={<Icon name={Icons.refresh} size={20} />}>Loading the README…</ListItem>
      ) : null}
      {error ? (
        <ListItem
          onPress={() => void refetch()}
          leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
          supportingText={errorMessage(error)}
          trailing={<Icon name={Icons.refresh} size={17} />}>
          Try loading the README again
        </ListItem>
      ) : null}
      {!isLoading && !error && !data ? (
        <ListItem
          leading={<Icon name={Icons.readme} size={20} />}
          supportingText="This repository has no README file.">
          No README
        </ListItem>
      ) : null}
      {data ? (
        <GroupedContent extraChrome={process.env.EXPO_OS === 'android' ? 32 : 0}>
          <View style={styles.readme}>
            <Markdown source={data} />
          </View>
        </GroupedContent>
      ) : null}
    </FieldGroup.Section>
  );
}

function PullsSection({ target }: { target: Target }) {
  const router = useRouter();
  const palette = usePalette();
  const { items, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePullRequests(target);

  return (
    <FieldGroup.Section title="Pull requests" style={androidSectionStyle}>
      {isLoading ? (
        <ListItem leading={<Icon name={Icons.refresh} size={20} />}>
          Loading pull requests…
        </ListItem>
      ) : null}
      {error ? (
        <ListItem
          onPress={() => void refetch()}
          leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
          supportingText={errorMessage(error)}
          trailing={<Icon name={Icons.refresh} size={17} />}>
          Try loading pull requests again
        </ListItem>
      ) : null}
      {!isLoading && !error && items.length === 0 ? (
        <ListItem
          leading={<Icon name={Icons.pullRequest} size={20} />}
          supportingText="Nothing is waiting to be merged.">
          No open pull requests
        </ListItem>
      ) : null}

      {items.map((pull) => (
        <PullRequestRow
          key={pull.number}
          pull={pull}
          showChevron
          grouped
          onPress={() => {
            if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
            router.push({
              pathname: '/pull',
              params: {
                account: accountKeyOf(target),
                owner: target.owner,
                name: target.repo,
                number: String(pull.number),
              },
            });
          }}
        />
      ))}

      {hasNextPage ? (
        <ListItem
          onPress={isFetchingNextPage ? undefined : () => void fetchNextPage()}
          leading={<Icon name={Icons.refresh} size={20} />}>
          {isFetchingNextPage ? 'Loading more…' : 'Load more pull requests'}
        </ListItem>
      ) : null}

      <FieldGroup.SectionFooter>
        <Text>Most recently updated first. Pull down to refresh.</Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}

/**
 * The issues in one state, open or closed.
 *
 * The state is chosen by the pills in the screen's pinned bar and handed in, rather than
 * chosen here: the bar is outside the list this section lives in, so the choice has to
 * live above both of them.
 */
function IssuesSection({ target, state }: { target: Target; state: 'open' | 'closed' }) {
  const router = useRouter();
  const palette = usePalette();
  const { items, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useIssues(target, state);

  const heading = state === 'open' ? 'Open issues' : 'Closed issues';

  return (
    <FieldGroup.Section title={heading} style={androidSectionStyle}>
      {isLoading ? (
        <ListItem leading={<Icon name={Icons.refresh} size={20} />}>
          {`Loading ${heading.toLowerCase()}…`}
        </ListItem>
      ) : null}
      {error ? (
        <ListItem
          onPress={() => void refetch()}
          leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
          supportingText={errorMessage(error)}
          trailing={<Icon name={Icons.refresh} size={17} />}>
          Try loading issues again
        </ListItem>
      ) : null}
      {!isLoading && !error && items.length === 0 ? (
        <ListItem
          leading={<Icon name={state === 'open' ? Icons.issue : Icons.issueClosed} size={20} />}
          supportingText={
            state === 'open' ? 'Nothing is waiting on anyone.' : 'Nothing has been closed yet.'
          }>
          {`No ${heading.toLowerCase()}`}
        </ListItem>
      ) : null}

      {items.map((issue) => (
        <IssueRow
          key={issue.number}
          issue={issue}
          showChevron
          grouped
          onPress={() => {
            if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
            router.push({
              pathname: '/issue',
              params: {
                account: accountKeyOf(target),
                owner: target.owner,
                name: target.repo,
                number: String(issue.number),
              },
            });
          }}
        />
      ))}

      {hasNextPage ? (
        <ListItem
          onPress={isFetchingNextPage ? undefined : () => void fetchNextPage()}
          leading={<Icon name={Icons.refresh} size={20} />}>
          {isFetchingNextPage ? 'Loading more…' : 'Load more issues'}
        </ListItem>
      ) : null}

      <FieldGroup.SectionFooter>
        <Text>Most recently updated first. Pull down to refresh.</Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}

function CommitsSection({ target, branch }: { target: Target; branch: string | undefined }) {
  const router = useRouter();
  const palette = usePalette();
  const { items, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCommits(target, branch);
  const host = target.provider ? hostLabel(target.provider.account) : 'the site';
  // A site whose manifest describes no single-commit read still has a page for every
  // commit, so the row keeps working there - it just opens the site instead.
  const opensHere = !!target.provider?.capabilities.canReadCommit;
  const order = branch ? `Newest first on ${branch}.` : 'Newest first.';

  return (
    <FieldGroup.Section title="Commits" style={androidSectionStyle}>
      {isLoading ? (
        <ListItem leading={<Icon name={Icons.refresh} size={20} />}>Loading commits…</ListItem>
      ) : null}
      {error ? (
        <ListItem
          onPress={() => void refetch()}
          leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
          supportingText={errorMessage(error)}
          trailing={<Icon name={Icons.refresh} size={17} />}>
          Try loading commits again
        </ListItem>
      ) : null}
      {!isLoading && !error && items.length === 0 ? (
        <ListItem
          leading={<Icon name={Icons.commit} size={20} />}
          supportingText="This branch has no history yet.">
          No commits
        </ListItem>
      ) : null}

      {items.map((commit) => (
        <CommitRow
          key={commit.sha}
          commit={commit}
          showChevron={opensHere}
          grouped
          onPress={() => {
            if (opensHere) {
              if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
              router.push({
                pathname: '/commit',
                params: {
                  account: accountKeyOf(target),
                  owner: target.owner,
                  name: target.repo,
                  sha: commit.sha,
                },
              });
              return;
            }
            const url = target.provider?.webUrl('commit', {
              owner: target.owner,
              repo: target.repo,
              sha: commit.sha,
            });
            if (url) void WebBrowser.openBrowserAsync(url);
          }}
        />
      ))}

      {hasNextPage ? (
        <ListItem
          onPress={isFetchingNextPage ? undefined : () => void fetchNextPage()}
          leading={<Icon name={Icons.refresh} size={20} />}>
          {isFetchingNextPage ? 'Loading more…' : 'Load more commits'}
        </ListItem>
      ) : null}

      <FieldGroup.SectionFooter>
        <Text>
          {opensHere ? `${order} Pull down to refresh.` : `${order} A commit opens on ${host}.`}
        </Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}

/** The key the sub-screens need, taken back off the provider the section already has. */
function accountKeyOf(target: Target): string {
  const account = target.provider?.account;
  return account ? accountKey(account) : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The hosting site did not return this content.';
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  readme: {
    paddingVertical: Spacing.two,
  },
});
