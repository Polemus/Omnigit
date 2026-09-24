/**
 * Whether the app is locked, and everything that can change that.
 *
 * A context rather than a route. A lock that is a screen is a screen you can navigate away
 * from - a deep link, a notification tap, a back gesture - and it only has to be wrong once.
 * This sits above the navigator instead, so being locked is a property of the app rather
 * than a place in it.
 *
 * ## When it locks
 *
 * Cold start, always. And immediately when the app enters the background. Minimising it or
 * switching to another app therefore seals it before it can be brought forward again.
 *
 * ## The cover is not the lock
 *
 * `covered` goes up the moment the app stops being active - before iOS takes the snapshot
 * it shows in the app switcher, which is the one frame a lock screen usually forgets. It
 * comes down again as soon as the app is active. If the app was actually backgrounded, the
 * full lock is already waiting underneath it; a brief iOS interruption that never reaches
 * the background remains covered without unnecessarily asking for another unlock.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  biometricSupport,
  NO_BIOMETRICS,
  promptBiometrics,
  type BiometricSupport,
} from '../security/biometrics';
import {
  checkPin,
  clearLock,
  forgiveAttempts,
  readLock,
  setBiometrics as writeBiometrics,
  setPin,
  type LockRecord,
} from '../security/lock';

interface LockValue {
  /** True until the stored record has been read once. Nothing should be drawn before then. */
  isLoading: boolean;
  /** Whether a lock is configured at all. */
  isEnabled: boolean;
  /** A stored lock exists, but PIN creation was never explicitly completed. */
  requiresPinSetup: boolean;
  /** Whether the app is currently sealed. Always false when no lock is configured. */
  isLocked: boolean;
  /** Whether the app is between active states and its content should not be on screen. */
  isCovered: boolean;
  /** The stored record, for the screens that show attempts and the biometrics preference. */
  record: LockRecord | undefined;
  /** What this phone can offer, asked once. */
  support: BiometricSupport;

  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  /** Turns the lock on, or replaces the PIN on one already on. Leaves the app unlocked. */
  enable: (pin: string, useBiometrics: boolean) => Promise<void>;
  disable: () => Promise<void>;
  setBiometrics: (on: boolean) => Promise<void>;
  /** Seals the app now, without waiting for it to be put down. */
  lockNow: () => void;
}

const LockContext = createContext<LockValue | undefined>(undefined);

export function LockProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<LockRecord | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isCovered, setIsCovered] = useState(false);
  const [support, setSupport] = useState<BiometricSupport>(NO_BIOMETRICS);

  const isEnabled = record?.pinConfigured === true;
  const requiresPinSetup = record !== undefined && !record.pinConfigured;

  useEffect(() => {
    void (async () => {
      const [stored, capability] = await Promise.all([readLock(), biometricSupport()]);
      setSupport(capability);
      setRecord(stored);
      // A configured lock is locked at every cold start. There is no "trusted launch".
      setIsLocked(stored?.pinConfigured === true);
      setIsLoading(false);
    })();
  }, []);

  // Re-subscribed when the lock is turned on or off, and only then: a listener attached
  // once would close over "there is no lock" forever and never seal an app whose lock was
  // set after launch.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') {
        setIsCovered(false);
        return;
      }

      // 'inactive' on iOS is the notification shade, the app switcher and a system prompt;
      // 'background' is being properly put down. The cover goes up for both, because the
      // snapshot is taken during the first. Reaching the background seals the app at once.
      setIsCovered(true);
      if (status === 'background' && isEnabled) setIsLocked(true);
    });

    return () => subscription.remove();
  }, [isEnabled]);

  const unlockWithBiometrics = useCallback(async () => {
    if (!record?.pinConfigured || !record.biometrics || !support.available) return false;

    const ok = await promptBiometrics('Unlock Omnigit');
    if (!ok) return false;

    // A face is as good a proof as a PIN, so it clears the throttle the PIN built up.
    setRecord(await forgiveAttempts(record));
    setIsLocked(false);
    return true;
  }, [record, support.available]);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      if (!record?.pinConfigured) return false;
      const result = await checkPin(record, pin);
      setRecord(result.record);
      if (result.ok) setIsLocked(false);
      return result.ok;
    },
    [record]
  );

  const enable = useCallback(async (pin: string, useBiometrics: boolean) => {
    setRecord(await setPin(pin, useBiometrics));
    setIsLocked(false);
  }, []);

  const disable = useCallback(async () => {
    await clearLock();
    setRecord(undefined);
    setIsLocked(false);
  }, []);

  const setBiometrics = useCallback(
    async (on: boolean) => {
      if (!record?.pinConfigured) return;
      setRecord(await writeBiometrics(record, on));
    },
    [record]
  );

  const lockNow = useCallback(() => {
    setIsLocked(true);
  }, []);

  const value = useMemo<LockValue>(
    () => ({
      isLoading,
      isEnabled,
      requiresPinSetup,
      isLocked: isEnabled && isLocked,
      isCovered,
      record,
      support,
      unlockWithBiometrics,
      unlockWithPin,
      enable,
      disable,
      setBiometrics,
      lockNow,
    }),
    [
      isLoading,
      isEnabled,
      requiresPinSetup,
      record,
      isLocked,
      isCovered,
      support,
      unlockWithBiometrics,
      unlockWithPin,
      enable,
      disable,
      setBiometrics,
      lockNow,
    ]
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockValue {
  const value = useContext(LockContext);
  if (!value) throw new Error('useLock must be used inside <LockProvider>.');
  return value;
}
