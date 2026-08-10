import type * as THREE from 'three';
import type { Palette } from './rig';
import { measureHeight, readBoneRest, setSkinnedClone, type SkinnedTemplate } from './skinned';

/**
 * Lazy loader for the rigged character models.
 *
 * Nothing here is imported statically by the render path: `GLTFLoader` and
 * `SkeletonUtils` arrive through `import()` at the same time as the `.glb`
 * fetches, so /play's first-load JS is unchanged and the game is already
 * interactive (running on the procedural box rig) before a byte of model data is
 * requested.
 *
 * Every failure mode resolves to `null` rather than throwing: no network, a 404,
 * a corrupt file or a missing skeleton all just mean the box characters keep
 * playing. There is no error path the player can see.
 */

/** The three shared base meshes. Archetypes are tints and props on top. */
export type ModelKind = 'man' | 'woman' | 'casual';

const FILES: Record<ModelKind, string> = {
  man: '/models/man.glb',
  woman: '/models/woman.glb',
  casual: '/models/casual.glb',
};

/**
 * Material name -> palette slot, per model. This is the whole reason six
 * archetypes plus a villain fit in three downloads: the packs name their
 * materials, so a per-instance material clone recoloured through these maps
 * turns one mesh into a schoolkid, a pensioner or a tourist.
 *
 * Names not listed keep the pack's own colour (eyes, eyebrows, jewellery).
 */
const TINTS: Record<ModelKind, Record<string, keyof Palette>> = {
  // Quaternius "Business Man": Suit covers jacket + trousers, Black the shoes.
  man: { Skin: 'skin', Hair: 'hair', Suit: 'shirt', Tie: 'pants', Black: 'shoes' },
  // "Punk Women": Pink is the top, Black the jacket + leggings, Grey the soles.
  woman: { Skin: 'skin', Hair_Brown: 'hair', Pink: 'shirt', Black: 'pants', Grey: 'shoes' },
  // "Punk": Black is the jacket AND the boots, LightBlue the jeans.
  casual: { Skin: 'skin', Red: 'hair', Red_Dark: 'hair', Black: 'shirt', LightBlue: 'pants' },
};

export type ModelLibrary = Readonly<Record<ModelKind, SkinnedTemplate>>;

let pending: Promise<ModelLibrary | null> | null = null;

/**
 * Starts (or joins) the background load. Safe to call from every renderer
 * instance; the work happens once per page.
 */
export function loadCharacterModels(): Promise<ModelLibrary | null> {
  pending ??= load().catch(() => null);
  return pending;
}

async function load(): Promise<ModelLibrary | null> {
  const [{ GLTFLoader }, { clone }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/utils/SkeletonUtils.js'),
  ]);
  setSkinnedClone(clone as (scene: THREE.Object3D) => THREE.Object3D);

  const loader = new GLTFLoader();
  const kinds = Object.keys(FILES) as ModelKind[];
  const loaded = await Promise.all(kinds.map((k) => loader.loadAsync(FILES[k])));

  const library = {} as Record<ModelKind, SkinnedTemplate>;
  for (let i = 0; i < kinds.length; i++) {
    const scene = loaded[i].scene;
    const rest = readBoneRest(scene);
    // No skeleton means the pose code has nothing to drive: treat the whole
    // library as unusable rather than shipping a T-posing crowd.
    if (!rest.some((r) => r !== null)) return null;
    library[kinds[i]] = {
      scene,
      clips: loaded[i].animations,
      rest,
      height: measureHeight(scene),
      tint: TINTS[kinds[i]],
    };
  }
  return library;
}
