/**
 * Enough Markdown to read a README, a pull request body or a comment.
 *
 * Deliberately small and deliberately not a full parser. A README that renders as one
 * grey wall of asterisks is worse than no README, but the gap between "readable" and
 * "correct" is enormous - tables, footnotes, nested lists, embedded HTML - and none of it
 * is what someone on a phone is trying to get at.
 *
 * So this handles what actually appears at the top of a README: headings, paragraphs,
 * code, lists, quotes, rules, and inline emphasis, code and links. Anything else is shown
 * as the text it is, which is always readable even when it is not pretty. The link out to
 * the site's own rendering is one tap away on every screen that uses this.
 */

import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; text: string; language?: string }
  | { kind: 'listItem'; text: string; marker: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' };

/**
 * Splits the source into blocks.
 *
 * A fenced code block swallows everything until its closing fence, including lines that
 * would otherwise look like headings - which is the whole reason this is a line-by-line
 * loop rather than a set of regexes over the whole string.
 */
function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^\s*```+\s*(\S+)?\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'code', text: body.join('\n'), language: fence[1] });
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      blocks.push({ kind: 'quote', text: quote[1] });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: 'listItem', text: bullet[1], marker: '•' });
      continue;
    }

    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flush();
      blocks.push({ kind: 'listItem', text: numbered[2], marker: `${numbered[1]}.` });
      continue;
    }

    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}

type Span =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * Inline spans, matched in one pass.
 *
 * Code comes first in the alternation on purpose: backticks win over everything, so
 * `**not bold**` inside code stays literal, which is exactly what a README about
 * Markdown needs.
 */
const INLINE =
  /(`[^`]+`)|(\[[^\]]*\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/;

function inline(text: string): Span[] {
  const spans: Span[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      spans.push({ kind: 'text', text: rest });
      break;
    }

    if (match.index > 0) {
      spans.push({ kind: 'text', text: rest.slice(0, match.index) });
    }

    const token = match[0];
    if (token.startsWith('`')) {
      spans.push({ kind: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token);
      if (link) spans.push({ kind: 'link', text: link[1] || link[2], href: link[2] });
      else spans.push({ kind: 'text', text: token });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      spans.push({ kind: 'strong', text: token.slice(2, -2) });
    } else {
      spans.push({ kind: 'em', text: token.slice(1, -1) });
    }

    rest = rest.slice(match.index + token.length);
  }

  return spans;
}

function Inline({ text, size = 15 }: { text: string; size?: number }) {
  const palette = usePalette();

  return (
    <>
      {inline(text).map((span, index) => {
        switch (span.kind) {
          case 'code':
            return (
              <Text
                key={index}
                style={[styles.inlineCode, { color: palette.text, backgroundColor: palette.surfaceRaised, fontSize: size - 1 }]}>
                {span.text}
              </Text>
            );
          case 'strong':
            return (
              <Text key={index} style={{ fontWeight: '700' }}>
                {span.text}
              </Text>
            );
          case 'em':
            return (
              <Text key={index} style={{ fontStyle: 'italic' }}>
                {span.text}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={index}
                style={{ color: palette.accent }}
                onPress={() => void WebBrowser.openBrowserAsync(span.href)}>
                {span.text}
              </Text>
            );
          default:
            return <Text key={index}>{span.text}</Text>;
        }
      })}
    </>
  );
}

const HEADING_SIZES = [24, 20, 17, 16, 15, 15];

export function Markdown({ source }: { source: string }) {
  const palette = usePalette();
  const blocks = parse(source);

  return (
    <View style={styles.body}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <Text
                key={index}
                style={[
                  styles.heading,
                  { color: palette.text, fontSize: HEADING_SIZES[block.level - 1] ?? 15 },
                ]}>
                <Inline text={block.text} size={HEADING_SIZES[block.level - 1] ?? 15} />
              </Text>
            );

          case 'code':
            return (
              <View
                key={index}
                style={[styles.codeBlock, { backgroundColor: palette.surfaceRaised }]}>
                <Text style={[styles.code, { color: palette.text }]}>{block.text}</Text>
              </View>
            );

          case 'listItem':
            return (
              <View key={index} style={styles.listItem}>
                <Text style={[styles.marker, { color: palette.textSecondary }]}>
                  {block.marker}
                </Text>
                <Text style={[styles.paragraph, { color: palette.text, flex: 1 }]}>
                  <Inline text={block.text} />
                </Text>
              </View>
            );

          case 'quote':
            return (
              <View key={index} style={[styles.quote, { borderLeftColor: palette.separator }]}>
                <Text style={[styles.paragraph, { color: palette.textSecondary }]}>
                  <Inline text={block.text} />
                </Text>
              </View>
            );

          case 'rule':
            return (
              <View key={index} style={[styles.rule, { backgroundColor: palette.separator }]} />
            );

          default:
            return (
              <Text key={index} style={[styles.paragraph, { color: palette.text }]}>
                <Inline text={block.text} />
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.three,
  },
  heading: {
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
  },
  inlineCode: {
    fontFamily: Fonts.mono,
    borderRadius: Radius.small,
  },
  codeBlock: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  listItem: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingLeft: Spacing.two,
  },
  marker: {
    fontSize: 15,
    lineHeight: 22,
    minWidth: 18,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.three,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
});
