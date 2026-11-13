/** One day's forecast for a city, always in °C. `fetchedAt` is epoch ms. */
export interface Forecast {
  currentC: number;
  minC: number;
  maxC: number;
  precipitationPct: number | null;
  weatherCode: number | null;
  fetchedAt: number;
}

/**
 * State of one city card. `stale` means: the latest fetch failed and the card shows its last
 * good forecast. `loading` keeps the last forecast (if any) visible while refreshing.
 */
export type CardState =
  | { status: 'loading'; forecast?: Forecast }
  | { status: 'ready'; forecast: Forecast }
  | { status: 'stale'; forecast: Forecast }
  | { status: 'error' };

export function loading(cached?: Forecast): CardState {
  return cached ? { status: 'loading', forecast: cached } : { status: 'loading' };
}

export function succeeded(forecast: Forecast): CardState {
  return { status: 'ready', forecast };
}

export function failed(cached?: Forecast): CardState {
  return cached ? { status: 'stale', forecast: cached } : { status: 'error' };
}

/** The forecast a card currently holds, if any. */
export function forecastOf(card: CardState | undefined): Forecast | undefined {
  return card && 'forecast' in card ? card.forecast : undefined;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

/** Shape check for untrusted data (e.g. the `weather:forecasts` cache). */
export function isForecast(value: unknown): value is Forecast {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    isNumber(f.currentC) &&
    isNumber(f.minC) &&
    isNumber(f.maxC) &&
    isNumberOrNull(f.precipitationPct) &&
    isNumberOrNull(f.weatherCode) &&
    isNumber(f.fetchedAt)
  );
}
