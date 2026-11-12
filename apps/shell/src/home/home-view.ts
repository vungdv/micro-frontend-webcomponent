import type { HostConfig } from '@mf/contracts';
import type { Logger } from '../app/logger.ts';
import { HomeCell, type DefineApp } from './cell.ts';
import { assign, MESSAGES, resize, validateSize, type Layout } from './domain/layout.ts';
import type { LayoutRepository } from './services/layout-repository.ts';

export interface HomeViewOptions {
  /** The element the view owns (the outlet's `section.mf-home`). */
  root: HTMLElement;
  apps: HostConfig['apps'];
  repository: LayoutRepository;
  define: DefineApp;
  logger: Logger;
}

type SizeField = 'columns' | 'rows';

let nextId = 0;

/**
 * The shell's home dashboard. View mode mounts one HomeCell per assigned cell; config mode edits an
 * in-memory draft (cells unmounted) that Save stores and Cancel discards. Mode and draft are not
 * persisted: every new HomeView starts in view mode.
 */
export class HomeView {
  readonly #o: HomeViewOptions;
  readonly #appIds: readonly string[];
  readonly #idPrefix = `mf-home-${++nextId}`;
  #layout: Layout | null = null;
  #draft: Layout | null = null;
  #cells: HomeCell[] = [];
  #disposed = false;
  #saving = false;

  constructor(options: HomeViewOptions) {
    this.#o = options;
    this.#appIds = Object.keys(options.apps);
  }

  /** Loads the saved layout and renders view mode. Never rejects. */
  async show(): Promise<void> {
    let layout: Layout;
    try {
      layout = await this.#o.repository.load(this.#appIds);
    } catch (error) {
      // The repository contract says load never throws; this only keeps a broken adapter contained.
      this.#o.logger.warn('could not load home layout', { error: String(error) });
      return;
    }
    if (this.#disposed) return;
    this.#layout = layout;
    this.#renderView();
  }

  /** Disposes every cell (cancelling pending loads), drops the draft and empties the root. */
  dispose(): void {
    this.#disposed = true;
    this.#unmountCells();
    this.#draft = null;
    this.#o.root.replaceChildren();
  }

  #renderView(): void {
    const layout = this.#layout;
    if (!layout) return;
    this.#unmountCells();
    this.#draft = null;

    const configure = this.#button('Configure', () => this.#enterConfig());
    const toolbar = this.#toolbar(configure);

    if (layout.columns === 0 || layout.rows === 0) {
      const empty = this.#el('p', 'No cells yet. Choose Configure to add some.');
      empty.className = 'mf-home-empty';
      this.#o.root.replaceChildren(toolbar, empty);
      return;
    }

    const grid = this.#grid(layout.columns);
    const pending: HomeCell[] = [];
    layout.cells.forEach((cells, row) =>
      cells.forEach((appId, column) => {
        const entry = appId === null ? undefined : this.#o.apps[appId];
        const region = this.#region(entry && appId !== null ? appId : null);
        grid.append(region);
        if (!entry || appId === null) return;
        pending.push(new HomeCell({
          container: region, appId, entry, row, column, define: this.#o.define, logger: this.#o.logger,
        }));
      }),
    );
    this.#o.root.replaceChildren(toolbar, this.#scroller(grid));
    this.#cells = pending;
    for (const cell of pending) cell.start();
  }

