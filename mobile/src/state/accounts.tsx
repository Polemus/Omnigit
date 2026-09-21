/**
 * Who is signed in, and the providers built from them.
 *
 * One context rather than a query, because every screen needs it and none of it comes
 * from the network: the account list is a local file and the tokens are a local store.
 * Reading it should never show a spinner after the first tick.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { providersFor } from '../hosts/registry';
import type { HostProvider } from '../hosts/provider';
import { accountKey } from '../hosts/types';
import type { Account } from '../hosts/types';
import { loadAccounts, removeAccount, upsertAccount } from '../storage/accounts';
import { deleteToken, saveToken } from '../storage/credentials';

interface AccountsValue {
  accounts: Account[];
  /** One per account that still has a usable token, so possibly shorter than `accounts`. */
  providers: HostProvider[];
  /**
   * The providers the merged lists should actually ask, after the filter.
   *
   * Every list in this app draws from several sites at once, which is the point of it -
   * but once someone is signed in to work and to their own server, "everything at once"
   * stops being what they want most of the time. Narrowing to one account is a filter on
   * the sources rather than on the results, so an unwanted site is never fetched at all.
   */
  visibleProviders: HostProvider[];
  /** The account key the lists are narrowed to, or undefined for all of them. */
  filter: string | undefined;
  setFilter: (key: string | undefined) => void;
  /** True until the tokens have been read once. */
  isLoading: boolean;
  /** Accounts whose token has gone and which need signing in again. */
  needsSignIn: Account[];
  signIn: (account: Account, token: string) => Promise<void>;
  signOut: (account: Account) => Promise<void>;
  refresh: () => Promise<void>;
}

const AccountsContext = createContext<AccountsValue | undefined>(undefined);

export function AccountsProvider({ children }: { children: ReactNode }) {
  // Read straight from the file on the first render. It is a synchronous local read, so
  // there is no honest reason to start empty and flash a signed-out screen at someone who
  // is signed in.
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [providers, setProviders] = useState<HostProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string | undefined>();

  // Building the providers means reading tokens out of the keychain, which is async, so
  // it is a subscription to the account list rather than something derived during render.
  //
  // The cancelled flag is not ceremony: signing in twice quickly starts two builds, and
  // without it the slower one can land last and leave `providers` describing the earlier
  // account list. Ignoring a build whose accounts have already been replaced is the only
  // thing that makes the two states agree.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const built = await providersFor(accounts);
      if (cancelled) return;
      setProviders(built);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accounts]);

  const signIn = useCallback(async (account: Account, token: string) => {
    // Token first. If the app dies between the two writes, an account with no token is a
    // row saying "sign in again"; a token with no account is unreachable rubbish in the
    // keychain that nothing will ever clean up.
    await saveToken(account, token);
    setAccounts(upsertAccount(account));
  }, []);

  const signOut = useCallback(async (account: Account) => {
    await deleteToken(account);
    setAccounts(removeAccount(account));
  }, []);

  // Re-reads the file and lets the effect above rebuild from it. `loadAccounts` returns a
  // fresh array every time, so this always re-triggers even when nothing changed - which
  // is what a manual refresh should do.
  const refresh = useCallback(async () => {
    setAccounts(loadAccounts());
  }, []);

  // A filter naming an account that has since been signed out would silently show an
  // empty list, so it resolves to "all" instead of to nothing.
  const visibleProviders = useMemo(() => {
    if (!filter) return providers;
    const matching = providers.filter((provider) => accountKey(provider.account) === filter);
    return matching.length > 0 ? matching : providers;
  }, [providers, filter]);

  const needsSignIn = useMemo(() => {
    if (isLoading) return [];
    const working = new Set(providers.map((provider) => accountKey(provider.account)));
    return accounts.filter((account) => !working.has(accountKey(account)));
  }, [accounts, providers, isLoading]);

  const value = useMemo<AccountsValue>(
    () => ({
      accounts,
      providers,
      visibleProviders,
      filter,
      setFilter,
      isLoading,
      needsSignIn,
      signIn,
      signOut,
      refresh,
    }),
    [accounts, providers, visibleProviders, filter, isLoading, needsSignIn, signIn, signOut, refresh]
  );

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsValue {
  const value = useContext(AccountsContext);
  if (!value) throw new Error('useAccounts must be used inside <AccountsProvider>.');
  return value;
}

/** The provider for one account key, for a screen that was opened from a list row. */
export function useProvider(key: string | undefined): HostProvider | undefined {
  const { providers } = useAccounts();
  return useMemo(
    () => (key ? providers.find((provider) => accountKey(provider.account) === key) : undefined),
    [providers, key]
  );
}
