/**
 * Which account the lists on the tabs are drawn from, as one pinned picker row.
 *
 * It replaced a grouped section with a row per account, a title and a footer, which cost
 * a screenful of height on someone with several accounts before a single repository
 * appeared. This is the branch picker's control, reused - one row, however many accounts.
 * Settings keeps its own full list, because that is where accounts are managed rather
 * than chosen between.
 */

import { accountKey, type Account } from '../hosts/types';
import { useAccounts } from '../state/accounts';
import { ControlBar, MenuPickerRow } from './control-bar';
import { hostLabel } from './identity';
import { Icons } from './icons';

/** A picker value cannot be undefined, so "every account" needs a value of its own. */
const ALL = '__all__';

/** The bar with the picker in it, or nothing at all when there is nothing to choose. */
export function AccountControlBar() {
  const { accounts } = useAccounts();

  // One account has nothing to switch between, and a bar saying so would cost the list
  // its height for nothing.
  if (accounts.length < 2) return null;

  return (
    <ControlBar>
      <AccountPicker />
    </ControlBar>
  );
}

export function AccountPicker() {
  const { accounts, filter, setFilter } = useAccounts();
  const ambiguous = hasRepeatedLogin(accounts);

  const options = [
    { label: 'All accounts', value: ALL },
    ...accounts.map((account) => ({
      // The host only when it is doing work: two accounts on two sites with one login
      // would otherwise be two identical entries in the menu.
      label: ambiguous ? `${account.login} · ${hostLabel(account)}` : account.login,
      value: accountKey(account),
    })),
  ];

  // A filter naming an account that has since been signed out already falls back to
  // every account in the lists, so the picker says the same rather than an empty choice.
  const selected = options.some((option) => option.value === filter) ? filter! : ALL;

  return (
    <MenuPickerRow
      icon={Icons.account}
      label="Account"
      options={options}
      selected={selected}
      onSelect={(value) => setFilter(value === ALL ? undefined : value)}
    />
  );
}

/** True when two accounts share a login, so the site has to be shown to tell them apart. */
function hasRepeatedLogin(accounts: Account[]): boolean {
  const seen = new Set<string>();
  for (const account of accounts) {
    const login = account.login.toLowerCase();
    if (seen.has(login)) return true;
    seen.add(login);
  }
  return false;
}
