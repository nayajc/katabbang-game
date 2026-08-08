import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachInput } from '@/game/input';

/** Minimal HTMLElement stand-in: event dispatch + pointer capture bookkeeping. */
function makeEl() {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const captured = new Set<number>();
  return {
    captured,
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
    setPointerCapture(id: number) {
      captured.add(id);
    },
    releasePointerCapture(id: number) {
      captured.delete(id);
    },
    hasPointerCapture(id: number) {
      return captured.has(id);
    },
    fire(type: string, e: Record<string, unknown>) {
      const ev = { preventDefault() {}, ...e };
      for (const fn of listeners.get(type) ?? []) fn(ev);
    },
  };
}

function makeHandlers() {
  const lanes: Array<[number, number]> = [];
  const counters: number[] = [];
  return {
    lanes,
    counters,
    onLane: (d: -1 | 1, ts: number) => void lanes.push([d, ts]),
    onCounter: (ts: number) => void counters.push(ts),
  };
}

const win = { addEventListener() {}, removeEventListener() {} };

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = win;
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe('attachInput pointer tracking', () => {
  it('still accepts taps after a pointercancel ends the gesture', () => {
    const el = makeEl();
    const h = makeHandlers();
    attachInput(el as unknown as HTMLElement, h);

    el.fire('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 0 });
    el.fire('pointercancel', { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 20 });
    expect(h.counters).toEqual([]); // a cancelled gesture is not a tap
    expect(el.captured.has(1)).toBe(false);

    el.fire('pointerdown', { pointerId: 2, clientX: 10, clientY: 10, timeStamp: 100 });
    el.fire('pointerup', { pointerId: 2, clientX: 10, clientY: 10, timeStamp: 150 });
    expect(h.counters).toEqual([100]);
  });

  it('self-heals when a pointerdown arrives while an old pointer is still tracked', () => {
    const el = makeEl();
    const h = makeHandlers();
    attachInput(el as unknown as HTMLElement, h);

    // Pointer 1 never ends (touch stolen by a system gesture, no cancel seen).
    el.fire('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 0 });

    el.fire('pointerdown', { pointerId: 2, clientX: 10, clientY: 10, timeStamp: 500 });
    el.fire('pointerup', { pointerId: 2, clientX: 10, clientY: 10, timeStamp: 540 });
    expect(h.counters).toEqual([500]);
  });

  it('captures the pointer on pointerdown and releases it on pointerup', () => {
    const el = makeEl();
    const h = makeHandlers();
    attachInput(el as unknown as HTMLElement, h);

    el.fire('pointerdown', { pointerId: 7, clientX: 0, clientY: 0, timeStamp: 0 });
    expect(el.captured.has(7)).toBe(true);
    el.fire('pointerup', { pointerId: 7, clientX: 0, clientY: 0, timeStamp: 10 });
    expect(el.captured.has(7)).toBe(false);
  });

  it('clears tracking on lostpointercapture', () => {
    const el = makeEl();
    const h = makeHandlers();
    attachInput(el as unknown as HTMLElement, h);

    el.fire('pointerdown', { pointerId: 3, clientX: 0, clientY: 0, timeStamp: 0 });
    el.fire('lostpointercapture', { pointerId: 3 });
    // A move for the lost pointer must no longer be treated as the live gesture.
    el.fire('pointermove', { pointerId: 3, clientX: 200, clientY: 0, timeStamp: 50 });
    expect(h.lanes).toEqual([]);
  });

  it('still detects swipes end to end', () => {
    const el = makeEl();
    const h = makeHandlers();
    attachInput(el as unknown as HTMLElement, h);

    el.fire('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, timeStamp: 0 });
    el.fire('pointermove', { pointerId: 1, clientX: 60, clientY: 2, timeStamp: 30 });
    el.fire('pointerup', { pointerId: 1, clientX: 60, clientY: 2, timeStamp: 40 });
    expect(h.lanes).toEqual([[1, 30]]);
    expect(h.counters).toEqual([]);
  });
});
