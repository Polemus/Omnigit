/**
 * What a list is drawn from, in the screen's own navigation header.
 *
 * Two controls, at the two ends of the bar: the owner on the left, the account on the
 * right. They answer different questions - which organisation, and whose login on which
 * site - and stacking them into one control made a single line carry two meanings.
 *
 * In the header rather than in a strip beneath it. A strip is a header that the system
 * knows nothing about: it does not hold content below the status bar, it scrolls or does
 * not scroll by our own rules, it takes its own height off the top of every list, and on
 * iOS 26 it gets none of the glass the real bar does. The real bar was always the right
 * place; the tabs simply had no stack to put one in - see `TabStack`.
 *
 * This follows the money tracker's split exactly: iOS receives real native header menu
 * items through `unstable_headerLeftItems` and `unstable_headerRightItems`, while Android
 * receives Compose-backed `MenuView` triggers through `headerLeft` and `headerRight`.
 * Keeping custom React Native views out of the iOS bar lets UIKit own the entire item and
 * its Liquid Glass background; omitting the native item also means there is no empty glass
 * bubble when that choice does not exist.
 *
 * A nav bar is about 44pt tall, so the triggers carry no words: an avatar says which
 * account far better than a login would fit, and the owner's glyph turns accent-coloured
 * while a filter is on. The name of the chosen owner goes in the list's own summary row,
 * where there is room for it.
 */

