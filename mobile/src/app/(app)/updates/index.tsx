/**
 * Over-the-air updates: what is running, whether there is anything newer, and installing it.
 *
 * A modal off Settings, in the same native grouped structure as Add an account and View
 * account, because it is the same kind of thing - a short errand you finish and dismiss,
 * not a place in the app you navigate to.
 *
 * The check is `useUpdateCheck`, shared with the badge on the Settings tab and the dot on
 * the row that opens this screen, so the three cannot disagree and arriving here does not
 * start a second check of its own. Checking only asks for availability; it does not fetch
 * an update.
 *
 * The download is a mutation and stays a deliberate tap: it spends a phone's data, and the
 * restart that follows throws away whatever was half-typed. Downloading and restarting are
 * two separate choices; the app does neither of them on its own.
 *
 * Query and mutation states are folded into one `phase` rather than read as a handful of
 * booleans, because checking, downloading and ready-to-restart are exclusive - booleans let
 * two of them be true at once, which is how a screen ends up offering Download and Restart
 * in the same breath.
 */

import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { StyleSheet } from 'react-native';

import { useUpdateCheck } from '@/api/updates';
import { usePalette } from '@/theme/use-palette';
import { FieldGroup } from '@/ui/field-group';
import { Host } from '@/ui/host';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { relativeTime } from '@/ui/relative-time';
import { NavigationBarStrip } from '@/ui/screen';
import { Text } from '@/ui/text';
import { describeDay, WHATS_NEW } from '@/whats-new';

/**
 * Where the screen is in the one errand it exists for.
 *
 * `rollback` is its own phase rather than a kind of `available`: a server can ask a build to
 * go *back* to the JavaScript it shipped with, which is how a bad update is undone, and
 * calling that "a newer version" to someone about to tap Download would be a lie.
 */
