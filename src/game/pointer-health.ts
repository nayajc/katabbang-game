/**
 * Pointer-event health flag, shared by every touch-fallback path.
 *
 * Some real-device browsers (notably iOS Chrome in certain WebView/toolbar
 * states) never deliver `pointerdown` to the canvas even though the element
 * looks perfectly interactive. The fallback listeners in `input.ts` and the
 * pre-attachInput button hit test in `game.ts` therefore also listen to raw
 * touch events — but only while pointer events have proven silent.
 *
 * Rule: the FIRST `pointerdown` we ever see latches this to `true`, and every
 * touch fallback disables itself from then on. Pointer events always fire
 * before their compatibility touch events on supporting browsers, so this can
 * never double-fire a gesture.
 */
let pointerSeen = false;

/** Call from every real `pointerdown` handler. */
export function notePointerDown(): void {
  pointerSeen = true;
}

/** True once any pointerdown has been observed — touch fallbacks must stand down. */
export function pointerEventsWorking(): boolean {
  return pointerSeen;
}

/** Test-only: forget the latch. */
export function resetPointerHealth(): void {
  pointerSeen = false;
}
