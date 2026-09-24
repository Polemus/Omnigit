/**
 * One file, read - laid out like the changed-file diff screen.
 *
 * Same path bar (the path, the repository beneath it, a figure on the right) and the same
 * legend row over the gutter, so a whole file and a changed file look like two views of
 * one thing. Where the diff shows +/- counts this shows the line count; where the diff
 * labels its old/new columns this labels the one line column and names the language.
 *
 * A file that is a picture is drawn rather than read out as text (`ImageView`): whatever
 * the platform decodes - PNG, JPEG, GIF, WebP, HEIC, AVIF and the rest - and SVG, which is
 * source as well as a picture, so it gets a Preview and Source switch, as Markdown does for
 * being prose that is also source. For a picture the path bar's figure is its size rather
 * than its lines. Video, sound, fonts, PDFs and archives are said to be what they are, with
 * the way to the site, rather than shown as a screen of their bytes.
 *
 * Sideways, the repository's tree sits beside the code, as VS Code's explorer does
 * (`FileTree`): the file's folders open, the file highlighted, any other file one tap away.
 * That tap swaps the file in place - new params, not a new screen - so Back still returns
 * to the repository however many files were read. A button at the start of the path bar
 * hides the tree when a long line needs the width, and the choice is remembered - one
 * frame, one button and one choice with the diff screens' tree of changed files
 * (`code-screen.tsx`). Upright, the screen is what it always was: there is no room beside
 * the code for anything.
 *
 * Read-only, and not a text editor in waiting: editing means a commit message, a branch,
 * a conflict when someone else moved first, and a keyboard over a monospace file on a
 * phone. Reading is the thing people actually want here.
 */

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useFile, useFilePreview } from '@/api/queries';
import { fillTemplate } from '@/hosts/field-ref';
import type { HostProvider } from '@/hosts/provider';
import type { TreeEntry } from '@/hosts/types';
import { useProvider } from '@/state/accounts';
import { previewBase64 } from '@/storage/previews';
import { Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import {
  CodeScreenBody,
  SidebarToggle,
  useCodeSidebar,
  type CodeSidebar,
} from '@/ui/code-screen';
import { CodeView, sourceLines } from '@/ui/code-view';
import { iconForFile } from '@/ui/file-icons';
import { FileTree } from '@/ui/file-tree';
import { describeSize, fileView, imageFormat, unshownKind, type Size } from '@/ui/file-view';
import { headerMenu } from '@/ui/header-menu';
import { Icons } from '@/ui/icons';
import { ImageView } from '@/ui/image-view';
import { Legend, ViewSwitch } from '@/ui/legend';
import { Markdown } from '@/ui/markdown';
import { useRotationWhileFocused } from '@/ui/rotation';
import { Text } from '@/ui/scaled-text';
import { useBottomClearance } from '@/ui/screen';
import { Empty, Failed, Loading } from '@/ui/states';
import { isHighlightable, languageFor } from '@/ui/syntax';

interface FileTarget {
  provider: HostProvider | undefined;
  owner: string;
  repo: string;
  ref?: string;
}

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
  const provider = useProvider(account);
  const sidebar = useCodeSidebar();
  useRotationWhileFocused();

  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '', ref }),
    [provider, owner, name, ref]
  );

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

  // Another file from the tree replaces this one rather than stacking on top of it.
  const openFile = (entry: TreeEntry) => router.setParams({ path: entry.path });

  return (
    <CodeScreenBody
      sidebar={
        sidebar.shown ? (
          <FileTree target={target} currentPath={path} onOpenFile={openFile} />
        ) : undefined
      }>
      {/* Keyed by the file, so one swapped in from the tree starts afresh - at its top, and
          in its own first view - rather than wherever the last one was left. */}
      <FileReader key={path} target={target} path={path} sidebar={sidebar} />
    </CodeScreenBody>
  );
}

/**
 * Everything about the file being read: the header's title and menu, the path bar, the
 * legend, and the file - as text, or as a picture, or as a sentence saying why it is
 * neither. Loading, failure and emptiness sit under the path bar rather than replacing the
 * screen, so the tree beside it stays put while the next file arrives.
 */
