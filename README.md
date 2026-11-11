# Micro-frontend

Web-component micro-frontends composed at runtime by a host shell. Design: [docs/specs/01.init-spec.md](docs/specs/01.init-spec.md), milestones: [docs/milestones](docs/milestones/README.md).

## Run (M1: host shell + placeholder apps)

```sh
npm install
npm run dev        # host :5173, todo-app :5175, weather-app :5176
```

Open http://localhost:5173 and use the header links (or the buttons inside each app, which send `mf:navigate`).
To see a route-scoped failure, stop the todo or weather dev server and open its route: only that route shows an error panel with Retry. The header and the other route keep working.

```sh
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # vite build for every package
```

## Packages

| Package | Role |
|---|---|
| `packages/host` | Shell: `HostMediator` + colleagues (`config-loader`, `router`, `module-loader`, `outlet`, `header`), pure `transition.ts` |
| `packages/shared-contracts` | The integration contract: `mf:navigate` event name, `NavigateDetail`, `requestNavigate()` |
| `packages/todo-app`, `packages/weather-app` | Placeholder custom elements `<todo-app>` and `<weather-dashboard>` |

The dev manifest is `packages/host/public/host.config.json` (`http://localhost:<port>/src/*.ts`). In M1 it only declares `apps`; the `auth` entry becomes mandatory in M2, and M5 adds the production manifest.

## Known limitations

- Hash routes match exactly: `#/todo/` (trailing slash) or `#/todo?x=1` (query) are not normalized and show not-found.
- If a remote's constructor or `connectedCallback` throws after it is mounted, the host does not catch it; the outlet keeps the broken element instead of showing the error panel.
