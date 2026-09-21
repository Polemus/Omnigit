/**
 * A list row's supporting line with some of it coloured: the + and − of a change, in the
 * diff's own green and red.
 *
 * A string in a `ListItem`'s supporting slot is one colour by construction, and a React
 * Native view there has no intrinsic size (see `Meta` in rows.tsx). Both platforms can
 * colour runs inside a single native text, though - SwiftUI by adding `Text`s together,
 * Compose with `AnnotatedString` spans - so the line stays one native text that wraps and
 * sizes exactly like the plain string it replaces. Those two are `change-text.ios.tsx` and
 * `change-text.android.tsx`. This file is the web version, where the row is plain React
 * Native, and the one TypeScript reads.
 */

import { StyleSheet, Text } from 'react-native';

import { usePalette } from '../theme/use-palette';

export interface TextRun {
  text: string;
  /** Coloured as lines added or removed. Without one, the run keeps the row's own colour. */
  tone?: 'added' | 'removed';
}

export function ChangeText({ runs }: { runs: TextRun[] }) {
  const palette = usePalette();

  return (
    // The size and colour `ListItem` gives a plain supporting string on web.
    <Text style={[styles.supporting, { color: palette.textSecondary }]}>
      {runs.map((run, index) => (
        <Text
          key={index}
          style={
            run.tone ? { color: run.tone === 'added' ? palette.added : palette.removed } : null
          }>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  supporting: {
    fontSize: 13,
  },
});
