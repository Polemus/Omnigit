/**
 * Signing in to one hosting site.
 *
 * The picker, this form, the browser-code state, and View Account all use the same native
 * grouped structure. `FieldGroup` receives a real flex frame from `Host`; it is never put
 * inside `matchContents`, because a scrolling native form has no intrinsic height.
 *
 * `TextInput` captures `defaultValue` only when it mounts, so the route resolves the
 * manifest and optional edit-time server first, then keys this form with both values.
 */

import { FieldGroup, Host, TextInput } from '@expo/ui';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { fillTemplate } from '@/hosts/field-ref';
import { capabilitiesOf, type HostManifest } from '@/hosts/manifest';
import { manifestFor } from '@/hosts/registry';
import {
  completeDeviceLogin,
  normaliseBaseUrl,
  signInWithToken,
  startDeviceLogin,
  type DeviceLogin,
} from '@/hosts/sign-in';
import { accountKey, type Account } from '@/hosts/types';
import { useAccounts } from '@/state/accounts';
import { usePalette } from '@/theme/use-palette';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Empty, Loading } from '@/ui/states';
import { Text } from '@/ui/text';

export default function SignInHostScreen() {
  const { id, baseUrl, replace, returnTo } = useLocalSearchParams<{
    id?: string;
    baseUrl?: string;
    replace?: string;
    returnTo?: string;
  }>();

  if (!id) return <Loading />;

  const manifest = manifestFor(id);
  if (!manifest) {
    return (
      <Empty
        icon={Icons.warning}
        title="No such site"
        detail={`Nothing in the app describes "${id}".`}
      />
    );
  }

  return (
    <SignInForm
      key={`${manifest.id}|${baseUrl ?? ''}`}
      manifest={manifest}
      initialBaseUrl={baseUrl}
      replaceAccountKey={replace}
      returnToAccount={returnTo === 'account'}
    />
  );
}

