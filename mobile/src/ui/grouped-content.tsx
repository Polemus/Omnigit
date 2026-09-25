/**
 * A bounded React Native island inside a native grouped row.
 *
 * FieldGroup is rendered by SwiftUI/Compose, while conversations and diffs are React
 * Native views. RNHostView bridges the two, and the explicit width prevents long
 * Markdown or diff lines from making the native row wider than the phone.
 *
 * On Android the row pads nothing it did not draw itself, so this goes in `SectionRow`,
 * which gives it a list row's padding - the 32 the Android chrome below allows for.
 */

import { RNHostView } from '@expo/ui';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { SectionRow } from './field-group';
import { useContentWidth, useNativeListFrameWidth } from './screen';

const IOS_GROUPED_ROW_INSET = 40;
const ANDROID_GROUPED_ROW_CHROME = 64;

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
  const width = useContentWidth();
  const listFrameWidth = useNativeListFrameWidth();
  const contentWidth =
    Platform.OS === 'ios'
      ? listFrameWidth - IOS_GROUPED_ROW_INSET - extraChrome
      : width - ANDROID_GROUPED_ROW_CHROME - extraChrome;

  return (
    <SectionRow>
      <RNHostView matchContents>
        <View
          style={[
            styles.content,
            // Never enforce a minimum wider than the native row. A very narrow Split View
            // column should reflow Markdown and comments, not push their leading edge away.
            { width: Math.max(1, contentWidth) },
          ]}>
          {children}
        </View>
      </RNHostView>
    </SectionRow>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'stretch',
  },
});
