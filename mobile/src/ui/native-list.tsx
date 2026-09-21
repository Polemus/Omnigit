/**
 * The list every screen uses.
 *
 * `List` is a SwiftUI `List` on iOS and a Compose `LazyColumn` on Android, which is where
 * the separators, the row press states, the scroll physics and the pull-to-refresh
 * spinner come from - all of it the platform's, none of it ours. It has to sit inside a
 * `Host`, which is the bridge from the React Native view tree into the native one.
 *
 * Paging is a row rather than an `onEndReached`: the native list takes its children from
 * React, so there is no scroll callback to hang loading off. A "Load more" row is also
 * the honest interface on a phone, where an infinite list is easy to fall into and hard
 * to get out of.
 */

import { Host, List } from '@expo/ui';
import { StyleSheet, View } from 'react-native';

import { ListItem } from './list-item';
import { useTabBarClearance } from './screen';


interface NativeListProps {
  children: React.ReactNode;
  /** Wired to the platform's own refresh control when given. */
  onRefresh?: () => Promise<unknown>;
  /** Shown above the list, outside it - a failure strip, a segmented control. */
  header?: React.ReactNode;
  /**
   * Set on a list that is not inside the tabs, so it needs no room for the tab bar.
   * Detail screens push over the tabs, so the bar is not there to scroll clear of.
   */
  insideTabs?: boolean;
}

export function NativeList({ children, onRefresh, header, insideTabs = true }: NativeListProps) {
  // Ends the list above the floating tab bar instead of under it. Scrolling under the
  // glass looks better, but only until the last row turns out to be untappable.
  const clearance = useTabBarClearance();

  return (
    <View style={styles.fill}>
      {header}
      <Host style={[styles.fill, insideTabs ? { paddingBottom: clearance } : null]}>
        <List
          onRefresh={
            onRefresh
              ? async () => {
                  await onRefresh();
                }
              : undefined
          }>
          {children}
        </List>
      </Host>
    </View>
  );
}

/**
 * The last row of a paged list.
 *
 * Renders nothing when there is nothing more, so a finished list simply ends rather than
 * trailing a disabled button.
 */
export function LoadMoreRow({
  hasMore,
  isLoading,
  onPress,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onPress: () => void;
}) {
  if (!hasMore) return null;

  return (
    <ListItem onPress={isLoading ? undefined : onPress}>
      {isLoading ? 'Loading…' : 'Load more'}
    </ListItem>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
