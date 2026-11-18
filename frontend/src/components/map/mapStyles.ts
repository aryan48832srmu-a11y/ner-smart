/**
 * Basemap definitions for the NEXUS maps.
 *
 * No map API key is required: these are public raster tile services. The only
 * key used by the project is `OPENWEATHER_API_KEY`, which powers the weather
 * panel on the backend — it has nothing to do with map tiles.
 *
 * All styles work with the same Leaflet map, so switching is instant and the
 * choice is remembered in localStorage.
 */
export type MapStyleId =
  | 'voyager'
  | 'streets'
  | 'satellite'
  | 'hybrid'
  | 'terrain'
  | 'light'
  | 'dark'
  | 'hot';

export interface MapStyle {
  id: MapStyleId;
  label: string;
  url: string;
  attribution: string;
  subdomains: string;
  /** True when the tile API serves @2x tiles for high-DPI screens. */
  retina: boolean;
  /** Maximum zoom supported by the tile service. */
  maxZoom: number;
  /** Optional transparent label layer drawn above the base tiles (Hybrid). */
  overlayUrl?: string;
  overlayMaxZoom?: number;
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION =
  `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>`;
const ESRI_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics';
const TOPO_ATTRIBUTION =
  `${OSM_ATTRIBUTION}, SRTM | <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a>`;
const HOT_ATTRIBUTION =
  `${OSM_ATTRIBUTION} | <a href="https://www.hotosm.org" target="_blank" rel="noreferrer">HOT</a>`;

export const MAP_STYLES: Record<MapStyleId, MapStyle> = {
  voyager: {
    id: 'voyager',
    label: 'Map',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    retina: true,
    maxZoom: 19,
  },
  streets: {
    id: 'streets',
    label: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    subdomains: 'abc',
    retina: false,
    maxZoom: 19,
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: ESRI_ATTRIBUTION,
    subdomains: '',
    retina: false,
    maxZoom: 19,
  },
  hybrid: {
    id: 'hybrid',
    label: 'Hybrid',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlayUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    overlayMaxZoom: 19,
    attribution: `${ESRI_ATTRIBUTION} | Boundaries & places: Esri`,
    subdomains: '',
    retina: false,
    maxZoom: 19,
  },
  terrain: {
    id: 'terrain',
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: TOPO_ATTRIBUTION,
    subdomains: 'abc',
    retina: false,
    maxZoom: 17,
  },
  light: {
    id: 'light',
    label: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    retina: true,
    maxZoom: 19,
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    retina: true,
    maxZoom: 19,
  },
  hot: {
    id: 'hot',
    label: 'Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: HOT_ATTRIBUTION,
    subdomains: 'abc',
    retina: false,
    maxZoom: 19,
  },
};

export const MAP_STYLE_ORDER: MapStyleId[] = [
  'voyager',
  'streets',
  'satellite',
  'hybrid',
  'terrain',
  'light',
  'dark',
  'hot',
];

const STORAGE_KEY = 'nexus-map-style';

export function loadMapStyle(): MapStyleId {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && MAP_STYLE_ORDER.includes(saved as MapStyleId)) {
      return saved as MapStyleId;
    }
  } catch {
    // Private browsing / disabled storage: fall back to the default.
  }
  return 'voyager';
}

export function saveMapStyle(id: MapStyleId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Non-fatal: the choice just will not persist.
  }
}
