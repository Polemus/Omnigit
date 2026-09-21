/**
 * Where a site's API is, as opposed to where its website is.
 *
 * On nearly every forge these are the same host and this file is a no-op: Gitea serves
 * `/api/v1` from the same origin that serves the repository pages. GitHub is the
 * exception that makes it necessary - the website is `github.com` and the API is
 * `api.github.com` - and getting it wrong is not a subtle failure, it is every web link
 * in the app pointing at a JSON endpoint.
 *
 * So the account stores the *website* origin, which is what a person recognises and types,
 * and a manifest that needs a different API root says so with `apiBaseUrl`.
 */

import type { HostManifest } from './manifest';

/** The root that endpoint paths hang off for this account. */
export function apiRoot(manifest: HostManifest, baseUrl: string): string {
  const configured = manifest.apiBaseUrl?.trim();
  if (!configured) return trimSlashes(baseUrl);

  // An absolute `apiBaseUrl` names another host outright, the way github.com does. A
  // relative one is a path under the site's own origin, which is how a self-hosted
  // instance puts its API at /api/v3 without knowing its own domain name.
  if (/^https?:\/\//i.test(configured)) return trimSlashes(configured);
  return `${trimSlashes(baseUrl)}/${configured.replace(/^\/+/, '')}`;
}

/**
 * Joins a base with a path, letting the path win outright when it is already absolute.
 *
 * That escape hatch is what lets a manifest point one call somewhere else entirely -
 * GitHub's device flow lives on the website while everything else lives on the API host.
 */
export function joinUrl(base: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${trimSlashes(base)}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function trimSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}
