/**
 * Which hosting site the new account belongs to.
 *
 * This intentionally uses the same native grouped shape as View Account: a summary row,
 * a section of actions, and a compact security explanation. The next screen continues
 * that structure rather than changing visual language halfway through the flow.
 */

import { FieldGroup, Host } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { capabilitiesOf, type HostManifest } from '@/hosts/manifest';
import { allManifests } from '@/hosts/registry';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Text } from '@/ui/text';

export default function SignInScreen() {
  const router = useRouter();
  const manifests = allManifests();

  function choose(manifest: HostManifest) {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    router.push({ pathname: '/sign-in/host', params: { id: manifest.id } });
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Add an account' }} />
      <Host style={styles.fill}>
        <FieldGroup>
          <FieldGroup.Section>
            <ListItem
              leading={<Icon name={Icons.account} size={40} />}
              supportingText="Choose where the account is hosted. You can confirm the server next.">
              Connect an account
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Hosting site">
            {manifests.map((manifest) => (
              <ListItem
                key={manifest.id}
                onPress={() => choose(manifest)}
                leading={<Icon name={Icons.host} size={20} />}
                supportingText={siteDetail(manifest)}
                trailing={
                  <Icon name={Icons.chevron} size={16} />
                }>
                {manifest.displayName}
              </ListItem>
            ))}
            <FieldGroup.SectionFooter>
              <Text>Public, Enterprise, and self-hosted accounts use the same safe flow.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Security">
            <ListItem
              leading={<Icon name={Icons.token} size={20} />}
              supportingText="Saved in your phone’s secure keychain, never in a settings file.">
              Credentials stay on this device
            </ListItem>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </>
  );
}

function siteDetail(manifest: HostManifest): string {
  const method = capabilitiesOf(manifest).canDeviceLogin
    ? 'Browser code or access token'
    : 'Access token';

  if (!manifest.defaultBaseUrl) return `${method} · Self-hosted, including Forgejo`;

  try {
    return `${method} · ${new URL(manifest.defaultBaseUrl).host} or self-hosted`;
  } catch {
    return `${method} · Public or self-hosted`;
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
