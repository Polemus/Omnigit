/**
 * The list of signed-in accounts, and the user's own host manifests.
 *
 * Both are ordinary JSON files in the app's document directory, named the same things the
 * desktop names them. Nothing secret is in either: tokens go to `credentials.ts` and the
 * platform secure store, and what is left here - site, login, display name - is what the
 * app would show on screen anyway.
 */

import { Directory, File, Paths } from 'expo-file-system';

import type { HostManifest } from '../hosts/manifest';
import type { Account } from '../hosts/types';
import { accountKey } from '../hosts/types';

const ACCOUNTS_FILE = 'accounts.json';
const HOSTS_DIR = 'hosts';

function accountsFile(): File {
  return new File(Paths.document, ACCOUNTS_FILE);
}

function hostsDirectory(): Directory {
  return new Directory(Paths.document, HOSTS_DIR);
}

/**
 * Reads the account list, treating anything unreadable as an empty one.
 *
 * *Everything* is inside the try, not just the parse. This is read during the first
 * render of the root provider, so anything it throws takes down the whole app before a
 * single screen exists - a white launch instead of the sign-in screen that would have let
 * someone fix it. A corrupt file, a document directory that is not there, a platform
 * whose file API is a stub: all of them mean the same thing to a caller, which is that
 * nobody is signed in yet.
 */
export function loadAccounts(): Account[] {
  try {
    const file = accountsFile();
    if (!file.exists) return [];

    const parsed: unknown = JSON.parse(file.textSync());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAccount);
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]): void {
  const file = accountsFile();
  if (!file.exists) file.create({ intermediates: true });
  file.write(JSON.stringify(accounts, null, 2));
}

/** Adds an account, or replaces the one already signed in as the same identity. */
export function upsertAccount(account: Account): Account[] {
  const key = accountKey(account);
  const rest = loadAccounts().filter((existing) => accountKey(existing) !== key);
  const accounts = [...rest, account];
  saveAccounts(accounts);
  return accounts;
}

export function removeAccount(account: Account): Account[] {
  const key = accountKey(account);
  const accounts = loadAccounts().filter((existing) => accountKey(existing) !== key);
  saveAccounts(accounts);
  return accounts;
}

function isAccount(value: unknown): value is Account {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Account>;
  return (
    typeof candidate.providerId === 'string' &&
    typeof candidate.baseUrl === 'string' &&
    typeof candidate.login === 'string'
  );
}

/**
 * Host manifests the user added themselves, from `<documents>/hosts/*.json`.
 *
 * The same folder name the desktop uses under `~/.config/Omnigit`, so a file written for
 * one is a file the other understands - which is the point of the format being data.
 */
export function loadUserManifests(): HostManifest[] {
  const manifests: HostManifest[] = [];

  try {
    const directory = hostsDirectory();
    if (!directory.exists) return [];

    for (const entry of directory.list()) {
      if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
      try {
        const parsed: unknown = JSON.parse(entry.textSync());
        if (isManifest(parsed)) manifests.push(parsed);
      } catch {
        // One unreadable file should not hide the others.
      }
    }
  } catch {
    // No folder, or no usable file API - either way there are no extra hosts, and the
    // three built into the app still work. This is read on the sign-in screen, so
    // throwing here would break signing in for everyone over an optional feature.
  }

  return manifests;
}

export function saveUserManifest(manifest: HostManifest): void {
  const directory = hostsDirectory();
  if (!directory.exists) directory.create({ intermediates: true });

  const file = new File(directory, `${manifest.id}.json`);
  if (!file.exists) file.create();
  file.write(JSON.stringify(manifest, null, 2));
}

export function deleteUserManifest(id: string): void {
  const file = new File(hostsDirectory(), `${id}.json`);
  if (file.exists) file.delete();
}

function isManifest(value: unknown): value is HostManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HostManifest>;
  return typeof candidate.id === 'string' && candidate.id.length > 0;
}
