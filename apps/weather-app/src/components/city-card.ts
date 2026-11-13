import { html, nothing, type TemplateResult } from 'lit';
import { forecastOf, type CardState } from '../domain/card-state.ts';
import type { City } from '../domain/cities.ts';
import { formatTime } from '../domain/time.ts';
import { formatTemperature, type Units } from '../domain/units.ts';
import { describeWeather } from '../domain/weather-codes.ts';

export interface CityCardHandlers {
  onRemove(id: string): void;
  onRetry(id: string): void;
}

function statusText(card: CardState): string {
  switch (card.status) {
    case 'loading':
      return card.forecast ? 'Updating…' : 'Loading…';
    case 'ready':
      return '';
    case 'stale':
      return `Couldn't refresh · last updated ${formatTime(card.forecast.fetchedAt)}`;
    case 'error':
      return "Couldn't load forecast";
  }
}

/** One city's forecast card (plain template, not a custom element). */
export function renderCityCard(city: City, card: CardState, units: Units, handlers: CityCardHandlers): TemplateResult {
  const forecast = forecastOf(card);
  const weather = forecast ? describeWeather(forecast.weatherCode) : undefined;
  const title = city.country ? `${city.name}, ${city.country}` : city.name;
  return html`
    <article class="card" data-testid="city-card" data-city-id=${city.id} data-status=${card.status}>
      <header>
        <h3 data-testid="name">${title}</h3>
        <button type="button" class="remove" data-action="remove" aria-label=${`Remove ${city.name}`} @click=${() => handlers.onRemove(city.id)}>
          Remove
        </button>
      </header>
      ${forecast && weather
        ? html`
            <p class="temp" data-testid="temp">${formatTemperature(forecast.currentC, units)}</p>
            <p data-testid="range">Min ${formatTemperature(forecast.minC, units)} / Max ${formatTemperature(forecast.maxC, units)}</p>
            <p data-testid="precip">Precipitation ${forecast.precipitationPct === null ? '–' : `${forecast.precipitationPct}%`}</p>
            <p data-testid="condition"><span aria-hidden="true">${weather.icon}</span> ${weather.label}</p>
          `
        : nothing}
      <p class="card-status" data-testid="card-status" role="status">${statusText(card)}</p>
      ${card.status === 'error'
        ? html`<button type="button" data-action="retry" @click=${() => handlers.onRetry(city.id)}>Retry</button>`
        : nothing}
    </article>
  `;
}
