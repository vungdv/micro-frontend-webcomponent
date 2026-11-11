/**
 * Boundary fakes (docs/specs/03.testing.md §3): network (`fetch`, `importer`), the custom element
 * registry, and recording collaborators for the mediator. Never fakes of the unit under test.
 */
import type { Colleagues } from '../../src/host-mediator';
import type { LogFields, Logger } from '../../src/logger';
import type { Importer } from '../../src/module-loader';
import type { AppEntry, HostEvent, LogLevel, Notify } from '../../src/types';

/** Records every notification; `next()` resolves with the next one. */
export function recordingNotify(): { notify: Notify; events: HostEvent[]; next(): Promise<HostEvent> } {
  const events: HostEvent[] = [];
  const waiters: Array<(event: HostEvent) => void> = [];
  const notify: Notify = (event) => {
    events.push(event);
    waiters.shift()?.(event);
  };
  return { notify, events, next: () => new Promise((resolve) => waiters.push(resolve)) };
}

export interface LogRecord {
  level: LogLevel;
  msg: string;
  fields?: LogFields;
}

/** A Logger that keeps records in memory. */
export function recordingLogger(): Logger & { records: LogRecord[]; at(level: LogLevel): LogRecord[] } {
  const records: LogRecord[] = [];
  const write = (level: LogLevel) => (msg: string, fields?: LogFields) => void records.push({ level, msg, fields });
  return {
    records,
    at: (level) => records.filter((r) => r.level === level),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
  };
}

type FetchReply = { status?: number; body: string } | { networkError: string };

/** A `fetch` that answers from a script (default: the last reply repeats) and records requested URLs. */
export function recordingFetch(...replies: FetchReply[]): typeof fetch & { urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    urls.push(String(input));
    const reply = replies[Math.min(i++, replies.length - 1)];
    if ('networkError' in reply) throw new TypeError(reply.networkError);
    return new Response(reply.body, { status: reply.status ?? 200 });
  };
  return Object.assign(fn as typeof fetch, { urls });
}

/** Shorthand for a JSON reply. */
export const json = (value: unknown, status = 200): FetchReply => ({ status, body: JSON.stringify(value) });

/** In-memory CustomElementRegistry: `get`, `define`, `whenDefined`. */
export function fakeRegistry(): CustomElementRegistry & { defined: string[] } {
  const defs = new Map<string, CustomElementConstructor>();
  const waiters = new Map<string, Array<(ctor: CustomElementConstructor) => void>>();
  const defined: string[] = [];
  const registry = {
    defined,
    get: (tag: string) => defs.get(tag),
    define(tag: string, ctor: CustomElementConstructor) {
      if (defs.has(tag)) throw new DOMException(`"${tag}" has already been defined`, 'NotSupportedError');
      defs.set(tag, ctor);
      defined.push(tag);
      for (const resolve of waiters.get(tag) ?? []) resolve(ctor);
      waiters.delete(tag);
    },
    whenDefined(tag: string): Promise<CustomElementConstructor> {
      const ctor = defs.get(tag);
      if (ctor) return Promise.resolve(ctor);
      return new Promise((resolve) => waiters.set(tag, [...(waiters.get(tag) ?? []), resolve]));
    },
  };
  return registry as unknown as CustomElementRegistry & { defined: string[] };
}

type ImportBehaviour =
  /** The module runs and defines this tag. */
  | { define: string }
  /** The import rejects (remote down, syntax error, ...). */
  | { reject: string }
  /** The module loads but never defines its tag. */
  | 'noDefine'
  /** The import never settles. */
  | 'hang';

/**
 * A scripted dynamic `import()`: behaviour per URL prefix (the query string is ignored),
 * changeable between calls with `script()`. Records every URL it was given.
 */
export function scriptedImporter(
  registry: Pick<CustomElementRegistry, 'define'>,
  initial: Record<string, ImportBehaviour> = {},
): Importer & { urls: string[]; script(prefix: string, behaviour: ImportBehaviour): void } {
  const behaviours = new Map(Object.entries(initial));
  const urls: string[] = [];
  const importer = async (url: string): Promise<unknown> => {
    urls.push(url);
    const prefix = [...behaviours.keys()].find((p) => url.startsWith(p));
    const behaviour = prefix ? behaviours.get(prefix)! : { reject: `no script for ${url}` };
    if (behaviour === 'hang') return new Promise(() => {});
    if (behaviour === 'noDefine') return {};
    if ('reject' in behaviour) throw new TypeError(behaviour.reject);
    registry.define(behaviour.define, class extends HTMLElement {});
    return {};
  };
  return Object.assign(importer, { urls, script: (p: string, b: ImportBehaviour) => void behaviours.set(p, b) });
}

/**
 * Colleagues that record every command into one ordered journal, e.g. `outlet.showLoading(todo)`.
 * Entries are shown by app name; other arguments as JSON.
 * `behaviour` lets a test make a command throw or notify synchronously (as the real Router does on start).
 */
export function recordingColleagues(
  behaviour: Partial<Record<string, (...args: unknown[]) => void>> = {},
): Colleagues & { journal: string[] } {
  const journal: string[] = [];
  const show = (arg: unknown): string =>
    typeof arg === 'object' && arg !== null && 'tag' in arg
      ? (arg as AppEntry).name
      : Array.isArray(arg)
        ? `[${arg.map(show).join(',')}]`
        : JSON.stringify(arg);
  const rec =
    (name: string) =>
    (...args: unknown[]): void => {
      journal.push(`${name}(${args.map(show).join(', ')})`);
      behaviour[name]?.(...args);
    };
  return {
    journal,
    config: { load: rec('config.load') },
    router: { start: rec('router.start'), navigate: rec('router.navigate') },
    loader: { load: rec('loader.load') },
    outlet: {
      showHome: rec('outlet.showHome'),
      showLoading: rec('outlet.showLoading'),
      showError: rec('outlet.showError'),
      showNotFound: rec('outlet.showNotFound'),
      mount: rec('outlet.mount'),
    },
    header: { render: rec('header.render'), setActive: rec('header.setActive') },
  };
}
