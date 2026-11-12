import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings.ts';
import { LocalStorageSettingsRepository, SETTINGS_STORAGE_KEY } from './settings-repository.ts';

const SUPPORTED = ['America/New_York', 'Asia/Kolkata', 'UTC'];

/** In-memory fake of the Web Storage edge. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LocalStorageSettingsRepository', () => {
  it('given nothing stored, when loaded, then default settings [TZS-01]', async () => {
    const repo = new LocalStorageSettingsRepository(SUPPORTED, () => fakeStorage());
    expect(await repo.load()).toEqual({ version: 1, zones: [], ranges: [] });
  });

  it('given settings saved, when loaded, then equal settings come back from key timezone:settings [TZS-02]', async () => {
    const storage = fakeStorage();
    const repo = new LocalStorageSettingsRepository(SUPPORTED, () => storage);
    const settings: Settings = {
      version: 1,
      zones: ['America/New_York', 'Asia/Kolkata'],
      ranges: [{ id: '6f1c', start: '09:00', end: '03:00' }],
    };
    await repo.save(settings);
    expect(SETTINGS_STORAGE_KEY).toBe('timezone:settings');
    expect(JSON.parse(storage.getItem('timezone:settings') ?? 'null')).toEqual(settings);
    expect(await repo.load()).toEqual(settings);
  });

  it('given corrupt JSON, when loaded, then defaults and console.warn [TZS-03]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = new LocalStorageSettingsRepository(SUPPORTED, () => fakeStorage({ 'timezone:settings': '{not json' }));
    expect(await repo.load()).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('given version 2, when loaded, then defaults and console.warn [TZS-04]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stored = JSON.stringify({ version: 2, zones: ['UTC'], ranges: [] });
    const repo = new LocalStorageSettingsRepository(SUPPORTED, () => fakeStorage({ 'timezone:settings': stored }));
    expect(await repo.load()).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('given setItem throws, when saved, then the promise resolves and console.warn is called [TZS-05]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const repo = new LocalStorageSettingsRepository(SUPPORTED, () => storage);
    await expect(repo.save(DEFAULT_SETTINGS)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('given getItem throws, when loaded, then defaults and console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = fakeStorage();
    storage.getItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    expect(await new LocalStorageSettingsRepository(SUPPORTED, () => storage).load()).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('given reading localStorage itself throws (SecurityError), when loaded and saved, then defaults, a resolved save and console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = new LocalStorageSettingsRepository(SUPPORTED, () => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(await repo.load()).toEqual(DEFAULT_SETTINGS);
    await expect(repo.save(DEFAULT_SETTINGS)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
