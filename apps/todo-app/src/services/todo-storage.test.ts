import { afterEach, describe, expect, it, vi } from 'vitest';
import { TODOS_STORAGE_KEY, loadTodos, saveTodos } from './todo-storage.ts';
import type { Todo } from '../domain/todos.ts';

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

describe('todo storage', () => {
  it('given nothing stored, when loaded, then it is an empty list [TDS-01]', () => {
    expect(loadTodos(fakeStorage())).toEqual([]);
  });

  it('given todos saved, when loaded, then the same todos come back from key todos:list [TDS-02]', () => {
    const storage = fakeStorage();
    const todos: Todo[] = [
      { id: '1', title: 'One', done: false },
      { id: '2', title: 'Two', done: true },
    ];
    saveTodos(todos, storage);
    expect(TODOS_STORAGE_KEY).toBe('todos:list');
    expect(JSON.parse(storage.getItem('todos:list') ?? 'null')).toEqual(todos);
    expect(loadTodos(storage)).toEqual(todos);
  });

  it('given corrupt JSON, when loaded, then it is an empty list and console.warn is called [TDS-03]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadTodos(fakeStorage({ 'todos:list': '{not json' }))).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('given a stored value that is not an array, when loaded, then it is an empty list and console.warn is called [TDS-03]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadTodos(fakeStorage({ 'todos:list': '{"id":"1"}' }))).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('given an array with some invalid items, when loaded, then only valid todos are returned [TDS-04]', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stored = [
      { id: '1', title: 'Ok', done: false },
      null,
      'text',
      { id: 2, title: 'Bad id', done: false },
      { id: '3', title: 'Bad done', done: 'yes' },
      { id: '4', done: true },
      { id: '5', title: 'Also ok', done: true },
    ];
    expect(loadTodos(fakeStorage({ 'todos:list': JSON.stringify(stored) }))).toEqual([
      { id: '1', title: 'Ok', done: false },
      { id: '5', title: 'Also ok', done: true },
    ]);
  });

  it('given setItem throws, when saved, then it does not throw and console.warn is called [TDS-05]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    expect(() => saveTodos([{ id: '1', title: 'One', done: false }], storage)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
