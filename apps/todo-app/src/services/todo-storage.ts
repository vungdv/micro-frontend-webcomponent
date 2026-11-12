import type { Todo } from '../domain/todos.ts';

/** Storage key that holds the todo list as JSON. */
export const TODOS_STORAGE_KEY = 'todos:list';

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.title === 'string' && typeof v.done === 'boolean';
}

/** Reads the todo list. Never throws: corrupt data gives `[]`, invalid items are dropped. */
export function loadTodos(storage: Storage = localStorage): Todo[] {
  let raw: string | null;
  let parsed: unknown;
  try {
    raw = storage.getItem(TODOS_STORAGE_KEY);
    if (raw === null) return [];
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`[todo-app] could not read "${TODOS_STORAGE_KEY}"`, error);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn(`[todo-app] "${TODOS_STORAGE_KEY}" is not an array; ignoring it`);
    return [];
  }
  const todos = parsed.filter(isTodo).map(({ id, title, done }) => ({ id, title, done }));
  if (todos.length !== parsed.length) {
    console.warn(`[todo-app] dropped ${parsed.length - todos.length} invalid item(s) from "${TODOS_STORAGE_KEY}"`);
  }
  return todos;
}

/** Writes the todo list. Never throws: write errors (quota, private mode) are logged. */
export function saveTodos(list: readonly Todo[], storage: Storage = localStorage): void {
  try {
    storage.setItem(TODOS_STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    console.warn(`[todo-app] could not save "${TODOS_STORAGE_KEY}"`, error);
  }
}
