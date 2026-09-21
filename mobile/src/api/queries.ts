/**
 * Every network read in the app.
 *
 * Two shapes, and the split between them is deliberate.
 *
 * The **merged** lists - your repositories, your notifications - ask every signed-in site
 * at once and interleave the answers. These do not page. Paging a merged list is not
 * really definable: four sites with four different orderings have no shared page two, and
 * pretending otherwise produces a list that shuffles as you scroll. GitHub Mobile's own
 * "Repositories" is the same first-page-per-source list.
 *
 * The **per-repository** lists - pull requests, issues, commits - come from exactly one
 * site, so they page properly with `useInfiniteQuery` and keep going until the site says
 * there is no more.
 */

import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { HostProvider, Page } from '../hosts/provider';
import { accountKey } from '../hosts/types';
import type {
  Branch,
  ChangedFile,
  TreeEntry,
  Comment,
  Commit,
  CommitDetail,
  Issue,
  Notification,
  PullRequest,
  Repository,
  Sourced,
} from '../hosts/types';
import { useAccounts } from '../state/accounts';

/** Identifies the set of signed-in sites, so signing one out refetches the merged lists. */
function sourcesKey(providers: HostProvider[]): string[] {
  return providers.map((provider) => accountKey(provider.account)).sort();
}

/**
 * Asks every provider for its first page and merges what comes back.
 *
 * One site being down must not empty the list: a provider that throws contributes nothing
 * and the others still render. Which site failed is reported separately rather than as an
 * error for the whole query, because "GitLab is unreachable" is a footnote when the other
 * three answered.
 */
async function fanOut<T>(
  providers: HostProvider[],
  fetch: (provider: HostProvider) => Promise<Page<T>>
): Promise<{ items: Sourced<T>[]; failures: { account: string; message: string }[] }> {
  const settled = await Promise.allSettled(providers.map(fetch));

  const items: Sourced<T>[] = [];
  const failures: { account: string; message: string }[] = [];

  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === 'fulfilled') {
      for (const item of result.value.items) {
        items.push({ account: provider.account, item });
      }
    } else {
      failures.push({
        account: provider.account.baseUrl,
        message: result.reason instanceof Error ? result.reason.message : 'Failed.',
      });
    }
  });

  return { items, failures };
}

/** Newest first, with anything undated sorted last rather than treated as ancient. */
function byRecency<T extends { updatedAt?: string }>(a: Sourced<T>, b: Sourced<T>): number {
  const left = a.item.updatedAt ? Date.parse(a.item.updatedAt) : Number.NEGATIVE_INFINITY;
  const right = b.item.updatedAt ? Date.parse(b.item.updatedAt) : Number.NEGATIVE_INFINITY;
  return right - left;
}

export interface MergedResult<T> {
  items: Sourced<T>[];
  failures: { account: string; message: string }[];
}

// ------------------------------------------------------------ Merged lists

export function useRepositories(): UseQueryResult<MergedResult<Repository>> {
  const { visibleProviders, isLoading } = useAccounts();

  return useQuery({
    // The sources are part of the key, so switching account swaps to that account's
    // cached list rather than refetching everything and blanking the screen.
    queryKey: ['repositories', sourcesKey(visibleProviders)],
    enabled: !isLoading,
    queryFn: async () => {
      const { items, failures } = await fanOut(visibleProviders, (provider) =>
        provider.listRepositories()
      );
      return { items: items.sort(byRecency), failures };
    },
  });
}

export function useNotifications(): UseQueryResult<MergedResult<Notification>> {
  const { visibleProviders, isLoading } = useAccounts();
  const able = visibleProviders.filter((provider) => provider.capabilities.canListNotifications);

  return useQuery({
    queryKey: ['notifications', sourcesKey(able)],
    enabled: !isLoading,
    // The inbox is the one list people pull to refresh at, so it goes stale quickly.
    staleTime: 30_000,
    queryFn: async () => {
      const { items, failures } = await fanOut(able, (provider) => provider.listNotifications());
      return { items: items.sort(byRecency), failures };
    },
  });
}

