/** The Light and Dark previews used by Settings, modelled on Apex's Appearance chooser. */

import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  useDisplayPreferences,
  type ManualAppearance,
} from '../state/display-preferences';
import { Palettes, Radius, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Text } from './scaled-text';

export function AppearanceOptions() {
  const { appearance, setAppearance } = useDisplayPreferences();

  return (
    <View accessibilityRole="radiogroup" style={styles.row}>
      <AppearanceOption
        mode="light"
        selected={appearance === 'light'}
        onPress={() => setAppearance('light')}
      />
      <AppearanceOption
        mode="dark"
        selected={appearance === 'dark'}
        onPress={() => setAppearance('dark')}
      />
    </View>
  );
}

function AppearanceOption({
  mode,
  onPress,
  selected,
}: {
  mode: ManualAppearance;
  onPress: () => void;
  selected: boolean;
}) {
  const palette = usePalette();
  const preview = Palettes[mode];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${mode === 'dark' ? 'Dark' : 'Light'} appearance`}
      accessibilityState={{ checked: selected }}
      onPress={() => {
        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.option, { opacity: pressed ? 0.62 : 1 }]}>
      <View
        style={[
          styles.preview,
          {
            backgroundColor: preview.background,
            borderColor: selected ? palette.accent : preview.separator,
          },
        ]}>
        <View style={styles.previewHeader}>
          <View style={[styles.previewMark, { backgroundColor: preview.accent }]} />
          <View style={[styles.previewHeading, { backgroundColor: preview.text }]} />
        </View>

        <View style={[styles.previewHero, { backgroundColor: preview.accentMuted }]}>
          <View style={[styles.previewHeroMark, { backgroundColor: preview.accent }]} />
          <View style={styles.previewHeroCopy}>
            <View style={[styles.previewStrongLine, { backgroundColor: preview.text }]} />
            <View style={[styles.previewLine, { backgroundColor: preview.textSecondary }]} />
          </View>
        </View>

        {[0, 1].map((row) => (
          <View key={row} style={[styles.previewListRow, { backgroundColor: preview.surface }]}>
            <View style={[styles.previewListIcon, { backgroundColor: preview.accentMuted }]} />
            <View style={[styles.previewListLine, { backgroundColor: preview.textSecondary }]} />
          </View>
        ))}

        <View style={[styles.previewTabs, { backgroundColor: preview.surface }]}>
          <View style={[styles.previewActiveTab, { backgroundColor: preview.accent }]} />
          <View style={[styles.previewTab, { backgroundColor: preview.textTertiary }]} />
          <View style={[styles.previewTab, { backgroundColor: preview.textTertiary }]} />
        </View>
      </View>

      <Text style={[styles.label, { color: palette.text }]}>{mode === 'dark' ? 'Dark' : 'Light'}</Text>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? palette.accent : palette.textTertiary },
        ]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: palette.accent }]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  option: {
    minWidth: 0,
    flex: 1,
    maxWidth: 130,
    alignItems: 'center',
    gap: Spacing.two,
  },
  preview: {
    width: '60%',
    minWidth: 78,
    height: 176,
    borderWidth: 2,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    padding: 6,
    gap: 4,
    overflow: 'hidden',
  },
  previewHeader: {
    minHeight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewMark: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  previewHeading: {
    width: 28,
    height: 4,
    borderRadius: 2,
    opacity: 0.86,
  },
  previewHero: {
    minHeight: 32,
    borderRadius: Radius.small,
    padding: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  previewHeroMark: {
    width: 16,
    height: 16,
    borderRadius: 5,
  },
  previewHeroCopy: {
    flex: 1,
    gap: 4,
  },
  previewStrongLine: {
    width: '70%',
    height: 4,
    borderRadius: 2,
    opacity: 0.9,
  },
  previewLine: {
    width: '92%',
    height: 4,
    borderRadius: 2,
  },
  previewListRow: {
    minHeight: 20,
    borderRadius: Radius.small,
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  previewListIcon: {
    width: 11,
    height: 11,
    borderRadius: 4,
  },
  previewListLine: {
    width: '62%',
    height: 4,
    borderRadius: 2,
  },
  previewTabs: {
    minHeight: 18,
    borderRadius: Radius.small,
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  previewActiveTab: {
    width: 14,
    height: 4,
    borderRadius: 2,
  },
  previewTab: {
    width: 11,
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  radio: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
