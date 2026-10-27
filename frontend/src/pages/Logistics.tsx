import { useMemo, useState } from 'react';
import {
  Warehouse as WarehouseIcon,
  Truck,
  Package,
  Boxes,
  HeartPulse,
  MapPin,
  Plus,
  Pencil,
  Save,
} from 'lucide-react';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { demoLogistics, demoMeta } from '../data/fallbackData';
import type { LogisticsSummary, Meta, Warehouse } from '../types';
import { Card } from '../components/ui/Card';
import { Badge, toneForSeverity } from '../components/ui/Badge';
import { LoadingBlock, Spinner } from '../components/ui/Loading';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { formatNumber } from '../utils/format';
import { useApp } from '../state/AppContext';

const stockLabels: Record<string, string> = {
  medicines: 'Medicines',
  food_kg: 'Food (kg)',
  construction_tons: 'Construction (t)',
  agricultural_tons: 'Agricultural (t)',
};

const DEFAULT_STOCK_KEYS = ['medicines', 'food_kg', 'construction_tons', 'agricultural_tons'];

interface WarehouseFormState {
  name: string;
  city: string;
  state: string;
  lat: string;
  lng: string;
  capacity_pct: string;
  operational: boolean;
  stock: Record<string, string>;
}

function blankStock(): Record<string, string> {
  return Object.fromEntries(DEFAULT_STOCK_KEYS.map((key) => [key, '0']));
}

function stockKeysFor(warehouse?: Warehouse | null): string[] {
  return Array.from(new Set([...DEFAULT_STOCK_KEYS, ...Object.keys(warehouse?.stock ?? {})]));
}

function emptyForm(state = 'Assam'): WarehouseFormState {
  return {
    name: '',
    city: '',
    state,
    lat: '26.1445',
    lng: '91.7362',
    capacity_pct: '50',
    operational: true,
    stock: blankStock(),
  };
}

