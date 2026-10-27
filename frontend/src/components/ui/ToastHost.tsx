import { CheckCircle2, Info, XCircle, AlertTriangle, X } from 'lucide-react';
import { useApp, type ToastKind } from '../../state/AppContext';

const kindConfig: Record<ToastKind, { icon: typeof Info; cls: string; border: string }> = {
  success: { icon: CheckCircle2, cls: 'text-emerald-400', border: 'border-emerald-500/40' },
  error: { icon: XCircle, cls: 'text-red-400', border: 'border-red-500/40' },
  info: { icon: Info, cls: 'text-blue-400', border: 'border-blue-500/40' },
  warning: { icon: AlertTriangle, cls: 'text-yellow-400', border: 'border-yellow-500/40' },
};

export function ToastHost() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 z-[2000] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {toasts.map((t) => {
        const cfg = kindConfig[t.kind];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border ${cfg.border} bg-base-900/95 px-4 py-3 shadow-xl shadow-black/50 backdrop-blur`}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.cls}`} />
            <div className="min-w-0 flex-1">
              {t.title && <p className="text-sm font-semibold text-slate-800">{t.title}</p>}
              <p className="text-sm text-slate-600">{t.message}</p>
            </div>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 text-slate-9000 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
