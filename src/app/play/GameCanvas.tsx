'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type GameOverInfo } from '@/game/game';
import type { Phase } from '@/game/state';
import { TUNING } from '@/game/tuning';
import LocaleToggle from '@/app/LocaleToggle';
import { useStrings } from '@/lib/useLocale';
import styles from './play.module.css';

// Loaded on demand: the panel pulls in the Firebase SDK, which must stay out of
// the /play first-load bundle.
const GameOverPanel = dynamic(() => import('./GameOverPanel'), {
  ssr: false,
  loading: () => <p className={styles.desc} />,
});

export type GameCanvasProps = {
  /**
   * LEADERBOARD INTEGRATION POINT — called once per run when HP hits 0.
   * The leaderboard worker hooks the nickname modal + Firestore write here.
   */
  onGameOver?: (info: GameOverInfo) => void;
};

export default function GameCanvas({ onGameOver }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  // Phase drives only the React overlays (title / game over) — never per-frame HUD.
  const [phase, setPhase] = useState<Phase>('title');
  const [result, setResult] = useState<GameOverInfo | null>(null);
  const s = useStrings();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(TUNING.MAX_DPR, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
    };
    resize();

    const game = new Game({
      canvas,
      debug: new URLSearchParams(window.location.search).get('debug') === '1',
      onPhase: setPhase,
      onGameOver: (info) => {
        setResult(info);
        onGameOverRef.current?.(info);
      },
    });
    gameRef.current = game;
    game.start();

    // The backing store MUST track the CSS box: render() derives the letterbox
    // from canvas.width/height while screenToVirtual() derives it from the
    // bounding rect, so any aspect drift moves the drawn buttons away from their
    // hit boxes. On iOS the 100dvh box changes as the browser chrome collapses
    // without a reliable window 'resize', hence the observer.
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    // iOS collapses/expands its toolbars without always firing a window resize
    // or an observable CSS box change; visualViewport is the reliable signal.
    const vv = window.visualViewport;
    vv?.addEventListener('resize', resize);
    vv?.addEventListener('scroll', resize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      vv?.removeEventListener('resize', resize);
      vv?.removeEventListener('scroll', resize);
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  // ?debug=1 — real-device diagnostics. Dynamically imported so it adds nothing
  // to the normal bundle, and it never touches gameplay input.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    let unmount: (() => void) | null = null;
    let cancelled = false;
    void import('./debugHud').then(({ mountDebugHud }) => {
      if (cancelled) return;
      unmount = mountDebugHud(canvas);
    });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);

  const startRun = useCallback(() => {
    setResult(null);
    gameRef.current?.startRun();
  }, []);

  return (
    <div className={styles.stage} data-phase={phase}>
      <canvas ref={canvasRef} className={styles.canvas} data-testid="game-canvas" />

      {phase === 'title' && (
        <div className={styles.overlay} data-testid="title-screen">
          <h1 className={styles.title} data-testid="title-heading">
            {s.title}
          </h1>
          <p className={styles.desc}>
            {s.hintLine1}
            <br />
            {s.hintLine2}
            <br />
            {s.muteHint}
          </p>
          <button type="button" className={styles.button} onClick={startRun} data-testid="start-button">
            {s.start}
          </button>
          <LocaleToggle />
        </div>
      )}

      {phase === 'gameover' && (
        <div className={styles.overlay} data-testid="gameover-screen">
          <h2 className={styles.title}>{s.gameOver}</h2>
          <p className={styles.score}>
            {result?.score ?? 0}
            {s.scoreSuffix}
          </p>
          <p className={styles.desc}>
            {s.bestComboLabel} {result?.bestCombo ?? 0} · {s.justiceLabel} {result?.justice ?? 0}
          </p>
          <button type="button" className={styles.button} onClick={startRun} data-testid="retry-button">
            {s.retry}
          </button>
          {/* LEADERBOARD INTEGRATION POINT: nickname modal + TOP 100 link mount here. */}
          {result && <GameOverPanel key={result.seed} result={result} />}
          <LocaleToggle />
        </div>
      )}
    </div>
  );
}
