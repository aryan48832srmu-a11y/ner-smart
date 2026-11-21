import { useMemo, useState } from 'react';
import {
  Search,
  Route as RouteIcon,
  ShieldCheck,
  Zap,
  Ruler,
  ArrowRight,
  Clock,
  MapPin,
  MapPinned,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Radio,
  Truck,
  Navigation,
  Layers3,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { demoMeta } from '../data/fallbackData';
import type { Incident, Meta, PlannedRoute, RoutePlanResult } from '../types';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Loading';
import { PlacePicker, type PickedPlace } from '../components/ui/PlacePicker';
import { NERMap, type MapPinMarker, type RouteLayer } from '../components/map/NERMap';
import { cls } from '../utils/format';
import { useApp } from '../state/AppContext';

const ROUTE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7'];
type Mode = 'safest' | 'fastest' | 'shortest';

const MODES: { id: Mode; label: string; icon: typeof ShieldCheck; hint: string }[] = [
  { id: 'safest', label: 'Safest', icon: ShieldCheck, hint: 'Avoids reported incidents' },
  { id: 'fastest', label: 'Fastest', icon: Zap, hint: 'Minimum travel time' },
  { id: 'shortest', label: 'Shortest', icon: Ruler, hint: 'Minimum distance' },
];

export function RoutePlanner() {
  const { notify } = useApp();
  const meta = useApi<Meta>(() => api.meta(), demoMeta, []);
  const allRoads = useApi<any[]>(() => api.roads(), [], []);
  const incidents = useApi<Incident[]>(() => api.incidents(), [], []);

  const [origin, setOrigin] = useState<PickedPlace>({ label: 'Guwahati' });
  const [destination, setDestination] = useState<PickedPlace>({ label: 'Tawang' });
  const [mode, setMode] = useState<Mode>('safest');
  const [cargoType, setCargoType] = useState('Medicines');
  const [priority, setPriority] = useState('Emergency');
  const [vehicle, setVehicle] = useState('Heavy Truck');
  const [showOptions, setShowOptions] = useState(false);

  const [result, setResult] = useState<RoutePlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [pickTarget, setPickTarget] = useState<'origin' | 'destination' | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const cities = meta.data.cities;

  const resolveEndpoint = async (place: PickedPlace): Promise<PickedPlace> => {
    if (place.lat !== undefined && place.lng !== undefined) return place;
    const label = place.label.trim();
    if (!label) return place;
    try {
      const matches = await api.searchPlaces(label, 3);
      const first = matches.results[0];
      if (first) return { label: first.label, lat: first.lat, lng: first.lng };
    } catch {
      // The backend also geocodes labels; keep the typed text as a fallback.
    }
    return place;
  };

  const plan = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedRouteId(null);
    setShowAllSteps(false);
    try {
      const from = await resolveEndpoint(origin);
      const to = await resolveEndpoint(destination);
      if (from !== origin) setOrigin(from);
      if (to !== destination) setDestination(to);
      const res = await api.planRoute({
        origin: from.label.trim(),
        destination: to.label.trim(),
        origin_lat: from.lat,
        origin_lng: from.lng,
        destination_lat: to.lat,
        destination_lng: to.lng,
        mode,
        cargo_type: cargoType,
        priority,
        vehicle,
      });
      if (res.error) setError(res.error);
      else setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not plan the route. Please try again.');
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
      /* coordinates are a fine fallback */
    }
    const picked = { label, lat, lng };
    if (target === 'origin') setOrigin(picked);
    else setDestination(picked);
    setPickTarget(null);
    setFocus({ lat, lng, ts: Date.now() });
    notify(`${target === 'origin' ? 'Origin' : 'Destination'} set to ${label}.`, 'success', 'Map pin placed');
  };

  const swapEndpoints = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const pins = useMemo<MapPinMarker[]>(() => {
    const from = result?.origin
      ? { lat: result.origin.lat, lng: result.origin.lng }
      : origin.lat !== undefined && origin.lng !== undefined
        ? { lat: origin.lat, lng: origin.lng }
        : cities.find((c) => c.name.toLowerCase() === origin.label.trim().toLowerCase());
    const to = result?.destination
      ? { lat: result.destination.lat, lng: result.destination.lng }
      : destination.lat !== undefined && destination.lng !== undefined
        ? { lat: destination.lat, lng: destination.lng }
        : cities.find((c) => c.name.toLowerCase() === destination.label.trim().toLowerCase());
    const list: MapPinMarker[] = [];
    if (from) list.push({ id: 'origin', lat: from.lat, lng: from.lng, label: 'Origin', color: '#3b82f6' });
    if (to) list.push({ id: 'destination', lat: to.lat, lng: to.lng, label: 'Destination', color: '#a855f7' });
    return list;
  }, [origin, destination, cities, result]);

  const selectedRoute = useMemo(
    () => result?.routes.find((r) => r.id === selectedRouteId) ?? result?.recommended ?? null,
    [result, selectedRouteId],
  );

  const routeLayers = useMemo<RouteLayer[]>(() => {
    if (!result) return [];
    return result.routes.map((route, i) => ({
      id: route.id,
      label: `${route.label} · ${route.distance_km} km`,
      color: ROUTE_COLORS[i % ROUTE_COLORS.length],
      coordinates: [route.coordinates],
    }));
  }, [result]);

  const colorFor = (id: string) => {
    const idx = result?.routes.findIndex((r) => r.id === id) ?? -1;
    return idx >= 0 ? ROUTE_COLORS[idx % ROUTE_COLORS.length] : '#94a3b8';
  };

  const sameEndpoints =
    origin.label.trim().toLowerCase() === destination.label.trim().toLowerCase() &&
    origin.lat === destination.lat &&
    origin.lng === destination.lng;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Route Planner</h2>
          <p className="text-sm text-slate-400">
            Real roads from OpenStreetMap · turn-by-turn directions · live incident overlay · no API key.
          </p>
        </div>
        <Badge tone={result?.live ? 'green' : 'violet'} pulse={!!result?.live}>
          <Radio className="h-3 w-3" /> {result ? (result.live ? 'LIVE ROADS' : 'FALLBACK ROUTE') : 'REAL ROAD ROUTING'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Wizard */}
        <Card title="Plan your journey" subtitle="Three quick steps" padded={false} className="relative z-30">
          <div className="space-y-4 p-4">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-accent-500">1 · Where to?</p>
              <div className="space-y-2">
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
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-accent-500">2 · Priority</p>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map((item) => {
                  const Icon = item.icon;
                  const active = mode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMode(item.id)}
                      title={item.hint}
                      className={cls(
                        'flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-[11px] font-semibold transition-colors',
                        active
                          ? 'border-accent-500 bg-accent-600/15 text-accent-600'
                          : 'border-line bg-base-900 text-slate-400 hover:border-accent-500/40',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowOptions((v) => !v)}
                className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-700"
              >
                3 · Trip details (optional)
                {showOptions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showOptions && (
                <div className="mt-2 space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">Cargo</span>
                    <select value={cargoType} onChange={(e) => setCargoType(e.target.value)} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
                      {meta.data.cargo_types.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">Priority</span>
                    <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
                      {meta.data.priorities.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">Vehicle</span>
                    <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
                      {meta.data.vehicle_types.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <button
              onClick={plan}
              disabled={loading || sameEndpoints || !origin.label.trim() || !destination.label.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-3 text-sm font-bold text-white hover:bg-accent-500 disabled:opacity-50"
            >
              {loading ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              {loading ? 'Finding route…' : 'Plan route'}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <p className="text-[10px] leading-relaxed text-slate-500">
              Pick any city, search any place in the world, use your GPS, or tap the map. Public OSRM servers
              provide the road geometry; a built-in graph keeps the planner working if they are unreachable.
            </p>
          </div>
        </Card>

        {/* Map */}
        <Card
          className="lg:col-span-2"
          padded={false}
          title="Road map"
          subtitle={result ? `${result.origin.label} → ${result.destination.label}` : 'Your route will appear here'}
          actions={<Badge tone="blue"><Truck className="h-3 w-3" /> {vehicle}</Badge>}
        >
          <div className="relative h-[340px] sm:h-[440px]">
            <NERMap
              roads={allRoads.data}
              incidents={incidents.data}
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
                Tap the map to set the <b className="capitalize">{pickTarget}</b>
                <button onClick={() => setPickTarget(null)} className="ml-1 text-slate-400 hover:text-slate-700" title="Cancel">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {result && (
              <div className="absolute bottom-3 left-3 z-[500] max-w-[70%] rounded-lg border border-line bg-base-925/95 px-3 py-2 text-[11px] text-slate-500 shadow-lg backdrop-blur">
                <p className="flex items-center gap-1.5 font-semibold text-slate-600">
                  <Layers3 className="h-3 w-3 text-accent-500" /> {result.source_label}
                </p>
                <p className="mt-0.5">{result.routes.length} real-road alternatives · updated {new Date(result.fetched_at).toLocaleTimeString()}</p>
              </div>
            )}
          </div>
          {result && result.routes.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-slate-500">
              {result.routes.map((r) => (
                <button key={r.id} onClick={() => setSelectedRouteId(r.id)} className="flex items-center gap-1.5 font-medium hover:text-slate-700">
                  <span className="h-2 w-4 rounded-full" style={{ background: colorFor(r.id) }} />
                  <span className={r.id === selectedRoute?.id ? 'font-bold text-slate-800' : ''}>
                    {r.label} {r.distance_km} km
                  </span>
                </button>
              ))}
              <span className="ml-auto flex items-center gap-1 text-slate-600">
                <MapPin className="h-3 w-3 text-accent-500" />
                Selected: <b className="text-slate-800">{selectedRoute?.label}</b> · {selectedRoute?.eta_display}
              </span>
            </div>
          )}
          {result && result.warnings.length > 0 && (
            <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-300">
              {result.warnings.join(' ')}
            </div>
          )}
        </Card>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className={cls('flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between', result.live ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10')}>
            <div className="flex items-start gap-2">
              <ShieldCheck className={cls('mt-0.5 h-4 w-4 shrink-0', result.live ? 'text-emerald-400' : 'text-amber-400')} />
              <div>
                <p className={cls('text-sm font-semibold', result.live ? 'text-emerald-700' : 'text-amber-700')}>{result.explanation}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Ranked for <b>{result.mode_label}</b> priority · live incident overlay within {result.risk_overlay.radius_km} km of the road.
                </p>
              </div>
            </div>
            <button onClick={plan} className="flex shrink-0 items-center gap-1.5 self-start rounded-md border border-line bg-base-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800">
              <RefreshCw className="h-3 w-3" /> Recalculate
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {result.routes.map((route, i) => (
              <RouteOptionCard
                key={route.id}
                route={route}
                color={colorFor(route.id)}
                rank={i}
                selected={route.id === selectedRoute?.id}
                onSelect={() => setSelectedRouteId(route.id)}
              />
            ))}
          </div>

          {selectedRoute && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Turn-by-turn directions" subtitle={selectedRoute.label} padded={false}>
                {selectedRoute.steps.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400">
                    Turn instructions are unavailable for this source. The road geometry is still shown on the map.
                  </p>
                ) : (
                  <>
                    <ol className="divide-y divide-line/60">
                      {(showAllSteps ? selectedRoute.steps : selectedRoute.steps.slice(0, 6)).map((step, idx) => (
                        <li key={idx} className="flex items-start gap-3 px-4 py-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-base-700 text-[10px] font-bold text-slate-400">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-600">{step.instruction}</p>
                            <p className="text-[10px] text-slate-500">{step.distance_km} km · {step.duration_min} min</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {selectedRoute.steps.length > 6 && (
                      <button onClick={() => setShowAllSteps((v) => !v)} className="flex w-full items-center justify-center gap-1 border-t border-line py-2 text-[11px] font-semibold text-accent-500 hover:text-accent-400">
                        {showAllSteps ? 'Show less' : `Show all ${selectedRoute.steps.length} steps`}
                        {showAllSteps ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                  </>
                )}
              </Card>

              <Card title="Incidents along this route" subtitle={`${selectedRoute.incidents_nearby} within ${result.risk_overlay.radius_km} km`} padded={false}>
                {selectedRoute.nearby_incidents.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 text-xs text-emerald-500">
                    <ShieldCheck className="h-4 w-4" /> No reported incidents near this corridor.
                  </div>
                ) : (
                  <div className="divide-y divide-line/60">
                    {selectedRoute.nearby_incidents.slice(0, 10).map((inc, idx) => (
                      <div key={`${inc.id ?? idx}`} className="flex items-start gap-2 px-4 py-2.5">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-600">{inc.label}</p>
                          <p className="text-[10px] text-slate-500">{inc.type} · {inc.severity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {loading && (
        <Card title="Planning your route">
          <div className="flex items-center gap-3 py-6 text-slate-400">
            <Spinner className="h-6 w-6" />
            <p>Requesting drivable road geometry, scoring alternatives against live incidents…</p>
          </div>
        </Card>
      )}

      {!result && !loading && (
        <Card title="How it works" padded={false}>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            {[
              { icon: Navigation, title: 'Real roads', desc: 'Routes follow drivable OSM roads via Valhalla and OSRM, with Google-Maps-style turn instructions — not a fictional graph.' },
              { icon: ShieldCheck, title: 'Incident-aware', desc: 'Live GDACS and USGS reports are overlaid on every alternative before ranking.' },
              { icon: Clock, title: 'Always available', desc: 'If the live servers are down, a built-in road graph and a direct estimate keep the planner usable.' },
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
    </div>
  );
}

function RouteOptionCard({
  route,
  color,
  rank,
  selected,
  onSelect,
}: {
  route: PlannedRoute;
  color: string;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cls(
        'rounded-xl border p-4 text-left transition-all',
        selected ? 'border-accent-500 bg-accent-600/5 ring-2 ring-accent-500/30' : 'border-line bg-base-800/60 hover:border-accent-500/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{rank + 1}</span>
          <span className="text-sm font-bold text-slate-800">{route.label}</span>
          {route.recommended && <Badge tone="green" pulse><ShieldCheck className="h-3 w-3" /> Best</Badge>}
        </div>
        <Badge tone={route.risk_level === 'Low' ? 'green' : route.risk_level === 'Moderate' ? 'yellow' : route.risk_level === 'High' ? 'orange' : 'red'}>
          {route.risk_level}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-base-900 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">Distance</p>
          <p className="text-lg font-extrabold text-slate-800">{route.distance_km} <span className="text-xs font-medium text-slate-400">km</span></p>
        </div>
        <div className="rounded-lg bg-base-900 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">Travel time</p>
          <p className="text-lg font-extrabold text-slate-800">{route.eta_display}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1 text-slate-400"><RouteIcon className="h-3 w-3" /> {route.tag}</span>
        <span className="font-semibold text-slate-600">{route.safety_score}% safety</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-base-700">
        <div className="h-full rounded-full transition-all" style={{ width: `${route.safety_score}%`, background: route.safety_score > 75 ? '#22c55e' : route.safety_score > 50 ? '#eab308' : '#ef4444' }} />
      </div>
      {route.incidents_nearby > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-amber-400">
          <AlertTriangle className="h-3 w-3" /> {route.incidents_nearby} incident{route.incidents_nearby > 1 ? 's' : ''} nearby
        </p>
      )}
    </button>
  );
}
