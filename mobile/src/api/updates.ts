/**
 * Whether there is newer JavaScript waiting for this build.
 *
 * One query, shared: the Settings tab's badge, the Updates row's dot and the Updates screen
 * all read the same answer, so the badge cannot say one thing while the screen says another,
 * and opening the screen does not start a second check of its own.
 *
 * Asking is not downloading: Expo's `checkForUpdateAsync` only returns availability. Native
 * startup checks are `NEVER` in `app.json`, so the only download remains the deliberate tap
 * on the Updates screen.
 */

import { useQuery } from '@tanstack/react-query';
import * as Updates from 'expo-updates';

/**
 * Long enough that moving between tabs costs nothing, short enough that coming back to the
 * app after a while can refresh the badge.
 */
const FRESH_FOR = 5 * 60_000;

export function useUpdateCheck() {
  return useQuery({
    queryKey: ['updates', 'check'],
    queryFn: () => Updates.checkForUpdateAsync(),
    enabled: Updates.isEnabled,
    staleTime: FRESH_FOR,
    // One failed check is an answer. Retrying turns "no connection" into a long spinner
    // for a quiet badge check that must never get in the way of Settings.
    retry: false,
  });
}

/**
 * Just the fact a badge needs.
 *
 * A roll back counts: the server withdrawing a bad update is something waiting to be
 * installed in exactly the way a new one is, and it is more urgent, not less.
 */
export function useUpdateWaiting(): boolean {
  const { data } = useUpdateCheck();
  return data?.isAvailable === true || data?.isRollBackToEmbedded === true;
}
