/** Outcome of a tracked request. `ignored`: aborted by the caller (superseded or disposed). */
export type RequestOutcome<T> = { status: 'ok'; value: T } | { status: 'failed'; error: unknown } | { status: 'ignored' };

export const REQUEST_TIMEOUT_MS = 10_000;

const TIMEOUT = Symbol('request-timeout');

interface Entry {
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Keeps at most one in-flight request per key, each with an AbortController and a timeout.
 * - A new request for the same key aborts the previous one (its outcome is `ignored`).
 * - After `timeoutMs` the request is aborted and its outcome is `failed` (a timeout is a failure).
 * - `abort(key)` / `abortAll()` cancel requests; their outcome is `ignored`.
 * The timeout uses `setTimeout` (not `AbortSignal.timeout`) so fake timers control it in tests.
 */
export class RequestTracker {
  readonly #entries = new Map<string, Entry>();

  readonly #timeoutMs: number;

  constructor(timeoutMs = REQUEST_TIMEOUT_MS) {
    this.#timeoutMs = timeoutMs;
  }

  async run<T>(key: string, request: (signal: AbortSignal) => Promise<T>): Promise<RequestOutcome<T>> {
    this.abort(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(TIMEOUT), this.#timeoutMs);
    const entry: Entry = { controller, timer };
    this.#entries.set(key, entry);
    const { signal } = controller;
    try {
      const value = await request(signal);
      // A late answer after an abort is discarded like the abort itself.
      if (signal.aborted) return signal.reason === TIMEOUT ? { status: 'failed', error: signal.reason } : { status: 'ignored' };
      return { status: 'ok', value };
    } catch (error) {
      if (signal.aborted && signal.reason !== TIMEOUT) return { status: 'ignored' };
      return { status: 'failed', error };
    } finally {
      clearTimeout(timer);
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
    }
  }

  abort(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.controller.abort();
    this.#entries.delete(key);
  }

  abortAll(): void {
    for (const key of [...this.#entries.keys()]) this.abort(key);
  }
}
