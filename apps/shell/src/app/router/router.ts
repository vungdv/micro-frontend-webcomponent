import { HOME_ROUTE } from '../routes.ts';
import type { Apps, Notify } from '../mediator/types.ts';

/** The slice of `window` the router uses. */
export interface RouterWindow {
  location: { hash: string };
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
}

/** Colleague: turns `location.hash` into routeChanged notifications; sets the hash on request. */
export class Router {
  readonly #notify: Notify;
  readonly #window: RouterWindow;
  #apps: Apps | null = null;

  constructor(notify: Notify, win: RouterWindow) {
    this.#notify = notify;
    this.#window = win;
  }

  start(apps: Apps): void {
    if (this.#apps === null) this.#window.addEventListener('hashchange', this.#report);
    this.#apps = apps;
    this.#report();
  }

  /** Detaches the hashchange listener (used when the host is torn down). */
  stop(): void {
    this.#window.removeEventListener('hashchange', this.#report);
    this.#apps = null;
  }

  navigate(path: string): void {
    this.#window.location.hash = path;
  }

  #report = (): void => {
    if (this.#apps === null) return;
    const raw = this.#window.location.hash;
    const hash = raw === '' || raw === '#' ? HOME_ROUTE : raw;
    const match = Object.entries(this.#apps).find(([, entry]) => entry.route === hash);
    this.#notify({ type: 'routeChanged', hash, appId: match ? match[0] : null });
  };
}
