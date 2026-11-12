# micro-frontend

A learning repo with two parts: plain **Web Components** examples, and a **Micro-Frontend** host that loads independently built apps at runtime.

```
web-component/        Web Component basics (OOP class style and functional style)
apps/shell/           Host shell: manifest, router, ES module loader
apps/todo-app/        Remote micro-frontend (Vue 3) → <todo-app>
apps/weather-app/     Remote micro-frontend → <weather-dashboard>
apps/timezone-app/    Remote micro-frontend (Vue 3) → <timezone-app>
packages/contracts/   Shared contract: tags, manifest types, mf:navigate event
```

## Web Component

A Web Component is a custom HTML tag the browser itself understands, with no framework required. You write a class that extends `HTMLElement` and register it with `customElements.define('counter-button', CounterButton)`. From then on, every `<counter-button>` in the page is upgraded to an instance of that class. The browser calls lifecycle hooks: `constructor` (create, attach a Shadow DOM), `connectedCallback` (added to the page: render, bind events), `disconnectedCallback` (removed: clean up), and `attributeChangedCallback` for attributes listed in `observedAttributes`. Shadow DOM keeps the markup and styles private, so nothing leaks in or out.

- [web-component/oop/](web-component/oop/): class-based `counter-button`
- [web-component/functional/](web-component/functional/): `defineComponent(name, setup)` hides the class behind a function

## Micro-Frontend: ES Module Dynamic Loader

Each remote app is built and deployed by itself. It ships as **one self-contained ES module** (Vite library mode, `formats: ['es']`) that, when evaluated, calls `customElements.define(tag, …)`. Framework choice stays inside the module. Vue is bundled in and mounted into the element's shadow root.

The shell knows nothing about remotes at build time. At startup it fetches a manifest, [host.config.json](apps/shell/public/host.config.json), that maps each app id to a `route`, a module `url`, a custom element `tag` and optional `attributes`. [registry.ts](apps/shell/src/micro-frontends/registry.ts) validates it and resolves each `url` against the manifest location.

When a route activates, [loader.ts](apps/shell/src/micro-frontends/loader.ts) runs this sequence:

1. If `customElements.get(tag)` already exists, it skips the network.
2. Otherwise it calls the native `import(url)` (marked `@vite-ignore` so the bundler leaves it alone).
3. It waits on `customElements.whenDefined(tag)`.
4. It races both against a timeout (10 s by default) and reports `appLoaded` or `appFailed`.

A retry appends `?retry=n`, which defeats the browser's module cache.

The shell then creates the element, sets its attributes and mounts it. Communication goes through standard DOM: the host passes attributes down, and the app dispatches a bubbling, composed `mf:navigate` `CustomEvent` back up. Deploying a new version of a remote means changing one URL in the manifest.

## Getting started

```sh
pnpm install
pnpm dev        # shell :5173, todo :5175, weather :5176, timezone :5177
pnpm test
pnpm typecheck
pnpm build
```

Web Component examples: `cd web-component && npm install && npm test`, then open the `index.html` files.

More detail lives in [docs/specs/](docs/specs/) and [docs/milestones/](docs/milestones/).
