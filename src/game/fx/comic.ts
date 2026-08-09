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
  /** Virtual `y` at pop time. Same role as `Particle.originY`: it fixes depth. */
  originY: number;
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
    originY: 0,
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
    p.originY = y;
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

  /** Visits every live pop, newest slot last. The renderer owns the drawing. */
  forEach(fn: (p: Readonly<ComicPop>, slot: number) => void): void {
    for (let i = 0; i < this.pool.length; i += 1) {
      if (this.pool[i].alive) fn(this.pool[i], i);
    }
  }
}

/**
 * Overshoot pop-in over the first 20% of life, then a slow settle. Shared by
 * every renderer so the caption timing is a property of the FX, not the draw.
 */
export function comicScale(p: Pick<ComicPop, 'life' | 'maxLife'>): number {
  const t = 1 - p.life / p.maxLife;
  return t < 0.2 ? 0.4 + (t / 0.2) * 0.75 : 1.15 - (t - 0.2) * 0.18;
}
