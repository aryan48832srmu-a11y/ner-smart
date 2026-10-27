import { useApi } from '../../hooks/useApi';
import { api } from '../../services/api';
import { Modal } from '../ui/Modal';
import { Badge, toneForRisk } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Loading';
import { roadStatusMeta, formatTimeAgo } from '../../utils/format';
import { Clock, Route, ShieldAlert } from 'lucide-react';
import type { Road, DisruptionForecast } from '../../types';

interface RoadDetailsProps {
  road: Road | null;
  onClose: () => void;
}

function RiskBar({ label, value }: { label: string; value: number }) {
  return <ProgressBar value={value} tone={value > 80 ? 'red' : value > 60 ? 'orange' : value > 30 ? 'yellow' : 'green'} label={label} />;
}

export function RoadDetails({ road, onClose }: RoadDetailsProps) {
  const forecast = useApi<DisruptionForecast | null>(
    () => (road ? api.forecast(road.id) : Promise.resolve(null)),
    null,
    [road?.id],
  );

  if (!road) return null;
  const meta = roadStatusMeta[road.status] ?? roadStatusMeta.risky;

  return (
    <Modal open onClose={onClose} title="Road Details" subtitle={road.name} size="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{road.name}</h3>
            <p className="text-xs text-slate-400">
              {road.from_} → {road.to} · {road.state}
            </p>
          </div>
          <Badge tone={toneForRisk(road.status === 'accessible' ? 'low' : road.status === 'risky' ? 'medium' : road.status === 'severely_risky' ? 'high' : 'critical')}>
            {meta.label}
          </Badge>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{ borderColor: `${meta.color}40`, backgroundColor: `${meta.color}12` }}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Accessibility</span>
            <span className="font-bold" style={{ color: meta.color }}>{road.accessibility}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/30">
            <div className="h-full rounded-full" style={{ width: `${road.accessibility}%`, background: meta.color }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line bg-base-900 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Route className="h-3.5 w-3.5" /> Distance</div>
            <p className="mt-1 text-lg font-bold text-slate-900">{road.length_km} km</p>
          </div>
          <div className="rounded-lg border border-line bg-base-900 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" /> Est. Time</div>
            <p className="mt-1 text-lg font-bold text-slate-900">{road.estimated_hours} hr</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-base-900 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Risk Profile
          </div>
          <RiskBar label="Weather Risk" value={(() => ({ Low: 15, Medium: 45, High: 70, Critical: 90 })[road.weather_risk] ?? 45)()} />
          <RiskBar label="Landslide Risk" value={road.landslide_risk} />
          <RiskBar label="Disruption Probability" value={road.disruption_probability} />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Last Updated: {formatTimeAgo(road.updated_minutes_ago)}</span>
          <span className={road.alternative_available ? 'text-emerald-400' : 'text-red-400'}>
            {road.alternative_available ? 'â— Alternative Route Available' : 'â— No Alternative'}
          </span>
        </div>

        {road.factors.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Risk Factors</p>
            <div className="flex flex-wrap gap-1.5">
              {road.factors.map((f, i) => (
                <span key={i} className="rounded-full border border-line bg-base-700 px-2 py-0.5 text-[11px] text-slate-600">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-violet-600">
            AI 12-HOUR DISRUPTION FORECAST
          </p>
          {forecast.loading ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-400"><Spinner className="h-4 w-4" /> Predicting…</div>
          ) : forecast.data ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <Badge tone={toneForRisk(forecast.data.current_level)}>Current: {forecast.data.current_level}</Badge>
                <span className="text-slate-9000">→</span>
                <Badge tone={toneForRisk(forecast.data.next_12h_level)}>Next 12h: {forecast.data.next_12h_level}</Badge>
              </div>
              <div className="text-sm text-slate-600">
                Probability: <span className="font-bold text-slate-900">{forecast.data.probability}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {forecast.data.factors.map((fa, i) => (
                  <span key={i} className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[11px] text-violet-600">+ {fa}</span>
                ))}
              </div>
              <p className="text-[10px] text-slate-9000">{forecast.data.disclaimer}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Forecast unavailable — backend offline.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
