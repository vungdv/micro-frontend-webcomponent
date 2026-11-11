import { describe, expect, it, vi } from 'vitest';
import { MF_NAVIGATE, requestNavigate, type NavigateDetail } from '../src/index';

describe('requestNavigate', () => {
  it('dispatches mf:navigate on window with the path, bubbling and composed', () => {
    const listener = vi.fn();
    window.addEventListener(MF_NAVIGATE, listener);
    try {
      requestNavigate('#/weather');
    } finally {
      window.removeEventListener(MF_NAVIGATE, listener);
    }
    expect(MF_NAVIGATE).toBe('mf:navigate');
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]![0] as CustomEvent<NavigateDetail>;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.detail).toEqual({ path: '#/weather' });
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });

  it('dispatches on an explicit target when given', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener(MF_NAVIGATE, listener);
    requestNavigate('#/', target);
    expect((listener.mock.calls[0]![0] as CustomEvent<NavigateDetail>).detail.path).toBe('#/');
  });
});
