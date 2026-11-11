import type { Logger } from './logger';
import { start, transition } from './transition';
import type { AppEntry, Command, ErrorScope, HostEvent, HostState } from './types';

/**
 * Command surfaces of the colleagues, as seen by the mediator.
 * The mediator depends on these shapes only, never on the colleague modules.
 */
export interface Colleagues {
  config: { load(): void };
  router: { start(apps: AppEntry[]): void; navigate(path: string): void };
  loader: { load(entry: AppEntry, activationId: number, retry: boolean): void };
  outlet: {
    showHome(apps: AppEntry[]): void;
    showLoading(entry: AppEntry): void;
    showError(scope: ErrorScope, message: string, retryable: boolean): void;
    showNotFound(path: string): void;
    mount(entry: AppEntry): void;
  };
  header: { render(apps: AppEntry[]): void; setActive(entry: AppEntry | null): void };
}

/**
 * Stores the host state, asks `transition` for the next step and runs the commands in order.
 * No DOM, fetch or import here. Notifications that arrive while commands are running
 * (e.g. the router reporting the initial hash synchronously) are queued, so each
 * event is fully processed before the next one (run-to-completion).
 */
export class HostMediator {
  private state: HostState | null = null;
  private readonly queue: HostEvent[] = [];
  private running = false;

  constructor(
    private readonly colleagues: Colleagues,
    private readonly log: Logger,
  ) {}

  get current(): HostState | null {
    return this.state;
  }

  start(): void {
    if (this.state) {
      this.log.warn('mediator already started');
      return;
    }
    const next = start();
    this.state = next.state;
    this.log.info('state changed', { to: next.state.name, event: 'start' });
    this.drain(next.commands);
  }

  notify(event: HostEvent): void {
    this.queue.push(event);
    this.drain([]);
  }

  private drain(initial: Command[]): void {
    if (this.running) return;
    this.running = true;
    try {
      this.runAll(initial);
      for (let event = this.queue.shift(); event; event = this.queue.shift()) {
        try {
          this.process(event);
        } catch (error) {
          this.log.error('event processing failed', { event: event.type, error });
        }
      }
    } finally {
      this.running = false;
    }
  }

  private process(event: HostEvent): void {
    if (!this.state) {
      this.log.warn('event before start ignored', { event: event.type });
      return;
    }
    const from = this.state.name;
    const next = transition(this.state, event);
    this.state = next.state;
    if (from !== next.state.name) {
      this.log.info('state changed', {
        from,
        to: next.state.name,
        event: event.type,
        activationId: next.state.activationId,
      });
    }
    this.runAll(next.commands);
  }

  private runAll(commands: Command[]): void {
    for (const command of commands) {
      try {
        this.execute(command);
      } catch (error) {
        this.log.error('command failed', { command: command.type, error });
      }
    }
  }

  private execute(command: Command): void {
    const { config, router, loader, outlet, header } = this.colleagues;
    switch (command.type) {
      case 'config.load': return config.load();
      case 'header.render': return header.render(command.apps);
      case 'header.setActive': return header.setActive(command.entry);
      case 'router.start': return router.start(command.apps);
      case 'router.navigate': return router.navigate(command.path);
      case 'outlet.showHome': return outlet.showHome(command.apps);
      case 'outlet.showLoading': return outlet.showLoading(command.entry);
      case 'outlet.showError': return outlet.showError(command.scope, command.message, command.retryable);
      case 'outlet.showNotFound': return outlet.showNotFound(command.path);
      case 'outlet.mount': return outlet.mount(command.entry);
      case 'loader.load': return loader.load(command.entry, command.activationId, command.retry);
      case 'log': return this.log[command.level](command.message, command.fields);
    }
  }
}
