'use client';

import Link from 'next/link';
import { useState } from 'react';
import LeaderboardList from '@/app/leaderboard/LeaderboardList';
import { saveBestScore } from '@/lib/bestScore';
import { isFirebaseConfigured } from '@/lib/firebase';
import { submitScore } from '@/lib/leaderboard';
import { shareScore } from '@/lib/share';
import { formatNumber } from '@/lib/i18n';
import { useStrings } from '@/lib/useLocale';
import type { NicknameReason } from '@/lib/nickname';
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
  const s = useStrings();

  const leaderboardOn = isFirebaseConfigured();
  const nicknameMessage = (reason: NicknameReason) =>
    reason === 'format' ? s.nicknameFormat : s.nicknameBanned;

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

  return (
    <div className={styles.panel}>
      <p className={styles.best}>
        {s.bestRecord} {formatNumber(best)}
        {s.scoreSuffix}
      </p>

      {leaderboardOn && !entryId && (
        <div className={styles.formRow}>
          <input
            className={styles.input}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={s.nicknamePlaceholder}
            maxLength={12}
            aria-label={s.nicknameAria}
            data-testid="nickname-input"
          />
          <button
            type="button"
            className={styles.smallButton}
            onClick={onSubmit}
            disabled={submitting}
            data-testid="submit-score-button"
          >
            {submitting ? s.submitting : s.submit}
          </button>
        </div>
      )}

      {!leaderboardOn && <p className={styles.desc}>{s.leaderboardPending}</p>}
      {message && <p className={styles.desc} data-testid="submit-message">{message}</p>}

      {entryId && (
        <div className={styles.board}>
          <LeaderboardList highlightId={entryId} limit={100} />
        </div>
      )}

      <div className={styles.formRow}>
        <button type="button" className={styles.smallButton} onClick={onShare} data-testid="share-button">
          {s.share}
        </button>
        <Link href="/leaderboard" className={styles.link} data-testid="leaderboard-link">
          {s.top100Link}
        </Link>
      </div>
      {shareNote && <p className={styles.desc}>{shareNote}</p>}
    </div>
  );
}
