import { useMemo, useState, useEffect } from 'react';
import { Search, Route, Navigation, Truck, ShieldCheck, ArrowRight, TrendingUp, Clock, MapPin, MapPinned, X } from 'lucide-react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { demoMeta } from '../data/fallbackData';
import type { Meta, RouteOption, RouteOptimizeResult } from '../types';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Loading';
import { PlacePicker, type PickedPlace } from '../components/ui/PlacePicker';
import { NERMap, type MapPinMarker, type RouteLayer } from '../components/map/NERMap';
import { riskColorFor, cls } from '../utils/format';
import { useApp } from '../state/AppContext';

const ROUTE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];

export function RoutePlanner() {
  const meta = useApi<Meta>(() => api.meta(), demoMeta, []);
  const allRoads = useApi<any[]>(() => api.roads(), [], []);
  const { notify } = useApp();

  const [origin, setOrigin] = useState<PickedPlace>({ label: 'Guwahati' });
  const [destination, setDestination] = useState<PickedPlace>({ label: 'Tawang' });
  const [cargoType, setCargoType] = useState('Medicines');
  const [priority, setPriority] = useState('Emergency');
  const [vehicle, setVehicle] = useState('Heavy Truck');

  const [result, setResult] = useState<RouteOptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [pickTarget, setPickTarget] = useState<'origin' | 'destination' | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; ts: number } | null>(null);

  const cities = meta.data.cities;

  // Keep selection on the recommended route whenever a new result loads.
  useEffect(() => {
    if (result?.recommended?.id) {
      setSelectedRouteId(result.recommended.id);
    }
  }, [result]);

  const explore = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedRouteId(null);
    try {
      const res = await api.optimize({
        origin: origin.label.trim(),
        destination: destination.label.trim(),
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        cargo_type: cargoType,
        priority,
        vehicle,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compute routes');
    } finally {
      setLoading(false);
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    if (!pickTarget) return;
    const target = pickTarget;
    let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    try {
      const place = await api.reverseGeocode(lat, lng);
      if (place.label) label = place.label;
    } catch {
      /* fall back to coordinates */
    }
    const picked = { label, lat, lng };
    if (target === 'origin') setOrigin(picked);
    else setDestination(picked);
    setPickTarget(null);
    setFocus({ lat, lng, ts: Date.now() });
    notify(
      `${target === 'origin' ? 'Origin' : 'Destination'} set to ${label}.`,
      'success',
      'Map pin placed',
    );
  };

  const swapEndpoints = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const pins = useMemo<MapPinMarker[]>(() => {
    const resolve = (place: PickedPlace) => {
      if (place.lat !== undefined && place.lng !== undefined) {
        return { lat: place.lat, lng: place.lng };
      }
      const city = cities.find((c) => c.name.toLowerCase() === place.label.trim().toLowerCase());
      return city ? { lat: city.lat, lng: city.lng } : null;
    };
    const list: MapPinMarker[] = [];
    const from = resolve(origin);
    const to = resolve(destination);
    if (from) list.push({ id: 'origin', lat: from.lat, lng: from.lng, label: 'Origin', color: '#3b82f6' });
    if (to) list.push({ id: 'destination', lat: to.lat, lng: to.lng, label: 'Destination', color: '#a855f7' });
    return list;
  }, [origin, destination, cities]);

  const sameEndpoints =
    origin.label.trim().toLowerCase() === destination.label.trim().toLowerCase() &&
    origin.lat === destination.lat &&
    origin.lng === destination.lng;

  const selectedRoute = useMemo(
    () => result?.routes.find((r) => r.id === selectedRouteId) ?? result?.recommended ?? null,
    [result, selectedRouteId],
  );

  const routeLayers = useMemo<RouteLayer[]>(() => {
    if (!result) return [];
    const byName = new Map<string, any>();
    for (const r of allRoads.data) byName.set(r.name, r);
    const layers: RouteLayer[] = result.routes.map((route, i) => {
      const coordinates: [number, number][][] = [];
      for (const seg of route.segments) {
        const road = byName.get(seg.road_name);
        if (road?.coordinates) coordinates.push(road.coordinates);
      }
      return {
        id: route.id,
        label: route.label,
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        coordinates,
      };
    });

    // Draw the estimated off-network approach/departure legs as a grey line.
    const endpoints = result.endpoints;
    if (endpoints) {
      const nodeCoords = (name: string) =>
        cities.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
      const approach: [number, number][][] = [];
      const { origin: o, destination: d } = endpoints;
      if (o.lat !== null && o.lng !== null && o.snap_km > 4) {
        const node = nodeCoords(o.node);
        if (node) approach.push([[o.lat, o.lng], [node.lat, node.lng]]);
      }
      if (d.lat !== null && d.lng !== null && d.snap_km > 4) {
        const node = nodeCoords(d.node);
        if (node) approach.push([[node.lat, node.lng], [d.lat, d.lng]]);
      }
      if (approach.length > 0) {
        layers.push({
          id: '__approach',
          label: 'Off-network approach',
          color: '#94a3b8',
          coordinates: approach,
        });
      }
    }
    return layers;
  }, [result, allRoads.data, cities]);

  const layerColorFor = (id: string) => {
    const idx = result?.routes.findIndex((r) => r.id === id) ?? -1;
    return idx >= 0 ? ROUTE_COLORS[idx % ROUTE_COLORS.length] : '#94a3b8';
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">AI Route Intelligence</h2>
          <p className="text-sm text-slate-400">
            We don't simply find the shortest route — we find the <span className="text-accent-400">safest & most reliable</span> based on accessibility, weather, terrain, incidents and logistics priority.
          </p>
        </div>
        <Badge tone="violet">SIMULATED ROUTE ENGINE</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Inputs */}
        <Card title="Route Parameters" subtitle="Origin, destination and cargo" padded={false} className="relative z-30">
          <div className="space-y-3 p-4">
            <PlacePicker
              label="From"
              value={origin}
              onChange={(place) => {
                setOrigin(place);
                if (place.lat !== undefined && place.lng !== undefined) {
                  setFocus({ lat: place.lat, lng: place.lng, ts: Date.now() });
                }
              }}
              cities={cities}
              picking={pickTarget === 'origin'}
              onPickOnMap={() => setPickTarget(pickTarget === 'origin' ? null : 'origin')}
              onError={(message) => notify(message, 'error', 'Location unavailable')}
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={swapEndpoints}
                title="Swap origin and destination"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-base-700 text-slate-400 hover:text-slate-800"
              >
                <ArrowRight className="h-4 w-4 rotate-90" />
              </button>
            </div>
            <PlacePicker
              label="To"
              value={destination}
              onChange={(place) => {
                setDestination(place);
                if (place.lat !== undefined && place.lng !== undefined) {
                  setFocus({ lat: place.lat, lng: place.lng, ts: Date.now() });
                }
              }}
              cities={cities}
              picking={pickTarget === 'destination'}
              onPickOnMap={() => setPickTarget(pickTarget === 'destination' ? null : 'destination')}
              onError={(message) => notify(message, 'error', 'Location unavailable')}
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Cargo Type</label>
              <select value={cargoType} onChange={(e) => setCargoType(e.target.value)} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
                {meta.data.cargo_types.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
                {meta.data.priorities.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Vehicle</label>
              <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
                {meta.data.vehicle_types.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>

            <button
              onClick={explore}
              disabled={loading || sameEndpoints || !origin.label.trim() || !destination.label.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-50"
            >
              {loading ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              {loading ? 'Finding Safest Route…' : 'Find Safest Route'}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <p className="text-[10px] leading-relaxed text-slate-500">
              Any point on the map works — off-network endpoints are snapped to the nearest NER road
              node and connected with an estimated approach leg.
            </p>
          </div>
        </Card>

        {/* Map */}
        <Card className="lg:col-span-2" padded={false} title="Route Corridor" subtitle={result ? `${origin.label} → ${destination.label} · ${result.cargo_type} / ${result.priority}` : 'Select parameters to visualise'} actions={<Badge tone="violet"><Truck className="h-3 w-3" /> {vehicle}</Badge>}>
          <div className="relative h-[320px] sm:h-[400px]">
            <NERMap
              roads={allRoads.data}
              incidents={[]}
              cities={cities}
              routeLayers={routeLayers}
              selectedRouteId={selectedRoute?.id ?? null}
              pins={pins}
              focus={focus}
              onMapClick={handleMapClick}
              onRoadClick={() => undefined}
            />
            {pickTarget && (
              <div className="absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent-500/50 bg-base-925/95 px-3 py-1.5 text-xs text-slate-700 shadow-lg backdrop-blur">
                <MapPinned className="h-3.5 w-3.5 text-accent-400" />
                Click anywhere on the map to set the <b className="capitalize">{pickTarget}</b>
                <button
                  onClick={() => setPickTarget(null)}
                  className="ml-1 text-slate-400 hover:text-slate-700"
                  title="Cancel map picking"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {result?.endpoints?.warning && (
            <p className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-300">
              {result.endpoints.warning}
            </p>
          )}
          {result && result.routes.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-slate-500">
              {result.routes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRouteId(r.id)}
                  className="flex items-center gap-1.5 font-medium hover:text-slate-700"
                >
                  <span className="h-2 w-4 rounded-full" style={{ background: layerColorFor(r.id) }} />
                  <span className={r.id === selectedRoute?.id ? 'font-bold text-slate-800' : ''}>
                    {r.label.toUpperCase()} {Math.round(r.overall_score)}/100
                  </span>
                </button>
              ))}
              <span className="ml-auto flex items-center gap-1 text-slate-600">
                <MapPin className="h-3 w-3 text-accent-500" />
                Selected: <b className="text-slate-800">{selectedRoute?.label.toUpperCase()}</b>
                · {selectedRoute?.distance_km} km · ETA {selectedRoute?.eta_display}
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* Scoring explanation */}
      {result && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-3" title="Transparent Scoring System" subtitle={result.weights_label} padded={false}>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
              {Object.entries(result.weights).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-base-900 p-2.5 text-center">
                  <p className="text-xl font-bold text-accent-400">{Math.round(v)}%</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{k.replace('_', ' ')}</p>
                </div>
              ))}
            </div>
          </Card>

          {result.routes.map((route) => (
            <div key={route.id} onClick={() => setSelectedRouteId(route.id)} className="cursor-pointer">
              <RouteCard route={route} selected={route.id === selectedRoute?.id} recommended={route.id === result.recommended?.id} />
            </div>
          ))}
        </div>
      )}

      {/* Recommendation */}
      {result?.recommended && (
        <Card title="RECOMMENDED ROUTE" subtitle="AI decision & rationale" className="border-accent-500/40" actions={<Badge tone="green" pulse><ShieldCheck className="h-3 w-3" /> {result.recommended.label}</Badge>}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm text-slate-600">{result.explanation}</p>
              <p className="text-xs text-slate-400">Based on accessibility ({result.recommended.accessibility}%), disruption probability ({result.recommended.disruption_probability}%) and safety score ({result.recommended.safety}%).</p>
            </div>
            <div className="flex items-center gap-4 rounded-lg border border-line bg-base-900 px-4 py-2 text-center sm:text-left">
              <div>
                <p className="text-[10px] text-slate-400">Distance</p>
                <p className="text-lg font-bold text-slate-800">{result.recommended.distance_km} km</p>
              </div>
              <div className="h-8 w-px bg-line" />
              <div>
                <p className="text-[10px] text-slate-400">ETA</p>
                <p className="text-lg font-bold text-slate-800">{result.recommended.eta_display}</p>
              </div>
              <div className="h-8 w-px bg-line" />
              <div>
                <p className="text-[10px] text-slate-400">Safety</p>
                <p className="text-lg font-bold" style={{ color: riskColorFor(100 - result.recommended.safety) }}>{result.recommended.safety}%</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!result && !loading && (
        <Card title="How the AI chooses" padded={false}>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            {[
              { icon: Navigation, title: 'Accessibility first', desc: 'Every road is scored on current accessibility from field reports and road condition.' },
              { icon: TrendingUp, title: 'Risk prediction', desc: 'ML model predicts disruption probability from rainfall, terrain, incidents and history.' },
              { icon: Clock, title: 'Priority-weighted', desc: 'Weights shift for cargo & priority — emergency medicines favour safety and reliability over distance.' },
            ].map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-600/20 text-accent-400"><f.icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{f.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading && (
        <Card title="Finding the Safest Route">
          <div className="flex items-center gap-3 py-6 text-slate-400">
            <Spinner className="h-6 w-6" />
            <p>Scoring {origin.label} → {destination.label} across accessibility, weather, terrain, incidents and logistics priority…</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function RouteCard({ route, selected, recommended }: { route: RouteOption; selected: boolean; recommended: boolean }) {
  const isShortest = route.is_shortest;

  return (
    <Card
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span className={cls('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', selected ? 'bg-accent-600 text-white' : 'bg-base-700 text-slate-600')}>
            {route.label.replace('Route ', '')}
          </span>
          <Route className="h-4 w-4 text-slate-400" />
          <span className="text-slate-800">{route.label.toUpperCase()}</span>
          {isShortest && <Badge tone="blue">Shortest</Badge>}
          {selected && <Badge tone="green" pulse>Viewing</Badge>}
          {recommended && <Badge tone="violet"><ShieldCheck className="h-3 w-3" /> Recommended</Badge>}
        </div>
      }
      subtitle={`${route.distance_km} km · ETA ${route.eta_display}`}
      className={cls(
        'transition-all',
        selected ? 'border-accent-500/60 ring-2 ring-accent-500/40 shadow-lg' : 'border-line hover:border-accent-500/40',
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-base-900 p-3 text-center">
            <p className="text-[10px] uppercase text-slate-400">Overall Score</p>
            <p className="text-3xl font-extrabold" style={{ color: riskColorFor(100 - route.overall_score) }}>{Math.round(route.overall_score)}</p>
            <p className="text-[10px] text-slate-400">/100</p>
          </div>
          <div className="space-y-1.5">
            <Metric label="Accessibility" value={route.accessibility} />
            <Metric label="Disruption Risk" value={route.disruption_probability} invert />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <Row label="Safety" value={`${route.safety}%`} />
          <Row label="Weather Risk" value={route.weather_risk} />
          <Row label="Landslide Risk" value={`${route.landslide_risk}%`} />
          <Row label="Flood Risk" value={`${route.flood_risk}%`} />
          <Row label="Road Condition" value={`${route.road_condition}%`} />
          <Row label="Incident Risk" value={`${route.incident_risk}%`} />
        </div>

        <div>
          <p className="mb-1 text-[10px] uppercase text-slate-400">Corridor</p>
          <div className="flex flex-wrap gap-1">
            {route.segments.map((s, i) => (
              <span key={i} className="rounded bg-base-900 px-1.5 py-0.5 text-[10px] text-slate-600">{s.road_name}</span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  // invert=true means higher value = worse (e.g. disruption risk)
  const goodness = invert ? 100 - value : value;
  const color = goodness > 80 ? '#22c55e' : goodness > 60 ? '#eab308' : goodness > 40 ? '#f97316' : '#ef4444';
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{value}%</span>
      </div>
      <div className="mt-0.5 h-1 w-full rounded-full bg-base-600/50">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line/60 bg-base-900/50 px-2 py-1.5">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}
