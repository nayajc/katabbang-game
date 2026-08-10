/**
 * Post-counter grace (COUNTER_GRACE_MS).
 *
 * A successful counter leaves the player planted mid-uppercut in the lane they
 * just fought in, so the next body arriving behind the bumper is unavoidable.
 * The grace reuses the i-frame mechanism, but silently: no hit flash, and no
 * i-frame blink, because a blink reads to the player as "you were hit".
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { CounterWindow } from '@/game/counter';
import { TUNING } from '@/game/tuning';
import { createHarness, type Harness } from './harness';

let h: Harness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

type Internals = { counter: CounterWindow; hitFlashStart: number };
const innards = (harness: Harness) => harness.game as unknown as Internals;

/** Drops a pedestrian right on top of the player, guaranteeing a collision. */
function spawnOnPlayer(harness: Harness, id: number): void {
  const { player, entities } = harness.inner;
  entities.push({
    id,
    kind: 'pedestrian',
    lane: player.lane,
    x: player.laneX,
    y: player.y,
    dead: false,
    engaged: false,
    knockback: null,
  });
}

/**
 * Plants a bumper in the player's lane, rides the armed window to its centre and
 * taps there — a PERFECT counter. Returns the harness at the frame of the tap.
 */
function landCounter(seed: number): Harness {
  const harness = createHarness(seed);
  const { player, entities } = harness.inner;
  entities.push({
    id: 1,
    kind: 'bumper',
    lane: player.lane,
    x: player.laneX,
    y: player.y - TUNING.SLOWMO_TRIGGER_DIST + 20,
    dead: false,
    engaged: false,
    knockback: null,
  });
  while (harness.game.phase !== 'slowmo' && harness.elapsed < 5000) harness.step();
  expect(harness.game.phase, 'the bumper armed a counter window').toBe('slowmo');

  const { counter } = innards(harness);
  while (performance.now() < counter.windowCenterTs && harness.elapsed < 20_000) harness.step();
  harness.inner.onCounter(performance.now());
  expect(harness.game.phase, 'the tap resolved the window').toBe('result');
  expect(harness.inner.score.hp, 'a perfect counter costs no hp').toBe(TUNING.HP_MAX);
  return harness;
}

/** Retires every entity on the road (they are filtered out next update). */
function clearRoad(harness: Harness): void {
  for (const e of harness.inner.entities) e.dead = true;
}

describe('grace after a successful counter', () => {
  it('ignores collisions for COUNTER_GRACE_MS, then takes damage again', () => {
    h = landCounter(31);
    const start = h.elapsed;

    // Inside the grace: obstacles piling onto the player cost nothing. Each one
    // is retired after its frame so the road is empty when the grace lapses —
    // a leftover pile would land several hits on the same frame and confuse the
    // "next collision costs exactly one hp" half of the assertion.
    let id = 100;
    while (h.elapsed - start < TUNING.COUNTER_GRACE_MS - TUNING.FIXED_DT * 2) {
      spawnOnPlayer(h, (id += 1));
      h.step();
      expect(h.inner.score.hp).toBe(TUNING.HP_MAX);
      clearRoad(h);
    }

    // Once it lapses, the very next collision lands.
    while (h.elapsed - start <= TUNING.COUNTER_GRACE_MS) {
      h.step();
      clearRoad(h);
    }
    spawnOnPlayer(h, 999);
    h.step();
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);
  });

  it('is silent: no hit flash and no i-frame blink', () => {
    h = landCounter(31);
    expect(innards(h).hitFlashStart).toBe(-Infinity);

    // The blink alternates every IFRAME_BLINK_MS, so a full period of frames
    // would expose any dimmed frame. A hp loss is asserted to blink below, which
    // keeps this from passing just because the blink is broken everywhere.
    const frames = Math.ceil((TUNING.IFRAME_BLINK_MS * 2) / TUNING.FIXED_DT) + 1;
    for (let i = 0; i < frames; i += 1) {
      h.step();
      expect(alphaNow(h)).toBe(1);
    }
  });

  it('still blinks for the i-frames granted by an actual hit', () => {
    h = createHarness(555);
    spawnOnPlayer(h, 1);
    h.step();
    expect(h.inner.score.hp).toBe(TUNING.HP_MAX - 1);

    const frames = Math.ceil((TUNING.IFRAME_BLINK_MS * 2) / TUNING.FIXED_DT) + 1;
    let dimmed = 0;
    for (let i = 0; i < frames; i += 1) {
      h.step();
      if (alphaNow(h) < 1) dimmed += 1;
    }
    expect(dimmed).toBeGreaterThan(0);
  });
});

/** The sprite alpha `Game.draw` would publish for the current wall clock. */
function alphaNow(harness: Harness): number {
  let alpha = 1;
  const game = harness.game as unknown as {
    draw(ts: number): void;
    renderer: { render(view: { playerAlpha: number }): void } | null;
  };
  game.renderer = { render: (view) => void (alpha = view.playerAlpha) };
  game.draw(performance.now());
  game.renderer = null;
  return alpha;
}
