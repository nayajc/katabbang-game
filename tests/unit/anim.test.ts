import { describe, expect, it } from 'vitest';

import {
  bumperPose,
  createPose,
  pedestrianPose,
  playerCounterPose,
  playerRunPose,
  speedFactor,
} from '../../src/game/anim';
import { TUNING } from '../../src/game/tuning';

describe('anim', () => {
  it('speedFactor spans 0..1 across the tuned speed band', () => {
    expect(speedFactor(TUNING.BASE_SPEED)).toBe(0);
    expect(speedFactor(TUNING.MAX_SPEED)).toBe(1);
    expect(speedFactor(0)).toBe(0);
    expect(speedFactor(TUNING.MAX_SPEED * 10)).toBe(1);
  });

  it('player run cycle actually moves as distance accumulates', () => {
    const pose = createPose();
    const bobs: number[] = [];
    for (let d = 0; d < 240; d += 12) {
      playerRunPose(pose, d, TUNING.BASE_SPEED);
      bobs.push(pose.bob);
    }
    expect(Math.max(...bobs) - Math.min(...bobs)).toBeGreaterThan(2);
  });

  it('player squashes at the footfall and lifts mid-flight', () => {
    const foot = playerRunPose(createPose(), 0, TUNING.BASE_SPEED);
    expect(foot.scaleY).toBeLessThan(1);
    expect(foot.scaleX).toBeGreaterThan(1);
    expect(foot.bob).toBeCloseTo(0, 6);

    // Quarter of a stride later the character is at the top of its arc.
    const air = playerRunPose(createPose(), 29, TUNING.BASE_SPEED);
    expect(air.bob).toBeLessThan(-4);
    expect(air.scaleY).toBeCloseTo(1, 2);
  });

  it('run cycle amplitude grows with speed', () => {
    const slow = playerRunPose(createPose(), 29, TUNING.BASE_SPEED);
    const fast = playerRunPose(createPose(), 29, TUNING.MAX_SPEED);
    expect(Math.abs(fast.bob)).toBeGreaterThan(Math.abs(slow.bob));
  });

  it('pedestrians with different ids are out of phase', () => {
    const a = pedestrianPose(createPose(), 1, 100);
    const b = pedestrianPose(createPose(), 2, 100);
    const c = pedestrianPose(createPose(), 3, 100);
    expect(a.bob).not.toBeCloseTo(b.bob, 3);
    expect(b.bob).not.toBeCloseTo(c.bob, 3);
  });

  it('pedestrian pose is deterministic for the same id and distance', () => {
    expect(pedestrianPose(createPose(), 7, 512)).toEqual(pedestrianPose(createPose(), 7, 512));
  });

  it('bumper leans harder and bobs heavier as it closes on the player', () => {
    const far = bumperPose(createPose(), 1, 60, TUNING.SLOWMO_TRIGGER_DIST * 2);
    const near = bumperPose(createPose(), 1, 60, 10);
    expect(near.rot).toBeGreaterThan(far.rot);
    expect(Math.abs(near.bob)).toBeGreaterThan(Math.abs(far.bob));
    expect(near.scaleX).toBeGreaterThan(far.scaleX);
  });

  it('counter pose is planted — no gait, scales with the slowmo weight', () => {
    const none = playerCounterPose(createPose(), 0);
    expect(none.bob).toBeCloseTo(0, 6);
    expect(none.sway).toBeCloseTo(0, 6);
    expect(none.rot).toBeCloseTo(0, 6);
    expect(none.scaleX).toBeCloseTo(1, 6);
    expect(none.scaleY).toBeCloseTo(1, 6);
    const full = playerCounterPose(createPose(), 1);
    expect(full.rot).toBeLessThan(0);
    expect(full.scaleY).toBeLessThan(1);
  });
});
