import {
  bumperPose,
  createPose,
  pedestrianPose,
  playerCounterPose,
  playerRunPose,
  type Pose,
} from './anim';
import type { GameView } from './game';
import { getSprite, pedestrianSprite, playerRunFrame, type SpriteName } from './sprites';
import { TUNING } from './tuning';

/** Single scratch pose reused by every character each frame — never allocates. */
const POSE: Pose = createPose();

/**
 * Canvas renderer: sprites + FX, with a shape/emoji fallback that is used until
 * the images decode (or forever, if they fail). The letterbox transform and the
 * canvas HUD contract are unchanged — HUD must never become React state.
 */

const GRADE_TEXT: Record<string, string> = {
  perfect: '정의구현!',
  good: '굿!',
  miss: '으악!',
};

const GRADE_COLOR: Record<string, string> = {
  perfect: '#ffd93d',
  good: '#7ee787',
  miss: '#ff6b6b',
};

/** Mute button, in virtual units (top-right, below the HP row). */
export const MUTE_BUTTON = { x: TUNING.VIRTUAL_W - 52, y: 96, r: 26 } as const;

/**
 * On-screen lane buttons, in virtual units. Bottom corners (thumb-reachable),
 * kept clear of the top-right mute button and lifted well off the bottom edge
 * (200 virtual units) so neither the iOS home indicator nor the collapsing
 * Safari/Chrome bottom toolbar can sit on top of them.
 */
export const LEFT_LANE_BUTTON = { x: 86, y: TUNING.VIRTUAL_H - 200, r: 46 } as const;
export const RIGHT_LANE_BUTTON = {
  x: TUNING.VIRTUAL_W - 86,
  y: TUNING.VIRTUAL_H - 200,
  r: 46,
} as const;

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  view: GameView,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.min(w / TUNING.VIRTUAL_W, h / TUNING.VIRTUAL_H);
  const offX = (w - TUNING.VIRTUAL_W * scale) / 2;
  const offY = (h - TUNING.VIRTUAL_H * scale) / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d17';
  ctx.fillRect(0, 0, w, h);

  // Screen shake and the slowmo push-in live inside the world transform only,
  // so the HUD and the mute button stay pinned.
  const fx = view.fx;
  const zoom = 1 + fx.slowmo * 0.04;
  const cx = TUNING.VIRTUAL_W / 2;
  const cy = TUNING.VIRTUAL_H * 0.6;
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.save();
  ctx.translate(fx.shake.offsetX(), fx.shake.offsetY());
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);

  drawRoad(ctx, view);
  if (fx.slowmo > 0.01) drawSpeedLines(ctx, view, fx.slowmo);
  for (const e of view.entities) drawEntity(ctx, view, e);
  drawPlayer(ctx, view);
  fx.particles.draw(ctx);
  fx.comic.draw(ctx);
  ctx.restore();

  if (fx.slowmo > 0.01) drawVignette(ctx, fx.slowmo);
  if (view.hitFlash > 0.01) drawHitFlash(ctx, view.hitFlash);
  drawHud(ctx, view);
  drawMuteButton(ctx, view.muted);
  drawLaneButtons(ctx, view);
  drawOverlay(ctx, view);
}

/** Converts a client-space pointer position into virtual units. */
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

export function hitsMuteButton(x: number, y: number): boolean {
  const dx = x - MUTE_BUTTON.x;
  const dy = y - MUTE_BUTTON.y;
  const r = MUTE_BUTTON.r + 10;
  return dx * dx + dy * dy <= r * r;
}

/** Which lane button (if any) a virtual-space point hits. */
export function hitsLaneButton(x: number, y: number): -1 | 1 | null {
  for (const [dir, b] of [
    [-1, LEFT_LANE_BUTTON],
    [1, RIGHT_LANE_BUTTON],
  ] as const) {
    const dx = x - b.x;
    const dy = y - b.y;
    const r = b.r + 10;
    if (dx * dx + dy * dy <= r * r) return dir;
  }
  return null;
}

function drawRoad(ctx: CanvasRenderingContext2D, view: GameView) {
  ctx.fillStyle = '#191d2e';
  ctx.fillRect(60, 0, TUNING.VIRTUAL_W - 120, TUNING.VIRTUAL_H);

  ctx.strokeStyle = '#2c3350';
  ctx.lineWidth = 4;
  const period = 120;
  const shift = view.scrollY % period;
  for (let i = 1; i < TUNING.LANES; i += 1) {
    const x = (TUNING.LANE_X[i - 1] + TUNING.LANE_X[i]) / 2;
    for (let y = -period + shift; y < TUNING.VIRTUAL_H; y += period) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + period * 0.5);
      ctx.stroke();
    }
  }
}

