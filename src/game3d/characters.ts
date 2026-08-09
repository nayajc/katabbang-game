import * as THREE from 'three';
import { TUNING } from '@/game/tuning';
import { Humanoid, PALETTES, type Palette } from './humanoid';
import { blobShadowTexture } from './world';
import { WORLD_PER_VU } from './coords';

/**
 * Character pool. One {@link Humanoid} per live entity, recycled by kind so a
 * steady run never allocates. Entities are keyed by their simulation id, which
 * is stable for the whole life of the entity.
 */

const PLAYER_H = TUNING.PLAYER_R * 3 * WORLD_PER_VU;
const ENTITY_H = TUNING.ENTITY_R * 2.9 * WORLD_PER_VU;

export type ActorKind = 'bumper' | 'ped0' | 'ped1' | 'ped2';

/** Pedestrian variant for an entity id — stable across frames (was `pedestrianSprite`). */
export function pedestrianVariant(id: number): 0 | 1 | 2 {
  return (Math.abs(id) % 3) as 0 | 1 | 2;
}

export class Actor {
  readonly humanoid: Humanoid;
  readonly shadow: THREE.Mesh;

  constructor(scene: THREE.Scene, shadowMat: THREE.Material, palette: Palette, spec: ActorSpec) {
    this.humanoid = new Humanoid({
      palette,
      height: spec.height,
      swing: spec.swing,
      shoulders: spec.shoulders,
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

type ActorSpec = { height: number; swing: number; shoulders?: boolean };

const SHADOW_GEO = new THREE.PlaneGeometry(1, 1);

const SPECS: Record<ActorKind, ActorSpec> = {
  // The villain is visibly bigger and plods with a heavy, wide swing.
  bumper: { height: ENTITY_H * 1.22, swing: 0.62, shoulders: true },
  ped0: { height: ENTITY_H, swing: 0.5 },
  ped1: { height: ENTITY_H * 0.96, swing: 0.5 },
  ped2: { height: ENTITY_H * 1.04, swing: 0.5 },
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
  if (kind === 'bumper') return PALETTES.bumper;
  return PALETTES.pedestrian[kind === 'ped0' ? 0 : kind === 'ped1' ? 1 : 2];
}
