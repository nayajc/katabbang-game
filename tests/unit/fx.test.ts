import { describe, expect, it } from 'vitest';
import { ComicTextSystem, MAX_COMIC } from '@/game/fx/comic';
import { MAX_PARTICLES, ParticleSystem } from '@/game/fx/particles';
import { ScreenShake } from '@/game/fx/shake';
import { pedestrianSprite } from '@/game/sprites';

describe('ParticleSystem', () => {
  it('never exceeds the hard cap, even under repeated oversized bursts', () => {
    const ps = new ParticleSystem();
    for (let i = 0; i < 20; i += 1) {
      ps.burst(0, 0, { count: 500, speed: 100, life: 10_000, size: 2, colors: ['#fff'] });
    }
    expect(ps.count).toBe(MAX_PARTICLES);
  });

  it('retires particles once their life is spent', () => {
    const ps = new ParticleSystem();
    ps.burst(0, 0, { count: 10, speed: 100, life: 100, size: 2, colors: ['#fff'] });
    expect(ps.count).toBe(10);
    ps.update(150);
    expect(ps.count).toBe(0);
  });

  it('integrates velocity and gravity in seconds', () => {
    const ps = new ParticleSystem();
    ps.burst(0, 0, {
      count: 1,
      speed: 100,
      life: 2000,
      size: 2,
      colors: ['#fff'],
      angle: 0,
      spread: 0,
      gravity: 1000,
    });
    ps.update(1000);
    // vx = 100 => x advances 100vu in 1s; vy = 0 + 1000*1s => y advances 1000vu.
    const p = (ps as unknown as { pool: { x: number; y: number }[] }).pool[0];
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(1000, 5);
  });
});

describe('ScreenShake', () => {
  it('decays to zero and takes the strongest impulse', () => {
    const s = new ScreenShake();
    s.kick(10);
    s.kick(4);
    expect(s.amplitude).toBe(10);
    s.update(100);
    expect(s.amplitude).toBeCloseTo(5, 5);
    s.update(2000);
    expect(s.amplitude).toBe(0);
    expect(s.offsetX()).toBe(0);
  });
});

describe('ComicTextSystem', () => {
  it('recycles its fixed pool', () => {
    const c = new ComicTextSystem();
    for (let i = 0; i < MAX_COMIC * 3; i += 1) c.pop(`${i}`, 0, 0);
    const alive = (c as unknown as { pool: { alive: boolean }[] }).pool.filter((p) => p.alive);
    expect(alive).toHaveLength(MAX_COMIC);
  });
});

describe('pedestrianSprite', () => {
  it('is deterministic per entity id and stays within the variant set', () => {
    expect(pedestrianSprite(7)).toBe(pedestrianSprite(7));
    expect(pedestrianSprite(1)).toBe('pedestrian_2');
    expect(pedestrianSprite(3)).toBe('pedestrian_1');
  });
});
