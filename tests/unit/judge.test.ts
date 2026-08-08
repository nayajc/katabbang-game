import { describe, expect, it } from 'vitest';
import { judge } from '@/game/judge';
import { now } from '@/game/clock';
import { TUNING } from '@/game/tuning';

const CENTER = 10_000;

describe('judge()', () => {
  it('exact hit is perfect', () => {
    expect(judge(CENTER, CENTER)).toBe('perfect');
  });

  it('perfect boundary is inclusive on both sides', () => {
    expect(judge(CENTER + TUNING.PERFECT_MS, CENTER)).toBe('perfect');
    expect(judge(CENTER - TUNING.PERFECT_MS, CENTER)).toBe('perfect');
  });

  it('just outside the perfect window is good', () => {
    expect(judge(CENTER + TUNING.PERFECT_MS + 0.001, CENTER)).toBe('good');
    expect(judge(CENTER - TUNING.PERFECT_MS - 0.001, CENTER)).toBe('good');
  });

  it('good boundary is inclusive on both sides', () => {
    expect(judge(CENTER + TUNING.GOOD_MS, CENTER)).toBe('good');
    expect(judge(CENTER - TUNING.GOOD_MS, CENTER)).toBe('good');
  });

  it('just outside the good window is a miss', () => {
    expect(judge(CENTER + TUNING.GOOD_MS + 0.001, CENTER)).toBe('miss');
    expect(judge(CENTER - TUNING.GOOD_MS - 0.001, CENTER)).toBe('miss');
  });

  it('is clock-agnostic: only the delta matters', () => {
    const offset = 1_234_567;
    expect(judge(CENTER + offset + 30, CENTER + offset)).toBe(judge(CENTER + 30, CENTER));
  });

  it('window widths come from tuning, not hardcoded', () => {
    const windows = { perfectMs: 10, goodMs: 20 };
    expect(judge(CENTER + 10, CENTER, windows)).toBe('perfect');
    expect(judge(CENTER + 15, CENTER, windows)).toBe('good');
    expect(judge(CENTER + 21, CENTER, windows)).toBe('miss');
  });
});

describe('time origin', () => {
  it('the game clock is performance.now(), not Date.now()', () => {
    const p = performance.now();
    const g = now();
    // Same origin as performance.now() (and therefore as *Event.timeStamp).
    expect(Math.abs(g - p)).toBeLessThan(50);
    // Definitively NOT the Unix epoch clock.
    expect(Math.abs(g - Date.now())).toBeGreaterThan(1e9);
  });
});
