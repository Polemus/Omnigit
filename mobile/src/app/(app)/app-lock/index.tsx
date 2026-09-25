/**
 * Turning the app lock on, changing its PIN, and turning it off.
 *
 * A modal off Settings, like Add an account, in the same native grouped structure - except
 * while a PIN is being chosen, where the keypad takes the whole screen. Six digits are
 * entered by muscle memory and a keypad squeezed into a list row would defeat that.
 *
 * Turning the lock *off* asks for the PIN, even though the app is unlocked to be here at
 * all. That is the point of it: a lock someone can switch off simply because they are
 * holding an unlocked phone protects nothing after the first careless moment. Changing the
 * PIN asks for the same reason.
 *
 * Biometrics can be turned on only by using them once, there and then. A toggle that says
 * "Face ID" without ever having seen a face is a promise the app has not checked it can
 * keep, and the place to find that out is not the next time someone is locked out.
 */

import { Button, Column, Switch } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { promptBiometrics } from '@/security/biometrics';
import { PIN_LENGTH } from '@/security/lock';
import { useAccounts } from '@/state/accounts';
import { useLock } from '@/state/lock';
import { Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { FieldGroup } from '@/ui/field-group';
import { Host } from '@/ui/host';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { PinPad } from '@/ui/pin-pad';
import { NavigationBarStrip, useBottomClearance } from '@/ui/screen';
import { Text } from '@/ui/text';

const IOS = process.env.EXPO_OS === 'ios';

/**
 * Where the modal is.
 *
 * `verify` carries what it is standing in front of, so one PIN prompt serves both the
 * destructive change and the reversible one without two near-identical steps.
 */
type Step =
  | { kind: 'menu' }
  | { kind: 'choose' }
  | { kind: 'confirm'; first: string }
  | { kind: 'verify'; then: 'change' | 'off' };

export default function AppLockScreen() {
  const { accounts } = useAccounts();
  const { isEnabled, record, support, enable, disable, setBiometrics, unlockWithPin } = useLock();

  const [step, setStep] = useState<Step>({ kind: 'menu' });

  if (step.kind !== 'menu') {
    return (
      <PinStep
        step={step}
        onStep={setStep}
        onEnable={enable}
        onDisable={disable}
        onVerify={unlockWithPin}
        // Changing a PIN must not quietly re-enable something that was turned off, so an
        // existing lock keeps its own answer and only a brand new one takes the default.
        biometricsByDefault={isEnabled ? record?.biometrics === true : support.available}
      />
    );
  }

  const unlockedBy = record?.biometrics && support.available ? support.label : undefined;

  return (
    <>
      <Stack.Screen options={{ title: 'App lock' }} />
      <Host style={styles.fill}>
        <FieldGroup>
          <FieldGroup.Section>
            <ListItem
              leading={<Icon name={isEnabled ? Icons.lock : Icons.unlocked} size={40} />}
              supportingText={
                isEnabled
                  ? `Opened with ${unlockedBy ? `${unlockedBy} or your PIN` : 'your PIN'}.`
                  : 'Anyone holding this phone can open your accounts.'
              }>
              {isEnabled ? 'App lock is on' : 'App lock is off'}
            </ListItem>
          </FieldGroup.Section>

          {isEnabled ? (
            <>
              {support.available ? (
                <FieldGroup.Section title="How to unlock">
                  <ListItem
                    leading={<Icon name={Icons.biometrics} size={20} />}
                    supportingText="Offered first, with the PIN behind it."
                    trailing={
                      <Switch
                        value={record?.biometrics === true}
                        onValueChange={(on) => {
                          void (async () => {
                            // Proven before promised: turning it on means using it once.
                            if (on && !(await promptBiometrics(`Turn on ${support.label}`))) return;
                            await setBiometrics(on);
                          })();
                        }}
                      />
                    }>
                    {support.label}
                  </ListItem>
                  <FieldGroup.SectionFooter>
                    <Text>
                      {`Your PIN always works. ${support.label} can stop working when it is re-enrolled, and there has to be a way back in.`}
                    </Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>
              ) : (
                // Said rather than left out. A row that simply is not there reads as a bug
                // to anyone who expected Face ID, and one of the two reasons is something
                // they can go and fix.
                <FieldGroup.Section title="How to unlock">
                  <ListItem
                    leading={<Icon name={Icons.biometrics} size={20} />}
                    supportingText={
                      support.absence === 'not-enrolled'
                        ? "This phone has the hardware but nothing is enrolled on it. Add a face or a fingerprint in your phone's settings and it turns up here."
                        : 'Nothing on this device can be used for a face or a fingerprint, so your PIN is the only way in.'
                    }>
                    {support.absence === 'not-enrolled'
                      ? 'No face or fingerprint enrolled'
                      : 'Biometrics unavailable here'}
                  </ListItem>
                  <FieldGroup.SectionFooter>
                    <Text>
                      This is asked of the phone rather than assumed, so the same PIN works
                      everywhere and biometrics appear wherever they can.
                    </Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>
              )}

              <FieldGroup.Section title="Manage">
                <ListItem
                  onPress={() => setStep({ kind: 'verify', then: 'change' })}
                  leading={<Icon name={Icons.pin} size={20} />}
                  supportingText="Asks for the current one first."
                  trailing={<Icon name={Icons.chevron} size={16} />}>
                  Change PIN
                </ListItem>
                <ListItem
                  onPress={() => {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    Alert.alert(
                      'Turn off the app lock?',
                      `The ${accounts.length === 1 ? 'account' : `${accounts.length} accounts`} on this phone would then be open to anyone holding it.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Turn off',
                          style: 'destructive',
                          onPress: () => setStep({ kind: 'verify', then: 'off' }),
                        },
                      ]
                    );
                  }}
                  leading={<Icon name={Icons.unlocked} size={20} />}
                  supportingText="Asks for your PIN first.">
                  Turn off app lock
                </ListItem>
                <FieldGroup.SectionFooter>
                  <Text>
                    The app locks itself when it starts, and as soon as you minimise it or
                    switch to another app.
                  </Text>
                </FieldGroup.SectionFooter>
              </FieldGroup.Section>
            </>
          ) : (
            <FieldGroup.Section title="Turn it on">
              <ListItem
                onPress={() => setStep({ kind: 'choose' })}
                leading={<Icon name={Icons.lock} size={20} />}
                supportingText={
                  support.available
                    ? `A six-digit PIN, with ${support.label} in front of it.`
                    : 'A six-digit PIN.'
                }
                trailing={<Icon name={Icons.chevron} size={16} />}>
                Set a PIN
              </ListItem>
              <FieldGroup.SectionFooter>
                <Text>
                  {accounts.length === 0
                    ? 'Worth doing before you sign in anywhere.'
                    : `A token here can read and write every repository ${accounts.length === 1 ? 'that account' : 'those accounts'} can see.`}
                </Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          )}
        </FieldGroup>
      </Host>
      <NavigationBarStrip />
    </>
  );
}

/**
 * The keypad steps: choosing a PIN, typing it again, or proving the current one.
 *
 * Its own component to keep the keypad steps out of the menu, but note that moving between
 * steps does *not* remount it - same component, same position, so React reconciles and the
 * dots survive. Every transition therefore clears them itself. The message does not get the
 * same treatment: "those did not match" has to outlive the step change that it causes.
 */
function PinStep({
  step,
  onStep,
  onEnable,
  onDisable,
  onVerify,
  biometricsByDefault,
}: {
  step: Exclude<Step, { kind: 'menu' }>;
  onStep: (step: Step) => void;
  onEnable: (pin: string, useBiometrics: boolean) => Promise<void>;
  onDisable: () => Promise<void>;
  onVerify: (pin: string) => Promise<boolean>;
  biometricsByDefault: boolean;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const clearance = useBottomClearance();
  const router = useRouter();

  const [pin, setPin] = useState('');
  const [refusals, setRefusals] = useState(0);
  const [problem, setProblem] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const cancel = useCallback(() => {
    // Backing out of the first step leaves nowhere to go but Settings; out of a later one,
    // back to the menu that started it.
    if (step.kind === 'choose') router.back();
    else onStep({ kind: 'menu' });
  }, [onStep, router, step.kind]);

  const refuse = useCallback((why: string) => {
    setRefusals((count) => count + 1);
    setProblem(why);
    setPin('');
  }, []);

  const complete = useCallback(
    (candidate: string) => {
      setBusy(true);
      void (async () => {
        if (step.kind === 'choose') {
          // A PIN of one repeated digit is not refused. Telling someone their PIN is not
          // good enough, on a lock whose real defence is a throttle, trades a real cost -
          // people writing it down, or giving up on the lock - for an imagined one.
          setPin('');
          onStep({ kind: 'confirm', first: candidate });
          setBusy(false);
          return;
        }

        if (step.kind === 'confirm') {
          if (candidate !== step.first) {
            refuse('Those did not match. Start again.');
            onStep({ kind: 'choose' });
            setBusy(false);
            return;
          }
          await onEnable(candidate, biometricsByDefault);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setBusy(false);
          onStep({ kind: 'menu' });
          return;
        }

        const ok = await onVerify(candidate);
        if (!ok) {
          refuse('Wrong PIN');
          setBusy(false);
          return;
        }

        if (step.then === 'off') {
          await onDisable();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setBusy(false);
          onStep({ kind: 'menu' });
          return;
        }

        setPin('');
        setBusy(false);
        onStep({ kind: 'choose' });
      })();
    },
    [biometricsByDefault, onDisable, onEnable, onStep, onVerify, refuse, step]
  );

  return (
    <>
      <Stack.Screen
        options={
          IOS
            ? {
                title: '',
                headerTransparent: true,
                headerShadowVisible: false,
              }
            : { title: title(step) }
        }
      />
      <View style={[styles.pinScreen, { backgroundColor: palette.background }]}>
        <PinPad
          appearance={IOS ? 'lock' : 'default'}
          value={pin}
          onChange={(next) => {
            setProblem(undefined);
            setPin(next);
          }}
          onComplete={complete}
          disabled={busy}
          refusals={refusals}
          topInset={IOS ? insets.top : 0}
          bottomInset={clearance}
          accessory={
            IOS
              ? {
                  action: 'Cancel',
                  label: 'Cancel',
                  onPress: cancel,
                }
              : undefined
          }
          header={
            // `matchContents={{ vertical: true }}` rather than plain `matchContents`: the
            // plain form sizes the native content horizontally too, so a centred `Column`
            // centres inside its own width and the heading sits against the left edge.
            <Host matchContents={{ vertical: true }} style={styles.head}>
              <Column spacing={Spacing.two} alignment="center">
                <Text
                  textStyle={{
                    fontSize: IOS ? 23 : 20,
                    fontWeight: IOS ? '400' : '600',
                    color: palette.text,
                    textAlign: 'center',
                  }}>
                  {title(step)}
                </Text>
                <Text
                  numberOfLines={2}
                  textStyle={{
                    fontSize: 14,
                    textAlign: 'center',
                    color: problem ? palette.danger : palette.textSecondary,
                  }}>
                  {problem ?? subtitle(step)}
                </Text>
              </Column>
            </Host>
          }
        />

        {!IOS ? (
          // Android keeps the settings-style action below its Material keypad.
          <Host
            matchContents
            style={[styles.cancel, { paddingBottom: clearance + Spacing.four }]}>
            <Button variant="text" label="Cancel" onPress={cancel} />
          </Host>
        ) : null}
        <NavigationBarStrip />
      </View>
    </>
  );
}

function title(step: Exclude<Step, { kind: 'menu' }>): string {
  switch (step.kind) {
    case 'choose':
      return 'Choose a PIN';
    case 'confirm':
      return 'Enter it again';
    case 'verify':
      return 'Enter your PIN';
  }
}

function subtitle(step: Exclude<Step, { kind: 'menu' }>): string {
  switch (step.kind) {
    case 'choose':
      return `${PIN_LENGTH} digits, and not one a thief would try first.`;
    case 'confirm':
      return 'So a slip does not lock you out of your own accounts.';
    case 'verify':
      return step.then === 'off' ? 'To turn the lock off.' : 'To choose a new one.';
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  pinScreen: {
    flex: 1,
  },
  head: {
    alignSelf: 'stretch',
  },
  cancel: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.six,
  },
});
