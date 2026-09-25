/** The optional native iOS Split View shell. */

import { Slot, useRouter } from 'expo-router';
import { SplitView } from 'expo-router/unstable-split-view';
import { useCallback, useRef } from 'react';
import type { SplitHostCommands } from 'react-native-screens/experimental';

import { useNavigationPreferences } from '../state/navigation-preferences';
import { useScheme } from '../theme/use-palette';
import { SplitSidebar, type SplitDestination } from './split-sidebar';

export function AppNavigation() {
  const router = useRouter();
  const scheme = useScheme();
  const { splitViewEnabled } = useNavigationPreferences();
  const splitView = useRef<SplitHostCommands>(null);

  const open = useCallback(
    (destination: SplitDestination) => {
      // Sidebar destinations behave like tabs: changing section should not build a chain
      // of Repositories -> Inbox -> Search entries for Back to unwind.
      router.replace(destination);
      splitView.current?.show('secondary');
    },
    [router]
  );

  if (!splitViewEnabled) return <Slot />;

  return (
    <SplitView
      ref={splitView}
      colorScheme={scheme}
      columnMetrics={{
        minimumPrimaryColumnWidth: 260,
        maximumPrimaryColumnWidth: 360,
        preferredPrimaryColumnWidthOrFraction: 0.28,
      }}
      displayModeButtonVisibility="automatic"
      preferredDisplayMode="oneBesideSecondary"
      preferredSplitBehavior="tile"
      presentsWithGesture
      primaryBackgroundStyle="sidebar"
      showSecondaryToggleButton
      topColumnForCollapsing="secondary">
      <SplitView.Column>
        <SplitSidebar onSelect={open} />
      </SplitView.Column>
    </SplitView>
  );
}
