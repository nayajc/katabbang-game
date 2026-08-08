import { describe, expect, it } from 'vitest';
import { CounterWindow } from '@/game/counter';
import { TUNING } from '@/game/tuning';
import type { Entity } from '@/game/entities/spawner';

const entity = (): Entity => ({
  id: 1,
  kind: 'bumper',
  lane: 1,
  x: 0,
  y: 0,
  dead: false,
  engaged: true,
  knockback: null,
});

describe('CounterWindow', () => {
  it('converts simulated time-to-impact into wall clock via the slowmo timescale', () => {
    const w = new CounterWindow();
    w.arm(entity(), 300, 1000);
    expect(w.windowCenterTs).toBeCloseTo(1000 + 300 / TUNING.SLOWMO_TIMESCALE, 6);
  });

  it('judges the input against the wall-clock centre', () => {
    const w = new CounterWindow();
    w.arm(entity(), 0, 1000);
    expect(w.submit(1000 + TUNING.PERFECT_MS)).toBe('perfect');
    expect(w.active).toBe(false);
  });

  it('accepts only one input per window', () => {
    const w = new CounterWindow();
    w.arm(entity(), 0, 1000);
    w.submit(1000);
    expect(w.submit(1000)).toBeNull();
  });

  it('expires after the good window plus grace', () => {
    const w = new CounterWindow();
    w.arm(entity(), 0, 1000);
    expect(w.isExpired(1000 + TUNING.GOOD_MS + TUNING.MISS_GRACE_MS)).toBe(false);
    expect(w.isExpired(1000 + TUNING.GOOD_MS + TUNING.MISS_GRACE_MS + 1)).toBe(true);
    expect(w.expire()).toBe('miss');
  });
});
