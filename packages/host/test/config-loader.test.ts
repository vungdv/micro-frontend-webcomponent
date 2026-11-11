import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigLoader } from '../src/config-loader';
import type { HostEvent } from '../src/types';
import { aManifest, anApp } from './support/builders';
import { json, recordingFetch, recordingNotify } from './support/fakes';

const MANIFEST_URL = 'https://host.example/app/host.config.json';

/** Runs `ConfigLoader.load()` against `fetchFn` and resolves with the single notification it sends. */
async function load(fetchFn?: typeof fetch): Promise<{ event: HostEvent; events: HostEvent[] }> {
  const recorder = recordingNotify();
  const next = recorder.next();
  new ConfigLoader({ url: MANIFEST_URL, notify: recorder.notify, fetch: fetchFn }).load();
  return { event: await next, events: recorder.events };
}

/** The message of a `configFailed`, or a failure if the event is anything else. */
function failure(event: HostEvent): string {
  if (event.type !== 'configFailed') throw new Error(`expected configFailed, got ${event.type}`);
  return event.error.message;
}

/** A `fetch` that rejects with `value` (which need not be an Error). */
function rejectingFetch(value: unknown): typeof fetch {
  return (async () => {
    throw value;
  }) as unknown as typeof fetch;
}

const todoEntry = aManifest(anApp('todo')).apps.todo;
/** A raw manifest whose `todo` entry has `patch` applied. */
const withTodo = (patch: Record<string, unknown>) => ({ apps: { todo: { ...todoEntry, ...patch } } });
/** A raw manifest with the valid `todo` and `weather` entries plus `extra`. */
const withExtra = (extra: Record<string, unknown>) => ({ apps: { ...aManifest().apps, ...extra } });

describe('Given a manifest with two valid apps, one with a relative URL', () => {
  const todo = anApp('todo', { url: './remotes/todo/todo-app.js' });
  const weather = anApp('weather');
  let fetchFn: ReturnType<typeof recordingFetch>;

  beforeEach(() => {
    fetchFn = recordingFetch(json(aManifest(todo, weather)));
  });

  describe('when ConfigLoader.load() runs', () => {
    let result: Awaited<ReturnType<typeof load>>;
    beforeEach(async () => {
      result = await load(fetchFn);
    });

    it('then the manifest URL is fetched [CF-01]', () => {
      expect(fetchFn.urls).toEqual([MANIFEST_URL]);
    });

    it('then configLoaded is sent once, with URLs resolved against the manifest URL [CF-01]', () => {
      expect(result.events).toHaveLength(1);
      expect(result.event).toEqual({
        type: 'configLoaded',
        config: {
          apps: [{ ...todo, url: 'https://host.example/app/remotes/todo/todo-app.js' }, weather],
        },
      });
    });
  });

  describe('when no fetch is injected and load() runs', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('then the global fetch is used and configLoaded is sent [CF-01]', async () => {
      vi.stubGlobal('fetch', fetchFn);
      const { event } = await load();
      expect(fetchFn.urls).toEqual([MANIFEST_URL]);
      expect(event.type).toBe('configLoaded');
    });
  });
});

describe.each<[string, () => typeof fetch, RegExp]>([
  ['the server answers 404', () => recordingFetch({ status: 404, body: 'not found' }), /^HTTP 404 fetching https:\/\/host\.example\/app\/host\.config\.json$/],
  ['the server answers invalid JSON', () => recordingFetch({ body: '{ not json' }), /host\.config\.json is not valid JSON$/],
  ['the network fails', () => recordingFetch({ networkError: 'Failed to fetch' }), /^Failed to fetch$/],
])('Given %s', (_label, fetchFn, cause) => {
  describe('when load() runs', () => {
    let result: Awaited<ReturnType<typeof load>>;
    beforeEach(async () => {
      result = await load(fetchFn());
    });

    it('then configFailed is sent once, with a message naming the cause [CF-02]', () => {
      expect(result.events).toHaveLength(1);
      expect(failure(result.event)).toMatch(cause);
    });
  });
});

