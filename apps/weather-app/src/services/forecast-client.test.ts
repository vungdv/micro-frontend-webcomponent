import { describe, expect, it } from 'vitest';
import { ForecastError, fetchForecast } from './forecast-client.ts';
import { deferredFetch, immediateFetch, jsonResponse } from '../test/fetch-fakes.ts';

const city = { id: '1', name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.41 };

function payload(overrides: { current?: unknown; daily?: unknown } = {}) {
  return {
    current: { time: '2026-11-13T14:00', temperature_2m: 7.3 },
    daily: {
      time: ['2026-11-13'],
      weather_code: [61],
      temperature_2m_max: [9.1],
      temperature_2m_min: [3.4],
      precipitation_probability_max: [80],
    },
    ...overrides,
  };
}

describe('fetchForecast', () => {
  it('given a city, when fetched, then the URL has exactly the documented params and no unit param [WSV-05]', async () => {
    const fetch = immediateFetch(() => jsonResponse(payload()));
    await fetchForecast(city, { fetch, now: () => 0 });
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '52.52',
      longitude: '13.41',
      current: 'temperature_2m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '1',
    });
  });

  it('given a valid payload and now() = T, when fetched, then a Forecast with fetchedAt T is returned [WSV-06a]', async () => {
    const fetch = immediateFetch(() => jsonResponse(payload()));
    await expect(fetchForecast(city, { fetch, now: () => 1234 })).resolves.toEqual({
      currentC: 7.3,
      minC: 3.4,
      maxC: 9.1,
      precipitationPct: 80,
      weatherCode: 61,
      fetchedAt: 1234,
    });
  });

  it('given null precipitation and weather code, when fetched, then they are kept as null [WSV-06b]', async () => {
    const daily = { weather_code: [null], temperature_2m_max: [9.1], temperature_2m_min: [3.4], precipitation_probability_max: [null] };
    const fetch = immediateFetch(() => jsonResponse(payload({ daily })));
    await expect(fetchForecast(city, { fetch, now: () => 1 })).resolves.toMatchObject({ precipitationPct: null, weatherCode: null });
  });

  it('given a 503 response, when fetched, then it rejects with ForecastError [WSV-07a]', async () => {
    const fetch = immediateFetch(() => jsonResponse({}, 503));
    await expect(fetchForecast(city, { fetch })).rejects.toBeInstanceOf(ForecastError);
  });

  it('given a payload without current.temperature_2m, when fetched, then it rejects with ForecastError [WSV-07b]', async () => {
    const fetch = immediateFetch(() => jsonResponse(payload({ current: {} })));
    await expect(fetchForecast(city, { fetch })).rejects.toBeInstanceOf(ForecastError);
  });

  it('given a payload without daily temperatures, when fetched, then it rejects with ForecastError [WSV-07c]', async () => {
    const fetch = immediateFetch(() => jsonResponse(payload({ daily: { weather_code: [1] } })));
    await expect(fetchForecast(city, { fetch })).rejects.toBeInstanceOf(ForecastError);
  });

  it('given the signal is aborted, when fetched, then it rejects with AbortError [WSV-07d]', async () => {
    const { fetch } = deferredFetch();
    const controller = new AbortController();
    const pending = fetchForecast(city, { fetch, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
