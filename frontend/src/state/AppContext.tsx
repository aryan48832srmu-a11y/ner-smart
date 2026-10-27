import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  title?: string;
}

interface AppState {
  toasts: Toast[];
  notify: (message: string, kind?: ToastKind, title?: string) => void;
  dismissToast: (id: number) => void;
  incidentVersion: number;
  bumpIncident: () => void;
}

const AppContext = createContext<AppState | null>(null);

let toastSeq = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [incidentVersion, setIncidentVersion] = useState(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, kind: ToastKind = 'info', title?: string) => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev, { id, message, kind, title }]);
      setTimeout(() => dismissToast(id), 6000);
    },
    [dismissToast],
  );

  const bumpIncident = useCallback(() => setIncidentVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({ toasts, notify, dismissToast, incidentVersion, bumpIncident }),
    [toasts, notify, dismissToast, incidentVersion, bumpIncident],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
