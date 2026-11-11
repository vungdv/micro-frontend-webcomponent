# M1: Host shell

Parent spec: [01.init-spec.md](../specs/01.init-spec.md). Milestone index: [README.md](README.md).

## 1. Goal

Build the host (shell) and prove that it can compose independently built micro-frontends at runtime, before any real app or auth exists.

At the end of M1, the host must:

1. **Boot from a manifest.** Fetch and validate `host.config.json`. The manifest is the only thing the host knows about each app (`route`, `url`, `tag`).
2. **Route by hash.** Map `#/<name>` to a manifest entry. `#/` is the host's home view; an unknown route shows a not-found view.
3. **Load an app on first visit only.** Later visits reuse the already registered element.
4. **Mount exactly one app at a time.** Create the custom element in the outlet, and remove the previous one on route change.
5. **Contain failures.** A remote that is down, slow, or broken affects only its own route: an error panel with Retry replaces it, and the header and other routes keep working.
6. **Accept navigation requests from apps.** An app asks to navigate with the `mf:navigate` event; the host decides whether to act on it.

Out of scope for M1: auth (M2), Vue and Lit apps (M3, M4), production layout and deployment (M5), theming (M6). The remotes in M1 are vanilla placeholder elements.

## 2. Architecture

### 2.1 Why a mediator

Booting, routing, loading, mounting and error handling all involve several components at the same time. If each component called the others directly (the router mounting elements, the loader drawing error panels), the order of steps would be spread across the code and every component would depend on every other one.

With the Mediator pattern, one object, the `HostMediator`, owns every cross-component decision. The other components are **colleagues** that each do one job and report what happened.

### 2.2 Participants

```mermaid
flowchart LR
  subgraph Host["Host (packages/host)"]
    direction LR
    M["HostMediator<br/>(state + transition)"]
    CL[ConfigLoader]
    R[Router]
    ML[ModuleLoader]
    O[Outlet]
    H[Header]
  end

  subgraph Remotes["Remotes (other dev servers)"]
    TA["&lt;todo-app&gt;"]
    WD["&lt;weather-dashboard&gt;"]
  end

  CFG[(host.config.json)]

  M -- commands --> CL & R & ML & O & H
  CL & R & ML & O -. notifications .-> M
  CL -- fetch --> CFG
  ML -- "import(url)" --> Remotes
  O -- "createElement(tag)" --> Remotes
  Remotes -. "mf:navigate (window event)" .-> M
```

| Role | Component | Does | Never does |
|---|---|---|---|
| Mediator | `HostMediator` | Holds the host state, decides the next step, sends commands to colleagues | Touch the DOM, fetch, import |
| Colleague | `ConfigLoader` | Fetches and validates the manifest | Decide what happens after a failure |
| Colleague | `Router` | Listens to `hashchange`, resolves the hash to a manifest entry, sets `location.hash` on request | Load or mount anything |
| Colleague | `ModuleLoader` | `import(url)` + `whenDefined(tag)`, with timeouts and retry; skips the import if `customElements.get(tag)` is already defined | Touch the DOM |
| Colleague | `Outlet` | Owns `#mf-outlet`: shows home, loading, error, not-found, or mounts an element | Decide what to show |
| Colleague | `Header` | Renders nav links from the manifest, highlights the active one | Navigate on its own (links are plain `<a href="#/...">`) |
| External colleague | Remote element | Renders inside its Shadow DOM; may dispatch `mf:navigate` | Know about the mediator or other apps |

### 2.3 Communication rules

1. **Colleagues → mediator: notifications only.** Each colleague gets a `notify(event)` callback in its constructor and reports facts (`configLoaded`, `configFailed`, `routeChanged`, `appLoaded`, `appFailed`, `retryRequested`).
2. **Mediator → colleagues: commands only.** The mediator calls colleague methods (`load()`, `navigate()`, `mount()`, ...). Commands never return decisions to the mediator; results come back later as notifications.
3. **No colleague imports another colleague.** Dependencies point one way: `main.ts` wires colleagues to the mediator.
4. **Remotes talk to the host only through the contract** (`@mf/shared-contracts`): attributes in, `mf:navigate` out. One window listener in `main.ts` turns `mf:navigate` into a `navigateRequested` notification.
5. **The decision logic is a pure function.** `transition(state, event) → { state, commands }` has no DOM and no I/O, so every rule can be unit-tested. `HostMediator` only stores the state, calls `transition`, and runs the returned commands.

