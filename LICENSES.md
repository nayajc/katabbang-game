# Third-party assets and licenses

## 3D characters — Quaternius (CC0)

`public/models/*.glb` are the rigged, animated characters. All three are from
**Quaternius**, released under **CC0 1.0 Universal** (public domain dedication):
no attribution required, and none of the packs carry a share-alike or
non-commercial term.

| file | source model | pack |
|---|---|---|
| `man.glb` | *Business Man* | Ultimate Modular Men |
| `woman.glb` | *Punk Women* | Ultimate Modular Women |
| `casual.glb` | *Punk* | Ultimate Modular Men |

- **Author:** Quaternius — https://quaternius.com
- **License:** CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/
  (stated on each pack page under "License: CC0")
- **Pack pages:**
  - https://quaternius.com/packs/ultimatemodularcharacters.html (Ultimate Modular Men)
  - https://quaternius.com/packs/ultimatemodularwomen.html (Ultimate Modular Women)
- **Format note.** Quaternius distributes these packs as FBX / OBJ / Blend only.
  The `.glb` conversions used here were produced with `FBX2glTF v0.9.7` (visible
  in each file's `asset.generator`) and fetched from a public repository that
  redistributes them, which CC0 expressly permits:
  `github.com/Ilim-Hilimuddin/RUN-AWAY-RACER/tree/HEAD/assets/character`
  (`Business Man.glb`, `Punk Women.glb`, `Punk.glb`). If they ever need rebuilding
  from source, take the FBX from the pack pages above and convert it.

All three share one skeleton (the Quaternius universal humanoid rig, 62 joints),
which is why one bone map in `src/game3d/skinned.ts` drives all of them and why
their animation clips are interchangeable.

### What was done to them

The packs ship ~1.4 MB per model with 24 animation clips. The build applied:

```sh
# 1. keep only the clips the game plays (Run, Walk); drop the other 22
#    (Idle, Punch, Kick, Roll, Sword, Gun, Death, Wave, ...)
# 2. compress
npx @gltf-transform/cli optimize in.glb out.glb \
  --compress quantize --palette false --simplify true --simplify-error 0.002 \
  --texture-compress false
```

`--compress quantize` and not draco/meshopt on purpose: quantization is
`KHR_mesh_quantization`, which `GLTFLoader` reads natively. Draco and meshopt
each need a separate decoder shipped alongside, which would have cost more JS
than the extra bytes save.

`--palette false` is load-bearing: material palettes would merge the material
list, and per-material tinting is how six archetypes plus a villain are built
from three meshes (see `TINTS` in `src/game3d/models.ts`).

Result — **1.17 MB total on disk, 399 KB gzip on the wire**, against a 2.5 MB
budget:

| file | raw | gzip |
|---|---|---|
| `man.glb` | 434.2 KB | 140.6 KB |
| `woman.glb` | 396.9 KB | 132.9 KB |
| `casual.glb` | 370.1 KB | 125.0 KB |
| **total** | **1,229,976 B** | **408,086 B** |

The models are **lazy fetches, not bundle**: nothing requests them until the
game canvas mounts, and if they never arrive the procedural box characters keep
playing (see `src/game3d/models.ts`).

### Procedural characters (still shipped)

`src/game3d/humanoid.ts` is **not** dead code. It builds the same characters out
of ~10 box primitives, and it is what every run starts on and what a failed or
slow model fetch falls back to permanently. Both implementations satisfy
`CharacterRig` in `src/game3d/rig.ts`.

## three.js

- **Package:** `three@0.185.x`
- **License:** MIT — Copyright © 2010–2025 three.js authors
- **Source:** https://github.com/mrdoob/three.js

## Textures

The character models are **textureless** — they colour by material, which is
exactly what makes per-instance tinting cheap. Every other texture (road
surface, sky gradient, blob shadow, comic captions, character props) is generated
at runtime into a `<canvas>` in `src/game3d/world.ts` / `effects.ts`. No image
files are fetched.

## Legacy 2D sprites

`public/sprites/*.webp` were used by the retired 2D renderer and are no longer
loaded by the game. They remain in the repository as the original AI-generated
project assets.
