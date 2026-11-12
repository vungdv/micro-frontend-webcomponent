import { describe, expect, it } from 'vitest';
import {
  LAYOUT_VERSION,
  LIMITS,
  MESSAGES,
  assign,
  defaultLayout,
  parseLayout,
  resize,
  validateSize,
  type Cell,
  type Layout,
} from './layout.ts';

const APPS = ['todo', 'weather', 'timezone'];
const ABCD = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

function layout(cells: Cell[][], columns = cells[0]?.length ?? 0): Layout {
  return { version: 1, columns, rows: cells.length, cells };
}

function ok(result: ReturnType<typeof resize>): Layout {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.layout;
}

describe('defaultLayout', () => {
  it('given app IDs [todo, weather, timezone], then the default layout is 1×1 holding todo [HL-01]', () => {
    expect(defaultLayout(APPS)).toEqual({ version: 1, columns: 1, rows: 1, cells: [['todo']] });
  });

  it('given no app IDs, then the default layout is 1×1 holding null [HL-01]', () => {
    expect(defaultLayout([])).toEqual({ version: 1, columns: 1, rows: 1, cells: [[null]] });
  });
});

describe('validateSize', () => {
  it('given sizes 0, 5 and 10, then each is valid [HL-02]', () => {
    for (const size of [0, 5, 10]) expect(validateSize(size)).toEqual({ ok: true, size });
  });

  it('given -1, 11, 2.5, NaN and "3", then each is invalid-size [HL-02]', () => {
    for (const size of [-1, 11, 2.5, Number.NaN, '3', Infinity, null, undefined]) {
      expect(validateSize(size)).toEqual({ ok: false, reason: 'invalid-size' });
    }
  });

  it('given the limits, then they are 0..10 and the invalid-size message names them [HL-02]', () => {
    expect(LIMITS).toEqual({ min: 0, max: 10 });
    expect(MESSAGES['invalid-size']).toBe('Enter a whole number from 0 to 10');
    expect(LAYOUT_VERSION).toBe(1);
  });
});

describe('resize', () => {
  it('given 2×2 [[a, b], [c, d]], when resized to 3×3, then old entries keep their positions and new ones are null [HL-03]', () => {
    const result = resize(layout([['a', 'b'], ['c', 'd']]), 3, 3);
    expect(result).toEqual({
      ok: true,
      layout: { version: 1, columns: 3, rows: 3, cells: [['a', 'b', null], ['c', 'd', null], [null, null, null]] },
    });
  });

  it('given 3×3, when resized to 1×2, then only [[a], [d]] remain and the input is unchanged [HL-04]', () => {
    const input = layout([ABCD.slice(0, 3), ABCD.slice(3, 6), ABCD.slice(6, 9)]);
    const snapshot = structuredClone(input);
    expect(ok(resize(input, 1, 2))).toEqual({ version: 1, columns: 1, rows: 2, cells: [['a'], ['d']] });
    expect(input).toEqual(snapshot);
  });

  it('given any layout, when resized to 0×4, then cells hold no entries and the size is kept as given [HL-05]', () => {
    const result = ok(resize(layout([['a', 'b'], ['c', 'd']]), 0, 4));
    expect(result.columns).toBe(0);
    expect(result.rows).toBe(4);
    expect(result.cells.flat()).toEqual([]);
  });

  it('given any layout, when resized to 4×0, then cells hold no entries and the size is kept as given [HL-05]', () => {
    const result = ok(resize(layout([['a', 'b'], ['c', 'd']]), 4, 0));
    expect(result).toEqual({ version: 1, columns: 4, rows: 0, cells: [] });
  });

  it('given a layout, when resized to an invalid size, then invalid-size [HL-02]', () => {
    expect(resize(layout([['a']]), 11, 1)).toEqual({ ok: false, reason: 'invalid-size' });
    expect(resize(layout([['a']]), 1, -1)).toEqual({ ok: false, reason: 'invalid-size' });
  });
});

