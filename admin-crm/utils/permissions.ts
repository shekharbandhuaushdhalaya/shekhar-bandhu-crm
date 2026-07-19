import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export function usePermission() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const fetchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user) {
      setPermissions(null);
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    api.getMyPermissions().then(res => {
      setPermissions(res.permissions);
    }).catch(() => {
      setPermissions([]);
    });
  }, [user]);

  const can = useCallback((perm: string) => {
    if (!permissions) return false;
    if (permissions.includes('*')) return true;
    return permissions.includes(perm);
  }, [permissions]);

  const hasAny = useCallback((...perms: string[]) => {
    if (!permissions) return false;
    if (permissions.includes('*')) return true;
    return perms.some(p => permissions.includes(p));
  }, [permissions]);

  const hasAll = useCallback((...perms: string[]) => {
    if (!permissions) return false;
    if (permissions.includes('*')) return true;
    return perms.every(p => permissions.includes(p));
  }, [permissions]);

  return { permissions, can, hasAny, hasAll };
}