export function Logistics() {
  const logistics = useApi<LogisticsSummary>(() => api.logistics(), demoLogistics, []);
  const meta = useApi<Meta>(() => api.meta(), demoMeta, []);
  const { notify } = useApp();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WarehouseFormState>(() => emptyForm());

  const prioritized = useMemo(() => {
    return [...logistics.data.requests].sort((a, b) => {
      const order: Record<string, number> = { CRITICAL: 3, HIGH: 2, NORMAL: 1 };
      return (order[b.priority] ?? 0) - (order[a.priority] ?? 0);
    });
  }, [logistics.data.requests]);

  const l = logistics.data;

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(meta.data.states[0] ?? 'Assam'));
    setModalOpen(true);
  };

  const openEdit = (warehouse: Warehouse) => {
    setEditing(warehouse);
    setForm({
      name: warehouse.name,
      city: warehouse.city,
      state: warehouse.state,
      lat: String(warehouse.lat),
      lng: String(warehouse.lng),
      capacity_pct: String(warehouse.capacity_pct),
      operational: warehouse.operational,
      stock: Object.fromEntries(
        stockKeysFor(warehouse).map((key) => [key, String(warehouse.stock[key] ?? 0)]),
      ),
    });
    setModalOpen(true);
  };

  const updateCity = (value: string) => {
    setForm((f) => {
      const match = meta.data.cities.find(
        (city) => city.name.toLowerCase() === value.trim().toLowerCase(),
      );
      return match
        ? {
            ...f,
            city: value,
            state: match.state,
            lat: String(match.lat),
            lng: String(match.lng),
          }
        : { ...f, city: value };
    });
  };

  const submit = async () => {
    const name = form.name.trim();
    const city = form.city.trim();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const capacity = Math.round(Number(form.capacity_pct));

    if (name.length < 2) {
      notify('Enter a warehouse name (at least 2 characters).', 'error', 'Missing details');
      return;
    }
    if (!city) {
      notify('Enter the city where the warehouse is located.', 'error', 'Missing details');
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      notify('Latitude must be -90 to 90 and longitude -180 to 180.', 'error', 'Invalid coordinates');
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 0 || capacity > 100) {
      notify('Capacity must be between 0 and 100%.', 'error', 'Invalid capacity');
      return;
    }
    if (Object.values(form.stock).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      notify('Supply quantities must be zero or positive numbers.', 'error', 'Invalid supplies');
      return;
    }

    const payload = {
      name,
      city,
      state: form.state,
      lat,
      lng,
      capacity_pct: capacity,
      operational: form.operational,
      stock: Object.fromEntries(
        Object.entries(form.stock).map(([key, value]) => [key, Math.round(Number(value))]),
      ),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.updateWarehouse(editing.id, payload);
        notify(`Supplies for ${name} have been updated.`, 'success', 'Warehouse updated');
      } else {
        await api.createWarehouse(payload);
        notify(`${name} was added to the logistics network.`, 'success', 'Warehouse added');
      }
      setModalOpen(false);
      setEditing(null);
      logistics.refresh();
    } catch (e) {
      notify(
        e instanceof Error ? e.message : 'Failed to save warehouse.',
        'error',
        editing ? 'Update failed' : 'Could not add warehouse',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Logistics Command</h2>
          <p className="text-sm text-slate-400">Warehouses, fleet, supply requests and delivery prioritisation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openAdd}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-500 sm:w-auto"
          >
            <Plus className="h-4 w-4" /> Add Warehouse
          </button>
          <Badge tone="blue">Readiness {l.readiness_pct}%</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Warehouses" value={l.warehouses.length} icon={<WarehouseIcon className="h-4 w-4" />} tone="violet" />
        <MiniStat label="Active Deliveries" value={l.deliveries_active} icon={<Truck className="h-4 w-4" />} tone="blue" />
        <MiniStat label="Supply Requests" value={l.requests.length} icon={<Package className="h-4 w-4" />} tone="orange" />
        <MiniStat label="Hospitals" value={l.hospitals?.length ?? 0} icon={<HeartPulse className="h-4 w-4" />} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Warehouses */}
        <Card className="lg:col-span-2" title="Warehouses & Stock" subtitle="Current inventory across depots" padded={false}>
          {logistics.loading ? (
            <LoadingBlock />
          ) : l.warehouses.length === 0 ? (
            <EmptyState title="No warehouses" description="Add a depot to start tracking stock." />
          ) : (
            <div className="space-y-3 p-4">
              {l.warehouses.map((wh) => (
                <div key={wh.id} className="rounded-lg border border-line bg-base-900 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400"><WarehouseIcon className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{wh.name}</p>
                        <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" /> {wh.city}, {wh.state}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(wh)}
                        className="flex items-center gap-1.5 rounded-md border border-line bg-base-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-accent-500/60 hover:text-accent-700"
                      >
                        <Pencil className="h-3 w-3" /> Edit Supplies
                      </button>
                      <Badge tone={wh.operational ? 'green' : 'red'}>{wh.operational ? 'Operational' : 'Non-Operational'}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(wh.stock).map(([k, v]) => (
                      <div key={k} className="rounded-md bg-base-925 px-2 py-1.5">
                        <p className="text-[10px] text-slate-9000">{stockLabels[k] ?? k}</p>
                        <p className="text-sm font-bold text-slate-800">{formatNumber(v)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-600/50">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${wh.capacity_pct}%` }} />
                    </div>
                    <span>Capacity {wh.capacity_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Smart prioritization */}
        <Card title="Smart Delivery Prioritization" subtitle="AI-inspired priority score" padded={false}>
          <div className="space-y-2 p-4">
            {prioritized.length === 0 ? (
              <EmptyState title="No supply requests" />
            ) : (
              prioritized.map((req, idx) => {
                const isTop = req.priority === 'CRITICAL';
                return (
                  <div key={req.id} className={`rounded-lg border p-3 ${isTop ? 'border-red-500/40 bg-red-500/5' : 'border-line bg-base-900'}`}>
                    <div className="flex items-center justify-between">
                      <Badge tone={toneForSeverity(req.priority === 'NORMAL' ? 'low' : req.priority === 'HIGH' ? 'medium' : 'critical')} pulse={isTop}>
                        {req.priority}
                      </Badge>
                      <span className="text-[10px] text-slate-9000">Priority #{idx + 1}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{req.destination}</p>
                    <p className="text-xs text-slate-400">{req.cargo} · {req.quantity} · ETA {req.eta_days}d</p>
                    <p className="mt-1.5 text-[11px] text-slate-600">{req.reason}</p>
                  </div>
                );
              })
            )}
            <p className="pt-1 text-[10px] text-slate-9000">Priority = Urgency + Population impact + Supply shortage + Accessibility + Route risk (simulated).</p>
          </div>
        </Card>
      </div>

      {/* Vehicles & Active deliveries */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Fleet & Vehicles" padded={false} actions={<Boxes className="h-4 w-4 text-slate-400" />}>
          <div className="space-y-2 p-4">
            {l.vehicles.length === 0 ? (
              <EmptyState title="No vehicles" />
            ) : (
              l.vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border border-line bg-base-900 p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Truck className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{v.plate}</p>
                      <p className="text-[11px] text-slate-400">{v.type} · {v.location}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge tone={v.status === 'en_route' ? 'blue' : v.status === 'available' ? 'green' : 'yellow'}>{v.status}</Badge>
                    {v.status === 'en_route' && <p className="mt-1 text-[11px] text-slate-400">{v.cargo} → {v.destination}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Critical Deliveries" padded={false} actions={<Badge tone="red">{l.deliveries_active} en route</Badge>}>
          <div className="space-y-2 p-4">
            {l.critical_destinations.length === 0 ? (
              <EmptyState title="No critical deliveries" />
            ) : (
              l.critical_destinations.map((c) => (
                <div key={c.destination} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{c.destination} — {c.cargo}</p>
                    <Badge tone="red">{c.priority}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{c.det?.reason}</p>
                  <p className="mt-1 text-[11px] text-slate-400">Qty {c.det?.quantity} · ETA {c.det?.eta_days} day(s)</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? `Edit Supplies — ${editing.name}` : 'Add Warehouse'}
        subtitle={
          editing
            ? 'Update stock levels, capacity and depot status. Changes are saved to the logistics database.'
            : 'Register a new depot and set its initial stock levels.'
        }
        size="lg"
        footer={
          <>
            <button
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
              }}
              disabled={saving}
              className="rounded-lg border border-line bg-base-800 px-4 py-2 text-sm text-slate-700 hover:bg-base-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-50"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : editing ? 'Save Supplies' : 'Add Warehouse'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-400">Warehouse Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Kohima Forward Depot"
              className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">City</label>
            <input
              value={form.city}
              onChange={(e) => updateCity(e.target.value)}
              list="warehouse-city-options"
              placeholder="e.g. Kohima"
              className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
            />
            <datalist id="warehouse-city-options">
              {meta.data.cities.map((city) => (
                <option key={city.name} value={city.name} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">State</label>
            <select
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
            >
              {meta.data.states.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Latitude</label>
            <input
              type="number"
              step="0.0001"
              value={form.lat}
              onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Longitude</label>
            <input
              type="number"
              step="0.0001"
              value={form.lng}
              onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
              className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Capacity Used (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.capacity_pct}
              onChange={(e) => setForm((f) => ({ ...f, capacity_pct: e.target.value }))}
              className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
            />
          </div>

          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-line bg-base-900 px-3 py-2">
              <span className="text-xs font-medium text-slate-400">Operational</span>
              <input
                type="checkbox"
                checked={form.operational}
                onChange={(e) => setForm((f) => ({ ...f, operational: e.target.checked }))}
                className="h-4 w-4 accent-accent-600"
              />
            </label>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Supplies & Stock</p>
              <span className="text-[10px] text-slate-9000">Units: medicines (doses), food (kg), construction & agriculture (tonnes)</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.keys(form.stock).map((key) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    {stockLabels[key] ?? key}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.stock[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stock: { ...f.stock, [key]: e.target.value } }))
                    }
                    className="w-full rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-slate-800 outline-none focus:border-accent-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MiniStat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  const tones: Record<string, string> = {
    violet: 'bg-violet-500/15 text-violet-400',
    blue: 'bg-blue-500/15 text-blue-400',
    orange: 'bg-orange-500/15 text-orange-400',
    red: 'bg-red-500/15 text-red-400',
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-base-800/60 p-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone] ?? tones.blue}`}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-[11px] text-slate-400">{label}</p>
      </div>
    </div>
  );
}
