import * as THREE from 'three';
import { TUNING } from '@/game/tuning';
import { Humanoid, PALETTES, PED_PALETTES, type Archetype } from './humanoid';
import { loadCharacterModels, type ModelKind, type ModelLibrary } from './models';
import type { CharacterRig, Palette } from './rig';
import { SkinnedRig } from './skinned';
import { blobShadowTexture } from './world';
import { WORLD_PER_VU } from './coords';

/**
 * Character pool. One {@link CharacterRig} per live entity, recycled by kind so
 * a steady run never allocates. Entities are keyed by their simulation id, which
 * is stable for the whole life of the entity.
 *
 * ## Progressive upgrade
 *
 * The pool always starts on the procedural {@link Humanoid}, so the first frame
 * draws with zero network dependency. {@link loadCharacterModels} runs in the
 * background; when (and only if) it succeeds, actors swap to a {@link SkinnedRig}
 * built from the same {@link ActorSpec} — the player at once, then the crowd at
 * one per frame so the conversion never costs a dropped frame. If the load
 * fails, nothing happens and the boxes simply keep playing.
 */

const PLAYER_H = TUNING.PLAYER_R * 3 * WORLD_PER_VU;
const ENTITY_H = TUNING.ENTITY_R * 2.9 * WORLD_PER_VU;

/** Live skinned characters allowed on screen — the mobile frame budget. */
const MAX_SKINNED = 12;

export type PedKind = keyof typeof PED_PALETTES;
export type ActorKind = 'bumper' | PedKind;

/**
 * The street's cast list. Read modulo the entity id, so the mix is deterministic
 * from the simulation seed and stable for the whole life of an entity — no RNG
 * of its own, and a replayed seed replays the same crowd.
 *
 * 20 slots: 5 adults, 3 women, 3 children, 3 elderly, 3 students, 3 tourists.
 */
const PED_MIX = [
  'adultA', 'womanA', 'studentA', 'childA',
  'elderA', 'adultA', 'touristA', 'adultB',
  'childB', 'studentB', 'adultA', 'elderB',
  'womanB', 'adultB', 'touristB', 'elderA',
  'studentA', 'childA', 'touristA', 'womanA',
] as const satisfies readonly PedKind[];

/** Pedestrian variant for an entity id — stable across frames. */
export function pedestrianVariant(id: number): PedKind {
  return PED_MIX[Math.abs(id) % PED_MIX.length];
}

export type ActorSpec = {
  height: number;
  swing: number;
  shoulders?: boolean;
  archetype?: Archetype;
  /** Extra width on top of `height`'s uniform scale — see `HumanoidOptions`. */
  bulk?: number;
  /** Permanent forward stoop in radians. */
  hunch?: number;
  /** Gait cycle length multiplier — bigger is a longer, slower stride. */
  strideMul: number;
  /** Multipliers on the shared pedestrian pose's bob / sway. */
  bobMul: number;
  swayMul: number;
  /** Which shared glTF mesh this archetype is a tint of. */
  model: ModelKind;
  /** Head bone scale on the skinned rig — the child silhouette. */
  headScale?: number;
  /** Play the `Walk` clip instead of `Run` (the elderly shuffle). */
  walk?: boolean;
};

const SHADOW_GEO = new THREE.PlaneGeometry(1, 1);

/**
 * Archetype specs. `strideMul` / `bobMul` / `swayMul` are the gait vocabulary:
 * the elderly shuffle (long slow cycle, almost no swing), children bounce (short
 * quick cycle, exaggerated bob) and women get a touch more sway. `model` and the
 * archetype's props are what the two rig implementations read to look alike.
 */
