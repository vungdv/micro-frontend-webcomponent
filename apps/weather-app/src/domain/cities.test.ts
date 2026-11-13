import { describe, expect, it } from 'vitest';
import { MAX_CITIES, addCity, removeCity, sameLocation, sanitizeCities, type City } from './cities.ts';

function city(n: number, extra: Partial<City> = {}): City {
  return { id: `id-${n}`, name: `City ${n}`, country: 'Land', lat: n, lon: n, ...extra };
}

describe('sameLocation', () => {
  it('given 52.52/13.41 and 52.52004/13.40996, when compared, then they are the same location [WDM-03a]', () => {
    expect(sameLocation({ lat: 52.52, lon: 13.41 }, { lat: 52.52004, lon: 13.40996 })).toBe(true);
  });

  it('given 52.52/13.41 and 52.5212/13.41, when compared, then they are different locations [WDM-03b]', () => {
    expect(sameLocation({ lat: 52.52, lon: 13.41 }, { lat: 52.5212, lon: 13.41 })).toBe(false);
  });
});

describe('addCity', () => {
  it('given a list, when a new location is added, then a new list ends with it and the input is unchanged [WDM-04]', () => {
    const list = [city(1)];
    const result = addCity(list, city(2));
    expect(result).toEqual({ ok: true, cities: [city(1), city(2)] });
    expect(list).toEqual([city(1)]);
  });

  it('given a saved city, when another id and name with the same lat/lon is added, then it is rejected as duplicate [WDM-05]', () => {
    const list = [city(1)];
    expect(addCity(list, city(1, { id: 'other', name: 'Other' }))).toEqual({ ok: false, reason: 'duplicate' });
    expect(list).toEqual([city(1)]);
  });

  it('given 9 cities, when one is added, then the list holds 10 [WDM-06a]', () => {
    const list = Array.from({ length: 9 }, (_, i) => city(i));
    const result = addCity(list, city(9));
    expect(result.ok && result.cities).toHaveLength(MAX_CITIES);
  });

  it('given 10 cities, when one more is added, then it is rejected with reason limit [WDM-06b]', () => {
    const list = Array.from({ length: 10 }, (_, i) => city(i));
    expect(addCity(list, city(10))).toEqual({ ok: false, reason: 'limit' });
  });

  it('given 10 cities, when a duplicate is added, then the duplicate reason wins [WDM-06c]', () => {
    const list = Array.from({ length: 10 }, (_, i) => city(i));
    expect(addCity(list, city(3, { id: 'x' }))).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('removeCity', () => {
  it('given cities, when one id is removed, then only that city is gone [WDM-07a]', () => {
    expect(removeCity([city(1), city(2)], 'id-1')).toEqual([city(2)]);
  });

  it('given cities, when an unknown id is removed, then an equal list is returned [WDM-07b]', () => {
    expect(removeCity([city(1)], 'nope')).toEqual([city(1)]);
  });
});

describe('sanitizeCities', () => {
  it('given invalid items, when sanitized, then they are dropped [WDM-08a]', () => {
    const raw = [
      { id: 'a', name: '', country: 'X', lat: 1, lon: 1 },
      { id: 'b', name: 'B', country: 'X', lat: 91, lon: 1 },
      { id: 'c', name: 'C', country: 'X', lat: 1, lon: Number.POSITIVE_INFINITY },
      { id: 'd', name: 'D', country: 3, lat: 1, lon: 1 },
      null,
      'e',
      city(5),
    ];
    expect(sanitizeCities(raw)).toEqual([city(5)]);
  });

  it('given a duplicate location, when sanitized, then the first is kept [WDM-08b]', () => {
    expect(sanitizeCities([city(1), city(1, { id: 'dup' })])).toEqual([city(1)]);
  });

  it('given 12 valid cities, when sanitized, then the first 10 are kept [WDM-08c]', () => {
    const raw = Array.from({ length: 12 }, (_, i) => city(i));
    expect(sanitizeCities(raw)).toEqual(raw.slice(0, 10));
  });

  it('given items with extra fields, when sanitized, then only id, name, country, lat and lon remain [WDM-08d]', () => {
    expect(sanitizeCities([{ ...city(1), region: 'R', extra: true }])).toEqual([city(1)]);
  });

  it('given two items with the same id at different locations, when sanitized, then the first is kept [WDM-08f]', () => {
    expect(sanitizeCities([city(1), city(2, { id: 'id-1' })])).toEqual([city(1)]);
  });

  it('given a value that is not an array, when sanitized, then [] [WDM-08e]', () => {
    expect(sanitizeCities({ id: 'x' })).toEqual([]);
  });
});
