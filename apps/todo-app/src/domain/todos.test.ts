import { describe, expect, it } from 'vitest';
import {
  MAX_TITLE_LENGTH,
  addTodo,
  clearCompleted,
  filterTodos,
  remainingCount,
  removeTodo,
  renameTodo,
  toggleTodo,
  validateTitle,
  type Todo,
} from './todos.ts';

const mixed: Todo[] = [
  { id: 'a', title: 'A', done: false },
  { id: 'b', title: 'B', done: true },
  { id: 'c', title: 'C', done: false },
  { id: 'd', title: 'D', done: true },
];

describe('validateTitle', () => {
  it('given "  Buy milk  ", when validated, then ok with title "Buy milk" [TDM-01]', () => {
    expect(validateTitle('  Buy milk  ')).toEqual({ ok: true, title: 'Buy milk' });
  });

  it('given an empty or whitespace-only title, when validated, then not ok with reason empty [TDM-02]', () => {
    expect(validateTitle('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateTitle('   \t\n ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('given 200 chars, then ok; given 201 chars after trim, then not ok with reason too-long [TDM-03]', () => {
    const max = 'x'.repeat(MAX_TITLE_LENGTH);
    expect(MAX_TITLE_LENGTH).toBe(200);
    expect(validateTitle(`  ${max}  `)).toEqual({ ok: true, title: max });
    expect(validateTitle(` ${max}y `)).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('list operations', () => {
  it('given a list, when addTodo, then a new list ends with the new not-done todo and the input is unchanged [TDM-04]', () => {
    const list: Todo[] = [{ id: 'a', title: 'A', done: true }];
    const snapshot = structuredClone(list);
    const next = addTodo(list, 'n', 'New');
    expect(next).toEqual([...snapshot, { id: 'n', title: 'New', done: false }]);
    expect(next).not.toBe(list);
    expect(list).toEqual(snapshot);
  });

  it('given a todo, when toggleTodo, then only that todo flips; an unknown id returns an equal list [TDM-05]', () => {
    const next = toggleTodo(mixed, 'a');
    expect(next).toEqual([{ ...mixed[0], done: true }, ...mixed.slice(1)]);
    expect(mixed[0]?.done).toBe(false);
    expect(toggleTodo(mixed, 'zzz')).toEqual(mixed);
  });

  it('given a todo, when renameTodo, then only its title changes [TDM-06]', () => {
    const next = renameTodo(mixed, 'b', 'Bee');
    expect(next).toEqual([mixed[0], { id: 'b', title: 'Bee', done: true }, mixed[2], mixed[3]]);
    expect(mixed[1]?.title).toBe('B');
  });

  it('given a todo, when removeTodo, then it is gone [TDM-07]', () => {
    const next = removeTodo(mixed, 'c');
    expect(next.map((t) => t.id)).toEqual(['a', 'b', 'd']);
    expect(mixed).toHaveLength(4);
  });

  it('given mixed todos, when clearCompleted, then only not-done todos remain in order [TDM-08]', () => {
    expect(clearCompleted(mixed).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('given mixed todos, when filterTodos with all/active/done, then matching subsets are returned in order [TDM-09]', () => {
    expect(filterTodos(mixed, 'all').map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterTodos(mixed, 'active').map((t) => t.id)).toEqual(['a', 'c']);
    expect(filterTodos(mixed, 'done').map((t) => t.id)).toEqual(['b', 'd']);
  });

  it('given mixed todos, when remainingCount, then it is the number not done [TDM-10]', () => {
    expect(remainingCount(mixed)).toBe(2);
    expect(remainingCount([])).toBe(0);
  });
});
