import { html, nothing, type TemplateResult } from 'lit';
import type { CitySuggestion } from '../services/geocoding-client.ts';

/** `Name, Region, Country`, with empty parts omitted. */
export function suggestionLabel(s: CitySuggestion): string {
  return [s.name, s.region, s.country].filter((part) => part).join(', ');
}

/** Search suggestions, each with an Add button (disabled at the city limit). */
export function renderSearchResults(
  results: readonly CitySuggestion[],
  canAdd: boolean,
  onAdd: (suggestion: CitySuggestion) => void,
): TemplateResult | typeof nothing {
  if (results.length === 0) return nothing;
  return html`
    <ul class="results">
      ${results.map(
        (s) => html`
          <li data-testid="suggestion">
            <span data-testid="suggestion-label">${suggestionLabel(s)}</span>
            <button type="button" ?disabled=${!canAdd} @click=${() => onAdd(s)}>Add</button>
          </li>
        `,
      )}
    </ul>
  `;
}
