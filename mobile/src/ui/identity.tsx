/**
 * Who wrote a thing, and which site it came from.
 *
 * The host badge is not decoration. Every list in this app is drawn from several sites at
 * once, so two rows reading `docs` are two different repositories, and the badge is the
 * only thing on the row that says which. The desktop solves the same problem by grouping
 * the picker by host.
 */

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { Account } from '../hosts/types';
import { Radius, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';

export function Avatar({
  url,
  size = 32,
  fallback,
}: {
  url?: string;
  size?: number;
  fallback?: string;
}) {
  const palette = usePalette();
  const radius = size / 2;

  if (!url) {
    return (
      <View
        style={[
          styles.fallback,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: palette.accentMuted,
          },
        ]}>
        <Text style={{ color: palette.accent, fontSize: size * 0.4, fontWeight: '600' }}>
          {(fallback ?? '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: radius }}
      // Avatars repeat on every row of every list, so they are worth keeping on disk
      // rather than refetching each time a screen mounts.
      cachePolicy="memory-disk"
      transition={120}
      contentFit="cover"
    />
  );
}

/**
 * The site an item came from, as a short word.
 *
 * Shows the host name rather than the provider's display name, because self-hosted is the
 * normal case here: three Gitea accounts would otherwise all read "Gitea".
 */
export function HostBadge({ account }: { account: Account }) {
  const palette = usePalette();
  return (
    <View style={[styles.host, { backgroundColor: palette.accentMuted }]}>
      <Text style={[styles.hostText, { color: palette.accent }]} numberOfLines={1}>
        {hostLabel(account)}
      </Text>
    </View>
  );
}

export function hostLabel(account: Account): string {
  try {
    return new URL(account.baseUrl).host.replace(/^www\./, '');
  } catch {
    return account.baseUrl;
  }
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  host: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.small,
    maxWidth: 140,
    // Shrinks before the timestamp and the counts beside it do: a truncated host name is
    // still recognisable, where a missing timestamp is just missing.
    flexShrink: 1,
  },
  hostText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
