import { afterEach, describe, expect, it, vi } from 'vitest';
import { environment, homeZone, supportedZones, today } from './environment.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('environment', () => {
  it('given TZ=Asia/Ho_Chi_Minh, when reading the home zone, then it is the current IANA id', () => {
    expect(homeZone()).toBe('Asia/Ho_Chi_Minh');
  });

  it('given the clock at 2026-11-12T20:00Z, when reading today, then it is the date in the given zone', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-11-12T20:00:00Z');
    expect(today('Asia/Ho_Chi_Minh')).toBe('2026-11-13');
    expect(today('America/New_York')).toBe('2026-11-12');
  });

  it('given the engine zone list, when reading supported zones, then it has UTC and current IANA ids, sorted and unique', () => {
    const zones = supportedZones();
    expect(zones).toEqual(expect.arrayContaining(['UTC', 'Asia/Kolkata', 'Asia/Ho_Chi_Minh', 'America/New_York']));
    expect(zones).not.toContain('Asia/Calcutta');
    expect(new Set(zones).size).toBe(zones.length);
    expect([...zones].sort()).toEqual(zones);
  });

  it('given the environment object, then it exposes the same functions', () => {
    expect(environment).toEqual({ homeZone, today, supportedZones });
  });
});
