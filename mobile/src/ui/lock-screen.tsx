/**
 * The screen that stands between someone and the accounts: a face, or six digits.
 *
 * Biometrics are asked for the moment this appears, because a Face ID prompt that waits to
 * be tapped is slower than typing the PIN and nobody would use it twice. Failing or
 * cancelling drops to the keypad already on screen behind the prompt, so there is never a
 * dead end - which is also why a PIN is mandatory rather than optional: a re-enrolled face
 * or a bandaged finger must not cost someone their accounts.
 */

import { Column, Row } from '@expo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { attemptsLeft } from '../security/lock';
import { useLock } from '../state/lock';
import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Host } from './host';
import { Icon } from './icon';
import { Icons } from './icons';
import { PinPad } from './pin-pad';
import { NavigationBarStrip, useBottomClearance } from './screen';
import { Text } from './text';

const IOS = process.env.EXPO_OS === 'ios';

/**
 * What goes over the app, if anything.
 *
 * One component so the three answers - not yet known, locked, merely covered - are decided
 * in one place rather than by three conditions scattered through the root layout.
 *
 * The cover is only ever drawn for someone who asked for a lock. Blanking the app switcher
 * for everyone else would be a privacy feature nobody opted into, and a confusing one.
 */
export function AppLockGate() {
  const { isLoading, isEnabled, isLocked, isCovered } = useLock();

  return (
    <>
      {/* Keep the keypad mounted underneath the privacy cover. The Face ID prompt makes
        iOS briefly inactive; replacing the keypad with the cover at that point used to
        unmount it, so choosing "Use PIN" mounted a fresh screen that asked for Face ID all
        over again. A real background still mounts the lock screen in a suspended state,
        ready to ask only after the app becomes active. */}
      {!isLoading && isLocked ? <LockScreen suspended={isCovered} /> : null}

      {/* Opaque until the stored record has been read, and whenever a protected app is not
        active. It is rendered after the keypad so the app-switcher snapshot still sees only
        the cover, never the PIN dots or keys beneath it. */}
      {isLoading || (isEnabled && isCovered) ? <Cover /> : null}
    </>
  );
}

/**
 * The blank that stands in for the app while it is not in front.
 *
 * Deliberately not the lock screen: this is what the app switcher photographs, and a keypad
 * in the switcher invites someone to try it. A shut padlock says the same thing and offers
 * nothing.
 */
function Cover() {
  const palette = usePalette();

  return (
    <View style={[styles.cover, { backgroundColor: palette.background }]}>
      <Host matchContents>
        <Icon name={Icons.lock} size={40} color={palette.textTertiary} />
      </Host>
    </View>
  );
}

