/**
 * Which sites the app knows about, and how to get a provider for one.
 *
 * Three manifests ship in the bundle; anything the user wrote is loaded from their own
 * documents folder and wins on a clash of ids, so a shipped host can be corrected without
 * waiting for a release.
 */

import type { HostManifest } from './manifest';
import { HostProvider } from './provider';
import { loadUserManifests } from '../storage/accounts';
import { loadToken } from '../storage/credentials';
import type { Account } from './types';

import gitea from './manifests/gitea.json';
import github from './manifests/github.json';
import gitlab from './manifests/gitlab.json';

/**
 * The manifests compiled into the app.
 *
 * The cast is doing real work: the JSON is wider than the type, because it carries `//`
 * comment keys that TypeScript has no reason to know about. Everything the code reads is
 * still checked.
 */
const BUILT_IN: HostManifest[] = [github as HostManifest, gitea as HostManifest, gitlab as HostManifest];

/** Every manifest, with the user's own overriding a shipped one of the same id. */
export function allManifests(): HostManifest[] {
  const byId = new Map<string, HostManifest>();
  for (const manifest of BUILT_IN) byId.set(manifest.id, manifest);
  for (const manifest of loadUserManifests()) byId.set(manifest.id, manifest);
  return [...byId.values()];
}

export function manifestFor(providerId: string): HostManifest | undefined {
  return allManifests().find((manifest) => manifest.id === providerId);
}

/**
 * A provider for one account, or `undefined` when its token has gone.
 *
 * A missing token is the ordinary consequence of reinstalling the app while the account
 * list came back from a backup - see `credentials.ts`. Returning nothing lets the caller
 * show that account as needing a sign-in, which is the truth, instead of failing every
 * request it makes with a 401.
 */
export async function providerFor(account: Account): Promise<HostProvider | undefined> {
  const manifest = manifestFor(account.providerId);
  if (!manifest) return undefined;

  const token = await loadToken(account);
  if (!token) return undefined;

  return new HostProvider(manifest, account, token);
}

/**
 * Providers for every account that still has a token.
 *
 * Silently short by one when an account needs signing in again, which is deliberate: a
 * list drawn from four sites should still show the three that work.
 */
export async function providersFor(accounts: Account[]): Promise<HostProvider[]> {
  const providers = await Promise.all(accounts.map(providerFor));
  return providers.filter((provider): provider is HostProvider => provider !== undefined);
}
