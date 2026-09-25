/** Optional navigation experiments remembered between launches. */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { loadPreferences, savePreferences } from '../storage/preferences';

interface NavigationPreferencesValue {
  splitViewEnabled: boolean;
  setSplitViewEnabled: (enabled: boolean) => void;
}

const NavigationPreferencesContext = createContext<NavigationPreferencesValue | undefined>(
  undefined
);

export function NavigationPreferencesProvider({ children }: { children: ReactNode }) {
  const [splitViewEnabled, setEnabled] = useState(
    () => loadPreferences().splitViewEnabled === true
  );

  const setSplitViewEnabled = useCallback((enabled: boolean) => {
    setEnabled(enabled);
    savePreferences({ splitViewEnabled: enabled });
  }, []);

  const value = useMemo(
    () => ({ splitViewEnabled, setSplitViewEnabled }),
    [setSplitViewEnabled, splitViewEnabled]
  );

  return (
    <NavigationPreferencesContext.Provider value={value}>
      {children}
    </NavigationPreferencesContext.Provider>
  );
}

export function useNavigationPreferences(): NavigationPreferencesValue {
  const value = useContext(NavigationPreferencesContext);
  if (!value) {
    throw new Error(
      'useNavigationPreferences must be used inside <NavigationPreferencesProvider>.'
    );
  }
  return value;
}
