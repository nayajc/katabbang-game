import type { Rng } from '../rng';
import { TUNING } from '../tuning';

export type EntityKind = 'pedestrian' | 'bumper';

export type Entity = {
  id: number;
  kind: EntityKind;
  lane: number;
  x: number;
  y: number;
  /** Set once the entity has been resolved (collision, counter, or passed). */
  dead: boolean;
  /** Bumper only: became the active counter target. */
  engaged: boolean;
  /** Knockback animation state (set by the FX layer / counter result). */
  knockback: { vx: number; vy: number; rot: number } | null;
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Seeded spawner: identical seed => identical entity sequence.
 *
 * Difficulty is a function of elapsed simulated time, not of a per-spawn decay:
 * nothing spawns for the first `SPAWN_GRACE_MS`, then spawn density and bumper
 * frequency ramp linearly to full over `DIFFICULTY_RAMP_MS`.
 */
export class Spawner {
  private rng: Rng;
  private nextId = 1;
  private timer = 0;
  /** Simulated ms since the run started (drives the whole difficulty ramp). */
  private elapsed = 0;
  /** Simulated ms since the last bumper spawn; starts "ready". */
  private sinceBumper: number = TUNING.BUMPER_MIN_GAP_MS;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  reset(rng: Rng): void {
    this.rng = rng;
    this.nextId = 1;
    this.timer = 0;
    this.elapsed = 0;
    this.sinceBumper = TUNING.BUMPER_MIN_GAP_MS;
  }

  /** 0 at the end of the grace period, 1 once the run is at full difficulty. */
  get ramp(): number {
    const t = (this.elapsed - TUNING.SPAWN_GRACE_MS) / TUNING.DIFFICULTY_RAMP_MS;
    return Math.max(0, Math.min(1, t));
  }

  /** Advance the spawn clock; returns entities created this step. */
  update(dt: number, hasActiveBumper: boolean): Entity[] {
    this.elapsed += dt;
    this.sinceBumper += dt;
    const out: Entity[] = [];
    if (this.elapsed < TUNING.SPAWN_GRACE_MS) return out;

    this.timer += dt;
    const k = this.ramp;
    const interval = lerp(TUNING.SPAWN_INTERVAL_START, TUNING.SPAWN_INTERVAL_MIN, k);
    const bumperChance = lerp(TUNING.BUMPER_CHANCE_START, TUNING.BUMPER_CHANCE, k);
    const bumperGap = lerp(TUNING.BUMPER_MIN_GAP_MS, 0, k);

    while (this.timer >= interval) {
      this.timer -= interval;
      const lane = this.rng.int(0, TUNING.LANES - 1);
      const bumperAllowed = !hasActiveBumper && this.sinceBumper >= bumperGap;
      const kind: EntityKind =
        bumperAllowed && this.rng.chance(bumperChance) ? 'bumper' : 'pedestrian';
      if (kind === 'bumper') this.sinceBumper = 0;
      out.push({
        id: this.nextId++,
        kind,
        lane,
        x: TUNING.LANE_X[lane],
        y: -TUNING.ENTITY_R * 2,
        dead: false,
        engaged: false,
        knockback: null,
      });
    }
    return out;
  }
}

/** Circle overlap against the player position. */
export function collides(e: Entity, px: number, py: number): boolean {
  const r = TUNING.ENTITY_R + TUNING.PLAYER_R;
  const dx = e.x - px;
  const dy = e.y - py;
  return dx * dx + dy * dy <= r * r;
}
