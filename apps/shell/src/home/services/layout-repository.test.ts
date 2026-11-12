import { describe, expect, it } from 'vitest';
import type { Logger } from '../../app/logger.ts';
import { defaultLayout, type Layout } from '../domain/layout.ts';
import { LAYOUT_STORAGE_KEY, LocalStorageLayoutRepository } from './layout-repository.ts';

const APPS = ['todo', 'weather', 'timezone'];

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

function recordingLogger(): Logger & { warnings: { message: string; data: Record<string, unknown> }[] } {
  const warnings: { message: string; data: Record<string, unknown> }[] = [];
  return { warnings, warn: (message, data) => void warnings.push({ message, data }) };
}

describe('LocalStorageLayoutRepository', () => {
  it('given nothing stored, when loaded, then the default layout [HS-01]', async () => {
    const logger = recordingLogger();
    const repo = new LocalStorageLayoutRepository(logger, () => fakeStorage());
    expect(await repo.load(APPS)).toEqual({ version: 1, columns: 1, rows: 1, cells: [['todo']] });
    expect(logger.warnings).toEqual([]);
  });

  it('given a layout saved, when loaded, then an equal layout comes back from key home:layout [HS-02]', async () => {
    const storage = fakeStorage();
    const logger = recordingLogger();
    const repo = new LocalStorageLayoutRepository(logger, () => storage);
    const layout: Layout = { version: 1, columns: 2, rows: 1, cells: [['todo', 'weather']] };
    await repo.save(layout);
    expect(LAYOUT_STORAGE_KEY).toBe('home:layout');
    expect(JSON.parse(storage.getItem('home:layout') ?? 'null')).toEqual(layout);
    expect(await repo.load(APPS)).toEqual(layout);
    expect(logger.warnings).toEqual([]);
  });

  it('given corrupt JSON, when loaded, then the default layout and one warning [HS-03]', async () => {
    const logger = recordingLogger();
    const repo = new LocalStorageLayoutRepository(logger, () => fakeStorage({ 'home:layout': '{not json' }));
    expect(await repo.load(APPS)).toEqual(defaultLayout(APPS));
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.data).toMatchObject({ key: 'home:layout' });
  });

  it('given version 2, when loaded, then the default layout and one warning [HS-03]', async () => {
    const logger = recordingLogger();
    const stored = JSON.stringify({ version: 2, columns: 1, rows: 1, cells: [['weather']] });
    const repo = new LocalStorageLayoutRepository(logger, () => fakeStorage({ 'home:layout': stored }));
    expect(await repo.load(APPS)).toEqual(defaultLayout(APPS));
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.data).toMatchObject({ key: 'home:layout', reason: 'unknown-version' });
  });

  it('given a stored unknown app ID, when loaded, then the cell is null, a warning names the ID, and the stored string is unchanged [HS-04]', async () => {
    const logger = recordingLogger();
    const stored = JSON.stringify({ version: 1, columns: 2, rows: 1, cells: [['todo', 'mars']] });
    const storage = fakeStorage({ 'home:layout': stored });
    const repo = new LocalStorageLayoutRepository(logger, () => storage);
    expect(await repo.load(APPS)).toEqual({ version: 1, columns: 2, rows: 1, cells: [['todo', null]] });
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.data).toMatchObject({ key: 'home:layout', appId: 'mars' });
    expect(storage.getItem('home:layout')).toBe(stored);
  });

  it('given a stored size outside the limits, when loaded, then it is clamped and a warning is logged [HL-09]', async () => {
    const logger = recordingLogger();
    const stored = JSON.stringify({ version: 1, columns: 12, rows: 1, cells: [['todo']] });
    const repo = new LocalStorageLayoutRepository(logger, () => fakeStorage({ 'home:layout': stored }));
    const layout = await repo.load(APPS);
    expect(layout.columns).toBe(10);
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.data).toMatchObject({ key: 'home:layout', columns: 10, rows: 1 });
  });

  it('given setItem throws, when saved, then the promise resolves and a warning is logged [HS-05]', async () => {
    const logger = recordingLogger();
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const repo = new LocalStorageLayoutRepository(logger, () => storage);
    await expect(repo.save(defaultLayout(APPS))).resolves.toBeUndefined();
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.data).toMatchObject({ key: 'home:layout' });
    expect(String(logger.warnings[0]?.data.error)).toContain('quota');
  });

  it('given reading localStorage throws SecurityError, when loaded or saved, then the default layout and no throw [HS-06]', async () => {
    const logger = recordingLogger();
    const repo = new LocalStorageLayoutRepository(logger, () => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(await repo.load(APPS)).toEqual(defaultLayout(APPS));
    await expect(repo.save(defaultLayout(APPS))).resolves.toBeUndefined();
    expect(logger.warnings).toHaveLength(2);
  });

  it('given the default storage and a constructor call, then localStorage is not touched until load [HS-06]', () => {
    let touched = false;
    new LocalStorageLayoutRepository(recordingLogger(), () => {
      touched = true;
      return fakeStorage();
    });
    expect(touched).toBe(false);
  });
});
