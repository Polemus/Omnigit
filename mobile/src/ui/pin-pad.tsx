/**
 * The whole passcode screen below the status bar: a heading, six dots, and a keypad.
 *
 * One component because the lock screen and setting a PIN must not drift. A keypad whose
 * digits sit differently when you set the PIN from where they sit when you enter it teaches
 * the wrong muscle memory, and the whole point of six digits is that a thumb learns them.
 * The caller supplies only the words at the top.
 *
 * ## The shape is Apple's, because everyone already knows it
 *
 * Heading and dots together at the top - the dots belong *to* the heading, which is why
 * iOS puts them a line below it rather than floating them in the middle of the screen - and
 * the keypad at the bottom where a thumb reaches. The gap between the two is whatever is
 * left over.
 *
 * ## Built out of `@expo/ui`, so each phone gets its own passcode pad
 *
 * The keys are real native buttons - SwiftUI on iOS, Jetpack Compose on Android - which is
 * where the feel comes from and is not something a `Pressable` can be styled into. They are
 * Liquid Glass on iOS and a tonal Material circle on Android; that split is the only thing
 * in a platform file, `pin-key.ios.tsx`.
 *
 * ## Two things that must stay as they are
 *
 * Every `Host` that should fill the width takes `matchContents={{ vertical: true }}`, not
 * plain `matchContents`. The plain form sizes the native content in both directions, so a
 * centred `Column` centres within its own width and the whole block ends up against the
 * left edge - which is exactly how the heading first came out.
 *
 * The refusal shake and dots are React Native views because the universal layer has no
 * animation support, and native rows turn very small bordered shapes into beveled marks.
 */

import { Button, Column, Row } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { PIN_LENGTH } from '../security/lock';
import { Fonts, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Host } from './host';
import { Icon } from './icon';
import { Icons, type AppIcon } from './icons';
import { KeyGroup, keyBackground, keyModifiers } from './pin-key';
import { Text } from './text';

/** How far the dots travel when a PIN is refused, and how long one leg of the shake takes. */
const SHAKE = 12;
const SHAKE_MS = 45;

const IOS = process.env.EXPO_OS === 'ios';

/** The rows, as they sit on every phone's own passcode screen. */
const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

/** The telephone letters shown below the corresponding digits on iOS. */
const LETTERS: Record<string, string> = {
  2: 'ABC',
  3: 'DEF',
  4: 'GHI',
  5: 'JKL',
  6: 'MNO',
  7: 'PQRS',
  8: 'TUV',
  9: 'WXYZ',
};

/**
 * A key wide enough for a thumb, and the two gaps around it.
 *
 * Measured off the platforms' own pads: the columns sit further apart than the rows, which
 * is what stops three circles in a line reading as one bar. Equal gaps look wrong even
 * though they sound right.
 */
const METRICS = IOS
  ? {
      key: 76,
      columnGap: 26,
      rowGap: 14,
      topInset: Spacing.six,
      bottomInset: Spacing.four,
      headingGap: Spacing.five,
      dot: 14,
      dotGap: Spacing.four,
      digit: 34,
    }
  : {
      key: 72,
      columnGap: 20,
      rowGap: 12,
      topInset: Spacing.five,
      bottomInset: Spacing.five,
      headingGap: 20,
      dot: 10,
      dotGap: Spacing.three,
      digit: 30,
    };

/** The immersive iOS keypad is deliberately larger than the ordinary settings editor. */
const IOS_LOCK_METRICS = {
  ...METRICS,
  key: 88,
  columnGap: 26,
  rowGap: 18,
  digit: 42,
};

export interface PadAccessory {
  icon?: AppIcon;
  action?: string;
  label: string;
  onPress: () => void;
}