function FileReader({
  target,
  path,
  sidebar,
}: {
  target: FileTarget;
  path: string;
  sidebar: CodeSidebar;
}) {
  const palette = usePalette();
  const androidInset = useBottomClearance();
  const view = fileView(path);
  // Markdown is worth rendering rather than colouring: a README is prose, and prose read
  // as source is the one case where the raw file is less useful than what it means.
  const isMarkdown = view === 'text' && /\.mdx?$/i.test(path);
  // Markdown and SVG have a rendered form and a source. The rendered form comes first.
  const [showSource, setShowSource] = useState(false);
  const [undrawable, setUndrawable] = useState(false);
  const [animated, setAnimated] = useState(false);

  const text = useFile(target, path, view === 'text');
  const preview = useFilePreview(target, path, view === 'image' || view === 'svg');
  const picture = preview.data?.kind === 'ready' ? preview.data : undefined;

  const webUrl = blobUrl(target, path);
  const onSite = {
    actionLabel: webUrl ? 'Open on the site' : undefined,
    onAction: webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined,
  };

  const sourceSwitch = (
    <ViewSwitch labels={['Preview', 'Source']} second={showSource} onChange={setShowSource} />
  );

  // A file read as text - code, Markdown, an SVG's source.
  const asText = (source: string, rendered: boolean): Shown => {
    const lines = sourceLines(source).length;
    return {
      figure: `${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'}`,
      legend: (
        <Legend
          gutters={rendered ? [] : ['line']}
          detail={describeFile(path, rendered)}
          trailing={isMarkdown || view === 'svg' ? sourceSwitch : undefined}
        />
      ),
      content: rendered ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.markdown,
            {
              paddingBottom:
                Spacing.four + (process.env.EXPO_OS === 'android' ? androidInset : 0),
            },
          ]}>
          <Markdown source={source} />
        </ScrollView>
      ) : (
        <CodeView source={source} path={path} />
      ),
    };
  };

  const nothing = (title: string, detail: string): Shown => ({
    content: <Empty icon={iconForFile(path)} title={title} detail={detail} {...onSite} />,
  });

  let shown: Shown;
  if (view === 'none') {
    const { noun, verb } = unshownKind(path);
    shown = nothing(
      `No preview for this ${noun}`,
      `Omnigit reads code and draws pictures. Open it on the site to ${verb} it.`
    );
  } else if (view === 'text') {
    shown = text.isLoading
      ? { content: <Loading /> }
      : text.error
        ? { content: <Failed error={text.error} onRetry={() => void text.refetch()} /> }
        : typeof text.data === 'string'
          ? asText(text.data, isMarkdown && !showSource)
          : {
              content: (
                <Empty
                  icon={Icons.code}
                  title="Nothing to show"
                  detail="This file is binary, or too large for the site to send as text."
                  {...onSite}
                />
              ),
            };
  } else if (preview.isLoading) {
    shown = { content: <Loading /> };
  } else if (preview.error) {
    shown = { content: <Failed error={preview.error} onRetry={() => void preview.refetch()} /> };
  } else if (!preview.data) {
    shown = nothing(
      'Too large to show here',
      "The site sent none of this file's contents, which it does when a file is too large."
    );
  } else if (preview.data.kind === 'lfs') {
    shown = nothing(
      'Stored in Git LFS',
      'The repository keeps this file in Git LFS, and the site serves only the pointer to it here.'
    );
  } else if (preview.data.kind === 'too-large') {
    shown = nothing(
      'Too large to draw here',
      `At ${describeSize(preview.data.bytes)}, this is more picture than a phone should hold in memory to draw.`
    );
  } else if (view === 'svg' && showSource && preview.data.source !== undefined) {
    shown = asText(preview.data.source, false);
  } else {
    const ready = preview.data;
    shown = {
      figure: ready.size ? describeDimensions(ready.size) : undefined,
      legend: (
        <Legend
          detail={`${imageFormat(path)} image · ${describeSize(ready.bytes)}${animated ? ' · animated' : ''}`}
          // An SVG that will not draw is still source worth reading.
          trailing={view === 'svg' && ready.source !== undefined ? sourceSwitch : undefined}
        />
      ),
      content: undrawable ? (
        <Empty
          icon={iconForFile(path)}
          title="Could not draw this picture"
          detail="The file may be damaged, or in a format this phone cannot decode."
          {...onSite}
        />
      ) : (
        <ImageView
          uri={ready.uri}
          name={path.split('/').pop() ?? path}
          vector={view === 'svg'}
          size={ready.size}
          opaque={/\.jpe?g$/i.test(path)}
          onLoad={setAnimated}
          onError={() => setUndrawable(true)}
        />
      ),
    };
  }

  // Copying a picture puts the picture on the clipboard. An SVG is text first, so it copies
  // as its source, which is what anyone copying one wants to paste.
  const copyableText =
    view === 'text' ? (text.data ?? undefined) : view === 'svg' ? picture?.source : undefined;
  const copyableImage = view === 'image' && !undrawable ? picture?.uri : undefined;

  const options = (
    <Stack.Screen
      options={{
        title: path.split('/').pop() || 'File',
        headerBackTitle: 'Files',
        ...headerMenu([
          copyableImage !== undefined
            ? {
                label: 'Copy image',
                sf: 'doc.on.doc',
                feedback: 'none',
                onPress: () => {
                  void previewBase64(copyableImage)
                    .then((base64) => Clipboard.setImageAsync(base64))
                    .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
                    .catch(() => {});
                },
              }
            : {
                label: 'Copy contents',
                sf: 'doc.on.doc',
                disabled: copyableText === undefined,
                feedback: 'none',
                onPress: () => {
                  if (copyableText === undefined) return;
                  void Clipboard.setStringAsync(copyableText);
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

  return (
    <>
      {options}
      <View style={[styles.pathBar, { borderBottomColor: palette.separator }]}>
        <SidebarToggle sidebar={sidebar} />
        <View style={styles.pathText}>
          <Text
            selectable
            style={[styles.path, { color: palette.textSecondary }]}
            numberOfLines={2}>
            {path}
          </Text>
          <Text selectable style={[styles.repository, { color: palette.textTertiary }]}>
            {target.owner}/{target.repo}
            {target.ref ? ` · ${target.ref}` : ''}
          </Text>
        </View>
        {shown.figure !== undefined ? (
          <Text selectable style={[styles.count, { color: palette.textSecondary }]}>
            {shown.figure}
          </Text>
        ) : null}
      </View>

      {shown.legend}
      {shown.content}
    </>
  );
}

/** What the path bar gives on its right, the legend row under it, and the file. */
interface Shown {
  figure?: string;
  legend?: ReactNode;
  content: ReactNode;
}

/** Where the file lives on the site, from the manifest's `blob` template. */
function blobUrl(target: FileTarget, path: string): string | undefined {
  const template = target.provider?.manifest.webUrls?.blob;
  if (!template || !target.provider) return undefined;
  return fillTemplate(template, {
    base: target.provider.account.baseUrl.replace(/\/+$/, ''),
    owner: target.owner,
    repo: target.repo,
    ref: target.ref || 'HEAD',
    path,
  });
}

/** `1,024 × 768` - pixels for a raster, the drawing's own units for an SVG. */
function describeDimensions(size: Size): string {
  const width = Math.round(size.width).toLocaleString();
  const height = Math.round(size.height).toLocaleString();
  return `${width} × ${height}`;
}

/**
 * What the legend says about the file: its language, and whether it is coloured.
 *
 * Honest about the fallback. A file the tokeniser has no grammar for is shown as plain
 * text, and saying so beats leaving someone wondering why a Lua file is all one colour.
 */
function describeFile(path: string, rendered: boolean): string {
  if (rendered) return 'Rendered Markdown';
  const language = languageFor(path);
  if (isHighlightable(path)) return language ?? 'Source';
  return language ? `${language} · not highlighted` : 'Plain text';
}

// The path bar is the diff screen's (`ui/changed-files.tsx`), value for value; the legend
// under it is the one both draw (`ui/legend.tsx`).
const styles = StyleSheet.create({
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  markdown: {
    padding: Spacing.four,
  },
});
