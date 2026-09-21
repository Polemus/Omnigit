/**
 * One file, read - laid out like the changed-file diff screen.
 *
 * Same path bar (the path, the repository beneath it, a figure on the right) and the same
 * legend row over the gutter, so a whole file and a changed file look like two views of
 * one thing. Where the diff shows +/- counts this shows the line count; where the diff
 * labels its old/new columns this labels the one line column and names the language.
 *
 * Sideways, the repository's tree sits beside the code, as VS Code's explorer does
 * (`FileTree`): the file's folders open, the file highlighted, any other file one tap away.
 * That tap swaps the file in place - new params, not a new screen - so Back still returns
 * to the repository however many files were read. A button at the start of the path bar
 * hides the tree when a long line needs the width, and the choice is remembered. Upright,
 * the screen is what it always was: there is no room beside the code for anything.
 *
 * Read-only, and not a text editor in waiting: editing means a commit message, a branch,
 * a conflict when someone else moved first, and a keyboard over a monospace file on a
 * phone. Reading is the thing people actually want here.
 */

import { Host } from '@expo/ui';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useFile } from '@/api/queries';
import { fillTemplate } from '@/hosts/field-ref';
import type { TreeEntry } from '@/hosts/types';
import { useProvider } from '@/state/accounts';
import { useFileTreeVisible } from '@/state/preferences';
import { Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { CodeScreenBody } from '@/ui/code-screen';
import { CodeView, sourceLines } from '@/ui/code-view';
import { FileTree } from '@/ui/file-tree';
import { headerMenu } from '@/ui/header-menu';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { Markdown } from '@/ui/markdown';
import { useRotationWhileFocused } from '@/ui/rotation';
import { useBottomInset } from '@/ui/screen';
import { Empty, Failed, Loading } from '@/ui/states';
import { isHighlightable, languageFor } from '@/ui/syntax';

export default function FileScreen() {
  const {
    account,
    owner,
    name,
    path = '',
    ref,
  } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
    path: string;
    ref?: string;
  }>();

  const router = useRouter();
  const palette = usePalette();
  const provider = useProvider(account);
  const androidInset = useBottomInset();
  const { width, height } = useWindowDimensions();
  const [treeVisible, toggleTree] = useFileTreeVisible();
  useRotationWhileFocused();

  // Sideways is the only time there is room beside the code. The tree takes about a
  // third, within bounds: narrower and names are all ellipsis, wider and it is eating the
  // line length that turning the phone was for.
  const sideways = width > height;
  const showTree = sideways && treeVisible;
  const treeWidth = Math.round(Math.min(300, Math.max(220, width * 0.3)));

  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '', ref }),
    [provider, owner, name, ref]
  );

  const file = useFile(target, path);

  const blobTemplate = provider?.manifest.webUrls?.blob;
  const webUrl =
    blobTemplate && provider
      ? fillTemplate(blobTemplate, {
          base: provider.account.baseUrl.replace(/\/+$/, ''),
          owner: owner ?? '',
          repo: name ?? '',
          ref: ref || 'HEAD',
          path,
        })
      : undefined;

  if (!provider) {
    return (
      <Empty
        icon={Icons.token}
        title="Signed out"
        detail="The token for this account has gone."
        actionLabel="Go to settings"
        onAction={() => router.push('/settings')}
      />
    );
  }

  const fileName = path.split('/').pop() || 'File';

  const options = (
    <Stack.Screen
      options={{
        title: fileName,
        headerBackTitle: 'Files',
        ...headerMenu([
          {
            label: 'Copy contents',
            sf: 'doc.on.doc',
            disabled: file.data === undefined,
            feedback: 'none',
            onPress: () => {
              if (file.data === undefined) return;
              void Clipboard.setStringAsync(file.data);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
          {
            label: 'Open on the site',
            sf: 'safari',
            disabled: !webUrl,
            onPress: () => webUrl && void WebBrowser.openBrowserAsync(webUrl),
          },
        ]),
      }}
    />
  );

  // Another file from the tree replaces this one rather than stacking on top of it.
  const openFile = (entry: TreeEntry) => router.setParams({ path: entry.path });

  const onToggleTree = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    toggleTree();
  };

  const source = file.data;
  // Markdown is worth rendering rather than colouring: a README is prose, and prose read
  // as source is the one case where the raw file is less useful than what it means.
  const isMarkdown = /\.mdx?$/i.test(path);
  const lineCount = source === undefined ? undefined : sourceLines(source).length;

  // Loading, failure and emptiness sit under the path bar rather than replacing the whole
  // screen, so the tree stays put while the next file arrives.
  const reading = file.isLoading ? (
    <Loading />
  ) : file.error ? (
    <Failed error={file.error} onRetry={() => void file.refetch()} />
  ) : source === undefined ? (
    <Empty
      icon={Icons.code}
      title="Nothing to show"
      detail="This file is binary, or too large for the site to send as text."
      actionLabel={webUrl ? 'Open on the site' : undefined}
      onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
    />
  ) : (
    <>
      <View style={styles.legend}>
        {isMarkdown ? null : (
          <Text style={[styles.legendText, { color: palette.textTertiary }]}>line</Text>
        )}
        <Text style={[styles.legendDetail, { color: palette.textSecondary }]}>
          {describeFile(path, isMarkdown)}
        </Text>
      </View>

      {/* Keyed by the file, so a file swapped in from the tree starts at its top rather
          than wherever the last one was scrolled to. */}
      {isMarkdown ? (
        <ScrollView
          key={path}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.markdown,
            {
              paddingBottom: Spacing.four + (process.env.EXPO_OS === 'android' ? androidInset : 0),
            },
          ]}>
          <Markdown source={source} />
        </ScrollView>
      ) : (
        <CodeView key={path} source={source} path={path} />
      )}
    </>
  );

  return (
    <>
      {options}
      <CodeScreenBody>
        <View style={styles.split}>
          {showTree ? (
            <View
              style={[
                styles.tree,
                {
                  width: treeWidth,
                  backgroundColor: palette.surface,
                  borderRightColor: palette.separator,
                },
              ]}>
              <FileTree target={target} currentPath={path} onOpenFile={openFile} />
            </View>
          ) : null}

          <View style={styles.reader}>
            <View style={[styles.pathBar, { borderBottomColor: palette.separator }]}>
              {sideways ? (
                <Pressable
                  onPress={onToggleTree}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={treeVisible ? 'Hide files' : 'Show files'}
                  accessibilityState={{ selected: treeVisible }}
                  style={({ pressed }) => [
                    styles.treeToggle,
                    treeVisible || pressed ? { backgroundColor: palette.accentMuted } : null,
                  ]}>
                  <View pointerEvents="none">
                    <Host matchContents>
                      <Icon name={Icons.sidebar} size={17} />
                    </Host>
                  </View>
                </Pressable>
              ) : null}
              <View style={styles.pathText}>
                <Text
                  selectable
                  style={[styles.path, { color: palette.textSecondary }]}
                  numberOfLines={2}>
                  {path}
                </Text>
                <Text selectable style={[styles.repository, { color: palette.textTertiary }]}>
                  {owner}/{name}
                  {ref ? ` · ${ref}` : ''}
                </Text>
              </View>
              {lineCount !== undefined ? (
                <Text selectable style={[styles.count, { color: palette.textSecondary }]}>
                  {lineCount.toLocaleString()} {lineCount === 1 ? 'line' : 'lines'}
                </Text>
              ) : null}
            </View>

            {reading}
          </View>
        </View>
      </CodeScreenBody>
    </>
  );
}

/**
 * What the legend says about the file: its language, and whether it is coloured.
 *
 * Honest about the fallback. A file the tokeniser has no grammar for is shown as plain
 * text, and saying so beats leaving someone wondering why a Lua file is all one colour.
 */
function describeFile(path: string, isMarkdown: boolean): string {
  if (isMarkdown) return 'Rendered Markdown';
  const language = languageFor(path);
  if (isHighlightable(path)) return language ?? 'Source';
  return language ? `${language} · not highlighted` : 'Plain text';
}

// The path bar and legend are the diff screen's (`ui/changed-files.tsx`), value for value.
const styles = StyleSheet.create({
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  tree: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  reader: {
    flex: 1,
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  treeToggle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.two,
  },
  pathText: {
    flex: 1,
    gap: Spacing.half,
  },
  path: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  repository: {
    fontSize: 11,
    lineHeight: 14,
  },
  count: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  legend: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  legendText: {
    width: 24,
    fontSize: 9,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  legendDetail: {
    flex: 1,
    paddingLeft: Spacing.two,
    fontSize: 11,
  },
  markdown: {
    padding: Spacing.four,
  },
});