export function PinPad({
  value,
  onChange,
  onComplete,
  header,
  appearance = 'default',
  disabled,
  refusals = 0,
  accessory,
  topInset = 0,
  bottomInset = 0,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The sixth digit is the submission; there is no separate confirm key to press. */
  onComplete: (pin: string) => void;
  /** The words above the dots: what this screen is, and where the person stands. */
  header?: ReactNode;
  /** The immersive iOS passcode composition used by the lock and PIN-management flows. */
  appearance?: 'default' | 'lock';
  disabled?: boolean;
  /**
   * How many times the caller has refused a PIN. The dots shake whenever this goes up,
   * which keeps "was it rejected" a fact the caller owns rather than a method it has to
   * remember to call on a ref.
   */
  refusals?: number;
  /** The bottom-left key: the biometric one on the lock screen, nothing while setting up. */
  accessory?: PadAccessory;
  topInset?: number;
  bottomInset?: number;
}) {
  const palette = usePalette();
  const { height } = useWindowDimensions();
  const lockAppearance = IOS && appearance === 'lock';
  const compactLock = lockAppearance && height < 760;
  const metrics = lockAppearance ? IOS_LOCK_METRICS : METRICS;
  // `useState` with an initialiser rather than a ref, which is how the rest of the app makes
  // an `Animated.Value`: a ref read during render is what the compiler's rules forbid, and
  // this one is read on every render.
  const [shake] = useState(() => new Animated.Value(0));
  const shaken = useRef(refusals);
  // Native button events can arrive faster than React commits the controlled `value` prop.
  // This ref advances synchronously so rapid digits cannot overwrite one another.
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (refusals === shaken.current) return;
    shaken.current = refusals;

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence(
      [-1, 1, -0.8, 0.8, -0.45, 0.45, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: SHAKE_MS, useNativeDriver: true })
      )
    ).start();
  }, [refusals, shake]);

  const press = useCallback(
    (digit: string) => {
      if (disabled || valueRef.current.length >= PIN_LENGTH) return;
      if (IOS) void Haptics.selectionAsync();

      const next = valueRef.current + digit;
      valueRef.current = next;
      onChange(next);
      if (next.length === PIN_LENGTH) onComplete(next);
    },
    [disabled, onChange, onComplete]
  );

  const backspace = useCallback(() => {
    if (disabled || valueRef.current.length === 0) return;
    if (IOS) void Haptics.selectionAsync();
    const next = valueRef.current.slice(0, -1);
    valueRef.current = next;
    onChange(next);
  }, [disabled, onChange]);

  const numberRows = (
    <KeyGroup>
      <Column spacing={metrics.rowGap} alignment="center">
        {ROWS.map((row) => (
          <Row key={row[0]} spacing={metrics.columnGap} alignment="center">
            {row.map((digit) => (
              <Key
                key={digit}
                digit={digit}
                size={metrics.key}
                digitSize={metrics.digit}
                lockAppearance={lockAppearance}
                onPress={() => press(digit)}
                disabled={disabled}
              />
            ))}
          </Row>
        ))}

        {/* The bottom row keeps its corners even when empty, so the zero stays in the
            middle where a thumb expects to find it. */}
        <Row spacing={metrics.columnGap} alignment="center">
          {!accessory ? (
            <Blank size={metrics.key} />
          ) : (
            <Key
              utility
              lockAppearance={lockAppearance}
              size={metrics.key}
              icon={accessory.icon}
              action={accessory.action}
              label={accessory.label}
              onPress={accessory.onPress}
              disabled={disabled}
            />
          )}

          <Key
            digit="0"
            size={metrics.key}
            digitSize={metrics.digit}
            lockAppearance={lockAppearance}
            onPress={() => press('0')}
            disabled={disabled}
          />

          {lockAppearance ? (
            <Key
              utility
              lockAppearance
              size={metrics.key}
              icon={Icons.backspace}
              label="Delete"
              onPress={backspace}
              disabled={disabled || value.length === 0}
            />
          ) : value.length === 0 ? (
            <Blank size={metrics.key} />
          ) : (
            <Key
              utility
              size={metrics.key}
              action={IOS ? 'Delete' : undefined}
              icon={IOS ? undefined : Icons.backspace}
              label="Delete"
              onPress={backspace}
              disabled={disabled}
            />
          )}
        </Row>
      </Column>
    </KeyGroup>
  );

  return (
    <View
      style={[
        styles.fill,
        lockAppearance && styles.lockFill,
        {
          paddingTop:
            topInset +
            (lockAppearance
              ? compactLock
                ? Spacing.six
                : Math.min(68, height * 0.08)
              : METRICS.topInset),
        },
      ]}>
      <View style={styles.top}>
        {header}

        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: metrics.dotGap,
            transform: [
              {
                translateX: shake.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-SHAKE, SHAKE],
                }),
              },
            ],
          }}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <View
              key={index}
              style={dot(index < value.length, palette, lockAppearance, metrics.dot)}
            />
          ))}
        </Animated.View>
      </View>

      {lockAppearance ? (
        // Keep a deliberate gap below the dots, while the bottom padding still reserves
        // the home-indicator safe area on every iPhone size.
        <View
          style={[
            styles.lockPad,
            {
              paddingTop: compactLock ? 80 : 140,
              paddingBottom: bottomInset + Spacing.four,
            },
          ]}>
          <Host matchContents={{ vertical: true }} style={[styles.pad, styles.lockPadHost]}>
            {numberRows}
          </Host>
        </View>
      ) : (
        <Host
          matchContents={{ vertical: true }}
          style={[styles.pad, { paddingBottom: bottomInset + METRICS.bottomInset }]}>
          {numberRows}
        </Host>
      )}
    </View>
  );
}