describe('assign', () => {
  const base = layout([['todo', 'weather'], ['timezone', null]]);

  it('given 2×2, when assigning weather to (1, 0), then only that cell changes [HL-06]', () => {
    const snapshot = structuredClone(base);
    expect(assign(base, 1, 0, 'weather', APPS)).toEqual({
      ok: true,
      layout: { version: 1, columns: 2, rows: 2, cells: [['todo', 'weather'], ['weather', null]] },
    });
    expect(base).toEqual(snapshot);
  });

  it('given 2×2, when assigning null to (0, 1), then the cell is empty [HL-06]', () => {
    expect(assign(base, 0, 1, null, APPS)).toEqual({
      ok: true,
      layout: { version: 1, columns: 2, rows: 2, cells: [['todo', null], ['timezone', null]] },
    });
  });

  it('given 2×2, when assigning to (2, 0), then out-of-bounds [HL-07]', () => {
    expect(assign(base, 2, 0, 'todo', APPS)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(assign(base, 0, 2, 'todo', APPS)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(assign(base, -1, 0, 'todo', APPS)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(assign(base, 0.5, 0, 'todo', APPS)).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('given 2×2, when assigning mars, then unknown-app [HL-07]', () => {
    expect(assign(base, 0, 0, 'mars', APPS)).toEqual({ ok: false, reason: 'unknown-app' });
  });

  it('given the same app assigned to two cells, then the layout is valid [HL-08]', () => {
    const result = ok(assign(base, 1, 1, 'todo', APPS));
    expect(result.cells).toEqual([['todo', 'weather'], ['timezone', 'todo']]);
    expect(parseLayout(result, APPS)).toEqual({ layout: result, invalid: null, clamped: false, droppedAppIds: [] });
  });
});

describe('parseLayout', () => {
  it('given a valid stored value, then it is returned as-is with no diagnostics', () => {
    const stored = { version: 1, columns: 2, rows: 1, cells: [['todo', 'weather']] };
    expect(parseLayout(stored, APPS)).toEqual({ layout: stored, invalid: null, clamped: false, droppedAppIds: [] });
  });

  it('given a stored value with columns: 12, then it is clamped to 10 and the cells are reshaped [HL-09]', () => {
    const row = Array.from({ length: 12 }, (_, i) => (i === 0 ? 'todo' : i === 11 ? 'weather' : null));
    const result = parseLayout({ version: 1, columns: 12, rows: 1, cells: [row] }, APPS);
    expect(result.clamped).toBe(true);
    expect(result.invalid).toBeNull();
    expect(result.layout.columns).toBe(10);
    expect(result.layout.cells).toEqual([['todo', ...Array<null>(9).fill(null)]]);
  });

  it('given a stored value with rows: -3, then it is clamped to 0 [HL-09]', () => {
    const result = parseLayout({ version: 1, columns: 2, rows: -3, cells: [] }, APPS);
    expect(result).toEqual({
      layout: { version: 1, columns: 2, rows: 0, cells: [] },
      invalid: null,
      clamped: true,
      droppedAppIds: [],
    });
  });

  it('given a stored value whose cells reference mars, then that cell is null and mars is reported as dropped [HL-10]', () => {
    const result = parseLayout({ version: 1, columns: 2, rows: 2, cells: [['todo', 'mars'], ['mars', 'pluto']] }, APPS);
    expect(result.layout.cells).toEqual([['todo', null], [null, null]]);
    expect(result.droppedAppIds).toEqual(['mars', 'pluto']);
    expect(result.invalid).toBeNull();
  });

  it('given cells shorter than the stored size, then missing positions are null [HL-09]', () => {
    const result = parseLayout({ version: 1, columns: 2, rows: 2, cells: [['todo']] }, APPS);
    expect(result.layout.cells).toEqual([['todo', null], [null, null]]);
  });

  it('given an unknown version, then the default layout and reason unknown-version', () => {
    expect(parseLayout({ version: 2, columns: 1, rows: 1, cells: [['todo']] }, APPS)).toEqual({
      layout: defaultLayout(APPS),
      invalid: 'unknown-version',
      clamped: false,
      droppedAppIds: [],
    });
  });

  it('given a wrong shape, then the default layout and reason invalid-shape', () => {
    const shapes: unknown[] = [
      null,
      'text',
      [],
      { version: 1, columns: '2', rows: 1, cells: [['todo']] },
      { version: 1, columns: 2.5, rows: 1, cells: [['todo']] },
      { version: 1, columns: 1, rows: 1 },
      { version: 1, columns: 1, rows: 1, cells: ['todo'] },
      { version: 1, columns: 1, rows: 1, cells: [[42]] },
    ];
    for (const value of shapes) {
      expect(parseLayout(value, APPS)).toEqual({
        layout: defaultLayout(APPS),
        invalid: 'invalid-shape',
        clamped: false,
        droppedAppIds: [],
      });
    }
  });
});
