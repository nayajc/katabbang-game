import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BONE_NAMES,
  measureHeight,
  readBoneRest,
  setSkinnedClone,
  SkinnedRig,
  type SkinnedTemplate,
} from '@/game3d/skinned';

/**
 * Geometry contract for the rigged characters.
 *
 * The failure mode this exists for is silent: a bone the rig cannot find is
 * simply never posed, so a punch renders as a character standing still in its
 * bind pose with no error anywhere. `GLTFLoader` strips `.` from node names on
 * import, which is exactly enough to break every limb while leaving the spine
 * (`Hips`, `Chest`, `Head`) working — a bug that looks like bad animation tuning
 * rather than a lookup miss.
 *
 * So these tests assert on WORLD POSITIONS of the posed skeleton, not on the
 * numbers fed into it: the hand really is overhead during an uppercut, the feet
 * really do move with distance, and the gait really is deaf to the wall clock.
 */

const MODELS = ['man', 'woman', 'casual'] as const;

const templates = new Map<string, SkinnedTemplate>();

/** `GLTFLoader.parse` skips `FileLoader`, so this works with no DOM at all. */
function parse(file: string): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> {
  const bytes = readFileSync(resolve(process.cwd(), 'public/models', file));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(
      buffer as ArrayBuffer,
      '',
      (gltf) => res({ scene: gltf.scene as THREE.Group, clips: gltf.animations }),
      rej,
    );
  });
}

beforeAll(async () => {
  setSkinnedClone(clone as (scene: THREE.Object3D) => THREE.Object3D);
  for (const name of MODELS) {
    const { scene, clips } = await parse(`${name}.glb`);
    templates.set(name, {
      scene,
      clips,
      rest: readBoneRest(scene),
      height: measureHeight(scene),
      tint: {},
    });
  }
});

function rig(model: (typeof MODELS)[number], extra: Record<string, unknown> = {}): SkinnedRig {
  const r = new SkinnedRig({
    template: templates.get(model)!,
    palette: { skin: 0xffffff, hair: 0x000000, shirt: 0xff0000, pants: 0x00ff00, shoes: 0x0000ff },
    height: 1.5,
    ...extra,
  });
  // Nothing is in a scene, so world matrices need an explicit flush before any
  // world-space read. The renderer gets this for free from `render()`.
  r.root.updateMatrixWorld(true);
  return r;
}

/** World position of a named bone, after flushing matrices. */
function at(r: SkinnedRig, name: string): THREE.Vector3 {
  r.root.updateMatrixWorld(true);
  const bone = r.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
  expect(bone, `bone ${name} missing`).toBeTruthy();
  return bone!.getWorldPosition(new THREE.Vector3());
}

/**
 * Bone position measured against the chest.
 *
 * Every pose also leans, yaws and lifts the whole body, and that motion moves a
 * shoulder further than the shoulder joint itself does. Subtracting the chest
 * isolates the ARTICULATION, which is what these assertions are about.
 */
function relativeToChest(r: SkinnedRig, name: string): THREE.Vector3 {
  return at(r, name).sub(at(r, 'Chest'));
}

describe('skinned rig assets', () => {
  it.each(MODELS)('%s resolves every bone the pose code drives', (model) => {
    const rest = templates.get(model)!.rest;
    const missing = BONE_NAMES.filter((_, i) => rest[i] === null);
    expect(missing).toEqual([]);
  });

  it.each(MODELS)('%s is roughly human-proportioned', (model) => {
    // Sanity on the unit scale: a 1.6-2.1 unit tall export. A pack exported in
    // centimetres would fit-scale fine but make every bone-space prop offset
    // wrong, so pin the assumption down.
    expect(templates.get(model)!.height).toBeGreaterThan(1.5);
    expect(templates.get(model)!.height).toBeLessThan(2.2);
  });
});

