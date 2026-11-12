# M2: Todo app (Vue 3)

Parent spec: [01.init-spec.md](../specs/01.init-spec.md#todo-app-todo-app-vue-3). Milestone index: [README.md](README.md). Testing rules: [02.testing.md](../specs/02.testing.md).

## 1. Goal

Replace the M1 vanilla placeholder in `apps/todo-app` with the real todo app, built with Vue 3, behind the **same** public contract (`<todo-app>`, `weather-route` attribute, `mf:navigate` event). This answers exploration question 2 (framework independence): the host does not change at all.

At the end of M2:

1. Users can add, toggle, edit inline, and delete todos; filter all / active / done; see the remaining count; and clear completed todos.
2. Todos persist in `localStorage` under `todos:list`. They survive a reload and leaving and re-entering the route.
3. When the list is empty and `weather-route` is set, the app shows "Nothing to do. Check the weather?". Clicking it dispatches `mf:navigate { path: <weather-route> }`.
4. The remote builds into one self-contained ES module (`todo-app.js`) with Vue bundled in, and it still runs standalone through `index.html`.

Out of scope: syncing across tabs (`storage` event), persisting the filter, drag-reorder, theming beyond the existing `--mf-*` fallbacks (M5).

**No changes outside `apps/todo-app`**, except the milestone index status and, if necessary, adding a constant to `@mf/contracts`. The shell and `host.config.json` stay as they are.

## 2. Design

### 2.1 Layers (dependencies point inward)

```
src/
  web-component.ts        TodoAppElement (HTMLElement): shadow root, Vue app mount/unmount,
                          weather-route attr ↔ reactive prop, page "navigate" emit → mf:navigate
  pages/TodoPage.vue      root view: composes components, owns filter state, calls the store
  components/             TodoInput.vue, TodoItem.vue, TodoFilters.vue, EmptyState.vue (private)
  services/todo-storage.ts  load/save todos:list (Storage injected; defaults to localStorage)
  domain/todos.ts         pure: types, validation, list operations, filter, remaining count
  styles.css              all shadow styles; imported with ?inline, injected into the shadow root
```

- **`domain/todos.ts`** has no framework, no DOM, and no I/O. It contains:
  - `type Todo = { id: string; title: string; done: boolean }` and `type Filter = 'all' | 'active' | 'done'`.
  - `MAX_TITLE_LENGTH = 200`.
  - `validateTitle(raw)`: trims the input, then returns `{ ok: true, title }` or `{ ok: false, reason: 'empty' | 'too-long' }`.
  - Immutable operations that return a new array: `addTodo(list, id, title)`, `toggleTodo`, `renameTodo`, `removeTodo`, `clearCompleted`, `filterTodos(list, filter)`, `remainingCount(list)`.
  - IDs are passed in by the caller (`crypto.randomUUID()` in the page), so the domain stays deterministic.
- **`services/todo-storage.ts`** exports `TODOS_STORAGE_KEY = 'todos:list'`, `loadTodos(storage = localStorage): Todo[]` and `saveTodos(list, storage = localStorage)`.
  - Corrupt JSON or a wrong shape gives `[]` and a `console.warn`. It never throws, so a bad entry can't break the route.
  - Items with an invalid shape are dropped.
  - A `setItem` error (quota exceeded, private mode) is caught and logged with `console.warn`.
- **Pages and components** are Vue SFCs with `<script setup lang="ts">` and no `<style>` blocks. In library mode, SFC styles are extracted or injected into `document.head`, which breaks the namespacing rule ("nothing is injected into `document.head`"). All CSS lives in `src/styles.css`. It starts with `:host{display:block}:host([hidden]){display:none}` and uses `var(--mf-*, fallback)` for colors and fonts.
- **`web-component.ts`**:
  - `constructor`: calls `attachShadow({ mode: 'open' })` and nothing else.
  - `connectedCallback` (idempotent): if not mounted, adds `<style>` (styles.css) and a container `<div>` to the shadow root. Then it creates the app with a render-function root, `createApp({ render: () => h(TodoPage, { weatherRoute: route.value, onNavigate }) })`, and mounts it into the container. The root needs a render function because Vue does not unwrap a ref that is passed as a root prop.
  - `disconnectedCallback`: `app.unmount()`, clears the shadow root's contents, and drops the app reference. Nothing global is left behind.
  - `attributeChangedCallback('weather-route')`: updates a `shallowRef`, so Vue re-renders without remounting.
  - `weatherRoute` property ↔ attribute reflection (unchanged from M1).
  - `onNavigate()` dispatches `new CustomEvent(MF_NAVIGATE, { detail: { path: weatherRoute }, bubbles: true, composed: true })` on `this`. The Vue tree never sees the contract event name: it only emits `navigate`.
  - The guarded `customElements.define` is still the only side effect. Vue is bundled. The app adds nothing to `window`. One known exception: the Vue runtime sets its own markers (`__VUE__`, `__VUE_INSTANCE_SETTERS__`, `__VUE_SSR_SETTERS__`, plus HMR and devtools hooks in development builds), and they can't be configured away. TD-25 allow-lists exactly these names.

### 2.2 UI behaviour

| Feature | Behaviour |
|---|---|
| Add | Text input plus an "Add" button in a form. Submitting (Enter or button) validates the title. If it is valid, the todo is added (not done), the input is cleared, and the change is saved. If it is invalid, nothing is added and an inline message is shown: "Title is required" or "Max 200 characters". The input also has `maxlength="200"`. |
| Toggle | A checkbox per item toggles `done` and saves. |
| Inline edit | Double-clicking the title (or pressing an "Edit" button) swaps the title for an input. Enter or blur commits a valid trimmed title. Escape cancels. An invalid title (empty or too long) reverts to the old title. |
| Delete | A "Delete" button per item removes it and saves. |
| Filter | Three buttons: All / Active / Done. The current one has `aria-pressed="true"`. Default is All. Kept in memory only. |
| Counter | "`n` item(s) left" (`1 item left`, `0 items left`, `2 items left`), counting todos that are not done. |
| Clear completed | Button removes every done todo and saves. It is hidden when no todo is done. |
| Empty state | Shown when the **whole list** is empty (not just the filtered view). It contains the link only when `weather-route` is set. The link text is exactly `Nothing to do. Check the weather?` and its `href` is the route. A click calls `preventDefault()` and the page emits `navigate`. Without the attribute, the app shows only a neutral "No todos yet" message. |

Persistence: the page loads from storage on mount (every connect, so re-entering the route reads fresh data) and saves after every change.

### 2.3 Build

- `@vitejs/plugin-vue` is used in `vite.config.ts` and `vitest.config.ts`.
- Library mode stays `web-component.ts → todo-app.js` (ES, one file). Vite library mode does not replace `process.env.NODE_ENV`, so set `define: { 'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development') }`. A custom `--mode` must not ship Vue's development build. Vue must be bundled, not external.
- The build output contains no separate `.css` asset. All styles are inlined through `?inline`.
- Type checking must also cover `.vue` files: use `vue-tsc` if it works with the workspace TypeScript; otherwise add a `*.vue` module shim and note the gap in the PR.
- Fix `package.json` `"customElements"`: it currently points at a stale absolute scratchpad path. It must be `"custom-elements.json"`. Regenerate `custom-elements.json` with `pnpm analyze` and keep the JSDoc tags (`@tag`, `@attr`, `@fires`, `@cssprop`) on the root class.

## 3. Test scenarios

Tests are written before the code ([02.testing.md](../specs/02.testing.md)). The IDs are stable, and each `it` ends with its ID.

### 3.1 Domain: `domain/todos.test.ts` (no DOM)

| ID | Given / when / then |
|---|---|
| TDM-01 | given `"  Buy milk  "`, when validated, then ok with title `"Buy milk"` |
| TDM-02 | given `""` or only whitespace, when validated, then not ok, reason `empty` |
| TDM-03 | given 200 chars, then ok; given 201 chars (after trim), then not ok, reason `too-long` |
| TDM-04 | given a list, when `addTodo`, then a new list ends with `{ id, title, done: false }` and the input list is unchanged |
| TDM-05 | given a todo, when `toggleTodo(id)`, then only that todo's `done` flips; unknown id returns an equal list |
| TDM-06 | given a todo, when `renameTodo(id, title)`, then only its title changes |
| TDM-07 | given a todo, when `removeTodo(id)`, then it is gone |
| TDM-08 | given mixed todos, when `clearCompleted`, then only the not-done todos remain, in order |
| TDM-09 | given mixed todos, when `filterTodos` with `all`/`active`/`done`, then the matching subsets are returned in order |
| TDM-10 | given mixed todos, when `remainingCount`, then it is the number not done |

### 3.2 Service: `services/todo-storage.test.ts` (fake `Storage`)

| ID | Given / when / then |
|---|---|
| TDS-01 | given nothing stored, when loaded, then `[]` |
| TDS-02 | given todos saved, when loaded, then the same todos come back from key `todos:list` |
| TDS-03 | given corrupt JSON, when loaded, then `[]` and `console.warn` is called |
| TDS-04 | given an array with some invalid items, when loaded, then only valid todos are returned |
| TDS-05 | given `setItem` throws, when saved, then it does not throw and `console.warn` is called |

### 3.3 Contract and UI: `web-component.test.ts` (through the element only, real `localStorage` cleared per test)

The existing TD-01 … TD-12 stay and must keep passing unchanged in meaning. TD-03, TD-05 … TD-08 and TD-10 … TD-11 run with an empty list, so the empty state is visible. Where Vue renders asynchronously, tests `await` a flush (`await nextTick()` or a microtask) instead of a timer.

| ID | Given / when / then |
|---|---|
| TD-13 | given an empty list, when a title is submitted, then one item is rendered, the counter reads `1 item left`, and `todos:list` holds it |
| TD-14 | given a whitespace-only title, when submitted, then no item is added and "Title is required" is shown |
| TD-15 | given an item, when its checkbox is toggled, then the counter reads `0 items left`, the item is marked done, and storage is updated |
| TD-16 | given an item, when edited inline and Enter is pressed, then the new trimmed title is rendered and stored |
| TD-17 | given an item in edit mode, when Escape is pressed (or an empty title is committed), then the old title is kept |
| TD-18 | given an item, when Delete is clicked, then it is removed from the DOM and storage |
| TD-19 | given one active and one done item, when the Active / Done / All filters are clicked, then only the matching items show, and the active filter has `aria-pressed="true"` |
| TD-20 | given done items, when "Clear completed" is clicked, then only active items remain; given no done items, then the button is not rendered |
| TD-21 | given todos in `todos:list`, when the element is appended, then they are rendered (survives reload) |
| TD-22 | given a mounted element with todos, when it is removed and a new `<todo-app>` is appended, then the same todos are rendered (leave / re-enter route) |
| TD-23 | given a non-empty list and `weather-route` set, when rendered, then the weather link is not shown; when the last todo is deleted, then it appears |
| TD-24 | given a mounted element, when it is removed, then its shadow root has no Vue content left and later attribute changes do not throw |
| TD-25 | given rendering, then `document.head` gains no `<style>`/`<link>` nodes and `window` gains no new own properties |
| TD-26 | given `custom-elements.json`, then it documents the `todo-app` tag, the `weather-route` attribute, and the `mf:navigate` event (extends TD-12 to check the package.json `customElements` path resolves to the file) |

## 4. Exit criteria

- `pnpm -r test` and `pnpm -r typecheck` pass; `pnpm -F @mf/todo-app build` emits a single `dist/todo-app.js` with no CSS asset.
- Manual check: `pnpm dev`, then open the shell at `#/todo`. Add, toggle, edit, filter and clear todos, then reload: the todos persist. Go to `#/weather` and back: the todos persist. Delete all todos, then click the link: the shell routes to `#/weather`.
- The shell code is unchanged.
