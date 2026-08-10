import type { Metadata } from 'next';
import LeaderboardScreen from './LeaderboardScreen';
import styles from './leaderboard.module.css';

export const metadata: Metadata = {
  title: 'TOP 100 — 어깨빵 참교육',
  description: '어깨빵 참교육 글로벌 TOP 100 랭킹.',
};

export default function LeaderboardPage() {
  return (
    <main className={styles.page}>
      <LeaderboardScreen />
    </main>
  );
}