function SignInForm({
  manifest,
  initialBaseUrl,
  replaceAccountKey,
  returnToAccount,
}: {
  manifest: HostManifest;
  initialBaseUrl?: string;
  replaceAccountKey?: string;
  returnToAccount: boolean;
}) {
  const router = useRouter();
  const palette = usePalette();
  const { accounts, signIn, signOut } = useAccounts();

  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? manifest.defaultBaseUrl ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [device, setDevice] = useState<DeviceLogin | undefined>();

  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => abort.current?.abort(), []);

  const can = capabilitiesOf(manifest);
  const tokenPage = manifest.webUrls?.tokenSettings;
  const needsAddress = !initialBaseUrl && !manifest.defaultBaseUrl;

  async function save(account: Account, credential: string) {
    await signIn(account, credential);

    // Save the verified replacement before removing the old identity. A failed edit can
    // therefore never turn a working account into no account.
    const previous = replaceAccountKey
      ? accounts.find((candidate) => accountKey(candidate) === replaceAccountKey)
      : undefined;
    if (previous && accountKey(previous) !== accountKey(account)) {
      await signOut(previous);
    }
  }

  function finish(account: Account) {
    if (returnToAccount && replaceAccountKey === accountKey(account)) {
      router.back();
      return;
    }
    router.dismissTo('/');
  }

  async function withToken() {
    setBusy(true);
    setError(undefined);
    try {
      const origin = normaliseBaseUrl(baseUrl);
      const account = await signInWithToken(manifest, origin, token);
      await save(account, token.trim());
      notify(Haptics.NotificationFeedbackType.Success);
      finish(account);
    } catch (cause) {
      notify(Haptics.NotificationFeedbackType.Error);
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function withBrowser() {
    setBusy(true);
    setError(undefined);
    abort.current?.abort();
    abort.current = new AbortController();

    try {
      const origin = normaliseBaseUrl(baseUrl);
      const login = await startDeviceLogin(manifest, origin);

      await Clipboard.setStringAsync(login.userCode);
      if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
      setDevice(login);

      const { account, token: granted } = await completeDeviceLogin(
        manifest,
        origin,
        login,
        abort.current.signal
      );
      await save(account, granted);
      notify(Haptics.NotificationFeedbackType.Success);
      finish(account);
    } catch (cause) {
      if (!isAbort(cause)) {
        notify(Haptics.NotificationFeedbackType.Error);
        setError(cause instanceof Error ? cause.message : 'Could not sign in.');
      }
    } finally {
      setBusy(false);
      setDevice(undefined);
    }
  }

  function openTokenSettings() {
    if (!tokenPage) return;
    try {
      const origin = normaliseBaseUrl(baseUrl);
      void WebBrowser.openBrowserAsync(fillTemplate(tokenPage, { base: origin }));
    } catch {
      setError('Enter the server address first.');
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: returnToAccount ? 'Edit account' : manifest.displayName }} />
      <Host style={styles.fill}>
        {device ? (
          <WaitingForBrowser
            login={device}
            siteName={manifest.displayName}
            onCancel={() => abort.current?.abort()}
          />
        ) : (
          <FieldGroup>
            <FieldGroup.Section>
              <ListItem
                leading={<Icon name={Icons.host} size={40} />}
                supportingText={`${hostOf(baseUrl) || 'Enter a server'} · verified before saving`}>
                {returnToAccount
                  ? `Edit ${manifest.displayName} account`
                  : `Connect to ${manifest.displayName}`}
              </ListItem>
            </FieldGroup.Section>

            {can.canDeviceLogin ? (
              <FieldGroup.Section title="Recommended">
                <ListItem
                  onPress={busy ? undefined : () => void withBrowser()}
                  leading={<Icon name={Icons.openInBrowser} size={20} />}
                  supportingText={
                    busy
                      ? 'Requesting a secure browser code…'
                      : `Approve a short code on ${hostOf(baseUrl) || manifest.displayName}.`
                  }
                  trailing={
                    busy ? undefined : (
                      <Icon name={Icons.chevron} size={16} />
                    )
                  }>
                  {busy ? 'Starting sign-in…' : 'Continue in browser'}
                </ListItem>
                <FieldGroup.SectionFooter>
                  <Text>No token to create or paste.</Text>
                </FieldGroup.SectionFooter>
              </FieldGroup.Section>
            ) : null}

            <FieldGroup.Section title={needsAddress ? 'Server address' : 'Server'}>
              <TextInput
                defaultValue={baseUrl}
                onChangeText={setBaseUrl}
                placeholder={placeholderFor(manifest)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                cursorColor={palette.accent}
                placeholderTextColor={palette.textTertiary}
                selectionColor={palette.accent}
                autoFocus={needsAddress}
                editable={!busy}
                style={styles.input}
              />
              <FieldGroup.SectionFooter>
                <Text>
                  {needsAddress
                    ? 'Use the address you open in your browser, including https://.'
                    : 'Change this only for a self-hosted or Enterprise installation.'}
                </Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>

            <FieldGroup.Section title="Access token">
              <TextInput
                defaultValue=""
                onChangeText={setToken}
                placeholder="Paste your token"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                cursorColor={palette.accent}
                placeholderTextColor={palette.textTertiary}
                selectionColor={palette.accent}
                editable={!busy}
                onSubmitEditing={() => void withToken()}
                returnKeyType="go"
                style={styles.input}
              />
              {tokenPage ? (
                <ListItem
                  onPress={openTokenSettings}
                  leading={<Icon name={Icons.openInBrowser} size={20} />}
                  supportingText={hostOf(baseUrl) || manifest.displayName}
                  trailing={
                    <Icon name={Icons.chevron} size={16} />
                  }>
                  Create an access token
                </ListItem>
              ) : null}
              {manifest.tokenHelp ? (
                <FieldGroup.SectionFooter>
                  <Text>{manifest.tokenHelp}</Text>
                </FieldGroup.SectionFooter>
              ) : null}
            </FieldGroup.Section>

            <FieldGroup.Section title="Finish">
              <ListItem
                onPress={busy ? undefined : () => void withToken()}
                leading={<Icon name={Icons.token} size={20} />}
                supportingText="Your account is checked with the hosting site before it is saved."
                trailing={
                  busy ? undefined : (
                    <Icon name={Icons.chevron} size={16} />
                  )
                }>
                {busy ? 'Signing in…' : returnToAccount ? 'Save account' : 'Add account'}
              </ListItem>
            </FieldGroup.Section>

            {error ? (
              <FieldGroup.Section title="Problem">
                <ListItem
                  leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
                  supportingText={error}>
                  <Text textStyle={{ color: palette.danger }}>Could not sign in</Text>
                </ListItem>
              </FieldGroup.Section>
            ) : null}
          </FieldGroup>
        )}
      </Host>
    </>
  );
}

function WaitingForBrowser({
  login,
  siteName,
  onCancel,
}: {
  login: DeviceLogin;
  siteName: string;
  onCancel: () => void;
}) {
  const palette = usePalette();

  async function copy() {
    await Clipboard.setStringAsync(login.userCode);
    notify(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <FieldGroup>
      <FieldGroup.Section>
        <ListItem
          leading={<Icon name={Icons.token} size={40} />}
          supportingText={`Use the code below to approve Omnigit on ${siteName}.`}>
          Approve this sign-in
        </ListItem>
      </FieldGroup.Section>

      <FieldGroup.Section title="1. Copy the code">
        <ListItem
          onPress={() => void copy()}
          leading={<Icon name={Icons.copy} size={20} />}
          supportingText="Already copied to your clipboard · tap to copy again"
          trailing={<Icon name={Icons.copy} size={18} />}>
          <Text
            textStyle={{
              color: palette.text,
              fontSize: 28,
              fontWeight: '700',
              letterSpacing: 3,
            }}>
            {login.userCode}
          </Text>
        </ListItem>
      </FieldGroup.Section>

      <FieldGroup.Section title={`2. Approve on ${siteName}`}>
        <ListItem
          onPress={() => {
            if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
            void WebBrowser.openBrowserAsync(login.verificationUri);
          }}
          leading={<Icon name={Icons.openInBrowser} size={20} />}
          supportingText={login.verificationUri}
          trailing={<Icon name={Icons.chevron} size={16} />}>
          Open {hostOf(login.verificationUri) || siteName}
        </ListItem>
      </FieldGroup.Section>

      <FieldGroup.Section title="Status">
        <ListItem
          leading={<Icon name={Icons.refresh} size={20} />}
          supportingText="This screen closes automatically when approval is complete.">
          Waiting for approval
        </ListItem>
      </FieldGroup.Section>

      <FieldGroup.Section>
        <ListItem
          onPress={onCancel}
          colors={{ contentColor: palette.danger, leadingContentColor: palette.danger }}
          leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}>
          <Text textStyle={{ color: palette.danger }}>Cancel sign-in</Text>
        </ListItem>
      </FieldGroup.Section>
    </FieldGroup>
  );
}

function notify(type: Haptics.NotificationFeedbackType) {
  if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(type);
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

function placeholderFor(manifest: HostManifest): string {
  return manifest.defaultBaseUrl ?? `https://${manifest.id}.example.com`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  input: {
    height: 44,
    paddingHorizontal: 8,
  },
});