/** Sprite drawn centred on (0,0) of the current transform, scaled to `height`. */
function drawSprite(ctx: CanvasRenderingContext2D, name: SpriteName, height: number): boolean {
  const img = getSprite(name);
  if (!img || !img.naturalWidth) return false;
  const w = (img.naturalWidth / img.naturalHeight) * height;
  ctx.drawImage(img, -w / 2, -height / 2, w, height);
  return true;
}

/**
 * Applies a gait pose to the current transform. Squash/stretch pivots on the
 * feet (`+height/2`) rather than the centre, so a compressing character sinks
 * into the ground instead of shrinking in place.
 */
function applyPose(ctx: CanvasRenderingContext2D, pose: Pose, height: number) {
  ctx.translate(pose.sway, pose.bob);
  const foot = height / 2;
  ctx.translate(0, foot);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.rotate(pose.rot);
  ctx.translate(0, -foot);
}

function drawEntity(ctx: CanvasRenderingContext2D, view: GameView, e: GameView['entities'][number]) {
  const isBumper = e.kind === 'bumper';
  const height = TUNING.ENTITY_R * 2.9;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.knockback) {
    ctx.rotate(e.knockback.rot);
  } else if (isBumper) {
    applyPose(ctx, bumperPose(POSE, e.id, view.scrollY, view.player.y - e.y), height);
  } else {
    applyPose(ctx, pedestrianPose(POSE, e.id, view.scrollY), height);
  }

  const sprite: SpriteName = isBumper
    ? e.knockback
      ? 'bumper_knockback'
      : 'bumper_walk'
    : pedestrianSprite(e.id);

  if (!drawSprite(ctx, sprite, height)) {
    ctx.fillStyle = isBumper ? '#ff5c7a' : '#5c7cff';
    ctx.beginPath();
    ctx.arc(0, 0, TUNING.ENTITY_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${TUNING.ENTITY_R * 1.4}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isBumper ? '😤' : '🚶', 0, 2);
  }
  ctx.restore();

  if (isBumper && e.engaged && view.phase === 'slowmo') {
    drawCounterRing(ctx, e.x, e.y, view.counterLeadMs);
  }
}

/**
 * Timing cue: an approach ring that shrinks onto a fixed target ring and closes
 * EXACTLY at `windowCenterTs` (leadMs === 0). Tap when the rings coincide.
 * Wall-clock driven, so it keeps moving through slowmo and hitstop.
 */
function drawCounterRing(ctx: CanvasRenderingContext2D, x: number, y: number, leadMs: number) {
  const base = TUNING.ENTITY_R + 14;
  const reach = 110;
  const k = Math.max(0, Math.min(1, leadMs / TUNING.COUNTER_CUE_LEAD_MS));
  const inPerfect = Math.abs(leadMs) <= TUNING.PERFECT_MS;
  const inGood = Math.abs(leadMs) <= TUNING.GOOD_MS;

  ctx.save();
  // Fixed target ring — the thing the approach ring lands on.
  ctx.strokeStyle = inPerfect ? '#ffd93d' : inGood ? '#7ee787' : '#ffffff55';
  ctx.lineWidth = inPerfect ? 7 : 4;
  ctx.beginPath();
  ctx.arc(x, y, base, 0, Math.PI * 2);
  ctx.stroke();

  // Approach ring, only while it is still outside the target.
  if (leadMs > 0) {
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, base + k * reach, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, view: GameView) {
  const p = view.player;
  const countering = view.phase === 'slowmo' || (view.phase === 'result' && view.lastGrade !== null);
  const height = TUNING.PLAYER_R * 3;
  // Real run-cycle frames when they have decoded; the single pose otherwise.
  // The procedural gait is damped when the frames carry the leg motion.
  const frame = countering ? null : playerRunFrame(view.scrollY);
  ctx.save();
  ctx.globalAlpha = view.playerAlpha;
  ctx.translate(p.x, p.y);
  // Lean into the lane change. Applied before the gait pose so the pose's own
  // squash/stretch still pivots on the (leaning) feet.
  if (p.lean !== 0) {
    ctx.translate(0, height / 2);
    ctx.rotate(p.lean);
    ctx.translate(0, -height / 2);
  }
  applyPose(
    ctx,
    countering
      ? playerCounterPose(POSE, view.fx.slowmo)
      : playerRunPose(POSE, view.scrollY, view.speed, frame ? 0.45 : 1),
    height,
  );
  if (!drawSprite(ctx, countering ? 'player_counter' : (frame ?? 'player_run'), height)) {
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(0, 0, TUNING.PLAYER_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${TUNING.PLAYER_R * 1.4}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏃', 0, 2);
  }
  ctx.restore();
}

/** Slowmo treatment: vertical speed lines rushing past the play field. */
function drawSpeedLines(ctx: CanvasRenderingContext2D, view: GameView, weight: number) {
  ctx.save();
  ctx.globalAlpha = 0.22 * weight;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const period = 160;
  const shift = (view.scrollY * 2.2) % period;
  for (let i = 0; i < 14; i += 1) {
    const x = 40 + ((i * 97) % (TUNING.VIRTUAL_W - 80));
    const y = -period + ((i * 53 + shift) % (TUNING.VIRTUAL_H + period));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 90);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, weight: number) {
  const cx = TUNING.VIRTUAL_W / 2;
  const cy = TUNING.VIRTUAL_H * 0.6;
  const g = ctx.createRadialGradient(cx, cy, TUNING.VIRTUAL_W * 0.28, cx, cy, TUNING.VIRTUAL_W);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.62 * weight})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TUNING.VIRTUAL_W, TUNING.VIRTUAL_H);
  ctx.restore();
}

