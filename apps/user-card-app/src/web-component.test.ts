import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TAGS } from '@mf/contracts';

const shownName = (el: HTMLElement) =>
  el.shadowRoot?.querySelector('[data-testid="name"]')?.textContent;

beforeAll(async () => { await import('./web-component.ts'); });
afterEach(() => document.body.replaceChildren());

describe('<user-card>', () => {
  it('renders the name when attributes are set after createElement (like the shell)', () => {
    const el = document.createElement(TAGS.userCard);
    el.setAttribute('name', 'Ada');
    document.body.append(el);
    expect(shownName(el)).toBe('Ada');
  });

  it('falls back to "guest" without a name', () => {
    const el = document.createElement(TAGS.userCard);
    document.body.append(el);
    expect(shownName(el)).toBe('guest');
  });

  it('re-renders when name changes', () => {
    const el = document.createElement(TAGS.userCard);
    document.body.append(el);
    el.setAttribute('name', 'Linus');
    expect(shownName(el)).toBe('Linus');
  });

  it('does not interpret the name as HTML', () => {
    const el = document.createElement(TAGS.userCard);
    el.setAttribute('name', '<img src=x>');
    document.body.append(el);
    expect(el.shadowRoot?.querySelector('img')).toBeNull();
    expect(shownName(el)).toBe('<img src=x>');
  });
});
