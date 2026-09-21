/**
 * Talking to one hosting site, entirely from its manifest.
 *
 * There is no GitHub class and no Gitea class. Everything below reads addresses and field
 * paths out of a `HostManifest`, so a site someone described in JSON this morning is not a
 * second-class citizen of this file - it is the only kind of citizen there is.
 *
 * The desktop keeps GitHub in C# because its browser sign-in is a multi-step conversation
 * that endpoint descriptions could not express. Here that conversation *is* described -
 * see `deviceLogin` in the manifest - because a phone has one browser and one shape of
 * flow, so the exception the desktop had to make does not arise.
 */

import {
  capabilitiesOf,
  type EndpointSet,
  type HostCapabilities,
  type HostManifest,
} from './manifest';
import {
  fillTemplate,
  hasValue,
  readArray,
  readBoolean,
  readNumber,
  readString,
  readStringOr,
} from './field-ref';
import { lineCounts, patchesByPath } from './diff';
import { hasNextPage, pageSizeOf, withPage } from './link-header';
import { apiRoot, joinUrl } from './urls';
import type {
  Account,
  Branch,
  ChangedFile,
  ChangeStatus,
  Comment,
  Commit,
  CommitDetail,
  Issue,
  Label,
  Notification,
  PullRequest,
  Repository,
  TreeEntry,
} from './types';

/** Anything the site said no to, with enough detail for a screen to say what happened. */
export class HostError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string
  ) {
    super(message);
    this.name = 'HostError';
  }

  /** True when signing in again is the answer, rather than retrying. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** One page of a list, and whether asking again would produce more. */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

const EMPTY_PAGE: Page<never> = { items: [], hasMore: false };

/**
 * How long one request may take before it is abandoned.
 *
 * There has to be a number here and it has to be ours. iOS gives a request sixty seconds of
 * its own accord; React Native's Android client is built with no timeout at all, so a site
 * that accepts the connection and then says nothing - a server behind a VPN the phone is not
 * on, a LAN address away from that LAN, a host that resolves but no longer exists - leaves
 * its request pending for as long as the app is alive. The merged lists wait for every site
 * before they render, so on Android one such site hangs the whole screen where iOS recovers
 * by itself. Twenty seconds is longer than a slow forge needs and far shorter than forever.
 */
const REQUEST_TIMEOUT = 20_000;

/** What a call needs to name a thing on a site. Unused keys are simply not substituted. */
export interface Target {
  id?: number | string;
  owner?: string;
  repo?: string;
  number?: number | string;
  ref?: string;
  sha?: string;
  path?: string;
  state?: string;
  query?: string;
}

export class HostProvider {
  readonly capabilities: HostCapabilities;

  constructor(
    readonly manifest: HostManifest,
    readonly account: Account,
    private readonly token: string
  ) {
    this.capabilities = capabilitiesOf(manifest);
  }

  get id(): string {
    return this.manifest.id;
  }

  get displayName(): string {
    return this.manifest.displayName;
  }

  // ---------------------------------------------------------------- HTTP

  private headers(): Record<string, string> {
    const header = this.manifest.authHeader;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (header) {
      headers[header.name] = fillTemplate(header.value, { token: this.token });
    }
    return headers;
  }

  private absolute(path: string): string {
    return joinUrl(apiRoot(this.manifest, this.account.baseUrl), path);
  }

