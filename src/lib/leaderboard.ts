/** Firestore leaderboard access. Every call degrades gracefully when Firebase is unconfigured. */
import { ensureAnonymousUid, getDb, isFirebaseConfigured } from './firebase';
import { checkNickname } from './nickname';

export const SCORES_COLLECTION = 'scores';
export const LEADERBOARD_LIMIT = 100;
/** Mirrors the `score` ceiling enforced by firestore.rules. */
export const MAX_SCORE = 10_000_000;

export type ScoreEntry = {
  id: string;
  nickname: string;
  score: number;
  distance: number;
  combo: number;
  uid: string;
  createdAt: number | null;
};

export type SubmitInput = {
  nickname: string;
  score: number;
  distance: number;
  combo: number;
};

export type SubmitResult =
  | { status: 'ok'; id: string; uid: string }
  | { status: 'unavailable' }
  | { status: 'invalid'; reason: string }
  | { status: 'error'; reason: string };

const clampInt = (value: number, max: number) =>
  Math.max(0, Math.min(max, Math.floor(Number.isFinite(value) ? value : 0)));

export async function submitScore(input: SubmitInput): Promise<SubmitResult> {
  const check = checkNickname(input.nickname);
  if (!check.ok) return { status: 'invalid', reason: check.reason };
  if (!isFirebaseConfigured()) return { status: 'unavailable' };

  try {
    const [db, uid] = await Promise.all([getDb(), ensureAnonymousUid()]);
    if (!db || !uid) return { status: 'unavailable' };
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
    const ref = await addDoc(collection(db, SCORES_COLLECTION), {
      nickname: input.nickname.trim(),
      score: clampInt(input.score, MAX_SCORE),
      distance: clampInt(input.distance, MAX_SCORE),
      combo: clampInt(input.combo, MAX_SCORE),
      createdAt: serverTimestamp(),
      uid,
    });
    return { status: 'ok', id: ref.id, uid };
  } catch (error) {
    return { status: 'error', reason: error instanceof Error ? error.message : '알 수 없는 오류' };
  }
}

export type TopScoresResult =
  | { status: 'ok'; entries: ScoreEntry[] }
  | { status: 'unavailable' }
  | { status: 'error'; reason: string };

export async function fetchTopScores(max = LEADERBOARD_LIMIT): Promise<TopScoresResult> {
  if (!isFirebaseConfigured()) return { status: 'unavailable' };
  try {
    const db = await getDb();
    if (!db) return { status: 'unavailable' };
    const { collection, getDocs, limit, orderBy, query } = await import('firebase/firestore');
    const snapshot = await getDocs(
      query(collection(db, SCORES_COLLECTION), orderBy('score', 'desc'), limit(max)),
    );
    const entries = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt as { toMillis?: () => number } | null | undefined;
      return {
        id: doc.id,
        nickname: String(data.nickname ?? ''),
        score: Number(data.score ?? 0),
        distance: Number(data.distance ?? 0),
        combo: Number(data.combo ?? 0),
        uid: String(data.uid ?? ''),
        createdAt: createdAt?.toMillis ? createdAt.toMillis() : null,
      } satisfies ScoreEntry;
    });
    return { status: 'ok', entries };
  } catch (error) {
    return { status: 'error', reason: error instanceof Error ? error.message : '알 수 없는 오류' };
  }
}
