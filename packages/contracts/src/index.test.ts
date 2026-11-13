import { describe, expect, expectTypeOf, it } from 'vitest';
import { MF_NAVIGATE, TAGS, type AppEntry, type HostConfig, type MfNavigateDetail } from './index.ts';

describe('@mf/contracts', () => {
  it('given the contract, when reading the navigate event name, then it is mf:navigate [CT-01]', () => {
    expect(MF_NAVIGATE).toBe('mf:navigate');
    expectTypeOf(MF_NAVIGATE).toEqualTypeOf<'mf:navigate'>();
  });

  it('given the contract, when reading tag names, then they are valid custom element names [CT-02]', () => {
    expect(TAGS).toEqual({ todo: 'todo-app', weather: 'weather-dashboard', timezone: 'timezone-app', userCard: 'user-card' });
    for (const tag of Object.values(TAGS)) expect(tag).toMatch(/^[a-z][a-z0-9]*-[a-z0-9-]*$/);
  });

  it('given HTMLElementEventMap, when listening for mf:navigate, then detail is typed MfNavigateDetail [CT-03]', () => {
    expectTypeOf<HTMLElementEventMap['mf:navigate']>().toEqualTypeOf<CustomEvent<MfNavigateDetail>>();
    expectTypeOf<HostConfig['apps'][string]>().toEqualTypeOf<AppEntry>();
  });
});
