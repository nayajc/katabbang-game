import { afterEach, describe, expect, it } from 'vitest';
import type { Fx } from '@/game/fx';
import { TUNING } from '@/game/tuning';
import { getStrings } from '@/lib/i18n';
import { createHarness, type Harness } from './harness';

/**
 * The WHIFF reaction: the counter input pressed with NO window armed.
 *
 * It exists because the input used to be swallowed in total silence, which is
 * why desktop players reported Space as a dead key — see
 * tests/e2e/counter-key.spec.ts for the input-path half of that story.
 *
 * The contract this test pins is that the reaction is PRESENTATION ONLY: hp,
 * score, combo, the phase and the counter window must all be untouched, no
 * matter how hard the input is mashed. A whiff that cost anything would be a
 * difficulty change smuggled in as a visual effect.
 */

let h: Harness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

/** `stubCanvas().closest()` returns null, so Game publishes onto the canvas. */
function whiffCount(harness: Harness): number {
  const canvas = (harness.game as unknown as { canvas: HTMLCanvasElement }).canvas;
  return Number(canvas.dataset.whiffs ?? 0);
}

/** Live whiff captions — the visual half of the reaction, which IS rate-limited. */
function captions(harness: Harness): number {
  const fx = (harness.game as unknown as { fx: Fx }).fx;
  let n = 0;
  fx.comic.forEach((p) => {
    if (p.text === getStrings().fxSwish) n += 1;
  });
  return n;
}

describe('whiffed counter input', () => {
  it('costs nothing in the simulation', () => {
    h = createHarness(4242);
    const score = (h.game as unknown as { score: Record<string, number> }).score;
    const before = { ...score };
    const lane = h.inner.player.lane;

    for (let i = 0; i < 10; i += 1) {
      h.inner.onCounter(performance.now());
      h.step();
    }

    expect(h.game.phase).toBe('running');
    expect(h.inner.player.lane).toBe(lane);
    expect(score.hp).toBe(before.hp);
    expect(score.combo).toBe(before.combo);
    expect(score.justice).toBe(before.justice);
    expect(score.counterScore).toBe(before.counterScore);
  });

  it('acknowledges every press but pops at most one caption per WHIFF_MS', () => {
    h = createHarness(4242);
    expect(whiffCount(h)).toBe(0);
    expect(captions(h)).toBe(0);

    // Mashing: every press is acknowledged (the input is never swallowed), but
    // the caption pool must not fill up with six copies of the same 휙.
    for (let i = 0; i < 5; i += 1) h.inner.onCounter(performance.now());
    expect(whiffCount(h)).toBe(5);
    expect(captions(h)).toBe(1);

    // Once the window elapses, the next press pops a FRESH caption. (The pool
    // only ages in `Game.draw`, which this headless harness never runs, so the
    // first caption is still alive here — hence 2, not 1.)
    const frames = Math.ceil(TUNING.WHIFF_MS / TUNING.FIXED_DT) + 1;
    for (let i = 0; i < frames; i += 1) h.step();
    h.inner.onCounter(performance.now());
    expect(whiffCount(h)).toBe(6);
    expect(captions(h)).toBe(2);
  });

  it('does not fire when a counter window IS armed', () => {
    for (let seed = 1; seed <= 40 && h === null; seed += 1) {
      const candidate = createHarness(seed);
      for (let i = 0; i < 3600 && candidate.game.phase !== 'slowmo'; i += 1) candidate.step();
      if (candidate.game.phase === 'slowmo') h = candidate;
      else candidate.destroy();
    }
    expect(h, 'a run that reaches slowmo').not.toBeNull();
    const harness = h!;

    const before = whiffCount(harness);
    harness.inner.onCounter(performance.now());

    // The press was a judged counter, not a whiff.
    expect(harness.game.phase).toBe('result');
    expect(whiffCount(harness)).toBe(before);
  });
});