interface MarkNotificationReadInput {
  provider: HostProvider;
  notification: Notification;
}

/**
 * Marks an inbox row read immediately, then reconciles it with the hosting site.
 *
 * Every cached account-filter variation is updated because the same notification can
 * appear in both the all-accounts inbox and its single-account inbox. A failed request
 * restores the unread dot before refreshing the authoritative list.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, notification }: MarkNotificationReadInput) =>
      provider.markNotificationRead(notification.id),
    onMutate: async ({ provider, notification }: MarkNotificationReadInput) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      setNotificationReadState(queryClient, provider, notification.id, false);
    },
    onError: (_error, { provider, notification }) => {
      setNotificationReadState(queryClient, provider, notification.id, true);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

function setNotificationReadState(
  queryClient: ReturnType<typeof useQueryClient>,
  provider: HostProvider,
  id: string,
  isUnread: boolean
) {
  const source = accountKey(provider.account);
  queryClient.setQueriesData<MergedResult<Notification>>(
    { queryKey: ['notifications'] },
    (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((entry) =>
          accountKey(entry.account) === source && entry.item.id === id
            ? { ...entry, item: { ...entry.item, isUnread } }
            : entry
        ),
      };
    }
  );
}

/**
 * Repository search across every site that can be searched.
 *
 * Disabled below two characters. A one-letter query matches most of a large forge and
 * costs a round trip to every site to say so.
 */
export function useRepositorySearch(query: string): UseQueryResult<MergedResult<Repository>> {
  const { visibleProviders, isLoading } = useAccounts();
  const able = visibleProviders.filter((provider) => provider.capabilities.canSearchRepositories);
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['repository-search', trimmed, sourcesKey(able)],
    enabled: !isLoading && trimmed.length >= 2,
    queryFn: async () => {
      const { items, failures } = await fanOut(able, (provider) =>
        provider.searchRepositories(trimmed)
      );
      return { items, failures };
    },
  });
}

// ------------------------------------------------- One repository, paged

/** The flat list an infinite query really wants, rather than its pages. */
function flatten<T>(result: UseInfiniteQueryResult<{ pages: Page<T>[] }>): T[] {
  return result.data?.pages.flatMap((page) => page.items) ?? [];
}

interface RepoTarget {
  provider: HostProvider | undefined;
  owner: string;
  repo: string;
  /** Branch, tag, or commit used by repository tree and file reads. */
  ref?: string;
}

function repoKey({ provider, owner, repo }: RepoTarget): string[] {
  return [provider ? accountKey(provider.account) : 'none', owner, repo];
}

/** Shared paging: keep asking while the site says there is more. */
const pageOptions = {
  initialPageParam: 1,
  getNextPageParam: (last: Page<unknown>, all: unknown[]) =>
    last.hasMore ? all.length + 1 : undefined,
};

export function usePullRequests(target: RepoTarget) {
  const { provider } = target;
  const query = useInfiniteQuery({
    queryKey: ['pull-requests', ...repoKey(target)],
    enabled: !!provider?.capabilities.canListPullRequests,
    queryFn: ({ pageParam }) => provider!.listPullRequests(target.owner, target.repo, pageParam),
    ...pageOptions,
  });
  return { ...query, items: flatten(query) as PullRequest[] };
}

export function useIssues(target: RepoTarget, state: 'open' | 'closed') {
  const { provider } = target;
  const query = useInfiniteQuery({
    queryKey: ['issues', ...repoKey(target), state],
    enabled: !!provider?.capabilities.canListIssues,
    queryFn: ({ pageParam }) =>
      provider!.listIssues(target.owner, target.repo, state, pageParam),
    ...pageOptions,
  });
  return { ...query, items: flatten(query) as Issue[] };
}

