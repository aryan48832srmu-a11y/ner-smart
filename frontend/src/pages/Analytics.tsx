import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import type { AnalyticsSummary } from '../types';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { LoadingBlock } from '../components/ui/Loading';
import { EmptyState } from '../components/ui/EmptyState';
import { cls } from '../utils/format';

const PIE_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
const BAR_COLORS = ['#3b82f6', '#60a5fa', '#a78bfa', '#f472b6'];

export function Analytics() {
  const analytics = useApi<AnalyticsSummary>(
    () => api.analytics(),
    {
      disruptions_over_time: [],
      state_accessibility: [],
      weather_risk_by_state: [],
      delivery_success_rate: [],
      average_travel_time: [],
      risk_distribution: [],
      incident_types: [],
      critical_supply_requests: [],
      active_incidents: 0,
    },
    [],
  );
  const [stateFilter, setStateFilter] = useState<string>('All');

  const a = analytics.data;
  const states = a.state_accessibility.map((s) => s.state);

  const selectedState = stateFilter === 'All' ? null : a.state_accessibility.find((s) => s.state === stateFilter) ?? null;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Analytics</h2>
          <p className="text-sm text-slate-400">Regional logistics & accessibility intelligence.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setStateFilter('All')} className={cls('rounded-full border px-3 py-2.5 text-xs', stateFilter === 'All' ? 'border-accent-500 bg-accent-600/20 text-accent-700' : 'border-line bg-base-800 text-slate-600')}>All</button>
          {states.map((s) => (
            <button key={s} onClick={() => setStateFilter(s)} className={cls('rounded-full border px-3 py-2.5 text-xs', stateFilter === s ? 'border-accent-500 bg-accent-600/20 text-accent-700' : 'border-line bg-base-800 text-slate-600 hover:bg-base-700')}>{s}</button>
          ))}
        </div>
      </div>

      {analytics.loading ? (
        <LoadingBlock />
      ) : (
        <>
          {selectedState && (
            <Card
              title={`State-wise View — ${selectedState.state}`}
              subtitle="Accessibility, incidents, weather, risk & logistics"
              padded={false}
            >
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
                <StateStat label="Accessibility" value={`${selectedState.accessibility}%`} tone="green" />
                <StateStat label="Active Incidents" value={selectedState.incidents} tone="red" />
                <StateStat label="High Risk Routes" value={selectedState.high_risk_routes} tone="orange" />
                <StateStat label="Deliveries" value={selectedState.deliveries} tone="blue" />
                <StateStat label="Overall Risk" value={selectedState.risk} tone={selectedState.risk === 'High' ? 'red' : selectedState.risk === 'Medium' ? 'yellow' : 'green'} />
              </div>
              <div className="px-4 pb-4">
                <Badge tone="violet">Data source: NER-SMART operational dataset</Badge>
              </div>
            </Card>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Disruptions Over Time" subtitle="Weekly disruption events">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={a.disruptions_over_time}>
                <defs>
                  <linearGradient id="gDisp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4dbe8', borderRadius: 8 }} labelStyle={{ color: '#1f2937' }} itemStyle={{ color: '#dc2626' }} />
                <Area type="monotone" dataKey="value" name="Disruptions" stroke="#ef4444" fill="url(#gDisp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Road Accessibility by State" subtitle="Average accessibility %">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={a.state_accessibility}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                <XAxis dataKey="state" tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#1f2b45" interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4dbe8', borderRadius: 8 }} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
                <Bar dataKey="accessibility" name="Accessibility %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Delivery Success Rate" subtitle="Percentage over the year">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={a.delivery_success_rate}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4dbe8', borderRadius: 8 }} />
                <Line type="monotone" dataKey="value" name="Success %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Average Travel Time" subtitle="Hours by corridor hub">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={a.average_travel_time}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4dbe8', borderRadius: 8 }} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
                <Bar dataKey="value" name="Hours" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Risk Distribution" subtitle="Roads by disruption risk">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={a.risk_distribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3} label>
                  {a.risk_distribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4dbe8', borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Incident Types" subtitle="Distribution by category">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={a.incident_types}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#1f2b45" angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4dbe8', borderRadius: 8 }} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  {a.incident_types.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Weather Risk by State" subtitle="Estimated weather risk score">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={a.weather_risk_by_state}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                <XAxis dataKey="state" tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#1f2b45" interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#1f2b45" />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4dbe8', borderRadius: 8 }} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
                <Bar dataKey="risk" name="Weather Risk" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Critical Supply Requests" subtitle="Pending critical / high priority" padded={false}>
            {a.critical_supply_requests.length === 0 ? (
              <EmptyState title="No critical requests" />
            ) : (
              <div className="space-y-2 p-4">
                {a.critical_supply_requests.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-base-900 p-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.destination}</p>
                      <p className="text-[11px] text-slate-400">{r.cargo} · ETA {r.eta}d</p>
                    </div>
                    <Badge tone={r.priority === 'CRITICAL' ? 'red' : 'orange'} pulse={r.priority === 'CRITICAL'}>{r.priority}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StateStat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  const colors: Record<string, string> = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    orange: 'text-orange-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
  };
  return (
    <div className="rounded-lg border border-line bg-base-900 p-3">
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${colors[tone] ?? 'text-slate-800'}`}>{value}</p>
    </div>
  );
}
