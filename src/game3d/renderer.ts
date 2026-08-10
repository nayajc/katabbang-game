import * as THREE from 'three';
import { bumperPose, createPose, pedestrianPose, playerCounterPose, playerRunPose } from '@/game/anim';
import type { GameRenderer, GameView } from '@/game/game';
import type { Grade } from '@/game/judge';
import { TUNING } from '@/game/tuning';
import { getStrings } from '@/lib/i18n';
import { CharacterPool, pedestrianVariant, type ActorKind } from './characters';
import { toWorldHeight, toWorldX, toWorldZ, WORLD_PER_VU } from './coords';
import { ComicView, CounterRingView, ImpactView, ParticleView } from './effects';
import { DomHud } from './hud';
import { UPPERCUT_MS } from './rig';
import { FOG_COLOR, World } from './world';

/**
 * Three.js presentation layer — a Temple Run-style chase camera behind and
 * above the player, looking down a 3-lane road that recedes into fog.
 *
 * It implements {@link GameRenderer}, i.e. it is a pure function of the
 * per-frame {@link GameView}. It holds no simulation state of its own: lanes,
 * distances, timings and FX all still come from the unchanged game modules.
 */

const FOV = 55;
/** Chase camera: behind and above the player, looking down the road. */
const CAM = { x: 0, y: 3.15, z: 6.3 } as const;
const LOOK = { x: 0, y: 1.1, z: -5 } as const;
/** Screen shake is authored in virtual units; damp it for a camera. */
const SHAKE_SCALE = WORLD_PER_VU * 0.55;

/**
 * Lane tracking. A portrait phone is only ~34° wide at this FOV, which puts the
 * outer lanes (world X ±2) EXACTLY on the frustum edge — the character was cut
 * in half at the screen border. Rather than squeezing the lanes together or
 * widening the lens (both of which flatten the road), the camera drifts after
 * the player the way Temple Run's does: a dead zone around the centre so small
 * corrections read as nothing, a fraction of the offset so a lane change still
 * FEELS like moving sideways, and a lag so the drift never snaps.
 */
const FOLLOW = {
  /** World units of player offset the camera ignores entirely. */
  deadZone: 0.35,
  /** Fraction of the remaining offset the camera takes up. */
  ratio: 0.62,
  /** Exponential smoothing time constant, in wall-clock ms. */
  tauMs: 150,
} as const;

/** Where the counter impact happens, relative to the player, in world units. */
const IMPACT = {
  z: -TUNING.COUNTER_IMPACT_GAP * WORLD_PER_VU,
  bubbleOffsetX: 0.95,
} as const;

/**
 * Where the villain's swagger starts, as a gap in virtual units. It ramps from
 * nothing here to FULL at `SLOWMO_TRIGGER_DIST` — so the strut peaks exactly as
 * the counter window opens and the wind-up takes the rig over.
 */
const SWAGGER_START_VU = TUNING.SLOWMO_TRIGGER_DIST * 3;
const SWAGGER_SPAN_VU = SWAGGER_START_VU - TUNING.SLOWMO_TRIGGER_DIST;

const POSE = createPose();

export type ThreeRendererOptions = {
  /**
   * ?debug=1 only. Keeps the drawing buffer readable so an automated test can
   * sample pixels; it costs bandwidth on mobile, so it stays off by default.
   */
  debug?: boolean;
  /** Element the DOM HUD is mounted into (the stage). */
  hudRoot: HTMLElement;
};

