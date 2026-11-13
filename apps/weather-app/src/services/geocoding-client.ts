import type { City } from '../domain/cities.ts';
import { getJson, type RequestOptions } from './http.ts';

/** Open-Meteo Geocoding API (public, keyless). */
export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const SEARCH_RESULT_COUNT = 5;

/** A search result: a city plus its region (`admin1`), which is for display only and never stored. */
export type CitySuggestion = City & { region?: string };

export class GeocodingError extends Error {
  constructor(readonly status: number) {
    super(`Geocoding request failed with HTTP ${status}`);
    this.name = 'GeocodingError';
  }
}

function toSuggestion(item: unknown): CitySuggestion | null {
  if (typeof item !== 'object' || item === null) return null;
  const { id, name, country, latitude, longitude, admin1 } = item as Record<string, unknown>;
  if ((typeof id !== 'number' && typeof id !== 'string') || typeof name !== 'string' || name === '') return null;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    return null;
  }
  const suggestion: CitySuggestion = {
    id: String(id),
    name,
    country: typeof country === 'string' ? country : '',
    lat: latitude,
    lon: longitude,
  };
  if (typeof admin1 === 'string' && admin1 !== '') suggestion.region = admin1;
  return suggestion;
}

/** Searches cities by name. Missing `results` → `[]`; items without id, name or coordinates are dropped. */
export async function searchCities(query: string, options: RequestOptions = {}): Promise<CitySuggestion[]> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(SEARCH_RESULT_COUNT));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const body = await getJson(url, options, (status) => new GeocodingError(status));
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.map(toSuggestion).filter((s): s is CitySuggestion => s !== null);
}
