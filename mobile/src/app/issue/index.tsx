/**
 * One issue, presented with the same native grouped structure as accounts and Inbox.
 *
 * The conversation remains React Native because it contains Markdown and avatars; a
 * bounded GroupedContent bridge lets that richer content live safely inside FieldGroup.
 */

import { FieldGroup, Host } from '@expo/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useComments, useIssue } from '@/api/queries';
import { useProvider } from '@/state/accounts';
import { usePalette } from '@/theme/use-palette';
import { issueState } from '@/ui/badges';
import { Conversation } from '@/ui/conversation';
import { GroupedContent } from '@/ui/grouped-content';
import { headerMenu } from '@/ui/header-menu';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { relativeTime } from '@/ui/relative-time';
import { Empty, Failed, Loading } from '@/ui/states';

export default function IssueScreen() {
  const { account, owner, name, number } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
    number: string;
  }>();
  const router = useRouter();
  const palette = usePalette();
  const provider = useProvider(account);

  const parsedNumber = Number(number);
  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '' }),
    [provider, owner, name]
  );

  const issue = useIssue(target, parsedNumber);
  const comments = useComments(target, parsedNumber, 'issue');

  const webUrl =
    issue.data?.webUrl ?? provider?.webUrl('issue', { owner, repo: name, number: parsedNumber });

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

  if (issue.isLoading) return <Loading />;
  if (issue.error) return <Failed error={issue.error} onRetry={() => void issue.refetch()} />;
  if (!issue.data) {
    return <Empty icon={Icons.issue} title="Not found" detail={`No #${number} here.`} />;
  }

  const item = issue.data;
  const state = issueState(item);
  const commentCount = comments.data?.length ?? item.commentCount ?? 0;

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
                  name={state === 'closed' ? Icons.issueClosed : Icons.issue}
                  size={40}
                  color={state === 'closed' ? palette.closed : palette.open}
                />
              }
              supportingText={`${owner}/${name} · Issue #${item.number}`}>
              {item.title}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Details">
            <ListItem
              leading={
                <Icon
                  name={state === 'closed' ? Icons.issueClosed : Icons.issue}
                  size={20}
                  color={state === 'closed' ? palette.closed : palette.open}
                />
              }
              supportingText={state === 'closed' ? 'This issue is complete.' : 'Work is still open.'}>
              {state === 'closed' ? 'Closed' : 'Open'}
            </ListItem>
            <ListItem
              leading={<Icon name={Icons.account} size={20} />}
              supportingText={`Opened ${relativeTime(item.createdAt ?? item.updatedAt)}`}>
              {item.author || 'Someone'}
            </ListItem>
            <ListItem
              leading={<Icon name={Icons.inbox} size={20} />}
              supportingText={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}>
              Conversation
            </ListItem>
            {item.labels && item.labels.length > 0 ? (
              <ListItem
                leading={<Icon name={Icons.label} size={20} />}
                supportingText={item.labels.map((label) => label.name).join(', ')}>
                Labels
              </ListItem>
            ) : null}
          </FieldGroup.Section>

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
        </FieldGroup>
      </Host>
    </>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The hosting site did not return the comments.';
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
