'use client';

import dynamic from 'next/dynamic';

// ssr:false — the game touches window/canvas/AudioContext at module scope time.
const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <div style={{ color: '#aab', padding: 24 }} />,
});

export default function PlayPage() {
  return <GameCanvas />;
}
