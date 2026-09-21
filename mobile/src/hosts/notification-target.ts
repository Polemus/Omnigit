/**
 * Working out what a notification actually points at.
 *
 * Sites hand back an *API* URL for the subject - `api.github.com/repos/o/r/issues/12` -
 * which is JSON, not a page. Opening it in a browser shows someone a wall of braces, so
 * the number is pulled out of it instead and the app opens its own screen.
 *
 * Everything here is derived from the shape of the URL rather than from any one site's
 * rules, because a manifest can point `notificationFields.webUrl` at whatever its site
 * returns and this still has to cope.
 */

import type { Notification } from './types';

export type NotificationKind = 'pullRequest' | 'issue' | 'other';

export interface NotificationTarget {
  kind: NotificationKind;
  owner: string;
  repo: string;
  number?: number;
}

/**
 * Splits `owner/repo`, keeping every segment but the last as the owner.
 *
 * A GitLab namespace can be several deep - `group/subgroup/project` - so splitting on
 * the first slash would name the wrong repository on exactly the sites this app exists
 * to support.
 */
export function splitFullName(fullName: string): { owner: string; repo: string } {
  const trimmed = fullName.replace(/^\/+|\/+$/g, '');
  const cut = trimmed.lastIndexOf('/');
  if (cut < 0) return { owner: '', repo: trimmed };
  return { owner: trimmed.slice(0, cut), repo: trimmed.slice(cut + 1) };
}

export function notificationTarget(notification: Notification): NotificationTarget {
  const { owner, repo } = splitFullName(notification.repository);
  const kind = kindOf(notification.type);

  return { kind, owner, repo, number: numberIn(notification.webUrl) };
}

function kindOf(type: string): NotificationKind {
  const lower = type.toLowerCase();
  // "PullRequest" on GitHub and Gitea, "MergeRequest" on GitLab's todos.
  if (lower.includes('pull') || lower.includes('merge')) return 'pullRequest';
  if (lower.includes('issue')) return 'issue';
  return 'other';
}

/** The trailing number of a URL, which is the one thing every forge's subject URL ends in. */
function numberIn(url: string | undefined): number | undefined {
  if (!url) return undefined;
  const match = /(\d+)(?:[/?#].*)?$/.exec(url);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}
