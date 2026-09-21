/**
 * The screens that are not a list: nothing here, still loading, something went wrong.
 *
 * These get as much care as the lists because on a phone they are what people actually
 * hit - a repository with no open issues, a site that is down, a tunnel with no signal.
 * Each says what happened and, where there is one, offers the next move.
 */

import { Host, Button } from '@expo/ui';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { HostError } from '../hosts/provider';
import { Radius, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { GlassSurface } from './glass';
import { Icon } from './icon';
import { Icons, type IconName } from './icons';

export function Centred({ children }: { children: React.ReactNode }) {
  return <View style={styles.centre}>{children}</View>;
}

export function Loading({ label }: { label?: string }) {
  const palette = usePalette();
  return (
    <Centred>
      <ActivityIndicator color={palette.textSecondary} />
      {label ? <Text style={[styles.body, { color: palette.textSecondary }]}>{label}</Text> : null}
    </Centred>
  );
}

/**
 * Nothing to show, said in a sentence rather than with a shrug.
 *
 * Modelled on SwiftUI's `ContentUnavailableView`: an icon, a title, a line of
 * explanation, and at most one action.
 */
export function Empty({
  icon = Icons.empty,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = usePalette();

  return (
    <Centred>
      <Host matchContents style={styles.icon}>
        <Icon name={icon} size={44} />
      </Host>
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      {detail ? (
        <Text style={[styles.body, { color: palette.textSecondary }]}>{detail}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Host matchContents style={styles.action}>
          {/* `label`, not children: a Button's children go straight into a SwiftUI or
              Compose tree that cannot render a bare string, and the fallback renders
              them unwrapped. Children are for element content only. */}
          <Button variant="filled" label={actionLabel} onPress={onAction} />
        </Host>
      ) : null}
    </Centred>
  );
}

/**
 * A failure, with the site's own words where it gave any.
 *
 * An expired token gets "Sign in again" rather than "Try again", because retrying a 401
 * produces another 401 and the button that does nothing is the one people press twice.
 */
export function Failed({
  error,
  onRetry,
  onSignIn,
}: {
  error: unknown;
  onRetry?: () => void;
  onSignIn?: () => void;
}) {
  const authFailure = error instanceof HostError && error.isAuthFailure;
  const message = error instanceof Error ? error.message : 'Something went wrong.';

  if (authFailure && onSignIn) {
    return (
      <Empty
        icon={Icons.token}
        title="That token no longer works"
        detail={message}
        actionLabel="Sign in again"
        onAction={onSignIn}
      />
    );
  }

  return (
    <Empty
      icon={Icons.offline}
      title="Could not load this"
      detail={message}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

/**
 * One site out of several failed, shown above a list that still has the others in it.
 *
 * Deliberately a strip rather than a whole error screen: three sites answering and one
 * not is mostly a working list, and replacing it with an error would hide what did load.
 */
export function PartialFailures({
  failures,
}: {
  failures: { account: string; message: string }[];
}) {
  const palette = usePalette();
  if (failures.length === 0) return null;

  // Glass because it sits over a list that is otherwise fine. On iOS 26 it reads as a
  // note laid on top of the content rather than a band cut out of it; elsewhere
  // `GlassSurface` falls back to a tinted, bordered surface that says the same thing.
  return (
    <GlassSurface variant="clear" radius={Radius.medium} style={styles.strip}>
      <Host matchContents>
        <Icon name={Icons.warning} size={15} />
      </Host>
      <Text style={[styles.stripText, { color: palette.textSecondary }]} numberOfLines={2}>
        {failures.length === 1
          ? `${hostOf(failures[0].account)} did not answer. ${failures[0].message}`
          : `${failures.length} sites did not answer.`}
      </Text>
    </GlassSurface>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.six,
    gap: Spacing.two,
  },
  icon: {
    marginBottom: Spacing.two,
  },
  action: {
    marginTop: Spacing.three,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stripText: {
    flex: 1,
    fontSize: 12,
  },
});
