import type { Grade } from './judge';
import { TUNING } from './tuning';

export type Score = {
  distance: number;
  counterScore: number;
  combo: number;
  bestCombo: number;
  justice: number;
  hp: number;
};

export function createScore(): Score {
  return { distance: 0, counterScore: 0, combo: 0, bestCombo: 0, justice: 0, hp: TUNING.HP_MAX };
}

export function total(s: Score): number {
  return Math.floor(s.distance) + Math.floor(s.counterScore);
}

export function comboMultiplier(combo: number): number {
  return Math.min(TUNING.COMBO_MAX_MULT, 1 + combo * TUNING.COMBO_STEP);
}

export function addDistance(s: Score, vu: number): void {
  s.distance += vu * TUNING.DISTANCE_PER_VU;
}

/** Applies a counter result. Returns the points gained (0 on miss). */
export function applyCounter(s: Score, grade: Grade): number {
  if (grade === 'miss') {
    s.combo = 0;
    s.hp -= 1;
    return 0;
  }
  const mult = comboMultiplier(s.combo);
  const base = grade === 'perfect' ? TUNING.COUNTER_BONUS : TUNING.COUNTER_BONUS * TUNING.GOOD_SCORE_RATIO;
  const gained = Math.floor(base * mult);
  s.counterScore += gained;
  s.combo += 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  s.justice += grade === 'perfect' ? TUNING.JUSTICE_PERFECT : TUNING.JUSTICE_GOOD;
  return gained;
}

/** Collision with a pedestrian/obstacle. */
export function applyHit(s: Score): void {
  s.combo = 0;
  s.hp -= 1;
}
