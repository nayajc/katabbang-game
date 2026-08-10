'use client';

import { useEffect, useState } from 'react';
import { fetchTopScores, LEADERBOARD_LIMIT, type ScoreEntry } from '@/lib/leaderboard';
import { useStrings } from '@/lib/useLocale';
import { LeaderboardCard, LeaderboardRow } from './LeaderboardCard';

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

  if (status === 'loading') return <LeaderboardCard note={s.loading} />;
  if (status === 'unavailable') return <LeaderboardCard note={s.leaderboardPending} />;
  if (status === 'error') return <LeaderboardCard note={s.leaderboardError} />;
  if (entries.length === 0) return <LeaderboardCard note={s.leaderboardEmpty} />;

  return (
    <LeaderboardCard>
      {entries.map((entry, index) => (
        <LeaderboardRow
          key={entry.id}
          rank={index + 1}
          nickname={entry.nickname}
          score={entry.score}
          variant={entry.id === highlightId ? 'mine' : 'default'}
          testId={entry.id === highlightId ? 'leaderboard-row-mine' : 'leaderboard-row'}
        />
      ))}
    </LeaderboardCard>
  );
}
