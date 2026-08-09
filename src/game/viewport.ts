import { TUNING } from './tuning';

/**
 * Client-space pointer position -> virtual units (540x960 letterboxed).
 *
 * The 3D presentation layer does not letterbox, but this mapping is still the
 * shared language of the diagnostics HUD (`?debug=1`) and of any code that
 * wants to reason about a tap in gameplay coordinates. It lived in the old 2D
 * `render.ts`; it moved here when that renderer was replaced.
 */
export function screenToVirtual(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / TUNING.VIRTUAL_W, rect.height / TUNING.VIRTUAL_H);
  const offX = (rect.width - TUNING.VIRTUAL_W * scale) / 2;
  const offY = (rect.height - TUNING.VIRTUAL_H * scale) / 2;
  return {
    x: (clientX - rect.left - offX) / scale,
    y: (clientY - rect.top - offY) / scale,
  };
}
