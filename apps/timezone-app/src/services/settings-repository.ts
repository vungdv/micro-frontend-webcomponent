/** Settings persistence seam. The page depends only on `SettingsRepository`. */
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../domain/settings.ts';

/** Async so a remote (REST) adapter can replace local storage without changing callers. */
export interface SettingsRepository {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

/** Storage key that holds the settings document as JSON. */
export const SETTINGS_STORAGE_KEY = 'timezone:settings';

/** Stores one versioned JSON document in Web Storage. Never throws: failures are logged with `console.warn`. */
export class LocalStorageSettingsRepository implements SettingsRepository {
  readonly #supportedZones: readonly string[];
  readonly #storage: () => Storage;

  /**
   * `storage` is resolved lazily on every call, inside the try blocks: reading `localStorage` itself
   * throws a `SecurityError` when site data is blocked.
   */
  constructor(supportedZones: readonly string[], storage: () => Storage = () => localStorage) {
    this.#supportedZones = supportedZones;
    this.#storage = storage;
  }

  async load(): Promise<Settings> {
    let parsed: unknown;
    try {
      const raw = this.#storage().getItem(SETTINGS_STORAGE_KEY);
      if (raw === null) return DEFAULT_SETTINGS;
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn(`[timezone-app] could not read "${SETTINGS_STORAGE_KEY}"`, error);
      return DEFAULT_SETTINGS;
    }
    return parseSettings(parsed, this.#supportedZones);
  }

  async save(settings: Settings): Promise<void> {
    try {
      this.#storage().setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn(`[timezone-app] could not save "${SETTINGS_STORAGE_KEY}"`, error);
    }
  }
}
