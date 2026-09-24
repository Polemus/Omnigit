/**
 * Android: grouped sections in which each row is the rounded card, not a card inside one.
 *
 * `@expo/ui`'s own Android section wraps every row in a Material `ListItem` of its own - the
 * tinted, rounded shape of Material's connected list - and puts the row inside that. Every
 * row in this app is a `ListItem` already, which paints its own background in `surface` and
 * pads itself. So each one came out as a plain box, inset by the wrapper's padding, inside a
 * tinted rounded one: a card in a card, its content pushed 32 in from the edge, and a press
 * ripple that stopped short of the card it appeared to be.
 *
 * Here the section draws only the card - the shape, clipped, in `surfaceContainer` - and the
 * row fills it. `ListItem` reads `useSectionRow()` and paints itself in the card's colour, so
 * its content sits at its own padding from the card's edge and its ripple, clipped by the
 * card, reaches every corner: what iOS gets from SwiftUI, in Material's shapes. Anything else
 * in a row - a text field, a block of Markdown - has no padding of its own and goes in
 * `SectionRow`, which gives it the padding the wrapper used to. Left out, it still sits on a
 * card, only hard against its edge.
 *
 * Everything else is `@expo/ui`'s own, measure for measure: the list's gaps and padding, the
 * header and the footer, the corner radii by position, loose rows gathered into a section of
 * their own. The header and footer markers are `@expo/ui`'s, so call sites do not change.
 */

import {
  FieldGroup as UniversalFieldGroup,
  getFieldItemPosition,
  type FieldItemPosition,
} from '@expo/ui';
import { Column, LazyColumn, Text, useMaterialColors } from '@expo/ui/jetpack-compose';
import {
  background,
  clip,
  defaultMinSize,
  fillMaxWidth,
  padding,
  paddingAll,
  Shapes,
  testID as testIDModifier,
  type ModifierConfig,
} from '@expo/ui/jetpack-compose/modifiers';
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react';

import { useDisplayPreferences } from '../state/display-preferences';
// Types only, which the build erases: at runtime './field-group' from here is this file.
import type { FieldGroupComponent, GroupProps, SectionProps, SectionStyle } from './field-group';

const RowPosition = createContext<FieldItemPosition | null>(null);

export function useSectionRow(): FieldItemPosition | null {
  return useContext(RowPosition);
}

/** Material's one-line list row, which is what the wrapper made of anything it held. */
const ROW_MIN_HEIGHT = 56;

export function SectionRow({ children }: { children: ReactNode }) {
  const row = useSectionRow();
  if (!row) return <>{children}</>;
  return (
    <Column
      verticalArrangement="center"
      modifiers={[
        fillMaxWidth(),
        defaultMinSize({ minHeight: ROW_MIN_HEIGHT }),
        padding(16, 8, 16, 8),
      ]}>
      {children}
    </Column>
  );
}

function Group({ children, hidden, testID }: GroupProps) {
  const colors = useMaterialColors();
  if (hidden) return null;
  return (
    <LazyColumn
      verticalArrangement={{ spacedBy: 24 }}
      contentPadding={{ start: 16, end: 16, top: 16, bottom: 16 }}
      modifiers={[background(colors.surface), ...testIDModifiers(testID)]}>
      {gatherSections(children)}
    </LazyColumn>
  );
}

function Section({
  children,
  title,
  titleUppercase = false,
  style,
  hidden,
  testID,
}: SectionProps) {
  const colors = useMaterialColors();
  const { boldText } = useDisplayPreferences();
  if (hidden) return null;

  const { header, footer, rows } = sectionSlots(children);
  const heading =
    header ??
    (title ? (
      <Text
        color={colors.onSurfaceVariant}
        style={{
          typography: 'titleMedium',
          fontWeight: boldText ? 'bold' : undefined,
          letterSpacing: titleUppercase ? 0.5 : undefined,
        }}>
        {titleUppercase ? title.toUpperCase() : title}
      </Text>
    ) : null);

  return (
    <Column
      verticalArrangement={{ spacedBy: 4 }}
      modifiers={[...paddingModifiers(style), fillMaxWidth(), ...testIDModifiers(testID)]}>
      {heading ? <Column modifiers={[padding(16, 0, 16, 8)]}>{heading}</Column> : null}
      {rows.length > 0 ? (
        <Column verticalArrangement={{ spacedBy: 2 }} modifiers={[fillMaxWidth()]}>
          {/* Keyed by position, as `@expo/ui` keys its own, and not by the row's key - which
              was tried and crashed the app. React then matches rows across a change by
              identity and *moves* the ones it recognises, and a moved row is a native view
              taken from one parent and given to another inside a single frame. Compose
              hands such a view to a new holder before the old one has let go of it, and
              Android refuses: "The specified child already has a parent". Switching owner
              on the repositories list did it every time. By position, a row that is no
              longer the third row is rebuilt as the third row instead, which costs a little
              work on a change and cannot move anything. */}
          {rows.map((row, index) => {
            const position = getFieldItemPosition(index, rows.length);
            return (
              <RowPosition.Provider key={index} value={position}>
                <Column
                  modifiers={[
                    fillMaxWidth(),
                    clip(Shapes.RoundedCorner(cornerRadii(position))),
                    background(colors.surfaceContainer),
                  ]}>
                  {row}
                </Column>
              </RowPosition.Provider>
            );
          })}
        </Column>
      ) : null}
      {footer ? <Column modifiers={[padding(16, 4, 16, 0)]}>{footer}</Column> : null}
    </Column>
  );
}

