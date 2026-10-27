import { useState, useRef, useEffect } from 'react';
import { Plus, MapPin, Upload, Image as ImageIcon, FileWarning, LocateFixed } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { demoMeta, demoIncidents } from '../data/fallbackData';
import type { Meta, Incident } from '../types';
import { matchState, nearestCity } from '../utils/geo';
import { Card } from '../components/ui/Card';
import { Badge, toneForSeverity } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Spinner, LoadingBlock } from '../components/ui/Loading';
import { EmptyState } from '../components/ui/EmptyState';
import { riskColorFor, formatTimeAgo } from '../utils/format';
import { useApp } from '../state/AppContext';

function MapClickHandler({ onPick }: { onPick: (pos: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click: (e) => {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Smoothly recentres the map when a fresh location target is provided. */
function MapRecenter({ target }: { target: { lat: number; lng: number; ts: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
  }, [target, map]);
  return null;
}

const pickerIcon = L.divIcon({
  className: 'picker-icon',
  html: `<span style="display:inline-block;width:16px;height:16px;background:#ef4444;border:3px solid #fff;border-radius:9999px;box-shadow:0 2px 8px rgba(0,0,0,.5)"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export function Incidents() {
  const { notify, bumpIncident } = useApp();
  const meta = useApi<Meta>(() => api.meta(), demoMeta, []);
  const incidents = useApi<Incident[]>(() => api.incidents(), demoIncidents, []);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'Landslide',
    state: 'Arunachal Pradesh',
    location_name: '',
    lat: 26.1445,
    lng: 91.7362,
    severity: 'Medium',
    description: '',
    road: '',
  });
  const [imageName, setImageName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [locating, setLocating] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [mapTarget, setMapTarget] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const states = meta.data.states;

  const suggestLocation = (name: string) => {
    const city = meta.data.cities.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (city) {
      setForm((f) => ({ ...f, lat: city.lat, lng: city.lng, state: city.state }));
    }
  };

  const locateMe = () => {
    if (!('geolocation' in navigator)) {
      notify('This browser does not support geolocation.', 'error', 'Location unavailable');
      return;
    }
    if (!window.isSecureContext) {
      notify(
        'Location access needs https:// or http://localhost. Open the app via localhost.',
        'warning',
        'Location blocked',
      );
      return;
    }

    setLocating(true);
    setGeoNote('Requesting your GPS position…');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);
        const near = nearestCity(lat, lng, meta.data.cities);

        let label = '';
        let detectedState: string | null = null;
        const place = await api.reverseGeocode(lat, lng).catch(() => null);
        if (place && !place.error) {
          label = place.label;
          detectedState = matchState(place.state, states);
        }
        // Offline / geocoder fallback: nearest known NER city, if close enough.
        if (!label && near && near.distanceKm <= 40) label = near.city.name;
        if (!detectedState && near && near.distanceKm <= 75) detectedState = near.city.state;
        if (!label) label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

        setForm((f) => ({ ...f, lat, lng, location_name: label, state: detectedState ?? f.state }));
        setMapTarget({ lat, lng, ts: Date.now() });
        setGeoNote(`${label} · accurate to ~${accuracy} m`);
        notify(`Pinned ${label}. You can fine-tune it on the map.`, 'success', 'Location detected');
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setGeoNote(null);
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Allow it in your browser settings and try again.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Your position is unavailable right now. Drop a pin on the map instead.'
              : 'Timed out while getting your location. Please try again.';
        notify(message, 'error', 'Location unavailable');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const submit = async () => {
    if (!form.location_name.trim()) {
      notify('Please enter a location name.', 'error', 'Missing location');
      return;
    }
    setSubmitting(true);
    setAiResult(null);
    try {
      const res = await api.createIncident({
        ...form,
        road: form.road || undefined,
        status: 'Active',
        reported_minutes_ago: 0,
      });
      setAiResult(res.incident.ai_analysis ?? null);
      notify(
        'Incident reported. Map, risk and dashboard statistics updated.',
        'success',
        'Incident Reported',
      );
      bumpIncident();
      incidents.refresh();
      setForm({
        type: 'Landslide',
        state: res.incident.state,
        location_name: '',
        lat: res.incident.lat,
        lng: res.incident.lng,
        severity: 'Medium',
        description: '',
        road: '',
      });
      setImageName(null);
      setGeoNote(null);
      setMapTarget(null);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to submit incident.', 'error', 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Incident Reporting</h2>
          <p className="text-sm text-slate-400">Field reports feed the AI risk engine and update the map in real time.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-500 sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Report Incident
        </button>
      </div>

      <Card title="Field Incident Reports" subtitle="Field reported incidents" padded={false} actions={<Badge tone="red">{incidents.data.length} total</Badge>}>
        {incidents.loading ? (
          <LoadingBlock />
        ) : incidents.data.length === 0 ? (
          <EmptyState title="No reports" description="Field reports will appear here." />
        ) : (
          <>
            {/* Mobile: report cards keep the table readable on narrow screens. */}
            <div className="space-y-2 p-3 md:hidden">
              {incidents.data.map((inc) => (
                <div key={inc.id} className="rounded-lg border border-line bg-base-900 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{inc.type}</p>
                      <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-400">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{inc.location_name}</span>
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
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Location</th>
                    <th className="px-4 py-2.5">Severity</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">AI Risk</th>
                    <th className="px-4 py-2.5">Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.data.map((inc) => (
                    <tr key={inc.id} className="border-b border-line/60 hover:bg-base-800/40">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{inc.type}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-9000" /> {inc.location_name}</span>
                      </td>
                      <td className="px-4 py-2.5"><Badge tone={toneForSeverity(inc.severity)}>{inc.severity}</Badge></td>
                      <td className="px-4 py-2.5"><Badge tone={inc.status === 'Active' ? 'red' : 'green'} pulse={inc.status === 'Active'}>{inc.status}</Badge></td>
                      <td className="px-4 py-2.5">
                        {inc.ai_risk !== undefined ? (
                          <span className="font-semibold" style={{ color: riskColorFor(inc.ai_risk) }}>{inc.ai_risk}%</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{formatTimeAgo(inc.reported_minutes_ago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Report an Incident" subtitle="Provide field details; image analysis runs through the prototype CV module" size="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Incident Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
              {meta.data.incident_types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">State</label>
            <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500">
              {states.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-400">Location Name</label>
            <input
              value={form.location_name}
              onChange={(e) => {
                const v = e.target.value;
                setForm({ ...form, location_name: v });
                suggestLocation(v);
              }}
              placeholder="e.g. Bomdila, West Kameng"
              className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Latitude</label>
            <input type="number" step="0.0001" value={form.lat} onChange={(e) => setForm({ ...form, lat: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Longitude</label>
            <input type="number" step="0.0001" value={form.lng} onChange={(e) => setForm({ ...form, lng: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500" />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent-500/40 bg-accent-600/10 px-3 py-2 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-600/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LocateFixed className={`h-4 w-4 ${locating ? 'animate-pulse' : ''}`} />
              {locating ? 'Getting your location…' : 'Use my current location'}
            </button>
            {geoNote && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <MapPin className="h-3 w-3" /> {geoNote}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-400">Or fine-tune the pin on the map</label>
            <div className="h-64 overflow-hidden rounded-lg border border-line">
              <MapContainer
                center={[form.lat, form.lng]}
                zoom={7}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                <MapClickHandler
                  onPick={(pos) => setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng }))}
                />
                <MapRecenter target={mapTarget} />
                <Marker
                  position={[form.lat, form.lng]}
                  icon={pickerIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const p = e.target.getLatLng();
                      setForm((f) => ({ ...f, lat: p.lat, lng: p.lng }));
                    },
                  }}
                />
              </MapContainer>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
              <MapPin className="h-3 w-3" />
              Current selection: {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Severity</label>
            <div className="flex gap-2">
              {meta.data.severities.map((sev) => (
                <button
                  key={sev}
                  onClick={() => setForm({ ...form, severity: sev })}
                  className={`flex-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                    form.severity === sev ? 'border-accent-500 bg-accent-600/20 text-accent-700' : 'border-line bg-base-900 text-slate-600 hover:bg-base-700'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Affected Road (optional)</label>
            <input value={form.road} onChange={(e) => setForm({ ...form, road: e.target.value })} placeholder="e.g. NH-10" className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500" />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the incident…" className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500" />
          </div>

          <div className="sm:col-span-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-base-900 px-3 py-6 text-sm text-slate-400 hover:border-accent-500 hover:text-slate-700"
            >
              {imageName ? <><ImageIcon className="h-4 w-4 text-emerald-400" /> {imageName}</> : <><Upload className="h-4 w-4" /> Upload Image (for AI analysis)</>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setImageName(e.target.files?.[0]?.name ?? null)} />
          </div>
        </div>

        {/* AI Analysis result */}
        {aiResult && (
          <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/10 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-600">
              <FileWarning className="h-4 w-4" /> AI Incident Analysis
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Info label="Detected" value={aiResult.detected} />
              <Info label="Confidence" value={`${aiResult.confidence}%`} />
              <Info label="Severity" value={aiResult.severity} />
              <Info label="Affected Road" value={aiResult.affected_road ?? '—'} />
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase text-slate-400">Method</p>
                <p className="text-xs text-violet-600">{aiResult.method}</p>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] uppercase text-slate-400">Recommended Action</p>
                <p className="text-xs text-slate-800">{aiResult.recommended_action}</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-9000">Prototype computer-vision module — AI estimate, not certified detection.</p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-line bg-base-800 px-4 py-2 text-sm text-slate-700 hover:bg-base-700">Cancel</button>
          <button onClick={submit} disabled={submitting} className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-50">
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
