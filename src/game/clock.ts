/**
 * Single wall-clock source for the whole game.
 *
 * MUST be `performance.now()` — it shares its time origin with
 * `PointerEvent.timeStamp` / `KeyboardEvent.timeStamp`, which are the inputs to
 * `judge()`. `Date.now()` is forbidden here (different origin => judgement is
 * off by the page's epoch offset).
 */
export function now(): number {
  return performance.now();
}
