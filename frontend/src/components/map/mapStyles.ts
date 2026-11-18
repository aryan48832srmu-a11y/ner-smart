/**
 * Basemap definitions for the NEXUS maps.
 *
 * "Map" is a clean CARTO Voyager basemap that suits the light dashboard. It
 * still renders the OpenStreetMap data, with crisper retina tiles and softer
 * labels than the raw OSM style. "Streets" is the classic OSM raster, kept as
 * a zero-dependency fallback, and "Dark" is a night basemap for projectors and
 * dim rooms.
 */
export type MapStyleId = 'voyager' | 'streets' | 'dark';

export interface MapStyle {
  id: MapStyleId;
  label: string;
  url: string;
  attribution: string;
  subdomains: string;
  /** True when the tile API serves @2x tiles for high-DPI screens. */
  retina: boolean;
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION =
  `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>`;

export const MAP_STYLES: Record<MapStyleId, MapStyle> = {
  voyager: {
    id: 'voyager',
    label: 'Map',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    retina: true,
  },
  streets: {
    id: 'streets',
    label: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    subdomains: 'abc',
    retina: false,
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    retina: true,
  },
};

export const MAP_STYLE_ORDER: MapStyleId[] = ['voyager', 'streets', 'dark'];

const STORAGE_KEY = 'nexus-map-style';

export function loadMapStyle(): MapStyleId {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'voyager' || saved === 'streets' || saved === 'dark') {
      return saved;
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
