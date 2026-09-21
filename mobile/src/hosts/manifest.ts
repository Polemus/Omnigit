/**
 * The JSON description of a git hosting site.
 *
 * This is deliberately the *same* format the desktop app reads - see
 * `docs/host-manifests.md` and `src/Omnigit/HostProviders/HostManifest.cs`. A manifest
 * written for one runs on the other, so a site someone added on their laptop works on
 * their phone without being described twice.
 *
 * Mobile needs more of a site than the desktop does: the desktop clones a repository and
 * asks git the rest, while a phone never clones and has to ask the site for everything it
 * shows. The extra endpoints and field maps below are therefore *additive* - the desktop
 * ignores keys it doesn't know, so one file still serves both.
 */

/**
 * Points at a value inside the site's JSON, by dotted path.
 *
 * Accepts a plain string (`"clone_url"`, `"owner.login"`) or, where a site encodes a
 * boolean as a string, the object form `{ path: "visibility", equals: "private" }`.
 * GitLab needs exactly that for private repositories.
 */
export type FieldRef = string | { path: string; equals: string };

/** Probe a path and check a field exists, e.g. `/api/v1/version` -> `version`. */
export interface RecogniseRule {
  path: string;
  expectField: string;
}

/** The HTTP header carrying the token. `{token}` is substituted. */
export interface HeaderTemplate {
  name: string;
  value: string;
}

/**
 * Every address the app knows how to ask for. `{owner}`, `{repo}`, `{number}`, `{state}`,
 * `{ref}`, `{path}` and `{query}` are substituted where they appear.
 *
 * An empty or missing endpoint is a real answer, not a failure: it means the site cannot
 * be asked, and the screen that would have shown it hides itself rather than offering a
 * call that returns nothing. That is what `capabilitiesOf` is derived from.
 */
export interface EndpointSet {
  /** Desktop and mobile. */
  currentUser?: string;
  repositories?: string;
  owners?: string;
  pullRequests?: string;

  /** Mobile additions. */
  repository?: string;
  issues?: string;
  issue?: string;
  pullRequest?: string;
  pullRequestFiles?: string;
  /** Whole pull-request diff, used when a file-list row omits its inline patch. */
  pullRequestDiff?: string;
  pullRequestCommits?: string;
  comments?: string;
  /**
   * Comments on a pull request, where the site files them apart from an issue's.
   *
   * GitHub and Gitea keep both under `/issues/{number}/comments` and need only
   * `comments`. GitLab has `/merge_requests/{number}/notes`, so it fills in both.
   */
  pullRequestComments?: string;
  commits?: string;
  /** One commit, over `{sha}`. What makes a commit open in the app rather than the site. */
  commit?: string;
  /**
   * A commit's changed files, where the site serves them apart from the commit.
   *
   * GitHub and Gitea embed the files in the commit response itself - see
   * `commitFields.files` - so only GitLab, which has `/commits/{sha}/diff`, names this.
   */
  commitFiles?: string;
  /**
   * A commit's whole raw diff, for when a file arrives without its own patch: Gitea's
   * commit files never carry one, and GitHub leaves it off very large files. The same
   * fallback `pullRequestDiff` is for pull requests.
   */
  commitDiff?: string;
  branches?: string;
  readme?: string;
  contents?: string;
  /**
   * One directory's entries. `{path}` is empty at the repository root.
   *
   * Separate from `contents` because GitLab lists a directory from one address and reads
   * a file from another. GitHub and Gitea serve both from `contents`, and simply name it
   * twice rather than gaining a special case.
   */
  tree?: string;
  /** Primary notification list. Usually configured to include read items as well. */
  notifications?: string;
  /** Optional second list for hosts that cannot return read and unread items together. */
  readNotifications?: string;
  /** Marks one notification thread as read. `{id}` is the notification's mapped id. */
  markNotificationRead?: string;
  searchRepositories?: string;
  starred?: string;
}

export interface UserFieldMap {
  login?: FieldRef;
  displayName?: FieldRef;
  avatarUrl?: FieldRef;
}

