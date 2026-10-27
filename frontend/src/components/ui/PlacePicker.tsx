import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LocateFixed, MapPinned, Search, Sparkles } from 'lucide-react';
import type { City } from '../../types';
import { api } from '../../services/api';
import { nearestCity } from '../../utils/geo';

export interface PickedPlace {
  label: string;
  lat?: number;
  lng?: number;
}

interface PlacePickerProps {
  label: string;
  value: PickedPlace;
  onChange: (place: PickedPlace) => void;
  cities: City[];
  /** True while this endpoint is waiting for a map click. */
  picking?: boolean;
  onPickOnMap?: () => void;
  onError?: (message: string) => void;
}

/**
 * Combobox for choosing a trip endpoint: any NER city, any place on earth via
 * forward geocoding, the browser's current position, or a point on the map.
 */
export function PlacePicker({
  label,
  value,
  onChange,
  cities,
  picking,
  onPickOnMap,
  onError,
}: PlacePickerProps) {
  const [query, setQuery] = useState(value.label);
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<{ label: string; lat: number; lng: number; state?: string; country?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Follow external changes (map pick, geolocation, swap).
  useEffect(() => {
    setQuery(value.label);
  }, [value.label]);

  // Debounced forward geocoding for free-text queries.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setRemote([]);
      setSearching(false);
      return;
    }
    if (value.label === query && value.lat !== undefined && value.lng !== undefined) {
      setRemote([]);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .searchPlaces(text)
        .then((res) => {
          if (!cancelled) setRemote(res.results);
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value.label, value.lat, value.lng]);

  // Close the dropdown when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const cityMatches = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return cities.slice(0, 6);
    return cities.filter((city) => city.name.toLowerCase().includes(text)).slice(0, 6);
  }, [cities, query]);

  const resolved = value.lat !== undefined && value.lng !== undefined;
  const near = resolved ? nearestCity(value.lat!, value.lng!, cities) : null;

  const choose = (place: PickedPlace) => {
    onChange(place);
    setQuery(place.label);
    setOpen(false);
  };

  const locate = () => {
    if (!('geolocation' in navigator)) {
      onError?.('This browser does not support geolocation.');
      return;
    }
    if (!window.isSecureContext) {
      onError?.('Location access needs https:// or http://localhost.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
          const place = await api.reverseGeocode(lat, lng);
          if (place.label) name = place.label;
        } catch {
          /* keep coordinates as the label */
        }
        choose({ label: name, lat, lng });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        onError?.(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Allow it in your browser and try again.'
            : 'Could not read your current position. Pick the point on the map instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-400">{label}</label>
        {picking && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-accent-400">
            <MapPinned className="h-3 w-3" /> click the map
          </span>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange({ label: e.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && cityMatches.length > 0) {
              const city = cityMatches[0];
              e.preventDefault();
              choose({ label: city.name, lat: city.lat, lng: city.lng });
            }
          }}
          placeholder="Search any place…"
          className={`w-full rounded-lg border bg-base-900 py-2 pl-8 pr-8 text-sm text-slate-800 outline-none focus:border-accent-500 ${
            picking ? 'border-accent-500/60' : 'border-line'
          }`}
        />
        {searching && <span className="absolute right-2.5 top-2.5 text-[10px] text-slate-500">…</span>}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="flex items-center gap-1 text-[11px] font-medium text-accent-400 hover:text-accent-300 disabled:opacity-60"
        >
          {locating ? <Crosshair className="h-3 w-3 animate-pulse" /> : <LocateFixed className="h-3 w-3" />}
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        {onPickOnMap && (
          <button
            type="button"
            onClick={onPickOnMap}
            className={`flex items-center gap-1 text-[11px] font-medium ${
              picking ? 'text-accent-300' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <MapPinned className="h-3 w-3" /> {picking ? 'Cancel' : 'Pick on map'}
          </button>
        )}
      </div>

      {resolved ? (
        <p className="mt-0.5 text-[10px] text-slate-500">
          {value.lat!.toFixed(4)}, {value.lng!.toFixed(4)}
          {near &&
            (near.distanceKm <= 4
              ? ` · ${near.city.name} (on network)`
              : ` · ${near.city.name} +${Math.round(near.distanceKm)} km approach`)}
        </p>
      ) : (
        <p className="mt-0.5 text-[10px] text-slate-500">Type to search anywhere, or pick a network city.</p>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-base-900 p-1.5 shadow-2xl">
          {cityMatches.length > 0 && (
            <>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                NER road-network cities
              </p>
              {cityMatches.map((city) => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => choose({ label: city.name, lat: city.lat, lng: city.lng })}
                  className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-2.5 text-left hover:bg-base-800"
                >
                  <span className="text-sm text-slate-800">{city.name}</span>
                  <span className="text-[10px] text-slate-500">{city.state}</span>
                </button>
              ))}
            </>
          )}

          {remote.length > 0 && (
            <>
              <p className="mt-1 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <Sparkles className="h-3 w-3" /> Anywhere on the map
              </p>
              {remote.map((place) => (
                <button
                  key={`${place.label}-${place.lat}-${place.lng}`}
                  type="button"
                  onClick={() => choose({ label: place.label, lat: place.lat, lng: place.lng })}
                  className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-2.5 text-left hover:bg-base-800"
                >
                  <span className="text-sm text-slate-800">{place.label}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {place.lat.toFixed(2)}, {place.lng.toFixed(2)}
                  </span>
                </button>
              ))}
            </>
          )}

          {cityMatches.length === 0 && remote.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-slate-500">
              {searching ? 'Searching…' : query.trim().length < 3 ? 'Keep typing to search worldwide…' : 'No places found.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