/** Brief red vignette on hp loss — the "you just got hit" read. */
function drawHitFlash(ctx: CanvasRenderingContext2D, weight: number) {
  const cx = TUNING.VIRTUAL_W / 2;
  const cy = TUNING.VIRTUAL_H / 2;
  const g = ctx.createRadialGradient(cx, cy, TUNING.VIRTUAL_W * 0.2, cx, cy, TUNING.VIRTUAL_W);
  g.addColorStop(0, 'rgba(255,0,32,0)');
  g.addColorStop(1, `rgba(255,24,48,${0.72 * weight})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TUNING.VIRTUAL_W, TUNING.VIRTUAL_H);
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, view: GameView) {
  const s = view.score;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(`${Math.floor(s.distance) + Math.floor(s.counterScore)}`, 28, 28);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#aab';
  ctx.fillText(`정의 ${s.justice}  콤보 ${s.combo}`, 28, 70);

  // Hearts pulse and glow red for HIT_FLASH_MS after an hp loss, so the cost of
  // a hit is legible in the HUD and not only in the world.
  const flash = view.hitFlash;
  ctx.textAlign = 'right';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.translate(TUNING.VIRTUAL_W - 28, 28);
  if (flash > 0.01) {
    ctx.shadowColor = '#ff2d3f';
    ctx.shadowBlur = 26 * flash;
    const pop = 1 + 0.3 * flash;
    ctx.translate(0, 14);
    ctx.scale(pop, pop);
    ctx.translate(0, -14);
  }
  ctx.fillText('❤️'.repeat(Math.max(0, s.hp)), 0, 0);
  ctx.restore();
}

function drawMuteButton(ctx: CanvasRenderingContext2D, muted: boolean) {
  ctx.save();
  ctx.translate(MUTE_BUTTON.x, MUTE_BUTTON.y);
  ctx.fillStyle = '#ffffff1a';
  ctx.beginPath();
  ctx.arc(0, 0, MUTE_BUTTON.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(muted ? '🔇' : '🔊', 0, 1);
  ctx.restore();
}

function drawLaneButtons(ctx: CanvasRenderingContext2D, view: GameView) {
  if (view.phase !== 'running' && view.phase !== 'slowmo') return;
  for (const [dir, b, glyph] of [
    [-1, LEFT_LANE_BUTTON, '◀'],
    [1, RIGHT_LANE_BUTTON, '▶'],
  ] as const) {
    const pressed = view.lanePressed === dir;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = pressed ? '#ffffff3d' : '#ffffff14';
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillStyle = pressed ? '#ffffff' : '#ffffff8c';
    ctx.fillText(glyph, 0, 2);
    ctx.restore();
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, view: GameView) {
  if (view.phase === 'result' && view.lastGrade) {
    const g = view.lastGrade;
    const pop = 1 + 0.25 * (1 - view.resultProgress);
    ctx.save();
    ctx.globalAlpha = 1 - view.resultProgress * 0.6;
    ctx.translate(TUNING.VIRTUAL_W / 2, TUNING.VIRTUAL_H * 0.42);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = GRADE_COLOR[g];
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText(GRADE_TEXT[g], 0, 0);
    if (view.lastGain > 0) {
      ctx.font = 'bold 32px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`+${view.lastGain}`, 0, 56);
    }
    ctx.restore();
  }

  if (view.phase === 'slowmo') {
    ctx.save();
    ctx.fillStyle = '#ffffffcc';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('지금이야! 탭!', TUNING.VIRTUAL_W / 2, TUNING.VIRTUAL_H * 0.3);
    ctx.restore();
  }
}
