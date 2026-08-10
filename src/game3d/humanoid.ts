import * as THREE from 'three';
import { STRIDE_VU, type Pose } from '@/game/anim';
import { WORLD_PER_VU } from './coords';

/**
 * Procedural low-poly humanoid with a coded run cycle.
 *
 * No glTF / no skinning: the body is ~8-11 boxes in nested groups, and the gait
 * is hip/shoulder rotation driven by the SAME distance-based phase the 2D game
 * used (`scrollY / STRIDE_VU`), so the cycle stays locked to the ground and
 * automatically slows down with the simulation during slowmo. This keeps the
 * character system inside the JS bundle (no model download, no GLTFLoader, no
 * skinning cost on mid-tier phones).
 *
 * {@link Archetype} re-proportions that same rig and hangs a prop or two off it
 * (cane, skirt, long hair) so the crowd reads as a street rather than a squad.
 */

const TAU = Math.PI * 2;
/** Golden-angle phase spread, same constant the 2D poses used. */
const PHASE_SPREAD = 2.39996;

/** One shared unit cube; every box part is a scaled instance of it. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** Shared unit cone (diameter 1, height 1), used for skirts. */
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 8);

export type Palette = {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
};

/** Body plan. Everything else about a character is palette and gait. */
export type Archetype = 'adult' | 'woman' | 'child' | 'elder';

export const PALETTES = {
  player: { skin: 0xffcfa0, hair: 0x241c2b, shirt: 0xffe066, pants: 0x2b3358, shoes: 0xf05a6e },
  // The villain is the darkest thing on the road: near-black legs and a deep
  // blood-red torso, so it reads as a threat against a crowd of bright shirts.
  bumper: { skin: 0xc08a63, hair: 0x08060c, shirt: 0x8e1226, pants: 0x121018, shoes: 0x08080e },
} as const satisfies Record<string, Palette>;

/**
 * Pedestrian palettes, one per spawn variant. Children are deliberately the
 * brightest thing on the road and the elderly the greyest, so the archetype is
 * readable at the distance a bumper first appears.
 */
export const PED_PALETTES = {
  adultA: { skin: 0xffd9b0, hair: 0x3a2a20, shirt: 0x5c7cff, pants: 0x323a55, shoes: 0x21263a },
  adultB: { skin: 0xe3b183, hair: 0x241a14, shirt: 0x63c98d, pants: 0x3d4257, shoes: 0x21263a },
  womanA: { skin: 0xf2c39b, hair: 0x4a2f4f, shirt: 0xb98cff, pants: 0x2f3550, shoes: 0x2b2033 },
  womanB: { skin: 0xffd9b0, hair: 0x7a3b2a, shirt: 0xff8fb1, pants: 0x36405e, shoes: 0x2b2033 },
  childA: { skin: 0xffdcbb, hair: 0x2f2119, shirt: 0xffd93d, pants: 0x2fb8c6, shoes: 0xff7043 },
  childB: { skin: 0xf6c8a0, hair: 0x4a2c1a, shirt: 0x7ee787, pants: 0xff6f91, shoes: 0xffd93d },
  elderA: { skin: 0xe6c0a2, hair: 0xd8d8e0, shirt: 0x8a8fa8, pants: 0x4a4f66, shoes: 0x2a2c3a },
  elderB: { skin: 0xdcb495, hair: 0xc8c6cf, shirt: 0xa89b8c, pants: 0x55506a, shoes: 0x2a2c3a },
} as const satisfies Record<string, Palette>;

