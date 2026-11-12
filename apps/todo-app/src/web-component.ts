import { MF_NAVIGATE, TAGS, type MfNavigateDetail } from '@mf/contracts';
import { renderEmptyPage } from './pages/empty-page.ts';

/**
 * Todo micro-frontend (M1 vanilla placeholder).
 *
 * @tag todo-app
 * @attr {string} weather-route - Host route of the weather app (e.g. `#/weather`). When set, the empty state links to it; absent means no link.
 * @fires mf:navigate - Asks the host to navigate. `detail: { path }` is the `weather-route` value. Bubbles and is composed.
 */
export class TodoAppElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['weather-route'];
  }

  readonly #root: ShadowRoot;
  #listening = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  /** Reflects the `weather-route` attribute. */
  get weatherRoute(): string | null {
    return this.getAttribute('weather-route');
  }

  set weatherRoute(value: string | null) {
    if (value === null) this.removeAttribute('weather-route');
    else this.setAttribute('weather-route', value);
  }

  connectedCallback(): void {
    if (!this.#listening) {
      this.#root.addEventListener('click', this.#onClick);
      this.#listening = true;
    }
    this.#render();
  }

  disconnectedCallback(): void {
    this.#root.removeEventListener('click', this.#onClick);
    this.#listening = false;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name !== 'weather-route' || oldValue === newValue) return;
    if (this.isConnected) this.#render();
  }

  #render(): void {
    renderEmptyPage(this.#root, this.weatherRoute);
  }

  readonly #onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('a[data-navigate]')) return;
    const path = this.weatherRoute;
    if (path === null) return;
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<MfNavigateDetail>(MF_NAVIGATE, {
        detail: { path },
        bubbles: true,
        composed: true,
      }),
    );
  };
}

if (!customElements.get(TAGS.todo)) {
  customElements.define(TAGS.todo, TodoAppElement);
}
