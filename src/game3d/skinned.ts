import * as THREE from 'three';
import { STRIDE_VU, type Pose } from '@/game/anim';
import { WORLD_PER_VU } from './coords';
import {
  clamp01,
  easeOut,
  lerp,
  PHASE_SPREAD,
  SWAGGER_WEAVE,
  TAU,
  type CharacterRig,
  type Palette,
} from './rig';

/**
 * Rigged glTF character — the same {@link CharacterRig} contract as the
 * procedural {@link Humanoid}, driven by a skeleton instead of nested boxes.
 *
 * Two animation systems share the skeleton, and which one owns it is decided
 * per frame by the renderer's existing priority ladder:
 *
 * 1. **Locomotion** plays a baked glTF clip through an `AnimationMixer`, but the
 *    mixer's time is **set from distance travelled**, never advanced by the wall
 *    clock (see {@link stride}). That is the contract the whole game depends on:
 *    the gait speeds up with the world scroll and slows to a crawl in slowmo,
 *    because it is a function of `scrollY` and nothing else.
 * 2. **Fight poses** (`windUp` / `uppercut` / `jab` / `plant` / `tumble`) bypass
 *    the mixer entirely and rotate bones directly, re-using the exact pose math
 *    and wall-clock envelopes the box rig was tuned with. Bones give MORE
 *    articulation than the four box pivots did — the spine, chest and knees now
 *    take part — so each move reads bigger for the same numbers.
 *
 * Mixing the two safely needs one discipline: a pose command must first restore
 * every bone it touches to its rest transform, because the mixer may have left
 * the skeleton mid-stride. {@link resetBones} does that, and every fight pose
 * calls it.
 */

/** Bones this rig poses procedurally. Everything else rides the skeleton. */
const BONES = [
  'Hips',
  'Abdomen',
  'Torso',
  'Chest',
  'Neck',
  'Head',
  'UpperArm.L',
  'LowerArm.L',
  'UpperArm.R',
  'LowerArm.R',
  'UpperLeg.L',
  'LowerLeg.L',
  'UpperLeg.R',
  'LowerLeg.R',
  // Not posed; carried for prop anchoring (the cane goes in the hand).
  'Wrist.R',
] as const;

/** Exposed so the geometry test can assert every one of them resolves. */
export const BONE_NAMES: readonly string[] = BONES;

type BoneName = (typeof BONES)[number];

/** Index into the flat bone arrays — cheaper than a per-frame name lookup. */
const B = Object.fromEntries(BONES.map((n, i) => [n, i])) as Record<BoneName, number>;

/**
 * Per-bone rest data, computed once per MODEL and shared by every instance
 * cloned from it (the skeleton is identical, so the numbers are too).
 *
 * `axisX/Y/Z` are the model-space X/Y/Z axes expressed in the bone's PARENT
 * space. That is the trick that makes this rig-agnostic: the pose math below can
 * say "swing this limb 0.9rad about the model's X axis" without knowing which
 * way the exporter happened to point the bone's own local axes.
 */
export type BoneRest = {
  quaternion: THREE.Quaternion;
  position: THREE.Vector3;
  axisX: THREE.Vector3;
  axisY: THREE.Vector3;
  axisZ: THREE.Vector3;
  /** Bind-pose WORLD rotation — the frame a prop holder has to cancel out. */
  world: THREE.Quaternion;
};

export type SkinnedTemplate = {
  /** Bind-pose scene, cloned per instance with `SkeletonUtils.clone`. */
  readonly scene: THREE.Object3D;
  readonly clips: readonly THREE.AnimationClip[];
  /** Rest data per {@link BONES} entry; `null` when the model lacks that bone. */
  readonly rest: readonly (BoneRest | null)[];
  /** Height of the bind pose in the model's own units, for scaling to fit. */
  readonly height: number;
  /** Material name -> palette slot, for per-instance tinting. */
  readonly tint: Readonly<Record<string, keyof Palette>>;
};

