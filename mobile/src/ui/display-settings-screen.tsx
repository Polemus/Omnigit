/** Appearance and readability, laid out like Apex's dedicated Display screen. */

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDisplayPreferences } from '../state/display-preferences';
import { Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { AppearanceOptions } from './appearance-options';
import { Host } from './host';
import { Icon } from './icon';
import { Icons, type AppIcon } from './icons';
import { Text } from './scaled-text';

export function DisplaySettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const {
    appearance,
    boldText,
    manualAppearance,
    scale,
    setAppearance,
    setBoldText,
  } = useDisplayPreferences();

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.four },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <SectionLabel>Appearance</SectionLabel>
        <View
          style={[
            styles.card,
            styles.appearanceCard,
            { backgroundColor: palette.surface, borderColor: palette.separator },
          ]}>
          <AppearanceOptions />
          <Divider />
          <ToggleRow
            description="Use light from 06:00–18:00 and dark overnight."
            icon={Icons.automaticAppearance}
            label="Automatic Appearance"
            onChange={(enabled) => setAppearance(enabled ? 'automatic' : manualAppearance)}
            value={appearance === 'automatic'}
          />
          <Divider />
          <ToggleRow
            description="Follow your device's current appearance setting."
            icon={Icons.settings}
            label="Use System Setting"
            onChange={(enabled) => setAppearance(enabled ? 'system' : manualAppearance)}
            value={appearance === 'system'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>Text &amp; readability</SectionLabel>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.separator },
          ]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/text-size')}
            style={({ pressed }) => [styles.textSizeRow, pressed && styles.pressed]}>
            <SettingIcon icon={Icons.textSize} />
            <View style={styles.settingCopy}>
              <Text style={[styles.label, { color: palette.text }]}>Text Size</Text>
              <Text style={[styles.description, { color: palette.textSecondary }]}>
                Preview and choose from seven sizes.
              </Text>
            </View>
            <Text style={[styles.value, { color: palette.accent }]}>
              {Math.round(scale * 100)}%
            </Text>
            <Host matchContents>
              <Icon name={Icons.chevron} size={16} />
            </Host>
          </Pressable>
          <Divider />
          <ToggleRow
            description="Increase text weight throughout Omnigit."
            icon={Icons.boldText}
            label="Bold Text"
            onChange={setBoldText}
            value={boldText}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  description,
  icon,
  label,
  onChange,
  value,
}: {
  description: string;
  icon: AppIcon;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  const palette = usePalette();

  return (
    <View style={styles.toggleRow}>
      <SettingIcon icon={icon} />
      <View style={styles.settingCopy}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.description, { color: palette.textSecondary }]}>{description}</Text>
      </View>
      <View style={styles.switchControl}>
        <Switch
          accessibilityLabel={label}
          ios_backgroundColor={palette.textTertiary}
          onValueChange={onChange}
          trackColor={{ false: palette.textTertiary, true: palette.open }}
          value={value}
        />
      </View>
    </View>
  );
}

function SettingIcon({ icon }: { icon: AppIcon }) {
  return (
    <View style={styles.icon}>
      <Host matchContents>
        <Icon name={icon} size={20} />
      </Host>
    </View>
  );
}

function Divider() {
  const palette = usePalette();
  return <View style={[styles.divider, { backgroundColor: palette.separator }]} />;
}

function SectionLabel({ children }: { children: string }) {
  const palette = usePalette();
  return (
    <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: 11,
  },
  sectionLabel: {
    paddingLeft: 4,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  card: {
    borderWidth: 1,
    borderRadius: 21,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  appearanceCard: {
    padding: 14,
  },
  textSizeRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  toggleRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  settingCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  icon: {
    width: 28,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
  value: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  switchControl: {
    width: 54,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  pressed: {
    opacity: 0.68,
    transform: [{ scale: 0.99 }],
  },
});
