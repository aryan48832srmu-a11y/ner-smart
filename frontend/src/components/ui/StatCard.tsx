import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: string;
  sub?: string;
  hint?: string;
}

const iconTones: Record<string, string> = {
  red: 'bg-red-500/15 text-red-400',
  orange: 'bg-orange-500/15 text-orange-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  green: 'bg-emerald-500/15 text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-400',
  violet: 'bg-violet-500/15 text-violet-400',
  gray: 'bg-slate-500/15 text-slate-400',
};

export function StatCard({ label, value, icon, tone = 'blue', sub, hint }: StatCardProps) {
  return (
    <div
      className="rounded-xl border border-line bg-base-800/60 p-3.5 hover:border-accent-500/40 transition-colors"
      title={hint}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 leading-none">{value}</p>
          {sub && <p className="mt-1 text-[11px] text-slate-400 truncate">{sub}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconTones[tone] ?? iconTones.blue}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
