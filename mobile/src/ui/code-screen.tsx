/**
 * The body of a screen that shows code - the file viewer and the two diff screens - which
 * are the screens that may turn sideways (`rotation.ts`).
 *
 * Sideways, a phone's notch or Dynamic Island sits at one end of every line, and Android's
 * camera cutout does the same. The header keeps clear of it by itself; the path bar and the
 * code below it do not, so the body is inset from both sides by the safe area - which is
 * nothing at all when the phone is upright. `CodeView` and `DiffView` size their full-width
 * rows to match.
 */

import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function CodeScreenBody({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.fill}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