export function useCommits(target: RepoTarget, ref?: string) {
  const { provider } = target;
  const query = useInfiniteQuery({
    queryKey: ['commits', ...repoKey(target), ref ?? 'default'],
    enabled: !!provider,
    queryFn: ({ pageParam }) => provider!.listCommits(target.owner, target.repo, ref, pageParam),
    ...pageOptions,
  });
  return { ...query, items: flatten(query) as Commit[] };
}

// ------------------------------------------------------------ Single reads

export function useRepository(target: RepoTarget): UseQueryResult<Repository | undefined> {
  const { provider } = target;
  return useQuery({
    queryKey: ['repository', ...repoKey(target)],
    enabled: !!provider,
    queryFn: () => provider!.getRepository(target.owner, target.repo),
  });
}

/**
 * A repository's branches, for the branch switcher.
 *
 * `enabled` so the screen can ask only while a view that cares about branches is showing
 * - Code and Commits - rather than on every repository it opens. A site whose manifest
 * names no branches endpoint answers with an empty list and no request at all, which
 * hides the switcher without a capability flag to check.
 */
export function useBranches(target: RepoTarget, enabled = true): UseQueryResult<Branch[]> {
  const { provider } = target;
  return useQuery({
    queryKey: ['branches', ...repoKey(target)],
    enabled: enabled && !!provider,
    staleTime: 5 * 60_000,
    queryFn: async () => (await provider!.listBranches(target.owner, target.repo)).items,
  });
}

export function useReadme(target: RepoTarget): UseQueryResult<string | null> {
  const { provider } = target;
  return useQuery({
    queryKey: ['readme', ...repoKey(target)],
    enabled: !!provider,
    // A README changes far less often than anything else on the screen.
    staleTime: 10 * 60_000,
    // `null` for a repository with no README. The provider says so with `undefined`, and
    // a query resolving to undefined is treated as a failure - "Try loading the README
    // again" on every repository that simply has none.
    queryFn: async () => (await provider!.getReadme(target.owner, target.repo)) ?? null,
  });
}

export function usePullRequest(
  target: RepoTarget,
  number: number
): UseQueryResult<PullRequest | undefined> {
  const { provider } = target;
  return useQuery({
    queryKey: ['pull-request', ...repoKey(target), number],
    enabled: !!provider,
    queryFn: () => provider!.getPullRequest(target.owner, target.repo, number),
  });
}

export function useIssue(target: RepoTarget, number: number): UseQueryResult<Issue | undefined> {
  const { provider } = target;
  return useQuery({
    queryKey: ['issue', ...repoKey(target), number],
    enabled: !!provider,
    queryFn: () => provider!.getIssue(target.owner, target.repo, number),
  });
}

export function useComments(
  target: RepoTarget,
  number: number,
  kind: 'issue' | 'pullRequest'
): UseQueryResult<Comment[]> {
  const { provider } = target;
  return useQuery({
    queryKey: ['comments', ...repoKey(target), kind, number],
    enabled: !!provider,
    queryFn: async () =>
      (await provider!.listComments(target.owner, target.repo, number, kind)).items,
  });
}

/**
 * One directory of a repository.
 *
 * Not paged: a directory with more entries than a page is rare, and the alternative -
 * a "load more" halfway down a folder listing - is worse than showing the first hundred.
 */
export function useTree(target: RepoTarget, path: string): UseQueryResult<TreeEntry[]> {
  return useQuery(treeQuery(target, path));
}

/**
 * Several directories at once: every folder open in the code viewer's file tree. The same
 * queries as `useTree`, so a folder already opened in the repository's file browser opens
 * here without asking the site again.
 */
export function useTrees(target: RepoTarget, paths: string[]): UseQueryResult<TreeEntry[]>[] {
  return useQueries({ queries: paths.map((path) => treeQuery(target, path)) });
}

function treeQuery(target: RepoTarget, path: string) {
  const { provider } = target;
  return queryOptions({
    queryKey: ['tree', ...repoKey(target), target.ref ?? '', path],
    enabled: !!provider?.capabilities.canReadFiles,
    // A repository's shape changes far less often than its issues do.
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await provider!.listTree(target.owner, target.repo, path, target.ref)).items,
  });
}

