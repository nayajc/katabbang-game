/**
 * Pointer-event health window, shared by every touch-fallback path.
 *
 * Some real-device browsers (notably iOS Chrome in certain WebView/toolbar
 * states) never deliver `pointerdown` to the canvas even though the element
 * looks perfectly interactive. The fallback listeners in `input.ts` and the
 * pre-attachInput button hit test in `game.ts` therefore also listen to raw
 * touch events — but only while pointer events are currently silent.
 *
 * Rule: a `pointerdown` suppresses touch fallbacks for the next
 * POINTER_HEALTH_MS only. Pointer events always fire before their
 * compatibility touch events on supporting browsers, so a gesture can never
 * double-fire; and if pointer events later stop arriving mid-session (the
 * iOS failure mode), the fallback re-arms itself instead of staying dead.
 */

/** How long after a pointerdown the compatibility touch events are ignored. */
const POINTER_HEALTH_MS = 50;

let lastPointerDownTs = -Infinity;

/** Call from every real `pointerdown` handler, with `event.timeStamp`. */
export function notePointerDown(ts: number): void {
  lastPointerDownTs = ts;
}

/**
 * True when the given touch event's `timeStamp` falls inside the health window
 * of a recent pointerdown — the touch fallback must stand down for it.
 */
export function pointerEventsWorking(touchTs: number): boolean {
  return touchTs - lastPointerDownTs < POINTER_HEALTH_MS;
}

/** Test-only: forget the window. */
export function resetPointerHealth(): void {
  lastPointerDownTs = -Infinity;
}
