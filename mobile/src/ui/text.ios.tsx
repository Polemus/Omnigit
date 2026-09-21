/**
 * iOS: a `textStyle.color` goes on as `foregroundColor` rather than as the `foregroundStyle`
 * the universal `Text` turns it into, which native code older than @expo/ui 57.0.15 drops.
 * See `swiftui-colour.ts`.
 */

import { Text as UniversalText, type TextProps } from '@expo/ui';

import { foreground } from './swiftui-colour';

export function Text({ textStyle, modifiers, ...props }: TextProps) {
  if (!textStyle?.color) {
    return <UniversalText {...props} textStyle={textStyle} modifiers={modifiers} />;
  }

  const { color, ...rest } = textStyle;
  return (
    <UniversalText
      {...props}
      textStyle={rest}
      modifiers={[...(modifiers ?? []), foreground(color)]}
    />
  );
}
