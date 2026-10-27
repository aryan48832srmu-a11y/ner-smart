import type { City } from '../types';

export interface NearestCity {
  city: City;
  distanceKm: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Closest known NER city to a coordinate. */
export function nearestCity(lat: number, lng: number, cities: City[]): NearestCity | null {
  let best: NearestCity | null = null;
  for (const city of cities) {
    const km = distanceKm(lat, lng, city.lat, city.lng);
    if (!best || km < best.distanceKm) best = { city, distanceKm: km };
  }
  return best;
}

/** Match a free-text state name against the platform's known state list. */
export function matchState(candidate: string | undefined, states: string[]): string | null {
  if (!candidate) return null;
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
  const target = normalise(candidate);
  if (!target) return null;
  const exact = states.find((state) => normalise(state) === target);
  if (exact) return exact;
  return (
    states.find((state) => {
      const name = normalise(state);
      return target.includes(name) || name.includes(target);
    }) ?? null
  );
}
