/**
 * What the app shows, after a manifest has been applied to whatever shape a site returned.
 *
 * One set of types for every forge. GitLab calls a pull request a merge request and files
 * its fields somewhere else entirely; by the time anything reaches here that has been
 * flattened away, and no screen needs to know which site it is looking at.
 */

/** A signed-in identity on one site. The token is *not* here - see `storage/credentials`. */
export interface Account {
  /** Manifest id: "github", "gitea", ... */
  providerId: string;
  /** Origin only, no trailing slash: "https://github.com". */
  baseUrl: string;
  login: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Stable key for the credential store and for spotting duplicate sign-ins. Same shape as
 * the desktop's `HostAccount.Key`, so the two agree on what counts as the same account.
 */
export function accountKey(account: Pick<Account, 'providerId' | 'baseUrl' | 'login'>): string {
  let host = account.baseUrl;
  try {
    host = new URL(account.baseUrl).host;
  } catch {
    // A malformed URL still needs a key; using it whole is worse than nothing but stable.
  }
  return `${account.providerId}|${host}|${account.login}`;
}

export interface Label {
  name: string;
  /** Hex, without the leading hash, as every forge returns it. */
  color: string;
}

export interface Repository {
  name: string;
  owner: string;
  cloneUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description?: string;
  updatedAt?: string;
  stars?: number;
  forks?: number;
  openIssues?: number;
  language?: string;
  isFork?: boolean;
  isArchived?: boolean;
  webUrl?: string;
  avatarUrl?: string;
}

export type ReviewState = 'open' | 'closed' | 'merged' | 'draft';

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  authorAvatarUrl?: string;
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  isMerged?: boolean;
  state?: string;
  body?: string;
  commentCount?: number;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  createdAt?: string;
  updatedAt?: string;
  webUrl?: string;
  labels?: Label[];
}

export interface Issue {
  number: number;
  title: string;
  author: string;
  authorAvatarUrl?: string;
  state: string;
  body?: string;
  commentCount?: number;
  createdAt?: string;
  updatedAt?: string;
  webUrl?: string;
  labels?: Label[];
}

export interface Comment {
  author: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt?: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  authorAvatarUrl?: string;
  committedAt?: string;
}

/**
 * One commit, as its own screen shows it: the commit plus what it changed.
 *
 * `files` is filled here when the site embeds them in the commit response, and left
 * undefined when they come from a separate address - undefined meaning "not here", which
 * is not the same thing as an empty list meaning "changed nothing".
 */
export interface CommitDetail extends Commit {
  additions?: number;
  deletions?: number;
  files?: ChangedFile[];
}

export interface Branch {
  name: string;
  sha?: string;
}

/** A file or a folder in a repository's tree. */
export interface TreeEntry {
  name: string;
  /** Full path from the repository root, which is what the next call needs. */
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export type ChangeStatus = 'added' | 'modified' | 'removed' | 'renamed' | 'unknown';

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  /** A unified diff, when the site sends one. Absent for a binary or a very large file. */
  patch?: string;
}

export interface Notification {
  id: string;
  title: string;
  type: string;
  repository: string;
  updatedAt?: string;
  isUnread: boolean;
  webUrl?: string;
}

/**
 * A repository together with the account it was seen through.
 *
 * Everything in this app is a list drawn from several sites at once, so an item on its
 * own is ambiguous - two sites can hold a repository of the same name, and opening one
 * needs to know whose token to send. Carrying the account beside the item is what keeps
 * the merged lists honest.
 */
export interface Sourced<T> {
  account: Account;
  item: T;
}

/** The short sha every forge shows in a list. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** The first line of a commit message, which is all a list row has room for. */
export function commitSummary(message: string): string {
  const line = message.split('\n', 1)[0];
  return line.trim();
}

export function repoFullName(repo: Pick<Repository, 'owner' | 'name'>): string {
  return repo.owner ? `${repo.owner}/${repo.name}` : repo.name;
}
