/**
 * One changed file from a commit, in the same diff viewer - under the same header - as a
 * pull request's changed files.
 *
 * And, sideways, beside the same tree: the commit's changed files, one tap from each other,
 * swapped in place so Back still returns to the commit (see `diff/index.tsx`). A picture is
 * shown as it was and as it is (`ChangedPicture`), read at the commit's first parent and at
 * the commit itself.
 */

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';

import { useCommit, useCommitDiff, useCommitFiles } from '@/api/queries';
import { filePatchFromPullRequestDiff } from '@/hosts/diff';
import { shortSha, type ChangedFile } from '@/hosts/types';
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

export default function CommitFileScreen() {
  const {
    account,
    owner,
    name,
    sha = '',
    path = '',
  } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
    sha: string;
    path: string;
  }>();
  const router = useRouter();
  const provider = useProvider(account);
  const sidebar = useCodeSidebar();
  useRotationWhileFocused();
  const fileName = path.split('/').pop() || 'Changed file';

  const target = useMemo(
    () => ({ provider, owner: owner ?? '', repo: name ?? '' }),
    [provider, owner, name]
  );
  const files = useCommitFiles(target, sha);
  const file = files.data?.find((candidate) => candidate.path === path);
  const view = fileView(path);
  const isPicture = view === 'image' || view === 'svg';

  // GitHub leaves the patch off a file too large to inline, so that file's section is cut
  // from the commit's whole diff instead - with the pull request helper, because the raw
  // diff is the same format from either. Never for a raster image, which has no patch there
  // either.
  const needsFallback = files.isSuccess && !!file && !file.patch && view !== 'image';
  const fullDiff = useCommitDiff(target, sha, needsFallback);
  const fallbackPatch = useMemo(
    () => (fullDiff.data && path ? filePatchFromPullRequestDiff(fullDiff.data, path) : undefined),
    [fullDiff.data, path]
  );
  const patch = file?.patch || fallbackPatch;
  const webUrl = provider?.webUrl('commit', { owner, repo: name, sha });

  // A picture's two versions: at the first parent, which the commit's diff is against, and
  // at the commit. The commit screen before this one has usually fetched the commit already.
  const commit = useCommit(target, sha);
  const refs = commit.isLoading ? undefined : { before: commit.data?.parentSha, after: sha };

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
              if (process.env.EXPO_OS === 'ios') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            },
          },
          {
            label: 'Open commit on the site',
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

  // Under the path bar rather than in place of the screen, so the tree stays put.
  const reading = !file ? (
    <Empty
      icon={Icons.diff}
      title="Changed file not found"
      detail="This commit does not change this file."
      actionLabel={webUrl ? 'Open commit' : undefined}
      onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
    />
  ) : isPicture ? (
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
        actionLabel={webUrl ? 'Open commit' : undefined}
        onAction={webUrl ? () => void WebBrowser.openBrowserAsync(webUrl) : undefined}
      />
    ) : (
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
          context={`${owner}/${name} · ${shortSha(sha)}`}
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
