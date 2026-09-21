/**
 * iOS: one SwiftUI `Text` made of runs added together, each run coloured on its own.
 *
 * See `change-text.tsx` for why this is not a React Native view, and `swiftui-colour.ts`
 * for why the colours go on as they do - both the green and red of the counts and the grey
 * of the rest of the line, which matches every other row's second line (`list-item.ios.tsx`).
 */

import { Text } from '@expo/ui/swift-ui';

import { usePalette } from '../theme/use-palette';
import type { TextRun } from './change-text';
import { foreground, secondaryForeground } from './swiftui-colour';

export function ChangeText({ runs }: { runs: TextRun[] }) {
  const palette = usePalette();

  // A colour set on a run beats the one set on the text around it, so the plain runs take
  // the grey and the counts keep their own.
  return (
    <Text modifiers={[secondaryForeground]}>
      {runs.map((run, index) => (
        <Text
          key={index}
          modifiers={
            run.tone
              ? [foreground(run.tone === 'added' ? palette.added : palette.removed)]
              : undefined
          }>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}
