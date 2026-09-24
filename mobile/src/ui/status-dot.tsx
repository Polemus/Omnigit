/** The small status mark used as a trailing accessory outside Android's Compose tree. */

import { View } from 'react-native';

export function StatusDot({ color }: { color: string }) {
  return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
}
