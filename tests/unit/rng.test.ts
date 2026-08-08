import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { Spawner } from '@/game/entities/spawner';

const take = (n: number, seed: number) => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r.next());
};

describe('createRng', () => {
  it('same seed produces the same sequence', () => {
    expect(take(50, 1234)).toEqual(take(50, 1234));
  });

  it('different seeds diverge', () => {
    expect(take(50, 1234)).not.toEqual(take(50, 1235));
  });

  it('stays within [0, 1)', () => {
    for (const v of take(1000, 42)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() respects inclusive bounds', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const v = r.int(0, 2);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2);
    }
  });
});

describe('Spawner determinism', () => {
  const run = (seed: number) => {
    const s = new Spawner(createRng(seed));
    const out: string[] = [];
    for (let i = 0; i < 400; i += 1) {
      for (const e of s.update(16.6667, false)) out.push(`${e.kind}:${e.lane}`);
    }
    return out;
  };

  it('same seed produces the same spawn sequence', () => {
    const a = run(99);
    expect(a.length).toBeGreaterThan(5);
    expect(a).toEqual(run(99));
  });

  it('different seed produces a different spawn sequence', () => {
    expect(run(99)).not.toEqual(run(100));
  });
});
