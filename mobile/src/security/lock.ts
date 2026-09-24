/**
 * The app lock's stored half: whether it is on, the PIN it checks against, and how many
 * wrong guesses have been made.
 *
 * All of it goes in the same secure store as the tokens - Keychain on iOS, Keystore-backed
 * EncryptedSharedPreferences on Android - and none of it in `accounts.json`.
 *
 * ## What this is, and what it is not
 *
 * The PIN is stored as a salted SHA-256, once, not run through a key-derivation function
 * with a work factor. That is deliberate rather than an oversight, and the threat model is
 * the reason:
 *
 * - Someone holding the unlocked phone and tapping digits is stopped by `lockoutFor`
 *   below, not by how expensive one hash is. Six digits is a million guesses; a throttle
 *   that reaches fifteen minutes makes that centuries of tapping.
 * - Someone who can *read this record* has by definition defeated the platform's secure
 *   store - which is where the access tokens also live. They would take the tokens
 *   directly and never look at the PIN. A work factor here would protect a secret that is
 *   worthless next to what sits beside it.
 *
 * So the security boundary is the secure store and the throttle, and the hash exists to
 * keep the PIN out of plain sight rather than to resist an offline attack. Anyone tempted
 * to "upgrade" this to PBKDF2 should know it buys nothing until the tokens themselves are
 * bound to biometric authentication - `SecureStore`'s `requireAuthentication`, which is a
 * real change with a real cost: a system prompt per account on every cold launch.
 *
 * ## Why the PIN is not optional
 *
 * Biometrics are the fast way in, never the only way. A face can be re-enrolled, a sensor
 * can fail, a finger can be bandaged, and the OS itself refuses biometrics outright after
 * a few failures. Without a PIN behind them, any of those locks someone out of their own
 * accounts with no way back except deleting the app. So turning the lock on sets a PIN,
 * and biometrics ride on top of it.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/** Six digits, which is what the phone itself asks for. */
export const PIN_LENGTH = 6;

/** Wrong guesses allowed before the keypad starts refusing for a while. */
const FREE_ATTEMPTS = 5;

/**
 * How long the keypad refuses after `FREE_ATTEMPTS` + n failures, in milliseconds.
 *
 * It climbs rather than repeating, because a fixed penalty is a rate someone can simply
 * wait out: a million guesses at thirty seconds each is still only a year of an automated
 * finger. The last step repeats forever, and the whole schedule is discarded the moment one
 * correct PIN is entered.
 */
const LOCKOUTS = [30_000, 60_000, 120_000, 300_000, 900_000];

const KEY = 'omnigit.lock';

/**
 * Everything the lock remembers between launches.
 *
 * `lockedUntil` is stored rather than held in memory on purpose: a lockout that a force
 * quit clears is not a lockout.
 */
export interface LockRecord {
  /**
   * Explicit proof that the user completed PIN creation and confirmation.
   *
   * Older/incomplete records intentionally read as false. SecureStore can survive an iOS
   * reinstall, so the existence of a hash alone is not enough to claim a fallback PIN was
   * deliberately configured.
   */
  pinConfigured: boolean;
  /** Hex, 16 random bytes, so two people with the same PIN do not share a hash. */
  salt: string;
  /** Hex SHA-256 of `salt + pin`. */
  hash: string;
  /** Whether Face ID / a fingerprint may be offered before the keypad. */
  biometrics: boolean;
  /** Consecutive failures. Reset to zero by a correct PIN. */
  attempts: number;
  /** Epoch milliseconds before which no guess is accepted, or 0. */
  lockedUntil: number;
}

