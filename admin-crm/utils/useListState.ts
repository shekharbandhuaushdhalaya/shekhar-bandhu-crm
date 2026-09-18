import { useState, useCallback, useRef } from 'react';

const stateStore = new Map<string, any>();

/**
 * A hook that preserves state in memory across screen navigations.
 * Useful for preserving search, filters, and pagination when unmounting/remounting screens.
 */
export function useListState<T>(key: string, initialState: T): [T, (val: T | ((prev: T) => T)) => void] {
  const isInitialized = useRef(false);
  
  const [state, setState] = useState<T>(() => {
    if (stateStore.has(key)) {
      return stateStore.get(key) as T;
    }
    stateStore.set(key, initialState);
    return initialState;
  });

  const setGlobalState = useCallback((val: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof val === 'function' ? (val as Function)(prev) : val;
      stateStore.set(key, next);
      return next;
    });
  }, [key]);

  return [state, setGlobalState];
}