export interface RepositoryFieldMap {
  name?: FieldRef;
  owner?: FieldRef;
  cloneUrl?: FieldRef;
  defaultBranch?: FieldRef;
  isPrivate?: FieldRef;
  description?: FieldRef;
  updatedAt?: FieldRef;
  /** Mobile additions - a phone shows a repository rather than cloning it. */
  stars?: FieldRef;
  forks?: FieldRef;
  openIssues?: FieldRef;
  language?: FieldRef;
  isFork?: FieldRef;
  isArchived?: FieldRef;
  webUrl?: FieldRef;
  avatarUrl?: FieldRef;
}

export interface PullRequestFieldMap {
  number?: FieldRef;
  title?: FieldRef;
  author?: FieldRef;
  sourceBranch?: FieldRef;
  targetBranch?: FieldRef;
  isDraft?: FieldRef;
  updatedAt?: FieldRef;
  webUrl?: FieldRef;
  /** Mobile additions. */
  body?: FieldRef;
  state?: FieldRef;
  isMerged?: FieldRef;
  authorAvatarUrl?: FieldRef;
  commentCount?: FieldRef;
  additions?: FieldRef;
  deletions?: FieldRef;
  changedFiles?: FieldRef;
  createdAt?: FieldRef;
  labels?: FieldRef;
}

/**
 * An issue's parts. Defaults are GitHub's shape, which Gitea copied.
 *
 * Note there is no `isPullRequest` mapping here to keep merge requests out of the issue
 * list: that is `pullRequestMarker` below, because it is a *filter* rather than a field
 * to display, and only GitHub needs it.
 */
export interface IssueFieldMap {
  number?: FieldRef;
  title?: FieldRef;
  author?: FieldRef;
  authorAvatarUrl?: FieldRef;
  state?: FieldRef;
  body?: FieldRef;
  commentCount?: FieldRef;
  createdAt?: FieldRef;
  updatedAt?: FieldRef;
  webUrl?: FieldRef;
  labels?: FieldRef;
}

/** A label, which every forge models as a name and a colour but names differently. */
export interface LabelFieldMap {
  name?: FieldRef;
  color?: FieldRef;
}

export interface CommentFieldMap {
  author?: FieldRef;
  authorAvatarUrl?: FieldRef;
  body?: FieldRef;
  createdAt?: FieldRef;
}

export interface CommitFieldMap {
  sha?: FieldRef;
  message?: FieldRef;
  author?: FieldRef;
  authorAvatarUrl?: FieldRef;
  committedAt?: FieldRef;
  /** Line totals, read from the single-commit response. */
  additions?: FieldRef;
  deletions?: FieldRef;
  /**
   * Where the changed files sit inside the single-commit response, on sites that embed
   * them. Each is read with `changedFileFields`, like a pull request's files.
   */
  files?: FieldRef;
}

export interface BranchFieldMap {
  name?: FieldRef;
  sha?: FieldRef;
}

/**
 * One entry in a directory listing.
 *
 * `type` is normalised by the provider rather than by the manifest, because the two
 * spellings in the wild - GitHub's `dir`/`file` and GitLab's `tree`/`blob` - are a closed
 * set. A manifest naming the field is enough; it does not also have to translate it.
 */
export interface TreeFieldMap {
  name?: FieldRef;
  path?: FieldRef;
  type?: FieldRef;
  size?: FieldRef;
}

/** A changed file in a pull request. */
export interface ChangedFileFieldMap {
  path?: FieldRef;
  status?: FieldRef;
  additions?: FieldRef;
  deletions?: FieldRef;
  patch?: FieldRef;
}

export interface NotificationFieldMap {
  id?: FieldRef;
  title?: FieldRef;
  /** "Issue", "PullRequest", "Commit" - spelled differently per site. */
  type?: FieldRef;
  repository?: FieldRef;
  updatedAt?: FieldRef;
  isUnread?: FieldRef;
  webUrl?: FieldRef;
}

/** What to hand a git HTTPS remote. `{login}` and `{token}` are substituted. */
export interface CredentialTemplate {
  username?: string;
  password?: string;
}

/** Pages on the site's own website, as opposed to its API. */
export interface WebUrlTemplates {
  commit?: string;
  newPullRequest?: string;
  /** Mobile additions - a phone links out where it cannot render something itself. */
  repository?: string;
  pullRequest?: string;
  issue?: string;
  blob?: string;
  tokenSettings?: string;
}

