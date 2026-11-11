import { describe, expect, it, vi } from 'vitest';
import { ConfigLoader, parseConfig } from '../src/config-loader';
import type { HostEvent } from '../src/types';

const MANIFEST_URL = 'https://host.example/app/host.config.json';
const valid = {
  apps: {
    todo: { route: '#/todo', url: './remotes/todo/todo-app.js', tag: 'todo-app' },
    weather: { route: '#/weather', url: 'http://localhost:5176/src/weather-app.ts', tag: 'weather-dashboard' },
  },
};

function load(fetchImpl: typeof fetch): Promise<HostEvent> {
  return new Promise((resolve) => {
    new ConfigLoader({ url: MANIFEST_URL, notify: resolve, fetch: fetchImpl }).load();
  });
}

const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

describe('ConfigLoader', () => {
  it('reports configLoaded with entries and URLs resolved against the manifest URL', async () => {
    const fetchImpl = respond(JSON.stringify(valid));
    const event = await load(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(MANIFEST_URL, expect.anything());
    expect(event).toEqual({
      type: 'configLoaded',
      config: {
        apps: [
          { name: 'todo', route: '#/todo', url: 'https://host.example/app/remotes/todo/todo-app.js', tag: 'todo-app' },
          { name: 'weather', route: '#/weather', url: 'http://localhost:5176/src/weather-app.ts', tag: 'weather-dashboard' },
        ],
      },
    });
  });

  it('reports configFailed on a network failure', async () => {
    const event = await load((async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    expect(event.type).toBe('configFailed');
    expect(event.type === 'configFailed' && event.error.message).toBe('Failed to fetch');
  });

  it('reports configFailed on a non-OK HTTP status', async () => {
    const event = await load(respond('not found', 404));
    expect(event.type === 'configFailed' && event.error.message).toMatch(/HTTP 404/);
  });

  it('reports configFailed on invalid JSON', async () => {
    const event = await load(respond('{ not json'));
    expect(event.type === 'configFailed' && event.error.message).toMatch(/not valid JSON/);
  });

  it('reports configFailed on an invalid manifest', async () => {
    const event = await load(respond(JSON.stringify({ apps: { todo: { ...valid.apps.todo, tag: 'todo' } } })));
    expect(event.type === 'configFailed' && event.error.message).toMatch(/hyphen/);
  });
});

describe('parseConfig', () => {
  const withApps = (apps: Record<string, unknown>) => () => parseConfig({ apps }, MANIFEST_URL);

  it('rejects a manifest without apps', () => {
    expect(() => parseConfig({}, MANIFEST_URL)).toThrow(/apps/);
    expect(() => parseConfig(null, MANIFEST_URL)).toThrow(/apps/);
    expect(() => parseConfig({ apps: [] }, MANIFEST_URL)).toThrow(/apps/);
  });

  it('rejects duplicate routes', () => {
    expect(withApps({ ...valid.apps, other: { route: '#/todo', url: 'x.js', tag: 'other-app' } })).toThrow(
      /duplicate route "#\/todo"/,
    );
  });

  it('rejects duplicate tags', () => {
    expect(withApps({ ...valid.apps, other: { route: '#/other', url: 'x.js', tag: 'todo-app' } })).toThrow(
      /duplicate tag "todo-app"/,
    );
  });

  it.each(['todo', '/todo', '#todo', '#/', 42])('rejects route %j', (route) => {
    expect(withApps({ todo: { ...valid.apps.todo, route } })).toThrow(/route/);
  });

  it.each(['todo', 'TodoApp', 'Todo-App', '-todo', '', 7])('rejects tag %j', (tag) => {
    expect(withApps({ todo: { ...valid.apps.todo, tag } })).toThrow(/tag/);
  });

  it.each(['', '   ', undefined])('rejects url %j', (url) => {
    expect(withApps({ todo: { ...valid.apps.todo, url } })).toThrow(/url/);
  });

  it('rejects a non-object entry', () => {
    expect(withApps({ todo: 'todo-app' })).toThrow(/apps.todo/);
  });

  it.each(['javascript:alert(1)', 'data:text/javascript,export{}', 'file:///etc/passwd', 'blob:https://x/1'])(
    'rejects url %j whose protocol is not http(s)',
    (url) => {
      expect(withApps({ todo: { ...valid.apps.todo, url } })).toThrow(/http: or https:/);
    },
  );

  it.each([
    'annotation-xml',
    'color-profile',
    'font-face',
    'font-face-src',
    'font-face-uri',
    'font-face-format',
    'font-face-name',
    'missing-glyph',
  ])('rejects reserved tag %s', (tag) => {
    expect(withApps({ todo: { ...valid.apps.todo, tag } })).toThrow(/reserved/);
  });

  it.each(['', '  '])('rejects empty app name %j', (name) => {
    expect(withApps({ [name]: valid.apps.todo })).toThrow(/app names/);
  });

  it.each(['#/to do', '#/todo ', '#/\ttodo', '#/todo\n'])('rejects route %j containing whitespace', (route) => {
    expect(withApps({ todo: { ...valid.apps.todo, route } })).toThrow(/whitespace/);
  });
});
