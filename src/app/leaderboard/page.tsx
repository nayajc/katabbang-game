import type { Metadata } from 'next';
import Link from 'next/link';
import LeaderboardList from './LeaderboardList';
import styles from './leaderboard.module.css';

export const metadata: Metadata = {
  title: 'TOP 100 — 어깨빵 응징 러너',
  description: '어깨빵 응징 러너 글로벌 TOP 100 랭킹.',
};

export default function LeaderboardPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.heading}>TOP 100</h1>
        <p className={styles.sub}>어깨빵 응징 러너 글로벌 랭킹</p>
        <LeaderboardList />
        <Link href="/" className={styles.back}>
          ← 게임하러 가기
        </Link>
      </div>
    </main>
  );
}
