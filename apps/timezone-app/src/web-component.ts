import { createApp, type App } from 'vue';
import { TAGS } from '@mf/contracts';
import TimezonePage from './pages/TimezonePage.vue';
import { environment } from './services/environment.ts';
import { LocalStorageSettingsRepository } from './services/settings-repository.ts';
import styles from './styles.css?inline';

/**
 * Timezone micro-frontend (Vue 3). Shows the user's local time ranges in other IANA time zones.
 *
 * @tag timezone-app
 * @cssprop --mf-font-family - Font family of the app.
 * @cssprop --mf-color-primary - Accent color of buttons and focus outlines.
 * @cssprop --mf-color-error - Color of validation messages.
 * @cssprop --mf-color-text - Text color.
 * @cssprop --mf-color-border - Color of table and input borders.
 */
export class TimezoneAppElement extends HTMLElement {
  readonly #root: ShadowRoot;
  #app: App | null = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (this.#app) return;
    const style = document.createElement('style');
    style.textContent = styles;
    const container = document.createElement('div');
    this.#root.replaceChildren(style, container);

    // The only place that chooses the adapter; storage is resolved lazily so a blocked localStorage cannot throw here.
    const repository = new LocalStorageSettingsRepository(environment.supportedZones());
    this.#app = createApp(TimezonePage, { repository, environment });
    this.#app.mount(container);
  }

  disconnectedCallback(): void {
    this.#app?.unmount();
    this.#app = null;
    this.#root.replaceChildren();
  }
}

if (!customElements.get(TAGS.timezone)) {
  customElements.define(TAGS.timezone, TimezoneAppElement);
}
