/**
 * One changed file from a pull request, read in a dedicated code-style diff viewer.
 */

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';

import { useChangedFiles, usePullRequestDiff } from '@/api/queries';
import { filePatchFromPullRequestDiff } from '@/hosts/diff';
import { useProvider } from '@/state/accounts';
import { DiffHeader } from '@/ui/changed-files';
import { CodeScreenBody } from '@/ui/code-screen';
import { DiffView } from '@/ui/diff';
import { headerMenu } from '@/ui/header-menu';
import { Icons } from '@/ui/icons';
import { useRotationWhileFocused } from '@/ui/rotation';
import { Empty, Failed, Loading } from '@/ui/states';

export default function ChangedFileScreen() {
  const { account, owner, name, number, path } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
    number: string;
    path: string;
  }>();
  const router = useRouter();
  const provider = useProvider(account);
  useRotationWhileFocused();
  const parsedNumber = Number(number);
  const fileName = (path ?? '').split('/').pop() || 'Changed file';

  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '' }),
    [provider, owner, name]
  );
  const files = useChangedFiles(target, parsedNumber);
  const file = files.data?.find((candidate) => candidate.path === path);
  const needsFallback = files.isSuccess && !!file && !file.patch;
  const fullDiff = usePullRequestDiff(target, parsedNumber, needsFallback);
  const fallbackPatch = useMemo(
    () =>
      fullDiff.data && path
        ? filePatchFromPullRequestDiff(fullDiff.data, path)
        : undefined,
    [fullDiff.data, path]
  );
  const patch = file?.patch || fallbackPatch;
  const webUrl = provider?.webUrl('pullRequest', {
    owner,
    repo: name,
    number: parsedNumber,
  });

  const options = (
    <Stack.Screen
      options={{
        title: fileName,
        headerBackTitle: 'Files',
        ...headerMenu([
          {
            label: 'Copy diff',
            sf: 'doc.on.doc',
            disabled: !patch,
            feedback: 'none',
            onPress: () => {
              if (!patch) return;
              void Clipboard.setStringAsync(patch);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
          {
            label: 'Open pull request on the site',
            sf: 'safari',
            disabled: !webUrl,
            onPress: () => webUrl && void WebBrowser.openBrowserAsync(webUrl),
          },
        ]),
      }}
    />
  );

  if (!provider) {
    return (
      <>
        {options}
        <Empty
          icon={Icons.token}
          title="Signed out"
          detail="The token for this account has gone."
          actionLabel="Go to settings"
          onAction={() => router.push('/settings')}
        />
      </>
    );
  }

  if (files.isLoading) {
    return (
      <>
        {options}
        <Loading />
      </>
    );
  }

  if (files.error) {
    return (
      <>
        {options}
        <Failed error={files.error} onRetry={() => void files.refetch()} />
      </>
    );
  }

  if (needsFallback && fullDiff.isLoading) {
    return (
      <>
        {options}
        <Loading />
      </>
    );
  }

  if (needsFallback && fullDiff.error) {
    return (
      <>
        {options}
        <Failed error={fullDiff.error} onRetry={() => void fullDiff.refetch()} />
      </>
    );
  }

  if (!file) {
    return (
      <>
        {options}
        <Empty
          icon={Icons.diff}
          title="Changed file not found"
          detail="The pull request no longer includes this file."
          actionLabel={webUrl ? 'Open pull request' : undefined}
          onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
        />
      </>
    );
  }

  if (!patch) {
    return (
      <>
        {options}
        <Empty
          icon={Icons.diff}
          title="Diff unavailable"
          detail="The hosting site returned no textual changes for this file. It may be binary or generated."
          actionLabel={webUrl ? 'Open pull request' : undefined}
          onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
        />
      </>
    );
  }

  return (
    <>
      {options}
      <CodeScreenBody>
        <DiffHeader file={file} patch={patch} context={`${owner}/${name} · #${number}`} />
        <DiffView file={{ ...file, patch }} />
      </CodeScreenBody>
    </>
  );
}
