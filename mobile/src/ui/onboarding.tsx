/**
 * The one-time introduction and its hand-off into app-lock setup.
 *
 * This is a gate rather than a route for the same reason the app lock is a gate: deep links
 * and restored navigation state must not be able to land on the far side of it. The lock
 * gate is still rendered after this one in the root layout, so an existing lock always wins.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Observe } from 'expo-observe';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { promptBiometrics } from '@/security/biometrics';
import { useAccounts } from '@/state/accounts';
import { useLock } from '@/state/lock';
import { hasSeenIntroduction, rememberIntroduction } from '@/storage/onboarding';
import { Radius, Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { GlassSurface } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { Icons, type AppIcon } from '@/ui/icons';
import { OnboardingPin } from '@/ui/onboarding-pin';
import { Host } from './host';
import { Text } from './scaled-text';

const INTRODUCTION_QUERY = ['introduction', 'v1'] as const;
const LAST_PAGE = 2;

export function OnboardingGate() {
  const palette = usePalette();
  const queryClient = useQueryClient();
  const { isLoading: lockIsLoading, requiresPinSetup } = useLock();
  const { isLoading: accountsAreLoading } = useAccounts();
  const introduction = useQuery({
    queryKey: INTRODUCTION_QUERY,
    queryFn: hasSeenIntroduction,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const startupIsReady = !introduction.isPending && !lockIsLoading && !accountsAreLoading;

  useEffect(() => {
    if (startupIsReady) Observe.markInteractive();
  }, [startupIsReady]);

  const finish = useCallback(async () => {
    await rememberIntroduction();
    queryClient.setQueryData(INTRODUCTION_QUERY, true);
  }, [queryClient]);

  if (!startupIsReady) {
    return (
      <View style={[styles.gate, styles.loading, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (introduction.data === true && !requiresPinSetup) return null;
  return (
    <OnboardingFlow
      initialPage={introduction.data === true ? LAST_PAGE : 0}
      onFinished={finish}
    />
  );
}

function OnboardingFlow({
  initialPage,
  onFinished,
}: {
  initialPage: number;
  onFinished: () => Promise<void>;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { isEnabled, requiresPinSetup, support, enable } = useLock();
  const compact = height < 740;

  const [page, setPage] = useState(initialPage);
  const [scrollX] = useState(() => new Animated.Value(initialPage * width));
  const pager = useRef<ScrollView>(null);
  const [pinSetup, setPinSetup] = useState<{
    useBiometrics: boolean;
    mustComplete: boolean;
  }>();
  const [checking, setChecking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [problem, setProblem] = useState<string>();

  const finishWithoutSetup = useCallback(() => {
    if (requiresPinSetup) {
      setProblem('Create and confirm a six-digit PIN to finish securing Omnigit.');
      return;
    }

    setFinishing(true);
    setProblem(undefined);
    void (async () => {
      try {
        await onFinished();
      } catch {
        setProblem('Could not save this choice. Try again.');
        setFinishing(false);
      }
    })();
  }, [onFinished, requiresPinSetup]);

  const acceptSecurity = useCallback(() => {
    setProblem(undefined);

    if (isEnabled && !requiresPinSetup) {
      finishWithoutSetup();
      return;
    }

    if (!support.available) {
      setPinSetup({ useBiometrics: false, mustComplete: requiresPinSetup });
      return;
    }

    setChecking(true);
    void (async () => {
      const accepted = await promptBiometrics(`Use ${support.label} with Omnigit`);
      setChecking(false);
      if (!accepted) {
        setProblem(
          requiresPinSetup
            ? `${support.label} was not confirmed. Confirm it to continue with PIN setup.`
            : `${support.label} was not confirmed. Try again or choose Not now.`
        );
        return;
      }
      // Once biometrics have been accepted, the fallback PIN is mandatory. There is no
      // path back to a half-configured lock.
      setPinSetup({ useBiometrics: true, mustComplete: true });
    })();
  }, [finishWithoutSetup, isEnabled, requiresPinSetup, support]);

  const completePin = useCallback(
    async (pin: string, useBiometrics: boolean) => {
      // The lock is stored first. The introduction must never be remembered as complete if
      // its promised protection failed to save.
      await enable(pin, useBiometrics);
      await onFinished();
    },
    [enable, onFinished]
  );

  const goToPage = useCallback(
    (requested: number) => {
      const next = Math.max(0, Math.min(LAST_PAGE, requested));
      setPage(next);
      pager.current?.scrollTo({ x: next * width, animated: true });
    },
    [width]
  );

  const settlePage = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.max(0, Math.min(LAST_PAGE, Math.round(event.nativeEvent.contentOffset.x / width))));
    },
    [width]
  );

  const security = securityCopy(isEnabled, requiresPinSetup, support);
  const busy = checking || finishing;

  return (
    <View style={[styles.gate, { backgroundColor: palette.background }]}>
      <StatusBar style="auto" />
      <DecorativeBackdrop />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.brand}>
          <Image
            source={require('../../assets/images/omnigit-icon.png')}
            contentFit="cover"
            style={styles.brandMark}
          />
          <Text style={[styles.wordmark, { color: palette.text }]}>Omnigit</Text>
        </View>
        {page < LAST_PAGE ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip the introduction"
            hitSlop={Spacing.three}
            onPress={() => {
              void Haptics.selectionAsync();
              goToPage(LAST_PAGE);
            }}>
            {({ pressed }) => (
              <Text style={[styles.skip, { color: palette.accent, opacity: pressed ? 0.55 : 1 }]}>
                Skip tour
              </Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </View>

      <Animated.ScrollView
        ref={pager}
        contentOffset={{ x: initialPage * width, y: 0 }}
        horizontal
        pagingEnabled
        snapToInterval={width}
        snapToAlignment="start"
        disableIntervalMomentum
        directionalLockEnabled
        decelerationRate="fast"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.pager}
        onMomentumScrollEnd={settlePage}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}>
        <PagerPage index={0} width={width} scrollX={scrollX} compact={compact}>
          <IntroPage
            visual={<WelcomeVisual compact={compact} />}
            eyebrow="WELCOME TO OMNIGIT"
            title="Your work, beautifully close."
            detail="Repositories, pull requests, issues, and notifications—designed for the moments when your phone is the quickest way in."
            compact={compact}
          />
        </PagerPage>

        <PagerPage index={1} width={width} scrollX={scrollX} compact={compact}>
          <IntroPage
            visual={<WorkVisual compact={compact} />}
            eyebrow="MADE FOR THE MOMENT"
            title="Everything important, in one place."
            detail="Browse code, clear your inbox, and search the account you are using with controls that feel at home on your phone."
            compact={compact}
          />
        </PagerPage>

        <PagerPage index={LAST_PAGE} width={width} scrollX={scrollX} compact={compact}>
          <IntroPage
            visual={<SecurityVisual icon={security.icon} compact={compact} />}
            eyebrow="PRIVATE BY DEFAULT"
            title={security.title}
            detail={security.detail}
            compact={compact}
            problem={problem}
          />
        </PagerPage>
      </Animated.ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.four),
          },
        ]}>
        <Progress page={page} onSelect={goToPage} />

        <View style={styles.actionRow}>
          {page > 0 ? <PageBackButton onPress={() => goToPage(page - 1)} /> : null}
          <OnboardingButton
            label={page < LAST_PAGE ? (page === 0 ? 'Get started' : 'Continue') : security.action}
            onPress={page < LAST_PAGE ? () => goToPage(page + 1) : acceptSecurity}
            busy={page === LAST_PAGE && busy}
            disabled={page === LAST_PAGE && busy}
            inRow
          />
        </View>

        <View style={styles.secondarySlot}>
          {page === LAST_PAGE && !isEnabled && !requiresPinSetup ? (
            <OnboardingButton
              label="Not now"
              variant="secondary"
              onPress={finishWithoutSetup}
              disabled={busy}
            />
          ) : (
            <Text style={[styles.swipeHint, { color: palette.textTertiary }]}>
              {page === 0
                ? 'Swipe to explore'
                : page === 1
                  ? 'Swipe in either direction'
                  : 'App lock can be changed later in Settings'}
            </Text>
          )}
        </View>
      </View>

      {pinSetup ? (
        <View style={[styles.gate, styles.pinOverlay]}>
          <OnboardingPin
            useBiometrics={pinSetup.useBiometrics}
            biometricLabel={support.label}
            allowBack={!pinSetup.mustComplete}
            onBack={() => {
              setProblem(undefined);
              setPinSetup(undefined);
            }}
            onComplete={completePin}
          />
        </View>
      ) : null}
    </View>
  );
}

function IntroPage({
  visual,
  eyebrow,
  title,
  detail,
  compact,
  problem,
}: {
  visual: ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
  compact: boolean;
  problem?: string;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.page, compact && styles.pageCompact]}>
      {visual}
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: palette.accent }]}>{eyebrow}</Text>
        <Text style={[styles.title, compact && styles.titleCompact, { color: palette.text }]}>
          {title}
        </Text>
        <Text style={[styles.detail, { color: palette.textSecondary }]}>{detail}</Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.problem,
            { color: problem ? palette.danger : 'transparent' },
          ]}>
          {problem ?? ' '}
        </Text>
      </View>
    </View>
  );
}

function DecorativeBackdrop() {
  const palette = usePalette();
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <View style={[styles.backdropOrb, styles.backdropOrbStart, { backgroundColor: palette.accentMuted }]} />
      <View
        style={[
          styles.backdropOrb,
          styles.backdropOrbEnd,
          { backgroundColor: palette.hues.purple, opacity: 0.08 },
        ]}
      />
    </View>
  );
}

function PagerPage({
  index,
  width,
  scrollX,
  compact,
  children,
}: {
  index: number;
  width: number;
  scrollX: Animated.Value;
  compact: boolean;
  children: ReactNode;
}) {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.35, 1, 0.35],
    extrapolate: 'clamp',
  });
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.94, 1, 0.94],
    extrapolate: 'clamp',
  });
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: [14, 0, 14],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.pagerPage, { width, opacity, transform: [{ scale }, { translateY }] }]}>
      <ScrollView
        bounces={false}
        scrollsToTop={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.pageScroll, compact && styles.pageScrollCompact]}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

function WelcomeVisual({ compact }: { compact: boolean }) {
  const palette = usePalette();
  const size = compact ? 88 : 104;

  return (
    <Floating>
      <GlassSurface
        radius={Radius.large + Spacing.four}
        style={[styles.welcomePanel, compact && styles.welcomePanelCompact]}>
        <View style={[styles.logoHalo, { backgroundColor: palette.accentMuted }]}>
          <Image
            source={require('../../assets/images/omnigit-icon.png')}
            accessibilityLabel="Omnigit"
            contentFit="cover"
            style={{
              width: size,
              height: size,
              borderRadius: Radius.large,
            }}
          />
        </View>
        <Text style={[styles.visualTitle, { color: palette.text }]}>One app. Every forge.</Text>
        <View style={styles.miniPills}>
          <MiniPill icon={Icons.repositories} label="Repositories" />
          <MiniPill icon={Icons.inbox} label="Inbox" />
        </View>
      </GlassSurface>
    </Floating>
  );
}

function MiniPill({ icon, label }: { icon: AppIcon; label: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.miniPill, { backgroundColor: palette.accentMuted }]}>
      <Host matchContents>
        <Icon name={icon} size={15} />
      </Host>
      <Text style={[styles.miniPillText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

function WorkVisual({ compact }: { compact: boolean }) {
  const palette = usePalette();
  return (
    <Floating distance={compact ? 5 : 8}>
      <GlassSurface
        radius={Radius.large + Spacing.two}
        style={[styles.workPanel, compact && styles.workPanelCompact]}>
        <View style={[styles.workHeader, compact && styles.workHeaderCompact]}>
          <View>
            <Text style={[styles.workEyebrow, { color: palette.textSecondary }]}>YOUR WORK</Text>
            <Text style={[styles.workTitle, { color: palette.text }]}>Ready when you are</Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: palette.accent }]}>
            <Text style={[styles.countText, { color: palette.background }]}>3</Text>
          </View>
        </View>
        <View style={[styles.featureSeparator, { backgroundColor: palette.separator }]} />
        <FeatureCard
          icon={Icons.repositories}
          title="Repositories"
          detail="Branches, code, and changes"
          compact={compact}
        />
        <View style={[styles.featureSeparator, { backgroundColor: palette.separator }]} />
        <FeatureCard
          icon={Icons.inbox}
          title="Inbox"
          detail="What needs your attention"
          compact={compact}
        />
        <View style={[styles.featureSeparator, { backgroundColor: palette.separator }]} />
        <FeatureCard
          icon={Icons.search}
          title="Search"
          detail="Across your active account"
          compact={compact}
        />
      </GlassSurface>
    </Floating>
  );
}

function FeatureCard({
  icon,
  title,
  detail,
  compact,
}: {
  icon: AppIcon;
  title: string;
  detail: string;
  compact: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.featureCard, compact && styles.featureCardCompact]}>
      <View
        style={[
          styles.featureIcon,
          compact && styles.featureIconCompact,
          { backgroundColor: palette.accentMuted },
        ]}>
        <Host matchContents>
          <Icon name={icon} size={25} />
        </Host>
      </View>
      <View style={styles.featureCopy}>
        <Text style={[styles.featureTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.featureDetail, { color: palette.textSecondary }]}>{detail}</Text>
      </View>
      <Host matchContents>
        <Icon name={Icons.chevron} size={15} />
      </Host>
    </View>
  );
}

function SecurityVisual({ icon, compact }: { icon: AppIcon; compact: boolean }) {
  const palette = usePalette();
  const size = compact ? 124 : 144;
  return (
    <Floating>
      <View style={[styles.securityScene, compact && styles.securitySceneCompact]}>
        <View
          style={[
            styles.securityHalo,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: palette.accentMuted,
              borderColor: palette.separator,
            },
          ]}>
          <View
            style={[
              styles.securityMark,
              {
                backgroundColor: palette.surfaceRaised,
                borderColor: palette.separator,
                shadowColor: palette.text,
              },
            ]}>
            <Host matchContents>
              <Icon name={icon} size={compact ? 46 : 54} />
            </Host>
          </View>
        </View>

        <GlassSurface radius={Radius.pill} style={styles.pinPreview}>
          <View style={styles.pinDots}>
            {Array.from({ length: 6 }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.pinDot,
                  {
                    borderColor: palette.textSecondary,
                    backgroundColor: index < 3 ? palette.text : 'transparent',
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.pinPreviewText, { color: palette.textSecondary }]}>PIN fallback</Text>
        </GlassSurface>

        <View style={[styles.privatePill, { backgroundColor: palette.surfaceRaised, borderColor: palette.separator }]}>
          <Host matchContents>
            <Icon name={Icons.lock} size={14} />
          </Host>
          <Text style={[styles.privatePillText, { color: palette.textSecondary }]}>On-device</Text>
        </View>
      </View>
    </Floating>
  );
}

function Floating({ children, distance = 7 }: { children: ReactNode; distance?: number }) {
  const [position] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(position, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(position, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [position]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateY: position.interpolate({
              inputRange: [0, 1],
              outputRange: [distance / 2, -distance / 2],
            }),
          },
        ],
      }}>
      {children}
    </Animated.View>
  );
}

function Progress({ page, onSelect }: { page: number; onSelect: (page: number) => void }) {
  const palette = usePalette();
  return (
    <View accessibilityLabel={`Page ${page + 1} of ${LAST_PAGE + 1}`} style={styles.progress}>
      {Array.from({ length: LAST_PAGE + 1 }, (_, index) => (
        <Pressable
          key={index}
          accessibilityRole="button"
          accessibilityLabel={`Go to introduction page ${index + 1}`}
          accessibilityState={{ selected: index === page }}
          hitSlop={Spacing.two}
          onPress={() => {
            void Haptics.selectionAsync();
            onSelect(index);
          }}>
          {({ pressed }) => (
            <View
              style={[
                styles.progressDot,
                {
                  width: index === page ? 24 : 8,
                  backgroundColor: index === page ? palette.accent : palette.separator,
                  opacity: pressed ? 0.55 : 1,
                },
              ]}
            />
          )}
        </Pressable>
      ))}
    </View>
  );
}

function PageBackButton({ onPress }: { onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Previous introduction page"
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}>
      {({ pressed }) => (
        <View
          style={[
            styles.pageBackButton,
            {
              backgroundColor: palette.surfaceRaised,
              borderColor: palette.separator,
              opacity: pressed ? 0.65 : 1,
            },
          ]}>
          <Host matchContents>
            <Icon name={Icons.back} size={20} />
          </Host>
        </View>
      )}
    </Pressable>
  );
}

function OnboardingButton({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  inRow = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
  inRow?: boolean;
}) {
  const palette = usePalette();
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      style={[styles.buttonPressable, inRow && styles.buttonPressableInRow]}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}>
      {({ pressed }) => (
        <View
          style={[
            styles.button,
            {
              backgroundColor: primary ? palette.accent : palette.surfaceRaised,
              borderColor: primary ? palette.accent : palette.separator,
              opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
            },
          ]}>
          {busy ? (
            <ActivityIndicator color={primary ? palette.background : palette.accent} />
          ) : (
            <Text
              style={[
                styles.buttonLabel,
                { color: primary ? palette.background : palette.accent },
              ]}>
              {label}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

function securityCopy(
  isEnabled: boolean,
  requiresPinSetup: boolean,
  support: ReturnType<typeof useLock>['support']
): { icon: AppIcon; title: string; detail: string; action: string } {
  if (requiresPinSetup) {
    if (support.available) {
      return {
        icon: support.kind === 'face' ? Icons.biometrics : Icons.fingerprint,
        title: 'Finish setting up app lock.',
        detail: `Confirm ${support.label}, then create and confirm the six-digit PIN required as your fallback.`,
        action: `Continue with ${support.label}`,
      };
    }

    return {
      icon: Icons.pin,
      title: 'A PIN is still required.',
      detail:
        'Create and confirm a six-digit PIN before app lock can be considered ready.',
      action: 'Create a PIN',
    };
  }

  if (isEnabled) {
    return {
      icon: Icons.lock,
      title: 'Your app lock is ready.',
      detail:
        'Omnigit is already protected. It locks at launch and whenever you leave the app.',
      action: 'Finish',
    };
  }

  if (support.available) {
    return {
      icon: support.kind === 'face' ? Icons.biometrics : Icons.fingerprint,
      title: `Unlock with ${support.label}.`,
      detail: `Confirm ${support.label} once, then create a six-digit PIN so you always have a way back in.`,
      action: `Use ${support.label}`,
    };
  }

  if (support.absence === 'not-enrolled') {
    return {
      icon: Icons.biometrics,
      title: 'Keep your accounts private.',
      detail:
        "No face or fingerprint is enrolled on this phone yet. Create a PIN now; biometrics can be turned on later in App lock.",
      action: 'Set up a PIN',
    };
  }

  return {
    icon: Icons.pin,
    title: 'Keep your accounts private.',
    detail:
      'Biometrics are not available on this device, but a six-digit PIN can still protect Omnigit whenever you leave it.',
    action: 'Set up a PIN',
  };
}

const styles = StyleSheet.create({
  gate: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  backdropOrb: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
  },
  backdropOrbStart: {
    top: 80,
    left: -210,
    opacity: 0.66,
  },
  backdropOrbEnd: {
    right: -190,
    bottom: 80,
  },
  topBar: {
    minHeight: 58,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: Radius.small,
  },
  wordmark: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  skip: {
    fontSize: 15,
    fontWeight: '600',
  },
  skipPlaceholder: {
    width: 64,
  },
  pager: {
    flex: 1,
  },
  pagerPage: {
    flex: 1,
  },
  pageScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  pageScrollCompact: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  page: {
    alignItems: 'center',
    gap: Spacing.six,
  },
  pageCompact: {
    gap: Spacing.four,
  },
  copy: {
    width: '100%',
    maxWidth: 560,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.35,
    marginBottom: Spacing.three,
  },
  title: {
    maxWidth: 480,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 29,
    lineHeight: 34,
  },
  detail: {
    maxWidth: 520,
    marginTop: Spacing.three,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  problem: {
    minHeight: 20,
    marginTop: Spacing.two,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  welcomePanel: {
    width: 318,
    minHeight: 236,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
  },
  welcomePanelCompact: {
    width: 298,
    minHeight: 204,
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  logoHalo: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    borderRadius: Radius.large + Spacing.three,
  },
  visualTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  miniPills: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  miniPill: {
    minHeight: 32,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  miniPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  workPanel: {
    width: 330,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  workPanelCompact: {
    width: 310,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  workHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.three,
  },
  workHeaderCompact: {
    minHeight: 46,
    paddingBottom: Spacing.two,
  },
  workEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  workTitle: {
    paddingTop: Spacing.one,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  countPill: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  featureSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  featureCard: {
    minHeight: 64,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  featureCardCompact: {
    minHeight: 54,
    paddingVertical: Spacing.one,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconCompact: {
    width: 38,
    height: 38,
  },
  featureCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  featureDetail: {
    fontSize: 13,
    lineHeight: 17,
  },
  securityScene: {
    width: 310,
    height: 220,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Spacing.two,
  },
  securitySceneCompact: {
    height: 190,
  },
  securityHalo: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  securityMark: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 7,
  },
  pinPreview: {
    position: 'absolute',
    bottom: 4,
    minWidth: 236,
    minHeight: 54,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.four,
  },
  pinDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pinDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
  },
  pinPreviewText: {
    fontSize: 12,
    fontWeight: '600',
  },
  privatePill: {
    position: 'absolute',
    top: Spacing.three,
    right: 0,
    minHeight: 30,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  privatePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
    zIndex: 2,
  },
  pinOverlay: {
    zIndex: 10,
  },
  actionRow: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  secondarySlot: {
    width: '100%',
    maxWidth: 560,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeHint: {
    fontSize: 12,
    fontWeight: '500',
  },
  progress: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  progressDot: {
    height: 8,
    borderRadius: Radius.pill,
  },
  pageBackButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  buttonPressable: {
    width: '100%',
    maxWidth: 560,
  },
  buttonPressableInRow: {
    flex: 1,
    width: 0,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
});
