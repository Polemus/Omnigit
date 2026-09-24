/**
 * Face ID, Touch ID and their Android equivalents, named the way the phone names them.
 *
 * "Use biometrics" is not a phrase anyone's phone uses. An iPhone says Face ID, a Pixel
 * says Fingerprint, and a button that says something else makes people hesitate over
 * exactly the control that is supposed to be instant. So the label is asked for rather
 * than assumed, and the glyph follows it.
 *
 * Nothing here branches on which runtime the app is in, deliberately. `executionEnvironment`
 * reports `storeClient` for Expo Go *and* for a development build, so it cannot tell them
 * apart - and even if it could, the honest question is not "which runtime is this" but "can
 * this phone do it", which is what `hasHardwareAsync` and `isEnrolledAsync` answer. Expo Go
 * on a real iPhone with a face enrolled can offer Face ID; a development build on an
 * emulator with nothing enrolled cannot. A runtime check would get both backwards.
 *
 * `disableDeviceFallback` is on. The system's own fallback is the device passcode, and
 * offering it here would mean the app lock is opened by the same code that unlocks the
 * phone - which defeats the point of having a second lock on a phone someone has already
 * handed over unlocked. The fallback is our own keypad instead.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import type { AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * Why a phone is not offering biometrics, which is a different sentence in each case.
 *
 * `not-enrolled` is the one worth telling someone about: it is the only one they can do
 * anything about, and the thing to do is in their phone's settings rather than in this app.
 */
export type BiometricAbsence = 'unsupported' | 'not-enrolled';

export interface BiometricSupport {
  /** Hardware exists *and* something is enrolled on it. Anything less cannot be offered. */
  available: boolean;
  /** Set only when `available` is false. */
  absence?: BiometricAbsence;
  /** Which glyph belongs on the keypad's corner key. */
  kind: 'face' | 'fingerprint';
  /** What the phone calls it: "Face ID", "Touch ID", "Fingerprint", "Face Unlock". */
  label: string;
  symbol: { ios: SFSymbol; android: AndroidSymbol };
}

/** What a phone with nothing enrolled offers, and the starting assumption before asking. */
export const NO_BIOMETRICS: BiometricSupport = {
  available: false,
  absence: 'unsupported',
  kind: 'fingerprint',
  label: 'Biometrics',
  symbol: { ios: 'faceid', android: 'fingerprint' },
};

export async function biometricSupport(): Promise<BiometricSupport> {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    if (!hardware) return NO_BIOMETRICS;
    // Hardware with nothing on it is the one case someone can fix, so it is kept apart from
    // a phone - or a runtime - that simply cannot do this at all.
    if (!enrolled) return { ...NO_BIOMETRICS, absence: 'not-enrolled' };

    const ios = process.env.EXPO_OS === 'ios';
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const iris = types.includes(LocalAuthentication.AuthenticationType.IRIS);

    // A phone that reports both - some Androids do - is described by the one people reach
    // for first, which is the face on a device that has it.
    if (face) {
      return {
        available: true,
        kind: 'face',
        label: ios ? 'Face ID' : 'Face Unlock',
        symbol: { ios: 'faceid', android: 'face' },
      };
    }
    if (iris) {
      return {
        available: true,
        kind: 'face',
        label: 'Iris',
        symbol: { ios: 'faceid', android: 'face' },
      };
    }
    return {
      available: true,
      kind: 'fingerprint',
      label: ios ? 'Touch ID' : 'Fingerprint',
      symbol: { ios: 'touchid', android: 'fingerprint' },
    };
  } catch {
    return NO_BIOMETRICS;
  }
}

/**
 * Asks, and answers only "did they prove it".
 *
 * Every way of not proving it - cancelled, too many failures, the sensor unavailable -
 * lands the same way here, because the caller's next move is the keypad in all of them.
 */
export async function promptBiometrics(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
      requireConfirmation: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
