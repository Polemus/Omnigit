/**
 * Finding a repository on every selected hosting site at once.
 *
 * This follows the same native grouped structure as Repositories and Inbox: the control
 * that changes the list, account selection, partial failures, and results. The summary of
 * what is being searched is the navigation header's title rather than a card in the list.
 * The search field belongs to the native navigation stack, while the network query is
 * debounced and the content keeps the same grouped structure as the other tabs.
 */

import { FieldGroup, Host, List } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
  View,
} from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { useRepositorySearch } from '@/api/queries';
import { accountKey, type Account } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { usePalette } from '@/theme/use-palette';
import { Icon } from '@/ui/icon';
import { hostLabel } from '@/ui/identity';
import { AccountControlBar } from '@/ui/account-picker';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { RepositoryRow } from '@/ui/rows';
import { useTabBarClearance } from '@/ui/screen';
import { Empty, Loading } from '@/ui/states';
import { Text } from '@/ui/text';

const androidSectionStyle =
  process.env.EXPO_OS === 'android'
    ? ({ paddingHorizontal: 16, paddingTop: 16 } as const)
    : undefined;

export default function SearchScreen() {
  const router = useRouter();
  const palette = usePalette();
  const clearance = useTabBarClearance();
  const {
    accounts,
    visibleProviders,
    filter,
    isLoading: accountsLoading,
  } = useAccounts();

  // The field follows the keyboard immediately while the API query waits briefly, so a
  // person signed in to several sites does not send one request per site for every key.
  const searchBarRef = useRef<SearchBarCommands>(null);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const { data, isFetching, error, refetch } = useRepositorySearch(query);
  const able = visibleProviders.filter((provider) => provider.capabilities.canSearchRepositories);
  const trimmed = query.trim();
  const items = data?.items ?? [];
  const selectedAccount = filter
    ? accounts.find((account) => accountKey(account) === filter)
    : undefined;

  const openRepository = useCallback(
    (account: Account, owner: string, name: string) => {
      router.push({
        pathname: '/repo',
        params: { account: accountKey(account), owner, name },
      });
    },
    [router]
  );

  const changeSearch = useCallback(
    (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
      setTyped(event.nativeEvent.text);
    },
    []
  );

  const submitSearch = useCallback(
    (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
      setTyped(event.nativeEvent.text);
      setQuery(event.nativeEvent.text);
    },
    []
  );

  // A tick as the field opens and as it is cancelled, matching the menus and the tab bar.
  // Each handler is wired to two callbacks, but never both on one platform: `onOpen` and
  // `onClose` are Android-only, `onCancelButtonPress` is iOS-only, and the haptic is iOS
  // only - so on iOS these fire once each, from `onFocus` and the Cancel button.
  //
  // Nothing on submit. The Search key is a keyboard key, and iOS already buzzes for it
  // when the person has keyboard haptics turned on, so a tick here would double up.
  const clearSearch = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setTyped('');
    setQuery('');
    setIsSearchOpen(false);
  }, []);

  const openSearch = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setIsSearchOpen(true);
  }, []);

  const dismissSearchKeyboard = useCallback(() => {
    Keyboard.dismiss();
    searchBarRef.current?.blur();
  }, []);

  const searchBar = (
    <Stack.SearchBar
      ref={searchBarRef}
      placeholder="Search repositories"
      autoCapitalize="none"
      placement="automatic"
      allowToolbarIntegration
      obscureBackground={false}
      hideWhenScrolling={false}
      tintColor={palette.accent}
      barTintColor={palette.surfaceRaised}
      textColor={palette.text}
      hintTextColor={palette.textTertiary}
      headerIconColor={palette.textSecondary}
      onFocus={openSearch}
      onOpen={openSearch}
      onChangeText={changeSearch}
      onSearchButtonPress={submitSearch}
      onCancelButtonPress={clearSearch}
      onClose={clearSearch}
    />
  );

  // The header carries the scope - the chosen account, or how many are being searched -
  // which is what the "Find a repository" card used to say. The header is there either
  // way, because the search field belongs to it, so it holds this rather than sitting
  // empty. Blank while providers are still being built, rather than flashing "0 accounts".
  const title =
    accountsLoading || accounts.length === 0 ? '' : scopeTitle(selectedAccount, able.length);

  const header = (
    <>
      {/* Both title keys: the layout sets `headerTitle: ''`, and `headerTitle` wins over
          `title` when both are present.

          `headerTransparent: false` because a header with a search bar is made translucent
          on iOS unless told otherwise, and a translucent header lays the screen's content
          out from the very top, *underneath* itself. The native list compensates with its
          own inset, but the account bar pinned above it does not - it was drawn behind
          the header, which is why the picker seemed to be missing here and nowhere else.
          The translucency is only needed for hide-on-scroll and large titles, and this
          search bar uses neither. */}
      <Stack.Screen options={{ title, headerTitle: title, headerTransparent: false }} />
      {searchBar}
    </>
  );

  if (accountsLoading) {
    return (
      <>
        {header}
        <View style={styles.fill}>
          <Loading />
        </View>
      </>
    );
  }

  if (accounts.length === 0) {
    return (
      <>
        {header}
        <View style={styles.fill}>
          <Empty
            icon={Icons.account}
            title="No accounts yet"
            detail="Add an account before searching for repositories."
            actionLabel="Add an account"
            onAction={() => router.push('/sign-in')}
          />
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <View style={styles.fill} onTouchStart={dismissSearchKeyboard}>
        {/* Always shown, unlike the account section it replaced. That section was hidden
            while searching to give results room, but this is one row, and `isSearchOpen`
            only clears on Cancel - so after one search the picker stayed hidden for good. */}
        <AccountControlBar />
        <Host style={[styles.fill, { paddingBottom: clearance }]}>
          <List
            onRefresh={
              trimmed.length >= 2
                ? async () => {
                    await refetch();
                  }
                : undefined
            }>
            {!isSearchOpen && (data?.failures.length ?? 0) > 0 ? (
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
                  <Text>Results from the other connected accounts are still shown.</Text>
                </FieldGroup.SectionFooter>
              </FieldGroup.Section>
            ) : null}

            <FieldGroup.Section
              title={isSearchOpen ? undefined : 'Results'}
              style={isSearchOpen ? styles.activeResults : androidSectionStyle}>
              {able.length === 0 ? (
                <ListItem
                  leading={<Icon name={Icons.warning} size={20} />}
                  supportingText="The selected hosting site describes no repository search endpoint.">
                  Search unavailable
                </ListItem>
              ) : trimmed.length < 2 ? (
                <ListItem
                  leading={<Icon name={Icons.search} size={20} />}
                  supportingText={
                    able.length === 1
                      ? 'Searches the selected hosting site.'
                      : `Searches all ${able.length} selected hosting sites at once.`
                  }>
                  Ready to search
                </ListItem>
              ) : isFetching && !data ? (
                <ListItem
                  leading={<Icon name={Icons.refresh} size={20} />}
                  supportingText={`Looking for “${trimmed}” across the selected accounts.`}>
                  Searching…
                </ListItem>
              ) : error && !data ? (
                <ListItem
                  onPress={() => void refetch()}
                  leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
                  supportingText={error instanceof Error ? error.message : 'The search failed.'}
                  trailing={<Icon name={Icons.refresh} size={17} />}>
                  Try the search again
                </ListItem>
              ) : items.length === 0 ? (
                <ListItem
                  onPress={() => void refetch()}
                  leading={<Icon name={Icons.empty} size={20} />}
                  supportingText={`Nothing matched “${trimmed}”.`}
                  trailing={<Icon name={Icons.refresh} size={17} />}>
                  No repositories found
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
                <Text>
                  {trimmed.length >= 2
                    ? 'Pull down to run this search again.'
                    : 'Repository results appear here as you type.'}
                </Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          </List>
        </Host>
      </View>
    </>
  );
}

/**
 * Which accounts this search covers: the chosen one by name, or how many when it is all
 * of them. Worded exactly as the card it replaced worded its scope.
 */
function scopeTitle(selectedAccount: Account | undefined, searchableAccounts: number): string {
  if (selectedAccount) return `${selectedAccount.login} on ${hostLabel(selectedAccount)}`;
  return `${searchableAccounts} ${searchableAccounts === 1 ? 'account' : 'accounts'}`;
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
  activeResults: {
    paddingTop: 0,
    ...(process.env.EXPO_OS === 'android' ? { paddingHorizontal: 16 } : undefined),
  },
});
