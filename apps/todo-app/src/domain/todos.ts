/** Todo domain: pure types, validation and immutable list operations (no framework, DOM or I/O). */

export type Todo = { id: string; title: string; done: boolean };
export type Filter = 'all' | 'active' | 'done';
export type TitleValidation = { ok: true; title: string } | { ok: false; reason: 'empty' | 'too-long' };

export const MAX_TITLE_LENGTH = 200;

/** Trims the raw input and checks it is non-empty and at most MAX_TITLE_LENGTH characters. */
export function validateTitle(raw: string): TitleValidation {
  const title = raw.trim();
  if (title === '') return { ok: false, reason: 'empty' };
  if (title.length > MAX_TITLE_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, title };
}

export function addTodo(list: readonly Todo[], id: string, title: string): Todo[] {
  return [...list, { id, title, done: false }];
}

export function toggleTodo(list: readonly Todo[], id: string): Todo[] {
  return list.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

export function renameTodo(list: readonly Todo[], id: string, title: string): Todo[] {
  return list.map((t) => (t.id === id ? { ...t, title } : t));
}

export function removeTodo(list: readonly Todo[], id: string): Todo[] {
  return list.filter((t) => t.id !== id);
}

export function clearCompleted(list: readonly Todo[]): Todo[] {
  return list.filter((t) => !t.done);
}

export function filterTodos(list: readonly Todo[], filter: Filter): Todo[] {
  if (filter === 'active') return list.filter((t) => !t.done);
  if (filter === 'done') return list.filter((t) => t.done);
  return [...list];
}

export function remainingCount(list: readonly Todo[]): number {
  return list.reduce((n, t) => (t.done ? n : n + 1), 0);
}
