import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ThemeColors } from './colors';

export type ThemeMode = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'mprowave_theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  isDark: true,
  colors: darkColors,
  setMode: () => {},
});

/**
 * Resolves and persists the user's Dark/Light/Auto preference, and reacts
 * live to OS theme changes while in "auto". Wraps the app in src/App.tsx;
 * screens read the resolved palette via useTheme() rather than importing
 * the static `colors` export (which always stays dark, for screens that
 * intentionally never theme-switch, like the auth hero screens).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [systemIsDark, setSystemIsDark] = useState(Appearance.getColorScheme() !== 'light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'dark' || saved === 'light' || saved === 'auto') {
        setModeState(saved);
      }
    });

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemIsDark(colorScheme !== 'light');
    });
    return () => subscription.remove();
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const isDark = mode === 'auto' ? systemIsDark : mode === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark,
      colors: isDark ? darkColors : lightColors,
      setMode,
    }),
    [mode, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
