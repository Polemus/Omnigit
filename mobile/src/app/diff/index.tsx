/**
 * One changed file from a pull request, read in a dedicated code-style diff viewer.
 *
 * A picture has no lines to diff, so it is shown instead as it was and as it is
 * (`ChangedPicture`), read at the commits either side of the pull request - which the pull
 * request itself names, and which the screen before this one has already fetched.
 *
 * Sideways, the pull request's changed files sit beside the diff as a tree
 * (`ChangedFileTree`), as the code viewer puts the repository's beside a file: the file
 * highlighted, any other changed file one tap away. That tap swaps the file in place - new
 * params, not a new screen - so Back still returns to the pull request however many files
 * were read. The toggle at the start of the path bar is the file viewer's, and so is the
 * remembered choice.
 */

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';

import { useChangedFiles, usePullRequest, usePullRequestDiff } from '@/api/queries';
import { filePatchFromPullRequestDiff } from '@/hosts/diff';
import type { ChangedFile } from '@/hosts/types';
import { useProvider } from '@/state/accounts';
import { ChangedFileTree } from '@/ui/changed-file-tree';
import { DiffHeader } from '@/ui/changed-files';
import { ChangedPicture } from '@/ui/changed-picture';
import { CodeScreenBody, SidebarToggle, useCodeSidebar } from '@/ui/code-screen';
import { DiffView } from '@/ui/diff';
import { fileView } from '@/ui/file-view';
import { headerMenu } from '@/ui/header-menu';
import { Icons } from '@/ui/icons';
import { useRotationWhileFocused } from '@/ui/rotation';
import { Empty, Failed, Loading } from '@/ui/states';

export default function ChangedFileScreen() {
  const {
    account,
    owner,
    name,
    number,
    path = '',
  } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
    number: string;
    path: string;
  }>();
  const router = useRouter();
  const provider = useProvider(account);
  const sidebar = useCodeSidebar();
  useRotationWhileFocused();
  const parsedNumber = Number(number);
  const fileName = path.split('/').pop() || 'Changed file';

  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '' }),
    [provider, owner, name]
  );
  const files = useChangedFiles(target, parsedNumber);
  const file = files.data?.find((candidate) => candidate.path === path);
  const view = fileView(path);
  const isPicture = view === 'image' || view === 'svg';
  // A raster image has no patch anywhere - the pull request's whole diff says only "Binary
  // files differ" - so fetching that diff to look for one would be a large read for nothing.
  const needsFallback = files.isSuccess && !!file && !file.patch && view !== 'image';
  const fullDiff = usePullRequestDiff(target, parsedNumber, needsFallback);
  const fallbackPatch = useMemo(
    () =>
      fullDiff.data && path
        ? filePatchFromPullRequestDiff(fullDiff.data, path)
        : undefined,
    [fullDiff.data, path]
  );
  const patch = file?.patch || fallbackPatch;

  // The commits either side of the change, for a picture's two versions. Branch names only
  // where the site names no commits: a merged pull request's branch is often gone.
  const pull = usePullRequest(target, parsedNumber);
  const refs = pull.isLoading
    ? undefined
    : {
        before: pull.data?.baseSha || pull.data?.targetBranch || undefined,
        after: pull.data?.headSha || pull.data?.sourceBranch || undefined,
      };

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

  // Until the file list is here there is neither a file nor a tree to draw it beside.
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

  // Another changed file from the tree replaces this one rather than stacking on top of it.
  const openFile = (next: ChangedFile) => router.setParams({ path: next.path });

  // Everything from here sits under the path bar rather than replacing the whole screen,
  // so the tree stays put: a binary file chosen from it must not take away the way to the
  // next one.
  const reading = !file ? (
    <Empty
      icon={Icons.diff}
      title="Changed file not found"
      detail="The pull request no longer includes this file."
      actionLabel={webUrl ? 'Open pull request' : undefined}
      onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
    />
  ) : isPicture ? (
    // Keyed by the file, so each starts in its own first view with its own sizes.
    <ChangedPicture key={path} target={target} file={file} patch={patch} refs={refs} />
  ) : needsFallback && fullDiff.isLoading ? (
    <Loading />
  ) : needsFallback && fullDiff.error ? (
    <Failed error={fullDiff.error} onRetry={() => void fullDiff.refetch()} />
  ) : !patch ? (
      <Empty
        icon={Icons.diff}
        title="Diff unavailable"
        detail="The hosting site returned no textual changes for this file. It may be binary or generated."
        actionLabel={webUrl ? 'Open pull request' : undefined}
        onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
      />
    ) : (
      // Keyed by the file, so one swapped in from the tree starts at its top rather than
      // wherever the last one was scrolled to.
      <DiffView key={path} file={{ ...file, patch }} />
    );

  return (
    <>
      {options}
      <CodeScreenBody
        sidebar={
          sidebar.shown && files.data ? (
            <ChangedFileTree files={files.data} currentPath={path} onOpenFile={openFile} />
          ) : undefined
        }>
        <DiffHeader
          path={path}
          context={`${owner}/${name} · #${number}`}
          file={file}
          // A picture draws its own legend, with the switch an SVG's diff needs.
          patch={isPicture ? undefined : patch}
          leading={<SidebarToggle sidebar={sidebar} />}
        />
        {reading}
      </CodeScreenBody>
    </>
  );
}
