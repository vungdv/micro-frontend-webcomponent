import { vi } from 'vitest';

/** Test-only fakes for the network edge (`fetch`). Nothing here touches the real network. */

export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** A minimal `Response` carrying a JSON body (services read only `ok`, `status` and `json()`). */
export function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/** Tracks the promises a fake returned, so tests can await the ones that have settled. */
function settledTracker() {
  const settled: Array<Promise<unknown>> = [];
  return {
    track(promise: Promise<Response>): Promise<Response> {
      const done = promise.then(
        () => undefined,
        () => undefined,
      );
      // Only promises that have actually settled are awaited; a held request must not block the test.
      void done.then(() => settled.push(done));
      return promise;
    },
    /** Resolves once every request that has settled so far has run its own callbacks. */
    async whenSettled(): Promise<void> {
      await Promise.all(settled);
    },
  };
}

/** One held request of `deferredFetch`; the test settles it explicitly. */
export interface DeferredCall {
  url: URL;
  signal: AbortSignal | undefined;
  resolve(response: Response): void;
  reject(error: unknown): void;
}

/**
 * Fake `fetch` whose requests stay pending until the test resolves or rejects them, so transient
 * states (loading, Updating…, Searching…) can be asserted. Honours `signal` like the real `fetch`.
 */
export function deferredFetch() {
  const calls: DeferredCall[] = [];
  const tracker = settledTracker();
  const fn = vi.fn<FetchFn>((input, init) =>
    tracker.track(
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? undefined;
        calls.push({ url: new URL(String(input)), signal, resolve, reject });
        if (signal?.aborted) reject(abortReason(signal));
        signal?.addEventListener('abort', () => reject(abortReason(signal)));
      }),
    ),
  );
  const fetch = Object.assign(fn, { whenSettled: tracker.whenSettled });
  return { fetch, calls };
}

/** Fake `fetch` that answers immediately from `route` (a `Response`, or an error to reject with). */
export function immediateFetch(route: (url: URL) => Response | Error) {
  const tracker = settledTracker();
  const fn = vi.fn<FetchFn>((input, init) =>
    tracker.track(
      (async () => {
        const signal = init?.signal ?? undefined;
        if (signal?.aborted) throw abortReason(signal);
        const result = route(new URL(String(input)));
        if (result instanceof Error) throw result;
        return result;
      })(),
    ),
  );
  return Object.assign(fn, { whenSettled: tracker.whenSettled });
}