  /**
   * Performs the authenticated request and gives every response shape the same errors.
   *
   * The clock is handed back rather than stopped here: headers arriving is not the same as
   * the answer arriving, and a site that sends them and then stalls mid-body has to be
   * abandoned too. Callers `release()` once they have read what they came for.
   */
  private async request(
    path: string,
    init?: RequestInit
  ): Promise<{ response: Response; release: () => void }> {
    const url = this.absolute(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const release = () => clearTimeout(timer);

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { ...this.headers(), ...(init?.headers as Record<string, string>) },
      });
    } catch {
      release();
      throw new HostError(this.unreachable(controller), undefined, url);
    }

    if (!response.ok) {
      const refusal = new HostError(
        await describeFailure(response, this.manifest),
        response.status,
        url
      );
      release();
      throw refusal;
    }

    return { response, release };
  }

  /** Why nothing came back: given up on, or never reachable in the first place. */
  private unreachable(controller: AbortController): string {
    return controller.signal.aborted
      ? `${this.account.baseUrl} did not answer within ${REQUEST_TIMEOUT / 1000} seconds.`
      : `Could not reach ${this.account.baseUrl}. Check the connection and try again.`;
  }

  /**
   * One request, returning the parsed body and the response beside it.
   *
   * The response comes back too because paging lives in a header rather than the body,
   * and a caller that threw the response away would have to ask for the same page twice
   * to find out whether there is another one.
   */
  private async send(
    path: string,
    init?: RequestInit
  ): Promise<{ body: unknown; response: Response }> {
    const { response, release } = await this.request(path, init);
    try {
      const text = await response.text();
      const body: unknown = text.length === 0 ? null : safeParse(text);
      return { body, response };
    } catch {
      throw new HostError(`${this.account.baseUrl} stopped part way through answering.`);
    } finally {
      release();
    }
  }

  /** A successful response whose body is intentionally plain text rather than JSON. */
  private async sendText(path: string, init?: RequestInit): Promise<string> {
    const { response, release } = await this.request(path, init);
    try {
      return await response.text();
    } catch {
      throw new HostError(`${this.account.baseUrl} stopped part way through answering.`);
    } finally {
      release();
    }
  }

  /** A list endpoint, mapped and paged. */
  private async list<T>(
    endpoint: string | undefined,
    target: Target,
    page: number,
    map: (raw: unknown) => T | undefined
  ): Promise<Page<T>> {
    if (!endpoint) return EMPTY_PAGE;

    const filled = fillEndpoint(endpoint, target);
    const { body, response } = await this.send(withPage(filled, page));

    // Most endpoints return the array bare. Search wraps it - GitHub in `items`, Gitea in
    // `data` - so unwrapping here rather than in each caller keeps searching ordinary.
    const rows = unwrapList(body);

    const items = rows.map(map).filter((item): item is T => item !== undefined);

    const link = response.headers.get('link');
    const hasMore = link ? hasNextPage(link) : rows.length >= pageSizeOf(filled) && rows.length > 0;

    return { items, hasMore };
  }

  /** A single-object endpoint. */
  private async one<T>(
    endpoint: string | undefined,
    target: Target,
    map: (raw: unknown) => T
  ): Promise<T | undefined> {
    if (!endpoint) return undefined;
    const { body } = await this.send(fillTemplate(endpoint, substitutions(target)));
    if (body === null || body === undefined) return undefined;
    return map(body);
  }

  // ---------------------------------------------------------------- Reading

  listRepositories(page = 1): Promise<Page<Repository>> {
    return this.list(this.endpoint('repositories'), {}, page, (raw) => this.toRepository(raw));
  }

  searchRepositories(query: string, page = 1): Promise<Page<Repository>> {
    return this.list(
      this.endpoint('searchRepositories'),
      { query: encodeURIComponent(query) },
      page,
      (raw) => this.toRepository(raw)
    );
  }

  getRepository(owner: string, repo: string): Promise<Repository | undefined> {
    return this.one(this.endpoint('repository'), { owner, repo }, (raw) => this.toRepository(raw));
  }

  listPullRequests(owner: string, repo: string, page = 1): Promise<Page<PullRequest>> {
    return this.list(this.endpoint('pullRequests'), { owner, repo }, page, (raw) =>
      this.toPullRequest(raw)
    );
  }

  getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest | undefined> {
    return this.one(this.endpoint('pullRequest'), { owner, repo, number }, (raw) =>
      this.toPullRequest(raw)
    );
  }

  listPullRequestFiles(
    owner: string,
    repo: string,
    number: number,
    page = 1
  ): Promise<Page<ChangedFile>> {
    return this.list(this.endpoint('pullRequestFiles'), { owner, repo, number }, page, (raw) =>
      this.toChangedFile(raw)
    );
  }

  /**
   * The complete raw diff for a pull request.
   *
   * File-list responses sometimes omit their convenient per-file patch. The raw diff is
   * the authoritative fallback and is kept manifest-driven because each forge exposes it
   * at a different address (and GitHub requires a media type).
   */
  async getPullRequestDiff(
    owner: string,
    repo: string,
    number: number
  ): Promise<string | undefined> {
    const endpoint = this.endpoint('pullRequestDiff');
    if (!endpoint) return undefined;

    const accept = this.manifest.pullRequestDiffAccept;
    const text = await this.sendText(fillEndpoint(endpoint, { owner, repo, number }), {
      headers: accept ? { Accept: accept } : undefined,
    });
    return text.length > 0 ? text : undefined;
  }

  /**
   * Issues for a repository, with pull requests kept out.
   *
   * GitHub returns both from this address and marks the pull requests with a
   * `pull_request` object; Gitea and GitLab keep them apart and set no marker, so the
   * filter costs them nothing.
   */
  async listIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' = 'open',
    page = 1
  ): Promise<Page<Issue>> {
    const marker = this.manifest.pullRequestMarker;
    const spelling = this.manifest.issueStates?.[state] ?? state;
    return this.list(this.endpoint('issues'), { owner, repo, state: spelling }, page, (raw) =>
      marker && hasValue(raw, marker) ? undefined : this.toIssue(raw)
    );
  }

  getIssue(owner: string, repo: string, number: number): Promise<Issue | undefined> {
    return this.one(this.endpoint('issue'), { owner, repo, number }, (raw) => this.toIssue(raw));
  }

  /**
   * The conversation under an issue or a pull request.
   *
   * `kind` matters only where the site files the two apart: GitHub and Gitea serve both
   * from the issue address, GitLab has a separate one for merge requests. Falling back to
   * `comments` means a manifest only says so when it has to.
   */
  listComments(
    owner: string,
    repo: string,
    number: number,
    kind: 'issue' | 'pullRequest' = 'issue',
    page = 1
  ): Promise<Page<Comment>> {
    const endpoint =
      kind === 'pullRequest'
        ? (this.endpoint('pullRequestComments') ?? this.endpoint('comments'))
        : this.endpoint('comments');

    return this.list(endpoint, { owner, repo, number }, page, (raw) => this.toComment(raw));
  }

  listCommits(owner: string, repo: string, ref?: string, page = 1): Promise<Page<Commit>> {
    return this.list(this.endpoint('commits'), { owner, repo, ref: ref ?? '' }, page, (raw) =>
      this.toCommit(raw)
    );
  }

  /**
   * One commit, and what it changed where the site sends that in the same response.
   *
   * GitHub and Gitea embed the changed files in the commit itself (`commitFields.files`);
   * GitLab keeps them at a separate address, which `listCommitFiles` reads. So `files` is
   * left undefined on a site that names no such field, rather than set to an empty list
   * that would claim the commit changed nothing.
   */
  getCommit(owner: string, repo: string, sha: string): Promise<CommitDetail | undefined> {
    return this.one(this.endpoint('commit'), { owner, repo, sha }, (raw) =>
      this.toCommitDetail(raw)
    );
  }

  /**
   * What a commit changed, from wherever this site keeps it: its own list where there is
   * one, otherwise the files inside the commit.
   *
   * `commit` loads the commit for the second case, so a caller that already has it -
   * the commit screen, through its query cache - is not made to ask for it twice.
   *
   * One page, as a pull request's files are: a commit touching more than a hundred files
   * is rare, and its first hundred still say what it did.
   */
  async listCommitFiles(
    owner: string,
    repo: string,
    sha: string,
    commit: () => Promise<CommitDetail | undefined> = () => this.getCommit(owner, repo, sha)
  ): Promise<ChangedFile[]> {
    const endpoint = this.endpoint('commitFiles');
    const files = endpoint
      ? (await this.list(endpoint, { owner, repo, sha }, 1, (raw) => this.toChangedFile(raw))).items
      : ((await commit())?.files ?? []);

    return this.withPatchesFromDiff(owner, repo, sha, files);
  }

  /**
   * A commit's files completed from its whole diff, when the site listed them bare.
   *
   * Gitea names a commit's files and their status and nothing more, so every row read "No
   * line counts provided" - no + or − at all - and each file had to fetch the diff before
   * it could be opened. The whole diff is one request holding every file's patch, and
   * counting a patch gives the numbers the site left out, so a commit there now lists its
   * files the way it would anywhere else.
   *
   * Only when no file arrived with a patch. When some did - GitHub leaves one off a file
   * too large to inline - the rest are already complete, and the diff is left to the file
   * that needs it. A diff that fails to arrive costs the counts, never the list.
   */
  private async withPatchesFromDiff(
    owner: string,
    repo: string,
    sha: string,
    files: ChangedFile[]
  ): Promise<ChangedFile[]> {
    if (files.length === 0 || files.some((file) => file.patch)) return files;

    let diff: string | undefined;
    try {
      diff = await this.getCommitDiff(owner, repo, sha);
    } catch {
      return files;
    }
    if (!diff) return files;

    const patches = patchesByPath(diff);
    return files.map((file) => {
      const patch = patches.get(file.path);
      if (!patch) return file;
      const counts = file.additions > 0 || file.deletions > 0 ? file : lineCounts(patch);
      return { ...file, patch, additions: counts.additions, deletions: counts.deletions };
    });
  }

  /**
   * A commit's whole raw diff: the fallback for a changed file that arrived without its
   * own patch, exactly as `getPullRequestDiff` is for a pull request.
   */
  async getCommitDiff(owner: string, repo: string, sha: string): Promise<string | undefined> {
    const endpoint = this.endpoint('commitDiff');
    if (!endpoint) return undefined;

    const accept = this.manifest.commitDiffAccept;
    const text = await this.sendText(fillEndpoint(endpoint, { owner, repo, sha }), {
      headers: accept ? { Accept: accept } : undefined,
    });
    return text.length > 0 ? text : undefined;
  }

  listBranches(owner: string, repo: string, page = 1): Promise<Page<Branch>> {
    return this.list(this.endpoint('branches'), { owner, repo }, page, (raw) => ({
      name: readStringOr(raw, this.manifest.branchFields?.name ?? 'name', ''),
      sha: readString(raw, this.manifest.branchFields?.sha ?? 'commit.id'),
    }));
  }

  async listNotifications(page = 1): Promise<Page<Notification>> {
    const primary = await this.list(this.endpoint('notifications'), {}, page, (raw) =>
      this.toNotification(raw)
    );
    const readEndpoint = this.endpoint('readNotifications');
    if (!readEndpoint) return primary;

    // GitLab exposes pending and completed to-do items as two filtered lists. Keep that
    // provider detail here and return the same mixed notification page every screen uses.
    const read = await this.list(readEndpoint, {}, page, (raw) => this.toNotification(raw));
    const primaryIds = new Set(primary.items.map((item) => item.id).filter(Boolean));
    const uniqueRead = read.items.filter((item) => !item.id || !primaryIds.has(item.id));
    return {
      items: [...primary.items, ...uniqueRead],
      hasMore: primary.hasMore || read.hasMore,
    };
  }

  /** Marks one notification as read without coupling the inbox to a particular forge. */
  async markNotificationRead(id: string): Promise<void> {
    const endpoint = this.endpoint('markNotificationRead');
    if (!endpoint) return;

    const { release } = await this.request(fillEndpoint(endpoint, { id }), {
      method: this.manifest.markNotificationReadMethod ?? 'PATCH',
    });
    release();
  }

  /**
   * The rendered README, as markdown.
   *
   * Forges send the file base64-encoded inside a JSON envelope rather than as text, so
   * this decodes rather than returning what arrived.
   */
  async getReadme(owner: string, repo: string): Promise<string | undefined> {
    const endpoint = this.endpoint('readme');
    if (!endpoint) return undefined;
    try {
      const { body } = await this.send(fillTemplate(endpoint, substitutions({ owner, repo })));
      return decodeContent(body);
    } catch (error) {
      // A repository with no README answers 404, which is an ordinary state of the world
      // and should leave the rest of the page intact.
      if (error instanceof HostError && error.status === 404) return undefined;
      throw error;
    }
  }

  /**
   * One directory's entries, folders first and then alphabetically.
   *
   * The ordering is done here rather than left to the site, because the three of them
   * disagree - GitHub sorts alphabetically with folders mixed in, GitLab puts folders
   * first - and a file browser that reorders itself depending on which site you are
   * looking at is worse than either convention.
   */
  async listTree(owner: string, repo: string, path = '', ref?: string): Promise<Page<TreeEntry>> {
    const page = await this.list(
      this.endpoint('tree') ?? this.endpoint('contents'),
      { owner, repo, path, ref },
      1,
      (raw) => this.toTreeEntry(raw)
    );

    return { ...page, items: [...page.items].sort(byFolderThenName) };
  }

  async getFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<string | undefined> {
    const endpoint = this.endpoint('contents');
    if (!endpoint) return undefined;
    const { body } = await this.send(fillEndpoint(endpoint, { owner, repo, path, ref }));
    return decodeContent(body);
  }

  private endpoint(name: keyof EndpointSet): string | undefined {
    const value = this.manifest.endpoints?.[name];
    return value && value.length > 0 ? value : undefined;
  }

  // ---------------------------------------------------------------- Web links

  /** Where a thing lives on the site's own website, for the "Open in browser" actions. */
  webUrl(
    kind: 'repository' | 'pullRequest' | 'issue' | 'commit',
    target: Target
  ): string | undefined {
    const template = this.manifest.webUrls?.[kind];
    if (!template) return undefined;
    return fillTemplate(template, {
      base: this.account.baseUrl.replace(/\/+$/, ''),
      ...substitutions(target),
      sha: target.sha ?? '',
    });
  }

  // ---------------------------------------------------------------- Mapping

  private toRepository(raw: unknown): Repository {
    const f = this.manifest.repositoryFields ?? {};
    return {
      name: readStringOr(raw, f.name ?? 'name', ''),
      owner: readStringOr(raw, f.owner ?? 'owner.login', ''),
      cloneUrl: readStringOr(raw, f.cloneUrl ?? 'clone_url', ''),
      defaultBranch: readStringOr(raw, f.defaultBranch ?? 'default_branch', 'main'),
      isPrivate: readBoolean(raw, f.isPrivate ?? 'private'),
      description: readString(raw, f.description ?? 'description'),
      updatedAt: readString(raw, f.updatedAt ?? 'updated_at'),
      stars: readNumber(raw, f.stars),
      forks: readNumber(raw, f.forks),
      openIssues: readNumber(raw, f.openIssues),
      language: readString(raw, f.language),
      isFork: f.isFork ? readBoolean(raw, f.isFork) : undefined,
      isArchived: f.isArchived ? readBoolean(raw, f.isArchived) : undefined,
      webUrl: readString(raw, f.webUrl),
      avatarUrl: readString(raw, f.avatarUrl),
    };
  }

  private toPullRequest(raw: unknown): PullRequest {
    const f = this.manifest.pullRequestFields ?? {};
    return {
      number: readNumber(raw, f.number ?? 'number') ?? 0,
      title: readStringOr(raw, f.title ?? 'title', ''),
      author: readStringOr(raw, f.author ?? 'user.login', ''),
      authorAvatarUrl: readString(raw, f.authorAvatarUrl),
      sourceBranch: readStringOr(raw, f.sourceBranch ?? 'head.ref', ''),
      targetBranch: readStringOr(raw, f.targetBranch ?? 'base.ref', ''),
      isDraft: readBoolean(raw, f.isDraft ?? 'draft'),
      isMerged: f.isMerged ? readBoolean(raw, f.isMerged) : undefined,
      state: readString(raw, f.state),
      body: readString(raw, f.body),
      commentCount: readNumber(raw, f.commentCount),
      additions: readNumber(raw, f.additions),
      deletions: readNumber(raw, f.deletions),
      changedFiles: readNumber(raw, f.changedFiles),
      createdAt: readString(raw, f.createdAt),
      updatedAt: readString(raw, f.updatedAt ?? 'updated_at'),
      webUrl: readString(raw, f.webUrl ?? 'html_url'),
      labels: this.toLabels(raw, f.labels),
    };
  }

  private toIssue(raw: unknown): Issue {
    const f = this.manifest.issueFields ?? {};
    return {
      number: readNumber(raw, f.number ?? 'number') ?? 0,
      title: readStringOr(raw, f.title ?? 'title', ''),
      author: readStringOr(raw, f.author ?? 'user.login', ''),
      authorAvatarUrl: readString(raw, f.authorAvatarUrl),
      state: readStringOr(raw, f.state ?? 'state', 'open'),
      body: readString(raw, f.body),
      commentCount: readNumber(raw, f.commentCount),
      createdAt: readString(raw, f.createdAt),
      updatedAt: readString(raw, f.updatedAt ?? 'updated_at'),
      webUrl: readString(raw, f.webUrl ?? 'html_url'),
      labels: this.toLabels(raw, f.labels),
    };
  }

  /**
   * Labels, which arrive as objects nearly everywhere and as bare strings on GitLab.
   *
   * A string carries no colour, so those rows get one derived from the name instead -
   * stable, so the same label is the same colour every time it appears.
   */
  private toLabels(raw: unknown, ref: Parameters<typeof readArray>[1]): Label[] {
    const l = this.manifest.labelFields ?? {};
    return readArray(raw, ref)
      .map((row) =>
        typeof row === 'string'
          ? { name: row, color: colourFromName(row) }
          : {
              name: readStringOr(row, l.name ?? 'name', ''),
              color: (readString(row, l.color ?? 'color') ?? '').replace(/^#/, ''),
            }
      )
      .filter((label) => label.name.length > 0);
  }

  private toComment(raw: unknown): Comment {
    const f = this.manifest.commentFields ?? {};
    return {
      author: readStringOr(raw, f.author ?? 'user.login', ''),
      authorAvatarUrl: readString(raw, f.authorAvatarUrl),
      body: readStringOr(raw, f.body ?? 'body', ''),
      createdAt: readString(raw, f.createdAt ?? 'created_at'),
    };
  }

  private toCommit(raw: unknown): Commit {
    const f = this.manifest.commitFields ?? {};
    return {
      sha: readStringOr(raw, f.sha ?? 'sha', ''),
      message: readStringOr(raw, f.message ?? 'commit.message', ''),
      author: readStringOr(raw, f.author ?? 'commit.author.name', ''),
      authorAvatarUrl: readString(raw, f.authorAvatarUrl),
      committedAt: readString(raw, f.committedAt ?? 'commit.author.date'),
    };
  }

  private toCommitDetail(raw: unknown): CommitDetail {
    const f = this.manifest.commitFields ?? {};
    return {
      ...this.toCommit(raw),
      additions: readNumber(raw, f.additions),
      deletions: readNumber(raw, f.deletions),
      files: f.files ? readArray(raw, f.files).map((file) => this.toChangedFile(file)) : undefined,
    };
  }

  private toChangedFile(raw: unknown): ChangedFile {
    const f = this.manifest.changedFileFields ?? {};
    const patch = readString(raw, f.patch ?? 'patch');
    const additions = readNumber(raw, f.additions ?? 'additions');
    const deletions = readNumber(raw, f.deletions ?? 'deletions');

    // GitLab counts nothing per file but sends every patch, and counting a patch gives the
    // same number the other sites send - so a row can say how much changed rather than
    // that it cannot. Only when the site left the counts out, so a large pull request on
    // a site that does count is not read twice over.
    const counted =
      patch && (additions === undefined || deletions === undefined) ? lineCounts(patch) : undefined;

    return {
      path: readStringOr(raw, f.path ?? 'filename', ''),
      status: toChangeStatus(readString(raw, f.status ?? 'status')),
      additions: additions ?? counted?.additions ?? 0,
      deletions: deletions ?? counted?.deletions ?? 0,
      patch,
    };
  }

  private toTreeEntry(raw: unknown): TreeEntry {
    const f = this.manifest.treeFields ?? {};
    const name = readStringOr(raw, f.name ?? 'name', '');
    return {
      name,
      // A site that sends no path - GitLab's tree does, GitHub's does - still has to
      // produce one the next call can use, so the name is the fallback at the root.
      path: readStringOr(raw, f.path ?? 'path', name),
      type: toEntryType(readString(raw, f.type ?? 'type')),
      size: readNumber(raw, f.size ?? 'size'),
    };
  }

  private toNotification(raw: unknown): Notification {
    const f = this.manifest.notificationFields ?? {};
    return {
      id: readStringOr(raw, f.id ?? 'id', ''),
      title: readStringOr(raw, f.title ?? 'subject.title', ''),
      type: readStringOr(raw, f.type ?? 'subject.type', ''),
      repository: readStringOr(raw, f.repository ?? 'repository.full_name', ''),
      updatedAt: readString(raw, f.updatedAt ?? 'updated_at'),
      isUnread: f.isUnread ? readBoolean(raw, f.isUnread) : true,
      webUrl: readString(raw, f.webUrl),
    };
  }
}

