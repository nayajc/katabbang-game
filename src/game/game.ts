import { audio } from './audio';
import { now } from './clock';
import { CounterWindow } from './counter';
import { Engine } from './engine';
import { Player } from './entities/player';
import { collides, Spawner, type Entity } from './entities/spawner';
import { Fx } from './fx';
import { attachInput } from './input';
import type { Grade } from './judge';
import { notePointerDown, pointerEventsWorking } from './pointer-health';
import { createRng } from './rng';
import { hitsLaneButton, hitsMuteButton, render, screenToVirtual } from './render';
import { loadSprites } from './sprites';
import { addDistance, applyCounter, applyHit, createScore, total, type Score } from './scoring';
import { StateMachine, type Phase } from './state';
import { TUNING } from './tuning';

/** Wall-clock duration of the lane button pressed highlight. */
const LANE_PRESS_MS = 130;

export type GameOverInfo = {
  score: number;
  distance: number;
  bestCombo: number;
  justice: number;
  seed: number;
};

export type GameOptions = {
  canvas: HTMLCanvasElement;
  seed?: number;
  onGameOver?: (info: GameOverInfo) => void;
  onPhase?: (phase: Phase) => void;
};

/** Snapshot handed to the renderer (and, later, to the FX layer). */
export type GameView = {
  phase: Phase;
  player: Player;
  entities: Entity[];
  score: Score;
  scrollY: number;
  /** Current world scroll speed (vu/s of simulated time); scales the run cycle. */
  speed: number;
  lastGrade: Grade | null;
  lastGain: number;
  /** 0..1 progress of the result banner, for pop/fade animation. */
  resultProgress: number;
  /** Wall-clock ms remaining until the counter window centre (may be negative). */
  counterLeadMs: number;
  /** Particles / shake / comic text, already advanced for this frame. */
  fx: Fx;
  /** Drives the on-canvas mute button glyph. */
  muted: boolean;
  /** Lane button showing its pressed highlight this frame, if any. */
  lanePressed: -1 | 1 | null;
};

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: Engine;
  private sm: StateMachine;
  private player = new Player();
  private spawner: Spawner;
  private counter = new CounterWindow();
  private entities: Entity[] = [];
  private score = createScore();
  private seed: number;
  private speed: number = TUNING.BASE_SPEED;
  private scrollY = 0;
  private lastGrade: Grade | null = null;
  private lastGain = 0;
  private resultStart = 0;
  private hitstopUntil = 0;
  private detachInput: () => void;
  private detachButtons: () => void;
  private onGameOver?: (info: GameOverInfo) => void;
  private fx = new Fx();
  private lastFxTs = 0;
  private lanePressDir: -1 | 1 | null = null;
  private lanePressUntil = 0;

  constructor(opts: GameOptions) {
    this.canvas = opts.canvas;
    const ctx = opts.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.seed = opts.seed ?? (Date.now() & 0xffffffff) >>> 0;
    this.spawner = new Spawner(createRng(this.seed));
    this.onGameOver = opts.onGameOver;
    this.sm = new StateMachine((phase) => opts.onPhase?.(phase));
    this.engine = new Engine({
      update: (dt) => this.update(dt),
      render: (ts) => this.draw(ts),
      timescale: () => this.timescale(),
    });
    loadSprites();
    const detachUnlock = audio.unlockOnGesture();

    // Registered BEFORE attachInput so a tap on the mute or lane buttons can
    // swallow the event (same-target listeners fire in registration order).
    /** @returns true when the press landed on a canvas button and was consumed. */
    const tryButtonTap = (clientX: number, clientY: number): boolean => {
      const { x, y } = screenToVirtual(this.canvas, clientX, clientY);
      if (hitsMuteButton(x, y)) {
        audio.toggleMute();
        return true;
      }
      if (!this.sm.is('running', 'slowmo')) return false;
      const dir = hitsLaneButton(x, y);
      if (dir === null) return false;
      this.lanePressDir = dir;
      this.lanePressUntil = now() + LANE_PRESS_MS;
      this.onLane(dir);
      return true;
    };

    const onButtonTap = (e: PointerEvent) => {
      notePointerDown(e.timeStamp);
      if (!tryButtonTap(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Touch fallback for browsers that never deliver pointerdown. Registered
    // before attachInput's own touch listeners so it can swallow the gesture.
    const onButtonTouch = (e: TouchEvent) => {
      if (pointerEventsWorking(e.timeStamp)) return;
      const t = e.changedTouches[0];
      if (!t) return;
      if (!tryButtonTap(t.clientX, t.clientY)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    this.canvas.addEventListener('pointerdown', onButtonTap, { passive: false });
    this.canvas.addEventListener('touchstart', onButtonTouch as EventListener, { passive: false });
    this.detachButtons = () => {
      this.canvas.removeEventListener('pointerdown', onButtonTap);
      this.canvas.removeEventListener('touchstart', onButtonTouch as EventListener);
      detachUnlock();
    };

    this.detachInput = attachInput(this.canvas, {
      onLane: (dir) => this.onLane(dir),
      onCounter: (ts) => this.onCounter(ts),
    });
  }

  get phase(): Phase {
    return this.sm.phase;
  }

  start(): void {
    this.engine.start();
  }

  destroy(): void {
    this.engine.stop();
    this.detachInput();
    this.detachButtons();
  }

  /** title/gameover -> running. Also used by the "다시 하기" button. */
  startRun(seed = (Date.now() & 0xffffffff) >>> 0): void {
    this.seed = seed >>> 0;
    this.spawner.reset(createRng(this.seed));
    this.entities = [];
    this.score = createScore();
    this.player.reset();
    this.counter.clear();
    this.speed = TUNING.BASE_SPEED;
    this.scrollY = 0;
    this.lastGrade = null;
    this.lastGain = 0;
    this.fx.reset();
    this.canvas.dataset.playerLane = String(this.player.lane);
    this.sm.set('running');
  }

  /** Screen tap on title/gameover, or the counter input while a window is armed. */
  private onCounter(ts: number): void {
    if (this.sm.is('title', 'gameover')) {
      this.startRun();
      return;
    }
    if (!this.sm.is('slowmo') || !this.counter.active) return;
    const grade = this.counter.submit(ts);
    if (grade) this.resolveCounter(grade);
  }

  private onLane(dir: -1 | 1): void {
    if (!this.sm.is('running', 'slowmo')) return;
    this.player.move(dir);
    this.canvas.dataset.playerLane = String(this.player.lane);
  }

  private timescale(): number {
    switch (this.sm.phase) {
      case 'running':
        return 1;
      case 'slowmo':
        return TUNING.SLOWMO_TIMESCALE;
      case 'result':
        return now() < this.hitstopUntil ? 0 : 0.35;
      default:
        return 0;
    }
  }

  private resolveCounter(grade: Grade): void {
    const target = this.counter.target;
    const comboBefore = this.score.combo;
    this.lastGrade = grade;
    this.lastGain = applyCounter(this.score, grade);
    const fxX = target?.x ?? this.player.x;
    const fxY = target?.y ?? this.player.y;
    if (target) {
      if (grade === 'miss') {
        target.dead = true;
      } else {
        // Knockback parabola + rotation; integrated in `update`, drawn by render.ts.
        target.knockback = { vx: (target.x < this.player.x ? -1 : 1) * 900, vy: -1100, rot: 0 };
      }
    }
    if (grade === 'miss') {
      this.fx.counterMiss(fxX, fxY);
      audio.play('miss');
    } else {
      const dir: -1 | 1 = target && target.x < this.player.x ? -1 : 1;
      this.fx.counterHit(fxX, fxY, grade === 'perfect', dir);
      audio.play(grade);
      if (this.score.combo > comboBefore && this.score.combo >= 2) {
        this.fx.comboUp(this.score.combo, TUNING.VIRTUAL_W / 2, TUNING.VIRTUAL_H * 0.24);
        audio.play('combo');
      }
    }
    this.counter.clear();
    this.hitstopUntil = now() + (grade === 'miss' ? 0 : TUNING.HITSTOP_MS);
    this.resultStart = now();
    this.sm.set('result');
    if (this.score.hp <= 0) this.gameOver();
  }

  private gameOver(): void {
    this.sm.set('gameover');
    this.fx.gameOver(this.player.x, this.player.y);
    audio.play('gameover');
    this.onGameOver?.({
      score: total(this.score),
      distance: Math.floor(this.score.distance),
      bestCombo: this.score.bestCombo,
      justice: this.score.justice,
      seed: this.seed,
    });
  }

  private update(dt: number): void {
    if (this.sm.is('title', 'gameover')) return;

    if (this.sm.is('result') && now() - this.resultStart >= TUNING.RESULT_MS) {
      this.lastGrade = null;
      this.sm.set('running');
    }

    const secs = dt / 1000;
    this.speed = Math.min(TUNING.MAX_SPEED, this.speed + TUNING.SPEED_PER_SEC * secs);
    const advance = this.speed * secs;
    this.scrollY += advance;
    addDistance(this.score, advance);

    for (const e of this.entities) {
      if (e.knockback) {
        e.knockback.vy += 2600 * secs;
        e.x += e.knockback.vx * secs;
        e.y += e.knockback.vy * secs;
        e.knockback.rot += 12 * secs;
        if (e.y < -400 || e.x < -300 || e.x > TUNING.VIRTUAL_W + 300) e.dead = true;
        continue;
      }
      e.y += advance;
      if (e.y > TUNING.VIRTUAL_H + TUNING.ENTITY_R * 2) e.dead = true;
    }

    if (this.sm.is('running')) {
      const hasBumper = this.entities.some((e) => e.kind === 'bumper' && !e.dead && !e.knockback);
      for (const e of this.spawner.update(dt, hasBumper)) this.entities.push(e);
    }

    this.checkCollisions();
    this.checkBumperEngage();

    if (this.counter.isExpired(now())) this.resolveCounter(this.counter.expire());

    this.entities = this.entities.filter((e) => !e.dead);
  }

  private checkCollisions(): void {
    for (const e of this.entities) {
      if (e.dead || e.knockback || e.engaged) continue;
      if (e.kind === 'bumper') continue;
      if (!collides(e, this.player.x, this.player.y)) continue;
      e.dead = true;
      applyHit(this.score);
      this.fx.collision(e.x, e.y);
      audio.play('collision');
      this.lastGrade = null;
      if (this.score.hp <= 0) {
        this.gameOver();
        return;
      }
    }
  }

  private checkBumperEngage(): void {
    if (!this.sm.is('running') || this.counter.active) return;
    for (const e of this.entities) {
      if (e.kind !== 'bumper' || e.dead || e.engaged || e.knockback) continue;
      if (e.lane !== this.player.lane) continue;
      const gap = this.player.y - e.y;
      if (gap <= 0 || gap > TUNING.SLOWMO_TRIGGER_DIST) continue;
      e.engaged = true;
      const simMsToImpact = (gap / this.speed) * 1000;
      this.counter.arm(e, simMsToImpact, now());
      this.sm.set('slowmo');
      return;
    }
  }

  private draw(wallTs: number): void {
    // FX run on the wall clock so they keep moving through slowmo and hitstop.
    const dt = this.lastFxTs === 0 ? 16 : Math.min(TUNING.MAX_DELTA, wallTs - this.lastFxTs);
    this.lastFxTs = wallTs;
    this.fx.update(dt, this.sm.is('slowmo'));

    const view: GameView = {
      phase: this.sm.phase,
      player: this.player,
      entities: this.entities,
      score: this.score,
      scrollY: this.scrollY,
      speed: this.speed,
      lastGrade: this.lastGrade,
      lastGain: this.lastGain,
      resultProgress: this.sm.is('result')
        ? Math.min(1, (wallTs - this.resultStart) / TUNING.RESULT_MS)
        : 0,
      counterLeadMs: this.counter.active ? this.counter.windowCenterTs - wallTs : 0,
      fx: this.fx,
      muted: audio.muted,
      lanePressed: wallTs < this.lanePressUntil ? this.lanePressDir : null,
    };
    render(this.ctx, this.canvas, view);
  }
}
