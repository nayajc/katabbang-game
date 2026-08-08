import { describe, expect, it } from 'vitest';
import { Player } from '@/game/entities/player';
import { TUNING } from '@/game/tuning';

describe('Player lane movement', () => {
  it('commits the lane (and therefore laneX) on the input frame', () => {
    const p = new Player();
    p.move(1);
    expect(p.lane).toBe(2);
    expect(p.laneX).toBe(TUNING.LANE_X[2]);
    // The VISUAL position has not moved yet — only the tween target has.
    expect(p.x).toBe(TUNING.LANE_X[1]);
  });

  it('tweens the visual x onto the lane centre over LANE_CHANGE_MS', () => {
    const p = new Player();
    p.move(1);
    const samples: number[] = [];
    for (let t = 0; t < TUNING.LANE_CHANGE_MS; t += TUNING.FIXED_DT) {
      p.update(TUNING.FIXED_DT);
      samples.push(p.x);
    }
    // Strictly monotonic toward the target, never teleporting past it.
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
      expect(samples[i]).toBeLessThanOrEqual(TUNING.LANE_X[2]);
    }
    expect(samples[0]).toBeLessThan(TUNING.LANE_X[2]);
    p.update(TUNING.LANE_CHANGE_MS);
    expect(p.x).toBeCloseTo(TUNING.LANE_X[2], 6);
  });

  it('leans into the movement and unwinds once settled', () => {
    const p = new Player();
    p.move(-1);
    p.update(TUNING.LANE_CHANGE_MS / 2);
    expect(p.lean).toBeLessThan(0);
    expect(Math.abs(p.lean)).toBeCloseTo(TUNING.LANE_LEAN_RAD, 6);
    p.update(TUNING.LANE_CHANGE_MS);
    expect(p.lean).toBe(0);
  });

  it('clamps at the outer lanes and stays put', () => {
    const p = new Player();
    p.move(-1);
    p.update(TUNING.LANE_CHANGE_MS);
    p.move(-1);
    expect(p.lane).toBe(0);
    expect(p.x).toBeCloseTo(TUNING.LANE_X[0], 6);
  });

  it('reset() restores the centre lane and clears the tween', () => {
    const p = new Player();
    p.move(1);
    p.update(30);
    p.reset();
    expect(p.lane).toBe(1);
    expect(p.x).toBe(TUNING.LANE_X[1]);
    expect(p.lean).toBe(0);
  });
});
