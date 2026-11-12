import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MAX_RANGES,
  MAX_ZONES,
  MESSAGES,
  addRange,
  addZone,
  parseSettings,
  removeRange,
  removeZone,
  type Settings,
} from './settings.ts';

const HOME = 'Asia/Ho_Chi_Minh';
const ZONES = [
  'America/New_York', 'Asia/Kolkata', 'Asia/Kathmandu', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo',
  'Australia/Sydney', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Auckland',
];
const SUPPORTED = [HOME, 'UTC', ...ZONES];

function settings(zones: string[] = [], ranges: Settings['ranges'] = []): Settings {
  return { version: 1, zones, ranges };
}

function ranges(count: number): Settings['ranges'] {
  return Array.from({ length: count }, (_, i) => ({ id: `r${i}`, start: `0${i}:00`.slice(-5), end: '23:00' }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('addRange', () => {
  it('given 10:00–10:00, when added, then zero-length [TZD-11]', () => {
    expect(addRange(settings(), { id: 'a', start: '10:00', end: '10:00' })).toEqual({ ok: false, reason: 'zero-length' });
  });

  it('given an invalid time, when added, then invalid-time', () => {
    expect(addRange(settings(), { id: 'a', start: '9:00', end: '10:00' })).toEqual({ ok: false, reason: 'invalid-time' });
  });

  it('given a valid range, when added, then it is appended and the input is unchanged', () => {
    const before = settings();
    const result = addRange(before, { id: 'a', start: '09:00', end: '03:00' });
    expect(result).toEqual({ ok: true, settings: settings([], [{ id: 'a', start: '09:00', end: '03:00' }]) });
    expect(before).toEqual(settings());
  });

  it('given settings, when adding an equal range, then duplicate-range; an 11th range, then too-many-ranges [TZD-13]', () => {
    const one = settings([], [{ id: 'a', start: '09:00', end: '17:00' }]);
    expect(addRange(one, { id: 'b', start: '09:00', end: '17:00' })).toEqual({ ok: false, reason: 'duplicate-range' });
    const full = settings([], ranges(MAX_RANGES));
    expect(MAX_RANGES).toBe(10);
    expect(addRange(full, { id: 'x', start: '22:00', end: '23:30' })).toEqual({ ok: false, reason: 'too-many-ranges' });
  });
});

describe('addZone', () => {
  it('given a supported zone in any casing, when added, then it is appended in canonical casing', () => {
    expect(addZone(settings(), 'america/new_york', HOME, SUPPORTED)).toEqual({ ok: true, settings: settings(['America/New_York']) });
    expect(addZone(settings(), 'Mars/Olympus', HOME, SUPPORTED)).toEqual({ ok: false, reason: 'unknown-zone' });
  });

  it('given settings, when adding the home zone or an existing zone, then duplicate-zone; an 11th zone, then too-many-zones; input unchanged [TZD-12]', () => {
    const one = settings(['America/New_York']);
    const snapshot = structuredClone(one);
    expect(addZone(one, HOME, HOME, SUPPORTED)).toEqual({ ok: false, reason: 'duplicate-zone' });
    expect(addZone(one, 'America/New_York', HOME, SUPPORTED)).toEqual({ ok: false, reason: 'duplicate-zone' });
    expect(one).toEqual(snapshot);

    const full = settings(ZONES.slice(0, MAX_ZONES));
    const fullSnapshot = structuredClone(full);
    expect(MAX_ZONES).toBe(10);
    expect(addZone(full, ZONES[10] ?? '', HOME, SUPPORTED)).toEqual({ ok: false, reason: 'too-many-zones' });
    expect(full).toEqual(fullSnapshot);
  });
});

describe('remove', () => {
  it('given settings, when removing a zone or range by id, then only it is gone in order; an unknown id gives equal settings [TZD-14]', () => {
    const r = [
      { id: 'a', start: '09:00', end: '17:00' },
      { id: 'b', start: '10:00', end: '12:00' },
      { id: 'c', start: '22:00', end: '00:00' },
    ];
    const before = settings(['America/New_York', 'Asia/Kolkata', 'Europe/London'], r);
    const snapshot = structuredClone(before);
    expect(removeZone(before, 'Asia/Kolkata')).toEqual(settings(['America/New_York', 'Europe/London'], r));
    expect(removeRange(before, 'b')).toEqual(settings([...snapshot.zones], [r[0]!, r[2]!]));
    expect(removeZone(before, 'Mars/Olympus')).toEqual(snapshot);
    expect(removeRange(before, 'zzz')).toEqual(snapshot);
    expect(before).toEqual(snapshot);
  });
});

describe('parseSettings', () => {
  it('given one unsupported zone and one malformed range, when parsed, then only valid entries remain [TZD-15]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stored = {
      version: 1,
      zones: ['America/New_York', 'Mars/Olympus', 'Asia/Kolkata'],
      ranges: [
        { id: 'a', start: '09:00', end: '03:00' },
        { id: 'b', start: '25:00', end: '03:00' },
        { id: 'c', start: '22:00', end: '00:00' },
      ],
    };
    expect(parseSettings(stored, SUPPORTED)).toEqual(
      settings(['America/New_York', 'Asia/Kolkata'], [stored.ranges[0]!, stored.ranges[2]!]),
    );
    expect(warn).toHaveBeenCalled();
  });

  it('given duplicates, repeated ids and entries past the limits, when parsed, then they are dropped', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stored = {
      version: 1,
      zones: ['utc', 'UTC', 42, ...ZONES],
      ranges: [...ranges(MAX_RANGES), { id: 'r0', start: '20:00', end: '21:00' }, { id: 'z', start: '20:00', end: '21:00' }, null],
    };
    const result = parseSettings(stored, SUPPORTED);
    expect(result.zones).toEqual(['UTC', ...ZONES.slice(0, MAX_ZONES - 1)]);
    expect(result.ranges).toEqual(ranges(MAX_RANGES));
  });

  it('given a wrong shape or unknown version, when parsed, then defaults and console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const value of [null, 'x', [], { version: 2, zones: [], ranges: [] }, { version: 1, zones: {}, ranges: [] }]) {
      expect(parseSettings(value, SUPPORTED)).toEqual(DEFAULT_SETTINGS);
    }
    expect(warn).toHaveBeenCalledTimes(5);
  });
});

describe('MESSAGES', () => {
  it('given each reason code, then the message from the validation table', () => {
    expect(MESSAGES).toEqual({
      'unknown-zone': 'Unknown time zone',
      'duplicate-zone': 'Already added',
      'too-many-zones': 'Up to 10 time zones',
      'invalid-time': 'Enter a valid time',
      'zero-length': 'Start and end must differ',
      'duplicate-range': 'Already added',
      'too-many-ranges': 'Up to 10 time ranges',
    });
  });
});
