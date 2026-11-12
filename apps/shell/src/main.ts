import './styles.css';
import { createHost } from './app/create-host.ts';

function required(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el;
}

createHost({
  window,
  nav: required('mf-nav'),
  outlet: required('mf-outlet'),
  fetch: (input, init) => fetch(input, init),
  configUrl: `${import.meta.env.BASE_URL}host.config.json`,
}).start();
