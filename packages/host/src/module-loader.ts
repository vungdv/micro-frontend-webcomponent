import type { AppEntry, Notify } from './types';

export type Importer = (url: string) => Promise<unknown>;

export interface ModuleLoaderOptions {
  notify: Notify;
  /** Injected so tests do not hit the network. */
  importer?: Importer;
  registry?: CustomElementRegistry;
  /** Covers import + whenDefined. */
  timeoutMs?: number;
}

const defaultImporter: Importer = (url) => import(/* @vite-ignore */ url);

/**
 * Loads a remote bundle and waits for its root element to be defined.
 * Reports appLoaded / appFailed with the activation id it was given. Never touches the DOM.
 */
export class ModuleLoader {
  private readonly importer: Importer;
  private readonly registry: CustomElementRegistry;
  private readonly timeoutMs: number;
  private attempt = 0;
  /** URLs whose import failed once; later attempts bypass the cached failure. */
  private readonly failedUrls = new Set<string>();

  constructor(private readonly options: ModuleLoaderOptions) {
    this.importer = options.importer ?? defaultImporter;
    this.registry = options.registry ?? customElements;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  load(entry: AppEntry, activationId: number, retry: boolean): void {
    void this.run(entry, activationId, retry);
  }

  private async run(entry: AppEntry, activationId: number, retry: boolean): Promise<void> {
    if (this.registry.get(entry.tag)) {
      this.options.notify({ type: 'appLoaded', entry, activationId });
      return;
    }
    // After a failure (or on an explicit retry), bypass the cached failed module with a unique query.
    const bust = retry || this.failedUrls.has(entry.url);
    const url = bust ? withRetryParam(entry.url, ++this.attempt) : entry.url;
    let failure: Error | null = null;
    try {
      await withTimeout(
        (async () => {
          await this.importer(url);
          await this.registry.whenDefined(entry.tag);
        })(),
        this.timeoutMs,
        `timed out after ${this.timeoutMs} ms waiting for <${entry.tag}>`,
      );
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    // Report outside the try so a throwing notify can never also report appFailed for this id.
    if (failure) {
      this.failedUrls.add(entry.url);
      this.options.notify({ type: 'appFailed', entry, activationId, error: failure });
    } else {
      this.options.notify({ type: 'appLoaded', entry, activationId });
    }
  }
}

function withRetryParam(url: string, attempt: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set('mf-retry', String(attempt));
  return parsed.href;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
