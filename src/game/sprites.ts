/**
 * Async sprite loader.
 *
 * Fire-and-forget: `loadSprites()` starts decoding, `getSprite()` returns null
 * until an image is fully decoded (or forever, if it failed to load). Every
 * caller must have a shape/emoji fallback — the game is fully playable with no
 * images at all.
 */

import { STRIDE_VU } from './anim';

export type SpriteName =
  | 'player_run'
  | 'player_run_1'
  | 'player_run_2'
  | 'player_run_3'
  | 'player_run_4'
  | 'player_counter'
  | 'bumper_walk'
  | 'bumper_knockback'
  | 'pedestrian_1'
  | 'pedestrian_2'
  | 'pedestrian_3';

const NAMES: SpriteName[] = [
  'player_run',
  'player_run_1',
  'player_run_2',
  'player_run_3',
  'player_run_4',
  'player_counter',
  'bumper_walk',
  'bumper_knockback',
  'pedestrian_1',
  'pedestrian_2',
  'pedestrian_3',
];

const PEDESTRIANS: SpriteName[] = ['pedestrian_1', 'pedestrian_2', 'pedestrian_3'];

const loaded = new Map<SpriteName, HTMLImageElement>();
let started = false;
let pending = 0;

/** Starts loading every sprite once. Safe to call repeatedly and on the server. */
export function loadSprites(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  pending = NAMES.length;
  for (const name of NAMES) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      loaded.set(name, img);
      pending -= 1;
    };
    img.onerror = () => {
      pending -= 1;
    };
    img.src = `/sprites/${name}.webp`;
  }
}

/** Decoded image, or null while loading / after a failure. */
export function getSprite(name: SpriteName): HTMLImageElement | null {
  return loaded.get(name) ?? null;
}

/** True once every sprite has settled (loaded or failed). */
export function spritesSettled(): boolean {
  return started && pending === 0;
}

/**
 * The AI-generated run cycle, ordered as a loop rather than by file number:
 * max extension (toe-off) -> rear leg recovering -> knee driven forward ->
 * front leg reaching down to contact.
 */
const RUN_CYCLE: SpriteName[] = ['player_run_1', 'player_run_4', 'player_run_3', 'player_run_2'];

/**
 * Run-cycle frame for a distance travelled, locked to the same stride length as
 * the procedural gait in `anim.ts` so the frames and the bob stay in step.
 *
 * Returns `null` until every cycle frame has decoded — callers then fall back to
 * the single `player_run` pose (with a fuller procedural bob to compensate).
 */
export function playerRunFrame(scrollY: number): SpriteName | null {
  for (const name of RUN_CYCLE) if (!loaded.has(name)) return null;
  const t = scrollY / STRIDE_VU;
  const i = Math.floor((t - Math.floor(t)) * RUN_CYCLE.length);
  return RUN_CYCLE[i];
}

/** Deterministic pedestrian variant for an entity id — stable across frames. */
export function pedestrianSprite(id: number): SpriteName {
  return PEDESTRIANS[Math.abs(id) % PEDESTRIANS.length];
}

/** Test-only reset. */
export function _resetSprites(): void {
  loaded.clear();
  started = false;
  pending = 0;
}
