/**
 * Pooled particle system. The pool is allocated once and never grows, so a
 * frame can never allocate; `spawn` past the cap silently recycles the oldest
 * live particle. No per-frame garbage => no GC hitches at 60fps.
 */

export const MAX_PARTICLES = 220;

export type Particle = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Remaining life in ms. */
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  spin: number;
  rot: number;
  /** Squares read as comic debris; dots read as sparks. */
  shape: 'dot' | 'square';
};

function blank(): Particle {
  return {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    color: '#fff',
    gravity: 0,
    spin: 0,
    rot: 0,
    shape: 'dot',
  };
}

export type BurstOptions = {
  count: number;
  speed: number;
  speedJitter?: number;
  life: number;
  lifeJitter?: number;
  size: number;
  colors: readonly string[];
  gravity?: number;
  /** Cone direction in radians; omit for a full circle. */
  angle?: number;
  spread?: number;
  shape?: Particle['shape'];
};

export class ParticleSystem {
  private pool: Particle[] = Array.from({ length: MAX_PARTICLES }, blank);
  private cursor = 0;
  private live = 0;

  get count(): number {
    return this.live;
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
    this.live = 0;
    this.cursor = 0;
  }

  burst(x: number, y: number, o: BurstOptions): void {
    const n = Math.min(o.count, MAX_PARTICLES);
    for (let i = 0; i < n; i += 1) {
      const p = this.take();
      const base = o.angle ?? 0;
      const spread = o.spread ?? Math.PI * 2;
      const a = o.angle === undefined ? Math.random() * spread : base + (Math.random() - 0.5) * spread;
      const speed = o.speed + (o.speedJitter ?? 0) * (Math.random() - 0.5) * 2;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.maxLife = Math.max(1, o.life + (o.lifeJitter ?? 0) * (Math.random() - 0.5) * 2);
      p.life = p.maxLife;
      p.size = o.size * (0.6 + Math.random() * 0.8);
      p.color = o.colors[(Math.random() * o.colors.length) | 0];
      p.gravity = o.gravity ?? 0;
      p.rot = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 14;
      p.shape = o.shape ?? 'dot';
    }
  }

  /** dtMs is wall-clock: FX keep their own timeline, independent of slowmo. */
  update(dtMs: number): void {
    const s = dtMs / 1000;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dtMs;
      if (p.life <= 0) {
        p.alive = false;
        this.live -= 1;
        continue;
      }
      p.vy += p.gravity * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.spin * s;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const k = p.life / p.maxLife;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * k;
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private take(): Particle {
    // Ring cursor: past the cap the oldest slot is recycled instead of allocating.
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    if (!p.alive) this.live += 1;
    p.alive = true;
    return p;
  }
}
