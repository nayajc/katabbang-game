/**
 * Input layer.
 *
 * - pointerdown/up (never `click`) so the timestamp is the real touch time
 * - horizontal swipe => lane change, tap => counter
 * - desktop: ArrowLeft/ArrowRight lanes, Space/Enter counter (keydown, repeat ignored)
 * - every callback receives `event.timeStamp` (same time origin as performance.now())
 */
export type InputHandlers = {
  onLane(direction: -1 | 1, ts: number): void;
  onCounter(ts: number): void;
};

/** Horizontal travel (CSS px) above which a pointer gesture counts as a swipe. */
const SWIPE_PX = 28;
/** Max gesture duration (ms) still treated as a tap. */
const TAP_MS = 400;

export function attachInput(el: HTMLElement, handlers: InputHandlers): () => void {
  let startX = 0;
  let startY = 0;
  let startTs = 0;
  let pointerId: number | null = null;
  let swiped = false;

  const onPointerDown = (e: PointerEvent) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTs = e.timeStamp;
    swiped = false;
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId || swiped) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - startY)) {
      swiped = true;
      handlers.onLane(dx > 0 ? 1 : -1, e.timeStamp);
    }
    e.preventDefault();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!swiped && e.timeStamp - startTs <= TAP_MS) {
      // Tap intent is decided at press time — judge with the pointerdown stamp.
      handlers.onCounter(startTs);
    }
    e.preventDefault();
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) pointerId = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    switch (e.key) {
      case 'ArrowLeft':
        handlers.onLane(-1, e.timeStamp);
        e.preventDefault();
        break;
      case 'ArrowRight':
        handlers.onLane(1, e.timeStamp);
        e.preventDefault();
        break;
      case ' ':
      case 'Spacebar':
      case 'Enter':
        handlers.onCounter(e.timeStamp);
        e.preventDefault();
        break;
      default:
        break;
    }
  };

  const opts: AddEventListenerOptions = { passive: false };
  el.addEventListener('pointerdown', onPointerDown, opts);
  el.addEventListener('pointermove', onPointerMove, opts);
  el.addEventListener('pointerup', onPointerUp, opts);
  el.addEventListener('pointercancel', onPointerCancel, opts);
  window.addEventListener('keydown', onKeyDown, opts);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKeyDown);
  };
}
