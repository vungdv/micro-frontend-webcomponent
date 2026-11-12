import { HOME_ROUTE } from '../routes.ts';
import type { Apps } from '../mediator/types.ts';

/** Colleague: renders nav links from the manifest and highlights the active one. Links are plain hash links. */
export class Header {
  readonly #nav: HTMLElement;

  constructor(nav: HTMLElement) {
    this.#nav = nav;
  }

  render(apps: Apps): void {
    const doc = this.#nav.ownerDocument;
    const link = (href: string, label: string, appId?: string) => {
      const a = doc.createElement('a');
      a.setAttribute('href', href);
      a.textContent = label;
      if (appId) a.dataset.appId = appId;
      return a;
    };
    this.#nav.replaceChildren(
      link(HOME_ROUTE, 'Home'),
      ...Object.entries(apps).map(([id, entry]) => link(entry.route, label(id), id)),
    );
  }

  setActive(appId: string | null): void {
    for (const a of this.#nav.querySelectorAll<HTMLAnchorElement>('a[data-app-id]')) {
      if (a.dataset.appId === appId) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
}

function label(appId: string): string {
  return appId.charAt(0).toUpperCase() + appId.slice(1);
}
