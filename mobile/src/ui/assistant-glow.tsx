/**
 * The glow around the edges of the screen as the assistant opens - Siri's, measured off a
 * screen recording of it rather than guessed at.
 *
 * Siri's glow is two shapes in sequence, not one. First a flare: one edge catches the light
 * in about a fifth of a second and the others follow a breath behind, sweeping round, and it
 * is *deep* - at its peak it is dimmer at the edge itself than it is 20pt inside, and still
 * lit 90pt in. As that falls away a rim is left: the opposite shape, brightest at the very
 * edge and gone within 10pt, its colours drifting slowly round while it sits there. Then it
 * fades. Neither phase is a hard line, which is the whole difference between light and a
 * coloured border.
 *
 * Drawn over everything, by `AssistantGlowHost` in the root layout, because it frames the
 * display rather than a screen: it has to sit over the navigation bar, and over the
 * conversation sliding in beneath it. It never takes a touch, and screen readers skip it.
 * `showAssistantGlow()` starts it from anywhere; calling it again restarts it.
 *
 * Built from inset box shadows - React Native's own since 0.76, no graphics library. One
 * clock drives everything and only opacity is ever animated, on the native driver, so
 * nothing is recomputed per frame.
 */

import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantColours } from '../theme/tokens';

const { peach, coral, pink, lavender, periwinkle, sky } = AssistantColours;

/** Warm to cool and back round, so neighbouring edges are always neighbouring colours. */
const SPECTRUM = [peach, coral, pink, lavender, periwinkle, sky];

/** How brightly it ever burns. The one knob for the whole effect: lower is more subtle. */
const PEAK = 0.8;

/**
 * How much of that the lingering rim gets. High, because Siri's rim is close to full colour
 * where it meets the edge - what keeps it from reading as a border is its width, not its
 * brightness: it is half gone 7pt in and finished by 30pt.
 */
const RIM = 0.85;

/**
 * The measured envelope, in milliseconds: the flare arrives, falls back, the rim holds, and
 * everything fades. Siri's own rim holds for seconds because it is waiting for you to
 * speak; an opening has nothing to wait for, so the hold here is shorter.
 */
const FLARE_IN = 220;
const FLARE_OUT = 780;
const HOLD = 1200;
const FADE_OUT = 520;
const DURATION = FLARE_IN + FLARE_OUT + HOLD + FADE_OUT;

type Edge = 'top' | 'right' | 'bottom' | 'left';

/**
 * Which edge catches the light first, how far behind the rest follow, and how much of the
 * flare each one gets - all measured. The weights matter as much as the delays: the first
 * edge is far the brightest and the last barely lit, and without that the four wash into one
 * another and the screen just goes evenly grey instead of being lit from one side.
 */
const SWEEP: { edge: Edge; colour: string; delay: number; weight: number }[] = [
  { edge: 'right', colour: coral, delay: 0, weight: 1 },
  { edge: 'top', colour: sky, delay: 80, weight: 0.45 },
  { edge: 'left', colour: pink, delay: 130, weight: 0.35 },
  { edge: 'bottom', colour: periwinkle, delay: 150, weight: 0.8 },
];

type Listener = () => void;
const listeners = new Set<Listener>();

/** Lights the glow. Harmless when no host is mounted, and restarts one that is running. */
export function showAssistantGlow(): void {
  listeners.forEach((listener) => listener());
}

