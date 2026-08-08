'use client';

import Link from 'next/link';
import { useState } from 'react';
import LeaderboardList from '@/app/leaderboard/LeaderboardList';
import { saveBestScore } from '@/lib/bestScore';
import { isFirebaseConfigured } from '@/lib/firebase';
import { submitScore } from '@/lib/leaderboard';
import { shareScore } from '@/lib/share';
import type { GameOverInfo } from '@/game/game';
import styles from './play.module.css';

export type GameOverPanelProps = { result: GameOverInfo };

export default function GameOverPanel({ result }: GameOverPanelProps) {
  // Mounted with key={result.seed}, so this lazy initializer runs once per run.
  const [best] = useState(() => saveBestScore(result.score));
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const leaderboardOn = isFirebaseConfigured();

  const onSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    const outcome = await submitScore({
      nickname,
      score: result.score,
      distance: result.distance,
      combo: result.bestCombo,
    });
    setSubmitting(false);
    if (outcome.status === 'ok') {
      setEntryId(outcome.id);
    } else if (outcome.status === 'invalid') {
      setMessage(outcome.reason);
    } else if (outcome.status === 'unavailable') {
      setMessage('리더보드 준비 중');
    } else {
      setMessage('등록에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const onShare = async () => {
    const outcome = await shareScore(result.score);
    setShareNote(
      outcome === 'copied'
        ? '점수 링크를 복사했어요!'
        : outcome === 'failed'
          ? '공유에 실패했어요.'
          : null,
    );
  };

  return (
    <div className={styles.panel}>
      <p className={styles.best}>최고 기록 {best.toLocaleString('ko-KR')}점</p>

      {leaderboardOn && !entryId && (
        <div className={styles.formRow}>
          <input
            className={styles.input}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="닉네임 (한글/영문/숫자 2~12자)"
            maxLength={12}
            aria-label="닉네임"
            data-testid="nickname-input"
          />
          <button
            type="button"
            className={styles.smallButton}
            onClick={onSubmit}
            disabled={submitting}
            data-testid="submit-score-button"
          >
            {submitting ? '등록 중…' : '랭킹 등록'}
          </button>
        </div>
      )}

      {!leaderboardOn && <p className={styles.desc}>리더보드 준비 중</p>}
      {message && <p className={styles.desc} data-testid="submit-message">{message}</p>}

      {entryId && (
        <div className={styles.board}>
          <LeaderboardList highlightId={entryId} limit={100} />
        </div>
      )}

      <div className={styles.formRow}>
        <button type="button" className={styles.smallButton} onClick={onShare} data-testid="share-button">
          공유하기
        </button>
        <Link href="/leaderboard" className={styles.link} data-testid="leaderboard-link">
          TOP 100 보기
        </Link>
      </div>
      {shareNote && <p className={styles.desc}>{shareNote}</p>}
    </div>
  );
}
