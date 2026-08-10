'use client';

import Link from 'next/link';
import LocaleToggle from '@/app/LocaleToggle';
import { useStrings } from '@/lib/useLocale';
import LeaderboardList from './LeaderboardList';
import styles from './leaderboard.module.css';

/** Client shell for /leaderboard — the page itself stays server-rendered for metadata. */
export default function LeaderboardScreen() {
  const s = useStrings();
  return (
    <div className={styles.inner}>
      <h1 className={styles.heading}>{s.leaderboardHeading}</h1>
      <p className={styles.sub}>{s.leaderboardSub}</p>
      <LeaderboardList />
      <div className={styles.footer}>
        <Link href="/" className={styles.back}>
          {s.backToGame}
        </Link>
        <LocaleToggle />
      </div>
    </div>
  );
}
