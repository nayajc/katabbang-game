/** Web Share API with a clipboard fallback. v1 shares a link only — no image card. */
export function shareText(score: number, url: string): string {
  return `어깨빵 응징 러너에서 ${score}점! 정의구현 하러 가기 → ${url}`;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareScore(score: number, url?: string): Promise<ShareOutcome> {
  if (typeof window === 'undefined') return 'failed';
  const target = url ?? window.location.origin;
  const text = shareText(score, target);

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: '어깨빵 응징 러너', text, url: target });
      return 'shared';
    } catch (error) {
      // A user-dismissed share sheet is not a failure worth falling back on.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
