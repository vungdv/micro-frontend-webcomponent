import type { AppEntry } from '@mf/contracts';
import type { Logger } from '../app/logger.ts';
import type { DefineAppResult } from '../micro-frontends/loader.ts';

/**
 * Makes an app's tag available. `retry: true` asks for a cache-busting re-import; the attempt number
 * comes from the host's shared RetryCounter, so it never repeats a URL already tried.
 */
export type DefineApp = (appId: string, entry: AppEntry, retry: boolean) => Promise<DefineAppResult>;

export interface HomeCellOptions {
  /** The cell's region element; the cell owns its children. */
  container: HTMLElement;
  appId: string;
  entry: AppEntry;
  row: number;
  column: number;
  define: DefineApp;
  logger: Logger;
}

/**
 * One dashboard cell's lifecycle: loading → mounted | error (Retry → loading …). A failure is
 * contained in this cell. After `dispose()` a load that settles late does nothing.
 */
export class HomeCell {
  readonly #o: HomeCellOptions;
  #disposed = false;

  constructor(options: HomeCellOptions) {
    this.#o = options;
  }

  /** Starts the first load. */
  start(): void {
    void this.#load(false);
  }

  dispose(): void {
    this.#disposed = true;
    this.#o.container.replaceChildren();
  }

  async #load(retry: boolean): Promise<void> {
    const { container, appId, entry, row, column, define, logger } = this.#o;
    const doc = container.ownerDocument;
    const status = doc.createElement('p');
    status.className = 'mf-home-cell-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-busy', 'true');
    status.textContent = `Loading ${entry.tag}…`;
    container.replaceChildren(status);

    let result: DefineAppResult;
    try {
      result = await define(appId, entry, retry);
    } catch (error) {
      result = { ok: false, message: `could not load ${appId}`, cause: error instanceof Error ? error.message : String(error) };
    }
    if (this.#disposed) return;

    if (result.ok) {
      const element = doc.createElement(entry.tag);
      for (const [name, value] of Object.entries(entry.attributes ?? {})) element.setAttribute(name, value);
      container.replaceChildren(element);
      return;
    }

    logger.warn('cell failed to load', { appId, row, column, error: result.message, cause: result.cause });
    const message = doc.createElement('p');
    message.textContent = `Could not load ${appId}`;
    const retryButton = doc.createElement('button');
    retryButton.type = 'button';
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', () => void this.#load(true));
    const panel = doc.createElement('div');
    panel.className = 'mf-home-cell-error';
    panel.setAttribute('role', 'alert');
    panel.append(message, retryButton);
    container.replaceChildren(panel);
  }
}
