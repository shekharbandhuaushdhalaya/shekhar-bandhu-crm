import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearPortalSession, getPortalToken, getSavedPortalCustomer, portalApi } from '../lib/portal';

const PortalContext = createContext(null);

export function PortalProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getPortalToken();
    const saved = getSavedPortalCustomer();
    if (!token) { setReady(true); return; }
    setCustomer(saved);
    portalApi.me().then((me) => setCustomer(me)).catch(() => {
      clearPortalSession();
      setCustomer(null);
    }).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const out = await portalApi.login(email, password);
    const full = await portalApi.me().catch(() => out.customer);
    setCustomer(full);
    return full;
  }, []);

  const logout = useCallback(() => {
    clearPortalSession();
    setCustomer(null);
  }, []);

  return <PortalContext.Provider value={{ customer, isLoggedIn: !!customer && !!getPortalToken(), ready, login, logout, refresh: async () => setCustomer(await portalApi.me()) }}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}
