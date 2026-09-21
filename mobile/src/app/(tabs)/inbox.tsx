/**
 * Notifications merged across every selected hosting site that exposes an inbox.
 *
 * The structure intentionally mirrors the repository tab: native grouped summary,
 * account filter, partial-failure state, and content sections inside a refreshable list.
 */

import { FieldGroup, Host, List } from '@expo/ui';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import { useMarkNotificationRead, useNotifications } from '@/api/queries';
import { notificationTarget } from '@/hosts/notification-target';
import type { HostProvider } from '@/hosts/provider';
import { accountKey, type Account, type Notification } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { Icon } from '@/ui/icon';
import { hostLabel } from '@/ui/identity';
import { AccountControlBar } from '@/ui/account-picker';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { NotificationRow } from '@/ui/rows';
import { TabScreen, useTabBarClearance } from '@/ui/screen';
import { Empty, Failed, Loading } from '@/ui/states';
import { Text } from '@/ui/text';

const androidSectionStyle =
  process.env.EXPO_OS === 'android'
    ? ({ paddingHorizontal: 16, paddingTop: 16 } as const)
    : undefined;

export default function InboxScreen() {
  const router = useRouter();
  const clearance = useTabBarClearance();
  const {
    accounts,
    visibleProviders,
    filter,
    isLoading: accountsLoading,
  } = useAccounts();
  const { data, isLoading, error, refetch } = useNotifications();
  const { mutate: markNotificationRead } = useMarkNotificationRead();

  const open = useCallback(
    (provider: HostProvider, notification: Notification) => {
      const target = notificationTarget(notification);

      // Opening must never wait for the network. The mutation updates the dot and badge
      // optimistically, while its error path restores them if the host rejects the call.
      if (notification.isUnread && provider.capabilities.canMarkNotificationsRead) {
        markNotificationRead({ provider, notification });
      }

      if (target.number !== undefined && target.kind !== 'other') {
        router.push({
          pathname: target.kind === 'pullRequest' ? '/pull' : '/issue',
          params: {
            account: accountKey(provider.account),
            owner: target.owner,
            name: target.repo,
            number: String(target.number),
          },
        });
        return;
      }

      if (notification.webUrl) void WebBrowser.openBrowserAsync(notification.webUrl);
    },
    [markNotificationRead, router]
  );

  if (accountsLoading) {
    return (
      <TabScreen>
        <Loading />
      </TabScreen>
    );
  }

  if (accounts.length === 0) {
    return (
      <TabScreen>
        <Empty
          icon={Icons.account}
          title="No accounts yet"
          detail="Sign in and anything waiting for you turns up here."
          actionLabel="Add an account"
          onAction={() => router.push('/sign-in')}
        />
      </TabScreen>
    );
  }

  const able = visibleProviders.filter((provider) => provider.capabilities.canListNotifications);

  if (isLoading && able.length > 0) {
    return (
      <TabScreen>
        <Loading label="Checking every inbox…" />
      </TabScreen>
    );
  }

  if (error && !data) {
    return (
      <TabScreen>
        <Failed error={error} onRetry={() => void refetch()} />
      </TabScreen>
    );
  }

  const items = data?.items ?? [];
  const unreadItems = items.filter(({ item }) => item.isUnread);
  const readItems = items.filter(({ item }) => !item.isUnread);
  const unread = unreadItems.length;
  const selectedAccount = filter
    ? accounts.find((account) => accountKey(account) === filter)
    : undefined;
  const providersByAccount = new Map(
    visibleProviders.map((provider) => [accountKey(provider.account), provider])
  );

  function rowsFor(entries: typeof items) {
    return entries.map(({ account, item }) => {
      const actionable = canOpen(item);
      const provider = providersByAccount.get(accountKey(account));
      return (
        <NotificationRow
          key={`${accountKey(account)}/${item.id}`}
          notification={item}
          account={account}
          grouped
          showChevron={actionable}
          onPress={actionable && provider ? () => open(provider, item) : undefined}
        />
      );
    });
  }

  return (
    <TabScreen>
      <AccountControlBar />
      <Host style={[styles.fill, { paddingBottom: clearance }]}>
        <List
          onRefresh={async () => {
            await refetch();
          }}>
          <FieldGroup.Section style={androidSectionStyle}>
            <ListItem
              leading={<Icon name={Icons.inbox} size={40} />}
              supportingText={inboxSummary(unread, items.length, selectedAccount, accounts.length)}>
              Your inbox
            </ListItem>
          </FieldGroup.Section>

          {(data?.failures.length ?? 0) > 0 ? (
            <FieldGroup.Section title="Unavailable" style={androidSectionStyle}>
              {data!.failures.map((failure, index) => (
                <ListItem
                  key={`${failure.account}/${index}`}
                  leading={<Icon name={Icons.warning} size={20} />}
                  supportingText={failure.message}>
                  {hostOf(failure.account)}
                </ListItem>
              ))}
              <FieldGroup.SectionFooter>
                <Text>Notifications from the other connected accounts are still shown.</Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          ) : null}

          {able.length === 0 || items.length === 0 ? (
            <FieldGroup.Section title="Notifications" style={androidSectionStyle}>
              {able.length === 0 ? (
                <ListItem
                  leading={<Icon name={Icons.warning} size={20} />}
                  supportingText="The selected hosting site describes no notifications endpoint.">
                  No inbox available
                </ListItem>
              ) : (
                <ListItem
                  onPress={() => void refetch()}
                  leading={<Icon name={Icons.inbox} size={20} />}
                  supportingText="You are up to date."
                  trailing={<Icon name={Icons.refresh} size={17} />}>
                  Nothing waiting
                </ListItem>
              )}
              <FieldGroup.SectionFooter>
                <Text>Pull down to refresh notifications from the selected accounts.</Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          ) : (
            <>
              {unreadItems.length > 0 ? (
                <FieldGroup.Section title="Unread" style={androidSectionStyle}>
                  {rowsFor(unreadItems)}
                  <FieldGroup.SectionFooter>
                    <Text>Opening a notification marks it as read.</Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>
              ) : null}

              {readItems.length > 0 ? (
                <FieldGroup.Section title="Read" style={androidSectionStyle}>
                  {rowsFor(readItems)}
                  <FieldGroup.SectionFooter>
                    <Text>Pull down to refresh notifications from the selected accounts.</Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>
              ) : null}
            </>
          )}
        </List>
      </Host>
    </TabScreen>
  );
}

function inboxSummary(
  unread: number,
  total: number,
  selectedAccount: Account | undefined,
  accountCount: number
): string {
  const count = `${unread} unread · ${total} ${total === 1 ? 'notification' : 'notifications'}`;
  if (selectedAccount) {
    return `${count} · ${selectedAccount.login} on ${hostLabel(selectedAccount)}`;
  }
  return `${count} · ${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}`;
}

function canOpen(notification: Notification): boolean {
  const target = notificationTarget(notification);
  return (
    (target.number !== undefined && target.kind !== 'other') || Boolean(notification.webUrl)
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
