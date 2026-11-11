# Milestones

This folder breaks down the milestones in [01.init-spec.md](../specs/01.init-spec.md#milestones). There is one file per milestone. Each file is written once the milestone is next in line, so it can take into account what the previous milestones actually delivered.

| # | Milestone | Detail design | Depends on | Status |
|---|---|---|---|---|
| M1 | Host shell, manifest, routing, placeholder apps | [m1-host-shell.md](m1-host-shell.md) | none | Designed |
| M2 | Shared auth (Auth0, UserContext, route guard) | not written yet | M1 | Planned |
| M3 | Todo app (Vue 3) | not written yet | M2 | Planned |
| M4 | Weather dashboard (Lit) | not written yet | M2 | Planned |
| M5 | Build and deploy to GitHub Pages | not written yet | M1 (M2 for Auth0 URLs) | Planned |
| M6 | Polish: theming, error states, README | not written yet | M3, M4 | Planned |

## Scope summary

### M1: Host shell
Builds the composition mechanism without any real app or auth. This includes the `HostMediator` and its colleagues, `host.config.json` (dev and prod variants), hash routing, and dynamic `import()` of remote bundles. It also adds two vanilla placeholder custom elements served by their own Vite dev servers, plus the loading placeholder, the error panel with retry, and the not-found view.
**Exit:** you can navigate between two independently served placeholders, and when one remote is stopped, only its route shows an error.

### M2: Shared auth
Adds the `auth` package: `<mf-login>`, `<mf-user-menu>`, `window.mfAuth`, `mf:auth-changed`, Authorization Code + PKCE against Auth0, and the redirect callback on the base URL. The `auth` entry becomes mandatory, and the mediator gains the `loadingAuth`, `unauthenticated` and `authError` states.
**Exit:** login and logout work locally, an unauthenticated user on any route sees `<mf-login>`, and logging out unmounts the active app.

### M3: Todo app
Replaces the todo placeholder with the Vue 3 app from the [feature spec](../specs/01.init-spec.md#todo-app-todo-app-vue-3). The app's data is stored per user under `todos:<sub>`.
**Exit:** the acceptance criteria of the todo feature spec pass.

### M4: Weather dashboard
Replaces the weather placeholder with the Lit app: geocoding search, saved cities, forecast cards, refresh timer, stale-data display when offline.
**Exit:** the acceptance criteria of the weather feature spec pass.

### M5: Deploy
A GitHub Actions workflow builds every package and assembles the single Pages layout (`/`, `/host.config.json`, `/remotes/*`). The Auth0 callback and logout URLs are set to the Pages URL.
**Exit:** the deployed site behaves like local dev, using same-origin relative URLs.

### M6: Polish
Theming through `--mf-*` custom properties, consistent error and empty states, and a README with run instructions.
