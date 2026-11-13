import type { AppEntry } from '@mf/contracts';
import { HOME_ROUTE } from '../routes.ts';
import type { Apps, ErrorScope, Notify } from '../mediator/types.ts';

/** What the Outlet needs from the home view (implemented by `home/home-view.ts`). */
export interface HomeViewHandle {
  show(): Promise<void>;
  dispose(): void;
}

/** Builds the home view that renders into `root` (the outlet's `section.mf-home`). */
export type HomeViewFactory = (root: HTMLElement, apps: Apps) => HomeViewHandle;

/**
 * Colleague: owns #mf-outlet. Shows exactly one view at a time (home, loading, not-found, error,
 * or one mounted app); every show replaces the previous content, removing any mounted element.
 * Leaving home disposes the home view first, so its cells disconnect and pending loads are dropped.
 */
export class Outlet {
  readonly #root: HTMLElement;
  readonly #notify: Notify;
  readonly #createHome: HomeViewFactory;
  #home: HomeViewHandle | null = null;

  constructor(root: HTMLElement, notify: Notify, createHome: HomeViewFactory) {
    this.#root = root;
    this.#notify = notify;
    this.#createHome = createHome;
  }

  showHome(apps: Apps): void {
    const section = this.#show('mf-home');
    this.#home = this.#createHome(section, apps);
    void this.#home.show();
  }

  showLoading(entry: AppEntry): void {
    const status = this.#el('p', `Loading ${entry.tag}…`);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-busy', 'true');
    this.#show('mf-loading', status);
  }

  showNotFound(hash: string): void {
    const home = this.#el('a', 'Back to home');
    home.setAttribute('href', HOME_ROUTE);
    this.#show('mf-not-found', this.#el('h1', 'Page not found'), this.#el('p', `No app is registered for ${hash}.`), home);
  }

  showError(scope: ErrorScope, message: string, retryable: boolean): void {
    const title = scope === 'global' ? 'The host could not start' : 'This app could not be loaded';
    const nodes: Node[] = [this.#el('h1', title), this.#el('p', message)];
    if (retryable) {
      const retry = this.#el('button', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => this.#notify({ type: 'retryRequested', scope }));
      nodes.push(retry);
    }
    const panel = this.#show('mf-error', ...nodes);
    panel.setAttribute('role', 'alert');
    panel.dataset.scope = scope;
  }

  mount(entry: AppEntry): void {
    this.#disposeHome();
    const element = this.#root.ownerDocument.createElement(entry.tag);
    for (const [name, value] of Object.entries(entry.attributes ?? {})) element.setAttribute(name, value);
    this.#root.replaceChildren(element);
  }

  #disposeHome(): void {
    this.#home?.dispose();
    this.#home = null;
  }

  #show(className: string, ...nodes: Node[]): HTMLElement {
    this.#disposeHome();
    const panel = this.#el('section');
    panel.className = className;
    panel.append(...nodes);
    this.#root.replaceChildren(panel);
    return panel;
  }

  #el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
    const el = this.#root.ownerDocument.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  }
}
