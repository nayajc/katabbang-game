'use client';

import dynamic from 'next/dynamic';

// ssr:false — GameCanvas touches window/canvas; keep it out of the server render.
const GameCanvas = dynamic(() => import('./play/GameCanvas'), {
  ssr: false,
  loading: () => <div style={{ color: '#aab', padding: 24 }} />,
});

export default function Home() {
  return <GameCanvas />;
}