/**
 * GitHub's browser login, which needs its own addresses because polling for approval is
 * a conversation rather than one call. Every other site signs in with a token the user
 * pastes, which is why `token` is the only method the desktop's manifests declare.
 */
export interface DeviceLoginRule {
  clientId: string;
  codePath: string;
  tokenPath: string;
  scope?: string;
}

export interface HostManifest {
  id: string;
  displayName: string;
  auth?: ('token' | 'device')[];

  /** Where the site lives when the user has not said. Empty for self-hosted-only sites. */
  defaultBaseUrl?: string;

  /**
   * Where the API is, when that is not the origin the user signs in at.
   *
   * Absolute names another host outright - github.com's API is on api.github.com.
   * Relative is a path under the site's own origin, which is how a self-hosted instance
   * puts its API at `api/v3` without knowing its own domain name. Omitted everywhere
   * else, because most forges serve both from one place.
   */
  apiBaseUrl?: string;
  /** A one-line hint shown under the token box on the sign-in screen. */
  tokenHelp?: string;

  recognise?: RecogniseRule;
  authHeader?: HeaderTemplate;
  deviceLogin?: DeviceLoginRule;
  endpoints?: EndpointSet;

  userFields?: UserFieldMap;
  repositoryFields?: RepositoryFieldMap;
  pullRequestFields?: PullRequestFieldMap;
  issueFields?: IssueFieldMap;
  labelFields?: LabelFieldMap;
  commentFields?: CommentFieldMap;
  commitFields?: CommitFieldMap;
  branchFields?: BranchFieldMap;
  treeFields?: TreeFieldMap;
  changedFileFields?: ChangedFileFieldMap;
  notificationFields?: NotificationFieldMap;

  /** Media type requested from `pullRequestDiff` when a forge requires one. */
  pullRequestDiffAccept?: string;

  /** Media type requested from `commitDiff`, for the same reason. */
  commitDiffAccept?: string;

  /** HTTP verb used by `markNotificationRead`. PATCH is the common default. */
  markNotificationReadMethod?: 'PATCH' | 'POST' | 'PUT';

  /**
   * How to tell a pull request from an issue in a combined list. GitHub returns both from
   * `/issues` and marks the pull requests with a `pull_request` object; Gitea and GitLab
   * keep them apart, so they need none of this.
   */
  pullRequestMarker?: string;

  /**
   * How this site spells the two states an issue can be in, substituted for `{state}`.
   *
   * GitHub and Gitea say `open`; GitLab says `opened`. One word, but asking GitLab for
   * `state=open` returns everything rather than failing, so without this the closed
   * filter silently does nothing - the worst kind of wrong.
   */
  issueStates?: { open?: string; closed?: string };

  pullRequestRef?: string;
  gitCredentials?: CredentialTemplate;
  webUrls?: WebUrlTemplates;
}

/**
 * What a site can actually do, derived from which endpoints its manifest fills in.
 *
 * Derived rather than declared so a manifest cannot claim a feature it has not described
 * - the screen and the endpoint can never disagree.
 */
export interface HostCapabilities {
  canListRepositories: boolean;
  canListPullRequests: boolean;
  canListIssues: boolean;
  canListNotifications: boolean;
  canMarkNotificationsRead: boolean;
  canSearchRepositories: boolean;
  canReadFiles: boolean;
  canReadReadme: boolean;
  canListCommits: boolean;
  canReadCommit: boolean;
  canDeviceLogin: boolean;
}

export function capabilitiesOf(manifest: HostManifest): HostCapabilities {
  const e = manifest.endpoints ?? {};
  return {
    canListRepositories: !!e.repositories,
    canListPullRequests: !!e.pullRequests,
    canListIssues: !!e.issues,
    canListNotifications: !!e.notifications,
    canMarkNotificationsRead: !!e.markNotificationRead,
    canSearchRepositories: !!e.searchRepositories,
    canReadFiles: !!e.contents,
    canReadReadme: !!e.readme,
    canListCommits: !!e.commits,
    canReadCommit: !!e.commit,
    canDeviceLogin: !!manifest.deviceLogin && (manifest.auth ?? []).includes('device'),
  };
}
