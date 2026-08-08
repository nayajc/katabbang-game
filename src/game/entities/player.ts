import { TUNING } from '../tuning';

/** 3-lane player. `x` eases between lane centers over LANE_CHANGE_MS. */
export class Player {
  lane = 1;
  x: number = TUNING.LANE_X[1];
  readonly y = TUNING.PLAYER_Y;
  private fromX: number = TUNING.LANE_X[1];
  private targetX: number = TUNING.LANE_X[1];
  private t: number = TUNING.LANE_CHANGE_MS;

  reset(): void {
    this.lane = 1;
    this.x = this.fromX = this.targetX = TUNING.LANE_X[1];
    this.t = TUNING.LANE_CHANGE_MS;
  }

  move(direction: -1 | 1): void {
    const next = Math.min(TUNING.LANES - 1, Math.max(0, this.lane + direction));
    if (next === this.lane) return;
    this.lane = next;
    this.fromX = this.x;
    this.targetX = TUNING.LANE_X[next];
    this.t = 0;
  }

  update(dt: number): void {
    if (this.t >= TUNING.LANE_CHANGE_MS) return;
    this.t = Math.min(TUNING.LANE_CHANGE_MS, this.t + dt);
    const k = this.t / TUNING.LANE_CHANGE_MS;
    const eased = 1 - (1 - k) * (1 - k);
    this.x = this.fromX + (this.targetX - this.fromX) * eased;
  }
}
