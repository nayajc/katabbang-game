import type * as THREE from 'three';
import type { Pose } from '@/game/anim';

/**
 * The character contract the renderer draws against.
 *
 * Two implementations satisfy it and are interchangeable at runtime:
 *
 * - {@link Humanoid} — procedural boxes, always available, zero download.
 * - {@link SkinnedRig} — a rigged glTF SkinnedMesh, hot-swapped in once the
 *   model files finish loading in the background.
 *
 * Every method here is a *pose command* with the same envelope semantics in
 * both implementations, so `renderer.ts` never learns which one it is holding:
 *
 * - {@link stride} and {@link swagger} are **distance-driven** (`scrollY` in
 *   virtual units). They must never read the wall clock, or the gait would stop
 *   slowing down with the simulation during slowmo.
 * - {@link windUp}, {@link uppercut} and {@link jab} are **wall-clock driven**,
 *   taking a `0..1` progress over an envelope the caller owns, and each one owns
 *   the whole rig for its duration so no caller has to unwind it.
 */
export interface CharacterRig {
  /** Sits at the character's FEET; move this to position the character. */
  readonly root: THREE.Object3D;

  /** Run/walk cycle for a distance travelled, in virtual units. */
  stride(scrollY: number, idPhase: number, strideMul?: number): void;

  /** Planted stance — no gait. */
  plant(bend?: number): void;

  /** Applies the shared 2D {@link Pose} (bob / sway / lean / squash). */
  applyPose(pose: Pose, lean?: number, facing?: 1 | -1): void;

  /**
   * Villain strut OVERLAY — call after {@link applyPose}.
   * @returns the lateral world offset applied to the mesh, so the caller can
   * slide the blob shadow with it.
   */
  swagger(scrollY: number, idPhase: number, strideMul: number, amp: number): number;

  /** Shoulder-bash wind-up, `t` 0..1 across the counter cue lead. */
  windUp(t: number): void;

  /** 승룡권 counter uppercut, `t` 0..1 over {@link UPPERCUT_MS}. */
  uppercut(t: number, facing?: 1 | -1): void;

  /** Whiffed jab, `t` 0..1 over `TUNING.WHIFF_MS`. */
  jab(t: number, facing?: 1 | -1): void;

  /** i-frame blink. */
  setOpacity(alpha: number): void;

  /** Knockback ragdoll tumble; spins about the body's middle. */
  tumble(rot: number): void;

  /** Back to a feet-planted, upright rig (undoes {@link tumble}). */
  upright(): void;

  dispose(): void;
}

/** Character colour slots. Both rig implementations read the same five. */
export type Palette = {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
};

/** Wall-clock length of the {@link CharacterRig.uppercut} animation. */
export const UPPERCUT_MS = 520;

/**
 * Peak lateral weave of the villain's MESH, in world units. A lane is 2 world
 * units wide (see `coords.ts`), so this is ~0.4 of a lane to either side —
 * visibly menacing, and still nowhere near the neighbouring lane.
 */
export const SWAGGER_WEAVE = 0.8;

/** Golden-angle phase spread, the constant every gait here shares. */
export const PHASE_SPREAD = 2.39996;

export const TAU = Math.PI * 2;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease-out on 0..1 — the shape of an explosive move settling. */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
