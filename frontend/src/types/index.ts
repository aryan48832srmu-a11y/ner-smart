export interface Road {
  id: string;
  name: string;
  from_: string;
  to: string;
  state: string;
  length_km: number;
  estimated_hours: number;
  status: RoadStatus;
  accessibility: number;
  weather_risk: string;
  landslide_risk: number;
  disruption_probability: number;
  updated_minutes_ago: number;
  alternative_available: boolean;
  coordinates: [number, number][];
  factors: string[];
  anchors: string[];
}

export type RoadStatus = 'accessible' | 'risky' | 'severely_risky' | 'blocked';

export interface Incident {
  id: string;
  type: string;
  state: string;
  location_name: string;
  lat: number;
  lng: number;
  severity: string;
  description: string;
  road?: string;
  reported_minutes_ago: number;
  status: string;
  ai_risk?: number;
  image_url?: string;
  ai_analysis?: AiAnalysis;
}

export interface AiAnalysis {
  detected: string;
  confidence: number;
  severity: string;
  affected_road: string;
  recommended_action: string;
  method: string;
  certified: boolean;
}

export interface Weather {
  location: string;
  state: string;
  lat: number;
  lng: number;
  temperature_c: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_kmh: number;
  condition: string;
  alert?: string;
  source?: string;
  updated: string;
}

export interface RouteSegment {
  road_id: string;
  road_name: string;
  from_: string;
  to: string;
  distance_km: number;
  hours: number;
  safety: number;
}

export interface RouteOption {
  id: string;
  name: string;
  label: string;
  distance_km: number;
  eta_hours: number;
  eta_display: string;
  accessibility: number;
  safety: number;
  weather_risk: string;
  flood_risk: number;
  landslide_risk: number;
  incident_risk: number;
  road_condition: number;
  disruption_probability: number;
  overall_score: number;
  segments: RouteSegment[];
  recommended: boolean;
  is_shortest: boolean;
  reason?: string;
}

export interface RouteOptimizeResult {
  routes: RouteOption[];
  recommended: RouteOption | null;
  explanation: string;
  weights: Record<string, number>;
  weights_label: string;
  cargo_type: string;
  priority: string;
  endpoints?: RouteEndpoints;
  error: string | null;
}

/** How the requested points map onto the road network. */
export interface RouteEndpoints {
  origin: RouteEndpointInfo;
  destination: RouteEndpointInfo;
  warning: string | null;
}

export interface RouteEndpointInfo {
  label: string;
  /** Nearest road-network city used by the graph engine. */
  node: string;
  lat: number | null;
  lng: number | null;
  /** Distance from the requested point to `node`, in kilometres. */
  snap_km: number;
}

export interface RiskPredictionResult {
  risk_probability: number;
  risk_level: string;
  explainer: string[];
  disclaimer: string;
}

export interface DisruptionForecast {
  road_id: string;
  road_name: string;
  current_level: string;
  next_12h_level: string;
  probability: number;
  factors: string[];
  weather_source?: string;
  disclaimer: string;
}

export interface DashboardSummary {
  active_disruptions: number;
  blocked_roads: number;
  high_risk_routes: number;
  critical_deliveries: number;
  average_accessibility: number;
  weather_alerts: number;
  overall_risk: string;
  region: string;
  updated: string;
}

export interface Alert {
  id: string;
  category: string;
  severity: string;
  location: string;
  state: string;
  time: string;
  title: string;
  description: string;
  affected_routes: string[];
  affected_routes_count: number;
  predicted_disruption?: number;
  recommendation: string;
}

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  capacity_pct: number;
  stock: Record<string, number>;
  operational: boolean;
}

export interface Vehicle {
  id: string;
  plate: string;
  type: string;
  status: string;
  location: string;
  cargo: string;
  destination: string;
}

export interface SupplyRequest {
  id: string;
  destination: string;
  state: string;
  cargo: string;
  priority: string;
  quantity: string;
  eta_days: number;
  reason: string;
}

export interface Hospital {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  beds: number;
  status: string;
}

export interface LogisticsSummary {
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  requests: SupplyRequest[];
  deliveries_active: number;
  critical_destinations: {
    destination: string;
    cargo: string;
    priority: string;
    det: SupplyRequest;
  }[];
  hospitals: Hospital[];
  readiness_pct: number;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface AnalyticsSummary {
  disruptions_over_time: TrendPoint[];
  state_accessibility: { state: string; accessibility: number; incidents: number; high_risk_routes: number; deliveries: number; risk: string }[];
  weather_risk_by_state: { state: string; risk: number }[];
  delivery_success_rate: TrendPoint[];
  average_travel_time: TrendPoint[];
  risk_distribution: { name: string; value: number }[];
  incident_types: { name: string; value: number }[];
  critical_supply_requests: { destination: string; cargo: string; priority: string; eta: number }[];
  active_incidents: number;
}

export interface City {
  name: string;
  lat: number;
  lng: number;
  state: string;
  type: string;
}

/** Result of the backend's reverse-geocoding proxy. */
export interface GeocodePlace {
  label: string;
  city?: string;
  district?: string;
  state?: string;
}

/** A forward-geocoding (place search) suggestion. */
export interface GeocodeSearchResult {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  country?: string;
}

export interface Meta {
  cities: City[];
  states: string[];
  cargo_types: string[];
  priorities: string[];
  vehicle_types: string[];
  incident_types: string[];
  severities: string[];
}

export interface IncidentCreateResponse {
  id: string;
  message: string;
  incident: Incident;
  affected_roads: string[];
  recomputed_risk: {
    recomputed_roads: { road: string; disruption_probability: number; status: string }[];
  };
  updated_dashboard: DashboardSummary;
}
