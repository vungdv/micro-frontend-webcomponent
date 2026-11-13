import { describe, expect, it } from 'vitest';
import { GeocodingError, searchCities } from './geocoding-client.ts';
import { deferredFetch, immediateFetch, jsonResponse } from '../test/fetch-fakes.ts';

const berlin = { id: 2950159, name: 'Berlin', latitude: 52.52437, longitude: 13.41053, country: 'Germany', admin1: 'Land Berlin' };

describe('searchCities', () => {
  it('given "São Paulo", when searched, then one GET hits the geocoding endpoint with the documented params and signal [WSV-01]', async () => {
    const fetch = immediateFetch(() => jsonResponse({ results: [] }));
    const signal = new AbortController().signal;
    await searchCities('São Paulo', { fetch, signal });
    expect(fetch).toHaveBeenCalledOnce();
    const [input, init] = fetch.mock.calls[0]!;
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(String(input)).toContain('name=S%C3%A3o+Paulo');
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'São Paulo', count: '5', language: 'en', format: 'json' });
    expect(init?.signal).toBe(signal);
  });

  it('given a results payload, when searched, then suggestions are mapped in order [WSV-02]', async () => {
    const paris = { id: 2988507, name: 'Paris', latitude: 48.85341, longitude: 2.3488, country: 'France', admin1: 'Île-de-France' };
    const fetch = immediateFetch(() => jsonResponse({ results: [berlin, paris] }));
    await expect(searchCities('x', { fetch })).resolves.toEqual([
      { id: '2950159', name: 'Berlin', country: 'Germany', lat: 52.52437, lon: 13.41053, region: 'Land Berlin' },
      { id: '2988507', name: 'Paris', country: 'France', lat: 48.85341, lon: 2.3488, region: 'Île-de-France' },
    ]);
  });

  it('given a payload without results, when searched, then [] [WSV-03a]', async () => {
    const fetch = immediateFetch(() => jsonResponse({ generationtime_ms: 1 }));
    await expect(searchCities('zzz', { fetch })).resolves.toEqual([]);
  });

  it('given items without coordinates or with a missing country, when searched, then the former are dropped and the country becomes "" [WSV-03b]', async () => {
    const noCoords = { id: 1, name: 'Nowhere', country: 'X' };
    const noCountry = { id: 2, name: 'Sea', latitude: 1, longitude: 2 };
    const fetch = immediateFetch(() => jsonResponse({ results: [noCoords, noCountry] }));
    await expect(searchCities('x', { fetch })).resolves.toEqual([{ id: '2', name: 'Sea', country: '', lat: 1, lon: 2 }]);
  });

  it('given a 500 response, when searched, then it rejects with GeocodingError [WSV-04a]', async () => {
    const fetch = immediateFetch(() => jsonResponse({}, 500));
    await expect(searchCities('x', { fetch })).rejects.toBeInstanceOf(GeocodingError);
  });

  it('given the signal is aborted, when searched, then it rejects with AbortError [WSV-04b]', async () => {
    const { fetch } = deferredFetch();
    const controller = new AbortController();
    const pending = searchCities('x', { fetch, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
