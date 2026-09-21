/**
 * Where tokens live.
 *
 * The same split the desktop makes, for the same reason: the token goes to the platform's
 * own secure store - Keychain on iOS, Keystore-backed EncryptedSharedPreferences on
 * Android - and never into the file that lists the accounts. `accounts.json` holds only
 * the harmless half: site, login, display name.
 *
 * That matters more on a phone than on a laptop. A token here can read and write every
 * repository the person can see, and a file in the app's sandbox is one backup or one
 * debug build away from being readable.
 */

import * as SecureStore from 'expo-secure-store';

import { accountKey } from '../hosts/types';
import type { Account } from '../hosts/types';

/**
 * SecureStore keys may hold only letters, digits, `.`, `-` and `_`, and `accountKey`
 * deliberately contains neither of the first two - it has `|` and `/` in it. Encoding
 * rather than picking a different key shape keeps one definition of account identity.
 */
function storeKey(account: Pick<Account, 'providerId' | 'baseUrl' | 'login'>): string {
  return `omnigit.${accountKey(account).replace(/[^A-Za-z0-9.\-_]/g, '_')}`;
}

export async function saveToken(account: Account, token: string): Promise<void> {
  await SecureStore.setItemAsync(storeKey(account), token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/**
 * The token for an account, or `undefined` when there is none.
 *
 * Missing is an ordinary state, not a failure: the store is wiped when the app is
 * reinstalled while `accounts.json` may be restored from a backup, so an account whose
 * token has gone is exactly what a fresh install on an old phone looks like. The caller
 * signs in again rather than crashing.
 */
export async function loadToken(
  account: Pick<Account, 'providerId' | 'baseUrl' | 'login'>
): Promise<string | undefined> {
  try {
    return (await SecureStore.getItemAsync(storeKey(account))) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function deleteToken(
  account: Pick<Account, 'providerId' | 'baseUrl' | 'login'>
): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(storeKey(account));
  } catch {
    // Deleting something already gone is the outcome that was wanted.
  }
}