describe('fight poses move the right bones', () => {
  it('jab throws the punching arm FORWARD, not up', () => {
    const r = rig('casual');
    const rest = relativeToChest(r, 'Wrist.R');
    r.jab(0.35, -1);
    const out = relativeToChest(r, 'Wrist.R');
    // The model faces local +Z (the player is yaw-flipped to run away from the
    // camera), so a straight punch drives the hand well forward of the chest.
    expect(out.z - rest.z).toBeGreaterThan(0.2);
    // And it stays a jab: no leap, feet planted.
    expect(Math.abs(at(r, 'Foot.L').y)).toBeLessThan(0.25);
  });

  it('uppercut puts the punching hand above the head and leaves the ground', () => {
    const r = rig('casual');
    const head = at(r, 'Head').y;
    // t=0.45 is peak extension: fully airborne, arm at full stretch.
    r.uppercut(0.45);
    expect(at(r, 'Wrist.R').y).toBeGreaterThan(head);
    // The whole body has left the road — the jump lives in the body group, so
    // the hips rise while `root` stays planted on the lane.
    expect(at(r, 'Hips').y).toBeGreaterThan(rig('casual').root.position.y + 1.0);
  });

  it('windUp hauls the striking arm BACK and turns the shoulders away', () => {
    const r = rig('casual');
    const restHand = relativeToChest(r, 'Wrist.R');
    const restShoulder = at(r, 'UpperArm.R').x - at(r, 'Chest').x;
    r.windUp(1);
    // Hauled behind the body — the opposite sign to the jab, which is what makes
    // the wind-up readable as a threat rather than as a punch already thrown.
    expect(relativeToChest(r, 'Wrist.R').z).toBeLessThan(restHand.z - 0.1);
    // Shoulders turned: the near shoulder swings across the body's centre line.
    expect(Math.abs(at(r, 'UpperArm.R').x - at(r, 'Chest').x)).toBeLessThan(
      Math.abs(restShoulder),
    );
  });

  it('a pose fully overrides the pose before it', () => {
    const r = rig('casual');
    r.windUp(1);
    const wound = at(r, 'Wrist.R');
    r.jab(0.35);
    const jabbed = at(r, 'Wrist.R');
    r.windUp(1);
    // Returning to the same pose must give the same skeleton, i.e. no residue
    // from the pose in between.
    expect(at(r, 'Wrist.R').distanceTo(wound)).toBeLessThan(1e-6);
    expect(jabbed.z).toBeGreaterThan(wound.z);
  });
});

describe('props ride the skeleton at world scale', () => {
  /** Bounding box of the props (the only Lambert-material meshes on the rig). */
  function propBox(r: SkinnedRig): THREE.Box3 {
    r.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    r.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.Material).type === 'MeshLambertMaterial') {
        box.expandByObject(mesh);
      }
    });
    return box;
  }

  it('the school backpack sits on the upper back at a plausible size', () => {
    const box = propBox(rig('man', { backpack: true }));
    const size = box.getSize(new THREE.Vector3());
    // Bone space carries the pack's own export scale; if that is not divided out
    // the prop lands either microscopic or the size of a building.
    expect(size.y).toBeGreaterThan(0.2);
    expect(size.y).toBeLessThan(0.7);
    // Behind the spine and around chest height on a 1.5-unit character.
    expect(box.getCenter(new THREE.Vector3()).z).toBeLessThan(0);
    expect(box.getCenter(new THREE.Vector3()).y).toBeGreaterThan(0.7);
  });

  it("the tourist's hat sits on top of the head", () => {
    const r = rig('woman', { hat: true });
    const box = propBox(r);
    expect(box.min.y).toBeGreaterThan(at(r, 'Head').y);
    expect(box.getSize(new THREE.Vector3()).x).toBeGreaterThan(0.3);
  });

  it('the cane reaches the pavement from the hand', () => {
    const r = rig('man', { cane: true });
    const box = propBox(r);
    // Long enough to look like a cane, and low enough to touch the ground.
    expect(box.getSize(new THREE.Vector3()).y).toBeGreaterThan(0.4);
    expect(box.min.y).toBeLessThan(0.35);
  });

  it("the child's head is scaled up without moving the body", () => {
    const plain = rig('casual');
    const child = rig('casual', { headScale: 1.3 });
    expect(at(child, 'Hips').y).toBeCloseTo(at(plain, 'Hips').y, 5);
    // Head bone position is unchanged; it is the descendants that grow.
    expect(at(child, 'Head').y).toBeCloseTo(at(plain, 'Head').y, 5);
  });
});

describe('locomotion is distance-driven, never wall-clock', () => {
  it('the same distance always gives the same pose', () => {
    const a = rig('casual');
    const b = rig('casual');
    a.stride(500, 3, 1.25);
    b.stride(500, 3, 1.25);
    expect(at(a, 'Foot.L').toArray()).toEqual(at(b, 'Foot.L').toArray());
  });

  it('repeating a frame at the same distance does not advance the gait', () => {
    const r = rig('casual');
    r.stride(500, 0);
    const first = at(r, 'Foot.L').clone();
    r.stride(500, 0);
    r.stride(500, 0);
    // If the mixer were being advanced by elapsed wall time, three identical
    // frames would walk the legs forward — and slowmo would stop slowing them.
    expect(at(r, 'Foot.L').distanceTo(first)).toBeLessThan(1e-9);
  });

  it('advancing distance advances the legs', () => {
    const r = rig('casual');
    r.stride(0, 0);
    const start = at(r, 'Foot.L').clone();
    r.stride(58, 0);
    expect(at(r, 'Foot.L').distanceTo(start)).toBeGreaterThan(0.02);
  });

  it('a per-entity phase offset desynchronises the crowd', () => {
    const a = rig('casual');
    const b = rig('casual');
    a.stride(300, 0, 1.25);
    b.stride(300, 1, 1.25);
    expect(at(a, 'Foot.L').distanceTo(at(b, 'Foot.L'))).toBeGreaterThan(0.02);
  });
});
