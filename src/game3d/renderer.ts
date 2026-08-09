import * as THREE from 'three';
import { bumperPose, createPose, pedestrianPose, playerCounterPose, playerRunPose } from '@/game/anim';
import type { GameRenderer, GameView } from '@/game/game';
import { TUNING } from '@/game/tuning';
import { CharacterPool, pedestrianVariant, type ActorKind } from './characters';
import { toWorldHeight, toWorldX, toWorldZ, WORLD_PER_VU } from './coords';
import { ComicView, CounterRingView, ParticleView } from './effects';
import { DomHud } from './hud';
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
  private readonly hud: DomHud;
  private readonly target = new THREE.Vector3();
  private canvasH = 0;

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
    this.characters.player.humanoid.root.rotation.y = Math.PI;
    this.particles = new ParticleView(this.scene);
    this.comic = new ComicView(this.scene);
    this.ring = new CounterRingView(this.scene);
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
    this.world.update(view.scrollY);
    this.updateCamera(view);
    this.updatePlayer(view);
    this.updateEntities(view);
    this.particles.update(view.fx);
    this.comic.update(view.fx);
    this.hud.update(view);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(view: GameView): void {
    const fx = view.fx;
    const shakeX = fx.shake.offsetX() * SHAKE_SCALE;
    const shakeY = fx.shake.offsetY() * SHAKE_SCALE;
    // Slowmo pushes in and narrows the lens — the 2D zoom, re-expressed in 3D.
    const push = fx.slowmo;
    this.camera.position.set(CAM.x + shakeX, CAM.y - shakeY, CAM.z - 0.75 * push);
    const fov = FOV - 6 * push;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.particles.setProjection(this.canvasH, THREE.MathUtils.degToRad(fov));
    }
    this.target.set(LOOK.x + shakeX, LOOK.y - shakeY, LOOK.z);
    this.camera.lookAt(this.target);
  }

  private updatePlayer(view: GameView): void {
    const p = view.player;
    const actor = this.characters.player;
    const countering =
      view.phase === 'slowmo' || (view.phase === 'result' && view.lastGrade !== null);

    actor.humanoid.root.position.set(toWorldX(p.x), 0, 0);
    if (countering) {
      actor.humanoid.plant(0.28);
      actor.humanoid.applyPose(playerCounterPose(POSE, view.fx.slowmo), p.lean, -1);
    } else {
      actor.humanoid.stride(view.scrollY, 0);
      actor.humanoid.applyPose(playerRunPose(POSE, view.scrollY, view.speed), p.lean, -1);
    }
    actor.humanoid.setOpacity(view.playerAlpha);
    actor.shadow.position.set(toWorldX(p.x), 0.015, 0);
  }

  private updateEntities(view: GameView): void {
    this.characters.beginFrame();
    this.ring.hide();

    for (const e of view.entities) {
      if (e.dead) continue;
      const isBumper = e.kind === 'bumper';
      const kind: ActorKind = isBumper ? 'bumper' : (`ped${pedestrianVariant(e.id)}` as ActorKind);
      const actor = this.characters.acquire(e.id, kind);
      const h = actor.humanoid;
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
        h.stride(view.scrollY, e.id, 1.45);
        h.applyPose(bumperPose(POSE, e.id, view.scrollY, view.player.y - e.y));
        if (e.engaged && view.phase === 'slowmo') this.ring.show(x, z, view.counterLeadMs);
      } else {
        h.stride(view.scrollY, e.id, 1.25 + (Math.abs(e.id) % 5) * 0.09);
        h.applyPose(pedestrianPose(POSE, e.id, view.scrollY));
      }
    }

    this.characters.endFrame();
  }

  dispose(): void {
    this.hud.dispose();
    this.ring.dispose();
    this.comic.dispose();
    this.particles.dispose();
    this.characters.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
