/**
 * A changed picture - what a diff screen shows for an image, which has no lines to diff:
 * the picture as it was and as it is, as GitHub's two-up view puts them, one over the other
 * upright and side by side sideways. An added picture is shown once, a removed one once. An
 * SVG is text as well, so where the site sent its patch it gets a Preview and Diff switch,
 * the diff being the ordinary one.
 *
 * Each side is read at the commit either side of the change (`refs`), through the same
 * `useFilePreview` the code viewer draws with, so a picture already looked at in one place
 * is not fetched again for the other. A renamed file's old side is read at its old path.
 *
 * Which sides there are is the site's word for what happened. A site that says nothing -
 * GitLab has three booleans rather than a status word, and the manifest leaves them
 * unmapped - has both sides asked for, and a side its commit does not have (a 404) is left
 * out rather than shown as a failure. So is the old side of a rename the site gave no old
 * path for, which can only be looked for at the new one.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useFilePreview } from '../api/queries';
import { HostError, type HostProvider } from '../hosts/provider';
import type { ChangedFile } from '../hosts/types';
import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { statusLabel } from './changed-files';
import { DiffView } from './diff';
import { iconForFile } from './file-icons';
import { describeSize, fileView, imageFormat, type Size } from './file-view';
import { ImageView } from './image-view';
import { Legend, ViewSwitch } from './legend';
import { Text } from './scaled-text';
import { Empty, Failed, Loading } from './states';

interface Target {
  provider: HostProvider | undefined;
  owner: string;
  repo: string;
}

/** The commits either side of the change - branch names where a site gives no commits. */
export interface ChangeRefs {
  before?: string;
  after?: string;
}

export function ChangedPicture({
  target,
  file,
  patch,
  refs,
}: {
  target: Target;
  file: ChangedFile;
  /** The text diff, for an SVG's Diff view. */
  patch?: string;
  /** Undefined while the pull request or commit that names them is still arriving. */
  refs?: ChangeRefs;
}) {
  const palette = usePalette();
  const vector = fileView(file.path) === 'svg';
  const [showDiff, setShowDiff] = useState(false);
  const [space, setSpace] = useState<Size>();

  const wantBefore = file.status !== 'added';
  const wantAfter = file.status !== 'removed';
  const before = useFilePreview(
    { ...target, ref: refs?.before },
    file.previousPath ?? file.path,
    wantBefore && !!refs?.before
  );
  const after = useFilePreview(
    { ...target, ref: refs?.after },
    file.path,
    wantAfter && !!refs?.after
  );

  // Where a missing side is an answer rather than a failure: the site gave no status, or
  // gave a rename without saying where from, so the old side was read at the new path.
  const guessing =
    file.status === 'unknown' || (file.status === 'renamed' && file.previousPath === undefined);
  const showBefore = wantBefore && !(guessing && isMissing(before.error));
  const showAfter = wantAfter && !(guessing && isMissing(after.error));

  const diffSwitch =
    vector && patch ? (
      <ViewSwitch labels={['Preview', 'Diff']} second={showDiff} onChange={setShowDiff} />
    ) : undefined;

  if (showDiff && patch) {
    return (
      <>
        <Legend gutters={['old', 'new']} detail={statusLabel(file.status)} trailing={diffSwitch} />
        <DiffView file={{ ...file, patch }} />
      </>
    );
  }

  const both = showBefore && showAfter;
  const sideBySide = !!space && space.width > space.height;

  return (
    <>
      <Legend
        detail={`${imageFormat(file.path)} image · ${statusLabel(file.status)}`}
        trailing={diffSwitch}
      />
      <View
        style={[styles.fill, sideBySide ? styles.row : null]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setSpace({ width, height });
        }}>
        {!showBefore && !showAfter ? (
          <Empty
            icon={iconForFile(file.path)}
            title="Neither version was found"
            detail="The site has this file in the change, but not at either commit it names."
          />
        ) : null}
        {showBefore ? (
          <Side
            label={both ? 'Before' : 'Removed'}
            colour={palette.removed}
            name={file.previousPath ?? file.path}
            vector={vector}
            refKnown={refs === undefined ? undefined : !!refs.before}
            result={before}
            atBottom={sideBySide || !both}
          />
        ) : null}
        {both ? (
          <View
            style={[
              sideBySide ? styles.dividerColumn : styles.dividerRow,
              { backgroundColor: palette.separator },
            ]}
          />
        ) : null}
        {showAfter ? (
          <Side
            label={both || file.status === 'renamed' ? 'After' : 'Added'}
            colour={palette.added}
            name={file.path}
            vector={vector}
            refKnown={refs === undefined ? undefined : !!refs.after}
            result={after}
            atBottom
          />
        ) : null}
      </View>
    </>
  );
}

/** One version of the picture, with a caption saying which, and how big. */
function Side({
  label,
  colour,
  name,
  vector,
  refKnown,
  result,
  atBottom,
}: {
  label: string;
  colour: string;
  name: string;
  vector: boolean;
  /** Undefined while the commits are still being looked up. */
  refKnown: boolean | undefined;
  result: ReturnType<typeof useFilePreview>;
  atBottom: boolean;
}) {
  const [undrawable, setUndrawable] = useState(false);
  const ready = result.data?.kind === 'ready' ? result.data : undefined;
  const icon = iconForFile(name);

  const caption = [
    label,
    ready?.size ? `${Math.round(ready.size.width)} × ${Math.round(ready.size.height)}` : undefined,
    ready ? describeSize(ready.bytes) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const body =
    refKnown === undefined || result.isLoading ? (
      <Loading />
    ) : refKnown === false ? (
      <Empty
        icon={icon}
        title="Not available"
        detail="The site did not say which commit this version is in."
      />
    ) : result.error ? (
      <Failed error={result.error} onRetry={() => void result.refetch()} />
    ) : !result.data ? (
      <Empty
        icon={icon}
        title="Too large to show here"
        detail="The site sent none of this file's contents, which it does when a file is too large."
      />
    ) : result.data.kind === 'lfs' ? (
      <Empty
        icon={icon}
        title="Stored in Git LFS"
        detail="The site serves only the pointer to this file, not the file."
      />
    ) : result.data.kind === 'too-large' ? (
      <Empty
        icon={icon}
        title="Too large to draw here"
        detail={`At ${describeSize(result.data.bytes)}, this is more picture than a phone should hold in memory to draw.`}
      />
    ) : undrawable || !ready ? (
      <Empty
        icon={icon}
        title="Could not draw this picture"
        detail="The file may be damaged, or in a format this phone cannot decode."
      />
    ) : (
      <ImageView
        uri={ready.uri}
        name={`${label}: ${name.split('/').pop() ?? name}`}
        vector={vector}
        size={ready.size}
        opaque={/\.jpe?g$/i.test(name)}
        atBottom={atBottom}
        onError={() => setUndrawable(true)}
      />
    );

  // Green and red as in the diff, with the word beside them, so the colour is never the only
  // thing saying which side is which.
  return (
    <View style={styles.fill}>
      <Text numberOfLines={1} style={[styles.caption, { color: colour }]}>
        {caption}
      </Text>
      {body}
    </View>
  );
}

/** A 404: the commit does not have the file, which for one side of a change is ordinary. */
function isMissing(error: unknown): boolean {
  return error instanceof HostError && error.status === 404;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  caption: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  dividerRow: {
    height: StyleSheet.hairlineWidth,
  },
  dividerColumn: {
    width: StyleSheet.hairlineWidth,
  },
});
