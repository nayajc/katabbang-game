import { afterEach, describe, expect, it } from 'vitest';
import { TUNING } from '@/game/tuning';
import { createHarness, type Harness } from './harness';

/**
 * The lane controls are DOM buttons layered over the canvas (they used to be
 * drawn INSIDE the canvas and hit-tested in virtual space). The guarantee that
 * mattered then still matters now: a lane command must move the player and
 * must NEVER resolve an armed counter window.
 *
 * The DOM wiring itself is covered by tests/e2e/lane-buttons.spec.ts; this test
 * pins the command `Game` exposes to those buttons.
 */

let h: Harness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

describe('Game.laneTap', () => {
  it('moves the player one lane, clamped at the edges', () => {
    h = createHarness(4242);
    expect(h.inner.player.lane).toBe(1);
    h.game.laneTap(1);
    expect(h.inner.player.lane).toBe(2);
    h.game.laneTap(1);
    expect(h.inner.player.lane).toBe(2);
    h.game.laneTap(-1);
    h.game.laneTap(-1);
    expect(h.inner.player.lane).toBe(0);
  });

  it('publishes the new lane on the canvas dataset (E2E contract)', () => {
    h = createHarness(4242);
    const canvas = (h.game as unknown as { canvas: HTMLCanvasElement }).canvas;
    h.game.laneTap(1);
    expect(canvas.dataset.playerLane).toBe('2');
  });

  it('never resolves an armed counter window', () => {
    // Play until a bumper engages and the phase flips to slowmo.
    for (let seed = 1; seed <= 40 && h === null; seed += 1) {
      const candidate = createHarness(seed);
      for (let i = 0; i < 3600 && candidate.game.phase !== 'slowmo'; i += 1) candidate.step();
      if (candidate.game.phase === 'slowmo') h = candidate;
      else candidate.destroy();
    }
    expect(h, 'a run that reaches slowmo').not.toBeNull();
    const harness = h!;

    const before = harness.inner.player.lane;
    harness.game.laneTap(before === 0 ? 1 : -1);

    expect(harness.game.phase).toBe('slowmo');
    expect(harness.inner.player.lane).not.toBe(before);
    expect(harness.inner.player.lane).toBeLessThan(TUNING.LANES);
  });
});
