import { TUNING } from './tuning';

export type Grade = 'perfect' | 'good' | 'miss';

export type JudgeWindows = {
  perfectMs: number;
  goodMs: number;
};

export const DEFAULT_WINDOWS: JudgeWindows = {
  perfectMs: TUNING.PERFECT_MS,
  goodMs: TUNING.GOOD_MS,
};

/**
 * Pure, clock-agnostic timing judgement.
 *
 * Both arguments must come from the SAME time origin — in this game that is
 * `performance.now()` / `*Event.timeStamp` wall-clock milliseconds. Slow motion
 * scales the *simulation*, never the judgement windows.
 *
 * Boundaries are inclusive: |delta| === perfectMs is still 'perfect'.
 */
export function judge(
  inputTs: number,
  windowCenterTs: number,
  windows: JudgeWindows = DEFAULT_WINDOWS,
): Grade {
  const delta = Math.abs(inputTs - windowCenterTs);
  if (delta <= windows.perfectMs) return 'perfect';
  if (delta <= windows.goodMs) return 'good';
  return 'miss';
}