export class ThreeRenderer implements GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: World;
  private readonly characters: CharacterPool;
  private readonly particles: ParticleView;
  private readonly comic: ComicView;
  private readonly ring: CounterRingView;
  private readonly impact: ImpactView;
  private readonly hud: DomHud;
  private readonly target = new THREE.Vector3();
  private canvasH = 0;
  /** Smoothed camera X — see {@link FOLLOW}. */
  private followX = 0;
  private lastMs = 0;
  /** Rising-edge detector for "a counter just resolved". */
  private prevGrade: Grade | null = null;
  private uppercutStart = -Infinity;

  constructor(canvas: HTMLCanvasElement, opts: ThreeRendererOptions) {
    const dpr = Math.min(TUNING.MAX_DPR, window.devicePixelRatio || 1);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // Flat-shaded low-poly aliases badly at 1x; at 2x the DPR does the work.
      antialias: dpr < 1.5,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.debug ?? false,
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setClearColor(FOG_COLOR);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 220);
    this.camera.position.set(CAM.x, CAM.y, CAM.z);
    this.camera.lookAt(LOOK.x, LOOK.y, LOOK.z);

    this.world = new World(this.scene);
    this.characters = new CharacterPool(this.scene);
    // The player is seen from behind: rotate it to face down the road.
    this.characters.player.setSpin(Math.PI);
    this.particles = new ParticleView(this.scene);
    this.comic = new ComicView(this.scene);
    this.ring = new CounterRingView(this.scene);
    this.impact = new ImpactView(this.scene);
    this.hud = new DomHud(opts.hudRoot);

    this.resize();
  }

  /** Matches the drawing buffer to the CSS box. Safe to call every frame. */
  resize(): void {
    const canvas = this.renderer.domElement;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    // updateStyle=false: the canvas is sized by CSS (100%/100%), and the
    // backing store follows via setPixelRatio — the DPR 2 cap still applies.
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.canvasH = canvas.height;
    this.particles.setProjection(this.canvasH, THREE.MathUtils.degToRad(this.camera.fov));
  }

  render(view: GameView): void {
    // FX and camera lag run on the wall clock, like every other effect, so they
    // keep moving through slowmo and hitstop.
    const nowMs = performance.now();
    const dt = this.lastMs === 0 ? 16 : Math.min(TUNING.MAX_DELTA, nowMs - this.lastMs);
    this.lastMs = nowMs;

    this.noteCounterResolved(view, nowMs);
    this.world.update(view.scrollY);
    this.updateCamera(view, dt);
    this.updatePlayer(view, nowMs);
    this.updateEntities(view);
    this.particles.update(view.fx);
    this.comic.update(view.fx);
    this.impact.update(nowMs, this.camera);
    this.hud.update(view);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Rising edge of `lastGrade` — the frame a counter landed. `Game` clears the
   * grade back to null when the result phase ends, so this fires exactly once
   * per counter without the simulation having to publish an event.
   */
  private noteCounterResolved(view: GameView, nowMs: number): void {
    const grade = view.lastGrade;
    const landed = grade !== null && grade !== 'miss' && this.prevGrade === null;
    this.prevGrade = grade;
    if (!landed) return;
    this.uppercutStart = nowMs;
    const s = getStrings();
    const perfect = grade === 'perfect';
    const px = toWorldX(view.player.x);
    // Push the balloon into whichever half of the road the player is NOT in, so
    // it never sits on top of the HUD's centred result banner.
    const side = px > 0.1 ? -1 : 1;
    this.impact.trigger(
      px,
      IMPACT.z,
      px + side * IMPACT.bubbleOffsetX,
      perfect ? s.fxPerfect : s.fxPow,
      perfect,
      nowMs,
    );
  }

  private updateCamera(view: GameView, dtMs: number): void {
    const fx = view.fx;
    const shakeX = fx.shake.offsetX() * SHAKE_SCALE;
    const shakeY = fx.shake.offsetY() * SHAKE_SCALE;

    // Lane tracking with a dead zone, damped so it lags the player slightly.
    const px = toWorldX(view.player.x);
    const beyond = Math.max(0, Math.abs(px) - FOLLOW.deadZone);
    const want = Math.sign(px) * beyond * FOLLOW.ratio;
    this.followX += (want - this.followX) * (1 - Math.exp(-dtMs / FOLLOW.tauMs));

    // Slowmo pushes in and narrows the lens — the 2D zoom, re-expressed in 3D.
    const push = fx.slowmo;
    this.camera.position.set(CAM.x + this.followX + shakeX, CAM.y - shakeY, CAM.z - 0.75 * push);
    const fov = FOV - 6 * push;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.particles.setProjection(this.canvasH, THREE.MathUtils.degToRad(fov));
    }
    this.target.set(LOOK.x + this.followX + shakeX, LOOK.y - shakeY, LOOK.z);
    this.camera.lookAt(this.target);
  }

  private updatePlayer(view: GameView, nowMs: number): void {
    const p = view.player;
    const actor = this.characters.player;
    const uppercut = (nowMs - this.uppercutStart) / UPPERCUT_MS;
    const countering =
      view.phase === 'slowmo' || (view.phase === 'result' && view.lastGrade !== null);

    actor.rig.root.position.set(toWorldX(p.x), 0, 0);
    if (uppercut >= 0 && uppercut < 1) {
      // 승룡권. Owns the whole rig for its 520ms, gait included.
      actor.rig.uppercut(uppercut, -1);
    } else if (view.whiffProgress >= 0 && view.whiffProgress < 1) {
      // Whiffed swing: the input was pressed with no window armed. Ranked below
      // the uppercut so a press during the result phase can never cut the
      // 승룡권 short, and above the run cycle so the jab is actually visible.
      actor.rig.jab(view.whiffProgress, -1);
    } else if (countering) {
      actor.rig.plant(0.28);
      actor.rig.applyPose(playerCounterPose(POSE, view.fx.slowmo), p.lean, -1);
    } else {
      actor.rig.stride(view.scrollY, 0);
      actor.rig.applyPose(playerRunPose(POSE, view.scrollY, view.speed), p.lean, -1);
    }
    actor.rig.setOpacity(view.playerAlpha);
    actor.shadow.position.set(toWorldX(p.x), 0.015, 0);
  }

  private updateEntities(view: GameView): void {
    this.characters.beginFrame();
    this.ring.hide();

    for (const e of view.entities) {
      if (e.dead) continue;
      const isBumper = e.kind === 'bumper';
      const kind: ActorKind = isBumper ? 'bumper' : pedestrianVariant(e.id);
      const actor = this.characters.acquire(e.id, kind);
      const spec = actor.spec;
      const h = actor.rig;
      const x = toWorldX(e.x);

      if (e.knockback) {
        // Parabolic launch: the sim integrates it in virtual units, and the 3D
        // reading is "y is height, y0 is depth" — so the body flies up and away
        // from the road instead of receding down it.
        const height = toWorldHeight(e.y, e.knockback.y0);
        const z = toWorldZ(e.knockback.y0);
        h.root.position.set(x, Math.max(0, height) + 0.55, z);
        h.tumble(e.knockback.rot);
        actor.shadow.visible = false;
        continue;
      }

      const z = toWorldZ(e.y);
      h.upright();
      h.root.position.set(x, 0, z);
      actor.shadow.visible = true;
      actor.shadow.position.set(x, 0.015, z);

      if (isBumper) {
        if (e.engaged && view.phase === 'slowmo') {
          // Rearing back for the 어깨빵. Driven off `counterLeadMs`, the same
          // wall-clock number the cue ring shrinks on, so the pose and the ring
          // tighten together and the player can read WHEN to counter.
          h.windUp(1 - THREE.MathUtils.clamp(view.counterLeadMs / TUNING.COUNTER_CUE_LEAD_MS, 0, 1));
          this.ring.show(x, z, view.counterLeadMs);
        } else {
          const gap = view.player.y - e.y;
          h.stride(view.scrollY, e.id, spec.strideMul);
          h.applyPose(bumperPose(POSE, e.id, view.scrollY, gap));
          // Mesh-only weave: `root` (the lane) is untouched, so nothing the
          // simulation reads moves — only the shadow follows the body across.
          const amp = (SWAGGER_START_VU - gap) / SWAGGER_SPAN_VU;
          const weave = h.swagger(view.scrollY, e.id, spec.strideMul, amp);
          actor.shadow.position.x = x + weave;
        }
      } else {
        // Same stride multiplier on both halves of the gait, or the bob drifts
        // out of phase with the legs.
        h.stride(view.scrollY, e.id, spec.strideMul);
        const pose = pedestrianPose(POSE, e.id, view.scrollY, spec.strideMul);
        pose.bob *= spec.bobMul;
        pose.sway *= spec.swayMul;
        h.applyPose(pose);
      }
    }

    this.characters.endFrame();
  }

  dispose(): void {
    this.hud.dispose();
    this.impact.dispose();
    this.ring.dispose();
    this.comic.dispose();
    this.particles.dispose();
    this.characters.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