### 2.4 Behaviour: host state machine

The mediator's state is the single source of truth for what the user sees.

```mermaid
stateDiagram-v2
  [*] --> booting: start / config.load

  booting --> fatalError: configFailed / outlet.error(global)
  fatalError --> booting: retryRequested(global) / config.load
  booting --> booting: configLoaded / header.render + router.start
  booting --> Routed: routeChanged

  state Routed {
    home
    notFound
    loadingApp --> appActive: appLoaded(current id) / outlet.mount
    loadingApp --> appError: appFailed(current id) / outlet.error(route)
    appError --> loadingApp: retryRequested(route) / loader.load(retry)
  }

  Routed --> Routed: routeChanged
```

Key behaviours:

- **Routing is the same from every state.** Once the config is loaded, `routeChanged` selects the next state from the hash alone: `#/` → `home`, a declared route → `loadingApp`, anything else → `notFound`. This includes the first route, which the router reports as soon as it starts.
- **Activation id.** Each entry into `loadingApp` gets a new id. An `appLoaded` / `appFailed` whose id is not the current one is stale (the user already navigated away) and is ignored with a warning.
- **`fatalError` is only for a broken manifest.** A broken remote leads to `appError` (goal 5).
- **M2 extension point.** Auth adds states (`loadingAuth`, `unauthenticated`, `authError`) between `booting` and the route states. Colleagues and the transition shape stay the same.

### 2.5 Behaviour: collaboration sequences

#### Boot and first route

```mermaid
sequenceDiagram
  autonumber
  participant Main as main.ts
  participant M as HostMediator
  participant CL as ConfigLoader
  participant H as Header
  participant R as Router
  participant O as Outlet

  Main->>M: start()
  M->>CL: load()
  CL-->>M: configLoaded(config)
  M->>H: render(apps)
  M->>R: start(apps)
  R-->>M: routeChanged("#/", null)
  M->>H: setActive(null)
  M->>O: showHome(apps)
```

#### Open an app (first visit), then leave it

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant R as Router
  participant M as HostMediator
  participant ML as ModuleLoader
  participant O as Outlet
  participant Rem as Remote (5175)
  participant El as todo-app

  U->>R: click "Todo" (hash = #/todo)
  R-->>M: routeChanged("#/todo", todo)
  Note over M: home → loadingApp(id=1)
  M->>O: showLoading(todo)
  M->>ML: load(todo, 1)
  ML->>Rem: import(url)
  Rem-->>ML: module runs, customElements.define("todo-app")
  ML-->>M: appLoaded(todo, 1)
  Note over M: loadingApp → appActive
  M->>O: mount(todo)
  O->>El: createElement + setAttribute + append
  El->>El: connectedCallback

  U->>R: click "Weather"
  R-->>M: routeChanged("#/weather", weather)
  Note over M: appActive → loadingApp(id=2)
  M->>O: showLoading(weather)
  O->>El: remove (disconnectedCallback)
  M->>ML: load(weather, 2)
```

#### Remote fails, user retries

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant M as HostMediator
  participant ML as ModuleLoader
  participant O as Outlet

  M->>ML: load(weather, 3)
  ML-->>M: appFailed(weather, 3, "could not reach weather")
  Note over M: loadingApp → appError
  M->>O: showError("route", message, retryable)
  U->>O: click Retry
  O-->>M: retryRequested("route")
  Note over M: appError → loadingApp(id=4)
  M->>O: showLoading(weather)
  M->>ML: load(weather, 4, retry=true)
```

#### App asks the host to navigate

```mermaid
sequenceDiagram
  autonumber
  participant El as todo-app
  participant Main as main.ts (window listener)
  participant M as HostMediator
  participant R as Router

  El->>Main: dispatch mf:navigate { path: "#/weather" }
  Main-->>M: navigateRequested("#/weather")
  alt path is "#/" or a declared route
    M->>R: navigate("#/weather")
    R-->>M: routeChanged("#/weather", weather)
    Note over M: continues as a normal route change
  else unknown path
    Note over M: log.warn, state unchanged
  end
```
