import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Spawner } from '@/game/entities/spawner';
import { createRng } from '@/game/rng';
import { TUNING } from '@/game/tuning';
import { createHarness, dodgeBot, survive, type Harness } from './harness';

const STEP = TUNING.FIXED_DT;

/** Runs the spawner for `ms` of simulated time, returning every entity spawned. */
function run(ms: number, seed = 7) {
  const s = new Spawner(createRng(seed));
  const out: Array<{ kind: string; atMs: number }> = [];
  for (let t = 0; t < ms; t += STEP) {
    for (const e of s.update(STEP, false)) out.push({ kind: e.kind, atMs: t + STEP });
  }
  return out;
}

describe('opening grace period', () => {
  it('spawns nothing before SPAWN_GRACE_MS of simulated time', () => {
    for (const seed of [1, 2, 99, 4242]) {
      const spawned = run(TUNING.SPAWN_GRACE_MS, seed);
      expect(spawned).toEqual([]);
    }
  });

  it('starts spawning once the grace period has passed', () => {
    const spawned = run(TUNING.SPAWN_GRACE_MS + TUNING.SPAWN_INTERVAL_START + 2 * STEP);
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned[0].atMs).toBeGreaterThan(TUNING.SPAWN_GRACE_MS);
  });
});

describe('difficulty ramp', () => {
  it('is sparser in the opening 10s than at full difficulty', () => {
    const early = run(TUNING.SPAWN_GRACE_MS + 10_000).length;
    const all = run(TUNING.SPAWN_GRACE_MS + TUNING.DIFFICULTY_RAMP_MS + 10_000);
    const late = all.filter(
      (e) => e.atMs > TUNING.SPAWN_GRACE_MS + TUNING.DIFFICULTY_RAMP_MS,
    ).length;
    expect(early).toBeLessThan(late);
  });

  it('reaches full density only at the end of the ramp', () => {
    const s = new Spawner(createRng(3));
    expect(s.ramp).toBe(0);
    for (let t = 0; t < TUNING.SPAWN_GRACE_MS + TUNING.DIFFICULTY_RAMP_MS / 2; t += STEP) {
      s.update(STEP, false);
    }
    expect(s.ramp).toBeGreaterThan(0.4);
    expect(s.ramp).toBeLessThan(0.6);
    for (let t = 0; t < TUNING.DIFFICULTY_RAMP_MS; t += STEP) s.update(STEP, false);
    expect(s.ramp).toBe(1);
  });

  it('keeps early bumpers at least BUMPER_MIN_GAP_MS apart', () => {
    for (const seed of [5, 11, 77, 900, 31_337]) {
      const bumpers = run(TUNING.SPAWN_GRACE_MS + 12_000, seed).filter(
        (e) => e.kind === 'bumper',
      );
      for (let i = 1; i < bumpers.length; i += 1) {
        // The gap shrinks across the ramp, so compare against the gap in force
        // at the earlier of the two spawns (linear decay to zero).
        const k = Math.max(
          0,
          Math.min(
            1,
            (bumpers[i - 1].atMs - TUNING.SPAWN_GRACE_MS) / TUNING.DIFFICULTY_RAMP_MS,
          ),
        );
        const required = TUNING.BUMPER_MIN_GAP_MS * (1 - k);
        expect(bumpers[i].atMs - bumpers[i - 1].atMs).toBeGreaterThanOrEqual(required - STEP);
      }
    }
  });
});

describe('survival sanity targets', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness(2024);
  });
  afterEach(() => h.destroy());

  it('an idle player survives at least 8s', () => {
    expect(survive(h, 30_000)).toBeGreaterThanOrEqual(8000);
  });

  it('a trivial dodge bot survives at least 30s', () => {
    expect(survive(h, 90_000, dodgeBot())).toBeGreaterThanOrEqual(30_000);
  });
});
