export function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

export function formatHours(hours: number): string {
  const hh = Math.floor(hours);
  const mm = Math.round((hours - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2, '0')}m`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-IN');
}

export function riskColorFor(prob: number): string {
  if (prob <= 30) return '#22c55e';
  if (prob <= 60) return '#eab308';
  if (prob <= 80) return '#f97316';
  return '#ef4444';
}

export interface RoadStatusMeta {
  label: string;
  color: string;
  text: string;
  bg: string;
}

export const roadStatusMeta: Record<string, RoadStatusMeta> = {
  accessible: { label: 'Accessible', color: '#22c55e', text: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  risky: { label: 'Risky', color: '#eab308', text: 'text-yellow-300', bg: 'bg-yellow-500/15' },
  severely_risky: { label: 'Severely Risky', color: '#f97316', text: 'text-orange-300', bg: 'bg-orange-500/15' },
  blocked: { label: 'Blocked', color: '#ef4444', text: 'text-red-300', bg: 'bg-red-500/15' },
};

export function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
