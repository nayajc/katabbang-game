/**
 * FX facade: one object the game pushes events into and the renderer draws.
 *
 * Everything here runs on the **wall clock**, not the simulation clock, so
 * particles keep flying while slowmo/hitstop freeze the world.
 */
import { ComicTextSystem } from './comic';
import { ParticleSystem } from './particles';
import { ScreenShake } from './shake';

const PERFECT_COLORS = ['#ffd93d', '#ffffff', '#ff9f1c'] as const;
const GOOD_COLORS = ['#7ee787', '#ffffff', '#3fb950'] as const;
const HIT_COLORS = ['#ff6b6b', '#ffb4b4', '#ffffff'] as const;

export class Fx {
  readonly particles = new ParticleSystem();
  readonly comic = new ComicTextSystem();
  readonly shake = new ScreenShake();
  /** 0..1 slowmo visual weight — drives vignette, desaturation and speed lines. */
  private slowmoWeight = 0;

  get slowmo(): number {
    return this.slowmoWeight;
  }

  reset(): void {
    this.particles.clear();
    this.comic.clear();
    this.shake.clear();
    this.slowmoWeight = 0;
  }

  update(dtMs: number, slowmoActive: boolean): void {
    this.particles.update(dtMs);
    this.comic.update(dtMs);
    this.shake.update(dtMs);
    const target = slowmoActive ? 1 : 0;
    const rate = Math.min(1, dtMs / (slowmoActive ? 90 : 220));
    this.slowmoWeight += (target - this.slowmoWeight) * rate;
  }

  /** Successful counter. `dir` is the direction the bumper is launched. */
  counterHit(x: number, y: number, perfect: boolean, dir: -1 | 1): void {
    const colors = perfect ? PERFECT_COLORS : GOOD_COLORS;
    this.particles.burst(x, y, {
      count: perfect ? 46 : 30,
      speed: perfect ? 760 : 520,
      speedJitter: 320,
      life: 520,
      lifeJitter: 240,
      size: 7,
      colors,
      gravity: 900,
      shape: 'square',
    });
    this.particles.burst(x, y, {
      count: perfect ? 22 : 14,
      speed: 900,
      speedJitter: 260,
      life: 260,
      lifeJitter: 120,
      size: 5,
      colors: ['#ffffff'],
      angle: dir > 0 ? 0 : Math.PI,
      spread: 1.1,
    });
    this.shake.kick(perfect ? 20 : 12);
    this.comic.pop(perfect ? '퍼펙트!' : 'POW!', x, y - 40, {
      size: perfect ? 56 : 46,
      color: perfect ? '#ffd93d' : '#7ee787',
      burst: true,
      life: 800,
    });
    // NB: the big centred "정의구현!" is the result banner in render.ts — the comic
    // pop stays short so the two never read as duplicated text.
  }

  /** Whiffed counter — the bumper connects. */
  counterMiss(x: number, y: number): void {
    this.particles.burst(x, y, {
      count: 18,
      speed: 340,
      speedJitter: 180,
      life: 420,
      lifeJitter: 160,
      size: 6,
      colors: HIT_COLORS,
      gravity: 700,
      shape: 'square',
    });
    this.shake.kick(16);
    this.comic.pop('으악!', x, y - 40, { size: 46, color: '#ff6b6b', life: 700 });
  }

  /** Pedestrian collision. */
  collision(x: number, y: number): void {
    this.particles.burst(x, y, {
      count: 16,
      speed: 300,
      speedJitter: 160,
      life: 380,
      lifeJitter: 140,
      size: 5,
      colors: HIT_COLORS,
      gravity: 800,
    });
    this.shake.kick(13);
    this.comic.pop('쿵!', x, y - 30, { size: 38, color: '#ff6b6b', life: 560 });
  }

  comboUp(combo: number, x: number, y: number): void {
    this.comic.pop(`${combo} COMBO`, x, y, { size: 34, color: '#8ab4ff', life: 620 });
  }

  gameOver(x: number, y: number): void {
    this.particles.burst(x, y, {
      count: 40,
      speed: 520,
      speedJitter: 300,
      life: 900,
      lifeJitter: 300,
      size: 7,
      colors: HIT_COLORS,
      gravity: 900,
      shape: 'square',
    });
    this.shake.kick(24);
  }
}
