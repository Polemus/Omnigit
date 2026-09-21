/**
 * Accounts, the sites they live on, and what the app is.
 *
 * Built on `FieldGroup`, which is a SwiftUI `Form` on iOS and a Material settings list on
 * Android - so this looks like the system's own settings screen on both, without either
 * being imitated in JavaScript.
 */

import { FieldGroup, Host } from '@expo/ui';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet } from 'react-native';

import { capabilitiesOf } from '@/hosts/manifest';
import { allManifests } from '@/hosts/registry';
import { accountKey } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { Icon } from '@/ui/icon';
import { Avatar, hostLabel } from '@/ui/identity';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { TabScreen } from '@/ui/screen';

export default function SettingsScreen() {
  const router = useRouter();
  const { accounts, needsSignIn } = useAccounts();

  const manifests = allManifests();
  const version = Constants.expoConfig?.version ?? '0.0.0';

  const stale = new Set(needsSignIn.map(accountKey));

  return (
    <TabScreen>
      <Host style={styles.fill}>
        <FieldGroup>
          <FieldGroup.Section title="Accounts">
            {accounts.length === 0 ? (
              <ListItem>Not signed in anywhere</ListItem>
            ) : (
              accounts.map((account) => (
                <ListItem
                  key={accountKey(account)}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    router.push({
                      pathname: '/account',
                      params: { account: accountKey(account) },
                    });
                  }}
                  leading={<Avatar url={account.avatarUrl} size={30} fallback={account.login} />}
                  supportingText={
                    stale.has(accountKey(account))
                      ? `${hostLabel(account)} · sign in again`
                      : hostLabel(account)
                  }
                  trailing={
                    <Icon name={Icons.chevron} size={16} />
                  }>
                  {account.displayName || account.login}
                </ListItem>
              ))
            )}
            <ListItem
              onPress={() => router.push('/sign-in')}
              leading={<Icon name={Icons.add} size={20} />}>
              Add an account
            </ListItem>
          </FieldGroup.Section>

          {/* Which sites the app can talk to at all, and what each of them supports. The
              desktop shows the same thing on its Hosting sites tab. */}
          <FieldGroup.Section title="Hosting sites">
            {manifests.map((manifest) => {
              const can = capabilitiesOf(manifest);
              const supported = [
                can.canListRepositories && 'repositories',
                can.canListPullRequests && 'pull requests',
                can.canListIssues && 'issues',
                can.canListNotifications && 'inbox',
              ].filter(Boolean) as string[];

              return (
                <ListItem
                  key={manifest.id}
                  leading={<Icon name={Icons.host} size={20} />}
                  supportingText={supported.join(' · ') || 'nothing described yet'}>
                  {manifest.displayName}
                </ListItem>
              );
            })}
          </FieldGroup.Section>

          <FieldGroup.Section title="About">
            <ListItem supportingText={`Version ${version}`}>Omnigit</ListItem>
            <ListItem
              onPress={() =>
                void WebBrowser.openBrowserAsync('https://github.com/Polemus/Omnigit')
              }
              leading={<Icon name={Icons.openInBrowser} size={20} />}>
              Omnigit on GitHub
            </ListItem>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
