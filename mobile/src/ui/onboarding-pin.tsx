/** The PIN half of first-run security setup, after biometrics have been accepted. */

import { Button, Column } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PIN_LENGTH } from '@/security/lock';
import { Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PinPad } from '@/ui/pin-pad';
import { NavigationBarStrip, useBottomClearance } from '@/ui/screen';
import { Text } from '@/ui/text';
import { Host } from './host';

const IOS = process.env.EXPO_OS === 'ios';

type PinStage = { kind: 'choose' } | { kind: 'confirm'; first: string };

export function OnboardingPin({
  useBiometrics,
  biometricLabel,
  allowBack,
  onBack,
  onComplete,
}: {
  useBiometrics: boolean;
  biometricLabel: string;
  allowBack: boolean;
  onBack: () => void;
  onComplete: (pin: string, useBiometrics: boolean) => Promise<void>;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const clearance = useBottomClearance();
  const [stage, setStage] = useState<PinStage>({ kind: 'choose' });
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState<string>();
  const [refusals, setRefusals] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (allowBack && !busy) onBack();
      return true;
    });
    return () => subscription.remove();
  }, [allowBack, busy, onBack]);

  const refuse = useCallback((message: string) => {
    setProblem(message);
    setPin('');
    setRefusals((count) => count + 1);
  }, []);

  const complete = useCallback(
    (candidate: string) => {
      setBusy(true);
      void (async () => {
        if (stage.kind === 'choose') {
          setPin('');
          setProblem(undefined);
          setStage({ kind: 'confirm', first: candidate });
          setBusy(false);
          return;
        }

        if (candidate !== stage.first) {
          refuse('Those did not match. Start again.');
          setStage({ kind: 'choose' });
          setBusy(false);
          return;
        }

        try {
          await onComplete(candidate, useBiometrics);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          refuse('Could not save your app lock. Try again.');
          setBusy(false);
        }
      })();
    },
    [onComplete, refuse, stage, useBiometrics]
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
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
          IOS && allowBack
            ? {
                action: 'Back',
                label: 'Back',
                onPress: onBack,
              }
            : undefined
        }
        header={
          <Host matchContents={{ vertical: true }} style={styles.heading}>
            <Column spacing={Spacing.two} alignment="center">
              <Text
                textStyle={{
                  fontSize: IOS ? 23 : 20,
                  fontWeight: IOS ? '400' : '600',
                  color: palette.text,
                  textAlign: 'center',
                }}>
                {stage.kind === 'choose' ? 'Create a PIN' : 'Enter it again'}
              </Text>
              <Text
                numberOfLines={2}
                textStyle={{
                  fontSize: 14,
                  textAlign: 'center',
                  color: problem ? palette.danger : palette.textSecondary,
                }}>
                {problem ?? subtitle(stage, useBiometrics, biometricLabel)}
              </Text>
            </Column>
          </Host>
        }
      />

      {!IOS && allowBack ? (
        <Host
          matchContents
          style={[styles.back, { paddingBottom: clearance + Spacing.four }]}>
          <Button variant="text" label="Back" onPress={onBack} disabled={busy} />
        </Host>
      ) : null}
      <NavigationBarStrip />
    </View>
  );
}

function subtitle(stage: PinStage, useBiometrics: boolean, biometricLabel: string): string {
  if (stage.kind === 'confirm') return 'This makes sure a slip cannot lock you out.';
  if (useBiometrics) {
    return `${PIN_LENGTH} digits for when ${biometricLabel} is unavailable.`;
  }
  return `${PIN_LENGTH} digits to unlock Omnigit.`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  heading: {
    alignSelf: 'stretch',
  },
  back: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.six,
  },
});