const SPECS: Record<ActorKind, ActorSpec> = {
  // The villain out-sizes every adult on the road — ~1.4x tall and broader
  // again on top of that — and plods with a heavy, wide swing.
  bumper: {
    height: ENTITY_H * 1.4,
    swing: 0.62,
    shoulders: true,
    bulk: 1.18,
    hunch: 0.1,
    strideMul: 1.45,
    bobMul: 1,
    swayMul: 1,
    // `casual` is the one base whose pack splits jacket from trousers into two
    // materials, which is what lets the villain read as blood-red over black
    // rather than as one flat suit.
    model: 'casual',
  },
  adultA: { height: ENTITY_H, swing: 0.5, strideMul: 1.25, bobMul: 1, swayMul: 1, model: 'casual' },
  adultB: { height: ENTITY_H * 1.04, swing: 0.52, strideMul: 1.34, bobMul: 1, swayMul: 1, model: 'man' },
  womanA: { height: ENTITY_H * 0.95, swing: 0.44, archetype: 'woman', strideMul: 1.16, bobMul: 0.9, swayMul: 1.2, model: 'woman' },
  womanB: { height: ENTITY_H * 0.93, swing: 0.46, archetype: 'woman', strideMul: 1.22, bobMul: 0.9, swayMul: 1.2, model: 'woman' },
  childA: { height: ENTITY_H * 0.66, swing: 0.78, archetype: 'child', strideMul: 0.86, bobMul: 1.8, swayMul: 1.15, model: 'casual', headScale: 1.3 },
  childB: { height: ENTITY_H * 0.7, swing: 0.74, archetype: 'child', strideMul: 0.92, bobMul: 1.7, swayMul: 1.15, model: 'casual', headScale: 1.26 },
  elderA: { height: ENTITY_H * 0.88, swing: 0.22, archetype: 'elder', strideMul: 1.95, bobMul: 0.45, swayMul: 0.6, model: 'man', walk: true },
  elderB: { height: ENTITY_H * 0.9, swing: 0.2, archetype: 'elder', strideMul: 2.1, bobMul: 0.4, swayMul: 0.6, model: 'man', walk: true },
  // Students are slighter than an adult and walk quick and short.
  studentA: { height: ENTITY_H * 0.9, swing: 0.58, archetype: 'student', strideMul: 1.06, bobMul: 1.15, swayMul: 1, model: 'man' },
  studentB: { height: ENTITY_H * 0.86, swing: 0.6, archetype: 'student', strideMul: 1.02, bobMul: 1.2, swayMul: 1.1, model: 'woman' },
  // Tourists amble: long relaxed stride, plenty of sway, sightseeing.
  touristA: { height: ENTITY_H * 1.02, swing: 0.42, archetype: 'tourist', strideMul: 1.6, bobMul: 0.8, swayMul: 1.35, model: 'casual' },
  touristB: { height: ENTITY_H * 0.94, swing: 0.4, archetype: 'tourist', strideMul: 1.55, bobMul: 0.8, swayMul: 1.4, model: 'woman' },
};

/**
 * One character on the road: a swappable rig plus its blob shadow.
 *
 * `rig` is deliberately NOT readonly — {@link upgrade} replaces it in place, and
 * `renderer.ts` re-reads `actor.rig` every frame, so the swap needs no
 * cooperation from the draw path.
 */
export class Actor {
  rig: CharacterRig;
  readonly shadow: THREE.Mesh;
  /** Yaw applied to whichever rig is current — the player faces down the road. */
  private spin = 0;
  private skinned = false;

  constructor(
    private readonly scene: THREE.Scene,
    shadowMat: THREE.Material,
    private readonly palette: Palette,
    readonly spec: ActorSpec,
  ) {
    this.rig = boxRig(palette, spec);
    this.shadow = new THREE.Mesh(SHADOW_GEO, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(spec.height * 0.62);
    scene.add(this.rig.root);
    scene.add(this.shadow);
  }

  /** Faces the character; survives an {@link upgrade}. */
  setSpin(y: number): void {
    this.spin = y;
    this.rig.root.rotation.y = y;
  }

  get isSkinned(): boolean {
    return this.skinned;
  }

  /**
   * Replaces the box rig with a rigged glTF one, carrying across the only two
   * pieces of state the renderer does not rewrite every frame: visibility and
   * facing. Position, pose and opacity are re-applied on the next frame.
   */
  upgrade(library: ModelLibrary): void {
    if (this.skinned) return;
    const visible = this.rig.root.visible;
    const next = new SkinnedRig({
      template: library[this.spec.model],
      palette: this.palette,
      height: this.spec.height,
      bulk: this.spec.bulk,
      hunch: this.spec.hunch ?? (this.spec.archetype === 'elder' ? 0.3 : 0),
      headScale: this.spec.headScale,
      walk: this.spec.walk,
      backpack: this.spec.archetype === 'student',
      hat: this.spec.archetype === 'tourist',
      cane: this.spec.archetype === 'elder',
    });
    next.root.position.copy(this.rig.root.position);
    next.root.visible = visible;
    this.scene.remove(this.rig.root);
    this.rig.dispose();
    this.rig = next;
    this.skinned = true;
    this.scene.add(next.root);
    this.setSpin(this.spin);
  }

  setVisible(v: boolean): void {
    this.rig.root.visible = v;
    this.shadow.visible = v;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
    scene.remove(this.shadow);
    this.rig.dispose();
  }
}

function boxRig(palette: Palette, spec: ActorSpec): CharacterRig {
  return new Humanoid({
    palette,
    height: spec.height,
    swing: spec.swing,
    shoulders: spec.shoulders,
    archetype: spec.archetype,
    bulk: spec.bulk,
    hunch: spec.hunch,
  });
}

export class CharacterPool {
  private readonly live = new Map<number, Actor>();
  private readonly free = new Map<ActorKind, Actor[]>();
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly shadowTex: THREE.CanvasTexture;
  /** Marks which ids were seen this frame, so stale actors can be released. */
  private readonly seen = new Set<number>();
  /** Non-null once the background model load has succeeded. */
  private library: ModelLibrary | null = null;
  private disposed = false;

