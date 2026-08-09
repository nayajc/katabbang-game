import * as THREE from 'three';
import { STRIDE_VU, type Pose } from '@/game/anim';
import { WORLD_PER_VU } from './coords';

/**
 * Procedural low-poly humanoid with a coded run cycle.
 *
 * No glTF / no skinning: the body is ~8 boxes in nested groups, and the gait is
 * hip/shoulder rotation driven by the SAME distance-based phase the 2D game
 * used (`scrollY / STRIDE_VU`), so the cycle stays locked to the ground and
 * automatically slows down with the simulation during slowmo. This keeps the
 * character system inside the JS bundle (no model download, no GLTFLoader, no
 * skinning cost on mid-tier phones).
 */

const TAU = Math.PI * 2;
/** Golden-angle phase spread, same constant the 2D poses used. */
const PHASE_SPREAD = 2.39996;

/** One shared unit cube; every part is a scaled instance of it. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

export type Palette = {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
};

export const PALETTES = {
  player: { skin: 0xffcfa0, hair: 0x241c2b, shirt: 0xffe066, pants: 0x2b3358, shoes: 0xf05a6e },
  bumper: { skin: 0xe8b48c, hair: 0x140f18, shirt: 0xff5c7a, pants: 0x1b1a2b, shoes: 0x101019 },
  pedestrian: [
    { skin: 0xffd9b0, hair: 0x3a2a20, shirt: 0x5c7cff, pants: 0x323a55, shoes: 0x21263a },
    { skin: 0xe3b183, hair: 0x241a14, shirt: 0x63c98d, pants: 0x3d4257, shoes: 0x21263a },
    { skin: 0xf2c39b, hair: 0x4a2f4f, shirt: 0xb98cff, pants: 0x2f3550, shoes: 0x21263a },
  ],
} as const satisfies Record<string, Palette | readonly Palette[]>;

export type HumanoidOptions = {
  palette: Palette;
  /** Total height in WORLD units. */
  height: number;
  /** Amplitude of the limb swing; a heavy villain plods, a runner pumps. */
  swing?: number;
  /** Villain silhouette: wide shoulder pads. */
  shoulders?: boolean;
};

/** Proportions as a fraction of total height. */
const P = {
  legLen: 0.45,
  legW: 0.13,
  legD: 0.15,
  hipY: 0.47,
  hipX: 0.1,
  torsoH: 0.32,
  torsoW: 0.34,
  torsoD: 0.2,
  torsoY: 0.63,
  headS: 0.16,
  headY: 0.86,
  armLen: 0.34,
  armW: 0.085,
  armD: 0.1,
  shoulderY: 0.76,
  shoulderX: 0.2,
} as const;

export class Humanoid {
  /** Placed at the character's FEET; move this to position the character. */
  readonly root = new THREE.Group();
  /** Everything above the feet. Carries bob / sway / lean. */
  private readonly body = new THREE.Group();
  private readonly limbs: THREE.Group[] = [];
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly swing: number;
  private readonly height: number;

