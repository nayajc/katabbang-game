'use client';

import { useEffect, useState } from 'react';
import { fetchTopScores, LEADERBOARD_LIMIT, type ScoreEntry } from '@/lib/leaderboard';
import { formatNumber } from '@/lib/i18n';
import { useStrings } from '@/lib/useLocale';
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
  const s = useStrings();

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

  if (status === 'loading') return <p className={styles.note}>{s.loading}</p>;
  if (status === 'unavailable') return <p className={styles.note}>{s.leaderboardPending}</p>;
  if (status === 'error') return <p className={styles.note}>{s.leaderboardError}</p>;
  if (entries.length === 0) return <p className={styles.note}>{s.leaderboardEmpty}</p>;

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
          <span className={styles.value}>{formatNumber(entry.score)}</span>
        </li>
      ))}
    </ol>
  );
}
