import { MF_NAVIGATE } from '@mf/contracts';
import { Header } from './layout/header.ts';
import { Outlet, type HomeViewFactory } from './layout/outlet.ts';
import { createConsoleLogger, type Logger } from './logger.ts';
import { HostMediator } from './mediator/host-mediator.ts';
import type { HostEvent } from './mediator/types.ts';
import { Router } from './router/router.ts';
import { ConfigLoader } from '../micro-frontends/registry.ts';
import { defineApp, ModuleLoader, RetryCounter, type Importer } from '../micro-frontends/loader.ts';
import { HomeView } from '../home/home-view.ts';
import { LocalStorageLayoutRepository } from '../home/services/layout-repository.ts';

export interface HostDependencies {
  window: Window;
  /** Where the Header renders its links. */
  nav: HTMLElement;
  /** The #mf-outlet element. */
  outlet: HTMLElement;
  fetch: typeof fetch;
  configUrl: string;
  importer?: Importer;
  loadTimeoutMs?: number;
  logger?: Logger;
}

export interface Host {
  mediator: HostMediator;
  start(): void;
  /** Removes the window listeners (hashchange, mf:navigate). */
  dispose(): void;
}

/**
 * Wiring only (M1 §2.3 rule 3): builds the colleagues, connects them to the mediator, and installs
 * the single window listener that turns the contract's `mf:navigate` into `navigateRequested`.
 */
export function createHost(deps: HostDependencies): Host {
  const logger = deps.logger ?? createConsoleLogger();
  // Colleagues are built before the mediator, so their notify forwards to it once it exists.
  let mediator: HostMediator | undefined;
  const notify = (event: HostEvent) => mediator?.notify(event);

  const repository = new LocalStorageLayoutRepository(logger);
  // One counter for routed loads and home cells, so a retry never reuses a URL already tried.
  const retries = new RetryCounter();
  const createHome: HomeViewFactory = (root, apps) =>
    new HomeView({
      root,
      apps,
      repository,
      define: (appId, entry, retry) =>
        defineApp(appId, entry, {
          importer: deps.importer,
          timeoutMs: deps.loadTimeoutMs,
          attempt: retry ? retries.next(entry.url) : 0,
        }),
      logger,
    });

  const router = new Router(notify, deps.window);
  mediator = new HostMediator({
    config: new ConfigLoader(notify, { fetch: deps.fetch, url: deps.configUrl }),
    header: new Header(deps.nav),
    router,
    loader: new ModuleLoader(notify, { importer: deps.importer, timeoutMs: deps.loadTimeoutMs, retries }),
    outlet: new Outlet(deps.outlet, notify, createHome),
    log: logger,
  });

  const onNavigate = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    const path = typeof detail === 'object' && detail !== null ? (detail as { path?: unknown }).path : undefined;
    if (typeof path === 'string') notify({ type: 'navigateRequested', path });
    else logger.warn(`${MF_NAVIGATE} ignored: detail.path must be a string`, { detail });
  };
  deps.window.addEventListener(MF_NAVIGATE, onNavigate);

  const host = mediator;
  return {
    mediator: host,
    start: () => host.start(),
    dispose: () => {
      deps.window.removeEventListener(MF_NAVIGATE, onNavigate);
      router.stop();
    },
  };
}
