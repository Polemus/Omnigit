/**
 * One commit, read here rather than on the site: what it says, who made it, and the files
 * it changed - each of which opens in the same diff viewer a pull request's files do.
 *
 * Laid out as the pull request screen is, without its switcher: a commit has no
 * conversation to choose between, so its changed files simply follow its details.
 */

import { FieldGroup, Host } from '@expo/ui';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useCommit, useCommitFiles } from '@/api/queries';
import { commitSummary, shortSha } from '@/hosts/types';
import { useProvider } from '@/state/accounts';
import { Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { ChangedFileSummary, ChangeTotals } from '@/ui/changed-files';
import { iconForFile } from '@/ui/file-icons';
import { GroupedContent } from '@/ui/grouped-content';
import { headerMenu } from '@/ui/header-menu';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { relativeTime } from '@/ui/relative-time';
import { Empty, Failed, Loading } from '@/ui/states';

export default function CommitScreen() {
  const {
    account,
    owner,
    name,
    sha = '',
  } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
    sha: string;
  }>();
  const router = useRouter();
  const palette = usePalette();
  const provider = useProvider(account);

  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '' }),
    [provider, owner, name]
  );
  const commit = useCommit(target, sha);
  const files = useCommitFiles(target, sha);
  const webUrl = provider?.webUrl('commit', { owner, repo: name, sha });

  // The whole SHA rather than the seven characters on screen: pasted into a terminal, the
  // short form can already be ambiguous in a large repository.
  const fullSha = commit.data?.sha || sha;
  const copySha = () => {
    if (!fullSha) return;
    void Clipboard.setStringAsync(fullSha);
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const openFile = (path: string) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    router.push({
      pathname: '/commit/file',
      params: { account, owner: target.owner, name: target.repo, sha: fullSha, path },
    });
  };

  const options = (
    <Stack.Screen
      options={{
        title: shortSha(sha),
        headerBackTitle: 'Back',
        ...headerMenu([
          {
            label: 'Copy SHA',
            sf: 'doc.on.doc',
            disabled: !fullSha,
            feedback: 'none',
            onPress: copySha,
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

  if (!provider) {
    return (
      <>
        {options}
        <Empty
          icon={Icons.token}
          title="Signed out"
          detail="The token for this account has gone."
          actionLabel="Go to settings"
          onAction={() => router.push('/settings')}
        />
      </>
    );
  }

  if (commit.isLoading) {
    return (
      <>
        {options}
        <Loading />
      </>
    );
  }

  if (commit.error) {
    return (
      <>
        {options}
        <Failed error={commit.error} onRetry={() => void commit.refetch()} />
      </>
    );
  }

  if (!commit.data) {
    return (
      <>
        {options}
        <Empty
          icon={Icons.commit}
          title="Commit not found"
          detail={`No commit ${shortSha(sha)} in ${owner}/${name}.`}
          actionLabel={webUrl ? 'Open on the site' : undefined}
          onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
        />
      </>
    );
  }

  const item = commit.data;
  const body = reflow(messageBody(item.message));

  return (
    <>
      {options}

      <Host style={styles.fill}>
        <FieldGroup>
          <FieldGroup.Section>
            <ListItem
              leading={<Icon name={Icons.commit} size={40} />}
              supportingText={`${owner}/${name} · ${shortSha(fullSha)}`}>
              {commitSummary(item.message) || 'No commit message'}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Details">
            <ListItem
              leading={<Icon name={Icons.account} size={20} />}
              supportingText={
                item.committedAt ? `Committed ${relativeTime(item.committedAt)}` : undefined
              }>
              {item.author || 'Someone'}
            </ListItem>
            <ListItem
              onPress={copySha}
              leading={<Icon name={Icons.commit} size={20} />}
              supportingText={breakableSha(fullSha)}
              trailing={<Icon name={Icons.copy} size={17} />}>
              SHA
            </ListItem>
            <ListItem
              leading={<Icon name={Icons.diff} size={20} />}
              supportingText={
                <ChangeTotals
                  additions={item.additions}
                  deletions={item.deletions}
                  files={files.data?.length}
                />
              }>
              Changes
            </ListItem>
          </FieldGroup.Section>

          {body ? (
            <FieldGroup.Section title="Message">
              <GroupedContent>
                <Text selectable style={[styles.message, { color: palette.text }]}>
                  {body}
                </Text>
              </GroupedContent>
            </FieldGroup.Section>
          ) : null}

          <FieldGroup.Section title="Changed files">
            {files.isLoading ? (
              <ListItem leading={<Icon name={Icons.refresh} size={20} />}>
                Loading changed files…
              </ListItem>
            ) : null}
            {files.error ? (
              <ListItem
                onPress={() => void files.refetch()}
                leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
                supportingText={errorMessage(files.error)}>
                Try loading files again
              </ListItem>
            ) : null}
            {!files.isLoading && !files.error && (!files.data || files.data.length === 0) ? (
              <ListItem
                leading={<Icon name={Icons.diff} size={20} />}
                supportingText="The hosting site did not provide a file list.">
                No changed files
              </ListItem>
            ) : null}
            {(files.data ?? []).map((file) => (
              <ListItem
                key={file.path}
                onPress={() => openFile(file.path)}
                leading={<Icon name={iconForFile(file.path)} size={20} />}
                supportingText={<ChangedFileSummary file={file} />}
                trailing={<Icon name={Icons.chevron} size={16} />}>
                {file.path}
              </ListItem>
            ))}
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </>
  );
}

/**
 * The whole SHA, with somewhere to wrap every eight characters.
 *
 * Forty hex digits are a single word to the text system, and iOS wraps a word that long
 * by hyphenating it - showing a `-` in a SHA that has none, which is worse than useless in
 * something people read off to compare. Zero-width spaces give it places to break without
 * one. Only the display changes: Copy SHA copies the SHA itself.
 */
function breakableSha(sha: string): string {
  return sha.replace(/(.{8})(?=.)/g, '$1​');
}

/** Everything after the summary line, which the screen already shows as the title. */
function messageBody(message: string): string {
  const newline = message.indexOf('\n');
  return newline < 0 ? '' : message.slice(newline + 1).trim();
}

/**
 * A commit message body, rejoined for a screen narrower than a terminal.
 *
 * Messages are hard-wrapped at about 72 columns so they read well in `git log`. On a phone
 * those breaks land mid-line and leave every paragraph ragged, so a paragraph's lines are
 * joined back up and left to wrap at the screen's width. A blank line still ends a
 * paragraph, and three kinds of line keep their break because they were laid out on
 * purpose: list items, indented lines (usually code), and trailers such as
 * `Co-authored-by:`, one to a line.
 */
function reflow(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .reduce((joined, line) =>
          keepsBreak(line) ? `${joined}\n${line}` : `${joined} ${line.trim()}`
        )
    )
    .join('\n\n');
}

function keepsBreak(line: string): boolean {
  return /^\s*([-*+•]|\d+[.)])\s/.test(line) || /^\s{2,}\S/.test(line) || /^[\w-]+: \S/.test(line);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The hosting site did not return this content.';
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    paddingVertical: Spacing.two,
  },
});
