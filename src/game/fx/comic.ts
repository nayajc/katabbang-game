/**
 * Comic-book effect text ("POW!", "PERFECT!", …) — pooled, capped, drawn
 * with a rotated outline + starburst so it reads as a manhwa impact caption.
 */

export const MAX_COMIC = 6;

export type ComicPop = {
  alive: boolean;
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  burst: boolean;
};

function blank(): ComicPop {
  return {
    alive: false,
    text: '',
    x: 0,
    y: 0,
    life: 0,
    maxLife: 1,
    size: 40,
    color: '#fff',
    rot: 0,
    burst: false,
  };
}

export type ComicOptions = {
  life?: number;
  size?: number;
  color?: string;
  rot?: number;
  /** Draw the yellow starburst plate behind the text. */
  burst?: boolean;
};

export class ComicTextSystem {
  private pool: ComicPop[] = Array.from({ length: MAX_COMIC }, blank);
  private cursor = 0;

  clear(): void {
    for (const p of this.pool) p.alive = false;
    this.cursor = 0;
  }

  pop(text: string, x: number, y: number, o: ComicOptions = {}): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_COMIC;
    p.alive = true;
    p.text = text;
    p.x = x;
    p.y = y;
    p.maxLife = o.life ?? 700;
    p.life = p.maxLife;
    p.size = o.size ?? 44;
    p.color = o.color ?? '#ffd93d';
    p.rot = o.rot ?? (Math.random() - 0.5) * 0.32;
    p.burst = o.burst ?? false;
  }

  update(dtMs: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dtMs;
      if (p.life <= 0) p.alive = false;
      else p.y -= dtMs * 0.03;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const k = p.life / p.maxLife;
      // Overshoot pop-in over the first 20% of life, then hold and fade.
      const t = 1 - k;
      const scale = t < 0.2 ? 0.4 + (t / 0.2) * 0.75 : 1.15 - (t - 0.2) * 0.18;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(scale, scale);
      if (p.burst) drawStarburst(ctx, p.size * 2.1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${p.size}px system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = p.size * 0.22;
      ctx.strokeStyle = '#12101c';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function drawStarburst(ctx: CanvasRenderingContext2D, radius: number) {
  const spikes = 12;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.62;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.62;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff22';
  ctx.fill();
}
