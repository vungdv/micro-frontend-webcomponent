import type { City } from '../domain/cities.ts';
import type { Forecast } from '../domain/card-state.ts';
import { getJson, type RequestOptions } from './http.ts';

/** Open-Meteo Forecast API (public, keyless). Temperatures come in °C (no unit param). */
export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export class ForecastError extends Error {
  constructor(readonly reason: number | 'invalid-payload') {
    super(reason === 'invalid-payload' ? 'Forecast payload is invalid' : `Forecast request failed with HTTP ${reason}`);
    this.name = 'ForecastError';
  }
}

export interface ForecastOptions extends RequestOptions {
  /** Clock for `fetchedAt`; defaults to `Date.now`. */
  now?: () => number;
}

function first(series: unknown): unknown {
  return Array.isArray(series) ? series[0] : undefined;
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ForecastError('invalid-payload');
  return value;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Fetches today's forecast for `city` with exactly the query params of the feature spec. */
export async function fetchForecast(city: Pick<City, 'lat' | 'lon'>, options: ForecastOptions = {}): Promise<Forecast> {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(city.lat));
  url.searchParams.set('longitude', String(city.lon));
  url.searchParams.set('current', 'temperature_2m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');
  const body = (await getJson(url, options, (status) => new ForecastError(status))) as {
    current?: Record<string, unknown>;
    daily?: Record<string, unknown>;
  } | null;
  const daily = body?.daily ?? {};
  return {
    currentC: finite(body?.current?.temperature_2m),
    minC: finite(first(daily.temperature_2m_min)),
    maxC: finite(first(daily.temperature_2m_max)),
    precipitationPct: finiteOrNull(first(daily.precipitation_probability_max)),
    weatherCode: finiteOrNull(first(daily.weather_code)),
    fetchedAt: (options.now ?? Date.now)(),
  };
}
