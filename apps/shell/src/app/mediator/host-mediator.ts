import type { AppEntry } from '@mf/contracts';
import { initialState, transition } from './transition.ts';
import type { Apps, ErrorScope, HostCommand, HostEvent, HostState } from './types.ts';

/** What the mediator needs from each colleague: command methods only, no return values. */
export interface Colleagues {
  config: { load(): void };
  header: { render(apps: Apps): void; setActive(appId: string | null): void };
  router: { start(apps: Apps): void; navigate(path: string): void };
  loader: { load(appId: string, entry: AppEntry, activationId: number, retry: boolean): void };
  outlet: {
    showHome(apps: Apps): void;
    showLoading(entry: AppEntry): void;
    showNotFound(hash: string): void;
    showError(scope: ErrorScope, message: string, retryable: boolean): void;
    mount(entry: AppEntry): void;
  };
  log: { warn(message: string, data: Record<string, unknown>): void };
}

/**
 * Stores the host state, runs `transition`, and dispatches the resulting commands (M1 §2.3).
 * Notifications that arrive while commands run are queued, so each event is handled to completion.
 */
export class HostMediator {
  #state: HostState = initialState;
  readonly #queue: HostEvent[] = [];
  #draining = false;
  readonly #colleagues: Colleagues;

  constructor(colleagues: Colleagues) {
    this.#colleagues = colleagues;
  }

  get state(): HostState {
    return this.#state;
  }

  start(): void {
    this.notify({ type: 'start' });
  }

  notify = (event: HostEvent): void => {
    this.#queue.push(event);
    if (this.#draining) return;
    this.#draining = true;
    try {
      for (let next = this.#queue.shift(); next; next = this.#queue.shift()) {
        const result = transition(this.#state, next);
        this.#state = result.state;
        for (const command of result.commands) this.#run(command);
      }
    } finally {
      this.#draining = false;
    }
  };

  #run(command: HostCommand): void {
    const c = this.#colleagues;
    try {
      switch (command.type) {
        case 'config.load': return c.config.load();
        case 'header.render': return c.header.render(command.apps);
        case 'header.setActive': return c.header.setActive(command.appId);
        case 'router.start': return c.router.start(command.apps);
        case 'router.navigate': return c.router.navigate(command.path);
        case 'loader.load':
          return c.loader.load(command.appId, command.entry, command.activationId, command.retry);
        case 'outlet.showHome': return c.outlet.showHome(command.apps);
        case 'outlet.showLoading': return c.outlet.showLoading(command.entry);
        case 'outlet.showNotFound': return c.outlet.showNotFound(command.hash);
        case 'outlet.showError': return c.outlet.showError(command.scope, command.message, command.retryable);
        case 'outlet.mount': return c.outlet.mount(command.entry);
        case 'log.warn': return c.log.warn(command.message, command.data);
      }
    } catch (error) {
      c.log.warn('command failed', { command: command.type, error: String(error) });
    }
  }
}
