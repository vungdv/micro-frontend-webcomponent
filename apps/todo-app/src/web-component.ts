import { createApp, h, shallowRef, type App, type ShallowRef } from 'vue';
import { MF_NAVIGATE, TAGS, type MfNavigateDetail } from '@mf/contracts';
import TodoPage from './pages/TodoPage.vue';
import styles from './styles.css?inline';

/** Builds the contract event (kept outside the class so the manifest documents only the JSDoc `@fires`). */
function navigateEvent(path: string): CustomEvent<MfNavigateDetail> {
  return new CustomEvent<MfNavigateDetail>(MF_NAVIGATE, { detail: { path }, bubbles: true, composed: true });
}

/**
 * Todo micro-frontend (Vue 3). Mounts the todo list into its shadow root.
 *
 * @tag todo-app
 * @attr {string} weather-route - Host route of the weather app (e.g. `#/weather`). When set, the empty state links to it; absent means no link.
 * @fires mf:navigate - Asks the host to navigate. `detail: { path }` is the `weather-route` value. Bubbles and is composed.
 * @cssprop --mf-font-family - Font family of the app.
 * @cssprop --mf-color-primary - Accent color of buttons, links and the active filter.
 * @cssprop --mf-color-error - Color of validation messages.
 * @cssprop --mf-color-text - Text color.
 * @cssprop --mf-color-border - Color of item separators.
 */
export class TodoAppElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['weather-route'];
  }

  readonly #root: ShadowRoot;
  #app: App | null = null;
  #route: ShallowRef<string | null> | null = null;

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
    if (this.#app) return;
    const style = document.createElement('style');
    style.textContent = styles;
    const container = document.createElement('div');
    this.#root.replaceChildren(style, container);

    const route = shallowRef(this.weatherRoute);
    const app = createApp({
      render: () => h(TodoPage, { weatherRoute: route.value, onNavigate: () => this.#navigate(app) }),
    });
    this.#route = route;
    this.#app = app;
    app.mount(container);
  }

  disconnectedCallback(): void {
    this.#app?.unmount();
    this.#app = null;
    this.#route = null;
    this.#root.replaceChildren();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'weather-route' && this.#route) this.#route.value = newValue;
  }

  /** Turns the page's `navigate` into the contract event; ignored once `app` is no longer mounted. */
  #navigate(app: App): void {
    const path = this.weatherRoute;
    if (app !== this.#app || path === null) return;
    this.dispatchEvent(navigateEvent(path));
  }
}

if (!customElements.get(TAGS.todo)) {
  customElements.define(TAGS.todo, TodoAppElement);
}
