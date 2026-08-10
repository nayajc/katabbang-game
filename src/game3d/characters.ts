import * as THREE from 'three';
import { TUNING } from '@/game/tuning';
import { Humanoid, PALETTES, PED_PALETTES, type Archetype, type Palette } from './humanoid';
import { blobShadowTexture } from './world';
import { WORLD_PER_VU } from './coords';

/**
 * Character pool. One {@link Humanoid} per live entity, recycled by kind so a
 * steady run never allocates. Entities are keyed by their simulation id, which
 * is stable for the whole life of the entity.
 */

const PLAYER_H = TUNING.PLAYER_R * 3 * WORLD_PER_VU;
const ENTITY_H = TUNING.ENTITY_R * 2.9 * WORLD_PER_VU;

export type PedKind = keyof typeof PED_PALETTES;
export type ActorKind = 'bumper' | PedKind;

/**
 * The street's cast list. Read modulo the entity id, so the mix is deterministic
 * from the simulation seed and stable for the whole life of an entity — no RNG
 * of its own, and a replayed seed replays the same crowd.
 *
 * 16 slots: 6 adults, 4 women, 3 children, 3 elderly.
 */
const PED_MIX = [
  'adultA', 'womanA', 'adultB', 'childA',
  'elderA', 'adultA', 'womanB', 'adultB',
  'childB', 'womanA', 'adultA', 'elderB',
  'womanB', 'adultB', 'childA', 'elderA',
] as const satisfies readonly PedKind[];

/** Pedestrian variant for an entity id — stable across frames. */
export function pedestrianVariant(id: number): PedKind {
  return PED_MIX[Math.abs(id) % PED_MIX.length];
}

export class Actor {
  readonly humanoid: Humanoid;
  readonly shadow: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    shadowMat: THREE.Material,
    palette: Palette,
    readonly spec: ActorSpec,
  ) {
    this.humanoid = new Humanoid({
      palette,
      height: spec.height,
      swing: spec.swing,
      shoulders: spec.shoulders,
      archetype: spec.archetype,
      bulk: spec.bulk,
      hunch: spec.hunch,
    });
    this.shadow = new THREE.Mesh(SHADOW_GEO, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(spec.height * 0.62);
    scene.add(this.humanoid.root);
    scene.add(this.shadow);
  }

  setVisible(v: boolean): void {
    this.humanoid.root.visible = v;
    this.shadow.visible = v;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.humanoid.root);
    scene.remove(this.shadow);
    this.humanoid.dispose();
  }
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
};

const SHADOW_GEO = new THREE.PlaneGeometry(1, 1);

/**
 * Archetype specs. `strideMul` / `bobMul` / `swayMul` are the whole gait
 * vocabulary: the elderly shuffle (long slow cycle, almost no swing), children
 * bounce (short quick cycle, exaggerated bob) and women get a touch more sway.
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
  },
  adultA: { height: ENTITY_H, swing: 0.5, strideMul: 1.25, bobMul: 1, swayMul: 1 },
  adultB: { height: ENTITY_H * 1.04, swing: 0.52, strideMul: 1.34, bobMul: 1, swayMul: 1 },
  womanA: { height: ENTITY_H * 0.95, swing: 0.44, archetype: 'woman', strideMul: 1.16, bobMul: 0.9, swayMul: 1.2 },
  womanB: { height: ENTITY_H * 0.93, swing: 0.46, archetype: 'woman', strideMul: 1.22, bobMul: 0.9, swayMul: 1.2 },
  childA: { height: ENTITY_H * 0.66, swing: 0.78, archetype: 'child', strideMul: 0.86, bobMul: 1.8, swayMul: 1.15 },
  childB: { height: ENTITY_H * 0.7, swing: 0.74, archetype: 'child', strideMul: 0.92, bobMul: 1.7, swayMul: 1.15 },
  elderA: { height: ENTITY_H * 0.88, swing: 0.22, archetype: 'elder', strideMul: 1.95, bobMul: 0.45, swayMul: 0.6 },
  elderB: { height: ENTITY_H * 0.9, swing: 0.2, archetype: 'elder', strideMul: 2.1, bobMul: 0.4, swayMul: 0.6 },
};

export class CharacterPool {
  private readonly live = new Map<number, Actor>();
  private readonly free = new Map<ActorKind, Actor[]>();
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly shadowTex: THREE.CanvasTexture;
  /** Marks which ids were seen this frame, so stale actors can be released. */
  private readonly seen = new Set<number>();

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
    });
  }

  beginFrame(): void {
    this.seen.clear();
  }

  /** Actor for a live entity, created or recycled on first sight this frame. */
  acquire(id: number, kind: ActorKind): Actor {
    this.seen.add(id);
    const existing = this.live.get(id);
    if (existing) return existing;
    const pool = this.free.get(kind);
    const actor = pool?.pop() ?? new Actor(this.scene, this.shadowMat, paletteFor(kind), SPECS[kind]);
    actor.setVisible(true);
    actor.humanoid.upright();
    actor.humanoid.setOpacity(1);
    (actor as MutableActor).kind = kind;
    this.live.set(id, actor);
    return actor;
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
