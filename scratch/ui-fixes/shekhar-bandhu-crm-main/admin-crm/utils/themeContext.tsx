import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors } from '../constants/theme';

type ThemeMode = 'dark' | 'light';

type ThemeContextType = {
  themeMode: ThemeMode;
  colors: typeof LightColors;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  useEffect(() => {
    async function loadTheme() {
      try {
        const storedTheme = await AsyncStorage.getItem('vp_crm_theme');
        if (storedTheme === 'light' || storedTheme === 'dark') {
          setThemeMode(storedTheme);
        }
      } catch (err) {
        console.error('Failed to load theme preference:', err);
      }
    }
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    try {
      const newTheme = themeMode === 'dark' ? 'light' : 'dark';
      setThemeMode(newTheme);
      await AsyncStorage.setItem('vp_crm_theme', newTheme);
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }
  };

  const colors = themeMode === 'dark' ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider value={{ themeMode, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export function useStyles<T extends StyleSheet.NamedStyles<T>>(
  creator: (colors: typeof LightColors) => T
) {
  const { colors } = useTheme();
  return useMemo(() => creator(colors), [colors]);
}
