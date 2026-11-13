import { html, type TemplateResult } from 'lit';
import { renderCityCard } from '../components/city-card.ts';
import { renderSearchForm } from '../components/search-form.ts';
import { renderSearchResults } from '../components/search-results.ts';
import { loading } from '../domain/card-state.ts';
import type { Units } from '../domain/units.ts';
import type { DashboardController } from './dashboard-controller.ts';

/** The dashboard view: header, search and one card per saved city. */
export function renderDashboardPage(dashboard: DashboardController, units: Units): TemplateResult {
  const { cities, search } = dashboard;
  return html`
    <section class="dashboard">
      <header class="toolbar">
        <h2>Weather</h2>
        <span class="units">Units: <output data-testid="units">${units}</output></span>
        <button type="button" data-action="refresh" ?disabled=${cities.length === 0} @click=${() => dashboard.refreshAll()}>
          Refresh
        </button>
      </header>
      ${renderSearchForm(search, dashboard.notice, {
        onInput: (query) => dashboard.setQuery(query),
        onSearch: (query) => void dashboard.runSearch(query),
      })}
      ${renderSearchResults(search.results, dashboard.canAdd, (s) => dashboard.add(s))}
      ${cities.length === 0
        ? html`<p class="empty" data-testid="empty">No saved cities yet. Search for a city to add it.</p>`
        : html`<div class="cards">
            ${cities.map((city) =>
              renderCityCard(city, dashboard.cards.get(city.id) ?? loading(), units, {
                onRemove: (id) => dashboard.remove(id),
                onRetry: (id) => dashboard.retry(id),
              }),
            )}
          </div>`}
    </section>
  `;
}
