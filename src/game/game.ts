import { audio } from './audio';
import { now } from './clock';
import { CounterWindow, simMsToTravel } from './counter';
import { Engine } from './engine';
import { Player } from './entities/player';
import { collides, Spawner, type Entity } from './entities/spawner';
import { Fx } from './fx';
import { attachInput } from './input';
import type { Grade } from './judge';
import { createRng } from './rng';
import { addDistance, applyCounter, applyHit, createScore, total, type Score } from './scoring';
import { StateMachine, type Phase } from './state';
import { TUNING } from './tuning';

/**
 * Presentation port. `Game` owns simulation only; everything visual is behind
 * this interface, so the renderer can be swapped (2D canvas -> Three.js) with
 * no gameplay change. `render` is called once per animation frame with the
 * frame's {@link GameView}.
 */
export interface GameRenderer {
  render(view: GameView): void;
  dispose(): void;
}

export type GameOverInfo = {
  score: number;
  distance: number;
  bestCombo: number;
  justice: number;
  seed: number;
};

export type GameOptions = {
  canvas: HTMLCanvasElement;
  /** Presentation. Omitted in headless tests, where nothing is drawn. */
  renderer?: GameRenderer;
  seed?: number;
  /** ?debug=1 only: mirror per-frame counter timing onto the stage dataset. */
  debug?: boolean;
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
  /** 1 -> 0 over HIT_FLASH_MS after an hp loss; drives the red flash + hp flash. */
  hitFlash: number;
  /** Sprite alpha for the i-frame blink (1 when not invulnerable). */
  playerAlpha: number;
  /**
   * WHIFF reaction progress: 0..1 across {@link TUNING.WHIFF_MS} while the
   * player's light jab plays, and >= 1 (or -Infinity before the first one) when
   * it is not. Presentation only — nothing in the simulation reads it.
   */
  whiffProgress: number;
};

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: GameRenderer | null;
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
  private detachUnlock: () => void;
  private onGameOver?: (info: GameOverInfo) => void;
  private fx = new Fx();
  private lastFxTs = 0;
  private debug: boolean;
  /** Wall-clock end of the invulnerability window (post-hit OR post-counter). */
  private invulnUntil = 0;
  /**
   * Whether the running invulnerability should blink the sprite. True for the
   * post-hit i-frames (the blink is the feedback that a hit landed), false for
   * the silent post-counter grace, which must not read as damage.
   */
  private invulnBlink = false;
  /** Wall-clock start of the red hit flash. */
  private hitFlashStart = -Infinity;
  /** Wall-clock start of the current whiff jab (presentation only). */
  private whiffStart = -Infinity;
  /** Wall-clock time the last whiff caption + swish were emitted. */
  private lastWhiffFxTs = -Infinity;

  constructor(opts: GameOptions) {
    this.canvas = opts.canvas;
    this.renderer = opts.renderer ?? null;
    this.debug = opts.debug ?? false;
    this.seed = opts.seed ?? (Date.now() & 0xffffffff) >>> 0;
    this.spawner = new Spawner(createRng(this.seed));
    this.onGameOver = opts.onGameOver;
    this.sm = new StateMachine((phase) => opts.onPhase?.(phase));
    this.engine = new Engine({
      update: (dt) => this.update(dt),
      render: (ts) => this.draw(ts),
      timescale: () => this.timescale(),
    });
    this.detachUnlock = audio.unlockOnGesture();
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
    this.detachUnlock();
    this.renderer?.dispose();
    this.renderer = null;
  }

  /**
   * Lane command from a DOM control (the ◀ / ▶ thumb buttons).
   *
   * Those buttons are real elements layered over the canvas, so their press
   * never reaches the canvas listeners — a lane tap can therefore never be
   * mistaken for a counter tap, which is the guarantee the old canvas-space
   * hit test had to enforce by swallowing the event.
   */
  laneTap(dir: -1 | 1): void {
    this.onLane(dir);
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
    this.invulnUntil = 0;
    this.invulnBlink = false;
    this.hitFlashStart = -Infinity;
    this.whiffStart = -Infinity;
    this.lastWhiffFxTs = -Infinity;
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
    if (!this.sm.is('slowmo') || !this.counter.active) {
      this.noteWhiff();
      return;
    }
    const deltaMs = ts - this.counter.windowCenterTs;
    const grade = this.counter.submit(ts);
    if (grade) {
      this.noteJudge(grade, deltaMs);
      this.resolveCounter(grade);
    }
  }

  /**
   * The counter input pressed with NO window armed — a whiffed swing.
   *
   * Purely a reaction: the player throws a light jab, a swish plays, and a tiny
   * caption pops. Nothing here touches hp, score, the counter, the state machine
   * or any cooldown, so pressing the input off-beat stays free — it just stops
   * being silent, which is what made desktop players report Space as dead.
   *
   * The animation restarts on every press (mashing looks like fast jabs), while
   * the caption and the sound are rate-limited to one per WHIFF_MS.
   */
  private noteWhiff(): void {
    const t = now();
    this.whiffStart = t;
    // Diagnostics, same contract as `data-last-judge`: a per-PRESS attribute
    // write (not per-frame), so it is free and always on. It counts every
    // whiffed press, NOT every reaction, because its job is to prove end-to-end
    // that the counter key reached the game at all.
    const stage = this.canvas.closest<HTMLElement>('[data-phase]') ?? this.canvas;
    stage.dataset.whiffs = String(Number(stage.dataset.whiffs ?? 0) + 1);
    if (t - this.lastWhiffFxTs < TUNING.WHIFF_MS) return;
    this.lastWhiffFxTs = t;
    this.fx.whiff(this.player.x, this.player.y);
    audio.play('whiff');
  }

  private onLane(dir: -1 | 1): void {
    if (!this.sm.is('running', 'slowmo')) return;
    this.player.move(dir);
    this.canvas.dataset.playerLane = String(this.player.lane);
  }

  /** True while post-hit i-frames are running (collisions and engages ignored). */
  private get invulnerable(): boolean {
    return now() < this.invulnUntil;
  }

  /**
   * Shared reaction to ANY hp loss: i-frames, red flash, comic text and a
   * heavier shake. Without the i-frames a single mistake chains 3 hp -> 0
   * inside a few frames, which reads to the player as "the controls did nothing".
   */
  private noteHpLoss(x: number, y: number): void {
    this.invulnUntil = now() + TUNING.IFRAME_MS;
    this.invulnBlink = true;
    this.hitFlashStart = now();
    this.fx.hurt(x, y);
  }

  /**
   * Breathing room after a SUCCESSFUL counter: the uppercut leaves the player
   * planted in the lane they just fought in, so anything already close behind
   * the bumper would be an unavoidable hit. Same i-frame mechanism as a hp loss
   * (collisions ignored, no new window arms) but silent — no flash, no blink.
   */
  private noteCounterGrace(): void {
    const until = now() + TUNING.COUNTER_GRACE_MS;
    if (until <= this.invulnUntil) return;
    this.invulnUntil = until;
    this.invulnBlink = false;
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

  /**
   * Publishes the last timing judgement as `data-last-judge="grade:deltaMs"` on
   * the stage element (negative = early). Diagnostics only — never gameplay.
   */
  private noteJudge(grade: Grade, deltaMs: number): void {
    const rounded = Math.round(deltaMs);
    const stage = this.canvas.closest<HTMLElement>('[data-phase]') ?? this.canvas;
    stage.dataset.lastJudge = `${grade}:${rounded >= 0 ? '+' : ''}${rounded}`;
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
        target.knockback = {
          vx: (target.x < this.player.x ? -1 : 1) * 900,
          vy: -1100,
          rot: 0,
          y0: target.y,
        };
      }
    }
    if (grade === 'miss') {
      this.fx.counterMiss(fxX, fxY);
      audio.play('miss');
      // A whiffed / expired window costs hp, so it grants i-frames exactly like
      // a pedestrian collision — including when the window simply timed out.
      this.noteHpLoss(this.player.x, this.player.y);
    } else {
      const dir: -1 | 1 = target && target.x < this.player.x ? -1 : 1;
      this.noteCounterGrace();
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

    this.player.update(dt);

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
      for (const e of this.spawner.update(dt, hasBumper, this.speed)) this.entities.push(e);
    }

    this.checkCollisions();
    this.checkBumperEngage();

    if (this.counter.isExpired(now())) {
      this.noteJudge('miss', now() - this.counter.windowCenterTs);
      this.resolveCounter(this.counter.expire());
    }

    this.entities = this.entities.filter((e) => !e.dead);
  }

  private checkCollisions(): void {
    if (this.invulnerable) return;
    for (const e of this.entities) {
      if (e.dead || e.knockback || e.engaged) continue;
      if (e.kind === 'bumper') continue;
      // Collision uses the TARGET lane centre, not the tweened visual x, so a
      // lane change dodges on the input frame rather than 120ms later.
      if (!collides(e, this.player.laneX, this.player.y)) continue;
      e.dead = true;
      applyHit(this.score);
      this.noteHpLoss(e.x, e.y);
      audio.play('collision');
      this.lastGrade = null;
      if (this.score.hp <= 0) {
        this.gameOver();
        return;
      }
    }
  }

  private checkBumperEngage(): void {
    if (!this.sm.is('running') || this.counter.active || this.invulnerable) return;
    for (const e of this.entities) {
      if (e.kind !== 'bumper' || e.dead || e.engaged || e.knockback) continue;
      if (e.lane !== this.player.lane) continue;
      const gap = this.player.y - e.y;
      if (gap <= 0 || gap > TUNING.SLOWMO_TRIGGER_DIST) continue;
      // Impact is when the bodies TOUCH (gap === COUNTER_IMPACT_GAP), which is
      // what the player sees — not when the sprites fully overlap (gap === 0).
      const travel = gap - TUNING.COUNTER_IMPACT_GAP;
      if (travel <= 0) continue;
      e.engaged = true;
      const simMsToImpact = simMsToTravel(travel, this.speed);
      this.counter.arm(e, simMsToImpact, now(), this.engine.pendingSimMs);
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
      hitFlash: Math.max(0, 1 - (wallTs - this.hitFlashStart) / TUNING.HIT_FLASH_MS),
      playerAlpha:
        this.invulnBlink && wallTs < this.invulnUntil
          ? Math.floor(wallTs / TUNING.IFRAME_BLINK_MS) % 2 === 0
            ? 1
            : 0.3
          : 1,
      whiffProgress: (wallTs - this.whiffStart) / TUNING.WHIFF_MS,
    };
    // Diagnostics only, and only under ?debug=1 — a per-frame dataset write is
    // an attribute mutation the normal render path must never pay for.
    if (this.debug) {
      const stage = this.canvas.closest<HTMLElement>('[data-phase]') ?? this.canvas;
      stage.dataset.counterLead = this.counter.active
        ? String(Math.round(view.counterLeadMs))
        : '-';
    }

    this.renderer?.render(view);
  }
}
