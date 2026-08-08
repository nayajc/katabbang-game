import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '@/game/game';
import { resetPointerHealth } from '@/game/pointer-health';
import { LEFT_LANE_BUTTON } from '@/game/render';
import { TUNING } from '@/game/tuning';

/**
 * Canvas stand-in that dispatches in registration order and honours
 * stopImmediatePropagation, so the game's button listener and attachInput's
 * generic gesture listener compete exactly like they do in the browser.
 */
function makeCanvas() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const laneWrites: string[] = [];
  const dataset: Record<string, string> = {};
  const canvas = {
    dataset: new Proxy(dataset, {
      set(target, key: string, value: string) {
        if (key === 'playerLane') laneWrites.push(value);
        target[key] = value;
        return true;
      },
    }),
    laneWrites,
    getContext: () => ({}) as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: TUNING.VIRTUAL_W,
      height: TUNING.VIRTUAL_H,
    }),
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(fn);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      const arr = listeners.get(type);
      const i = arr?.indexOf(fn) ?? -1;
      if (arr && i >= 0) arr.splice(i, 1);
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
    fire(type: string, e: Record<string, unknown>) {
      let stopped = false;
      const ev = {
        preventDefault() {},
        stopImmediatePropagation() {
          stopped = true;
        },
        ...e,
      };
      for (const fn of [...(listeners.get(type) ?? [])]) {
        fn(ev);
        if (stopped) break;
      }
    },
  };
  return canvas;
}

function touches(list: Array<{ identifier: number; clientX: number; clientY: number }>) {
  return list as unknown as TouchList;
}

const win = { addEventListener() {}, removeEventListener() {} };

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = win;
  resetPointerHealth();
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe('Game onButtonTouch', () => {
  it('changes lane exactly once and swallows the gesture when pointers are silent', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas: canvas as unknown as HTMLCanvasElement, seed: 1 });
    game.startRun(1);
    canvas.laneWrites.length = 0;

    // Registered last: it only runs if the button listener let the event through.
    let sawTouchStart = false;
    canvas.addEventListener('touchstart', () => {
      sawTouchStart = true;
    });

    // Latch is cold (no pointerdown ever) -> the touch fallback is armed.
    canvas.fire('touchstart', {
      changedTouches: touches([
        { identifier: 1, clientX: LEFT_LANE_BUTTON.x, clientY: LEFT_LANE_BUTTON.y },
      ]),
      timeStamp: 1000,
    });

    expect(canvas.laneWrites).toEqual(['0']);
    expect(sawTouchStart).toBe(false);

    // attachInput never started a gesture, so a following swipe/tap is inert.
    canvas.fire('touchmove', {
      changedTouches: touches([{ identifier: 1, clientX: TUNING.VIRTUAL_W - 20, clientY: LEFT_LANE_BUTTON.y }]),
      timeStamp: 1030,
    });
    canvas.fire('touchend', {
      changedTouches: touches([{ identifier: 1, clientX: TUNING.VIRTUAL_W - 20, clientY: LEFT_LANE_BUTTON.y }]),
      timeStamp: 1050,
    });

    expect(canvas.laneWrites).toEqual(['0']);
    game.destroy();
  });
});
