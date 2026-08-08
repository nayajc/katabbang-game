import { TUNING } from '../tuning';

/**
 * 3-lane player.
 *
 * `lane` (and therefore `laneX`) changes the instant the input lands — lane
 * logic and collision read those, so responsiveness is never tweened away.
 * `x` is the VISUAL position only: it eases from the old lane centre to the new
 * one over LANE_CHANGE_MS, with a body `lean` into the movement direction.
 */
export class Player {
  lane = 1;
  x: number = TUNING.LANE_X[1];
  readonly y = TUNING.PLAYER_Y;
  /** Body lean in radians; positive = leaning right. Visual only. */
  lean = 0;
  private fromX: number = TUNING.LANE_X[1];
  private dir: -1 | 0 | 1 = 0;
  private t: number = TUNING.LANE_CHANGE_MS;

  /** Authoritative lane centre — collision and counter logic use this, not `x`. */
  get laneX(): number {
    return TUNING.LANE_X[this.lane];
  }

  reset(): void {
    this.lane = 1;
    this.x = this.fromX = TUNING.LANE_X[1];
    this.t = TUNING.LANE_CHANGE_MS;
    this.dir = 0;
    this.lean = 0;
  }

  move(direction: -1 | 1): void {
    const next = Math.min(TUNING.LANES - 1, Math.max(0, this.lane + direction));
    if (next === this.lane) return;
    this.lane = next;
    this.fromX = this.x;
    this.dir = direction;
    this.t = 0;
  }

  update(dt: number): void {
    if (this.t >= TUNING.LANE_CHANGE_MS) {
      this.lean = 0;
      return;
    }
    this.t = Math.min(TUNING.LANE_CHANGE_MS, this.t + dt);
    const k = this.t / TUNING.LANE_CHANGE_MS;
    const eased = 1 - (1 - k) * (1 - k);
    this.x = this.fromX + (this.laneX - this.fromX) * eased;
    // Lean peaks mid-move and unwinds as the character settles into the lane.
    this.lean = k >= 1 ? 0 : this.dir * TUNING.LANE_LEAN_RAD * Math.sin(Math.PI * k);
  }
}
