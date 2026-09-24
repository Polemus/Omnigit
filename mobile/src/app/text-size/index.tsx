/** A live preview and seven deliberate text sizes, matching Apex's readability control. */

import { Slider } from '@expo/ui';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LARGEST_TEXT_SCALE,
  SMALLEST_TEXT_SCALE,
  useTextScaleSetting,
} from '@/state/text-scale';
import { Radius, Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { Host } from '@/ui/host';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { Text } from '@/ui/scaled-text';

const TEXT_SCALE_LEVELS = Array.from({ length: 7 }, (_, index) =>
  Number(
    (
      SMALLEST_TEXT_SCALE +
      ((LARGEST_TEXT_SCALE - SMALLEST_TEXT_SCALE) * index) / 6
    ).toFixed(3)
  )
);

export default function TextSizeScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { scale, setScale } = useTextScaleSetting();
  const selectedIndex = closestLevelIndex(scale);

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        <View
          style={[
            styles.sampleCard,
            { backgroundColor: palette.surface, borderColor: palette.separator },
          ]}>
          <View style={[styles.sampleIcon, { backgroundColor: palette.accentMuted }]}>
            <Host matchContents>
              <Icon name={Icons.textSize} size={28} />
            </Host>
          </View>
          <Text style={[styles.sampleTitle, { color: palette.text }]}>Review code comfortably.</Text>
          <Text style={[styles.sampleBody, { color: palette.textSecondary }]}>
            Browse repositories, read notifications, and inspect changes at the size that
            feels right. This preview updates as you move the slider.
          </Text>
          <View style={styles.sampleStats}>
            <View>
              <Text style={[styles.statValue, { color: palette.accent }]}>42</Text>
              <Text style={[styles.statLabel, { color: palette.textSecondary }]}>Repositories</Text>
            </View>
            <View>
              <Text style={[styles.statValue, { color: palette.accent }]}>7</Text>
              <Text style={[styles.statLabel, { color: palette.textSecondary }]}>Unread</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: palette.background,
            paddingBottom: Math.max(insets.bottom, Spacing.three),
          },
        ]}>
        <View
          style={[
            styles.sliderCard,
            { backgroundColor: palette.surface, borderColor: palette.separator },
          ]}>
          <Text style={[styles.smallA, { color: palette.text }]}>A</Text>
          <View style={styles.sliderFrame}>
            <View style={styles.ticks} pointerEvents="none">
              {TEXT_SCALE_LEVELS.map((level, index) => (
                <View
                  key={level}
                  style={[
                    styles.tick,
                    {
                      backgroundColor:
                        index <= selectedIndex ? palette.accent : palette.separator,
                    },
                  ]}
                />
              ))}
            </View>
            <Host matchContents={{ vertical: true }} style={styles.sliderHost}>
              <Slider
                value={selectedIndex}
                min={0}
                max={TEXT_SCALE_LEVELS.length - 1}
                step={1}
                onValueChange={(index) => setScale(TEXT_SCALE_LEVELS[Math.round(index)])}
              />
            </Host>
          </View>
          <Text style={[styles.largeA, { color: palette.text }]}>A</Text>
        </View>
      </View>
    </View>
  );
}

function closestLevelIndex(value: number): number {
  return TEXT_SCALE_LEVELS.reduce(
    (closest, level, index) =>
      Math.abs(level - value) < Math.abs(TEXT_SCALE_LEVELS[closest] - value) ? index : closest,
    0
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.three,
  },
  sampleCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sampleIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  sampleTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sampleBody: {
    fontSize: 15,
    lineHeight: 23,
  },
  sampleStats: {
    paddingTop: Spacing.two,
    flexDirection: 'row',
    gap: Spacing.five,
  },
  statValue: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 16,
  },
  footer: {
    width: '100%',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  sliderCard: {
    width: '100%',
    maxWidth: 760,
    minHeight: 82,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 21,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sliderFrame: {
    minWidth: 0,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  sliderHost: {
    alignSelf: 'stretch',
  },
  ticks: {
    position: 'absolute',
    left: 15,
    right: 15,
    top: '50%',
    transform: [{ translateY: -3 }],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tick: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  smallA: {
    width: 28,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  largeA: {
    width: 28,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
});