// ---------------------------------------------------------------- Helpers

/**
 * The array inside whatever the site sent back.
 *
 * Bare from a list endpoint, wrapped in `items` by GitHub's search and in `data` by
 * Gitea's. Anything else - an error object, HTML from a captive portal - yields nothing,
 * which renders as an empty list rather than throwing inside a scroll handler.
 */
function unwrapList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    for (const key of ['items', 'data'] as const) {
      const wrapped = (body as Record<string, unknown>)[key];
      if (Array.isArray(wrapped)) return wrapped;
    }
  }
  return [];
}

/**
 * Folders first, then by name, case-insensitively.
 */
function byFolderThenName(a: TreeEntry, b: TreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** `dir`/`file` on GitHub and Gitea, `tree`/`blob` on GitLab. A closed set, so: */
function toEntryType(raw: string | undefined): TreeEntry['type'] {
  return raw === 'dir' || raw === 'tree' ? 'dir' : 'file';
}

function substitutions(target: Target): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(target)) {
    if (value !== undefined) values[key] = value;
  }

  // A second spelling of the path, URL-encoded whole. GitLab addresses a file by putting
  // its entire path in one URL segment, so `src/app/index.tsx` has to arrive as
  // `src%2Fapp%2Findex.tsx`; everywhere else the path is a path and `{path}` is right.
  // Offering both is simpler than teaching the template language about encoding.
  if (typeof values.path === 'string') {
    values.encodedPath = encodeURIComponent(values.path);
  }

  return values;
}

