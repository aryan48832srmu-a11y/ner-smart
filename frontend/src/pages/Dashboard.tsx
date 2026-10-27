import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Activity,
  Package,
  Gauge,
  CloudRain,
  ShieldAlert,
  MapPin,
  Route,
} from 'lucide-react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import {
  demoDashboard,
  demoRoads,
  demoIncidents,
  demoAlerts,
} from '../data/fallbackData';
import type {
  DashboardSummary,
  Road,
  Incident,
  Alert,
  Weather,
  LogisticsSummary,
  City,
} from '../types';
import { StatCard } from '../components/ui/StatCard';
import { Card } from '../components/ui/Card';
import { Badge, toneForSeverity, toneForRisk } from '../components/ui/Badge';
import { LoadingBlock } from '../components/ui/Loading';
import { EmptyState } from '../components/ui/EmptyState';
import { NERMap } from '../components/map/NERMap';
import { RoadDetails } from '../components/map/RoadDetails';
import { riskColorFor, formatTimeAgo, cls } from '../utils/format';
import { useApp } from '../state/AppContext';

export function Dashboard() {
  const { incidentVersion } = useApp();

  const dash = useApi<DashboardSummary>(() => api.dashboard(), demoDashboard, [incidentVersion]);
  const roads = useApi<Road[]>(() => api.roads(), demoRoads, [incidentVersion]);
  const incidents = useApi<Incident[]>(() => api.incidents(), demoIncidents, [incidentVersion]);
  const weather = useApi<Weather[]>(() => api.weather(), [], []);
  const alerts = useApi<Alert[]>(() => api.alerts(), demoAlerts, [incidentVersion]);
  const logistics = useApi<LogisticsSummary>(() => api.logistics(), { warehouses: [], vehicles: [], requests: [], deliveries_active: 0, critical_destinations: [], hospitals: [], readiness_pct: 0 }, []);
  const cities = useApi<City[]>(
    () => api.meta().then((m) => m.cities),
    [],
    [],
  );

  const [selectedRoad, setSelectedRoad] = useState<Road | null>(null);
  const activeInc = incidents.data;

  const topAlerts = alerts.data.slice(0, 4);
  const riskyRoads = roads.data
    .filter((r) => r.disruption_probability >= 60)
    .sort((a, b) => b.disruption_probability - a.disruption_probability)
    .slice(0, 3);
  const highWeather = weather.data
    .filter((w) => w.alert)
    .slice(0, 3);

  const d = dash.data;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Source indicator */}
      {(dash.source === 'offline' || roads.source === 'offline') && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          Live API unreachable — showing <strong>offline cached data</strong>.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active Disruptions" value={d.active_disruptions} icon={<AlertTriangle className="h-4 w-4" />} tone="red" hint="Active incidents across the region" />
        <StatCard label="Blocked Roads" value={d.blocked_roads} icon={<Ban className="h-4 w-4" />} tone="red" />
        <StatCard label="High Risk Routes" value={d.high_risk_routes} icon={<ShieldAlert className="h-4 w-4" />} tone="orange" />
        <StatCard label="Critical Deliveries" value={d.critical_deliveries} icon={<Package className="h-4 w-4" />} tone="blue" />
        <StatCard label="Avg Accessibility" value={`${d.average_accessibility}%`} icon={<Gauge className="h-4 w-4" />} tone="green" />
        <StatCard label="Weather Alerts" value={d.weather_alerts} icon={<CloudRain className="h-4 w-4" />} tone="yellow" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Map */}
        <Card className="lg:col-span-2" padded={false} title="North Eastern Region — Live Map" subtitle="Road status, incidents and facilities" actions={<Badge tone={toneForRisk(d.overall_risk)}>Regional Risk: {d.overall_risk}</Badge>}>
          {roads.loading ? (
            <LoadingBlock label="Loading map…" />
          ) : (
            <div className="h-[360px] sm:h-[460px] lg:h-[540px]">
              <NERMap
                roads={roads.data}
                incidents={activeInc}
                cities={cities.data}
                warehouses={logistics.data.warehouses}
                hospitals={logistics.data.hospitals}
                selectedRoadId={selectedRoad?.id}
                onRoadClick={setSelectedRoad}
              />
            </div>
          )}
        </Card>

        {/* AI Situation Panel */}
        <Card title="AI Situation Panel" subtitle="Live regional intelligence" padded={false} className="h-fit">
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-base-900 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-600/20 text-accent-400">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Overall Regional Risk</p>
                <p className={cls("text-xl font-extrabold", d.overall_risk === 'HIGH' ? 'text-red-400' : d.overall_risk === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400')}>
                  {d.overall_risk}
                </p>
              </div>
              <Badge tone={toneForRisk(d.overall_risk)} pulse>AI Risk</Badge>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> Critical Alerts
              </p>
              {topAlerts.length === 0 ? (
                <EmptyState title="No critical alerts" description="All clear right now." />
              ) : (
                <div className="space-y-2">
                  {topAlerts.map((a) => (
                    <div key={a.id} className="rounded-lg border border-line bg-base-900 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700">{a.title}</p>
                        <Badge tone={toneForSeverity(a.severity)}>{a.severity}</Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin className="h-3 w-3" /> {a.location} · {a.time}
                      </p>
                      {a.predicted_disruption !== undefined && (
                        <p className="mt-1 text-[11px]" style={{ color: riskColorFor(a.predicted_disruption) }}>
                          Predicted disruption: {a.predicted_disruption}%
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Route className="h-3.5 w-3.5 text-orange-400" /> Top Risky Routes
              </p>
              {riskyRoads.length === 0 ? (
                <EmptyState title="No high-risk routes" />
              ) : (
                <div className="space-y-2">
                  {riskyRoads.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoad(r)}
                      className="flex w-full items-center justify-between rounded-lg border border-line bg-base-900 p-2.5 text-left hover:border-accent-500/50"
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{r.name}</p>
                        <p className="text-[11px] text-slate-400">{r.from_} → {r.to}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: riskColorFor(r.disruption_probability) }}>
                          {r.disruption_probability}%
                        </p>
                        <p className="text-[10px] text-slate-9000">disruption</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <CloudRain className="h-3.5 w-3.5 text-blue-400" /> Weather Warnings
              </p>
              {highWeather.length === 0 ? (
                <p className="text-xs text-slate-9000">No active weather warnings.</p>
              ) : (
                <div className="space-y-1.5">
                  {highWeather.map((w) => (
                    <div key={w.location} className="flex items-center justify-between rounded-lg bg-base-900 px-2.5 py-2 text-[11px]">
                      <span className="text-slate-600">{w.location}</span>
                      <span className="font-semibold text-blue-600">{w.rainfall_mm}mm · {w.condition}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Active Incidents table */}
      <Card title="Active Incidents" subtitle="Field-reported incidents affecting logistics" padded={false} actions={<Badge tone="red">{activeInc.length} active</Badge>}>
        {incidents.loading ? (
          <LoadingBlock label="Loading incidents…" />
        ) : activeInc.length === 0 ? (
          <EmptyState title="No active incidents" description="No field reports are currently active." />
        ) : (
          <>
            {/* Mobile: compact incident cards instead of a squeezed table. */}
            <div className="space-y-2 p-3 md:hidden">
              {activeInc.map((inc) => (
                <div key={inc.id} className="rounded-lg border border-line bg-base-900 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{inc.type}</p>
                      <p className="truncate text-xs text-slate-400">
                        {inc.location_name}
                        {inc.road ? ` · ${inc.road}` : ''}
                      </p>
                    </div>
                    <Badge tone={toneForSeverity(inc.severity)}>{inc.severity}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">{formatTimeAgo(inc.reported_minutes_ago)}</span>
                    <span className="flex items-center gap-2">
                      {inc.ai_risk !== undefined && (
                        <span className="text-slate-500">
                          AI risk{' '}
                          <b style={{ color: riskColorFor(inc.ai_risk) }}>{inc.ai_risk}%</b>
                        </span>
                      )}
                      <Badge tone={inc.status === 'Active' ? 'red' : 'green'} pulse={inc.status === 'Active'}>
                        {inc.status}
                      </Badge>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Incident</th>
                    <th className="px-4 py-2.5">Location</th>
                    <th className="px-4 py-2.5">Severity</th>
                    <th className="px-4 py-2.5">Road</th>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5">AI Risk</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeInc.map((inc) => (
                    <tr key={inc.id} className="border-b border-line/60 hover:bg-base-800/40">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{inc.type}</td>
                      <td className="px-4 py-2.5 text-slate-600">{inc.location_name}</td>
                      <td className="px-4 py-2.5"><Badge tone={toneForSeverity(inc.severity)}>{inc.severity}</Badge></td>
                      <td className="px-4 py-2.5 text-slate-600">{inc.road ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{formatTimeAgo(inc.reported_minutes_ago)}</td>
                      <td className="px-4 py-2.5">
                        {inc.ai_risk !== undefined && (
                          <span className="font-semibold" style={{ color: riskColorFor(inc.ai_risk) }}>{inc.ai_risk}%</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={inc.status === 'Active' ? 'red' : 'green'} pulse={inc.status === 'Active'}>{inc.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <RoadDetails road={selectedRoad} onClose={() => setSelectedRoad(null)} />
    </div>
  );
}
