/**
 * The repository assistant's button: the orb, floating in the corner of the repository
 * screen, opening a conversation about the repository.
 *
 * Opening it is an occasion, the way calling Siri is: a firm tap, a soft chime, and the
 * glow sweeping around the edges of the screen as the conversation slides in. The chime is
 * loaded with the screen rather than on the tap, so it lands with the finger, and it plays
 * alongside whatever the phone is already playing rather than pausing it - and not at all
 * with the silent switch on, like any other sound an interface makes.
 */

import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAssistantGlow } from './assistant-glow';
import { AssistantOrb } from './assistant-orb';

const CHIME = require('../../assets/sounds/assistant-open.wav');

let audioReady: Promise<void> | undefined;

/** The one audio setting the app has: sounds mix in, and respect the silent switch. */
function prepareAudio(): Promise<void> {
  audioReady ??= setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {});
  return audioReady;
}

export function AssistantButton({
  account,
  owner,
  name,
}: {
  account: string;
  owner: string;
  name: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chime = useAudioPlayer(CHIME);
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    void prepareAudio();
  }, []);

  const press = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      speed: 40,
      bounciness: 8,
      useNativeDriver: true,
    }).start();

  const open = async () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showAssistantGlow();
    router.push({ pathname: '/chat', params: { account, owner, name } });

    // After the glow and the navigation, which must not wait on audio.
    await prepareAudio();
    try {
      await chime.seekTo(0);
      chime.play();
    } catch {
      // A chime that cannot play is not worth an error; the glow already said it.
    }
  };

  return (
    <Animated.View style={[styles.anchor, { bottom: insets.bottom + 16, transform: [{ scale }] }]}>
      <Pressable
        onPress={() => void open()}
        onPressIn={() => press(0.9)}
        onPressOut={() => press(1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Ask the assistant about ${name}`}>
        <AssistantOrb size={56} glow />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: 20,
  },
});
