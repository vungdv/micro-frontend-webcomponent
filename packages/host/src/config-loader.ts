import type { AppEntry, HostConfig, Notify } from './types';

/** Names the HTML spec reserves; they can never be custom element names. */
const RESERVED_TAGS = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

export interface ConfigLoaderOptions {
  /** Absolute URL of host.config.json. App URLs are resolved against it. */
  url: string;
  notify: Notify;
  fetch?: typeof fetch;
}

/** Fetches and validates the manifest; reports configLoaded / configFailed. */
export class ConfigLoader {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ConfigLoaderOptions) {
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  }

  load(): void {
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      const response = await this.fetchFn(this.options.url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${this.options.url}`);
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new Error(`${this.options.url} is not valid JSON`);
      }
      this.options.notify({ type: 'configLoaded', config: parseConfig(raw, this.options.url) });
    } catch (error) {
      this.options.notify({ type: 'configFailed', error: toError(error) });
    }
  }
}

/** Validates the manifest shape and the namespacing rules. Throws on the first problem. */
export function parseConfig(raw: unknown, baseUrl: string): HostConfig {
  if (!isRecord(raw) || !isRecord(raw.apps)) throw new Error('manifest must have an "apps" object');
  const apps: AppEntry[] = [];
  const routes = new Set<string>();
  const tags = new Set<string>();

  for (const [name, value] of Object.entries(raw.apps)) {
    if (name.trim() === '') throw new Error('app names must be non-empty');
    if (!isRecord(value)) throw new Error(`apps.${name} must be an object`);
    const { route, url, tag } = value;
    if (typeof route !== 'string' || !route.startsWith('#/') || route.length < 3 || /\s/.test(route)) {
      throw new Error(`apps.${name}.route must start with "#/", name a route and contain no whitespace`);
    }
    if (typeof url !== 'string' || url.trim() === '') throw new Error(`apps.${name}.url must be a non-empty string`);
    if (typeof tag !== 'string' || !/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(tag)) {
      throw new Error(`apps.${name}.tag must be a lowercase custom element name containing a hyphen`);
    }
    if (RESERVED_TAGS.has(tag)) throw new Error(`apps.${name}.tag "${tag}" is a reserved element name`);
    const resolved = new URL(url, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      throw new Error(`apps.${name}.url must use http: or https:`);
    }
    if (routes.has(route)) throw new Error(`duplicate route "${route}" (apps.${name})`);
    if (tags.has(tag)) throw new Error(`duplicate tag "${tag}" (apps.${name})`);
    routes.add(route);
    tags.add(tag);
    apps.push({ name, route, tag, url: resolved.href });
  }
  return { apps };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
