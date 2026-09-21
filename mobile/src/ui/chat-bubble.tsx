/**
 * A message in the assistant's conversation, drawn the way iMessage draws one: blue on the
 * right for what you send, grey on the left for what comes back, and the curled tail on the
 * last bubble of each run.
 *
 * The tail is the classic construction: a shape in the bubble's colour sitting over its
 * bottom corner, and a second shape in the background's colour cutting the curl into it.
 * That second shape is why the conversation has a flat background of its own
 * (`palette.chatBackground`) - the cut is only invisible against the colour it is made of.
 */

import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '../theme/tokens';

export function ChatBubble({
  text,
  outgoing,
  tail,
  palette,
}: {
  text: string;
  /** Sent by the person, rather than the assistant. */
  outgoing: boolean;
  /** The last of a run from one side, which is the bubble that carries the tail. */
  tail: boolean;
  palette: Palette;
}) {
  const colour = outgoing ? palette.chatOutgoing : palette.chatIncoming;

  return (
    <View style={[styles.row, outgoing ? styles.outgoing : styles.incoming]}>
      <View style={[styles.bubble, { backgroundColor: colour }]}>
        {tail ? (
          <Tail outgoing={outgoing} colour={colour} background={palette.chatBackground} />
        ) : null}
        <Text
          selectable
          style={[styles.text, { color: outgoing ? palette.chatOutgoingText : palette.text }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** The assistant "typing": three dots in a grey bubble, lighting up in turn. */
export function TypingBubble({ palette }: { palette: Palette }) {
  const [phase] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  return (
    <View style={[styles.row, styles.incoming]}>
      <View style={[styles.bubble, styles.typing, { backgroundColor: palette.chatIncoming }]}>
        <Tail outgoing={false} colour={palette.chatIncoming} background={palette.chatBackground} />
        {[0, 1, 2].map((dot) => {
          const peak = 0.2 + dot * 0.2;
          const inputRange = [0, peak - 0.15, peak, peak + 0.15, 1];
          return (
            <Animated.View
              key={dot}
              style={[
                styles.dot,
                {
                  backgroundColor: palette.textTertiary,
                  opacity: phase.interpolate({
                    inputRange,
                    outputRange: [0.35, 0.35, 1, 0.35, 0.35],
                  }),
                  transform: [
                    {
                      translateY: phase.interpolate({
                        inputRange,
                        outputRange: [0, 0, -2, 0, 0],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function Tail({
  outgoing,
  colour,
  background,
}: {
  outgoing: boolean;
  colour: string;
  background: string;
}) {
  return (
    <>
      <View
        style={[
          styles.tail,
          outgoing ? styles.tailOut : styles.tailIn,
          { backgroundColor: colour },
        ]}
      />
      <View
        style={[
          styles.cut,
          outgoing ? styles.cutOut : styles.cutIn,
          { backgroundColor: background },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 18,
  },
  outgoing: {
    justifyContent: 'flex-end',
  },
  incoming: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  text: {
    fontSize: 16,
    lineHeight: 21,
  },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Measured off iMessage: the tail hangs under the bubble's bottom corner rather than
  // poking out of its side - its outer edge stays 9pt inside the bubble's own edge, and it
  // reaches 6pt below the bottom. This block is the colour; it rounds nothing and overlaps
  // the body by 9pt, because the body's corner curves 18pt inward on its way down, and a
  // tail that only meets it - or that rounds its own base away - comes off the bubble as a
  // floating shard. Worst on a one-line bubble, which is 37pt tall and nearly all corner.
  tail: {
    position: 'absolute',
    bottom: -6,
    width: 18,
    height: 16,
  },
  tailOut: {
    right: 9,
  },
  tailIn: {
    left: 9,
  },
  // The curl: the tail is only what shows through this shape's corner arc, so the radius is
  // the tail's width where it leaves the bubble. Its top edge sits exactly on the bubble's
  // bottom, so it can never cut into the body, and it reaches too little of the way across
  // to touch the message below - the widest bubble on the other side stops well short.
  cut: {
    position: 'absolute',
    bottom: -10,
    width: 34,
    height: 10,
  },
  cutOut: {
    right: 9,
    borderTopRightRadius: 9,
  },
  cutIn: {
    left: 9,
    borderTopLeftRadius: 9,
  },
});
