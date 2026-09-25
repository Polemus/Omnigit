/**
 * Finding a repository on every selected hosting site at once.
 *
 * This follows the same native grouped structure as Repositories and Inbox: the control
 * that changes the list, account selection, partial failures, and results. The summary of
 * what is being searched is the navigation header's title rather than a card in the list.
 * The search field belongs to the native navigation stack on iOS, while the network query
 * is debounced and the content keeps the same grouped structure as the other tabs.
 *
 * Android draws its own field above the list instead. The toolbar's search is a menu item
 * whose collapsed view still measures the width of the whole bar - react-native-screens
 * gives it `maxWidth = Integer.MAX_VALUE` so the open field can fill the bar - so its icon
 * was drawn across the owner and account controls beside it. Ours takes the room it needs,
 * leaves those controls alone, and puts a measured gap between itself and the first result.
 */

import { List } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
  View,
} from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { useRepositories, useRepositorySearch } from '@/api/queries';
import { accountKey, type Account } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { usePalette } from '@/theme/use-palette';
import { FieldGroup } from '@/ui/field-group';
import { Host } from '@/ui/host';
import { Icon } from '@/ui/icon';
import { ownerList, ScopeHeader } from '@/ui/header-scope';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { RepositoryRow } from '@/ui/rows';
import { useTabBarClearance } from '@/ui/screen';
import { Empty, Loading } from '@/ui/states';
import { Text } from '@/ui/text';

const ANDROID = process.env.EXPO_OS === 'android';

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
    owner: ownerFilter,
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

  const { data: repositoryData } = useRepositories();
  const { data, isFetching, error, refetch } = useRepositorySearch(query);
  const able = visibleProviders.filter((provider) => provider.capabilities.canSearchRepositories);
  const trimmed = query.trim();
  // iOS learns this from the field opening and closing; Android's field is always there,
  // so what is typed in it says the same thing.
  const searching = ANDROID ? typed.trim().length > 0 : isSearchOpen;

  // The left owner menu comes from the same repository list as the Repositories tab, so
  // it is useful before a search starts and does not change its options with every query.
  // Search results are included as a fallback for hosts that return something searchable
  // outside their ordinary repository listing.
  const loadedResults = data?.items ?? [];
  const found = filter
    ? loadedResults.filter(({ account }) => accountKey(account) === filter)
    : loadedResults;
  const repositories = filter
    ? (repositoryData?.items ?? []).filter(({ account }) => accountKey(account) === filter)
    : (repositoryData?.items ?? []);
  const owners = ownerList([
    ...repositories.map(({ item }) => item.owner),
    ...found.map(({ item }) => item.owner),
  ]);
  const items = ownerFilter ? found.filter(({ item }) => item.owner === ownerFilter) : found;

  const openRepository = useCallback(
    (account: Account, owner: string, name: string) => {
      router.push({
        pathname: '/repo',
        params: { account: accountKey(account), owner, name },
      });
    },
    [router]
  );

  const changeSearch = useCallback((event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setTyped(event.nativeEvent.text);
  }, []);

  const submitSearch = useCallback((event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setTyped(event.nativeEvent.text);
    setQuery(event.nativeEvent.text);
  }, []);

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

  // Leaving Search directly through the tab bar must also finish the search interaction.
  // Otherwise Android can keep the IME-adjusted navigation bar alive while the next tab
  // is appearing, leaving Search's destination in a different vertical state.
  useFocusEffect(
    useCallback(
      () => () => {
        dismissSearchKeyboard();
      },
      [dismissSearchKeyboard]
    )
  );

  const searchBar = (
    <Stack.SearchBar
      ref={searchBarRef}
      placeholder="Search repositories"
      autoCapitalize="none"
      placement="automatic"
      allowToolbarIntegration
      obscureBackground={false}
      hideWhenScrolling={false}
      onFocus={openSearch}
      onOpen={openSearch}
      onChangeText={changeSearch}
      onSearchButtonPress={submitSearch}
      onCancelButtonPress={clearSearch}
      onClose={clearSearch}
    />
  );

  // The same header the other tabs have, plus the system search field, which belongs to
  // the bar rather than to the list.
  //
  // `headerTransparent: false` because a header holding a search bar is made translucent
  // on iOS unless told otherwise, and a translucent header lays the screen's content out
  // from the very top, *underneath* itself. The native list compensates with its own
  // inset; anything else pinned above it does not. The translucency is only needed for
  // hide-on-scroll and large titles, and this search bar uses neither.
  const header = (
    <>
      <ScopeHeader title="Search" owners={owners} options={{ headerTransparent: false }} />
      {ANDROID ? null : searchBar}
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
      <View style={styles.fill}>
        {ANDROID ? (
          <SearchField
            value={typed}
            onChange={setTyped}
            onSubmit={() => setQuery(typed)}
            onClear={clearSearch}
          />
        ) : null}
        <View style={styles.fill} onTouchStart={dismissSearchKeyboard}>
          <Host style={[styles.fill, { paddingBottom: clearance }]}>
            <List
              onRefresh={
                trimmed.length >= 2
                  ? async () => {
                      await refetch();
                    }
                  : undefined
              }>
              {!searching && (data?.failures.length ?? 0) > 0 ? (
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
                title={searching ? undefined : 'Results'}
                style={searching ? styles.activeResults : androidSectionStyle}>
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
                    supportingText={
                      ownerFilter
                        ? `Nothing from ${ownerFilter} matched “${trimmed}”.`
                        : `Nothing matched “${trimmed}”.`
                    }
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
      </View>
    </>
  );
}

/**
 * Android's search field: ours, above the list, rather than the toolbar's.
 *
 * A plain `TextInput` rather than a native one, because it sits in React Native's own layer
 * where the control bars do - and because `@expo/ui`'s field reads its value once, on
 * mount, which a field that is cleared from outside cannot use.
 */
function SearchField({
  value,
  onChange,
  onSubmit,
  onClear,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}) {
  const palette = usePalette();

  return (
    <View style={styles.fieldRow}>
      <View style={[styles.field, { backgroundColor: palette.surface }]}>
        <Host matchContents>
          <Icon name={Icons.search} size={20} color={palette.textSecondary} />
        </Host>
        <TextInput
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          placeholder="Search repositories"
          placeholderTextColor={palette.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          cursorColor={palette.accent}
          selectionColor={palette.accent}
          style={[styles.input, { color: palette.text }]}
        />
        {value.length > 0 ? (
          <Pressable
            onPress={onClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear the search">
            <View pointerEvents="none">
              <Host matchContents>
                <Icon name={Icons.clear} size={20} />
              </Host>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
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
  fieldRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  activeResults: {
    paddingTop: 0,
    ...(ANDROID ? { paddingHorizontal: 16, paddingTop: 8 } : undefined),
  },
});