/**
 * One of the six dots: a ring that fills in.
 *
 * The ring stays at full strength when empty rather than being a faint outline, because it
 * is also the only thing on screen saying how long the PIN is.
 */
function dot(
  filled: boolean,
  palette: ReturnType<typeof usePalette>,
  lockAppearance: boolean,
  size: number
): ViewStyle {
  return {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: IOS ? 1.5 : 1.25,
    borderColor: filled || lockAppearance ? palette.text : palette.textSecondary,
    backgroundColor: filled ? palette.text : 'transparent',
  };
}

/**
 * One key.
 *
 * A `text` button rather than a `filled` one, with the circle supplied by the style or by
 * glass: the filled variant is each platform's *accented* button - borderedProminent on
 * iOS, a Material filled button on Android - and twelve accent-coloured keys would read as
 * twelve calls to action rather than a keypad. The press feedback is the platform's either
 * way.
 */
function Key({
  digit,
  icon,
  action,
  label,
  onPress,
  disabled,
  utility = false,
  lockAppearance = false,
  size = METRICS.key,
  digitSize = METRICS.digit,
}: {
  digit?: string;
  icon?: AppIcon;
  action?: string;
  /**
   * What a screen reader says, for the keys that are a glyph rather than a number.
   *
   * It goes on the `Icon` rather than the `Button`, because the universal components carry
   * no accessibility props of their own and `Button` takes a single child - so there is
   * nowhere else to put it. A digit key needs none: the platform reads its `Text`.
   */
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Bottom-corner actions are plain system controls, not number-key surfaces. */
  utility?: boolean;
  /**
   * The iOS passcode screens' larger keys. In the phone's own colours, like every other
   * screen - and like the glass itself, which takes its tint from the phone's light or dark
   * setting whatever is behind it.
   */
  lockAppearance?: boolean;
  size?: number;
  digitSize?: number;
}) {
  const palette = usePalette();
  const letters = digit ? LETTERS[digit] : undefined;

  return (
    <Button
      variant="text"
      onPress={onPress}
      disabled={disabled}
      modifiers={utility ? undefined : keyModifiers()}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: utility ? undefined : keyBackground(palette.surfaceRaised),
      }}>
      <Column spacing={0} alignment="center">
        {digit ? (
          <Text
            textStyle={{
              fontSize: digitSize,
              fontWeight: '400',
              fontFamily: lockAppearance ? Fonts?.sans : IOS ? Fonts?.rounded : Fonts?.sans,
              color: palette.text,
            }}>
            {digit}
          </Text>
        ) : null}
        {action ? (
          <Text textStyle={{ fontSize: 15, fontWeight: '500', color: palette.text }}>
            {action}
          </Text>
        ) : null}
        {icon ? (
          <Icon
            name={icon}
            size={lockAppearance ? 30 : 27}
            color={palette.text}
            accessibilityLabel={label}
          />
        ) : null}
        {IOS && letters ? (
          <Text
            textStyle={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.2,
              color: lockAppearance ? palette.text : palette.textSecondary,
            }}>
            {letters}
          </Text>
        ) : null}
      </Column>
    </Button>
  );
}

/** A hole in the grid the same size as a key, so the row above it stays lined up. */
function Blank({ size = METRICS.key }: { size?: number }) {
  return <Row style={{ width: size, height: size }} />;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    // Heading and dots at the top, keypad at the bottom, and the slack between them.
    justifyContent: 'space-between',
  },
  lockFill: {
    justifyContent: 'flex-start',
  },
  top: {
    alignItems: 'center',
    gap: METRICS.headingGap,
    paddingHorizontal: Spacing.six,
  },
  pad: {
    alignItems: 'center',
  },
  lockPad: {
    flex: 1,
  },
  lockPadHost: {
    alignSelf: 'stretch',
  },
});
