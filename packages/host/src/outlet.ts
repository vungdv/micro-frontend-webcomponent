import type { AppEntry, ErrorScope, Notify } from './types';

export interface OutletOptions {
  /** The `#mf-outlet` element. */
  element: HTMLElement;
  notify: Notify;
}

/**
 * Owns the content area. Shows home, loading, error or not-found, or mounts one app element.
 * Every show and mount replaces what was there (removing the previous app element).
 * Takes no routing decisions.
 */
export class Outlet {
  private readonly el: HTMLElement;

  constructor(private readonly options: OutletOptions) {
    this.el = options.element;
  }

  showHome(apps: AppEntry[]): void {
    const section = panel('home');
    section.append(heading('Micro-frontend host'), text('p', 'Pick an app:'));
    const list = document.createElement('ul');
    for (const app of apps) {
      const item = document.createElement('li');
      item.append(link(app.route, label(app)));
      list.append(item);
    }
    section.append(list);
    this.replace(section);
  }

  showLoading(entry: AppEntry): void {
    const section = panel('loading');
    section.setAttribute('aria-busy', 'true');
    section.append(text('p', `Loading ${label(entry)}…`));
    this.replace(section);
  }

  showError(scope: ErrorScope, message: string, retryable: boolean): void {
    const section = panel('error');
    section.dataset.scope = scope;
    section.setAttribute('role', 'alert');
    section.append(
      heading(scope === 'global' ? 'The host could not start' : 'This app is unavailable'),
      text('p', message),
    );
    if (retryable) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Retry';
      button.addEventListener('click', () => this.options.notify({ type: 'retryRequested', scope }));
      section.append(button);
    }
    this.replace(section);
  }

  showNotFound(path: string): void {
    const section = panel('not-found');
    section.append(heading('Page not found'), text('p', `No app is registered for ${path}.`), link('#/', 'Go home'));
    this.replace(section);
  }

  mount(entry: AppEntry): void {
    this.replace(document.createElement(entry.tag));
  }

  private replace(node: Element): void {
    this.el.replaceChildren(node);
  }
}

function panel(kind: string): HTMLElement {
  const section = document.createElement('section');
  section.className = `mf-panel mf-panel--${kind}`;
  return section;
}

function heading(content: string): HTMLElement {
  return text('h2', content);
}

function text(tag: string, content: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = content;
  return el;
}

function link(href: string, content: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = content;
  return a;
}

function label(app: AppEntry): string {
  return app.name.charAt(0).toUpperCase() + app.name.slice(1);
}
