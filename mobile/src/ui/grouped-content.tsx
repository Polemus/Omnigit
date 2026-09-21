/**
 * A bounded React Native island inside a native grouped row.
 *
 * FieldGroup is rendered by SwiftUI/Compose, while conversations and diffs are React
 * Native views. RNHostView bridges the two, and the explicit width prevents long
 * Markdown or diff lines from making the native row wider than the phone.
 */

import { RNHostView } from '@expo/ui';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

const GROUPED_ROW_CHROME = Platform.OS === 'ios' ? 72 : 64;

export function GroupedContent({
  children,
  extraChrome = 0,
}: {
  children: ReactNode;
  /**
   * Width taken by anything around the section beyond the grouped row itself - the same
   * option `Meta` in rows.tsx has. A section inside a `List` with `androidSectionStyle`
   * is 32 narrower on Android than one inside `FieldGroup`, which this constant was
   * measured against.
   */
  extraChrome?: number;
}) {
  const { width } = useWindowDimensions();

  return (
    <RNHostView matchContents>
      <View
        style={[
          styles.content,
          { width: Math.max(240, width - GROUPED_ROW_CHROME - extraChrome) },
        ]}>
        {children}
      </View>
    </RNHostView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'stretch',
  },
});
