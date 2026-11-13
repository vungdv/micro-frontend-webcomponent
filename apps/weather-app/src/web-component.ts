import { LitElement, unsafeCSS, type PropertyDeclarations, type TemplateResult } from 'lit';
import { TAGS } from '@mf/contracts';
import { DEFAULT_UNITS, normalizeUnits, type Units } from './domain/units.ts';
import { DashboardController } from './pages/dashboard-controller.ts';
import { renderDashboardPage } from './pages/dashboard-page.ts';
import styles from './styles.css?inline';

/**
 * Weather dashboard micro-frontend (Lit). Search cities, save up to 10, one forecast card per city.
 *
 * @tag weather-dashboard
 * @attr {"metric" | "imperial"} units - Unit system for temperatures. Default `metric`; unknown values fall back to `metric` with a `console.warn`.
 * @cssprop --mf-font-family - Font family of the app.
 * @cssprop --mf-color-primary - Accent color of buttons and focus rings.
 * @cssprop --mf-color-error - Color of error messages and notices.
 * @cssprop --mf-color-text - Text color.
 * @cssprop --mf-color-border - Color of card borders and separators.
 * @cssprop --mf-color-muted - Color of secondary and stale text.
 */
export class WeatherDashboardElement extends LitElement {
  /** @internal */
  static override properties: PropertyDeclarations = {
    units: { reflect: true, noAccessor: true },
  };

  /** @internal */
  static override styles = unsafeCSS(styles);

  #units: Units = DEFAULT_UNITS;
  readonly #dashboard = new DashboardController(this);

  /**
   * Unit system for temperatures; reflects the `units` attribute. Unknown values are stored as `metric`.
   * @type {"metric" | "imperial"}
   * @attr units
   */
  get units(): Units {
    return this.#units;
  }

  set units(value: string | null) {
    const old = this.#units; // previous normalized value, captured before it changes
    const { units, valid } = normalizeUnits(value);
    if (!valid) console.warn(`[${TAGS.weather}] unknown units "${value}", falling back to metric`);
    this.#units = units;
    this.requestUpdate('units', old);
  }

  /** Re-setting the attribute to the value it already has is not a change: no second warning. */
  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'units' && oldValue === newValue) return;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  override render(): TemplateResult {
    return renderDashboardPage(this.#dashboard, this.units);
  }
}

if (!customElements.get(TAGS.weather)) {
  customElements.define(TAGS.weather, WeatherDashboardElement);
}
