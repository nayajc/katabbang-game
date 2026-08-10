/**
 * Bumper clear zone (BUMPER_REAR_CLEAR_VU).
 *
 * A counter plants the player in the lane they just fought in, so anything
 * standing within a short distance BEHIND a bumper is a hit no input can avoid.
 * The spawner therefore keeps a vu-measured no-spawn zone around every bumper,
 * in every lane and in both directions, and it must do so without breaking the
 * "same seed => same run" contract the leaderboard depends on.
 */
import { describe, expect, it } from 'vitest';
import { Spawner, type EntityKind } from '@/game/entities/spawner';
import { createRng } from '@/game/rng';
import { TUNING } from '@/game/tuning';

const STEP = TUNING.FIXED_DT;

type Spawn = { kind: EntityKind; lane: number; atMs: number };

/**
 * Drives the spawner against the same world scroll `Game.update` applies (speed
 * ramp included), tracking every live entity's `y` so distances can be measured
 * in vu at the exact moment of each spawn.
 */
function runWorld(seed: number, ms: number) {
  const spawner = new Spawner(createRng(seed));
  const spawns: Spawn[] = [];
  /** Closest-approach distance (vu) recorded between a bumper and any neighbour. */
  let minBumperGap = Infinity;
  let live: Array<{ kind: EntityKind; y: number }> = [];
  let speed: number = TUNING.BASE_SPEED;

  for (let t = 0; t < ms; t += STEP) {
    const secs = STEP / 1000;
    speed = Math.min(TUNING.MAX_SPEED, speed + TUNING.SPEED_PER_SEC * secs);
    const advance = speed * secs;
    for (const e of live) e.y += advance;

    const hasBumper = live.some((e) => e.kind === 'bumper');
    for (const fresh of spawner.update(STEP, hasBumper, speed)) {
      for (const other of live) {
        if (fresh.kind !== 'bumper' && other.kind !== 'bumper') continue;
        minBumperGap = Math.min(minBumperGap, Math.abs(other.y - fresh.y));
      }
      live.push({ kind: fresh.kind, y: fresh.y });
      spawns.push({ kind: fresh.kind, lane: fresh.lane, atMs: t + STEP });
    }
    live = live.filter((e) => e.y <= TUNING.VIRTUAL_H + TUNING.ENTITY_R * 2);
  }
  return { spawns, minBumperGap };
}

describe('bumper clear zone', () => {
  it('never spawns anything inside BUMPER_REAR_CLEAR_VU of a bumper', () => {
    for (const seed of [1, 7, 42, 555, 2024, 31_337]) {
      const { spawns, minBumperGap } = runWorld(seed, 90_000);
      // The run must actually contain bumpers, or the assertion is vacuous.
      expect(spawns.filter((s) => s.kind === 'bumper').length).toBeGreaterThan(3);
      expect(minBumperGap).toBeGreaterThanOrEqual(TUNING.BUMPER_REAR_CLEAR_VU - 1e-6);
    }
  });

  it('still produces bumpers at full difficulty, where intervals are shortest', () => {
    const late = runWorld(2024, 120_000).spawns.filter(
      (s) =>
        s.kind === 'bumper' && s.atMs > TUNING.SPAWN_GRACE_MS + TUNING.DIFFICULTY_RAMP_MS,
    );
    expect(late.length).toBeGreaterThan(3);
  });

  it('is deterministic: the same seed replays the same spawn sequence', () => {
    for (const seed of [3, 99, 8080]) {
      const a = runWorld(seed, 60_000).spawns;
      const b = runWorld(seed, 60_000).spawns;
      expect(a.length).toBeGreaterThan(10);
      expect(b).toEqual(a);
    }
  });

  it('gives different seeds different runs (the rng is still driving)', () => {
    expect(runWorld(4, 60_000).spawns).not.toEqual(runWorld(5, 60_000).spawns);
  });
});