  readonly player: Actor;

  constructor(private readonly scene: THREE.Scene) {
    this.shadowTex = blobShadowTexture();
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.player = new Actor(scene, this.shadowMat, PALETTES.player, {
      height: PLAYER_H,
      swing: 0.95,
      strideMul: 1,
      bobMul: 1,
      swayMul: 1,
      model: 'casual',
    });

    void loadCharacterModels().then((library) => {
      if (!library || this.disposed) return;
      this.library = library;
      // The player is the one character always in frame, so it converts first.
      this.player.upgrade(library);
    });
  }

  beginFrame(): void {
    this.seen.clear();
    this.upgradeOne();
  }

  /**
   * Converts at most ONE live box actor per frame. Building a `SkinnedRig` clones
   * a skeleton and eight materials; doing a whole crowd in one frame is a visible
   * hitch, and spreading it over ~12 frames is imperceptible.
   */
  private upgradeOne(): void {
    const library = this.library;
    if (!library || this.skinnedCount() >= MAX_SKINNED) return;
    for (const actor of this.live.values()) {
      if (actor.isSkinned) continue;
      actor.upgrade(library);
      return;
    }
  }

  /** Actor for a live entity, created or recycled on first sight this frame. */
  acquire(id: number, kind: ActorKind): Actor {
    this.seen.add(id);
    const existing = this.live.get(id);
    if (existing) return existing;
    const pool = this.free.get(kind);
    const actor = pool?.pop() ?? new Actor(this.scene, this.shadowMat, paletteFor(kind), SPECS[kind]);
    if (this.library && !actor.isSkinned && this.skinnedCount() < MAX_SKINNED) {
      actor.upgrade(this.library);
    }
    actor.setVisible(true);
    actor.rig.upright();
    actor.rig.setOpacity(1);
    (actor as MutableActor).kind = kind;
    this.live.set(id, actor);
    return actor;
  }

  private skinnedCount(): number {
    let n = 0;
    for (const actor of this.live.values()) if (actor.isSkinned) n++;
    return n;
  }

  /** Retires every actor whose entity did not appear in this frame. */
  endFrame(): void {
    for (const [id, actor] of this.live) {
      if (this.seen.has(id)) continue;
      this.live.delete(id);
      actor.setVisible(false);
      const kind = (actor as MutableActor).kind;
      const pool = this.free.get(kind);
      if (pool) pool.push(actor);
      else this.free.set(kind, [actor]);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const actor of this.live.values()) actor.dispose(this.scene);
    for (const pool of this.free.values()) for (const actor of pool) actor.dispose(this.scene);
    this.player.dispose(this.scene);
    this.live.clear();
    this.free.clear();
    this.shadowMat.dispose();
    this.shadowTex.dispose();
  }
}

type MutableActor = Actor & { kind: ActorKind };

function paletteFor(kind: ActorKind): Palette {
  return kind === 'bumper' ? PALETTES.bumper : PED_PALETTES[kind];
}
