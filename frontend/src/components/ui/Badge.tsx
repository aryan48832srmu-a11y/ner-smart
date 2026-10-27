import type { ReactNode } from 'react';

type Tone =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'blue'
  | 'gray'
  | 'violet';

const toneClasses: Record<Tone, string> = {
  green: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-800 border-yellow-500/30',
  orange: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  red: 'bg-red-500/15 text-red-700 border-red-500/30',
  blue: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  gray: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
  violet: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
};

export function toneForRisk(level?: string | number | null): Tone {
  const value = typeof level === 'number' ? level : (level ?? '').toString().toLowerCase();
  if (typeof value === 'number') {
    if (value <= 30) return 'green';
    if (value <= 60) return 'yellow';
    if (value <= 80) return 'orange';
    return 'red';
  }
  if (value.includes('critical')) return 'red';
  if (value.includes('high')) return 'orange';
  if (value.includes('medium')) return 'yellow';
  if (value.includes('low')) return 'green';
  if (value === 'active') return 'red';
  return 'gray';
}

export function toneForSeverity(severity?: string): Tone {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical':
      return 'red';
    case 'high':
      return 'orange';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'green';
    case 'normal':
      return 'blue';
    default:
      return 'gray';
  }
}

export function Badge({
  children,
  tone = 'gray',
  className = '',
  pulse,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${toneClasses[tone]} ${className}`}
    >
      {pulse && <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75"></span>
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current"></span>
      </span>}
      {children}
    </span>
  );
}

export { toneClasses };