import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import * as Haptics from 'expo-haptics';
import { Stack as NavigationStack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import type { NativeStackNavigationOptions } from 'expo-router';
import type { SFSymbol } from 'sf-symbols-typescript';

import { accountKey, type Account } from '../hosts/types';
import { useAccounts } from '../state/accounts';
import { Radius, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import {
  accountImage,
  accountImageColor,
  everythingImage,
  ownerImage,
} from './header-scope-images';
import { useHostScheme } from './host';
import { Avatar, hostLabel } from './identity';
import { Text } from './scaled-text';

/** How many avatars stack up before the rest are left to the count beside them. */
const STACKED = 3;

/** A menu value cannot be absent, so "no filter at all" needs an id of its own. */
const ALL = '__all__';

const IOS = process.env.EXPO_OS === 'ios';

/**
 * The owners a screen can offer, out of whatever its own list holds.
 *
 * Every screen derives these from the items it already has rather than from the site's
 * organisation endpoint: it costs no request, and it names only owners that actually have
 * something in that list. Sorted the way a person reads names rather than the way bytes
 * sort, so `acme` and `Acme` do not land at opposite ends of the menu.
 */
export function ownerList(names: Iterable<string>): string[] {
  return [...new Set(names)]
    .filter((name) => name.length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * A screen's whole header: its name, the owner control at one end and the account control
 * at the other.
 *
 * One component rather than three lines in each screen, because a header that differs
 * between tabs is exactly the thing a person notices. Rendered from inside the screen
 * rather than set once in the layout, because `owners` comes from the list the screen has
 * already loaded - the layout has no idea what is in it.
 *
 * `options` is for whatever else a particular header needs; the search tab has a system
 * search field in its bar and one setting to go with it.
 */
export function ScopeHeader({
  title,
  owners,
  options,
}: {
  title: string;
  owners?: string[];
  options?: NativeStackNavigationOptions;
}) {
  const { accounts, filter, setFilter, owner, setOwner } = useAccounts();
  const { names, scopedAccounts, hasCustomOwner } = ownerChoices(
    owners ?? [],
    accounts,
    filter,
    owner
  );
  const selectedAccount = accounts.find((account) => accountKey(account) === filter);
  const ambiguousAccount = hasRepeatedLogin(accounts);

  const platformOptions: NativeStackNavigationOptions = IOS
    ? {
        ...(hasCustomOwner
          ? {
              unstable_headerLeftItems: () => [
                {
                  type: 'menu' as const,
                  label: owner ?? 'Owners',
                  icon: { type: 'sfSymbol' as const, name: 'building.2.fill' as const },
                  accessibilityLabel: owner
                    ? `Showing ${owner}. Choose an owner.`
                    : 'Choose an owner or organisation',
                  menu: {
                    title: 'Owner',
                    items: [
                      {
                        type: 'action' as const,
                        label: 'All owners',
                        icon: { type: 'sfSymbol' as const, name: 'person.2' as const },
                        state: owner === undefined ? ('on' as const) : ('off' as const),
                        onPress: () => {
                          tick();
                          setOwner(undefined);
                        },
                      },
                      ...names.map((name) => ({
                        type: 'action' as const,
                        label: name,
                        icon: {
                          type: 'sfSymbol' as const,
                          name: (personal(name, scopedAccounts)
                            ? 'person.crop.circle'
                            : 'building.2') as SFSymbol,
                        },
                        state: name === owner ? ('on' as const) : ('off' as const),
                        onPress: () => {
                          tick();
                          setOwner(name);
                        },
                      })),
                    ],
                  },
                },
              ],
            }
          : {}),
        ...(accounts.length >= 2
          ? {
              unstable_headerRightItems: () => [
                {
                  type: 'menu' as const,
                  label: selectedAccount
                    ? label(selectedAccount, ambiguousAccount)
                    : 'All accounts',
                  icon: {
                    type: 'sfSymbol' as const,
                    name: selectedAccount
                      ? ('person.crop.circle.fill' as const)
                      : ('person.2.fill' as const),
                  },
                  accessibilityLabel: selectedAccount
                    ? `Showing ${label(selectedAccount, ambiguousAccount)}. Choose an account.`
                    : 'Showing all accounts. Choose an account.',
                  menu: {
                    title: 'Account',
                    items: [
                      {
                        type: 'action' as const,
                        label: 'All accounts',
                        icon: { type: 'sfSymbol' as const, name: 'person.2' as const },
                        state: filter === undefined ? ('on' as const) : ('off' as const),
                        onPress: () => {
                          tick();
                          setFilter(undefined);
                        },
                      },
                      ...accounts.map((account) => ({
                        type: 'action' as const,
                        label: label(account, ambiguousAccount),
                        icon: {
                          type: 'sfSymbol' as const,
                          name: 'person.crop.circle' as const,
                        },
                        state: accountKey(account) === filter ? ('on' as const) : ('off' as const),
                        onPress: () => {
                          tick();
                          setFilter(accountKey(account));
                        },
                      })),
                    ],
                  },
                },
              ],
            }
          : {}),
      }
    : {
        headerLeft: hasCustomOwner ? () => <OwnerHeaderButton owners={owners} /> : undefined,
        headerRight: accounts.length >= 2 ? () => <AccountHeaderButton /> : undefined,
      };

  return (
    <NavigationStack.Screen
      options={{
        title,
        ...platformOptions,
        ...options,
      }}
    />
  );
}

/**
 * The owner control, for a header's left slot - or nothing when the selected account scope
 * has no organisation or externally owned repository to choose.
 *
 * `owners` is every owner the screen's own list belongs to. A screen with no such list
 * passes none and shows no control at all.
 */
export function OwnerHeaderButton({ owners = [] }: { owners?: string[] }) {
  const { accounts, filter, owner, setOwner } = useAccounts();
  const palette = usePalette();
  // The menu is drawn in a Compose host of its own on Android - see `host.android.tsx`.
  const hostScheme = useHostScheme();

  // The owner filter is app-wide, so a screen can be narrowed to an owner its own list
  // holds nothing from: narrow the repositories to an organisation, move to the inbox,
  // and there may be no notification from it. Adding the chosen owner to this screen's
  // own list is what keeps the menu able to clear it - left out, the filter would be
  // stranded with no control anywhere to undo it.
  const { names, scopedAccounts, hasCustomOwner } = ownerChoices(owners, accounts, filter, owner);

  // Two signed-in personal accounts are not an organisation choice. A selected external
  // owner is included in `names` above, so its control remains available to be cleared
  // even if its last matching repository has just disappeared.
  if (!hasCustomOwner) return null;

  const actions: MenuAction[] = [
    {
      id: ALL,
      title: 'All owners',
      image: everythingImage(),
      state: owner === undefined ? 'on' : 'off',
    },
    ...names.map((name) => ({
      id: name,
      title: name,
      image: ownerImage(personal(name, scopedAccounts)),
      state: (name === owner ? 'on' : 'off') as MenuAction['state'],
    })),
  ];

  return (
    <MenuView
      title="Owner"
      actions={actions}
      colorScheme={hostScheme}
      onPressAction={({ nativeEvent }) => {
        tick();
        setOwner(nativeEvent.event === ALL ? undefined : nativeEvent.event);
      }}>
      <View
        style={styles.item}
        accessibilityRole="button"
        accessibilityLabel={
          owner ? `Showing ${owner}. Choose an owner.` : 'Choose an owner or organisation'
        }>
        {/* Accent while a filter is on, which is how a bar button says it is doing
            something: there is no room up here for the owner's name, and a filter nobody
            can see is a filter people think is a bug. */}
        <SymbolView
          name={{ ios: 'building.2.fill', android: 'corporate_fare' }}
          size={22}
          tintColor={owner ? palette.accent : palette.textSecondary}
        />
        <Caret colour={owner ? palette.accent : palette.textTertiary} />
      </View>
    </MenuView>
  );
}

function ownerChoices(
  owners: string[],
  accounts: Account[],
  filter: string | undefined,
  owner: string | undefined
) {
  const names = owner && !owners.includes(owner) ? ownerList([owner, ...owners]) : owners;
  const scopedAccounts = filter
    ? accounts.filter((account) => accountKey(account) === filter)
    : accounts;

  return {
    names,
    scopedAccounts,
    hasCustomOwner: names.some((name) => !personal(name, scopedAccounts)),
  };
}

/**
 * The account control, for a header's right slot - or nothing when only one account is
 * signed in and there is nothing to choose between.
 */
export function AccountHeaderButton() {
  const { accounts, filter, setFilter } = useAccounts();
  const palette = usePalette();
  const hostScheme = useHostScheme();

  if (accounts.length < 2) return null;

  const selected = accounts.find((account) => accountKey(account) === filter);
  const ambiguous = hasRepeatedLogin(accounts);

  const actions: MenuAction[] = [
    {
      id: ALL,
      title: 'All accounts',
      image: everythingImage(),
      state: filter === undefined ? 'on' : 'off',
    },
    ...accounts.map((account) => ({
      id: accountKey(account),
      title: label(account, ambiguous),
      image: accountImage(account),
      imageColor: accountImageColor(account),
      state: (accountKey(account) === filter ? 'on' : 'off') as MenuAction['state'],
    })),
  ];

  return (
    <MenuView
      title="Account"
      actions={actions}
      colorScheme={hostScheme}
      onPressAction={({ nativeEvent }) => {
        tick();
        setFilter(nativeEvent.event === ALL ? undefined : nativeEvent.event);
      }}>
      <View
        style={styles.item}
        accessibilityRole="button"
        accessibilityLabel={
          selected
            ? `Showing ${label(selected, ambiguous)}. Choose an account.`
            : 'Showing all accounts. Choose an account.'
        }>
        {selected ? (
          <Avatar url={selected.avatarUrl} size={28} fallback={selected.login} />
        ) : (
          <Stack accounts={accounts} />
        )}
        <Caret colour={palette.textTertiary} />
      </View>
    </MenuView>
  );
}

/**
 * A two-line title for a screen that is one thing rather than a list of them: the
 * repository, and underneath it the account it was opened from.
 *
 * The bar has room for a repository's name and nothing else, so on a screen reached from
 * a merged list - where the same name can exist on three sites - which account it came
 * from was otherwise only findable by scrolling down to About. There is nothing to choose
 * here, so this is a title and not a control: a repository belongs to one owner on one
 * account, and a menu with one option would be a button that does nothing.
 */
export function ScopeHeaderTitle({ account, children }: { account: Account; children: string }) {
  const palette = usePalette();

  return (
    <View style={styles.title}>
      <Text style={[styles.titleValue, { color: palette.text }]} numberOfLines={1}>
        {children}
      </Text>
      <Text style={[styles.titleCaption, { color: palette.textTertiary }]} numberOfLines={1}>
        {`${account.login} on ${hostLabel(account)}`}
      </Text>
    </View>
  );
}

/** The tick for choosing, iOS only - Android's own menus already give press feedback. */
function tick() {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
}

/**
 * The dropdown caret, which is how a button says it opens a menu rather than acting.
 *
 * `SymbolView` rather than the app's own `Icon`, here and for the organisation glyph
 * beside it. `Icon` is an `@expo/ui` component and has to sit inside a `Host`, and a
 * native host nested inside another native surface is what breaks them both: inside
 * `MenuView` it lands native-in-React-Native-in-native. `SymbolView` is a standalone
 * native view - an SF Symbol on iOS, a Material Symbol on Android - so it needs no host
 * of its own.
 */
function Caret({ colour }: { colour: string }) {
  return (
    <SymbolView
      name={{ ios: 'chevron.down', android: 'expand_more' }}
      size={11}
      tintColor={colour}
    />
  );
}

/** The accounts as overlapping avatars, which is what "all of them" looks like. */
function Stack({ accounts }: { accounts: Account[] }) {
  const palette = usePalette();

  return (
    <View style={styles.stack}>
      {accounts.slice(0, STACKED).map((account, index) => (
        <View
          key={accountKey(account)}
          style={[
            styles.ring,
            { borderColor: palette.background },
            index > 0 ? styles.stacked : null,
          ]}>
          <Avatar url={account.avatarUrl} size={24} fallback={account.login} />
        </View>
      ))}
    </View>
  );
}

/** Whether an owner is one of the signed-in logins rather than an organisation. */
function personal(name: string, accounts: Account[]): boolean {
  return accounts.some((account) => account.login.toLowerCase() === name.toLowerCase());
}

/** The host only when it is doing work: one login on two sites is otherwise two of the same. */
function label(account: Account, ambiguous: boolean): string {
  return ambiguous ? `${account.login} · ${hostLabel(account)}` : account.login;
}

function hasRepeatedLogin(accounts: Account[]): boolean {
  const seen = new Set<string>();
  for (const account of accounts) {
    const login = account.login.toLowerCase();
    if (seen.has(login)) return true;
    seen.add(login);
  }
  return false;
}

const styles = StyleSheet.create({
  // A fixed height rather than one grown from the content: the trigger is measured by a
  // `Host matchContents` inside a native bar, and a bar button that reports a changing
  // height as an avatar loads is a bar that jumps.
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 36,
    paddingHorizontal: Spacing.one,
  },
  title: {
    alignItems: 'center',
  },
  titleValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  titleCaption: {
    fontSize: 11,
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stacked: {
    marginLeft: -9,
  },
  ring: {
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
