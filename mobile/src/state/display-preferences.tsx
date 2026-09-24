/**
 * Appearance and readability choices shared by every screen.
 *
 * They are ordinary app preferences rather than secrets, so they live in the synchronous
 * preferences file. Reading them before the first frame prevents a remembered dark theme
 * or text size from flashing through its default on launch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { loadPreferences, savePreferences } from '../storage/preferences';
import { useNativeTextScale } from './native-text-scale';

export type AppearancePreference = 'automatic' | 'dark' | 'light' | 'system';
export type ManualAppearance = 'dark' | 'light';

/** Apex's smallest readability step: compact, but still comfortable on a phone. */
export const SMALLEST_TEXT_SCALE = 0.85;
/** Apex's largest readability step, before compact repository layouts become unwieldy. */
export const LARGEST_TEXT_SCALE = 1.3;
const DEFAULT_TEXT_SCALE = 1;

interface StoredDisplayPreferences {
  appearance: AppearancePreference;
  manualAppearance: ManualAppearance;
  boldText: boolean;
  scale: number;
}

interface DisplayPreferencesValue extends StoredDisplayPreferences {
  scheme: ManualAppearance;
  setAppearance: (appearance: AppearancePreference) => void;
  setBoldText: (boldText: boolean) => void;
  setScale: (scale: number) => void;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesValue | undefined>(undefined);

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preferences, setPreferences] = useState(readPreferences);
  const [automaticScheme, setAutomaticScheme] = useState<ManualAppearance>(automaticAppearance);

  useEffect(() => {
    const timer = setInterval(() => setAutomaticScheme(automaticAppearance()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useNativeTextScale(preferences.scale);

  const update = useCallback((change: Partial<StoredDisplayPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...change };
      savePreferences({
        appearance: next.appearance,
        manualAppearance: next.manualAppearance,
        boldText: next.boldText,
        textScale: next.scale,
      });
      return next;
    });
  }, []);

  const setAppearance = useCallback(
    (appearance: AppearancePreference) => {
      update({
        appearance,
        ...(appearance === 'dark' || appearance === 'light'
          ? { manualAppearance: appearance }
          : null),
      });
    },
    [update]
  );
  const setBoldText = useCallback((boldText: boolean) => update({ boldText }), [update]);
  const setScale = useCallback((scale: number) => update({ scale: clampScale(scale) }), [update]);

  const value = useMemo<DisplayPreferencesValue>(
    () => ({
      ...preferences,
      scheme: resolveScheme(preferences.appearance, automaticScheme, systemScheme),
      setAppearance,
      setBoldText,
      setScale,
    }),
    [automaticScheme, preferences, setAppearance, setBoldText, setScale, systemScheme]
  );

  return (
    <DisplayPreferencesContext.Provider value={value}>
      {children}
    </DisplayPreferencesContext.Provider>
  );
}

export function useDisplayPreferences(): DisplayPreferencesValue {
  const value = useContext(DisplayPreferencesContext);
  if (!value) {
    throw new Error('useDisplayPreferences must be used inside <DisplayPreferencesProvider>.');
  }
  return value;
}

/** The scale alone, for components that only need to draw text. */
export function useTextScale(): number {
  return useDisplayPreferences().scale;
}

/** The scale and setter, for the dedicated size control. */
export function useTextScaleSetting(): Pick<DisplayPreferencesValue, 'scale' | 'setScale'> {
  const { scale, setScale } = useDisplayPreferences();
  return { scale, setScale };
}

function readPreferences(): StoredDisplayPreferences {
  const stored = loadPreferences();
  const appearance = validAppearance(stored.appearance) ? stored.appearance : 'system';
  const manualAppearance =
    stored.manualAppearance === 'dark' || stored.manualAppearance === 'light'
      ? stored.manualAppearance
      : appearance === 'dark' || appearance === 'light'
        ? appearance
        : 'light';

  return {
    appearance,
    manualAppearance,
    boldText: stored.boldText === true,
    scale: clampScale(stored.textScale),
  };
}

function validAppearance(value: unknown): value is AppearancePreference {
  return value === 'automatic' || value === 'dark' || value === 'light' || value === 'system';
}

function clampScale(scale: number | undefined): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return DEFAULT_TEXT_SCALE;
  return Math.min(LARGEST_TEXT_SCALE, Math.max(SMALLEST_TEXT_SCALE, scale));
}

function automaticAppearance(): ManualAppearance {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

function resolveScheme(
  appearance: AppearancePreference,
  automaticScheme: ManualAppearance,
  systemScheme: ReturnType<typeof useSystemColorScheme>
): ManualAppearance {
  if (appearance === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  if (appearance === 'automatic') return automaticScheme;
  return appearance;
}
