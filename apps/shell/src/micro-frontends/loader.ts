import type { AppEntry } from '@mf/contracts';
import type { Notify } from '../app/mediator/types.ts';

export const DEFAULT_LOAD_TIMEOUT_MS = 10_000;

export type Importer = (url: string) => Promise<unknown>;
export type ElementRegistry = Pick<CustomElementRegistry, 'get' | 'whenDefined'>;

export interface ModuleLoaderOptions {
  importer?: Importer;
  registry?: ElementRegistry;
  /** Budget for import(url) + whenDefined(tag) together. */
  timeoutMs?: number;
}

const defaultImporter: Importer = (url) => import(/* @vite-ignore */ url);

/**
 * Colleague: makes a remote's tag available. Skips the import when the tag is already defined;
 * otherwise import(url) then whenDefined(tag), bounded by a timeout. Reports appLoaded / appFailed.
 */
export class ModuleLoader {
  readonly #notify: Notify;
  readonly #importer: Importer;
  readonly #registry: ElementRegistry;
  readonly #timeoutMs: number;
  /** Retry attempts per url, so every retry gets a fresh cache-buster. */
  readonly #attempts = new Map<string, number>();

  constructor(notify: Notify, options: ModuleLoaderOptions = {}) {
    this.#notify = notify;
    this.#importer = options.importer ?? defaultImporter;
    this.#registry = options.registry ?? customElements;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  }

  async load(appId: string, entry: AppEntry, activationId: number, retry: boolean): Promise<void> {
    const { tag } = entry;
    if (this.#registry.get(tag)) {
      return this.#notify({ type: 'appLoaded', appId, activationId });
    }

    let url = entry.url;
    if (retry) {
      const attempt = (this.#attempts.get(entry.url) ?? 0) + 1;
      this.#attempts.set(entry.url, attempt);
      url = withRetryQuery(entry.url, attempt);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.#timeoutMs);
    });
    let cause = '';
    const ready = (async () => {
      try {
        await this.#importer(url);
      } catch (error) {
        cause = error instanceof Error ? error.message : String(error);
        return 'unreachable' as const;
      }
      await this.#registry.whenDefined(tag);
      return 'defined' as const;
    })();

    try {
      const outcome = await Promise.race([ready, timeout]);
      if (outcome === 'defined') this.#notify({ type: 'appLoaded', appId, activationId });
      else if (outcome === 'unreachable') {
        this.#notify({ type: 'appFailed', appId, activationId, message: `could not reach ${appId}`, cause });
      } else {
        this.#notify({ type: 'appFailed', appId, activationId, message: `timed out waiting for ${tag}` });
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Adds `retry=<n>` to the query string, keeping any existing query and fragment. */
export function withRetryQuery(url: string, attempt: number): string {
  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt);
  const separator = !base.includes('?') ? '?' : base.endsWith('?') || base.endsWith('&') ? '' : '&';
  return `${base}${separator}retry=${attempt}${fragment}`;
}