export function useFile(target: RepoTarget, path: string): UseQueryResult<string | undefined> {
  const { provider } = target;
  return useQuery({
    queryKey: ['file', ...repoKey(target), target.ref ?? '', path],
    enabled: !!provider && path.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => provider!.getFile(target.owner, target.repo, path, target.ref),
  });
}

export function useChangedFiles(
  target: RepoTarget,
  number: number
): UseQueryResult<ChangedFile[]> {
  const { provider } = target;
  return useQuery({
    queryKey: ['changed-files', ...repoKey(target), number],
    enabled: !!provider,
    queryFn: async () =>
      (await provider!.listPullRequestFiles(target.owner, target.repo, number)).items,
  });
}

/**
 * Complete pull-request diff, fetched only as a fallback for omitted per-file patches.
 *
 * One query is shared by every file in the pull request, so opening a second omitted
 * patch reuses the already downloaded raw diff.
 */
export function usePullRequestDiff(
  target: RepoTarget,
  number: number,
  enabled: boolean
): UseQueryResult<string | undefined> {
  const { provider } = target;
  return useQuery({
    queryKey: ['pull-request-diff', ...repoKey(target), number],
    enabled: enabled && !!provider,
    staleTime: 5 * 60_000,
    queryFn: () => provider!.getPullRequestDiff(target.owner, target.repo, number),
  });
}

// ------------------------------------------------------------ One commit

/**
 * The single-commit read, shared by the screen that shows the commit and the query that
 * digs its files out of it.
 *
 * Never stale: a commit is named by the hash of its own content, so what came back once
 * is what will come back every time. `null` for "the site sent nothing", because a query
 * that resolves to `undefined` is treated as a failure.
 */
function commitQuery(target: RepoTarget, sha: string) {
  const { provider } = target;
  return queryOptions({
    queryKey: ['commit', ...repoKey(target), sha],
    staleTime: Infinity,
    queryFn: async () => (await provider!.getCommit(target.owner, target.repo, sha)) ?? null,
  });
}

export function useCommit(target: RepoTarget, sha: string): UseQueryResult<CommitDetail | null> {
  return useQuery({
    ...commitQuery(target, sha),
    enabled: !!target.provider?.capabilities.canReadCommit && sha.length > 0,
  });
}

/**
 * What a commit changed, from wherever the site keeps it.
 *
 * GitHub and Gitea send the files inside the commit, so on those this reads the commit
 * query's cache - the screen showing the commit has usually fetched it already, and
 * TanStack joins the request if it is still in flight. GitLab lists them separately.
 */
export function useCommitFiles(target: RepoTarget, sha: string): UseQueryResult<ChangedFile[]> {
  const { provider } = target;
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['commit-files', ...repoKey(target), sha],
    enabled: !!provider?.capabilities.canReadCommit && sha.length > 0,
    staleTime: Infinity,
    queryFn: () =>
      provider!.listCommitFiles(
        target.owner,
        target.repo,
        sha,
        async () => (await queryClient.ensureQueryData(commitQuery(target, sha))) ?? undefined
      ),
  });
}

/**
 * A commit's whole raw diff, fetched only as the fallback for a file still without a patch
 * once the files are in - GitHub leaves one off a file too large to inline. Shared by all
 * of the commit's files, as `usePullRequestDiff` is by a pull request's. (Gitea's bare
 * file list is completed from the same diff by the provider, before it gets here.)
 */
export function useCommitDiff(
  target: RepoTarget,
  sha: string,
  enabled: boolean
): UseQueryResult<string> {
  const { provider } = target;
  return useQuery({
    queryKey: ['commit-diff', ...repoKey(target), sha],
    enabled: enabled && !!provider && sha.length > 0,
    staleTime: Infinity,
    // An empty string rather than undefined for an empty diff, for the same reason.
    queryFn: async () => (await provider!.getCommitDiff(target.owner, target.repo, sha)) ?? '',
  });
}
