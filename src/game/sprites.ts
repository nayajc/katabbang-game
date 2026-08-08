/**
 * Async sprite loader.
 *
 * Fire-and-forget: `loadSprites()` starts decoding, `getSprite()` returns null
 * until an image is fully decoded (or forever, if it failed to load). Every
 * caller must have a shape/emoji fallback — the game is fully playable with no
 * images at all.
 */

export type SpriteName =
  | 'player_run'
  | 'player_counter'
  | 'bumper_walk'
  | 'bumper_knockback'
  | 'pedestrian_1'
  | 'pedestrian_2'
  | 'pedestrian_3';

const NAMES: SpriteName[] = [
  'player_run',
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
