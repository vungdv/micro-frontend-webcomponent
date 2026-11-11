import type { AppEntry } from './types';

export interface HeaderOptions {
  /** The host's `<header>` element. */
  element: HTMLElement;
}

/**
 * Renders the title and one plain `<a href="#/...">` per app; highlights the active app.
 * It never navigates on its own and sends no notifications (the browser changes the hash).
 */
export class Header {
  private links = new Map<string, HTMLAnchorElement>();

  constructor(private readonly options: HeaderOptions) {}

  render(apps: AppEntry[]): void {
    const home = document.createElement('a');
    home.href = '#/';
    home.className = 'mf-header__title';
    home.textContent = 'Micro-frontend';

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Apps');
    this.links = new Map();
    for (const app of apps) {
      const a = document.createElement('a');
      a.href = app.route;
      a.textContent = app.name.charAt(0).toUpperCase() + app.name.slice(1);
      this.links.set(app.name, a);
      nav.append(a);
    }
    this.options.element.replaceChildren(home, nav);
  }

  setActive(entry: AppEntry | null): void {
    for (const [name, a] of this.links) {
      if (entry && name === entry.name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
}
