import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock3,
  ExternalLink,
  Globe2,
  MapPin,
  Radio,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import type { Incident, LiveIncident, LiveIncidentFeed } from '../../types';
import { Card } from '../ui/Card';
import { Badge, toneForSeverity } from '../ui/Badge';
import { LoadingBlock } from '../ui/Loading';
import { EmptyState } from '../ui/EmptyState';
import { NERMap } from '../map/NERMap';
import { formatTimeAgo } from '../../utils/format';

type Region = 'all' | 'ner' | 'india';
const REGIONS: { id: Region; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ner', label: 'North East India' },
  { id: 'india', label: 'India & neighbours' },
];

/**
 * Real incidents from public alert feeds (GDACS + USGS).
 * No demo / seeded records are shown in this section.
 */
export function LiveIncidents() {
  const [region, setRegion] = useState<Region>('all');
  const [data, setData] = useState<LiveIncidentFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false, force = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setData(await api.liveIncidents(region, force));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Live feeds could not be reached.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [region],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when the tab regains focus and every five minutes while visible.
  const lastUpdate = useAutoRefresh(() => void load(true), 300_000);

  const items = useMemo(() => data?.incidents ?? [], [data]);
  const nerCount = items.filter((i) => i.region === 'NER').length;
  const severeCount = items.filter((i) => i.severity === 'Critical' || i.severity === 'High').length;

  const mapIncidents = useMemo<Incident[]>(
    () =>
      items.map((inc) => ({
        id: inc.id,
        type: inc.type,
        state: inc.state,
        location_name: inc.location_name,
        lat: inc.lat,
        lng: inc.lng,
        severity: inc.severity,
        description: inc.description,
        reported_minutes_ago: inc.reported_minutes_ago,
        status: inc.status,
        is_live: true,
        source: inc.source,
        source_url: inc.source_url,
        title: inc.title,
      })),
    [items],
  );

  const focus = useMemo(() => {
    const first = items.find((i) => i.region === 'NER') ?? items[0];
    return first ? { lat: first.lat, lng: first.lng, ts: Date.now() } : null;
  }, [items]);

  return (
    <Card
      padded={false}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Live Incidents
          <Badge tone="green" pulse><Radio className="h-3 w-3" /> REAL FEEDS</Badge>
        </span>
      }
      subtitle="Actual events from GDACS & USGS public alert feeds — no simulated data"
      actions={
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Connecting…'}
          </span>
          <button
            type="button"
            onClick={() => void load(true, true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md border border-line bg-base-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-60"
            title="Fetch the latest events now"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRegion(r.id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  region === r.id
                    ? 'bg-accent-600 text-white'
                    : 'border border-line bg-base-900 text-slate-400 hover:text-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 rounded-md bg-base-900 px-2 py-1 text-slate-500">
              <Globe2 className="h-3 w-3" /> {items.length} live events
            </span>
            <span className="flex items-center gap-1 rounded-md bg-base-900 px-2 py-1 text-slate-500">
              <MapPin className="h-3 w-3 text-accent-400" /> {nerCount} in NER
            </span>
            <span className="flex items-center gap-1 rounded-md bg-base-900 px-2 py-1 text-slate-500">
              <AlertTriangle className="h-3 w-3 text-red-400" /> {severeCount} high+
            </span>
          </div>
        </div>
        {data && data.sources.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Activity className="h-3 w-3 text-emerald-400" />
            Sources online: <b className="text-slate-600">{data.sources.join(' · ')}</b>
            <span className="text-slate-600">· cached for {Math.round(data.feed_status.cache_ttl_seconds / 60)} min</span>
          </p>
        )}
      </div>

      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {error} <button onClick={() => void load()} className="font-semibold underline">Retry</button>
        </div>
      )}

      {loading && !data ? (
        <LoadingBlock label="Fetching real incidents from public feeds…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No live incidents right now"
          description="The public feeds are quiet for this view. This is real data — nothing is simulated to fill the list."
        />
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
          <div className="h-[320px] border-b border-line lg:col-span-2 lg:h-[520px] lg:border-b-0 lg:border-r">
            <NERMap roads={[]} incidents={mapIncidents} cities={[]} focus={focus} />
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <div className="divide-y divide-line/60">
              {items.map((inc) => (
                <LiveIncidentRow key={inc.id} incident={inc} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function LiveIncidentRow({ incident }: { incident: LiveIncident }) {
  return (
    <div className="px-4 py-3 hover:bg-base-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={incident.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-1 text-sm font-semibold text-slate-700 hover:text-accent-500"
            title="Open the original source"
          >
            <span className="line-clamp-2">{incident.title || incident.type}</span>
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
          </a>
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-400">
            <MapPin className="h-3 w-3 shrink-0" /> {incident.location_name} · {incident.state}
          </p>
        </div>
        <Badge tone={toneForSeverity(incident.severity)}>{incident.severity}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span className="rounded bg-base-900 px-1.5 py-0.5 font-semibold text-slate-400">{incident.source}</span>
        <span className="rounded bg-base-900 px-1.5 py-0.5">{incident.type}</span>
        <span className="flex items-center gap-1">
          <Clock3 className="h-3 w-3" /> {formatTimeAgo(incident.reported_minutes_ago)}
        </span>
        {incident.region === 'NER' && <span className="text-accent-500">North East India</span>}
        {incident.magnitude !== undefined && <span>M {incident.magnitude.toFixed(1)}</span>}
      </div>
    </div>
  );
}
