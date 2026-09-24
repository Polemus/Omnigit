/**
 * The app's grouped sections: `@expo/ui`'s own `FieldGroup`, except on Android, where
 * `field-group.android.tsx` makes each row the rounded card itself rather than a card inside
 * one. Import `FieldGroup` from here, never from `@expo/ui` - lint enforces it.
 *
 * This file is iOS's and web's, and the one TypeScript reads. A SwiftUI section is one card
 * whatever its rows are, so nothing here changes on iOS. The props are `@expo/ui`'s, cut
 * down to what the Android version reads, so a prop it would drop fails to typecheck
 * instead of doing nothing on one platform.
 */

import {
  FieldGroup as UniversalFieldGroup,
  type FieldGroupProps,
  type FieldItemPosition,
  type FieldSectionProps,
  type UniversalStyle,
} from '@expo/ui';
import type { FC, ReactNode } from 'react';

/** What a section's `style` can say: its padding, which is all a section is ever given. */
export type SectionStyle = Pick<
  UniversalStyle,
  | 'padding'
  | 'paddingHorizontal'
  | 'paddingVertical'
  | 'paddingTop'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'paddingRight'
>;

export type GroupProps = Pick<FieldGroupProps, 'children' | 'hidden' | 'testID'>;

export type SectionProps = Pick<
  FieldSectionProps,
  'children' | 'title' | 'titleUppercase' | 'hidden' | 'testID'
> & { style?: SectionStyle };

export type FieldGroupComponent = FC<GroupProps> & {
  Section: FC<SectionProps>;
  SectionHeader: typeof UniversalFieldGroup.SectionHeader;
  SectionFooter: typeof UniversalFieldGroup.SectionFooter;
};

export const FieldGroup: FieldGroupComponent = UniversalFieldGroup;

/**
 * Where the row being drawn sits in its section, on Android - where a row draws its own
 * card. Nothing on iOS, and nothing outside a section.
 */
export function useSectionRow(): FieldItemPosition | null {
  return null;
}

/**
 * A section row that is not a `ListItem` - a text field, a block of Markdown - given the
 * padding a `ListItem` brings of its own. Only Android needs it; see
 * `field-group.android.tsx`.
 */
export function SectionRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
