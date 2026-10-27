import type {
  AnalyticsSummary,
  DashboardSummary,
  DisruptionForecast,
  GeocodePlace,
  GeocodeSearchResult,
  Incident,
  IncidentCreateResponse,
  LogisticsSummary,
  Meta,
  RiskPredictionResult,
  Road,
  RouteOptimizeResult,
  Weather,
  Alert,
  Warehouse,
} from '../types';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  dashboard: () => get<DashboardSummary>('/dashboard'),
  roads: () => get<Road[]>('/roads'),
  road: (id: string) => get<Road>(`/roads/${id}`),
  incidents: () => get<Incident[]>('/incidents'),
  createIncident: (body: Record<string, unknown>) => post<IncidentCreateResponse>('/incidents', body),
  weather: () => get<Weather[]>('/weather'),
  weatherCity: (city: string) => get<Weather[]>(`/weather?location=${encodeURIComponent(city)}`),
  alerts: () => get<Alert[]>('/alerts'),
  logistics: () => get<LogisticsSummary>('/logistics'),
  createWarehouse: (body: Record<string, unknown>) => post<Warehouse>('/warehouses', body),
  updateWarehouse: (id: string, body: Record<string, unknown>) =>
    patch<Warehouse>(`/warehouses/${id}`, body),
  analytics: () => get<AnalyticsSummary>('/analytics'),
  meta: () => get<Meta>('/meta'),
  optimize: (body: Record<string, unknown>) => post<RouteOptimizeResult>('/routes/optimize', body),
  predictRisk: (body: Record<string, number>) => post<RiskPredictionResult>('/predict-risk', body),
  forecast: (roadId: string) => get<DisruptionForecast>(`/forecast/${roadId}`),
  reverseGeocode: (lat: number, lng: number) =>
    get<GeocodePlace & { error?: string }>(`/geocode/reverse?lat=${lat}&lng=${lng}`),
  searchPlaces: (q: string, limit = 6) =>
    get<{ results: GeocodeSearchResult[] }>(
      `/geocode/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
};
