import { describe, expect, it } from 'vitest';
import { StateMachine } from '@/game/state';
import { applyCounter, applyHit, comboMultiplier, createScore, total } from '@/game/scoring';
import { TUNING } from '@/game/tuning';

describe('StateMachine', () => {
  it('walks title -> running -> slowmo -> result -> gameover', () => {
    const sm = new StateMachine();
    expect(sm.phase).toBe('title');
    expect(sm.set('running')).toBe(true);
    expect(sm.set('slowmo')).toBe(true);
    expect(sm.set('result')).toBe(true);
    expect(sm.set('gameover')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    const sm = new StateMachine();
    expect(sm.set('slowmo')).toBe(false);
    expect(sm.phase).toBe('title');
  });

  it('notifies on change only', () => {
    const seen: string[] = [];
    const sm = new StateMachine((to) => seen.push(to));
    sm.set('running');
    sm.set('running');
    expect(seen).toEqual(['running']);
  });
});

describe('scoring', () => {
  it('score = distance + counter bonus x combo multiplier', () => {
    const s = createScore();
    s.distance = 100.9;
    const first = applyCounter(s, 'perfect');
    expect(first).toBe(TUNING.COUNTER_BONUS);
    const second = applyCounter(s, 'perfect');
    expect(second).toBe(Math.floor(TUNING.COUNTER_BONUS * comboMultiplier(1)));
    expect(total(s)).toBe(100 + first + second);
    expect(s.justice).toBe(TUNING.JUSTICE_PERFECT * 2);
  });

  it('miss breaks combo and costs HP', () => {
    const s = createScore();
    applyCounter(s, 'good');
    expect(s.combo).toBe(1);
    expect(applyCounter(s, 'miss')).toBe(0);
    expect(s.combo).toBe(0);
    expect(s.hp).toBe(TUNING.HP_MAX - 1);
    expect(s.bestCombo).toBe(1);
  });

  it('obstacle hit costs HP down to game over', () => {
    const s = createScore();
    for (let i = 0; i < TUNING.HP_MAX; i += 1) applyHit(s);
    expect(s.hp).toBe(0);
  });

  it('combo multiplier is capped', () => {
    expect(comboMultiplier(1000)).toBe(TUNING.COMBO_MAX_MULT);
  });
});
