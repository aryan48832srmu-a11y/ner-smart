import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Road, Incident, City, Warehouse, Hospital } from '../../types';
import { roadStatusMeta, riskColorFor } from '../../utils/format';
import { MAP_STYLES, MAP_STYLE_ORDER, loadMapStyle, saveMapStyle, type MapStyleId } from './mapStyles';

function endpointIcon(color: string) {
  return L.divIcon({
    className: 'endpoint-marker',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 0 10px ${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function MapInteractions({
  onMapClick,
  focus,
}: {
  onMapClick?: (lat: number, lng: number) => void;
  focus?: { lat: number; lng: number; ts: number } | null;
}) {
  const map = useMap();

  useMapEvents({
    click: (e) => {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (!focus) return;
    const zoom = Math.min(Math.max(map.getZoom(), 7), 9);
    map.flyTo([focus.lat, focus.lng], zoom, { duration: 0.8 });
  }, [focus, map]);

  return null;
}

/** Frame the full route like a consumer navigation map once results arrive. */
function RouteFitter({ routeLayers }: { routeLayers?: RouteLayer[] }) {
  const map = useMap();
  const points = (routeLayers ?? []).flatMap((layer) => layer.coordinates.flat());
  const signature = points.length
    ? `${points.length}:${points[0][0]},${points[0][1]}:${points[points.length - 1][0]},${points[points.length - 1][1]}`
    : '';

  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 10, animate: true });
    // `signature` changes only when a new route result is rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);

  return null;
}

function cityIcon(type: string) {
  const size = type === 'capital' ? 12 : type === 'major_city' ? 10 : 7;
  const color = type === 'capital' ? '#facc15' : type === 'major_city' ? '#60a5fa' : '#94a3b8';
  return L.divIcon({
    className: 'city-marker',
    html: `<span style="display:inline-block;width:${size}px;height:${size}px;background:${color};border-radius:9999px;border:1.5px solid #0d1322;box-shadow:0 0 8px ${color}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function incidentIcon(severity: string) {
  const color = severity === 'Critical' ? '#ef4444' : severity === 'High' ? '#f97316' : '#eab308';
  return L.divIcon({
    className: 'incident-marker',
    html: `<span style="position:relative;display:inline-block;width:22px;height:22px;background:${color};border:2px solid #fff;border-radius:9999px;box-shadow:0 2px 6px rgba(0,0,0,.5)"><span style="position:absolute;top:-14px;left:50%;transform:translateX(-50%)">⚠</span></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function warehouseIcon() {
  return L.divIcon({
    className: 'wh-marker',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;background:#8b5cf6;border-radius:4px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);font-size:10px;color:#fff">W</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function hospitalIcon() {
  return L.divIcon({
    className: 'hosp-marker',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:16px;height:16px;background:#ef4444;border-radius:4px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);font-size:9px;color:#fff;font-weight:700">H</span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export interface RouteLayer {
  id: string;
  label: string;
  color: string;
  coordinates: [number, number][][];
}

export interface MapPinMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
}

interface NERMapProps {
  roads: Road[];
  incidents: Incident[];
  cities?: City[];
  warehouses?: Warehouse[];
  hospitals?: Hospital[];
  selectedRoadId?: string | null;
  selectedRoadIds?: Set<string> | null | undefined;
  routeLayers?: RouteLayer[];
  selectedRouteId?: string | null;
  pins?: MapPinMarker[];
  focus?: { lat: number; lng: number; ts: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
  onRoadClick?: (road: Road) => void;
  onIncidentClick?: (incident: Incident) => void;
  className?: string;
}

const CENTER: [number, number] = [26.2, 92.6];
const ZOOM = 6.5;

export function NERMap({
  roads,
  incidents,
  cities,
  warehouses,
  hospitals,
  selectedRoadId,
  selectedRoadIds,
  routeLayers,
  selectedRouteId,
  pins,
  focus,
  onMapClick,
  onRoadClick,
  onIncidentClick,
  className,
}: NERMapProps) {
  const hasRoutes = (routeLayers?.length ?? 0) > 0;
  const [styleId, setStyleId] = useState<MapStyleId>(loadMapStyle);
  const mapStyle = MAP_STYLES[styleId];
  const [sourceIndex, setSourceIndex] = useState(0);
  const tileErrorCount = useRef(0);

  // Esri serves the same imagery on two hosts. Treat them as ordered sources:
  // try the backup host before abandoning the selected style.
  const sources = [mapStyle.url, ...(mapStyle.fallbackUrls ?? [])];
  const overlaySources = mapStyle.overlayUrl
    ? [mapStyle.overlayUrl, ...(mapStyle.overlayFallbackUrls ?? [])]
    : [];
  const activeSource = sources[Math.min(sourceIndex, sources.length - 1)];
  const activeOverlay = overlaySources[Math.min(sourceIndex, overlaySources.length - 1)];

  const chooseStyle = (id: MapStyleId) => {
    setStyleId(id);
    saveMapStyle(id);
  };

  // Reset the source and failure counter whenever the basemap changes.
  useEffect(() => {
    tileErrorCount.current = 0;
    setSourceIndex(0);
  }, [styleId]);

  // Some networks/firewalls block a tile host entirely. After a few failed
  // tiles, switch to the style's backup host; only if that also fails do we
  // fall back to the OSM "Streets" layer. The saved preference is untouched.
  const handleTileError = () => {
    tileErrorCount.current += 1;
    if (tileErrorCount.current < 3) return;

    if (sourceIndex < sources.length - 1) {
      tileErrorCount.current = 0;
      setSourceIndex((index) => index + 1);
    } else if (styleId !== 'streets') {
      setStyleId('streets');
    }
  };

  return (
    <div
      className={`relative h-full w-full ${styleId === 'dark' ? 'map-style-dark' : ''} ${className ?? ''}`}
      style={{ minHeight: 260 }}
    >
      <MapContainer
        center={CENTER}
        zoom={ZOOM}
        scrollWheelZoom
        style={{ height: '100%', minHeight: 260, width: '100%', zIndex: 0 }}
      >
        <TileLayer
          key={`${mapStyle.id}-source-${sourceIndex}`}
          url={activeSource}
          attribution={mapStyle.attribution}
          subdomains={mapStyle.subdomains}
          maxZoom={mapStyle.maxZoom}
          detectRetina={mapStyle.retina}
          eventHandlers={{ tileerror: handleTileError }}
        />

        {/* Hybrid = satellite imagery + a transparent labels/boundaries layer. */}
        {activeOverlay && (
          <TileLayer
            key={`${mapStyle.id}-overlay-${sourceIndex}`}
            url={activeOverlay}
            subdomains={mapStyle.subdomains}
            maxZoom={mapStyle.overlayMaxZoom ?? mapStyle.maxZoom}
            detectRetina={mapStyle.retina}
          />
        )}

        <ScaleControl position="bottomright" imperial={false} />

        <MapInteractions onMapClick={onMapClick} focus={focus} />
        <RouteFitter routeLayers={routeLayers} />

        {roads.map((road) => {
          const meta = roadStatusMeta[road.status] ?? roadStatusMeta.risky;
          const selected = selectedRoadIds ? selectedRoadIds.has(road.id) : road.id === selectedRoadId;
          return (
            <Polyline
              key={road.id}
              positions={road.coordinates as [number, number][]}
              pathOptions={{
                color: meta.color,
                weight: selected ? 5 : hasRoutes ? 2.5 : 3.5,
                opacity: selected ? 1 : hasRoutes ? 0.25 : 0.85,
                dashArray: road.status === 'blocked' ? '6 6' : undefined,
              }}
              eventHandlers={{
                click: () => onRoadClick?.(road),
              }}
            >
              <Tooltip sticky>
                <div className="text-xs">
                  <div className="font-semibold">{road.name}</div>
                  <div style={{ color: meta.color }}>
                    {meta.label} · Accessibility {road.accessibility}%
                  </div>
                </div>
              </Tooltip>
            </Polyline>
          );
        })}

        {/* Route overlays sit above the base network so the selected corridor is visible.
            The selected route is rendered last so it stays on top of overlapping variants. */}
        {[...(routeLayers ?? [])]
          .sort((a, b) => Number(a.id === selectedRouteId) - Number(b.id === selectedRouteId))
          .map((layer) => {
            const isSelected = layer.id === selectedRouteId;
            return layer.coordinates.map((coords, idx) => (
              <Polyline
                key={`${layer.id}-${idx}`}
                positions={coords}
                pathOptions={{
                  color: layer.color,
                  weight: isSelected ? 6 : 4,
                  opacity: isSelected ? 1 : 0.85,
                  dashArray: isSelected ? undefined : '8 6',
                }}
              >
                {idx === 0 && (
                  <Tooltip>
                    <div className="text-xs">
                      <div className="font-semibold" style={{ color: layer.color }}>{layer.label}</div>
                    </div>
                  </Tooltip>
                )}
              </Polyline>
            ));
          })}

        {warehouses?.map((wh) => (
          <Marker key={wh.id} position={[wh.lat, wh.lng]} icon={warehouseIcon()}>
            <Tooltip>
              <div className="text-xs">
                <div className="font-semibold">{wh.name}</div>
                <div className="text-slate-400">Warehouse · {wh.city}</div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {hospitals?.map((h) => (
          <Marker key={h.id} position={[h.lat, h.lng]} icon={hospitalIcon()}>
            <Tooltip>
              <div className="text-xs">
                <div className="font-semibold">{h.name}</div>
                <div className="text-slate-400">{h.city}</div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {cities?.map((c) => (
          <Marker key={c.name} position={[c.lat, c.lng]} icon={cityIcon(c.type)}>
            <Tooltip>
              <div className="text-xs">
                <div className="font-semibold">{c.name}</div>
                <div className="text-slate-400">{c.type === 'capital' ? 'State Capital' : c.type === 'major_city' ? 'Major City' : 'Town'}</div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {pins?.map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={endpointIcon(pin.color)}>
            <Tooltip permanent direction="top" offset={[0, -8]}>
              <span className="text-[11px] font-semibold" style={{ color: pin.color }}>{pin.label}</span>
            </Tooltip>
          </Marker>
        ))}

        {incidents.map((inc) => (
          <Marker
            key={inc.id}
            position={[inc.lat, inc.lng]}
            icon={incidentIcon(inc.severity)}
            eventHandlers={{ click: () => onIncidentClick?.(inc) }}
          >
            <Popup>
              <div className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{inc.type}</span>
                  <span style={{ color: riskColorFor(inc.ai_risk ?? 0) }}>Risk {inc.ai_risk ?? '—'}%</span>
                </div>
                <div className="mt-1 text-slate-600">{inc.location_name}</div>
                <div className="text-slate-400">{inc.description}</div>
                <div className="mt-1 font-semibold" style={{ color: riskColorFor(inc.ai_risk ?? 0) }}>
                  {inc.severity} severity
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Basemap switcher — a dropdown fits all eight styles on a phone. */}
      <div
        className={`absolute right-2 top-2 z-[500] flex items-center gap-1.5 rounded-lg border px-2 py-1 shadow-soft backdrop-blur sm:right-3 sm:top-3 ${
          styleId === 'dark'
            ? 'border-slate-600 bg-slate-900/95 text-slate-100'
            : 'border-line bg-base-900/95 text-slate-700'
        }`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Map</span>
        <select
          aria-label="Map style"
          value={styleId}
          onChange={(e) => chooseStyle(e.target.value as MapStyleId)}
          className="max-w-[128px] cursor-pointer bg-transparent py-0.5 text-xs font-semibold outline-none"
        >
          {MAP_STYLE_ORDER.map((id) => (
            <option key={id} value={id}>
              {MAP_STYLES[id].label}
            </option>
          ))}
        </select>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[10] max-w-[calc(100%-1rem)] rounded-lg border border-line bg-base-925/90 px-2.5 py-1.5 backdrop-blur sm:bottom-3 sm:left-3 sm:px-3 sm:py-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:mb-1.5">Road Status</p>
        <div className="space-y-0.5 sm:space-y-1">
          {Object.entries(roadStatusMeta).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-2 text-[10px] text-slate-600 sm:text-[11px]">
              <span className="h-1 w-4 rounded-full" style={{ background: (meta as { color: string }).color }} />
              {(meta as { label: string }).label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
