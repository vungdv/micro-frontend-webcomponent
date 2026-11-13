import { sanitizeCities, type City } from '../domain/cities.ts';
import { isForecast, type Forecast } from '../domain/card-state.ts';

export const CITIES_KEY = 'weather:cities';
export const FORECASTS_KEY = 'weather:forecasts';

/** Forecast cache: city id → last good forecast (°C, with `fetchedAt`). */
export type ForecastCache = Record<string, Forecast>;

function read(key: string, storage: Storage): unknown {
  const raw = storage.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`[weather] ignoring corrupt ${key}`);
    return undefined;
  }
}

function write(key: string, value: unknown, storage: Storage): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[weather] could not save ${key}`, error);
  }
}

/** Saved cities; invalid, duplicate and surplus entries are dropped. Never throws. */
export function loadCities(storage: Storage = localStorage): City[] {
  return sanitizeCities(read(CITIES_KEY, storage) ?? []);
}

export function saveCities(cities: readonly City[], storage: Storage = localStorage): void {
  write(CITIES_KEY, cities, storage);
}

/** Cached forecasts; entries with an invalid shape are dropped. Never throws. */
export function loadForecasts(storage: Storage = localStorage): ForecastCache {
  const raw = read(FORECASTS_KEY, storage);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => isForecast(value))) as ForecastCache;
}

export function saveForecast(id: string, forecast: Forecast, storage: Storage = localStorage): void {
  write(FORECASTS_KEY, { ...loadForecasts(storage), [id]: forecast }, storage);
}

export function removeForecast(id: string, storage: Storage = localStorage): void {
  const { [id]: _removed, ...rest } = loadForecasts(storage);
  write(FORECASTS_KEY, rest, storage);
}
