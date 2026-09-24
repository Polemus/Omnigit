/** Android/web native text, with the app's Bold Text preference applied. */

import { Text as UniversalText, type TextProps } from '@expo/ui';

import { useDisplayPreferences } from '../state/display-preferences';

export function Text({ textStyle, ...props }: TextProps) {
  const { boldText } = useDisplayPreferences();
  const weight = String(textStyle?.fontWeight ?? '400');
  const promoteWeight = boldText && !['bold', '700', '800', '900'].includes(weight);

  return (
    <UniversalText
      {...props}
      textStyle={promoteWeight ? { ...textStyle, fontWeight: '700' } : textStyle}
    />
  );
}
