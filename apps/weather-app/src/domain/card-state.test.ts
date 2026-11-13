import { describe, expect, it } from 'vitest';
import { failed, loading, succeeded, type Forecast } from './card-state.ts';

const forecast: Forecast = { currentC: 20, minC: 10, maxC: 25, precipitationPct: 40, weatherCode: 2, fetchedAt: 1 };

describe('card state', () => {
  it('given a cached forecast, when loading, then status loading keeps the forecast [WDM-11a]', () => {
    expect(loading(forecast)).toEqual({ status: 'loading', forecast });
  });

  it('given no cached forecast, when loading, then status loading without a forecast [WDM-11b]', () => {
    expect(loading()).toEqual({ status: 'loading' });
  });

  it('given any state, when succeeded, then status ready with the new forecast [WDM-12]', () => {
    expect(succeeded(forecast)).toEqual({ status: 'ready', forecast });
  });

  it('given a cached forecast, when failed, then status stale with the cached forecast [WDM-13a]', () => {
    expect(failed(forecast)).toEqual({ status: 'stale', forecast });
  });

  it('given no cached forecast, when failed, then status error [WDM-13b]', () => {
    expect(failed()).toEqual({ status: 'error' });
  });
});
