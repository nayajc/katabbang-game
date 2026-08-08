/**
 * Procedural character animation.
 *
 * Every character pose is a pure function of **distance travelled** (`scrollY`)
 * plus a per-entity phase offset. Driving off distance rather than wall time
 * means the gait automatically speeds up with the world scroll and slows down
 * with the simulation timescale during slowmo — the cycle is "locked to the
 * ground" the way a real run cycle is.
 *
 * The pose is written into a caller-owned {@link Pose}, so the draw path never
 * allocates. Poses apply to the sprite path and the emoji/shape fallback alike,
 * because the renderer applies them as a canvas transform before drawing.
 */

import { TUNING } from './tuning';

const TAU = Math.PI * 2;

/**
 * Virtual units covered by one full stride cycle (left foot to left foot).
 * The sprite run-cycle frames in `sprites.ts` are locked to this same stride.
 */
export const STRIDE_VU = 116;

/** Golden-angle phase spread so neighbouring ids never march in sync. */
const PHASE_SPREAD = 2.39996;

export type Pose = {
  /** Vertical offset in virtual units (negative is up). */
  bob: number;
  /** Horizontal offset in virtual units. */
  sway: number;
  /** Rotation in radians. */
  rot: number;
  /** Horizontal scale about the feet. */
  scaleX: number;
  /** Vertical scale about the feet. */
  scaleY: number;
};

export function createPose(): Pose {
  return { bob: 0, sway: 0, rot: 0, scaleX: 1, scaleY: 1 };
}

export function resetPose(p: Pose): Pose {
  p.bob = 0;
  p.sway = 0;
  p.rot = 0;
  p.scaleX = 1;
  p.scaleY = 1;
  return p;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 0..1 how fast the world is scrolling, relative to the tuned speed band. */
export function speedFactor(speed: number): number {
  const span = TUNING.MAX_SPEED - TUNING.BASE_SPEED;
  return span <= 0 ? 1 : clamp01((speed - TUNING.BASE_SPEED) / span);
}

/**
 * Player run cycle. `|sin|` gives two footfalls per stride (one per leg); the
 * signed `sin` drives the alternating lean and sway so the two legs read as
 * different. Squash peaks at the footfall (where `|sin|` is 0).
 *
 * `amp` scales the whole pose: pass a reduced value when real run-cycle sprite
 * frames are also playing, so the two animation layers do not double up.
 */
export function playerRunPose(out: Pose, scrollY: number, speed: number, amp = 1): Pose {
  const k = speedFactor(speed);
  const p = (scrollY / STRIDE_VU) * TAU;
  const s = Math.sin(p);
  const lift = Math.abs(s);
  // 1 at the footfall, 0 mid-flight.
  const impact = 1 - lift;

  out.bob = -lift * (7.5 + 4.5 * k) * amp;
  out.sway = s * (2.2 + 1.6 * k) * amp;
  // Constant forward lean that grows with speed, plus a small counter-rotation.
  out.rot = (-0.06 - 0.06 * k + s * 0.065) * amp;
  out.scaleX = 1 + impact * (0.07 + 0.04 * k) * amp;
  out.scaleY = 1 - impact * (0.085 + 0.05 * k) * amp;
  return out;
}

/** Player counter pose: planted, no gait — just a small anticipation crouch. */
export function playerCounterPose(out: Pose, slowmo: number): Pose {
  resetPose(out);
  const w = clamp01(slowmo);
  out.rot = -0.1 * w;
  out.scaleY = 1 - 0.05 * w;
  out.scaleX = 1 + 0.04 * w;
  out.bob = 2 * w;
  return out;
}

/**
 * Pedestrian walk: shallower bob than the player, a pronounced waddle (one lean
 * per stride, not per step) and a per-entity stride length so a crowd never
 * pulses in unison.
 */
export function pedestrianPose(out: Pose, id: number, scrollY: number): Pose {
  const n = Math.abs(id);
  const strideMul = 1.25 + (n % 5) * 0.09;
  const p = (scrollY / (STRIDE_VU * strideMul)) * TAU + n * PHASE_SPREAD;
  const s = Math.sin(p);
  const lift = Math.abs(s);
  const impact = 1 - lift;

  out.bob = -lift * 5;
  out.sway = s * 4.2;
  out.rot = s * 0.13;
  out.scaleX = 1 + impact * 0.05;
  out.scaleY = 1 - impact * 0.06;
  return out;
}

/**
 * Bumper approach. Heavier, slower gait than a pedestrian, and the shoulder
 * lean amplifies as it closes on the player — a readable telegraph of the
 * counter window opening.
 */
export function bumperPose(out: Pose, id: number, scrollY: number, gap: number): Pose {
  const n = Math.abs(id);
  const p = (scrollY / (STRIDE_VU * 1.45)) * TAU + n * PHASE_SPREAD;
  const s = Math.sin(p);
  const lift = Math.abs(s);
  const impact = 1 - lift;
  // 0 far away, 1 right on top of the player.
  const prox = clamp01(1 - gap / (TUNING.SLOWMO_TRIGGER_DIST * 1.6));

  out.bob = -lift * (6.5 + 5.5 * prox);
  out.sway = s * (3 + 2.6 * prox);
  out.rot = s * (0.09 + 0.08 * prox) + prox * 0.15;
  out.scaleX = 1 + impact * 0.07 + prox * 0.06;
  out.scaleY = 1 - impact * 0.09 + prox * 0.06;
  return out;
}
