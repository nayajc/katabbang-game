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

/** Seeded spawner: identical seed => identical entity sequence. */
export class Spawner {
  private rng: Rng;
  private nextId = 1;
  private timer = 0;
  private interval: number = TUNING.SPAWN_INTERVAL_START;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  reset(rng: Rng): void {
    this.rng = rng;
    this.nextId = 1;
    this.timer = 0;
    this.interval = TUNING.SPAWN_INTERVAL_START;
  }

  /** Advance the spawn clock; returns entities created this step. */
  update(dt: number, hasActiveBumper: boolean): Entity[] {
    this.timer += dt;
    const out: Entity[] = [];
    while (this.timer >= this.interval) {
      this.timer -= this.interval;
      this.interval = Math.max(
        TUNING.SPAWN_INTERVAL_MIN,
        this.interval * TUNING.SPAWN_INTERVAL_DECAY,
      );
      const lane = this.rng.int(0, TUNING.LANES - 1);
      const kind: EntityKind =
        !hasActiveBumper && this.rng.chance(TUNING.BUMPER_CHANCE) ? 'bumper' : 'pedestrian';
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
