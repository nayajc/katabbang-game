'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { LeaderboardCard, LeaderboardEllipsisRow, LeaderboardRow } from '@/app/leaderboard/LeaderboardCard';
import { saveBestScore } from '@/lib/bestScore';
import { isFirebaseConfigured } from '@/lib/firebase';
import { fetchTopScores, LEADERBOARD_LIMIT, submitScore, type ScoreEntry } from '@/lib/leaderboard';
import { shareScore } from '@/lib/share';
import { useStrings } from '@/lib/useLocale';
import type { NicknameReason } from '@/lib/nickname';
import type { GameOverInfo } from '@/game/game';
import styles from './play.module.css';

export type GameOverPanelProps = { result: GameOverInfo };

/** How many rows the board shows before falling back to a "…" + pinned own-rank row. */
const TOP_N = 8;

type FetchStatus = 'idle' | 'loading' | 'ok' | 'unavailable' | 'error';

type Row = {
  key: string;
  rank: number;
  nickname: string;
  score: number;
  variant: 'default' | 'mine' | 'entry';
};

export default function GameOverPanel({ result }: GameOverPanelProps) {
  // Mounted with key={result.seed}, so this lazy initializer runs once per run.
  const [best] = useState(() => saveBestScore(result.score));
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [submittedNickname, setSubmittedNickname] = useState('');
  const [shareNote, setShareNote] = useState<string | null>(null);
  const leaderboardOn = isFirebaseConfigured();
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>(leaderboardOn ? 'loading' : 'idle');
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const s = useStrings();

  const nicknameMessage = (reason: NicknameReason) =>
    reason === 'format' ? s.nicknameFormat : s.nicknameBanned;

  useEffect(() => {
    if (!leaderboardOn) return;
    let cancelled = false;
    fetchTopScores(LEADERBOARD_LIMIT).then((outcome) => {
      if (cancelled) return;
      if (outcome.status === 'ok') {
        setEntries(outcome.entries);
        setFetchStatus('ok');
      } else {
        setFetchStatus(outcome.status === 'unavailable' ? 'unavailable' : 'error');
      }
    });
    return () => {
      cancelled = true;
    };
    // Fetch once per run — `result` is stable for the panel's lifetime (keyed by seed).
  }, [leaderboardOn]);

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
      setSubmittedNickname(nickname.trim());
      setEntryId(outcome.id);
    } else if (outcome.status === 'invalid') {
      setMessage(nicknameMessage(outcome.reason));
    } else if (outcome.status === 'unavailable') {
      setMessage(s.leaderboardPending);
    } else {
      setMessage(s.submitFailed);
    }
  };

  const onShare = async () => {
    const outcome = await shareScore(result.score);
    setShareNote(
      outcome === 'copied' ? s.shareCopied : outcome === 'failed' ? s.shareFailed : null,
    );
  };

  const board = renderBoard();

  return (
    <div className={styles.panel}>
      {board}
      {shareNote && <p className={styles.desc}>{shareNote}</p>}

      <div className={styles.formRow}>
        <button type="button" className={styles.smallButton} onClick={onShare} data-testid="share-button">
          {s.share}
        </button>
        <Link href="/leaderboard" className={styles.link} data-testid="leaderboard-link">
          {s.top100Link}
        </Link>
      </div>
    </div>
  );

  function renderBoard(): ReactNode {
    if (fetchStatus === 'loading') return <LeaderboardCard note={s.loading} />;
    if (fetchStatus === 'error') return <LeaderboardCard note={s.leaderboardError} />;

    // Not configured, or configured-but-unreachable: fall back to the local best,
    // still inside the same board frame so the layout never jumps.
    if (fetchStatus === 'idle' || fetchStatus === 'unavailable') {
      return (
        <LeaderboardCard footNote={s.leaderboardPending}>
          <LeaderboardRow rank="-" nickname={s.youLabel} score={best} variant="mine" testId="leaderboard-row-mine" />
        </LeaderboardCard>
      );
    }

    const myScore = result.score;
    const rank = entries.filter((entry) => entry.score > myScore).length + 1;
    const selfVariant: Row['variant'] = entryId ? 'mine' : 'entry';
    const selfRow: Row = {
      key: 'self',
      rank,
      nickname: entryId ? submittedNickname : '',
      score: myScore,
      variant: selfVariant,
    };

    let rows: Row[];
    let ellipsis = false;

    if (rank <= TOP_N) {
      const merged: Row[] = entries
        .slice(0, TOP_N - 1)
        .map((entry) => ({ key: entry.id, rank: 0, nickname: entry.nickname, score: entry.score, variant: 'default' }));
      merged.splice(rank - 1, 0, selfRow);
      rows = merged.slice(0, TOP_N).map((row, index) => ({ ...row, rank: index + 1 }));
    } else {
      const topRows: Row[] = entries
        .slice(0, TOP_N - 2)
        .map((entry, index) => ({ key: entry.id, rank: index + 1, nickname: entry.nickname, score: entry.score, variant: 'default' }));
      rows = [...topRows, selfRow];
      ellipsis = true;
    }

    const nodes: ReactNode[] = [];
    for (const row of rows) {
      if (ellipsis && row.key === 'self') nodes.push(<LeaderboardEllipsisRow key="ellipsis" />);
      nodes.push(
        <LeaderboardRow
          key={row.key}
          rank={row.rank}
          nickname={row.nickname}
          score={row.score}
          variant={row.variant}
          testId={row.key === 'self' ? (entryId ? 'leaderboard-row-mine' : 'leaderboard-row-entry') : 'leaderboard-row'}
          entry={
            row.variant === 'entry'
              ? { value: nickname, onChange: setNickname, onSubmit, submitting, message }
              : undefined
          }
        />,
      );
    }

    return <LeaderboardCard>{nodes}</LeaderboardCard>;
  }
}
