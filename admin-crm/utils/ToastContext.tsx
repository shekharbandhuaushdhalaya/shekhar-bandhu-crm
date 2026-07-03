import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Toast, ToastType } from '../components/Toast';

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'info',
    visible: false,
  });

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    // Hide current toast first if there is one to force animation restart
    setToast(prev => ({ ...prev, visible: false }));
    
    // Tiny delay to allow state to settle
    setTimeout(() => {
      setToast({ message, type, visible: true });
    }, 50);
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={hideToast}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
