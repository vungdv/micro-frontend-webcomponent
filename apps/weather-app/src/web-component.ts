import { TAGS } from '@mf/contracts';
import { normalizeUnits, type Units } from './domain/units.ts';
import { renderDashboardPage } from './pages/dashboard-page.ts';

/**
 * Weather dashboard micro-frontend (M1 vanilla placeholder).
 *
 * @tag weather-dashboard
 * @attr {"metric" | "imperial"} units - Unit system for temperatures. Default `metric`; unknown values fall back to `metric` with a `console.warn`.
 */
export class WeatherDashboardElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['units'];
  }

  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  /** Reflects the `units` attribute (normalized). */
  get units(): Units {
    return normalizeUnits(this.getAttribute('units')).units;
  }

  set units(value: Units) {
    this.setAttribute('units', value);
  }

  connectedCallback(): void {
    this.#render();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name !== 'units' || oldValue === newValue) return;
    const { valid } = normalizeUnits(newValue);
    if (!valid) {
      console.warn(`[${TAGS.weather}] unknown units "${newValue}", falling back to metric`);
    }
    if (this.isConnected) this.#render();
  }

  #render(): void {
    renderDashboardPage(this.#root, this.units);
  }
}

if (!customElements.get(TAGS.weather)) {
  customElements.define(TAGS.weather, WeatherDashboardElement);
}
