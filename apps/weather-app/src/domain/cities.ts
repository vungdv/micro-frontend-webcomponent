/** A saved city, as stored in `weather:cities`. `id` is the Open-Meteo geocoding id as a string. */
export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export const MAX_CITIES = 10;

export type AddCityResult = { ok: true; cities: City[] } | { ok: false; reason: 'duplicate' | 'limit' };

/** Grid used for lat/lon equality: 4 decimals (~11 m), which matches Open-Meteo's exact coordinates for a place. */
const GRID = 1e4;

/** True when both coordinates are equal after rounding to 4 decimals. Name and id are ignored. */
export function sameLocation(a: Pick<City, 'lat' | 'lon'>, b: Pick<City, 'lat' | 'lon'>): boolean {
  return Math.round(a.lat * GRID) === Math.round(b.lat * GRID) && Math.round(a.lon * GRID) === Math.round(b.lon * GRID);
}

/** Appends `city` unless its location is already saved (checked first) or the list is full. */
export function addCity(list: readonly City[], city: City): AddCityResult {
  if (list.some((saved) => sameLocation(saved, city))) return { ok: false, reason: 'duplicate' };
  if (list.length >= MAX_CITIES) return { ok: false, reason: 'limit' };
  return { ok: true, cities: [...list, city] };
}

export function removeCity(list: readonly City[], id: string): City[] {
  return list.filter((city) => city.id !== id);
}

function inRange(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

function toCity(item: unknown): City | null {
  if (typeof item !== 'object' || item === null) return null;
  const { id, name, country, lat, lon } = item as Record<string, unknown>;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') return null;
  if (typeof country !== 'string' || !inRange(lat, 90) || !inRange(lon, 180)) return null;
  return { id, name, country, lat, lon };
}

/** Turns untrusted data into a valid city list: valid shapes only, unique ids and locations (first kept), at most 10. */
export function sanitizeCities(raw: unknown): City[] {
  if (!Array.isArray(raw)) return [];
  const result: City[] = [];
  for (const item of raw) {
    const city = toCity(item);
    if (!city || result.some((saved) => saved.id === city.id || sameLocation(saved, city))) continue;
    result.push(city);
    if (result.length === MAX_CITIES) break;
  }
  return result;
}