function LockScreen({ suspended }: { suspended: boolean }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const clearance = useBottomClearance();
  const { record, support, unlockWithBiometrics, unlockWithPin } = useLock();

  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [refusals, setRefusals] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const attempts = record?.attempts ?? 0;
  const biometricsOffered = record?.biometrics === true && support.available;
  const lockedUntil = record?.lockedUntil ?? 0;
  const waiting = Math.max(0, lockedUntil - now);

  // Ticking only while a lockout is actually counting down, so an idle lock screen is not
  // waking the bridge twice a second for the rest of the day.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  // Asked once, as the screen appears. A ref rather than a dependency list, because a
  // cancelled prompt must not be re-offered on the next render - that is a loop nobody can
  // tap their way out of.
  const asked = useRef(false);
  useEffect(() => {
    // A lock screen can be mounted underneath the privacy cover while the app is in the
    // background. Do not open a system authentication prompt there; becoming active removes
    // the suspension and runs this effect again. During an existing Face ID prompt, `asked`
    // is already true and survives the temporary cover because this component stays mounted.
    if (suspended || asked.current || !biometricsOffered || waiting > 0) return;
    asked.current = true;
    void unlockWithBiometrics();
  }, [biometricsOffered, suspended, unlockWithBiometrics, waiting]);

  const submit = useCallback(
    (candidate: string) => {
      setChecking(true);
      void (async () => {
        try {
          const unlocked = await unlockWithPin(candidate);
          if (!unlocked) setRefusals((count) => count + 1);
        } catch {
          // Verification should never strand the keypad in its disabled state. A storage
          // or hashing failure is treated as a refusal without leaking the underlying error.
          setRefusals((count) => count + 1);
        } finally {
          setChecking(false);
          // Cleared either way. On success this screen is about to go; on failure the dots
          // have already shaken, and leaving six filled ones behind means a backspace before
          // the next try.
          setPin('');
        }
      })();
    },
    [unlockWithPin]
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <PinPad
        appearance={IOS ? 'lock' : 'default'}
        value={pin}
        onChange={setPin}
        onComplete={submit}
        disabled={checking || waiting > 0}
        refusals={refusals}
        topInset={insets.top}
        bottomInset={clearance}
        header={
          // `matchContents={{ vertical: true }}` rather than plain `matchContents`: the
          // plain form sizes the native content horizontally too, so a centred `Column`
          // centres inside its own width and the whole heading sits against the left edge.
          <Host matchContents={{ vertical: true }} style={styles.head}>
            <Column spacing={Spacing.three} alignment="center">
              {IOS ? (
                <Text
                  textStyle={{
                    fontSize: 23,
                    fontWeight: '400',
                    color: palette.text,
                    textAlign: 'center',
                  }}>
                  Enter Passcode
                </Text>
              ) : (
                <>
                  {/* Two containers for one glyph, because each centres one axis: a
                      `Column` aligns across, a `Row` aligns down. The circle's own
                      `justifyContent` does nothing here - Android reads padding, size,
                      background, border and opacity out of a style and quietly drops the
                      rest - which left the lock sitting on the top edge of its circle. */}
                  <Column
                    alignment="center"
                    style={{ ...styles.androidMark, backgroundColor: palette.accentMuted }}>
                    <Row alignment="center" style={styles.androidMarkInner}>
                      <Icon name={Icons.lock} size={30} color={palette.accent} />
                    </Row>
                  </Column>
                  <Text
                    textStyle={{
                      fontSize: 24,
                      fontWeight: '600',
                      color: palette.text,
                      textAlign: 'center',
                    }}>
                    Unlock Omnigit
                  </Text>
                </>
              )}
              {!IOS || alarming(attempts, waiting) ? (
                <Text
                  numberOfLines={2}
                  textStyle={{
                    fontSize: 14,
                    textAlign: 'center',
                    color: alarming(attempts, waiting)
                      ? palette.danger
                      : palette.textSecondary,
                  }}>
                  {hint(attempts, waiting)}
                </Text>
              ) : null}
            </Column>
          </Host>
        }
        accessory={
          biometricsOffered
            ? {
                // Which glyph is the phone's answer, not the platform's: an iPhone with
                // Touch ID gets the fingerprint, not Face ID's square.
                icon: support.kind === 'face' ? Icons.biometrics : Icons.fingerprint,
                label: `Unlock with ${support.label}`,
                onPress: () => void unlockWithBiometrics(),
              }
            : undefined
        }
      />
      <NavigationBarStrip />
    </View>
  );
}

/**
 * The line under the title, which is the only thing telling someone where they stand.
 *
 * It counts down while locked out, warns as the free attempts run low, and otherwise just
 * says what to do. It never says how many digits are left - the dots do that.
 */
function hint(attempts: number, waiting: number): string {
  if (waiting > 0) return `Too many attempts. Try again in ${countdown(waiting)}.`;
  if (attempts === 0) return 'Enter your PIN';

  const left = attemptsLeft(attempts);
  if (left === 0) return 'Wrong PIN';
  return `Wrong PIN · ${left} ${left === 1 ? 'try' : 'tries'} before a pause`;
}

function alarming(attempts: number, waiting: number): boolean {
  return waiting > 0 || attempts > 0;
}

/** A lockout as `1:05`, or `45s` while it is under a minute. */
function countdown(remaining: number): string {
  const seconds = Math.ceil(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  head: {
    alignSelf: 'stretch',
  },
  androidMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  androidMarkInner: {
    height: 64,
  },
});
