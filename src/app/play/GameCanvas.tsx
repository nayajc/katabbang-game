'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type GameOverInfo } from '@/game/game';
import { audio } from '@/game/audio';
import { notePointerDown } from '@/game/pointer-health';
import type { Phase } from '@/game/state';
import { ThreeRenderer } from '@/game3d/renderer';
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
  const stageRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  // Phase drives only the React overlays (title / game over / controls) —
  // never the per-frame HUD, which the renderer writes imperatively.
  const [phase, setPhase] = useState<Phase>('title');
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState<GameOverInfo | null>(null);
  const s = useStrings();

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const renderer = new ThreeRenderer(canvas, {
      debug: new URLSearchParams(window.location.search).get('debug') === '1',
      hudRoot: stage,
    });

    const game = new Game({
      canvas,
      renderer,
      debug: new URLSearchParams(window.location.search).get('debug') === '1',
      onPhase: setPhase,
      onGameOver: (info) => {
        setResult(info);
        onGameOverRef.current?.(info);
      },
    });
    gameRef.current = game;
    game.start();

    // The drawing buffer MUST track the CSS box or the perspective stretches.
    // On iOS the 100dvh box changes as the browser chrome collapses without a
    // reliable window 'resize', hence the observer + visualViewport listeners.
    const resize = () => renderer.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', resize);
    vv?.addEventListener('scroll', resize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      vv?.removeEventListener('resize', resize);
      vv?.removeEventListener('scroll', resize);
      // Game.destroy() also disposes the renderer it was given.
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

  /**
   * The lane and mute controls are real DOM buttons layered over the canvas, so
   * their press never reaches the canvas input listeners — a lane tap can never
   * be read as a counter tap.
   *
   * They act on `pointerdown` (press time, like every other input in the game)
   * and fall back to `click` only on browsers that never deliver pointer events.
   *
   * REGRESSION FIXED HERE: the fallback used to be gated on the 50ms
   * `pointer-health` window, which is the wrong question to ask of a `click`.
   * `click` is dispatched at RELEASE, so any press held longer than 50ms — i.e.
   * every real human press, ~80-150ms — fell outside the window, the fallback
   * decided pointer events were "silent", and the button fired TWICE: two lanes
   * per press. Synthetic presses (Playwright click/tap, <50ms) stayed inside the
   * window, which is why the e2e suite never saw it.
   *
   * The correct question is per-gesture, not per-window: did THIS element
   * already consume a pointerdown for the gesture this click belongs to? The
   * ref below answers it exactly, for any press duration, and still leaves the
   * fallback live on a browser that never delivers pointerdown at all.
   */
  const pointerConsumedBy = useRef<EventTarget | null>(null);

  /** True when this click is the tail of a pointerdown we already acted on. */
  const clickIsDuplicate = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (pointerConsumedBy.current !== e.currentTarget) return false;
    pointerConsumedBy.current = null;
    return true;
  }, []);

  /** A gesture that ends in `pointercancel` never produces a click; re-arm. */
  const onPointerCancel = useCallback(() => {
    pointerConsumedBy.current = null;
  }, []);

  /**
   * Belt-and-braces against a control button holding keyboard focus.
   *
   * A focused <button> natively activates on Space, which would make the
   * desktop counter key move a lane / toggle mute instead of striking. Two
   * things already stop that today, and both were verified end-to-end in
   * Chromium AND WebKit: `onPointerDown` calls `preventDefault()`, which
   * suppresses the compat mousedown that would focus the button in the first
   * place; and the window `keydown` handler in `input.ts` calls
   * `preventDefault()`, which cancels the button's activation behaviour even
   * when focus IS forced onto it.
   *
   * Both of those are load-bearing side effects of code written for other
   * reasons, so the focus is also dropped explicitly here — it costs nothing
   * and it makes the guarantee local to the control.
   */
  const dropFocus = useCallback((e: { currentTarget: HTMLButtonElement }) => {
    e.currentTarget.blur();
  }, []);

  const laneOf = (el: HTMLElement): -1 | 1 => (el.dataset.dir === '1' ? 1 : -1);

  const onLanePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    notePointerDown(e.timeStamp);
    e.preventDefault();
    pointerConsumedBy.current = e.currentTarget;
    dropFocus(e);
    gameRef.current?.laneTap(laneOf(e.currentTarget));
  }, [dropFocus]);

  const onLaneClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      dropFocus(e);
      if (clickIsDuplicate(e)) return;
      gameRef.current?.laneTap(laneOf(e.currentTarget));
    },
    [clickIsDuplicate, dropFocus],
  );

  const toggleMute = useCallback(() => {
    audio.toggleMute();
    setMuted(audio.muted);
  }, []);

  const onMutePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      notePointerDown(e.timeStamp);
      e.preventDefault();
      pointerConsumedBy.current = e.currentTarget;
      dropFocus(e);
      toggleMute();
    },
    [dropFocus, toggleMute],
  );

  const onMuteClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      dropFocus(e);
      if (clickIsDuplicate(e)) return;
      toggleMute();
    },
    [clickIsDuplicate, dropFocus, toggleMute],
  );

  const controlsVisible = phase === 'running' || phase === 'slowmo' || phase === 'result';

  return (
    <div className={styles.stage} data-phase={phase} ref={stageRef}>
      <canvas ref={canvasRef} className={styles.canvas} data-testid="game-canvas" />

      <button
        type="button"
        className={styles.muteButton}
        aria-label={s.muteHint}
        data-testid="mute-button"
        data-muted={muted ? '1' : '0'}
        onPointerDown={onMutePointerDown}
        onPointerCancel={onPointerCancel}
        onClick={onMuteClick}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {controlsVisible && (
        <>
          <button
            type="button"
            className={`${styles.laneButton} ${styles.laneLeft}`}
            aria-label="lane left"
            data-testid="lane-left"
            data-dir="-1"
            // Arrow keys already cover lanes, so these are pointer-only
            // controls; keeping them out of the tab order means Space can
            // never reach them.
            tabIndex={-1}
            onPointerDown={onLanePointerDown}
            onPointerCancel={onPointerCancel}
            onClick={onLaneClick}
          >
            ◀
          </button>
          <button
            type="button"
            className={`${styles.laneButton} ${styles.laneRight}`}
            aria-label="lane right"
            data-testid="lane-right"
            data-dir="1"
            tabIndex={-1}
            onPointerDown={onLanePointerDown}
            onPointerCancel={onPointerCancel}
            onClick={onLaneClick}
          >
            ▶
          </button>
        </>
      )}

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
