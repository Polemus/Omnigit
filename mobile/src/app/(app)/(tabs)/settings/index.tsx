/**
 * Accounts, the sites they live on, and what the app is.
 *
 * Built on `FieldGroup`, which is a SwiftUI `Form` on iOS and a Material settings list on
 * Android - so this looks like the system's own settings screen on both, without either
 * being imitated in JavaScript.
 */

import { Switch } from '@expo/ui';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet } from 'react-native';

import { useUpdateWaiting } from '@/api/updates';
import { capabilitiesOf } from '@/hosts/manifest';
import { allManifests } from '@/hosts/registry';
import { accountKey } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { useDisplayPreferences } from '@/state/display-preferences';
import { useLock } from '@/state/lock';
import { useNavigationPreferences } from '@/state/navigation-preferences';
import { usePalette } from '@/theme/use-palette';
import { FieldGroup } from '@/ui/field-group';
import { Host } from '@/ui/host';
import { Icon } from '@/ui/icon';
import { Avatar, hostLabel } from '@/ui/identity';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { TabScreen, useTabBarClearance } from '@/ui/screen';
import { StatusDot } from '@/ui/status-dot';
import { Text } from '@/ui/text';

export default function SettingsScreen() {
  const router = useRouter();
  const { accounts, needsSignIn } = useAccounts();
  const palette = usePalette();
  const updateWaiting = useUpdateWaiting();
  const lock = useLock();
  const { appearance } = useDisplayPreferences();
  const { splitViewEnabled, setSplitViewEnabled } = useNavigationPreferences();

  // Off with accounts signed in is the one combination worth marking, because it is the
  // only one where something is at stake and nothing is guarding it.
  const unguarded = !lock.isLoading && !lock.isEnabled && accounts.length > 0;
  const unlockedBy =
    lock.record?.biometrics && lock.support.available ? lock.support.label : undefined;

  const clearance = useTabBarClearance();
  const manifests = allManifests();
  const version = Constants.expoConfig?.version ?? '0.0.0';

  const stale = new Set(needsSignIn.map(accountKey));

  return (
    <TabScreen>
      <Host style={[styles.fill, { paddingBottom: clearance }]}>
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
                  trailing={<Icon name={Icons.chevron} size={16} />}>
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

          <FieldGroup.Section title="Preferences">
            <ListItem
              onPress={() => router.push('/display')}
              leading={<Icon name={Icons.appearance} size={20} />}
              supportingText={`${appearanceLabel(appearance)} · Text size, bold text, and appearance`}
              trailing={<Icon name={Icons.chevron} size={16} />}>
              Display
            </ListItem>
          </FieldGroup.Section>

          {process.env.EXPO_OS === 'ios' ? (
            <FieldGroup.Section title="Experimental">
              <ListItem
                leading={<Icon name={Icons.sidebar} size={20} />}
                supportingText="Use a native sidebar on iPad and a collapsible sidebar flow on iPhone."
                trailing={
                  <Switch
                    value={splitViewEnabled}
                    onValueChange={(enabled) => {
                      void Haptics.selectionAsync();
                      setSplitViewEnabled(enabled);
                    }}
                  />
                }>
                Split View
              </ListItem>
              <FieldGroup.SectionFooter>
                <Text>
                  This Expo navigation API is still experimental. Turn it off here to return
                  to the normal tab bar immediately.
                </Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          ) : null}

          <FieldGroup.Section title="Security">
            <ListItem
              onPress={() => router.push('/app-lock')}
              leading={<Icon name={lock.isEnabled ? Icons.lock : Icons.unlocked} size={20} />}
              supportingText={
                lock.isEnabled
                  ? `On · ${unlockedBy ? `${unlockedBy} or a PIN` : 'a six-digit PIN'}`
                  : unguarded
                    ? 'Off · anyone holding this phone can open your accounts'
                    : 'Off'
              }
              trailing={
                unguarded ? (
                  <StatusDot color={palette.warning} />
                ) : (
                  <Icon name={Icons.chevron} size={16} />
                )
              }>
              App lock
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
            {/* The dot replaces the chevron rather than joining it: a chevron beside a dot
                is two trailing things competing in a slot the width of one, and the row is
                just as obviously tappable without it. The supporting text says the same
                thing in words, so the mark is never the only way to know. */}
            <ListItem
              onPress={() => router.push('/updates')}
              leading={<Icon name={Icons.update} size={20} />}
              supportingText={
                updateWaiting
                  ? 'An update is waiting to be installed.'
                  : 'What this build is running, and whether there is anything newer.'
              }
              trailing={
                updateWaiting ? (
                  <StatusDot color={palette.accent} />
                ) : (
                  <Icon name={Icons.chevron} size={16} />
                )
              }>
              Updates
            </ListItem>
            <ListItem
              onPress={() => void WebBrowser.openBrowserAsync('https://github.com/Polemus/Omnigit')}
              leading={<Icon name={Icons.openInBrowser} size={20} />}>
              Omnigit on GitHub
            </ListItem>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </TabScreen>
  );
}

function appearanceLabel(appearance: ReturnType<typeof useDisplayPreferences>['appearance']) {
  return {
    automatic: 'Automatic',
    dark: 'Dark',
    light: 'Light',
    system: 'System',
  }[appearance];
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
