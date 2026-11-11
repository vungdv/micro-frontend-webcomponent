import { beforeEach, describe, expect, it } from 'vitest';
import { MF_NAVIGATE, requestNavigate, type NavigateDetail } from '../src/index';

/** Listens for mf:navigate on a target and records every event. */
function recordNavigate(target: EventTarget): { events: Array<CustomEvent<NavigateDetail>>; stop(): void } {
  const events: Array<CustomEvent<NavigateDetail>> = [];
  const listener = (event: Event) => void events.push(event as CustomEvent<NavigateDetail>);
  target.addEventListener(MF_NAVIGATE, listener);
  return { events, stop: () => target.removeEventListener(MF_NAVIGATE, listener) };
}

describe('Given a page', () => {
  it('then the event name is "mf:navigate" [CT-01]', () => {
    expect(MF_NAVIGATE).toBe('mf:navigate');
  });

  describe('when requestNavigate("#/weather")', () => {
    let events: Array<CustomEvent<NavigateDetail>>;
    beforeEach(() => {
      const rec = recordNavigate(window);
      requestNavigate('#/weather');
      rec.stop();
      events = rec.events;
    });

    it('then one mf:navigate CustomEvent is dispatched on window [CT-01]', () => {
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CustomEvent);
    });

    it('then detail.path is the path [CT-01]', () => {
      expect(events[0]!.detail).toEqual({ path: '#/weather' });
    });

    it('then the event bubbles and is composed [CT-01]', () => {
      expect(events[0]!.bubbles).toBe(true);
      expect(events[0]!.composed).toBe(true);
    });
  });
});

describe('Given an explicit target', () => {
  let target: EventTarget;
  beforeEach(() => {
    target = new EventTarget();
  });

  describe('when requestNavigate("#/", target)', () => {
    let onTarget: Array<CustomEvent<NavigateDetail>>;
    let onWindow: Array<CustomEvent<NavigateDetail>>;
    beforeEach(() => {
      const t = recordNavigate(target);
      const w = recordNavigate(window);
      requestNavigate('#/', target);
      t.stop();
      w.stop();
      onTarget = t.events;
      onWindow = w.events;
    });

    it('then the event is dispatched on that target with detail.path [CT-02]', () => {
      expect(onTarget).toHaveLength(1);
      expect(onTarget[0]!.detail).toEqual({ path: '#/' });
    });

    it('then nothing is dispatched on window [CT-02]', () => {
      expect(onWindow).toEqual([]);
    });
  });
});
