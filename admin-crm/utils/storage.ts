import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return window.sessionStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        window.sessionStorage.setItem(key, value);
      } catch (e) {}
      return;
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        window.sessionStorage.removeItem(key);
      } catch (e) {}
      return;
    }
    return AsyncStorage.removeItem(key);
  }
};
