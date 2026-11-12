import type { AppEntry } from '@mf/contracts';
import { HOME_ROUTE } from '../routes.ts';
import type { Apps, ErrorScope, Notify } from '../mediator/types.ts';

/**
 * Colleague: owns #mf-outlet. Shows exactly one view at a time (home, loading, not-found, error,
 * or one mounted app); every show replaces the previous content, removing any mounted element.
 */
export class Outlet {
  readonly #root: HTMLElement;
  readonly #notify: Notify;

  constructor(root: HTMLElement, notify: Notify) {
    this.#root = root;
    this.#notify = notify;
  }

  showHome(apps: Apps): void {
    const list = this.#el('ul');
    for (const [id, entry] of Object.entries(apps)) {
      const a = this.#el('a', id);
      a.setAttribute('href', entry.route);
      const li = this.#el('li');
      li.append(a);
      list.append(li);
    }
    this.#show('mf-home', this.#el('h1', 'Micro-frontend host'), this.#el('p', 'Pick an app:'), list);
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
    const element = this.#root.ownerDocument.createElement(entry.tag);
    for (const [name, value] of Object.entries(entry.attributes ?? {})) element.setAttribute(name, value);
    this.#root.replaceChildren(element);
  }

  #show(className: string, ...nodes: Node[]): HTMLElement {
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
