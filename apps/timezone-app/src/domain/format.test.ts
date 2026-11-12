import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime, formatZonedTime } from './format.ts';

describe('formatTime', () => {
  it('given HH:mm, then en-US h:mm AM/PM', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('09:05')).toBe('9:05 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('21:30')).toBe('9:30 PM');
  });
});

describe('formatZonedTime', () => {
  it('given a day offset, then a (+Nd)/(-Nd) suffix; given 0, then none', () => {
    expect(formatZonedTime({ date: '2026-11-11', time: '21:00', dayOffset: -1 })).toBe('9:00 PM (-1d)');
    expect(formatZonedTime({ date: '2026-11-13', time: '03:00', dayOffset: 1 })).toBe('3:00 AM (+1d)');
    expect(formatZonedTime({ date: '2026-11-12', time: '15:00', dayOffset: 0 })).toBe('3:00 PM');
  });
});

describe('formatDuration', () => {
  it('given minutes, then 18h, 3h 30m or 30m', () => {
    expect(formatDuration(18 * 60)).toBe('18h');
    expect(formatDuration(3 * 60 + 30)).toBe('3h 30m');
    expect(formatDuration(30)).toBe('30m');
  });
});
