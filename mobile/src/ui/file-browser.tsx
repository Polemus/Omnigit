/**
 * Walking a repository's tree, as one grouped section.
 *
 * Rows rather than a list of its own, so it can sit among the repository screen's other
 * sections: a scrolling list inside another scrolling list does not scroll. Every row is
 * a direct `ListItem` child of the section - on Android a section turns each child into
 * one rounded Material row, so a component that returned several rows would render as a
 * single row with the others stacked inside it.
 *
 * Folders still open *in place*, as they did with the breadcrumb, rather than pushing a
 * screen per level: six levels deep is ordinary in a source tree, and six stacked screens
 * is six taps back out. Files push, because a file is a different kind of thing to look at
 * and the back gesture should return to the folder it came from.
 */

import { FieldGroup } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import type { ViewStyle } from 'react-native';

import { useTree } from '../api/queries';
import type { HostProvider } from '../hosts/provider';
import type { TreeEntry } from '../hosts/types';
import { usePalette } from '../theme/use-palette';
import { iconForFile, iconForFolder } from './file-icons';
import { Icon } from './icon';
import { Icons } from './icons';
import { ListItem } from './list-item';
import { languageFor } from './syntax';
import { Text } from './text';

interface Target {
  provider: HostProvider | undefined;
  owner: string;
  repo: string;
  ref?: string;
}

export function FileBrowserSection({
  target,
  onOpenFile,
  style,
}: {
  target: Target;
  onOpenFile: (entry: TreeEntry) => void;
  style?: ViewStyle;
}) {
  const palette = usePalette();
  const [path, setPath] = useState('');
  const { data, isLoading, error, refetch } = useTree(target, path);

  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const entries = data ?? [];

  function open(entry: TreeEntry) {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    if (entry.type === 'dir') setPath(entry.path);
    else onOpenFile(entry);
  }

  function goUp() {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setPath(parent);
  }

  return (
    <FieldGroup.Section title="Files" style={style}>
      {path ? (
        <ListItem
          onPress={goUp}
          leading={<Icon name={Icons.parentFolder} size={20} />}
          supportingText={path}>
          {`Up to ${parent ? parent.split('/').pop() : target.repo}`}
        </ListItem>
      ) : null}

      {isLoading ? (
        <ListItem leading={<Icon name={Icons.refresh} size={20} />}>Loading files…</ListItem>
      ) : null}

      {error ? (
        <ListItem
          onPress={() => void refetch()}
          leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
          supportingText={error instanceof Error ? error.message : 'The files could not be listed.'}
          trailing={<Icon name={Icons.refresh} size={17} />}>
          Try listing the files again
        </ListItem>
      ) : null}

      {!isLoading && !error && entries.length === 0 ? (
        <ListItem
          leading={<Icon name={Icons.empty} size={20} />}
          supportingText="There is nothing in this folder.">
          Empty folder
        </ListItem>
      ) : null}

      {entries.map((entry) => (
        <ListItem
          key={entry.path}
          onPress={() => open(entry)}
          leading={
            <Icon
              name={entry.type === 'dir' ? iconForFolder(entry.name) : iconForFile(entry.name)}
              size={20}
            />
          }
          supportingText={describeEntry(entry)}
          trailing={<Icon name={Icons.chevron} size={16} />}>
          {entry.name}
        </ListItem>
      ))}

      <FieldGroup.SectionFooter>
        <Text>
          {target.ref
            ? `Files on ${target.ref}. Folders open here; files open in the code viewer.`
            : 'Folders open here; files open in the code viewer.'}
        </Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}

/** "Folder", or a file's language and size - whichever of those the site told us. */
function describeEntry(entry: TreeEntry): string {
  if (entry.type === 'dir') return 'Folder';
  const parts = [languageFor(entry.name), describeSize(entry.size)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'File';
}

function describeSize(bytes: number | undefined): string | undefined {
  if (bytes === undefined) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