/**
 * Fills an API endpoint, leaving out a query parameter whose ref is empty.
 *
 * An empty ref is not the same as no ref: `?ref=` asks for a branch with no name, where
 * leaving the parameter out asks for the repository's default branch. The parameter is
 * found by its *value* - whichever one the template fills from `{ref}` - rather than by
 * its name, because each site names it differently: `ref` for files everywhere, but
 * `sha` for GitHub's and Gitea's commit history and `ref_name` for GitLab's. A ref the
 * template writes out itself, like GitLab's README asking for `ref=HEAD`, is untouched.
 */
function fillEndpoint(template: string, target: Target): string {
  const values = substitutions(target);
  const question = template.indexOf('?');
  if (target.ref || question < 0) return fillTemplate(template, values);

  const path = fillTemplate(template.slice(0, question), values);
  const query = template
    .slice(question + 1)
    .split('&')
    .filter((part) => !part.endsWith('={ref}'))
    .map((part) => fillTemplate(part, values));

  return query.length > 0 ? `${path}?${query.join('&')}` : path;
}

/**
 * A stable hex colour for a label that arrived without one.
 *
 * Any hash would do; what matters is that it depends only on the name, so "bug" is the
 * same colour on every screen and between runs.
 */
function colourFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 0.55, 0.55);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;

  const [r, g, b] =
    hue < 60
      ? [chroma, second, 0]
      : hue < 120
        ? [second, chroma, 0]
        : hue < 180
          ? [0, chroma, second]
          : hue < 240
            ? [0, second, chroma]
            : hue < 300
              ? [second, 0, chroma]
              : [chroma, 0, second];

  return [r, g, b]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('');
}

