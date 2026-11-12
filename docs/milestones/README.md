# Milestones

This folder breaks down the milestones in [01.init-spec.md](../specs/01.init-spec.md#milestones). There is one file per milestone. Each file is written once the milestone is next in line, so it can take into account what the previous milestones actually delivered.

| # | Milestone | Detail design | Depends on | Status |
|---|---|---|---|---|
| M1 | Host shell, manifest, routing, placeholder apps | [m1-host-shell.md](m1-host-shell.md) | none | Designed |
| M2 | Todo app (Vue 3) | [m2-todo-app.md](m2-todo-app.md) | M1 | Designed |
| M3 | Weather dashboard (Lit) | not written yet | M1 | Planned |
| M4 | Build and deploy to GitHub Pages | not written yet | M1 | Planned |
| M5 | Polish: theming, error states, README | not written yet | M2, M3 | Planned |

## Scope summary

### M1: Host shell
Builds the composition mechanism without any real app. This includes the `HostMediator` and its colleagues, `host.config.json` (dev and prod variants), hash routing, and dynamic `import()` of remote bundles. It also adds two vanilla placeholder custom elements served by their own Vite dev servers (weather shows its `units` attribute; todo sends `mf:navigate` from a link built from its `weather-route` attribute), plus the loading placeholder, the error panel with retry, and the not-found view.
**Exit:** you can navigate between two independently served placeholders, including from the todo placeholder's link through `mf:navigate`; the weather placeholder shows the `units` value from the manifest; and when one remote is stopped, only its route shows an error.

### M2: Todo app
Replaces the todo placeholder with the Vue 3 app from the [feature spec](../specs/01.init-spec.md#todo-app-todo-app-vue-3). The app's data is stored under `todos:list`.
**Exit:** the acceptance criteria of the todo feature spec pass.

### M3: Weather dashboard
Replaces the weather placeholder with the Lit app: geocoding search, saved cities, forecast cards, refresh timer, stale-data display when offline.
**Exit:** the acceptance criteria of the weather feature spec pass.

### M4: Deploy
A GitHub Actions workflow builds every app and assembles the single Pages layout (`/`, `/host.config.json`, `/remotes/*`).
**Exit:** the deployed site behaves like local dev, using same-origin relative URLs.

### M5: Polish
Theming through `--mf-*` custom properties, consistent error and empty states, and a README with run instructions.
