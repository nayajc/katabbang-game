/**
 * Headless play harness.
 *
 * Drives the REAL `Game` through the REAL fixed-timestep loop (the same
 * accumulator arithmetic `Engine` uses) against a canvas stand-in, with
 * `performance.now()` under vitest fake timers so the wall-clock systems
 * (i-frames, counter windows, the result banner) advance in lockstep with the
 * simulation. Rendering is never invoked.
 *
 * Used both for behavioural assertions (grace period, i-frames) and for the
 * survival measurements that gate difficulty tuning.
 */
import { vi } from 'vitest';
import { Game } from '@/game/game';
import type { Entity } from '@/game/entities/spawner';
import type { Player } from '@/game/entities/player';
import { TUNING } from '@/game/tuning';

/** Minimal canvas stand-in: enough surface for Game's constructor and dataset writes. */
export function stubCanvas(): HTMLCanvasElement {
  const canvas = {
    dataset: {} as Record<string, string>,
    getContext: () => ({}) as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: TUNING.VIRTUAL_W,
      height: TUNING.VIRTUAL_H,
    }),
    closest: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  return canvas as unknown as HTMLCanvasElement;
}

/** The private members the harness needs to observe. Test-only view of Game. */
type GameInternals = {
  update(dt: number): void;
  timescale(): number;
  onLane(dir: -1 | 1): void;
  onCounter(ts: number): void;
  entities: Entity[];
  player: Player;
  score: { hp: number };
};

export type Harness = {
  game: Game;
  inner: GameInternals;
  /** Wall-clock ms elapsed since `startRun`. */
  readonly elapsed: number;
  /** Advance one wall-clock frame (FIXED_DT), stepping the sim as Engine would. */
  step(): void;
  destroy(): void;
};

export function createHarness(seed = 12_345): Harness {
  vi.useFakeTimers();
  // `attachInput` and the audio unlock bind to `window`; the node environment
  // has none, and the harness never fires input events through the DOM.
  const hadWindow = 'window' in globalThis;
  if (!hadWindow) {
    (globalThis as Record<string, unknown>).window = {
      addEventListener() {},
      removeEventListener() {},
    };
  }
  const game = new Game({ canvas: stubCanvas(), seed });
  const inner = game as unknown as GameInternals;
  game.startRun(seed);

  let elapsed = 0;
  let acc = 0;
  return {
    game,
    inner,
    get elapsed() {
      return elapsed;
    },
    step() {
      vi.advanceTimersByTime(TUNING.FIXED_DT);
      elapsed += TUNING.FIXED_DT;
      acc += TUNING.FIXED_DT * inner.timescale();
      let steps = 0;
      while (acc >= TUNING.FIXED_DT && steps < TUNING.MAX_STEPS_PER_FRAME) {
        inner.update(TUNING.FIXED_DT);
        acc -= TUNING.FIXED_DT;
        steps += 1;
      }
    },
    destroy() {
      game.destroy();
      if (!hadWindow) delete (globalThis as Record<string, unknown>).window;
      vi.useRealTimers();
    },
  };
}

/** Per-frame agent: may call `h.inner.onLane` / `h.inner.onCounter`. */
export type Bot = (h: Harness) => void;

/** Plays until game over or `limitMs` of wall clock; returns survival in ms. */
export function survive(h: Harness, limitMs: number, bot?: Bot): number {
  while (h.game.phase !== 'gameover' && h.elapsed < limitMs) {
    bot?.(h);
    h.step();
  }
  return h.elapsed;
}

/**
 * Trivial dodge bot: when anything is approaching in the player's lane within
 * `range` vu, hop to a lane that is clear. It never counters — bumpers are
 * treated as plain obstacles to be side-stepped.
 */
export function dodgeBot(range = 300): Bot {
  return (h) => {
    const { player, entities } = h.inner;
    const live = entities.filter((e) => !e.dead && !e.knockback);
    const threat = (lane: number) =>
      live.some((e) => {
        const gap = player.y - e.y;
        return e.lane === lane && gap > -TUNING.ENTITY_R && gap < range;
      });
    if (!threat(player.lane)) return;
    for (const dir of [-1, 1] as const) {
      const next = player.lane + dir;
      if (next < 0 || next > TUNING.LANES - 1) continue;
      if (threat(next)) continue;
      h.inner.onLane(dir);
      return;
    }
  };
}
