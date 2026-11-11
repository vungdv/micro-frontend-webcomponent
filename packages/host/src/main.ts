import { MF_NAVIGATE } from '@mf/shared-contracts';
import { ConfigLoader } from './config-loader';
import { Header } from './header';
import { HostMediator } from './host-mediator';
import { createLogger } from './logger';
import { ModuleLoader, type Importer } from './module-loader';
import { Outlet } from './outlet';
import { Router } from './router';
import type { HostEvent } from './types';

export interface WireOptions {
  /** Overrides for tests; production uses the defaults. */
  importer?: Importer;
  timeoutMs?: number;
}

/**
 * Composition root: the only module that knows every colleague.
 * Wires them to the mediator and installs the single `mf:navigate` listener. Call `start()` on the result.
 */
export function wire(options: WireOptions = {}): HostMediator {
  const log = createLogger('host');
  let mediator: HostMediator | undefined;
  const notify = (event: HostEvent): void => mediator?.notify(event);

  const headerEl = document.getElementById('mf-header');
  const outletEl = document.getElementById('mf-outlet');
  if (!headerEl || !outletEl) throw new Error('index.html must contain #mf-header and #mf-outlet');

  mediator = new HostMediator(
    {
      config: new ConfigLoader({ url: new URL('host.config.json', document.baseURI).href, notify }),
      router: new Router({ notify }),
      loader: new ModuleLoader({ notify, importer: options.importer, timeoutMs: options.timeoutMs }),
      outlet: new Outlet({ element: outletEl, notify }),
      header: new Header({ element: headerEl }),
    },
    log,
  );

  // The single host listener for the contract event: apps ask, the mediator decides.
  window.addEventListener(MF_NAVIGATE, (event) => {
    const path = event.detail?.path;
    if (typeof path !== 'string') {
      log.warn('malformed mf:navigate ignored', { detail: event.detail });
      return;
    }
    notify({ type: 'navigateRequested', path });
  });

  return mediator;
}