function toChangeStatus(raw: string | undefined): ChangeStatus {
  switch (raw) {
    case 'added':
    case 'new':
      return 'added';
    case 'removed':
    case 'deleted':
      return 'removed';
    case 'renamed':
      return 'renamed';
    case 'modified':
    case 'changed':
      return 'modified';
    default:
      return 'unknown';
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A site behind a captive portal answers 200 with HTML. Treating that as "no content"
    // rather than crashing keeps the failure inside the screen that asked for it.
    return null;
  }
}

/**
 * The message a site sent with a refusal, if it sent one worth showing.
 *
 * Forges bury this in different keys, and the fallback matters as much as the lookup: a
 * bare status code tells a person nothing about what to do next.
 */
async function describeFailure(response: Response, manifest: HostManifest): Promise<string> {
  let detail = '';
  try {
    const body: unknown = safeParse(await response.text());
    detail =
      readString(body, 'message') ??
      readString(body, 'error_description') ??
      readString(body, 'error') ??
      '';
  } catch {
    detail = '';
  }

  if (response.status === 401) {
    return detail || `${manifest.displayName} rejected the token. Sign in again.`;
  }
  if (response.status === 403) {
    return detail || `${manifest.displayName} refused: the token may lack the right scopes.`;
  }
  if (response.status === 404) {
    return detail || 'Not found, or the token cannot see it.';
  }
  return detail || `${manifest.displayName} answered ${response.status}.`;
}

/**
 * Decodes the base64 envelope forges wrap file contents in.
 *
 * `atob` yields one byte per character, so UTF-8 text - anything with an accent or an
 * emoji, which READMEs are full of - has to be reassembled rather than used as-is.
 */
function decodeContent(body: unknown): string | undefined {
  const encoded = readString(body, 'content');
  if (encoded === undefined) return readString(body, 'body');

  const encoding = readString(body, 'encoding') ?? 'base64';
  if (encoding !== 'base64') return encoded;

  try {
    const binary = atob(encoded.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return undefined;
  }
}