export const FieldGroup: FieldGroupComponent = Object.assign(Group, {
  Section,
  SectionHeader: UniversalFieldGroup.SectionHeader,
  SectionFooter: UniversalFieldGroup.SectionFooter,
});

/** `@expo/ui`'s radii: fully round at the ends of a section, slightly between its rows. */
function cornerRadii(position: FieldItemPosition) {
  const full = 20;
  const small = 4;
  switch (position) {
    case 'only':
      return { topStart: full, topEnd: full, bottomStart: full, bottomEnd: full };
    case 'leading':
      return { topStart: full, topEnd: full, bottomStart: small, bottomEnd: small };
    case 'trailing':
      return { topStart: small, topEnd: small, bottomStart: full, bottomEnd: full };
    case 'middle':
    default:
      return { topStart: small, topEnd: small, bottomStart: small, bottomEnd: small };
  }
}

/** The padding cascade `@expo/ui` applies: `paddingTop` over `paddingVertical` over `padding`. */
function paddingModifiers(style: SectionStyle | undefined): ModifierConfig[] {
  if (!style) return [];
  const all = (style.padding as number | undefined) ?? 0;
  const top = (style.paddingTop ?? style.paddingVertical ?? all) as number;
  const bottom = (style.paddingBottom ?? style.paddingVertical ?? all) as number;
  const start = (style.paddingLeft ?? style.paddingHorizontal ?? all) as number;
  const end = (style.paddingRight ?? style.paddingHorizontal ?? all) as number;
  if (!top && !bottom && !start && !end) return [];
  return top === bottom && bottom === start && start === end
    ? [paddingAll(top)]
    : [padding(start, top, end, bottom)];
}

function testIDModifiers(testID: string | undefined): ModifierConfig[] {
  return testID ? [testIDModifier(testID)] : [];
}

/**
 * Loose rows between sections gathered into a section of their own, as SwiftUI's `Form`
 * does and `@expo/ui` copies - which is also why sections are known by element type, and a
 * component that returns one is read as a row.
 */
function gatherSections(children: ReactNode): ReactNode[] {
  const result: ReactNode[] = [];
  let loose: ReactNode[] = [];
  const flush = () => {
    if (loose.length === 0) return;
    result.push(<Section key={`__loose-${result.length}__`}>{loose}</Section>);
    loose = [];
  };
  const walk = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (child == null || typeof child === 'boolean') return;
      if (isValidElement(child) && child.type === Fragment) {
        walk((child.props as { children?: ReactNode }).children);
      } else if (isValidElement(child) && child.type === Section) {
        flush();
        result.push(child);
      } else {
        loose.push(child);
      }
    });
  };
  walk(children);
  flush();
  return result;
}

function sectionSlots(children: ReactNode) {
  let header: ReactNode | undefined;
  let footer: ReactNode | undefined;
  const rows: ReactNode[] = [];
  const walk = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (child == null || typeof child === 'boolean') return;
      if (!isValidElement(child)) {
        rows.push(child);
        return;
      }
      const element = child as ReactElement<{ children?: ReactNode }>;
      if (element.type === UniversalFieldGroup.SectionHeader) header = element.props.children;
      else if (element.type === UniversalFieldGroup.SectionFooter) footer = element.props.children;
      else if (element.type === Fragment) walk(element.props.children);
      else rows.push(element);
    });
  };
  walk(children);
  return { header, footer, rows };
}