describe.each<[string, unknown, RegExp]>([
  ['a duplicate route', withExtra({ other: { route: '#/todo', url: 'x.js', tag: 'other-app' } }), /duplicate route "#\/todo" \(apps\.other\)/],
  ['a duplicate tag', withExtra({ other: { route: '#/other', url: 'x.js', tag: 'todo-app' } }), /duplicate tag "todo-app" \(apps\.other\)/],
  ...[
    'annotation-xml',
    'color-profile',
    'font-face',
    'font-face-src',
    'font-face-uri',
    'font-face-format',
    'font-face-name',
    'missing-glyph',
  ].map((tag): [string, unknown, RegExp] => [`the reserved tag ${tag}`, withTodo({ tag }), /apps\.todo\.tag ".*" is a reserved element name/]),
  ...['todo', 'TodoApp', 'Todo-App', '-todo', '', 7].map((tag): [string, unknown, RegExp] => [
    `the tag ${JSON.stringify(tag)} (not a lowercase name with a hyphen)`,
    withTodo({ tag }),
    /apps\.todo\.tag must be a lowercase custom element name containing a hyphen/,
  ]),
  ...['javascript:alert(1)', 'data:text/javascript,export{}', 'file:///etc/passwd', 'blob:https://x/1'].map(
    (url): [string, unknown, RegExp] => [`the non-http URL ${url}`, withTodo({ url }), /apps\.todo\.url must use http: or https:/],
  ),
])('Given a manifest with %s', (_label, manifest, offending) => {
  describe('when load() runs', () => {
    let event: HostEvent;
    beforeEach(async () => {
      ({ event } = await load(recordingFetch(json(manifest))));
    });

    it('then configFailed names the offending apps.<name> field [CF-03]', () => {
      expect(failure(event)).toMatch(offending);
    });
  });
});

describe.each<[string, unknown, RegExp]>([
  ['no apps key', {}, /manifest must have an "apps" object/],
  ['a null body', null, /manifest must have an "apps" object/],
  ['apps as an array', { apps: [] }, /manifest must have an "apps" object/],
  ['a non-object entry', { apps: { todo: 'todo-app' } }, /apps\.todo must be an object/],
  ...['', '  '].map((name): [string, unknown, RegExp] => [
    `the empty app name ${JSON.stringify(name)}`,
    { apps: { [name]: todoEntry } },
    /app names must be non-empty/,
  ]),
  ...['todo', '/todo', '#todo', '#/', 42].map((route): [string, unknown, RegExp] => [
    `the route ${JSON.stringify(route)} (not #/<name>)`,
    withTodo({ route }),
    /apps\.todo\.route must start with "#\/", name a route and contain no whitespace/,
  ]),
  ...['#/to do', '#/todo ', '#/\ttodo', '#/todo\n'].map((route): [string, unknown, RegExp] => [
    `the route ${JSON.stringify(route)} (contains whitespace)`,
    withTodo({ route }),
    /apps\.todo\.route .*whitespace/,
  ]),
  ...['', '   ', undefined].map((url): [string, unknown, RegExp] => [
    `the URL ${JSON.stringify(url)} (empty)`,
    withTodo({ url }),
    /apps\.todo\.url must be a non-empty string/,
  ]),
])('Given a manifest with %s', (_label, manifest, offending) => {
  describe('when load() runs', () => {
    let event: HostEvent;
    beforeEach(async () => {
      ({ event } = await load(recordingFetch(json(manifest))));
    });

    it('then configFailed names the offending field [CF-04]', () => {
      expect(failure(event)).toMatch(offending);
    });
  });
});

describe('Given fetch rejects with a value that is not an Error', () => {
  describe('when load() runs', () => {
    let event: HostEvent;
    beforeEach(async () => {
      ({ event } = await load(rejectingFetch('socket closed')));
    });

    it('then configFailed carries an Error whose message is that value [CF-05]', () => {
      expect(event.type).toBe('configFailed');
      const error = event.type === 'configFailed' ? event.error : undefined;
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('socket closed');
    });
  });
});
