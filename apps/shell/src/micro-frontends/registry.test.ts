import { describe, expect, it, vi } from 'vitest';
import { TAGS } from '@mf/contracts';
import { ConfigLoader, validateHostConfig } from './registry.ts';
import devManifest from '../../public/host.config.json';
import prodManifest from '../../public/host.config.prod.json';
import type { HostEvent } from '../app/mediator/types.ts';

const valid = {
  apps: {
    todo: { route: '#/todo', url: 'http://localhost:5175/src/web-component.ts', tag: 'todo-app', attributes: { 'weather-route': '#/weather' } },
    weather: { route: '#/weather', url: './remotes/weather/weather-app.js', tag: 'weather-dashboard' },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The page the host runs on (document.baseURI) and the manifest URL it resolves to. */
const PAGE = 'https://x.test/repo/';
const MANIFEST = 'https://x.test/repo/host.config.json';
/** `valid` after validation: relative urls resolved against the manifest URL, absolute ones unchanged. */
const validResolved = {
  apps: {
    todo: valid.apps.todo,
    weather: { ...valid.apps.weather, url: 'https://x.test/repo/remotes/weather/weather-app.js' },
  },
};

async function load(fetchImpl: typeof fetch, url = 'host.config.json'): Promise<HostEvent[]> {
  const events: HostEvent[] = [];
  await new ConfigLoader((e) => events.push(e), { fetch: fetchImpl, url, baseURI: PAGE }).load();
  return events;
}

describe('ConfigLoader', () => {
  it('given a valid manifest, when load(), then it reports configLoaded with the config [TR-30]', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(valid));
    const events = await load(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('host.config.json', expect.objectContaining({ cache: 'no-cache' }));
    expect(events).toEqual([{ type: 'configLoaded', config: validResolved }]);
  });

  it('given a relative app url and the manifest at /repo/host.config.json, when load(), then the url is resolved against the manifest URL [TR-35]', async () => {
    const manifest = { apps: { todo: { route: '#/todo', url: './remotes/todo/todo-app.js', tag: 'todo-app' } } };
    const events = await load(async () => jsonResponse(manifest), '/repo/host.config.json');
    expect(events).toEqual([
      { type: 'configLoaded', config: { apps: { todo: { ...manifest.apps.todo, url: 'https://x.test/repo/remotes/todo/todo-app.js' } } } },
    ]);
  });

  it('given an absolute dev app url, when load(), then the url is unchanged [TR-35]', async () => {
    const events = await load(async () => jsonResponse({ apps: { todo: valid.apps.todo } }), '/repo/host.config.json');
    expect(events).toEqual([{ type: 'configLoaded', config: { apps: { todo: valid.apps.todo } } }]);
  });

  it('given the server answers 404, when load(), then it reports configFailed with the status [TR-31]', async () => {
    const events = await load(async () => jsonResponse({}, 404));
    expect(events).toEqual([{ type: 'configFailed', message: 'could not load host.config.json (HTTP 404)' }]);
  });

  it('given the network is down, when load(), then it reports configFailed [TR-31]', async () => {
    const events = await load(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(events).toEqual([{ type: 'configFailed', message: 'could not load host.config.json (Failed to fetch)' }]);
  });

  it('given the body is not JSON, when load(), then it reports configFailed [TR-32]', async () => {
    const events = await load(async () => jsonResponse('{ not json'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'configFailed', message: expect.stringMatching(/^host.config.json is not valid JSON/) });
  });

  it('given an invalid manifest, when load(), then it reports every validation error [TR-33]', async () => {
    const events = await load(async () => jsonResponse({ apps: { todo: { route: 'todo' } } }));
    expect(events).toEqual([
      {
        type: 'configFailed',
        message: 'invalid host.config.json: apps.todo.route must look like "#/name"; apps.todo.url must be a non-empty string; apps.todo.tag must be a non-empty string',
      },
    ]);
  });
});

describe('validateHostConfig', () => {
  const withApp = (app: Record<string, unknown>) => ({ apps: { a: { route: '#/a', url: './a.js', tag: 'a-app', ...app } } });
  const errorsOf = (data: unknown) => {
    const result = validateHostConfig(data, MANIFEST);
    return result.ok ? [] : result.errors;
  };

  it('given the documented manifest, then it is valid [TR-33]', () => {
    expect(validateHostConfig(valid, MANIFEST)).toEqual({ ok: true, config: validResolved });
  });

  it.each([null, [], 'x', {}, { apps: [] }, { apps: null }])(
    'given %j, then it requires an "apps" object [TR-33]',
    (data) => {
      expect(errorsOf(data)).toEqual(['"apps" must be an object of app id → entry']);
    },
  );

  it('given an entry that is not an object, then it is rejected [TR-33]', () => {
    expect(errorsOf({ apps: { a: 'x' } })).toEqual(['apps.a must be an object']);
  });

  it.each([
    [{ route: 1 }, 'apps.a.route must be a non-empty string'],
    [{ url: '' }, 'apps.a.url must be a non-empty string'],
    [{ url: 'http://[' }, 'apps.a.url "http://[" is not a valid URL'],
    [{ tag: undefined }, 'apps.a.tag must be a non-empty string'],
    [{ route: '/a' }, 'apps.a.route must look like "#/name"'],
    [{ route: '#/' }, 'apps.a.route must look like "#/name"'],
    [{ route: '#/A b' }, 'apps.a.route must look like "#/name"'],
    [{ tag: 'app' }, 'apps.a.tag "app" is not a valid custom element name'],
    [{ tag: 'Todo-App' }, 'apps.a.tag "Todo-App" is not a valid custom element name'],
    [{ tag: '1-app' }, 'apps.a.tag "1-app" is not a valid custom element name'],
    [{ tag: 'font-face' }, 'apps.a.tag "font-face" is not a valid custom element name'],
    [{ attributes: [] }, 'apps.a.attributes must be a flat object of name → string'],
    [{ attributes: { Units: 'metric' } }, 'apps.a.attributes name "Units" must match [a-z][a-z0-9-]*'],
    [{ attributes: { 'data_x': 'metric' } }, 'apps.a.attributes name "data_x" must match [a-z][a-z0-9-]*'],
    [{ attributes: { units: 1 } }, 'apps.a.attributes.units must be a string'],
    [{ attributes: { units: { nested: 'x' } } }, 'apps.a.attributes.units must be a string'],
  ])('given an entry with %j, then it reports "%s" [TR-33]', (patch, error) => {
    expect(errorsOf(withApp(patch))).toEqual([error]);
  });

  it('given two entries with the same tag, then it rejects the duplicate tag [TR-33]', () => {
    const data = {
      apps: {
        a: { route: '#/a', url: './a.js', tag: 'same-app' },
        b: { route: '#/b', url: './b.js', tag: 'same-app' },
      },
    };
    expect(errorsOf(data)).toEqual(['apps.b.tag "same-app" duplicates apps.a.tag']);
  });

  it('given two entries with the same route, then it rejects the duplicate route [TR-33]', () => {
    const data = {
      apps: {
        a: { route: '#/x', url: './a.js', tag: 'a-app' },
        b: { route: '#/x', url: './b.js', tag: 'b-app' },
      },
    };
    expect(errorsOf(data)).toEqual(['apps.b.route "#/x" duplicates apps.a.route']);
  });

  it('given an entry without attributes, then the config keeps it without attributes [TR-33]', () => {
    const result = validateHostConfig(withApp({}), MANIFEST);
    expect(result).toEqual({ ok: true, config: { apps: { a: { route: '#/a', url: 'https://x.test/repo/a.js', tag: 'a-app' } } } });
  });

  it('given unknown extra fields, then they are dropped from the validated config [TR-33]', () => {
    const result = validateHostConfig({ ...withApp({ extra: 1 }), other: true }, MANIFEST);
    expect(result).toEqual({ ok: true, config: { apps: { a: { route: '#/a', url: 'https://x.test/repo/a.js', tag: 'a-app' } } } });
  });
});

describe('shipped manifests', () => {
  it.each([
    ['host.config.json', devManifest],
    ['host.config.prod.json', prodManifest],
  ])('given public/%s, then it is valid and uses the contract tags [TR-34]', (_name, manifest) => {
    const result = validateHostConfig(manifest, MANIFEST);
    expect(result.ok).toBe(true);
    const tags = result.ok ? Object.values(result.config.apps).map((e) => e.tag) : [];
    expect(tags).toEqual([TAGS.todo, TAGS.weather]);
  });
});
