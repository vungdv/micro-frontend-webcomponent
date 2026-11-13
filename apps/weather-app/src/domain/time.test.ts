import { describe, expect, it } from 'vitest';
import { formatTime } from './time.ts';

describe('formatTime', () => {
  it('given 2026-11-13T14:05:09Z, when formatted in UTC, then "14:05" [WDM-14]', () => {
    expect(formatTime(Date.UTC(2026, 10, 13, 14, 5, 9), 'UTC')).toBe('14:05');
  });

  it('given 2026-11-13T00:07Z, when formatted in UTC, then "00:07" (24-hour, zero-padded) [WDM-15]', () => {
    expect(formatTime(Date.UTC(2026, 10, 13, 0, 7), 'UTC')).toBe('00:07');
  });
});
