export function ProgressBar({
  value,
  tone = 'blue',
  label,
  className = '',
}: {
  value: number;
  tone?: 'green' | 'yellow' | 'orange' | 'red' | 'blue';
  label?: string;
  className?: string;
}) {
  const toneCls: Record<string, string> = {
    green: 'bg-emerald-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  };
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">{label}</span>
          <span className="font-semibold text-slate-700">{Math.round(value)}%</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-600/60">
        <div
          className={`h-full rounded-full ${toneCls[tone] ?? toneCls.blue} transition-all duration-500`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