export type SkinnedRigOptions = {
  template: SkinnedTemplate;
  palette: Palette;
  /** Total height in WORLD units. */
  height: number;
  /** Extra WIDTH multiplier on top of the uniform height scale. */
  bulk?: number;
  /** Forward stoop in radians, added to every pose. */
  hunch?: number;
  /** Head bone scale — >1 is the classic "this is a kid" silhouette. */
  headScale?: number;
  /** Walk instead of run for locomotion (the elderly shuffle). */
  walk?: boolean;
  /** Backpack slab on the upper back, parented to the chest bone. */
  backpack?: boolean;
  /** Sun hat, parented to the head bone. */
  hat?: boolean;
  /** Cane in the right hand. */
  cane?: boolean;
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const HAT_COLOR = 0xf2e2b8;
const HAT_BAND_COLOR = 0x3a4a6b;
const CANE_COLOR = 0x6b4a2f;

/** Scratch objects — neither construction nor the draw path should allocate. */
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();

/**
 * Reads the rest pose of a freshly loaded model into shareable {@link BoneRest}
 * records. Call once per model, before anything poses it.
 */
export function readBoneRest(scene: THREE.Object3D): (BoneRest | null)[] {
  scene.updateMatrixWorld(true);
  return BONES.map((name) => {
    const bone = findBone(scene, name);
    if (!bone) return null;
    // Parent world rotation of the BIND pose. Expressing the model-space axes in
    // this frame once is what lets `setBone` stay a single quaternion multiply.
    const parentWorld = new THREE.Quaternion();
    bone.parent?.getWorldQuaternion(parentWorld);
    const inv = parentWorld.clone().invert();
    return {
      quaternion: bone.quaternion.clone(),
      position: bone.position.clone(),
      axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize(),
      axisY: new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize(),
      axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize(),
      world: bone.getWorldQuaternion(new THREE.Quaternion()),
    };
  });
}

/**
 * Bone lookup that survives glTF import.
 *
 * `GLTFLoader` runs every node name through `PropertyBinding.sanitizeNodeName`,
 * which STRIPS the characters three's animation-binding syntax reserves — so the
 * rig's `UpperArm.R` lands in the scene graph as `UpperArmR`. Looking up only the
 * authored name returns `undefined` for every limb, and the failure is silent:
 * the skeleton just sits in its bind pose instead of punching. Asking three for
 * the same transform it applied is the only version of this that cannot drift.
 */
function findBone(scene: THREE.Object3D, name: string): THREE.Object3D | null {
  return (
    scene.getObjectByName(name) ??
    scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ??
    null
  );
}

/** Bind-pose height of a model, in its own units. */
export function measureHeight(scene: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(scene);
  return Math.max(0.001, box.max.y - box.min.y);
}

export class SkinnedRig implements CharacterRig {
  /** Placed at the character's FEET; move this to position the character. */
  readonly root = new THREE.Group();
  /** Everything above the feet. Carries bob / sway / lean, like the box rig. */
  private readonly body = new THREE.Group();
  private readonly bones: (THREE.Object3D | null)[];
  private readonly rest: readonly (BoneRest | null)[];
  private readonly materials: THREE.Material[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly locomotion: THREE.AnimationAction | null;
  private readonly clipDuration: number;
  private readonly hunch: number;
  private readonly height: number;
  /** True while the mixer owns the skeleton, so a pose knows to reset first. */
  private mixerOwns = false;

  constructor(o: SkinnedRigOptions) {
    const t = o.template;
    this.rest = t.rest;
    this.height = o.height;
    this.hunch = o.hunch ?? 0;

    // SkeletonUtils.clone gives an independent skeleton but SHARED geometry and
    // materials; the materials are re-cloned below so tint and the i-frame blink
    // are per-instance while the (much larger) geometry stays shared.
    const scene = cloneSkinned(t.scene);
    const fit = o.height / t.height;
    scene.scale.set(fit * (o.bulk ?? 1), fit, fit * (o.bulk ?? 1));
    this.body.add(scene);
    this.root.add(this.body);

    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => this.tinted(m, t.tint, o.palette))
        : this.tinted(mesh.material, t.tint, o.palette);
      // Skinned bounds are computed from the bind pose and go stale the moment a
      // bone moves; the characters are always in shot anyway.
      mesh.frustumCulled = false;
    });

    this.bones = BONES.map((name) => findBone(scene, name));
    if (o.headScale && o.headScale !== 1) {
      this.bones[B.Head]?.scale.setScalar(o.headScale);
    }

    this.mixer = new THREE.AnimationMixer(scene);
    const wanted = o.walk ? 'Walk' : 'Run';
    const clip = t.clips.find((c) => c.name === wanted) ?? t.clips[0] ?? null;
    this.locomotion = clip ? this.mixer.clipAction(clip) : null;
    this.clipDuration = clip?.duration ?? 1;
    this.locomotion?.play();

    if (o.backpack) this.attachBackpack(o.palette.pants);
    if (o.hat) this.attachHat();
    if (o.cane) this.attachCane();
  }

  /** Per-instance material clone, recoloured from the palette. */
  private tinted(
    source: THREE.Material,
    tint: Readonly<Record<string, keyof Palette>>,
    palette: Palette,
  ): THREE.Material {
    const m = source.clone();
    const slot = tint[source.name];
    if (slot && m instanceof THREE.MeshStandardMaterial) {
      m.color.setHex(palette[slot]);
      // The packs ship a metalness of 1 on some slots, which goes black under
      // this scene's hemisphere/directional lighting. Force a matte read.
      m.metalness = 0;
      m.roughness = 0.85;
    } else if (m instanceof THREE.MeshStandardMaterial) {
      m.metalness = 0;
      m.roughness = 0.85;
    }
    this.materials.push(m);
    return m;
  }

  private prop(geo: THREE.BufferGeometry, color: number): THREE.Mesh {
    const mat = new THREE.MeshLambertMaterial({ color });
    this.materials.push(mat);
    return new THREE.Mesh(geo, mat);
  }

  /**
   * Attaches a prop to a BONE, sized and placed in WORLD units and aligned to the
   * MODEL's axes.
   *
   * Parenting to a bone rather than to `body` is the whole reason a skeleton
   * beats a box hierarchy here: a pack on the chest rides the spine through the
   * run cycle and the wind-up for free, and a cane in the hand taps the pavement
   * in time with the arm swing, with no per-frame code at all.
   *
   * The catch is that bone space is neither axis-aligned nor unit-scaled — a
   * bone's local Y runs ALONG the bone, and the packs export at ~1.86 units tall
   * before being fit-scaled. So the prop goes inside a holder that cancels both:
   * the bind-pose world rotation and the world scale. Inside the holder, `y` is
   * up, `-z` is behind, and 1 is one world unit.
   */
  private attachProp(
    name: BoneName,
    mesh: THREE.Mesh,
    size: [number, number, number],
    offset: [number, number, number],
    fallbackY: number,
  ): void {
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(offset[0], offset[1], offset[2]);
    const bone = this.bones[B[name]];
    const rest = this.rest[B[name]];
    if (!bone || !rest) {
      mesh.position.y = fallbackY;
      this.body.add(mesh);
      return;
    }
    this.root.updateMatrixWorld(true);
    bone.getWorldScale(V);
    const holder = new THREE.Group();
    // Uniform scale by construction (the whole model is fit-scaled on one
    // factor), which is what lets a single scalar commute with the rotation.
    holder.scale.setScalar(1 / (V.y || 1));
    holder.quaternion.copy(rest.world).invert();
    holder.add(mesh);
    bone.add(holder);
  }

  private attachBackpack(color: number): void {
    const h = this.height;
    this.attachProp(
      'Chest',
      this.prop(UNIT_BOX, color),
      [0.26 * h, 0.3 * h, 0.11 * h],
      [0, 0.06 * h, -0.13 * h],
      h * 0.62,
    );
  }

  private attachHat(): void {
    const h = this.height;
    this.attachProp(
      'Head',
      this.prop(UNIT_CYL, HAT_COLOR),
      [0.42 * h, 0.02 * h, 0.42 * h],
      [0, 0.13 * h, 0.01 * h],
      h * 0.93,
    );
    this.attachProp(
      'Head',
      this.prop(UNIT_CYL, HAT_COLOR),
      [0.25 * h, 0.1 * h, 0.25 * h],
      [0, 0.18 * h, 0.01 * h],
      h * 0.97,
    );
    this.attachProp(
      'Head',
      this.prop(UNIT_CYL, HAT_BAND_COLOR),
      [0.26 * h, 0.03 * h, 0.26 * h],
      [0, 0.145 * h, 0.01 * h],
      h * 0.94,
    );
  }

  private attachCane(): void {
    const h = this.height;
    this.attachProp(
      'Wrist.R',
      this.prop(UNIT_BOX, CANE_COLOR),
      [0.026 * h, 0.48 * h, 0.026 * h],
      [0.02 * h, -0.22 * h, 0.03 * h],
      h * 0.4,
    );
  }

  /**
   * Restores every posed bone to its rest transform. The mixer may have left the
   * skeleton mid-stride, and a fight pose only writes the bones it cares about,
   * so without this the leftovers would bleed through.
   */
  private resetBones(): void {
    if (this.mixerOwns) {
      this.mixerOwns = false;
      this.locomotion?.stop();
    }
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      const rest = this.rest[i];
      if (!bone || !rest) continue;
      bone.quaternion.copy(rest.quaternion);
      bone.position.copy(rest.position);
    }
  }

  /**
   * Rotates a bone by `x`/`y`/`z` radians about the MODEL's axes, on top of its
   * rest pose. Composed in parent space via the pre-baked axes, so the caller
   * never has to know the exporter's bone orientation.
   */
  private setBone(index: number, x: number, y = 0, z = 0): void {
    const bone = this.bones[index];
    const rest = this.rest[index];
    if (!bone || !rest) return;
    bone.quaternion.copy(rest.quaternion);
    if (x !== 0) bone.quaternion.premultiply(Q.setFromAxisAngle(rest.axisX, x));
    if (y !== 0) bone.quaternion.premultiply(Q.setFromAxisAngle(rest.axisY, y));
    if (z !== 0) bone.quaternion.premultiply(Q.setFromAxisAngle(rest.axisZ, z));
  }

  // --- locomotion -----------------------------------------------------------

  /**
   * DISTANCE-driven gait. The mixer is never advanced by wall time: its clock is
   * *set* to a phase computed from `scrollY`, exactly like the box rig's
   * `sin(scrollY / STRIDE_VU)`. Slowmo therefore slows the legs, and a paused
   * simulation freezes them mid-step.
   */
  stride(scrollY: number, idPhase: number, strideMul = 1): void {
    const action = this.locomotion;
    if (!action) return;
    if (!this.mixerOwns) {
      this.mixerOwns = true;
      action.reset().play();
    }
    const phase = (scrollY / (STRIDE_VU * strideMul) + (idPhase * PHASE_SPREAD) / TAU) % 1;
    this.mixer.setTime((phase < 0 ? phase + 1 : phase) * this.clipDuration);
  }

  plant(bend = 0.35): void {
    this.resetBones();
    this.setBone(B['UpperLeg.L'], bend);
    this.setBone(B['UpperLeg.R'], -bend);
    this.setBone(B['LowerLeg.L'], -bend * 0.9);
    this.setBone(B['LowerLeg.R'], bend * 0.5);
    this.setBone(B['UpperArm.L'], -bend * 1.4, 0, -0.2);
    this.setBone(B['UpperArm.R'], bend * 1.4, 0, 0.2);
    this.setBone(B['LowerArm.L'], -bend * 0.8);
    this.setBone(B['LowerArm.R'], -bend * 0.8);
  }

  applyPose(pose: Pose, lean = 0, facing: 1 | -1 = 1): void {
    this.body.position.y = -pose.bob * WORLD_PER_VU;
    this.body.position.x = pose.sway * WORLD_PER_VU * facing;
    this.body.rotation.set(pose.rot * facing + this.hunch, 0, -lean * facing);
    this.body.scale.set(pose.scaleX, pose.scaleY, pose.scaleX);
  }

  swagger(scrollY: number, idPhase: number, strideMul: number, amp: number): number {
    const a = clamp01(amp);
    const p = (scrollY / (STRIDE_VU * strideMul * 2)) * TAU + idPhase * PHASE_SPREAD;
    const s = Math.sin(p);
    const weave = s * SWAGGER_WEAVE * a;
    this.body.position.x += weave;
    this.body.rotation.y += s * 0.5 * a;
    this.body.rotation.z += Math.cos(p) * 0.24 * a;
    this.body.rotation.x += 0.12 * a;
    return weave;
  }

  // --- fight poses ----------------------------------------------------------

  windUp(t: number): void {
    const k = easeOut(clamp01(t));
    this.resetBones();
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(this.hunch + 0.18 * k, 0, 0);
    this.body.scale.set(1, 1, 1);
    // The twist is spread down the spine — the part a box rig could not do.
    this.setBone(B.Hips, 0.1 * k, -0.24 * k, 0.06 * k);
    this.setBone(B.Torso, 0.1 * k, -0.3 * k, 0.09 * k);
    this.setBone(B.Chest, 0.06 * k, -0.36 * k, 0.1 * k);
    // Head stays locked on the player while the shoulders turn away — the tell.
    this.setBone(B.Head, -0.1 * k, 0.42 * k, 0);
    // Right arm hauls back BEHIND the hip; the elbow bend has to stay small or
    // it swings the hand back in front and the cock reads as a reach.
    this.setBone(B['UpperArm.R'], 1.05 * k, 0, 0.55 * k);
    this.setBone(B['LowerArm.R'], -0.25 * k);
    this.setBone(B['UpperArm.L'], -0.55 * k, 0, -0.32 * k);
    this.setBone(B['LowerArm.L'], -1.1 * k);
    // Braced stance to push off from.
    this.setBone(B['UpperLeg.L'], 0.34 * k);
    this.setBone(B['UpperLeg.R'], -0.26 * k);
    this.setBone(B['LowerLeg.L'], -0.3 * k);
  }

  /**
   * 승룡권. Same three-beat envelope and the same numbers as the box rig's, with
   * the spine and knees joining in: crouch to 0.16, explosive rise to ~0.85,
   * settle by 1.
   */
  uppercut(t: number, facing: 1 | -1 = 1): void {
    const k = clamp01(t);
    const crouch = clamp01(k / 0.16);
    const air = Math.sin(Math.PI * clamp01((k - 0.16) / 0.69));
    const punch =
      k < 0.16 ? 0 : k < 0.45 ? easeOut((k - 0.16) / 0.29) : 1 - easeOut(clamp01((k - 0.6) / 0.4));
    const down = k < 0.16 ? crouch : 1 - clamp01((k - 0.16) / 0.2);

    this.resetBones();
    this.body.position.y = this.height * (air * 0.5 - down * 0.11);
    this.body.position.x = 0;
    this.body.rotation.set(
      this.hunch + 0.22 * down - 0.3 * punch,
      (-0.3 * down + 1.15 * punch) * facing,
      -0.18 * punch * facing,
    );
    this.body.scale.set(1 + 0.14 * down - 0.06 * punch, 1 - 0.18 * down + 0.12 * punch, 1);

    this.setBone(B.Hips, 0.12 * down, 0, 0);
    this.setBone(B.Torso, 0.18 * down - 0.16 * punch, -0.24 * punch * facing, 0);
    this.setBone(B.Chest, 0.12 * down - 0.2 * punch, -0.3 * punch * facing, 0);
    this.setBone(B.Head, -0.1 * down - 0.35 * punch, 0, 0);
    // Right arm is the punching arm: hangs at rest, straight overhead at -PI.
    this.setBone(B['UpperArm.R'], lerp(0.9 * down, -2.8, punch), 0, -0.25 * punch);
    this.setBone(B['LowerArm.R'], lerp(-1.1 * down, 0, punch));
    this.setBone(B['UpperArm.L'], lerp(-0.2 * down, 0.85, punch), 0, 0.3 * punch);
    this.setBone(B['LowerArm.L'], -1.3);
    // Lead leg tucks, trailing leg kicks back — the classic Shoryuken shape.
    this.setBone(B['UpperLeg.L'], lerp(0.75 * down, -1.15, air));
    this.setBone(B['LowerLeg.L'], lerp(-0.6 * down, -1.5, air));
    this.setBone(B['UpperLeg.R'], lerp(-0.5 * down, 0.85, air));
    this.setBone(B['LowerLeg.R'], lerp(-0.5 * down, -0.35, air));
  }

  jab(t: number, facing: 1 | -1 = 1): void {
    const k = clamp01(t);
    const out = k < 0.35 ? easeOut(k / 0.35) : 1 - easeOut(clamp01((k - 0.5) / 0.5));

    this.resetBones();
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(this.hunch + 0.1 * out, 0.38 * out * facing, -0.07 * out * facing);
    this.body.scale.set(1, 1, 1);

    this.setBone(B.Torso, 0.05 * out, -0.16 * out * facing, 0);
    this.setBone(B.Chest, 0.04 * out, -0.2 * out * facing, 0);
    // Right arm punches STRAIGHT forward (horizontal at -PI/2), no leap.
    this.setBone(B['UpperArm.R'], lerp(0.35, -1.5, out), 0, -0.12 * out);
    this.setBone(B['LowerArm.R'], lerp(-1.2, -0.1, out));
    this.setBone(B['UpperArm.L'], lerp(-0.15, -0.55, out));
    this.setBone(B['LowerArm.L'], -1.35);
    this.setBone(B['UpperLeg.L'], 0.2 * out);
    this.setBone(B['UpperLeg.R'], -0.16 * out);
  }

  setOpacity(alpha: number): void {
    const transparent = alpha < 0.999;
    for (const m of this.materials) {
      if (!transparent && !m.transparent) continue;
      m.transparent = transparent;
      m.opacity = alpha;
      m.depthWrite = !transparent;
      m.needsUpdate = true;
    }
  }

  tumble(rot: number): void {
    this.body.position.set(0, -this.height * 0.5, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.root.rotation.set(rot, 0, rot * 0.5);
    this.plant(0.5);
  }

  upright(): void {
    this.body.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot() as THREE.Object3D);
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
  }
}

/**
 * `SkeletonUtils.clone`, loaded lazily with the rest of the model plumbing and
 * installed here by `models.ts`, so `skinned.ts` stays free of a static
 * `three/examples` import (which would pull the addon into the main chunk).
 */
let cloneImpl: ((scene: THREE.Object3D) => THREE.Object3D) | null = null;

export function setSkinnedClone(fn: (scene: THREE.Object3D) => THREE.Object3D): void {
  cloneImpl = fn;
}

function cloneSkinned(scene: THREE.Object3D): THREE.Object3D {
  if (!cloneImpl) throw new Error('SkeletonUtils.clone not installed');
  return cloneImpl(scene);
}
