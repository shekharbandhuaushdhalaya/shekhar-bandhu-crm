import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ConfirmDialog, ConfirmDialogProps } from '../components/ConfirmDialog';

type ConfirmOptions = Omit<ConfirmDialogProps, 'visible' | 'onConfirm' | 'onCancel'>;

interface ConfirmContextType {
  confirm: (options: ConfirmOptions & { onConfirm: () => void; onCancel?: () => void }) => void;
  closeConfirm: () => void;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<(ConfirmOptions & { onConfirm: () => void; onCancel?: () => void }) | null>(null);

  const confirm = (options: ConfirmOptions & { onConfirm: () => void; onCancel?: () => void }) => {
    setConfig(options);
  };

  const closeConfirm = () => {
    setConfig(null);
  };

  const handleConfirm = () => {
    if (config?.onConfirm) {
      config.onConfirm();
    }
    closeConfirm();
  };

  const handleCancel = () => {
    if (config?.onCancel) {
      config.onCancel();
    }
    closeConfirm();
  };

  return (
    <ConfirmContext.Provider value={{ confirm, closeConfirm }}>
      {children}
      {config && (
        <ConfirmDialog
          visible={true}
          title={config.title}
          description={config.description}
          confirmLabel={config.confirmLabel}
          cancelLabel={config.cancelLabel}
          destructive={config.destructive}
          loading={config.loading}
          iconName={config.iconName}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
};
