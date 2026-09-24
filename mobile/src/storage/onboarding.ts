/**
 * The one bit of state the introduction needs.
 *
 * Versioning the key is deliberate: finishing this introduction should keep it gone, while
 * a genuinely different introduction in a future release can use a new key without trying
 * to migrate a boolean. It lives in the same platform-backed store as the lock record so it
 * survives ordinary launches without adding a second preferences system for one value.
 */

import * as SecureStore from 'expo-secure-store';

const KEY = 'omnigit.introduction.v1';

export async function hasSeenIntroduction(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === 'complete';
  } catch {
    // Failing open here would make a storage problem permanently skip the introduction.
    // Showing it again is harmless and gives the next successful write another chance.
    return false;
  }
}

export async function rememberIntroduction(): Promise<void> {
  await SecureStore.setItemAsync(KEY, 'complete', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
