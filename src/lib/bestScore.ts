/** Local best score — always available, and the whole leaderboard fallback when Firebase is absent. */
const KEY = 'katabbang.bestScore';

export function readBestScore(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Stores `score` when it beats the stored best. Returns the best score after the write. */
export function saveBestScore(score: number): number {
  const best = readBestScore();
  if (score <= best) return best;
  try {
    window.localStorage.setItem(KEY, String(score));
  } catch {
    return best;
  }
  return score;
}
