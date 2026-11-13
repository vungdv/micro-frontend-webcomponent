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
  /** Retry attempts per url; share one with every other loader of the same remotes (home cells). */
  retries?: RetryCounter;
}

/**
 * Hands out increasing retry attempt numbers per url (1, 2, …), so every retry imports a URL the
 * browser has not cached as failed. One instance is shared by everything that loads remotes.
 */
export class RetryCounter {
  readonly #attempts = new Map<string, number>();

  next(url: string): number {
    const attempt = (this.#attempts.get(url) ?? 0) + 1;
    this.#attempts.set(url, attempt);
    return attempt;
  }
}

const defaultImporter: Importer = (url) => import(/* @vite-ignore */ url);

/**
 * Colleague (facade over defineApp): reports appLoaded / appFailed; retry attempts come from a
 * RetryCounter, so every retry gets a fresh cache-buster.
 */
export class ModuleLoader {
  readonly #notify: Notify;
  readonly #importer: Importer;
  readonly #registry: ElementRegistry;
  readonly #timeoutMs: number;
  readonly #retries: RetryCounter;

  constructor(notify: Notify, options: ModuleLoaderOptions = {}) {
    this.#notify = notify;
    this.#importer = options.importer ?? defaultImporter;
    this.#registry = options.registry ?? customElements;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
    this.#retries = options.retries ?? new RetryCounter();
  }

  async load(appId: string, entry: AppEntry, activationId: number, retry: boolean): Promise<void> {
    let attempt = 0;
    if (retry && !this.#registry.get(entry.tag)) attempt = this.#retries.next(entry.url);
    const result = await defineApp(appId, entry, {
      importer: this.#importer,
      registry: this.#registry,
      timeoutMs: this.#timeoutMs,
      attempt,
    });
    if (result.ok) return this.#notify({ type: 'appLoaded', appId, activationId });
    this.#notify({
      type: 'appFailed', appId, activationId, message: result.message,
      ...(result.cause === undefined ? {} : { cause: result.cause }),
    });
  }
}

export interface DefineAppOptions {
  importer?: Importer;
  registry?: ElementRegistry;
  /** Budget for import(url) + whenDefined(tag) together. */
  timeoutMs?: number;
  /** Retry attempt; > 0 appends `retry=<attempt>` to the url as a cache-buster. */
  attempt?: number;
}

export type DefineAppResult = { ok: true } | { ok: false; message: string; cause?: string };

/**
 * Makes a remote's tag available: skips the import when the tag is already defined; otherwise
 * import(url) then whenDefined(tag), bounded by a timeout that is always cleared.
 */
export async function defineApp(
  appId: string,
  entry: AppEntry,
  options: DefineAppOptions = {},
): Promise<DefineAppResult> {
  const importer = options.importer ?? defaultImporter;
  const registry = options.registry ?? customElements;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  const attempt = options.attempt ?? 0;
  const { tag } = entry;
  if (registry.get(tag)) return { ok: true };

  const url = attempt > 0 ? withRetryQuery(entry.url, attempt) : entry.url;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  let cause = '';
  const ready = (async () => {
    try {
      await importer(url);
    } catch (error) {
      cause = error instanceof Error ? error.message : String(error);
      return 'unreachable' as const;
    }
    await registry.whenDefined(tag);
    return 'defined' as const;
  })();

  try {
    const outcome = await Promise.race([ready, timeout]);
    if (outcome === 'defined') return { ok: true };
    if (outcome === 'unreachable') return { ok: false, message: `could not reach ${appId}`, cause };
    return { ok: false, message: `timed out waiting for ${tag}` };
  } finally {
    clearTimeout(timer);
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