export async function readLock(): Promise<LockRecord | undefined> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(KEY);
  } catch {
    return undefined;
  }

  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<LockRecord> | null;
    if (!parsed || typeof parsed !== 'object') return incompleteRecord();

    const salt = typeof parsed.salt === 'string' ? parsed.salt : '';
    const hash = typeof parsed.hash === 'string' ? parsed.hash : '';
    const hasValidSecret = /^[0-9a-f]{32}$/i.test(salt) && /^[0-9a-f]{64}$/i.test(hash);
    const pinConfigured = parsed.pinConfigured === true && hasValidSecret;

    return {
      pinConfigured,
      // An incomplete record stays present so onboarding can repair it, but its unusable
      // secret material is never passed to the PIN checker.
      salt: pinConfigured ? salt : '',
      hash: pinConfigured ? hash : '',
      biometrics: parsed.biometrics === true,
      attempts:
        pinConfigured && typeof parsed.attempts === 'number' && Number.isFinite(parsed.attempts)
          ? Math.max(0, parsed.attempts)
          : 0,
      lockedUntil:
        pinConfigured &&
        typeof parsed.lockedUntil === 'number' &&
        Number.isFinite(parsed.lockedUntil)
          ? Math.max(0, parsed.lockedUntil)
          : 0,
    };
  } catch {
    // The key exists, so fail into mandatory setup instead of mistaking damaged data for a
    // working lock or silently treating it as an intentional opt-out.
    return incompleteRecord();
  }
}

function incompleteRecord(): LockRecord {
  return {
    pinConfigured: false,
    salt: '',
    hash: '',
    biometrics: false,
    attempts: 0,
    lockedUntil: 0,
  };
}

async function write(record: LockRecord): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(record), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Turns the lock on, or replaces the PIN on a lock that is already on. */
export async function setPin(pin: string, biometrics: boolean): Promise<LockRecord> {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new Error(`PIN must contain exactly ${PIN_LENGTH} digits.`);
  }

  const salt = hex(Crypto.getRandomBytes(16));
  const record: LockRecord = {
    pinConfigured: true,
    salt,
    hash: await hashPin(salt, pin),
    biometrics,
    attempts: 0,
    lockedUntil: 0,
  };
  await write(record);
  return record;
}

export async function setBiometrics(record: LockRecord, biometrics: boolean): Promise<LockRecord> {
  if (!record.pinConfigured) {
    throw new Error('Biometrics cannot be enabled until a PIN has been configured.');
  }
  const next = { ...record, biometrics };
  await write(next);
  return next;
}

/** Turns the lock off entirely, PIN and all. */
export async function clearLock(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Deleting something already gone is the outcome that was wanted.
  }
}

/**
 * Checks a PIN and records what happened, returning the record as it now stands.
 *
 * The failure is written *before* the answer comes back to the caller, so an app killed
 * mid-guess has still counted it.
 */
export async function checkPin(
  record: LockRecord,
  pin: string
): Promise<{ ok: boolean; record: LockRecord }> {
  if (!record.pinConfigured) return { ok: false, record };

  const ok = (await hashPin(record.salt, pin)) === record.hash;

  if (ok) {
    const next = { ...record, attempts: 0, lockedUntil: 0 };
    await write(next);
    return { ok: true, record: next };
  }

  const attempts = record.attempts + 1;
  const wait = lockoutFor(attempts);
  const next = { ...record, attempts, lockedUntil: wait > 0 ? Date.now() + wait : 0 };
  await write(next);
  return { ok: false, record: next };
}

/** Clears the throttle after a successful biometric unlock, which is just as good a proof. */
export async function forgiveAttempts(record: LockRecord): Promise<LockRecord> {
  if (!record.pinConfigured) return record;
  if (record.attempts === 0 && record.lockedUntil === 0) return record;
  const next = { ...record, attempts: 0, lockedUntil: 0 };
  await write(next);
  return next;
}

/** How long the keypad should refuse after this many consecutive failures. */
export function lockoutFor(attempts: number): number {
  const over = attempts - FREE_ATTEMPTS;
  if (over <= 0) return 0;
  return LOCKOUTS[Math.min(over - 1, LOCKOUTS.length - 1)];
}

/** Guesses left before the next lockout, for the warning under the dots. */
export function attemptsLeft(attempts: number): number {
  return Math.max(0, FREE_ATTEMPTS - attempts);
}

async function hashPin(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
