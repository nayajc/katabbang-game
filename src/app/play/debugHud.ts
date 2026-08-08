/**
 * Ground-truth diagnostic overlay for real devices (`/play?debug=1`).
 *
 * Loaded via dynamic import so it costs nothing on a normal run. It MUST NEVER
 * influence gameplay input: every listener is capture-phase AND passive (so it
 * cannot preventDefault or reorder anything), and the DOM node is
 * `pointer-events: none`.
 */
import { screenToVirtual } from '@/game/render';

type Counters = Record<string, number>;

const COUNTED = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'touchstart',
  'touchend',
] as const;

/** Refresh period (ms) — ~4 updates/sec. */
const TICK_MS = 250;

export function mountDebugHud(canvas: HTMLCanvasElement): () => void {
  const counters: Counters = {};
  for (const type of COUNTED) counters[type] = 0;

  let lastClient: { x: number; y: number } | null = null;
  let lastType = '-';
  let lastError = '-';

  const box = document.createElement('div');
  box.setAttribute('data-testid', 'debug-hud');
  Object.assign(box.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '9999',
    pointerEvents: 'none',
    background: 'rgba(0,0,0,0.62)',
    color: '#8ff',
    font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'pre',
    padding: '4px 6px',
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);

  // Safe-area probe: env() is only resolvable by the engine, so measure it.
  const probe = document.createElement('div');
  Object.assign(probe.style, {
    position: 'fixed',
    left: '0',
    bottom: '0',
    width: '1px',
    height: 'env(safe-area-inset-bottom, 0px)',
    pointerEvents: 'none',
    visibility: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);

  document.body.appendChild(probe);
  document.body.appendChild(box);

  const onEvent = (e: Event) => {
    counters[e.type] = (counters[e.type] ?? 0) + 1;
    lastType = e.type;
    const pe = e as PointerEvent;
    const te = e as TouchEvent;
    if (typeof pe.clientX === 'number' && !Number.isNaN(pe.clientX)) {
      lastClient = { x: pe.clientX, y: pe.clientY };
    } else if (te.changedTouches?.length) {
      lastClient = { x: te.changedTouches[0].clientX, y: te.changedTouches[0].clientY };
    }
  };
  // capture + passive: observe only, never interfere.
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  for (const type of COUNTED) canvas.addEventListener(type, onEvent, opts);

  const onError = (e: ErrorEvent) => {
    lastError = e.message || String(e.error);
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    lastError = `unhandledrejection: ${String(e.reason)}`;
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const stage = canvas.closest<HTMLElement>('[data-phase]');

  const round = (n: number) => Math.round(n * 10) / 10;

  const paint = () => {
    const rect = canvas.getBoundingClientRect();
    const v = lastClient ? screenToVirtual(canvas, lastClient.x, lastClient.y) : null;
    const lines = [
      COUNTED.map((t) => `${t.replace('pointer', 'p.').replace('touch', 't.')}=${counters[t]}`).join(
        ' ',
      ),
      `last=${lastType} client=${lastClient ? `${round(lastClient.x)},${round(lastClient.y)}` : '-'} virt=${
        v ? `${round(v.x)},${round(v.y)}` : '-'
      }`,
      `phase=${stage?.dataset.phase ?? '-'} lane=${canvas.dataset.playerLane ?? '-'}`,
      // "grade:deltaMs" published by Game.noteJudge — negative delta = tapped early.
      `judge=${stage?.dataset.lastJudge ?? '-'} lead=${stage?.dataset.counterLead ?? '-'}ms`,
      `canvas=${canvas.width}x${canvas.height} css=${round(rect.width)}x${round(rect.height)} dpr=${window.devicePixelRatio}`,
      `innerH=${window.innerHeight} vvH=${
        window.visualViewport ? round(window.visualViewport.height) : '-'
      } safeBottom=${round(probe.getBoundingClientRect().height)}`,
      `err=${lastError.slice(0, 120)}`,
    ];
    box.textContent = lines.join('\n');
  };
  paint();
  const timer = window.setInterval(paint, TICK_MS);

  return () => {
    window.clearInterval(timer);
    for (const type of COUNTED) canvas.removeEventListener(type, onEvent, opts);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    box.remove();
    probe.remove();
  };
}