  constructor(o: HumanoidOptions) {
    this.height = o.height;
    this.swing = o.swing ?? 0.85;
    const h = o.height;
    const mat = (color: number) => {
      const m = new THREE.MeshLambertMaterial({ color });
      this.materials.push(m);
      return m;
    };
    const skin = mat(o.palette.skin);
    const hair = mat(o.palette.hair);
    const shirt = mat(o.palette.shirt);
    const pants = mat(o.palette.pants);
    const shoes = mat(o.palette.shoes);

    const box = (
      material: THREE.Material,
      w: number,
      ht: number,
      d: number,
      x: number,
      y: number,
      z = 0,
    ) => {
      const mesh = new THREE.Mesh(UNIT_BOX, material);
      mesh.scale.set(w * h, ht * h, d * h);
      mesh.position.set(x * h, y * h, z * h);
      return mesh;
    };

    // --- legs + arms: pivot groups so a rotation swings from hip / shoulder ---
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * P.hipX * h, P.hipY * h, 0);
      leg.add(box(pants, P.legW, P.legLen, P.legD, 0, -P.legLen / 2));
      leg.add(box(shoes, P.legW * 1.15, 0.07, P.legD * 1.45, 0, -P.legLen + 0.035, 0.02));
      this.body.add(leg);
      this.limbs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * P.shoulderX * h, P.shoulderY * h, 0);
      arm.add(box(shirt, P.armW, P.armLen * 0.6, P.armD, 0, -P.armLen * 0.3));
      arm.add(box(skin, P.armW, P.armLen * 0.42, P.armD, 0, -P.armLen * 0.81));
      this.body.add(arm);
      this.limbs.push(arm);
    }

    this.body.add(box(shirt, P.torsoW, P.torsoH, P.torsoD, 0, P.torsoY));
    this.body.add(box(skin, P.headS * 0.55, 0.07, P.headS * 0.55, 0, P.torsoY + P.torsoH / 2 + 0.03));
    this.body.add(box(skin, P.headS, P.headS, P.headS, 0, P.headY));
    // Hair as a cap + a back slab: reads as a head shape from the chase camera.
    this.body.add(box(hair, P.headS * 1.06, 0.04, P.headS * 1.06, 0, P.headY + P.headS / 2));
    this.body.add(box(hair, P.headS * 1.02, P.headS * 0.5, 0.025, 0, P.headY + 0.03, -P.headS / 2));

    if (o.shoulders) {
      for (const side of [-1, 1] as const) {
        this.body.add(
          box(pants, 0.16, 0.11, P.torsoD * 1.1, side * 0.16, P.torsoY + P.torsoH / 2 - 0.02),
        );
      }
    }

    this.root.add(this.body);
  }

  /**
   * Applies the gait for a distance travelled.
   *
   * @param scrollY distance in virtual units (the simulation's own clock)
   * @param idPhase per-character phase offset so a crowd never marches in sync
   * @param strideMul stride length multiplier (a heavy villain takes long steps)
   */
  stride(scrollY: number, idPhase: number, strideMul = 1): void {
    const p = (scrollY / (STRIDE_VU * strideMul)) * TAU + idPhase * PHASE_SPREAD;
    const s = Math.sin(p);
    // limbs are [legL, armL, legR, armR]; arms counter-swing their own leg.
    this.limbs[0].rotation.x = s * this.swing;
    this.limbs[1].rotation.x = -s * this.swing * 0.8;
    this.limbs[2].rotation.x = -s * this.swing;
    this.limbs[3].rotation.x = s * this.swing * 0.8;
  }

  /** Planted stance — no gait, used for the counter pose and for knockback. */
  plant(bend = 0.35): void {
    this.limbs[0].rotation.x = bend;
    this.limbs[1].rotation.x = -bend * 1.6;
    this.limbs[2].rotation.x = -bend;
    this.limbs[3].rotation.x = bend * 1.6;
  }

  /**
   * Re-uses the 2D {@link Pose} verbatim: `bob`/`sway` are virtual units (so
   * they convert straight to world units) and `rot` becomes a forward lean
   * about X. Squash/stretch maps to a non-uniform body scale about the feet,
   * which is exactly what the 2D renderer did with its canvas transform.
   */
  applyPose(pose: Pose, lean = 0, facing: 1 | -1 = 1): void {
    this.body.position.y = -pose.bob * WORLD_PER_VU;
    // `facing` is -1 for a character rotated 180° about Y (the player, seen from
    // behind): its local axes are mirrored, so the screen-space direction of the
    // lean and the sway has to be mirrored back.
    this.body.position.x = pose.sway * WORLD_PER_VU * facing;
    this.body.rotation.x = pose.rot * facing;
    this.body.rotation.z = -lean * facing;
    this.body.scale.set(pose.scaleX, pose.scaleY, pose.scaleX);
  }

  /** i-frame blink. Skips the material walk entirely at full opacity. */
  setOpacity(alpha: number): void {
    const transparent = alpha < 0.999;
    for (const m of this.materials) {
      if (!transparent && !m.transparent) continue;
      m.transparent = transparent;
      m.opacity = alpha;
    }
  }

  /**
   * Ragdoll tumble for the knockback arc. The body is hung half a height below
   * `root` so the spin happens about the character's MIDDLE, not its feet —
   * caller places `root` at the body's centre while tumbling.
   */
  tumble(rot: number): void {
    this.body.position.set(0, -this.height * 0.5, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.root.rotation.set(rot, 0, rot * 0.5);
    this.plant(0.5);
  }

  /** Back to a feet-planted, upright rig (undoes {@link tumble}). */
  upright(): void {
    this.body.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}
