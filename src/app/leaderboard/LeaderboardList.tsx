'use client';

import { useEffect, useState } from 'react';
import { fetchTopScores, LEADERBOARD_LIMIT, type ScoreEntry } from '@/lib/leaderboard';
import styles from './leaderboard.module.css';

export type LeaderboardListProps = {
  /** Document id of the entry just written by this player — gets rank highlighting. */
  highlightId?: string | null;
  limit?: number;
  /** Bump to refetch (e.g. right after a successful submit). */
  refreshKey?: number;
};

type Status = 'loading' | 'ok' | 'unavailable' | 'error';

export default function LeaderboardList({
  highlightId,
  limit = LEADERBOARD_LIMIT,
  refreshKey = 0,
}: LeaderboardListProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [entries, setEntries] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchTopScores(limit).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        setEntries(result.entries);
        setStatus('ok');
      } else {
        setStatus(result.status === 'unavailable' ? 'unavailable' : 'error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [limit, refreshKey]);

  if (status === 'loading') return <p className={styles.note}>불러오는 중…</p>;
  if (status === 'unavailable') return <p className={styles.note}>리더보드 준비 중</p>;
  if (status === 'error') return <p className={styles.note}>리더보드를 불러오지 못했어요.</p>;
  if (entries.length === 0) return <p className={styles.note}>아직 등록된 기록이 없어요. 1등이 되어보세요!</p>;

  return (
    <ol className={styles.list} data-testid="leaderboard-list">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className={entry.id === highlightId ? `${styles.row} ${styles.mine}` : styles.row}
          data-testid={entry.id === highlightId ? 'leaderboard-row-mine' : 'leaderboard-row'}
        >
          <span className={styles.rank}>{index + 1}</span>
          <span className={styles.nickname}>{entry.nickname}</span>
          <span className={styles.value}>{entry.score.toLocaleString('ko-KR')}</span>
        </li>
      ))}
    </ol>
  );
}
