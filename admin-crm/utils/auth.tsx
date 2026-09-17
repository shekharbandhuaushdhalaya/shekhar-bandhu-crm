import React, { createContext, useState, useEffect, useContext } from 'react';
import { authStorage } from './storage';
import { api, setApiBaseUrl } from './api';
import { loadFirmDetailsFromStorage, updateActiveFirmDetails } from '../constants/firm';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  canAccessCash?: boolean;
  mfaEnabled?: boolean;
  mustChangePassword?: boolean;
  firmId?: string;
};

type AuthContextType = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: UserProfile } | { mfaRequired: true; mfaToken: string; user: Partial<UserProfile> }>;
  completeMfaLogin: (mfaToken: string, totpCode: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  updateUser: (updatedUser: UserProfile) => Promise<void>;
  switchFirm: (firmId: string) => Promise<void>;
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

        const storedToken = await authStorage.getItem('vp_crm_token');
        const storedUser = await authStorage.getItem('vp_crm_user');

        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          api.setToken(storedToken, parsedUser);
          
          api.getSystemSettings()
            .then((config) => {
              if (config) updateActiveFirmDetails(config);
            })
            .catch((err) => {
              console.error('Failed to refresh firm details on boot:', err);
            });
        }
      } catch (err) {
        console.error('Failed to load auth state:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.login(email, password);

      // MFA required — return mfaToken for the caller to handle step 2
      if (response?.mfaRequired) {
        return { mfaRequired: true as const, mfaToken: response.mfaToken, user: response.user };
      }

      if (!response || !response.token || !response.user) {
        throw new Error('Invalid authentication response');
      }

      await authStorage.setItem('vp_crm_token', response.token);
      if (response.refreshToken) await authStorage.setItem('vp_crm_refresh_token', response.refreshToken);
      await authStorage.setItem('vp_crm_user', JSON.stringify(response.user));

      setToken(response.token);
      setUser(response.user);
      api.setToken(response.token, response.user);
      
      api.getSystemSettings().then(config => {
        if (config) updateActiveFirmDetails(config);
      }).catch(console.error);

      return { user: response.user as UserProfile };
    } catch (err: any) {
      throw err;
    }
  };

  const completeMfaLogin = async (mfaToken: string, totpCode: string): Promise<UserProfile> => {
    const response = await api.verifyMfaLogin(mfaToken, totpCode);
    if (!response?.token || !response?.user) {
      throw new Error('MFA verification failed');
    }
    await authStorage.setItem('vp_crm_token', response.token);
    if (response.refreshToken) await authStorage.setItem('vp_crm_refresh_token', response.refreshToken);
    await authStorage.setItem('vp_crm_user', JSON.stringify(response.user));
    setToken(response.token);
    setUser(response.user);
    api.setToken(response.token, response.user);
    api.getSystemSettings().then(config => {
      if (config) updateActiveFirmDetails(config);
    }).catch(console.error);
    return response.user;
  };

  const logout = async () => {
    try {
      try { const refreshToken = await authStorage.getItem('vp_crm_refresh_token'); await api.logout(refreshToken || undefined); } catch {}
      await authStorage.removeItem('vp_crm_token');
      await authStorage.removeItem('vp_crm_refresh_token');
      await authStorage.removeItem('vp_crm_user');
      setToken(null);
      setUser(null);
      api.setToken(null, null);
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  };

  const switchFirm = async (firmId: string) => {
    const response = await api.switchFirm(firmId);
    if (!response?.token) throw new Error('Unable to switch firm');
    await authStorage.setItem('vp_crm_token', response.token);
    const updated = user ? { ...user, role: response.role, firmId: response.firmId } : user;
    if (updated) { await authStorage.setItem('vp_crm_user', JSON.stringify(updated)); setUser(updated as UserProfile); }
    setToken(response.token); api.setToken(response.token, updated);
    api.clearCache();
    try { const config = await api.getSystemSettings(); if (config) updateActiveFirmDetails(config); } catch {}
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
    <AuthContext.Provider value={{ user, token, loading, login, completeMfaLogin, logout, updateUser, switchFirm }}>
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