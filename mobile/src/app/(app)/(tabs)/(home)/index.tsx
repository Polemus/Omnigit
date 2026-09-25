/**
 * Every repository visible to the selected accounts, newest first.
 *
 * This uses the same native grouped sections as Add Account and View Account. `List`
 * remains the outer scrolling container so the repository tab keeps platform pull-to-
 * refresh; `FieldGroup.Section` supplies the shared grouped row treatment inside it.
 */

import { List } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { useRepositories } from '@/api/queries';
import { accountKey, type Account } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { FieldGroup } from '@/ui/field-group';
import { Host } from '@/ui/host';
import { Icon } from '@/ui/icon';
import { hostLabel } from '@/ui/identity';
import { ownerList, ScopeHeader } from '@/ui/header-scope';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { RepositoryRow } from '@/ui/rows';
import { TabScreen, useTabBarClearance } from '@/ui/screen';
import { Empty, Failed, Loading } from '@/ui/states';
import { Text } from '@/ui/text';

const androidSectionStyle =
  process.env.EXPO_OS === 'android'
    ? ({ paddingHorizontal: 16, paddingTop: 16 } as const)
    : undefined;

export default function RepositoriesScreen() {
  const router = useRouter();
  const clearance = useTabBarClearance();
  const { accounts, filter, owner: ownerFilter, isLoading: accountsLoading } = useAccounts();
  const { data, isLoading, error, refetch } = useRepositories();

  // TEMPORARY, and only in development: counts commits so that a runaway re-render shows
  // up in logcat. The Android freeze churns the *Java* heap, which happens either because
  // React is re-rendering in a loop or because the native rows are re-composing under a
  // tree that is standing still - and those want opposite fixes. If this climbs while the
  // screen is frozen it is the former; if it stops and the heap keeps churning, the
  // latter. Delete once that is known.
  const commits = useRef(0);
  useEffect(() => {
    commits.current += 1;
    if (__DEV__ && commits.current % 20 === 0) {
      console.log(
        `[omnigit] repositories commits=${commits.current} loading=${isLoading} rows=${data?.items.length ?? 0}`
      );
    }
  });

  const openRepository = useCallback(
    (account: Parameters<typeof accountKey>[0], owner: string, name: string) => {
      router.push({
        pathname: '/repo',
        params: { account: accountKey(account), owner, name },
      });
    },
    [router]
  );

  if (accountsLoading) {
    return (
      <TabScreen>
        <ScopeHeader title="Repositories" />
        <Loading />
      </TabScreen>
    );
  }

  if (accounts.length === 0) {
    return (
      <TabScreen>
        <ScopeHeader title="Repositories" />
        <Empty
          icon={Icons.account}
          title="No accounts yet"
          detail="Sign in to GitHub, Gitea, GitLab or anything else you host yourself."
          actionLabel="Add an account"
          onAction={() => router.push('/sign-in')}
        />
      </TabScreen>
    );
  }

  if (isLoading) {
    return (
      <TabScreen>
        <ScopeHeader title="Repositories" />
        <Loading label="Asking every site…" />
      </TabScreen>
    );
  }

  if (error && !data) {
    return (
      <TabScreen>
        <ScopeHeader title="Repositories" />
        <Failed error={error} onRetry={() => void refetch()} />
      </TabScreen>
    );
  }

  // Every owner the loaded repositories belong to - your own login and any organisation.
  // The menu is built from all of them and the rows from the ones that survive the filter,
  // the same way the inbox and the search tab do it.
  const loaded = data?.items ?? [];
  // Scope cached rows synchronously as the account changes. The query key also changes,
  // but this prevents the previous account's organisations flashing in the header while
  // React Query swaps observers or serves a cached result for the new key.
  const accountItems = filter
    ? loaded.filter(({ account }) => accountKey(account) === filter)
    : loaded;
  const owners = ownerList(accountItems.map(({ item }) => item.owner));
  const items = ownerFilter
    ? accountItems.filter(({ item }) => item.owner === ownerFilter)
    : accountItems;
  const selectedAccount = filter
    ? accounts.find((account) => accountKey(account) === filter)
    : undefined;

  return (
    <TabScreen>
      <ScopeHeader title="Repositories" owners={owners} />
      <Host style={[styles.fill, { paddingBottom: clearance }]}>
        <List
          onRefresh={async () => {
            await refetch();
          }}>
          <FieldGroup.Section style={androidSectionStyle}>
            <ListItem
              leading={<Icon name={Icons.repositories} size={40} />}
              supportingText={repositorySummary(
                items.length,
                selectedAccount,
                accounts.length,
                ownerFilter
              )}>
              Your repositories
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
                <Text>Repositories from the other connected accounts are still shown.</Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          ) : null}

          <FieldGroup.Section title="Repositories" style={androidSectionStyle}>
            {items.length === 0 ? (
              <ListItem
                onPress={() => void refetch()}
                leading={<Icon name={Icons.empty} size={20} />}
                supportingText="Nothing the selected account can currently see."
                trailing={<Icon name={Icons.refresh} size={17} />}>
                Nothing to show
              </ListItem>
            ) : (
              items.map(({ account, item }) => (
                <RepositoryRow
                  key={`${accountKey(account)}/${item.owner}/${item.name}`}
                  account={account}
                  repository={item}
                  showChevron
                  grouped
                  onPress={() => openRepository(account, item.owner, item.name)}
                />
              ))
            )}
            <FieldGroup.SectionFooter>
              <Text>Pull down to refresh repositories from the selected accounts.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </List>
      </Host>
    </TabScreen>
  );
}

/**
 * What is on screen, in words: how many, whose, and from where.
 *
 * The owner is named here because the header's control cannot name it - a nav bar has no
 * room for an organisation's name beside its glyph - and a filter nobody can read is one
 * people take for a bug.
 */
function repositorySummary(
  count: number,
  selectedAccount: Account | undefined,
  accountCount: number,
  owner: string | undefined
): string {
  const repositoryLabel = `${count} ${count === 1 ? 'repository' : 'repositories'}`;
  const scope = selectedAccount
    ? `${selectedAccount.login} on ${hostLabel(selectedAccount)}`
    : `${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}`;
  return owner ? `${repositoryLabel} · ${owner} · ${scope}` : `${repositoryLabel} · ${scope}`;
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