type Phase =
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; publishedAt: string | undefined }
  | { kind: 'rollback' }
  | { kind: 'downloading' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export default function UpdatesScreen() {
  const palette = usePalette();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  // Pushed within this modal, as Add an account pushes the sign-in form.
  const openWhatsNew = () => router.push('/updates/whats-new');

  const check = useUpdateCheck();

  const install = useMutation({
    mutationFn: () => Updates.fetchUpdateAsync(),
    onSuccess: (result) => {
      // `isNew` is false when the server changed its mind between the check and the fetch -
      // the update was unpublished, or a newer one replaced it. Nothing came down, so there
      // is nothing to restart into and no success to buzz about.
      if (result.isNew || result.isRollBackToEmbedded) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
  });

  if (!Updates.isEnabled) {
    return (
      <>
        <Stack.Screen options={{ title: 'Updates' }} />
        <Host style={styles.fill}>
          <FieldGroup>
            <FieldGroup.Section>
              <ListItem
                leading={<Icon name={Icons.update} size={40} />}
                supportingText="This build does not take over-the-air updates.">
                {`Omnigit ${version}`}
              </ListItem>
            </FieldGroup.Section>

            <FieldGroup.Section title="Why">
              <ListItem
                leading={<Icon name={Icons.warning} size={20} />}
                supportingText="Development builds and Expo Go already run whatever JavaScript is being served to them, so there is nothing to update to.">
                Running from a development build
              </ListItem>
              <FieldGroup.SectionFooter>
                <Text>
                  A release build with an update server configured checks for new JavaScript here.
                </Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>

            {whatsNewSection(openWhatsNew)}

            <BuildSection version={version} />
          </FieldGroup>
        </Host>
        <NavigationBarStrip />
      </>
    );
  }

  const phase = phaseOf(check, install);
  const busy = phase.kind === 'checking' || phase.kind === 'downloading';

  return (
    <>
      <Stack.Screen options={{ title: 'Updates' }} />
      <Host style={styles.fill}>
        <FieldGroup>
          <FieldGroup.Section>
            <ListItem
              leading={<Icon name={headlineIcon(phase)} size={40} />}
              supportingText={headline(phase)}>
              {`Omnigit ${version}`}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title={phase.kind === 'ready' ? 'Ready to install' : 'Update'}>
            {/* One row, doing whatever the phase says should happen next. Two rows - Check
                and Install, one of them always dead - is how a screen ends up asking
                someone to work out which button applies to them. */}
            <ListItem
              onPress={
                busy
                  ? undefined
                  : () => {
                      if (phase.kind === 'available' || phase.kind === 'rollback') {
                        install.mutate();
                      } else if (phase.kind === 'ready') {
                        // No confirmation: getting here took two deliberate taps and the
                        // row says what it costs. `reloadAsync` never resolves - by the
                        // time it would, this app is gone.
                        void Updates.reloadAsync();
                      } else {
                        // Cleared first, or a finished download would keep outranking the
                        // fresh check it is about to make.
                        install.reset();
                        void check.refetch();
                      }
                    }
              }
              leading={<Icon name={actionIcon(phase)} size={20} />}
              supportingText={actionDetail(phase)}>
              {actionLabel(phase)}
            </ListItem>

            {phase.kind === 'failed' ? (
              <ListItem
                leading={<Icon name={Icons.warning} size={20} color={palette.danger} />}
                supportingText={phase.message}>
                What went wrong
              </ListItem>
            ) : null}

            <FieldGroup.SectionFooter>
              <Text>{footer(phase)}</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          {whatsNewSection(openWhatsNew)}

          <BuildSection version={version} />
        </FieldGroup>
      </Host>
      <NavigationBarStrip />
    </>
  );
}

/**
 * The two async states folded into the one thing the screen is doing.
 *
 * The order is the whole content of this function. The download outranks the check, because
 * once someone has tapped Download the check's now-stale "an update is available" would put
 * Download back under their finger while it was already running.
 */
function phaseOf(
  check: ReturnType<typeof useUpdateCheck>,
  install: ReturnType<typeof useMutation<Updates.UpdateFetchResult, Error, void>>
): Phase {
  if (install.isPending) return { kind: 'downloading' };
  if (install.isError) return { kind: 'failed', message: messageOf(install.error) };
  if (install.isSuccess) {
    return install.data.isNew || install.data.isRollBackToEmbedded
      ? { kind: 'ready' }
      : { kind: 'current' };
  }

  if (check.isFetching) return { kind: 'checking' };
  if (check.isError) return { kind: 'failed', message: messageOf(check.error) };
  if (!check.data) return { kind: 'checking' };

  if (check.data.isAvailable) {
    return { kind: 'available', publishedAt: publishedAt(check.data.manifest) };
  }
  if (check.data.isRollBackToEmbedded) return { kind: 'rollback' };
  return { kind: 'current' };
}

/**
 * The row that opens What's new, with the newest update's name and day - what the version
 * running now brought, since the notes (`src/whats-new.ts`) ship inside the JavaScript they
 * describe.
 *
 * Called, not rendered as a component: on Android `FieldGroup` tells a section from a row
 * by its element type, and a component that returns a section is drawn as a section inside
 * a section.
 */
function whatsNewSection(onOpen: () => void) {
  const latest = WHATS_NEW[0];
  if (!latest) return null;

  return (
    <FieldGroup.Section title="In this version">
      <ListItem
        onPress={onOpen}
        leading={<Icon name={Icons.sparkles} size={20} />}
        supportingText={`${latest.title} · ${describeDay(latest.date)}`}
        trailing={<Icon name={Icons.chevron} size={16} />}>
        {"What's new"}
      </ListItem>
      <FieldGroup.SectionFooter>
        <Text>
          What the version running now brought. An update that is waiting brings its own notes
          when it is installed.
        </Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}

/**
 * What is actually running, which is the question anyone reporting a bug is really being
 * asked. Shown whether or not updates are on, because a build with them off is exactly the
 * build where someone needs to read these numbers out to somebody else.
 */
function BuildSection({ version }: { version: string }) {
  const built = Updates.createdAt;

  return (
    <FieldGroup.Section title="This build">
      <ListItem leading={<Icon name={Icons.host} size={20} />} supportingText={version}>
        App version
      </ListItem>

      {/* Not the same number as the version above once a native change ships without a
          version bump. An update is only ever offered to a build whose runtime matches it,
          which is what stops new JavaScript landing on a binary that lacks the native code
          it calls. */}
      <ListItem
        leading={<Icon name={Icons.code} size={20} />}
        supportingText={Updates.runtimeVersion ?? 'Not set in this build'}>
        Runtime version
      </ListItem>

      <ListItem
        leading={<Icon name={Icons.branch} size={20} />}
        supportingText={Updates.channel ?? 'No channel · development or unconfigured'}>
        Channel
      </ListItem>

      <ListItem
        leading={<Icon name={Icons.update} size={20} />}
        supportingText={startupUpdatePolicy()}>
        Startup updates
      </ListItem>

      <ListItem
        leading={<Icon name={Icons.commit} size={20} />}
        supportingText={
          Updates.isEmbeddedLaunch
            ? 'The JavaScript this app was built with'
            : `${shortId(Updates.updateId)}${built ? ` · ${relativeTime(built.toISOString())}` : ''}`
        }>
        {Updates.isEmbeddedLaunch ? 'Built in' : 'Downloaded update'}
      </ListItem>

      {/* Only ever true after something went wrong at launch, and then it is the single
          most useful line on the screen. */}
      {Updates.isEmergencyLaunch ? (
        <ListItem
          leading={<Icon name={Icons.warning} size={20} />}
          supportingText={
            Updates.emergencyLaunchReason ?? 'The downloaded update would not start.'
          }>
          Fell back to the built-in version
        </ListItem>
      ) : null}
    </FieldGroup.Section>
  );
}

function headline(phase: Phase): string {
  switch (phase.kind) {
    case 'checking':
      return 'Asking whether there is anything newer…';
    case 'current':
      return 'Up to date. Nothing newer is being served.';
    case 'available':
      return phase.publishedAt
        ? `An update published ${relativeTime(phase.publishedAt)} is waiting.`
        : 'An update is waiting to be downloaded.';
    case 'rollback':
      return 'This version has been withdrawn. The app can return to the one it shipped with.';
    case 'downloading':
      return 'Downloading. Leaving this screen does not stop it.';
    case 'ready':
      return 'Downloaded. It takes effect when the app restarts.';
    case 'failed':
      return 'The update server could not be reached.';
  }
}

function headlineIcon(phase: Phase) {
  switch (phase.kind) {
    case 'current':
      return Icons.check;
    case 'available':
    case 'rollback':
    case 'downloading':
      return Icons.download;
    case 'ready':
      return Icons.restart;
    case 'failed':
      return Icons.warning;
    default:
      return Icons.update;
  }
}

function actionLabel(phase: Phase): string {
  switch (phase.kind) {
    case 'checking':
      return 'Checking…';
    case 'available':
      return 'Download update';
    case 'rollback':
      return 'Return to the built-in version';
    case 'downloading':
      return 'Downloading…';
    case 'ready':
      return 'Restart now';
    default:
      return 'Check for updates';
  }
}

function actionDetail(phase: Phase): string {
  switch (phase.kind) {
    case 'checking':
      return 'Asking the update server.';
    case 'available':
    case 'rollback':
      return 'Downloads over your current connection. Nothing changes until you restart.';
    case 'downloading':
      return 'This can take a moment on a slow connection.';
    case 'ready':
      return 'Closes and reopens the app. Anything half-typed is lost.';
    case 'failed':
      return 'Try again once you are back on a connection.';
    default:
      return 'Asks the update server for newer JavaScript.';
  }
}

function actionIcon(phase: Phase) {
  switch (phase.kind) {
    case 'available':
    case 'rollback':
    case 'downloading':
      return Icons.download;
    case 'ready':
      return Icons.restart;
    default:
      return Icons.refresh;
  }
}

function footer(phase: Phase): string {
  switch (phase.kind) {
    case 'ready':
      return 'Restarting later works too - the update starts the next time the app is opened from cold.';
    case 'available':
    case 'rollback':
      return 'Updates carry JavaScript only. Anything that changes the native app still comes from the store.';
    default:
      return Updates.checkAutomatically === Updates.UpdatesCheckAutomaticallyValue.NEVER
        ? 'Settings can check for the badge, but downloading and restarting happen only when you choose them here.'
        : 'This installed build can still check at startup. A new Android build is required for fully manual updates.';
  }
}

function startupUpdatePolicy(): string {
  switch (Updates.checkAutomatically) {
    case Updates.UpdatesCheckAutomaticallyValue.NEVER:
      return 'Manual only';
    case Updates.UpdatesCheckAutomaticallyValue.ON_ERROR_RECOVERY:
      return 'Automatic only after a failed launch';
    case Updates.UpdatesCheckAutomaticallyValue.WIFI_ONLY:
      return 'Automatic on Wi-Fi';
    case Updates.UpdatesCheckAutomaticallyValue.ON_LOAD:
      return 'Automatic whenever the app opens';
    default:
      return 'Not reported by this build';
  }
}

/**
 * When the waiting update was published, out of a manifest whose shape differs by protocol:
 * the modern one dates itself, the classic one dates its publish. Neither is guaranteed, and
 * a missing date only costs the sentence a clause.
 */
function publishedAt(manifest: Updates.Manifest): string | undefined {
  const candidate = manifest as { createdAt?: string; publishedTime?: string };
  return candidate.createdAt ?? candidate.publishedTime;
}

/** A UUID is unreadable and unrepeatable down a phone line; its first block is neither. */
function shortId(id: string | null): string {
  if (!id) return 'Unknown';
  return id.split('-')[0];
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'The update server could not be reached.';
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
