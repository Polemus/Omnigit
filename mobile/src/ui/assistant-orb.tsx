/**
 * The assistant, drawn: a sphere of the Apple Intelligence spectrum, slowly turning, with a
 * sparkle on it. The same orb everywhere the assistant is - the repository screen's
 * button, the conversation's header, the empty conversation - so it is recognisable at a
 * glance, the way Siri's orb is.
 *
 * The turning is the gradient rotating under a fixed sparkle. A circle looks the same at
 * every angle, so rotating it moves only the colours: a slow swirl that costs one
 * native-driver transform and never touches JavaScript once it has started.
 */

import { Host } from '@expo/ui';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AssistantColours } from '../theme/tokens';
import { Icon } from './icon';
import { Icons } from './icons';

const { peach, coral, pink, lavender, periwinkle, sky, glyph } = AssistantColours;

const SPECTRUM = `linear-gradient(135deg, ${peach} 0%, ${coral} 26%, ${pink} 46%, ${lavender} 66%, ${periwinkle} 84%, ${sky} 100%)`;

export function AssistantOrb({
  size,
  spinning = true,
  glow = false,
  style,
}: {
  size: number;
  /** A slow turn of the colours. Off where the orb is small enough to read as a flicker. */
  spinning?: boolean;
  /** A soft coloured light around it, for where it floats over other content. */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [turn] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!spinning) return;
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, turn]);

  const radius = size / 2;
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius },
        glow ? { boxShadow: `0 ${size * 0.12}px ${size * 0.45}px ${lavender}99` } : null,
        style,
      ]}>
      {/* Lavender underneath, so wherever gradients are not drawn the orb is still the
          assistant's colour rather than a hole. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, overflow: 'hidden', backgroundColor: lavender },
        ]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { experimental_backgroundImage: SPECTRUM, transform: [{ rotate }] },
          ]}
        />
      </View>
      <View style={styles.centre} pointerEvents="none">
        <Host matchContents>
          <Icon name={Icons.sparkles} size={Math.round(size * 0.46)} color={glyph} />
        </Host>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
