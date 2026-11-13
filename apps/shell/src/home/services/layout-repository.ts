/** Home layout persistence seam. The view depends only on `LayoutRepository`. */
import type { Logger } from '../../app/logger.ts';
import { defaultLayout, parseLayout, type Layout } from '../domain/layout.ts';

/** Async so a remote (REST) adapter can replace local storage without changing callers. */
export interface LayoutRepository {
  load(appIds: readonly string[]): Promise<Layout>;
  save(layout: Layout): Promise<void>;
}

/** Storage key that holds the layout document as JSON. */
export const LAYOUT_STORAGE_KEY = 'home:layout';

/** Stores one versioned JSON document in Web Storage. Never throws: failures are logged through `logger`. */
export class LocalStorageLayoutRepository implements LayoutRepository {
  readonly #logger: Logger;
  readonly #storage: () => Storage;

  /**
   * `storage` is resolved lazily on every call, inside the try blocks: reading `localStorage` itself
   * throws a `SecurityError` when site data is blocked.
   */
  constructor(logger: Logger, storage: () => Storage = () => localStorage) {
    this.#logger = logger;
    this.#storage = storage;
  }

  async load(appIds: readonly string[]): Promise<Layout> {
    const key = LAYOUT_STORAGE_KEY;
    let value: unknown;
    try {
      const raw = this.#storage().getItem(key);
      if (raw === null) return defaultLayout(appIds);
      value = JSON.parse(raw);
    } catch (error) {
      this.#logger.warn('could not read stored home layout; using default', { key, error: String(error) });
      return defaultLayout(appIds);
    }
    const { layout, invalid, clamped, droppedAppIds } = parseLayout(value, appIds);
    if (invalid) {
      this.#logger.warn('stored home layout is invalid; using default', { key, reason: invalid });
      return layout;
    }
    if (clamped) {
      this.#logger.warn('stored home layout size clamped', { key, columns: layout.columns, rows: layout.rows });
    }
    for (const appId of droppedAppIds) {
      this.#logger.warn('stored home layout references an unknown app; cell emptied', { key, appId });
    }
    return layout;
  }

  async save(layout: Layout): Promise<void> {
    const key = LAYOUT_STORAGE_KEY;
    try {
      this.#storage().setItem(key, JSON.stringify(layout));
    } catch (error) {
      this.#logger.warn('could not save home layout', { key, error: String(error) });
    }
  }
}
