import type { AppEntry, HostConfig } from '@mf/contracts';
import type { Notify } from '../app/mediator/types.ts';

export type ValidationResult = { ok: true; config: HostConfig } | { ok: false; errors: string[] };

const ROUTE = /^#\/[a-z0-9][a-z0-9-]*$/;
const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/;
/** Valid custom element name (HTML spec), restricted to ASCII: lowercase start, contains a hyphen. */
const CUSTOM_ELEMENT_NAME = /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/;
const RESERVED_NAMES = new Set([
  'annotation-xml', 'color-profile', 'font-face', 'font-face-src',
  'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph',
]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Validates the shape of host.config.json and returns a clean copy (unknown fields dropped).
 * Each app `url` is resolved against `manifestUrl` (absolute), so relative urls stay relative to the
 * manifest rather than to the shell's JS bundle when they are later passed to import().
 */
export function validateHostConfig(data: unknown, manifestUrl: string): ValidationResult {
  if (!isObject(data) || !isObject(data.apps)) {
    return { ok: false, errors: ['"apps" must be an object of app id → entry'] };
  }
  const errors: string[] = [];
  const apps: Record<string, AppEntry> = {};
  const routeOwner = new Map<string, string>();
  const tagOwner = new Map<string, string>();

  for (const [id, raw] of Object.entries(data.apps)) {
    const at = `apps.${id}`;
    if (!isObject(raw)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    const before = errors.length;
    const { route, url, tag, attributes } = raw;

    if (!isNonEmptyString(route)) errors.push(`${at}.route must be a non-empty string`);
    else if (!ROUTE.test(route)) errors.push(`${at}.route must look like "#/name"`);
    else if (routeOwner.has(route)) errors.push(`${at}.route "${route}" duplicates apps.${routeOwner.get(route)}.route`);
    else routeOwner.set(route, id);

    let resolvedUrl: string | undefined;
    if (!isNonEmptyString(url)) errors.push(`${at}.url must be a non-empty string`);
    else if ((resolvedUrl = resolveUrl(url, manifestUrl)) === undefined) errors.push(`${at}.url "${url}" is not a valid URL`);

    if (!isNonEmptyString(tag)) errors.push(`${at}.tag must be a non-empty string`);
    else if (!CUSTOM_ELEMENT_NAME.test(tag) || RESERVED_NAMES.has(tag)) {
      errors.push(`${at}.tag "${tag}" is not a valid custom element name`);
    } else if (tagOwner.has(tag)) errors.push(`${at}.tag "${tag}" duplicates apps.${tagOwner.get(tag)}.tag`);
    else tagOwner.set(tag, id);

    let cleanAttributes: Record<string, string> | undefined;
    if (attributes !== undefined) {
      if (!isObject(attributes)) {
        errors.push(`${at}.attributes must be a flat object of name → string`);
      } else {
        cleanAttributes = {};
        for (const [name, value] of Object.entries(attributes)) {
          if (!ATTRIBUTE_NAME.test(name)) errors.push(`${at}.attributes name "${name}" must match [a-z][a-z0-9-]*`);
          else if (typeof value !== 'string') errors.push(`${at}.attributes.${name} must be a string`);
          else cleanAttributes[name] = value;
        }
      }
    }

    if (errors.length === before) {
      const entry: AppEntry = { route: route as string, url: resolvedUrl as string, tag: tag as string };
      if (cleanAttributes) entry.attributes = cleanAttributes;
      apps[id] = entry;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, config: { apps } };
}

function resolveUrl(url: string, base: string): string | undefined {
  try {
    return new URL(url, base).href;
  } catch {
    return undefined;
  }
}

export interface ConfigLoaderOptions {
  fetch: typeof fetch;
  /** Manifest URL, resolved against `baseURI`. */
  url: string;
  /** The page's base URL; defaults to document.baseURI. */
  baseURI?: string;
}

/** Colleague: fetches and validates the manifest, then reports configLoaded / configFailed. */
export class ConfigLoader {
  readonly #notify: Notify;
  readonly #options: ConfigLoaderOptions;

  constructor(notify: Notify, options: ConfigLoaderOptions) {
    this.#notify = notify;
    this.#options = options;
  }

  async load(): Promise<void> {
    const { url } = this.#options;
    const name = url.split('/').pop() || url;
    let body: string;
    try {
      const response = await this.#options.fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        return this.#notify({ type: 'configFailed', message: `could not load ${name} (HTTP ${response.status})` });
      }
      body = await response.text();
    } catch (error) {
      return this.#notify({ type: 'configFailed', message: `could not load ${name} (${messageOf(error)})` });
    }

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch (error) {
      return this.#notify({ type: 'configFailed', message: `${name} is not valid JSON (${messageOf(error)})` });
    }

    const manifestUrl = new URL(url, this.#options.baseURI ?? document.baseURI).href;
    const result = validateHostConfig(data, manifestUrl);
    if (result.ok) this.#notify({ type: 'configLoaded', config: result.config });
    else this.#notify({ type: 'configFailed', message: `invalid ${name}: ${result.errors.join('; ')}` });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
