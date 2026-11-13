/** The `fetch` signature the clients depend on (the global `fetch` in production, a fake in tests). */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  /** Defaults to the global `fetch`, read at call time. */
  fetch?: Fetch;
  signal?: AbortSignal;
}

/** GETs `url` as JSON. Non-2xx → `onStatus(status)` is thrown; network errors and aborts propagate. */
export async function getJson(url: URL, options: RequestOptions, onStatus: (status: number) => Error): Promise<unknown> {
  const fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const response = await fetchFn(url.toString(), { signal: options.signal });
  if (!response.ok) throw onStatus(response.status);
  return response.json();
}
