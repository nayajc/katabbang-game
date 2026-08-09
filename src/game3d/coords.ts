import { TUNING } from '@/game/tuning';

/**
 * Game space -> world space.
 *
 * The simulation is unchanged: it still runs in the 1D lane + distance space of
 * a 540x960 virtual field. The 3D layer is a pure reinterpretation of those
 * numbers:
 *
 *   virtual x  ->  world X   (lane offset, left/right across the road)
 *   virtual y  ->  world Z   (depth; SMALLER y is FURTHER down the road)
 *
 * The player sits at the world origin and the camera sits behind and above it,
 * so an approaching bumper travels along +Z, straight at the camera.
 */

/** World units per virtual unit. 60vu = 1m, which puts a lane at 2m wide. */
export const WORLD_PER_VU = 1 / 60;

/** Lane centres map to X = -2, 0, +2. */
export function toWorldX(vx: number): number {
  return (vx - TUNING.VIRTUAL_W / 2) * WORLD_PER_VU;
}

/** The player's virtual y is the world origin; smaller y recedes to -Z. */
export function toWorldZ(vy: number): number {
  return (vy - TUNING.PLAYER_Y) * WORLD_PER_VU;
}

/**
 * Virtual y read as HEIGHT rather than depth, relative to where an effect was
 * spawned. Used by particles, comic captions and knockback bodies, whose 2D
 * `y` motion was authored as "up the screen" (negative = up).
 */
export function toWorldHeight(vy: number, originVy: number): number {
  return (originVy - vy) * WORLD_PER_VU;
}

/** Half-width of the road surface, in world units (virtual x 60..480). */
export const ROAD_HALF_W = 3.5;

/** World length of one road tile. Matches the 2D renderer's 120vu dash period. */
export const ROAD_TILE = 120 * WORLD_PER_VU;
