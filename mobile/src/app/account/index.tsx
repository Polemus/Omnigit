/**
 * One account, presented with the same native grouped structure as Add an account.
 *
 * The username and display name are deliberately read-only: the hosting site owns that
 * identity. Editing runs the verified sign-in flow again, which can safely replace a
 * token, change servers, or refresh profile data without inventing it locally.
 */

import { FieldGroup, Host } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, StyleSheet } from 'react-native';

import { manifestFor } from '@/hosts/registry';
import { accountKey } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { usePalette } from '@/theme/use-palette';
import { Icon } from '@/ui/icon';
import { Avatar, hostLabel } from '@/ui/identity';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Empty } from '@/ui/states';
import { Text } from '@/ui/text';

export default function AccountScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { account: requestedKey } = useLocalSearchParams<{ account?: string }>();
  const { accounts, needsSignIn, signOut } = useAccounts();

  const account = accounts.find((candidate) => accountKey(candidate) === requestedKey);

  if (!account) {
    return (
      <Empty
        icon={Icons.account}
        title="Account not found"
        detail="It may already have been removed from this device."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    );
  }

  const key = accountKey(account);
  const selectedAccount = account;
  const providerName = manifestFor(account.providerId)?.displayName ?? account.providerId;
  const mustSignIn = needsSignIn.some((candidate) => accountKey(candidate) === key);

  function confirmSignOut() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      `Sign out ${selectedAccount.login}?`,
      `This removes the ${providerName} access token from this phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await signOut(selectedAccount);
              router.back();
            })();
          },
        },
      ]
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: account.displayName || account.login }} />
      <Host style={styles.fill}>
        <FieldGroup>
          <FieldGroup.Section>
            <ListItem
              leading={<Avatar url={account.avatarUrl} size={48} fallback={account.login} />}
              supportingText={`@${account.login} · ${hostLabel(account)}`}>
              {account.displayName || account.login}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Account details">
            <ListItem
              leading={<Icon name={Icons.account} size={20} />}
              supportingText={account.login}>
              Username
            </ListItem>
            <ListItem
              leading={<Icon name={Icons.host} size={20} />}
              supportingText={providerName}>
              Hosting site
            </ListItem>
            <ListItem
              leading={<Icon name={Icons.link} size={20} />}
              supportingText={account.baseUrl}>
              Server
            </ListItem>
            <ListItem
              leading={
                <Icon
                  name={mustSignIn ? Icons.warning : Icons.token}
                  size={20}
                  color={mustSignIn ? palette.warning : palette.open}
                />
              }
              supportingText={mustSignIn ? 'Sign in again to reconnect' : 'Connected'}>
              Status
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Actions">
            <ListItem
              onPress={() => {
                void Haptics.selectionAsync();
                router.push({
                  pathname: '/sign-in/host',
                  params: {
                    id: account.providerId,
                    baseUrl: account.baseUrl,
                    replace: key,
                    returnTo: 'account',
                  },
                });
              }}
              leading={<Icon name={Icons.token} size={20} />}
              supportingText="Change its server, replace its token, or reconnect."
              trailing={<Icon name={Icons.chevron} size={16} />}>
              Edit account
            </ListItem>
            <ListItem
              onPress={() => void WebBrowser.openBrowserAsync(account.baseUrl)}
              leading={<Icon name={Icons.openInBrowser} size={20} />}>
              Open {hostLabel(account)}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <ListItem
              onPress={confirmSignOut}
              colors={{ contentColor: palette.danger, leadingContentColor: palette.danger }}
              leading={<Icon name={Icons.signOut} size={20} color={palette.danger} />}>
              <Text textStyle={{ color: palette.danger }}>Sign out</Text>
            </ListItem>
            <FieldGroup.SectionFooter>
              <Text>Signing out removes only this account and its saved credential.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
