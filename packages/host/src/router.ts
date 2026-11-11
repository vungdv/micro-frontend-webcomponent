import type { AppEntry, Notify } from './types';

export interface RouterOptions {
  notify: Notify;
  window?: Window;
}

/** Listens to hashchange and reports routeChanged(path, entry | null). Loads and mounts nothing. */
export class Router {
  private readonly win: Window;
  private apps: AppEntry[] = [];
  private started = false;

  constructor(private readonly options: RouterOptions) {
    this.win = options.window ?? window;
  }

  /** Starts listening and immediately reports the current hash as an ordinary routeChanged. */
  start(apps: AppEntry[]): void {
    this.apps = apps;
    if (!this.started) {
      this.started = true;
      this.win.addEventListener('hashchange', this.onHashChange);
    }
    this.report();
  }

  navigate(path: string): void {
    this.win.location.hash = path;
  }

  stop(): void {
    this.win.removeEventListener('hashchange', this.onHashChange);
    this.started = false;
  }

  private readonly onHashChange = (): void => this.report();

  private report(): void {
    const path = normalize(this.win.location.hash);
    const entry = this.apps.find((app) => app.route === path) ?? null;
    this.options.notify({ type: 'routeChanged', path, entry });
  }
}

/** Empty hash, `#` and `#/` all mean home (`#/`). */
export function normalize(hash: string): string {
  return hash === '' || hash === '#' ? '#/' : hash;
}