export type HumanoidOptions = {
  palette: Palette;
  /** Total height in WORLD units. */
  height: number;
  /** Amplitude of the limb swing; a heavy villain plods, a runner pumps. */
  swing?: number;
  /** Villain silhouette: wide shoulder pads. */
  shoulders?: boolean;
  /** Body plan. Defaults to `adult` (the original rig, unchanged). */
  archetype?: Archetype;
  /**
   * Extra WIDTH multiplier, on top of the uniform scaling `height` already
   * does. 1 is the normal build; >1 broadens the torso, shoulders and limbs
   * without making the character taller — the villain's slab-shouldered bulk.
   */
  bulk?: number;
  /** Forward stoop in radians, added to every pose (overrides the archetype's). */
  hunch?: number;
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

/** `P` is `as const`, so widen its literal types before anything overrides them. */
type Proportions = { -readonly [K in keyof typeof P]: number };

type Shape = Partial<Proportions> & {
  /** Permanent forward stoop, in radians, added to every pose. */
  hunch?: number;
  /** Walking cane held in the right hand. */
  cane?: boolean;
  /** Skirt cone at the hips (shirt colour — reads as a dress). */
  skirt?: boolean;
  /** Hair down to the shoulders instead of a cap + short back slab. */
  longHair?: boolean;
};

/**
 * Per-archetype deltas. The invariant every entry must keep is
 * `hipY - legLen ≈ 0.02`, i.e. the feet land on the ground plane.
 */
const SHAPES: Record<Archetype, Shape> = {
  adult: {},
  woman: {
    torsoW: 0.3,
    torsoD: 0.18,
    shoulderX: 0.185,
    hipX: 0.085,
    legW: 0.115,
    skirt: true,
    longHair: true,
  },
  // Big head, short limbs — the classic "this is a kid" silhouette.
  child: {
    headS: 0.21,
    headY: 0.82,
    torsoH: 0.28,
    torsoW: 0.32,
    torsoY: 0.6,
    legLen: 0.4,
    hipY: 0.42,
    hipX: 0.085,
    armLen: 0.28,
    shoulderY: 0.71,
    shoulderX: 0.17,
  },
  elder: {
    hunch: 0.3,
    cane: true,
    torsoW: 0.33,
    torsoH: 0.3,
    torsoY: 0.6,
    legLen: 0.42,
    hipY: 0.44,
    headY: 0.83,
    shoulderY: 0.73,
  },
};

const CANE_COLOR = 0x6b4a2f;

/**
 * Peak lateral weave of the villain's MESH, in world units. A lane is 2 world
 * units wide (see `coords.ts`), so this is ~0.4 of a lane to either side —
 * visibly menacing, and still nowhere near the neighbouring lane.
 */
const SWAGGER_WEAVE = 0.8;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease-out on 0..1 — the shape of an explosive move settling. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export class Humanoid {
  /** Placed at the character's FEET; move this to position the character. */
  readonly root = new THREE.Group();
  /** Everything above the feet. Carries bob / sway / lean. */
  private readonly body = new THREE.Group();
  private readonly limbs: THREE.Group[] = [];
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly swing: number;
  private readonly height: number;
  /** Baked-in forward stoop (elderly), added on top of every pose. */
  private readonly hunch: number;

  constructor(o: HumanoidOptions) {
    this.height = o.height;
    this.swing = o.swing ?? 0.85;
    const shape = SHAPES[o.archetype ?? 'adult'];
    const p: Proportions = { ...P, ...shape };
    const bulk = o.bulk ?? 1;
    if (bulk !== 1) {
      // Width only — `hipY`/`legLen` are untouched, so the feet stay on the
      // ground plane and the archetype invariant still holds.
      p.torsoW *= bulk;
      p.torsoD *= bulk;
      p.shoulderX *= bulk;
      p.hipX *= bulk;
      p.armW *= bulk;
      p.armD *= bulk;
      p.legW *= bulk;
      p.legD *= bulk;
    }
    this.hunch = o.hunch ?? shape.hunch ?? 0;
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
      leg.position.set(side * p.hipX * h, p.hipY * h, 0);
      leg.add(box(pants, p.legW, p.legLen, p.legD, 0, -p.legLen / 2));
      leg.add(box(shoes, p.legW * 1.15, 0.07, p.legD * 1.45, 0, -p.legLen + 0.035, 0.02));
      this.body.add(leg);
      this.limbs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * p.shoulderX * h, p.shoulderY * h, 0);
      arm.add(box(shirt, p.armW, p.armLen * 0.6, p.armD, 0, -p.armLen * 0.3));
      arm.add(box(skin, p.armW, p.armLen * 0.42, p.armD, 0, -p.armLen * 0.81));
      this.body.add(arm);
      this.limbs.push(arm);
    }

    this.body.add(box(shirt, p.torsoW, p.torsoH, p.torsoD, 0, p.torsoY));
    this.body.add(box(skin, p.headS * 0.55, 0.07, p.headS * 0.55, 0, p.torsoY + p.torsoH / 2 + 0.03));
    this.body.add(box(skin, p.headS, p.headS, p.headS, 0, p.headY));
    // Hair as a cap + a back slab: reads as a head shape from the chase camera.
    this.body.add(box(hair, p.headS * 1.06, 0.04, p.headS * 1.06, 0, p.headY + p.headS / 2));
    if (shape.longHair) {
      // Falls to the shoulders and wraps the sides — a distinct silhouette even
      // as a 6px-tall shape far down the road.
      const fallH = p.headY - p.shoulderY + p.headS * 0.6;
      this.body.add(
        box(hair, p.headS * 1.02, fallH, 0.03, 0, p.headY + p.headS * 0.3 - fallH / 2, -p.headS / 2),
      );
      for (const side of [-1, 1] as const) {
        this.body.add(
          box(hair, 0.03, p.headS * 1.15, p.headS * 1.02, (side * p.headS) / 2, p.headY),
        );
      }
    } else {
      this.body.add(box(hair, p.headS * 1.02, p.headS * 0.5, 0.025, 0, p.headY + 0.03, -p.headS / 2));
    }

    if (shape.skirt) {
      const skirt = new THREE.Mesh(UNIT_CONE, shirt);
      const skirtH = p.legLen * 0.62;
      skirt.scale.set(p.torsoW * 1.9 * h, skirtH * h, p.torsoW * 1.5 * h);
      skirt.position.set(0, (p.hipY + skirtH * 0.32) * h, 0);
      this.body.add(skirt);
    }

    if (shape.cane) {
      // Hung off the right arm group (limbs[3]): the small elderly arm swing
      // then reads as a cane tapping the pavement in time with the gait.
      const cane = mat(CANE_COLOR);
      const arm = this.limbs[3];
      const caneLen = p.shoulderY - p.armLen * 0.85;
      const grip = -p.armLen * 0.95;
      arm.add(box(cane, 0.025, caneLen, 0.025, 0.035, grip - caneLen / 2, 0.05));
      arm.add(box(cane, 0.025, 0.02, 0.09, 0.035, grip, 0.02));
    }

    if (o.shoulders) {
      // Pads take the bulk multiplier a second time: the shoulders are the part
      // of the silhouette that has to read as "bigger than you" from far away.
      const padW = 0.16 * bulk * 1.25;
      for (const side of [-1, 1] as const) {
        this.body.add(
          box(pants, padW, 0.125, p.torsoD * 1.1, side * padW, p.torsoY + p.torsoH / 2 - 0.02),
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
    this.body.rotation.set(pose.rot * facing + this.hunch, 0, -lean * facing);
    this.body.scale.set(pose.scaleX, pose.scaleY, pose.scaleX);
  }

  /**
   * Villain swagger — an OVERLAY, so it must be called after {@link applyPose}.
   *
   * The shoulders swing left-right (yaw) and roll into the swing, the elbows
   * flare out and the whole mass weaves across the lane. Distance-driven like
   * every other gait here, at half the stride frequency: one full left-right
   * weave per two steps, so it reads as a strut and not a wobble.
   *
   * `amp` is the proximity ramp (0 far down the road, 1 on top of the player) —
   * the swagger grows as the villain closes in.
   *
   * @returns the lateral world offset applied to the MESH, so the caller can
   * slide the blob shadow with it. The lane position (`root`) never moves, so
   * collision and the counter engage stay purely lane-based.
   */
  swagger(scrollY: number, idPhase: number, strideMul: number, amp: number): number {
    const a = clamp01(amp);
    const p = (scrollY / (STRIDE_VU * strideMul * 2)) * TAU + idPhase * PHASE_SPREAD;
    const s = Math.sin(p);
    const weave = s * SWAGGER_WEAVE * a;
    this.body.position.x += weave;
    this.body.rotation.y += s * 0.5 * a;
    this.body.rotation.z += Math.cos(p) * 0.24 * a;
    // Head and chest dropped forward — the "coming through" posture.
    this.body.rotation.x += 0.12 * a;
    const flare = 0.24 + 0.38 * a;
    this.limbs[1].rotation.z = -flare;
    this.limbs[3].rotation.z = flare;
    return weave;
  }

  /**
   * Shoulder-bash wind-up, held through the counter window.
   *
   * `t` runs 0..1 on the WALL clock — the caller derives it from the same
   * `counterLeadMs` the shrinking cue ring uses, so the pose tightens in lockstep
   * with the ring closing. The near shoulder is cocked back and the torso twists
   * away from the player, which is the tell: you can SEE the 어깨빵 being loaded.
   *
   * Owns the whole rig (gait included) while it runs, exactly like
   * {@link uppercut}, so no caller has to unwind it.
   */
  windUp(t: number): void {
    const k = easeOut(clamp01(t));
    this.body.position.x = 0;
    this.body.position.y = 0;
    // Torso twisted away + rolled onto the loaded shoulder.
    this.body.rotation.set(this.hunch + 0.26 * k, -0.7 * k, 0.2 * k);
    // Coiled: broader and lower as the window closes.
    this.body.scale.set(1 + 0.12 * k, 1 - 0.07 * k, 1);
    // Right arm hauls back behind the hip, left arm counter-reaches across.
    this.limbs[3].rotation.x = 0.85 * k;
    this.limbs[3].rotation.z = 0.62 * k;
    this.limbs[1].rotation.x = -0.5 * k;
    this.limbs[1].rotation.z = -0.28 * k;
    // Wide braced stance to push off from.
    this.limbs[0].rotation.x = 0.34 * k;
    this.limbs[2].rotation.x = -0.26 * k;
  }

  /**
   * 승룡권 — the counter uppercut. Wall-clock driven, `t` running 0..1 over
   * {@link UPPERCUT_MS}, and entirely self-contained: the jump lives in
   * `body.position.y`, so `root` stays planted on the lane and the caller does
   * not have to unwind anything afterwards.
   *
   *   0.00 - 0.16  crouch, wind the punching arm back
   *   0.16 - 0.55  explosive rise: body spins into the punch, right arm snaps to
   *                full extension overhead, legs tuck and trail
   *   0.55 - 1.00  fall and settle back onto a planted stance
   */
  uppercut(t: number, facing: 1 | -1 = 1): void {
    const k = clamp01(t);
    const crouch = clamp01(k / 0.16);
    // Rise starts the instant the crouch bottoms out and lands by ~0.85.
    const air = Math.sin(Math.PI * clamp01((k - 0.16) / 0.69));
    // Punch extension: snaps out over 0.16..0.45, holds, then relaxes.
    const punch = k < 0.16 ? 0 : k < 0.45 ? easeOut((k - 0.16) / 0.29) : 1 - easeOut(clamp01((k - 0.6) / 0.4));
    const down = k < 0.16 ? crouch : 1 - clamp01((k - 0.16) / 0.2);

    // Body: dip, then leap; stretch on the way up, squash into the crouch.
    this.body.position.y = this.height * (air * 0.5 - down * 0.11);
    this.body.position.x = 0;
    this.body.rotation.set(
      this.hunch + 0.22 * down - 0.3 * punch,
      // Wind-up away from the target, then torque through the punch.
      (-0.3 * down + 1.15 * punch) * facing,
      -0.18 * punch * facing,
    );
    this.body.scale.set(1 + 0.14 * down - 0.06 * punch, 1 - 0.18 * down + 0.12 * punch, 1);

    // Right arm (limbs[3]) is the punching arm: hangs at 0, straight up at -PI.
    this.limbs[3].rotation.x = lerp(0.9 * down, -2.95, punch);
    this.limbs[3].rotation.z = -0.25 * punch * facing;
    // Left arm tucks across the chest.
    this.limbs[1].rotation.x = lerp(-0.2 * down, 0.85, punch);
    // Lead leg tucks, trailing leg kicks back — the classic Shoryuken pose.
    this.limbs[0].rotation.x = lerp(0.75 * down, -1.15, air);
    this.limbs[2].rotation.x = lerp(-0.5 * down, 0.85, air);
  }

  /**
   * Light jab — the WHIFF reaction, thrown when the counter input is pressed
   * with no window armed.
   *
   * Same articulation vocabulary as {@link uppercut} and just as self-contained
   * (it owns all four limbs plus the body transform, so nothing needs
   * unwinding), but deliberately a much smaller move: no leap, no squash, the
   * feet stay planted and the arm punches STRAIGHT forward instead of overhead.
   *
   * `t` runs 0..1 on the wall clock over `TUNING.WHIFF_MS`:
   *   0.00 - 0.35  arm snaps out to full extension, body twists into it
   *   0.35 - 0.50  brief hold at extension
   *   0.50 - 1.00  retract to guard
   */
  jab(t: number, facing: 1 | -1 = 1): void {
    const k = clamp01(t);
    // 0 at rest, 1 at full extension.
    const out = k < 0.35 ? easeOut(k / 0.35) : 1 - easeOut(clamp01((k - 0.5) / 0.5));

    this.body.position.set(0, 0, 0);
    // Slight forward lean + a shoulder twist through the punch. A third of the
    // uppercut's torque, so the two moves never read as the same animation.
    this.body.rotation.set(this.hunch + 0.1 * out, 0.38 * out * facing, -0.07 * out * facing);
    this.body.scale.set(1, 1, 1);

    // Right arm (limbs[3]) punches: hangs at 0, horizontal forward at -PI/2.
    this.limbs[3].rotation.x = lerp(0.35, -1.62, out);
    this.limbs[3].rotation.z = -0.12 * out * facing;
    // Left arm stays up as a guard across the chest.
    this.limbs[1].rotation.x = lerp(-0.15, -0.55, out);
    this.limbs[1].rotation.z = 0;
    // Feet planted, knees barely absorbing the twist — no stride, no jump.
    this.limbs[0].rotation.x = 0.2 * out;
    this.limbs[2].rotation.x = -0.16 * out;
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

/** Wall-clock length of the {@link Humanoid.uppercut} animation. */
export const UPPERCUT_MS = 520;
