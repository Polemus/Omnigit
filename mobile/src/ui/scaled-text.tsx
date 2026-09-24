/**
 * Text in the app's own views, at the size the reader chose rather than the one the phone
 * was set to. Import `Text` from here, never from `react-native` - lint enforces it.
 *
 * Two things happen here. `allowFontScaling` is off, so the system text size does not reach
 * this text at all: the app is drawn at its own size and the reader's own setting is the
 * only thing that changes it (`src/state/text-scale.tsx`). And the style's `fontSize` is
 * multiplied by that setting, along with any `lineHeight` beside it, because a line height
 * left where it was turns bigger text into overlapping text.
 *
 * A style with no size of its own is scaled from React Native's default of 14, which is the
 * size such text is drawn at.
 *
 * `TextInput` is not covered: there are two in the app, and each scales the one size it
 * sets. Anything new that draws text in a native row scales through its own platform
 * instead - see the note in `src/state/text-scale.tsx`.
 */

import { useMemo } from 'react';
import { StyleSheet, Text as ReactNativeText, type TextProps, type TextStyle } from 'react-native';

import { useDisplayPreferences } from '../state/display-preferences';

/** React Native's own default, which a style that sets no size is drawn at. */
const DEFAULT_FONT_SIZE = 14;

export function Text({ style, ...props }: TextProps) {
  const { boldText, scale } = useDisplayPreferences();
  const scaled = useMemo(() => resize(style, scale, boldText), [boldText, style, scale]);

  return <ReactNativeText {...props} allowFontScaling={false} style={scaled} />;
}

function resize(style: TextProps['style'], scale: number, boldText: boolean): TextProps['style'] {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const size = typeof flat?.fontSize === 'number' ? flat.fontSize : DEFAULT_FONT_SIZE;
  const height = typeof flat?.lineHeight === 'number' ? flat.lineHeight : undefined;
  const weight = String(flat?.fontWeight ?? '400');
  const promoteWeight = boldText && !['bold', '700', '800', '900'].includes(weight);

  if (scale === 1 && !promoteWeight) return style;

  return [
    style,
    {
      fontSize: size * scale,
      ...(height === undefined ? null : { lineHeight: height * scale }),
      ...(promoteWeight ? { fontWeight: '700' as const } : null),
    },
  ];
}