/** Mounted once, above the navigator, in the root layout. */
export function AssistantGlowHost() {
  const [run, setRun] = useState(0);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const listener = () => {
      setRun((current) => current + 1);
      setLit(true);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Stable, because the animation's effect depends on it and must not restart mid-glow.
  const finish = useCallback(() => setLit(false), []);

  // Keyed by the run, so lighting it again starts the animation from the beginning.
  return lit ? <Glow key={run} onDone={finish} /> : null;
}

function Glow({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();

  // Milliseconds since the glow was lit. Every opacity below is a reading of this one
  // value, so the phases cannot drift apart from one another.
  const [clock] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(clock, {
      toValue: DURATION,
      duration: DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
  }, [clock, onDone]);

  const radius = displayCornerRadius(insets.top);

  // Up as the flare falls, then flat for the hold, then out.
  const rim = clock.interpolate({
    inputRange: [FLARE_IN * 0.5, FLARE_IN + FLARE_OUT * 0.5, DURATION - FADE_OUT, DURATION],
    outputRange: [0, RIM, RIM, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { opacity: PEAK }]}>
      {/* The rim, in layers that hand over to one another so its colours travel round. */}
      {SPECTRUM.map((_, layer) => (
        <Animated.View
          key={`rim-${layer}`}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              boxShadow: rimShadows(layer),
              opacity: Animated.multiply(clock.interpolate(handover(layer)), rim),
            },
          ]}
        />
      ))}

      {/* The flare, one edge at a time, each lighting a little after the one before it. */}
      {SWEEP.map(({ edge, colour, delay, weight }) => (
        <Animated.View
          key={`flare-${edge}`}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              boxShadow: flareShadow(edge, colour),
              opacity: clock.interpolate({
                inputRange: [delay, delay + FLARE_IN, delay + FLARE_IN + FLARE_OUT],
                outputRange: [0, weight, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

/** One inset shadow, pushed in from whichever edge it belongs to. */
function inset(edge: Edge, offset: number, blur: number, spread: number, colour: string): string {
  const x = edge === 'right' ? -offset : edge === 'left' ? offset : 0;
  const y = edge === 'bottom' ? -offset : edge === 'top' ? offset : 0;
  return `inset ${x}px ${y}px ${blur}px ${spread}px ${colour}`;
}

/**
 * The flare on one edge: deep and soft, brightest around 20pt inside the screen and still
 * carrying at 90pt, which is what makes it read as the display being lit from beyond its
 * own edge rather than outlined at it.
 */
function flareShadow(edge: Edge, colour: string): string {
  return [inset(edge, 26, 90, -20, `${colour}8C`), inset(edge, 64, 170, -56, `${colour}4D`)].join(
    ', '
  );
}

/**
 * The rim that the flare leaves behind: four edges in four neighbouring colours of the
 * spectrum, tight against the edge and gone within about 10pt - the shape Siri holds while
 * it waits.
 */
function rimShadows(layer: number): string {
  const edges: Edge[] = ['top', 'right', 'bottom', 'left'];
  const shadows: string[] = [];
  edges.forEach((edge, step) => {
    const colour = SPECTRUM[(layer + step) % SPECTRUM.length];
    shadows.push(inset(edge, 3, 9, -1, `${colour}CC`));
    shadows.push(inset(edge, 9, 22, -7, `${colour}4D`));
  });
  return shadows.join(', ');
}

/**
 * When a rim layer is showing: fully at its own step, handing over to its neighbours either
 * side, so exactly two layers share the light at any moment and it never dims mid-turn.
 * The first layer is also the last, closing the loop. Read in milliseconds off the clock.
 */
function handover(layer: number): Animated.InterpolationConfigType {
  const steps = SPECTRUM.length;
  const step = DURATION / steps;
  return layer === 0
    ? {
        inputRange: [0, step, (steps - 1) * step, steps * step],
        outputRange: [1, 0, 0, 1],
        extrapolate: 'clamp',
      }
    : {
        inputRange: [(layer - 1) * step, layer * step, (layer + 1) * step],
        outputRange: [0, 1, 0],
        extrapolate: 'clamp',
      };
}

/**
 * Roughly the radius of the display's own corners, so the rim follows them.
 *
 * Neither platform says what it is, so it is read off the top safe area, which tracks the
 * generations of iPhone that changed it: the Dynamic Island ones are the roundest, the
 * home-button ones square. Android has no such tell; most current phones are rounded.
 */
function displayCornerRadius(topInset: number): number {
  if (process.env.EXPO_OS !== 'ios') return 28;
  if (topInset >= 59) return 55;
  if (topInset >= 47) return 47;
  if (topInset >= 44) return 39;
  return 0;
}
