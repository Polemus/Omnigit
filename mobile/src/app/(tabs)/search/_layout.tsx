/** A native stack gives the Search tab a real system navigation search bar. */

import { Stack } from 'expo-router';

export default function SearchStackLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: false, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: '', headerTitle: '' }} />
    </Stack>
  );
}
