import React, { createContext, useState, useEffect, useContext } from 'react';
import { authStorage } from './storage';
import { api, setApiBaseUrl } from './api';
import { loadFirmDetailsFromStorage, updateActiveFirmDetails } from '../constants/firm';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'agent';
  canAccessCash?: boolean;
};

type AuthContextType = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  updateUser: (updatedUser: UserProfile) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load token and user from storage on boot
  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const storedApiUrl = await authStorage.getItem('vp_crm_api_url');
        if (storedApiUrl) {
          setApiBaseUrl(storedApiUrl);
        }

        // Restore last-known firm details immediately (fast, works offline)
        await loadFirmDetailsFromStorage();

        // Then refresh from the live API in the background so QR/signature/
        // bank details are current even if the user never opens Profile
        // and the local cache is empty or stale.
        api.getSystemSettings()
          .then((config) => {
            if (config) updateActiveFirmDetails(config);
          })
          .catch((err) => {
            console.error('Failed to refresh firm details on boot:', err);
          });

        const storedToken = await authStorage.getItem('vp_crm_token');
        const storedUser = await authStorage.getItem('vp_crm_user');

        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          api.setToken(storedToken, parsedUser);
        }
      } catch (err) {
        console.error('Failed to load auth state:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    try {
      const response = await api.login(email, password);
      if (!response || !response.token || !response.user) {
        throw new Error('Invalid authentication response');
      }

      await authStorage.setItem('vp_crm_token', response.token);
      await authStorage.setItem('vp_crm_user', JSON.stringify(response.user));

      setToken(response.token);
      setUser(response.user);
      api.setToken(response.token, response.user);

      return response.user;
    } catch (err: any) {
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authStorage.removeItem('vp_crm_token');
      await authStorage.removeItem('vp_crm_user');
      setToken(null);
      setUser(null);
      api.setToken(null, null);
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  };

  const updateUser = async (updatedUser: UserProfile) => {
    try {
      await authStorage.setItem('vp_crm_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      // Synchronize in API client as well
      api.setToken(token, updatedUser);
    } catch (err) {
      console.error('Failed to update stored user:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};