  #enterConfig(): void {
    if (!this.#layout) return;
    this.#unmountCells();
    this.#draft = this.#layout;
    const invalid = new Set<SizeField>();

    const cancel = this.#button('Cancel', () => this.#renderView());
    const save = this.#button('Save', () => void this.#save(save, cancel, invalid));
    const pickers = this.#el('div');
    const renderPickers = () => pickers.replaceChildren(...this.#pickerGrid());

    const field = (label: string, name: SizeField) => {
      const input = this.#el('input');
      input.type = 'number';
      input.min = '0';
      input.max = '10';
      input.step = '1';
      input.value = String(this.#draft![name]);
      const error = this.#el('span');
      error.id = `${this.#idPrefix}-${name}-error`;
      error.className = 'mf-home-field-error';
      error.hidden = true;
      input.addEventListener('input', () => {
        const size = validateSize(input.valueAsNumber);
        const draft = this.#draft;
        if (!draft) return;
        if (!size.ok) {
          invalid.add(name);
          input.setAttribute('aria-invalid', 'true');
          input.setAttribute('aria-describedby', error.id);
          error.textContent = MESSAGES['invalid-size'];
          error.hidden = false;
        } else {
          invalid.delete(name);
          input.removeAttribute('aria-invalid');
          input.removeAttribute('aria-describedby');
          error.textContent = '';
          error.hidden = true;
          const columns = name === 'columns' ? size.size : draft.columns;
          const rows = name === 'rows' ? size.size : draft.rows;
          const resized = resize(draft, columns, rows);
          if (resized.ok) this.#draft = resized.layout;
          renderPickers();
        }
        if (!this.#saving) save.disabled = invalid.size > 0;
      });
      const wrapper = this.#el('label', `${label} `);
      wrapper.className = 'mf-home-field';
      wrapper.append(input);
      const group = this.#el('span');
      group.append(wrapper, error);
      return group;
    };

    renderPickers();
    this.#o.root.replaceChildren(
      this.#toolbar(field('Columns', 'columns'), field('Rows', 'rows'), save, cancel),
      pickers,
    );
  }

  /** Stores the draft; on failure stays in config mode with Save and Cancel usable again. */
  async #save(save: HTMLButtonElement, cancel: HTMLButtonElement, invalid: ReadonlySet<SizeField>): Promise<void> {
    const draft = this.#draft;
    if (!draft || this.#saving) return;
    this.#saving = true;
    save.disabled = true;
    cancel.disabled = true;
    try {
      await this.#o.repository.save(draft);
    } catch (error) {
      // The repository contract says save never rejects; this keeps a broken adapter contained.
      this.#saving = false;
      if (this.#disposed) return;
      this.#o.logger.warn('could not save home layout', { error: String(error) });
      save.disabled = invalid.size > 0;
      cancel.disabled = false;
      return;
    }
    this.#saving = false;
    if (this.#disposed) return;
    // Sizes typed while saving only changed the next draft; the stored layout is what was sent.
    this.#layout = draft;
    this.#renderView();
  }

  /** The draft as a grid of pickers, or nothing when it has no cells. */
  #pickerGrid(): Node[] {
    const draft = this.#draft;
    if (!draft || draft.columns === 0 || draft.rows === 0) return [];
    const grid = this.#grid(draft.columns);
    draft.cells.forEach((cells, row) =>
      cells.forEach((appId, column) => {
        const select = this.#el('select');
        select.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1}`);
        const empty = this.#el('option', 'Empty');
        empty.value = '';
        select.append(empty);
        for (const id of this.#appIds) {
          const option = this.#el('option', id);
          option.value = id;
          select.append(option);
        }
        select.value = appId ?? '';
        select.addEventListener('change', () => {
          if (!this.#draft) return;
          const result = assign(this.#draft, row, column, select.value === '' ? null : select.value, this.#appIds);
          if (result.ok) this.#draft = result.layout;
        });
        const cell = this.#el('div');
        cell.className = 'mf-home-cell mf-home-cell--config';
        cell.append(select);
        grid.append(cell);
      }),
    );
    return [this.#scroller(grid)];
  }

  #unmountCells(): void {
    for (const cell of this.#cells) cell.dispose();
    this.#cells = [];
  }

  #toolbar(...nodes: Node[]): HTMLElement {
    const toolbar = this.#el('div');
    toolbar.className = 'mf-home-toolbar';
    toolbar.append(...nodes);
    return toolbar;
  }

  #grid(columns: number): HTMLElement {
    const grid = this.#el('div');
    grid.className = 'mf-home-grid';
    grid.style.setProperty('--mf-home-columns', String(columns));
    return grid;
  }

  #scroller(grid: HTMLElement): HTMLElement {
    const scroller = this.#el('div');
    scroller.className = 'mf-home-scroll';
    scroller.append(grid);
    return scroller;
  }

  #region(appId: string | null): HTMLElement {
    const region = this.#el('div');
    region.className = appId === null ? 'mf-home-cell mf-home-cell--empty' : 'mf-home-cell';
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', appId ?? 'Empty cell');
    return region;
  }

  #button(text: string, onClick: () => void): HTMLButtonElement {
    const button = this.#el('button', text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  #el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
    const el = this.#o.root.ownerDocument.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  }
}
