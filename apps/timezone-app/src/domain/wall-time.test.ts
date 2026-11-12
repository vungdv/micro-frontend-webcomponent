import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isValidDate, validateTime } from './wall-time.ts';

describe('validateTime', () => {
  it('given "09:00", "23:59", "00:00", then valid; given "24:00", "9:00", "09:60", "", then invalid-time [TZD-01]', () => {
    for (const time of ['09:00', '23:59', '00:00']) expect(validateTime(time)).toEqual({ ok: true, time });
    for (const time of ['24:00', '9:00', '09:60', '']) expect(validateTime(time)).toEqual({ ok: false, reason: 'invalid-time' });
  });
});

describe('dates', () => {
  it('given YYYY-MM-DD strings, when validated, then only real calendar dates pass', () => {
    expect(isValidDate('2026-11-12')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-1-12')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });

  it('given a date, when adding days, then it rolls over months and years', () => {
    expect(addDays('2026-11-12', 1)).toBe('2026-11-13');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('given two dates, when compared, then daysBetween is the signed calendar-day difference', () => {
    expect(daysBetween('2026-11-12', '2026-11-11')).toBe(-1);
    expect(daysBetween('2026-11-12', '2026-11-14')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});
