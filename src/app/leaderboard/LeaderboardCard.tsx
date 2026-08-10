'use client';

import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/i18n';
import { useStrings } from '@/lib/useLocale';
import styles from './LeaderboardCard.module.css';

/**
 * Game-style leaderboard frame: crown header, column labels, scrollable row
 * list. `LeaderboardCard` only supplies the chrome — callers render rows
 * (`LeaderboardRow` / `LeaderboardEllipsisRow`) or a `note` fallback.
 */
export function LeaderboardCard({
  children,
  note,
  footNote,
}: {
  children?: ReactNode;
  /** Replaces columns + rows entirely (loading / error / empty states). */
  note?: ReactNode;
  /** Small caption rendered under the row list, alongside `children` (e.g. "leaderboard coming soon"). */
  footNote?: ReactNode;
}) {
  const s = useStrings();
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.crown} aria-hidden="true">
          👑
        </span>
        <h2 className={styles.headerTitle}>{s.leaderboardCardTitle}</h2>
      </div>
      {note ? (
        <p className={styles.note}>{note}</p>
      ) : (
        <>
          <div className={styles.columns} aria-hidden="true">
            <span>{s.colRank}</span>
            <span>{s.colName}</span>
            <span className={styles.colScore}>{s.colScore}</span>
          </div>
          <ol className={styles.rows} data-testid="leaderboard-list">
            {children}
          </ol>
          {footNote && <p className={styles.footNote}>{footNote}</p>}
        </>
      )}
    </div>
  );
}

function badgeClass(rank: number | string): string {
  if (rank === 1) return styles.badgeGold;
  if (rank === 2) return styles.badgeSilver;
  if (rank === 3) return styles.badgeBronze;
  return '';
}

export type LeaderboardRowProps = {
  rank: number | string;
  nickname: string;
  score: number;
  /** 'mine' highlights a row already tied to this player; 'entry' renders the inline name-entry form instead of a nickname. */
  variant?: 'default' | 'mine' | 'entry';
  testId?: string;
  entry?: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    submitting: boolean;
    message?: string | null;
  };
};

export function LeaderboardRow({ rank, nickname, score, variant = 'default', testId, entry }: LeaderboardRowProps) {
  const s = useStrings();
  const rowClass = [styles.row, variant === 'mine' && styles.mine, variant === 'entry' && styles.pending]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={rowClass} data-testid={testId}>
      <span className={`${styles.badge} ${badgeClass(rank)}`}>{rank}</span>
      {variant === 'entry' && entry ? (
        <>
          <div className={styles.entryForm}>
            <input
              className={styles.entryInput}
              value={entry.value}
              onChange={(event) => entry.onChange(event.target.value)}
              placeholder={s.nicknamePlaceholder}
              maxLength={12}
              aria-label={s.nicknameAria}
              data-testid="nickname-input"
            />
            <button
              type="button"
              className={styles.entryButton}
              onClick={entry.onSubmit}
              disabled={entry.submitting}
              data-testid="submit-score-button"
            >
              {entry.submitting ? s.submitting : s.submitShort}
            </button>
          </div>
          <span className={styles.score}>{formatNumber(score)}</span>
          {entry.message && (
            <p className={styles.entryMessage} data-testid="submit-message">
              {entry.message}
            </p>
          )}
        </>
      ) : (
        <>
          <span className={styles.nickname}>{nickname}</span>
          <span className={styles.score}>{formatNumber(score)}</span>
        </>
      )}
    </li>
  );
}

export function LeaderboardEllipsisRow() {
  return (
    <li className={styles.ellipsisRow} aria-hidden="true">
      ⋯
    </li>
  );
}
