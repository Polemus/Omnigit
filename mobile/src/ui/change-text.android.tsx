/**
 * Android: one Compose `Text` whose runs become `AnnotatedString` spans.
 *
 * See `change-text.tsx` for why this is not a React Native view.
 */

import { Text } from '@expo/ui/jetpack-compose';

import { usePalette } from '../theme/use-palette';
import type { TextRun } from './change-text';

export function ChangeText({ runs }: { runs: TextRun[] }) {
  const palette = usePalette();

  // No colour on the outer text, or on the plain runs: an unset colour is
  // `Color.Unspecified` natively, which falls through to the colour Material's list item
  // gives its supporting line - exactly what a plain string there would get.
  return (
    <Text>
      {runs.map((run, index) => (
        <Text
          key={index}
          color={run.tone ? (run.tone === 'added' ? palette.added : palette.removed) : undefined}>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}
