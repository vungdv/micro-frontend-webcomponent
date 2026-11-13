import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CITIES_KEY,
  FORECASTS_KEY,
  loadCities,
  loadForecasts,
  removeForecast,
  saveCities,
  saveForecast,
} from './weather-storage.ts';
import type { Forecast } from '../domain/card-state.ts';

/** In-memory fake of the Web Storage edge. */
class FakeStorage implements Storage {
  readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const berlin = { id: '1', name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.41 };
const forecast: Forecast = { currentC: 7, minC: 3, maxC: 9, precipitationPct: 80, weatherCode: 61, fetchedAt: 99 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('weather storage', () => {
  it('given empty storage, when loaded, then cities are [] and forecasts are {} [WSV-08]', () => {
    const storage = new FakeStorage();
    expect(loadCities(storage)).toEqual([]);
    expect(loadForecasts(storage)).toEqual({});
  });

  it('given cities saved, when loaded, then the same cities come back from weather:cities with exactly the five fields [WSV-09a]', () => {
    const storage = new FakeStorage();
    saveCities([berlin], storage);
    expect(JSON.parse(storage.getItem('weather:cities')!)).toEqual([berlin]);
    expect(CITIES_KEY).toBe('weather:cities');
    expect(loadCities(storage)).toEqual([berlin]);
  });

  it('given stored cities with an invalid item and a duplicate, when loaded, then sanitizeCities applies [WSV-09b]', () => {
    const storage = new FakeStorage();
    storage.setItem(CITIES_KEY, JSON.stringify([berlin, { ...berlin, id: '2' }, { id: '3' }]));
    expect(loadCities(storage)).toEqual([berlin]);
  });

  it('given corrupt JSON in weather:cities, when loaded, then [] and console.warn [WSV-10a]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = new FakeStorage();
    storage.setItem(CITIES_KEY, '{nope');
    expect(loadCities(storage)).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('given corrupt JSON in weather:forecasts, when loaded, then {} and console.warn [WSV-10b]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = new FakeStorage();
    storage.setItem(FORECASTS_KEY, '[1,');
    expect(loadForecasts(storage)).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
  });

  it('given a forecast entry with an invalid shape, when loaded, then it is dropped [WSV-10c]', () => {
    const storage = new FakeStorage();
    storage.setItem(FORECASTS_KEY, JSON.stringify({ a: forecast, b: { currentC: 'hot' } }));
    expect(loadForecasts(storage)).toEqual({ a: forecast });
  });

  it('given saveForecast, when stored, then weather:forecasts holds it under the city id with fetchedAt [WSV-11a]', () => {
    const storage = new FakeStorage();
    saveForecast('other', forecast, storage);
    saveForecast('1', forecast, storage);
    expect(FORECASTS_KEY).toBe('weather:forecasts');
    expect(JSON.parse(storage.getItem('weather:forecasts')!)).toEqual({ other: forecast, 1: forecast });
  });

  it('given a stored forecast, when removeForecast, then only that entry is gone [WSV-11b]', () => {
    const storage = new FakeStorage();
    saveForecast('other', forecast, storage);
    saveForecast('1', forecast, storage);
    removeForecast('1', storage);
    expect(loadForecasts(storage)).toEqual({ other: forecast });
  });

  it('given setItem throws, when cities or a forecast are saved, then nothing throws and console.warn is called [WSV-12]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = new FakeStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(() => saveCities([berlin], storage)).not.toThrow();
    expect(() => saveForecast('1', forecast, storage)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
