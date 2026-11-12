import { describe, expect, it } from 'vitest';
import { convertRange, toInstant, toZoned } from './convert.ts';

const HOME = 'Asia/Ho_Chi_Minh';
const DATE = '2026-11-12';
const HOUR = 60;

describe('toInstant / toZoned', () => {
  it('given a wall time in a fixed-offset zone, when converted both ways, then it round-trips', () => {
    const instant = toInstant(DATE, '09:00', HOME);
    expect(new Date(instant).toISOString()).toBe('2026-11-12T02:00:00.000Z');
    expect(toZoned(instant, HOME)).toEqual({ date: DATE, time: '09:00' });
  });
});

describe('convertRange', () => {
  it('given 09:00–03:00, when converted to New York, then 21:00 (-1) – 15:00 (0) and 18h [TZD-05]', () => {
    expect(convertRange({ start: '09:00', end: '03:00' }, DATE, HOME, 'America/New_York')).toEqual({
      start: { date: '2026-11-11', time: '21:00', dayOffset: -1 },
      end: { date: '2026-11-12', time: '15:00', dayOffset: 0 },
      durationMinutes: 18 * HOUR,
    });
  });

  it('given 22:00–00:00, when converted to Kolkata, then 20:30 (0) – 22:30 (0); in the home zone the end is 00:00 (+1) [TZD-06]', () => {
    const range = { start: '22:00', end: '00:00' };
    const kolkata = convertRange(range, DATE, HOME, 'Asia/Kolkata');
    expect(kolkata.start).toEqual({ date: DATE, time: '20:30', dayOffset: 0 });
    expect(kolkata.end).toEqual({ date: DATE, time: '22:30', dayOffset: 0 });
    const home = convertRange(range, DATE, HOME, HOME);
    expect(home.start).toEqual({ date: DATE, time: '22:00', dayOffset: 0 });
    expect(home.end).toEqual({ date: '2026-11-13', time: '00:00', dayOffset: 1 });
    expect(home.durationMinutes).toBe(2 * HOUR);
  });

  it('given 09:00–17:00, when converted to Kathmandu, then 07:45 – 15:45 [TZD-07]', () => {
    const result = convertRange({ start: '09:00', end: '17:00' }, DATE, HOME, 'Asia/Kathmandu');
    expect(result.start).toMatchObject({ time: '07:45', dayOffset: 0 });
    expect(result.end).toMatchObject({ time: '15:45', dayOffset: 0 });
  });

  it('given home New York on 2026-03-08 and 02:30–04:00, then start is 03:30 EDT and duration is 30m [TZD-08]', () => {
    const zone = 'America/New_York';
    const result = convertRange({ start: '02:30', end: '04:00' }, '2026-03-08', zone, zone);
    expect(result.start).toEqual({ date: '2026-03-08', time: '03:30', dayOffset: 0 });
    expect(new Date(toInstant('2026-03-08', '02:30', zone)).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(result.durationMinutes).toBe(30);
  });

  it('given home New York on 2026-11-01 and 01:30–02:30, then start is the earlier instant 05:30Z and duration is 2h [TZD-09]', () => {
    const zone = 'America/New_York';
    expect(new Date(toInstant('2026-11-01', '01:30', zone)).toISOString()).toBe('2026-11-01T05:30:00.000Z');
    const result = convertRange({ start: '01:30', end: '02:30' }, '2026-11-01', zone, zone);
    expect(result.start).toEqual({ date: '2026-11-01', time: '01:30', dayOffset: 0 });
    expect(result.durationMinutes).toBe(2 * HOUR);
  });

  it('given 2026-03-29 and 07:00–10:00, when converted to London, then 00:00 – 04:00 and duration 3h [TZD-10]', () => {
    expect(convertRange({ start: '07:00', end: '10:00' }, '2026-03-29', HOME, 'Europe/London')).toEqual({
      start: { date: '2026-03-29', time: '00:00', dayOffset: 0 },
      end: { date: '2026-03-29', time: '04:00', dayOffset: 0 },
      durationMinutes: 3 * HOUR,
    });
  });
});
