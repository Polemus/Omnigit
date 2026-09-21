/**
 * One pull request: native grouped summary and conversation, plus a changed-file list
 * that opens each patch in the dedicated code-style diff viewer.
 */

import { FieldGroup, Host } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useChangedFiles, useComments, usePullRequest } from '@/api/queries';
import { useProvider } from '@/state/accounts';
import { usePalette } from '@/theme/use-palette';
import { pullRequestState, type ReviewState } from '@/ui/badges';
import { ChangedFileSummary, ChangeTotals } from '@/ui/changed-files';
import { iconForFile } from '@/ui/file-icons';
import { Conversation } from '@/ui/conversation';
import { GroupedContent } from '@/ui/grouped-content';
import { headerMenu } from '@/ui/header-menu';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Empty, Failed, Loading } from '@/ui/states';

const SECTIONS = ['Conversation', 'Changed files'] as const;

export default function PullRequestScreen() {
  const { account, owner, name, number } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
    number: string;
  }>();
  const router = useRouter();
  const palette = usePalette();
  const provider = useProvider(account);
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Conversation');

  const parsedNumber = Number(number);
  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '' }),
    [provider, owner, name]
  );

  const pull = usePullRequest(target, parsedNumber);
  const comments = useComments(target, parsedNumber, 'pullRequest');
  const files = useChangedFiles(target, parsedNumber);

  const webUrl =
    pull.data?.webUrl ??
    provider?.webUrl('pullRequest', { owner, repo: name, number: parsedNumber });

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

  if (pull.isLoading) return <Loading />;
  if (pull.error) return <Failed error={pull.error} onRetry={() => void pull.refetch()} />;
  if (!pull.data) {
    return <Empty icon={Icons.pullRequest} title="Not found" detail={`No #${number} here.`} />;
  }

  const item = pull.data;
  const state = pullRequestState(item);
  const commentCount = comments.data?.length ?? item.commentCount ?? 0;

  const stateColour =
    state === 'merged'
      ? palette.merged
      : state === 'closed'
        ? palette.closed
        : state === 'draft'
          ? palette.draft
          : palette.open;

  return (
    <>
      <Stack.Screen
        options={{
          title: `#${item.number}`,
          headerBackTitle: 'Back',
          ...headerMenu([
            {
              label: 'Open on the site',
              sf: 'safari',
              disabled: !webUrl,
              onPress: () => webUrl && void WebBrowser.openBrowserAsync(webUrl),
            },
          ]),
        }}
      />

      <Host style={styles.fill}>
        <FieldGroup>
          <FieldGroup.Section>
            <ListItem
              leading={
                <Icon
                  name={state === 'merged' ? Icons.merged : Icons.pullRequest}
                  size={40}
                  color={stateColour}
                />
              }
              supportingText={`${owner}/${name} · Pull request #${item.number}`}>
              {item.title}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Details">
            <ListItem
              leading={
                <Icon
                  name={state === 'merged' ? Icons.merged : Icons.pullRequest}
                  size={20}
                  color={stateColour}
                />
              }
              supportingText={stateDetail(state)}>
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </ListItem>
            <ListItem
              leading={<Icon name={Icons.account} size={20} />}
              supportingText={`${item.sourceBranch} → ${item.targetBranch}`}>
              {item.author || 'Someone'}
            </ListItem>
            <ListItem
              leading={<Icon name={Icons.diff} size={20} />}
              supportingText={
                <ChangeTotals
                  additions={item.additions}
                  deletions={item.deletions}
                  files={item.changedFiles}
                />
              }>
              Changes
            </ListItem>
            {item.labels && item.labels.length > 0 ? (
              <ListItem
                leading={<Icon name={Icons.label} size={20} />}
                supportingText={item.labels.map((label) => label.name).join(', ')}>
                Labels
              </ListItem>
            ) : null}
          </FieldGroup.Section>

          <FieldGroup.Section title="View">
            {SECTIONS.map((value) => (
              <ListItem
                key={value}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSection(value);
                }}
                leading={
                  <Icon name={value === 'Conversation' ? Icons.inbox : Icons.diff} size={20} />
                }
                supportingText={
                  value === 'Conversation'
                    ? `${commentCount} comment${commentCount === 1 ? '' : 's'}`
                    : item.changedFiles !== undefined
                      ? `${item.changedFiles} changed file${item.changedFiles === 1 ? '' : 's'}`
                      : 'Review the changed files'
                }
                trailing={
                  section === value ? (
                    <Icon name={Icons.check} size={18} />
                  ) : undefined
                }>
                {value}
              </ListItem>
            ))}
          </FieldGroup.Section>

          {section === 'Conversation' ? (
            <FieldGroup.Section title="Conversation">
              <GroupedContent>
                <Conversation
                  author={item.author}
                  authorAvatarUrl={item.authorAvatarUrl}
                  body={item.body}
                  createdAt={item.createdAt ?? item.updatedAt}
                  comments={comments.data}
                  grouped
                />
              </GroupedContent>
              {comments.isLoading ? (
                <ListItem
                  leading={<Icon name={Icons.refresh} size={20} />}>
                  Loading comments…
                </ListItem>
              ) : null}
              {comments.error ? (
                <ListItem
                  onPress={() => void comments.refetch()}
                  leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
                  supportingText={errorMessage(comments.error)}>
                  Try loading comments again
                </ListItem>
              ) : null}
            </FieldGroup.Section>
          ) : (
            <FieldGroup.Section title="Changed files">
              {files.isLoading ? (
                <ListItem
                  leading={<Icon name={Icons.refresh} size={20} />}>
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
                  onPress={() => {
                    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
                    router.push({
                      pathname: '/diff',
                      params: {
                        account,
                        owner: target.owner,
                        name: target.repo,
                        number: String(item.number),
                        path: file.path,
                      },
                    });
                  }}
                  leading={
                    <Icon name={iconForFile(file.path)} size={20} />
                  }
                  supportingText={<ChangedFileSummary file={file} />}
                  trailing={<Icon name={Icons.chevron} size={16} />}>
                  {file.path}
                </ListItem>
              ))}
            </FieldGroup.Section>
          )}
        </FieldGroup>
      </Host>
    </>
  );
}

function stateDetail(state: ReviewState): string {
  if (state === 'merged') return 'The changes have been merged.';
  if (state === 'closed') return 'Closed without merging.';
  if (state === 'draft') return 'Still being prepared for review.';
  return 'Open and ready for review.';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The hosting site did not return this content.';
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
