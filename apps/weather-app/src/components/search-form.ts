import { html, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type { CitySuggestion } from '../services/geocoding-client.ts';

export type SearchStatus = 'idle' | 'searching' | 'results' | 'empty' | 'error';

/** What the search form shows: the typed query, the request status and the suggestions. */
export interface SearchState {
  query: string;
  status: SearchStatus;
  results: CitySuggestion[];
}

export interface SearchFormHandlers {
  onInput(query: string): void;
  onSearch(query: string): void;
}

const STATUS_TEXT: Record<SearchStatus, string> = {
  idle: '',
  searching: 'Searching…',
  results: '',
  empty: 'No cities found',
  error: 'Search failed. Try again.',
};

/** City search form with its status line and notice (plain template, not a custom element). */
export function renderSearchForm(search: SearchState, notice: string | null, handlers: SearchFormHandlers): TemplateResult {
  const submit = (event: Event): void => {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).elements.namedItem('q') as HTMLInputElement;
    handlers.onSearch(input.value);
  };
  return html`
    <form class="search" data-testid="search" role="search" @submit=${submit}>
      <input
        name="q"
        type="search"
        placeholder="Search a city"
        aria-label="City name"
        autocomplete="off"
        .value=${live(search.query)}
        @input=${(e: Event) => handlers.onInput((e.target as HTMLInputElement).value)}
      />
      <button type="submit">Search</button>
    </form>
    <p class="search-status" data-testid="search-status" role="status">${STATUS_TEXT[search.status]}</p>
    <p class="notice" data-testid="notice" role="alert">${notice ?? ''}</p>
  `;
}
