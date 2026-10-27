import { useState } from 'react';
import { MapPin, Route, Lightbulb } from 'lucide-react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { demoAlerts } from '../data/fallbackData';
import type { Alert } from '../types';
import { Card } from '../components/ui/Card';
import { Badge, toneForSeverity } from '../components/ui/Badge';
import { LoadingBlock } from '../components/ui/Loading';
import { EmptyState } from '../components/ui/EmptyState';
import { riskColorFor, cls } from '../utils/format';
import { useApp } from '../state/AppContext';

const CATEGORIES = ['All', 'Weather', 'Road', 'Flood', 'Landslide', 'Bridge', 'Logistics'];

export function Alerts() {
  const { incidentVersion } = useApp();
  const alerts = useApi<Alert[]>(() => api.alerts(), demoAlerts, [incidentVersion]);
  const [cat, setCat] = useState('All');

  const filtered = cat === 'All' ? alerts.data : alerts.data.filter((a) => a.category === cat);
  const critical = alerts.data.filter((a) => a.severity === 'Critical').length;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Alert Center</h2>
          <p className="text-sm text-slate-400">Weather, road, flood, landslide, bridge and logistics alerts.</p>
        </div>
        <Badge tone="red" pulse>{critical} critical</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cls(
              'rounded-full border px-3 py-2.5 text-xs font-medium transition-colors',
              cat === c ? 'border-accent-500 bg-accent-600/20 text-accent-700' : 'border-line bg-base-800 text-slate-600 hover:bg-base-700',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {alerts.loading ? (
        <LoadingBlock />
      ) : filtered.length === 0 ? (
        <EmptyState title="No alerts" description="No alerts in this category." />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card
              key={a.id}
              padded={false}
              title={
                <div className="flex items-center gap-2">
                  <span className={cls('h-2 w-2 rounded-full', a.severity === 'Critical' ? 'bg-red-500' : a.severity === 'High' ? 'bg-orange-500' : 'bg-yellow-500')} />
                  {a.title}
                </div>
              }
              subtitle={
                <span className="flex items-center gap-2 text-slate-400">
                  <Badge tone={toneForSeverity(a.severity)}>{a.severity}</Badge>
                  <Badge tone="blue">{a.category}</Badge>
                </span>
              }
              className={a.severity === 'Critical' ? 'border-red-500/40' : ''}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {a.location} · {a.state}</span>
                  <span>{a.time}</span>
                </div>
                <p className="text-sm text-slate-600">{a.description}</p>

                {a.affected_routes_count > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Affected:</span>
                    <div className="flex flex-wrap gap-1">
                      {a.affected_routes.map((r, i) => (
                        <span key={i} className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-600"><Route className="h-3 w-3" />{r}</span>
                      ))}
                    </div>
                  </div>
                )}

                {a.predicted_disruption !== undefined && (
                  <div className="text-xs">
                    Predicted disruption: <span className="font-bold" style={{ color: riskColorFor(a.predicted_disruption) }}>{a.predicted_disruption}%</span>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-lg border border-accent-500/30 bg-accent-600/10 p-2.5">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />
                  <p className="text-xs text-slate-700"><span className="font-semibold text-accent-700">Recommended: </span>{a.recommendation}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
