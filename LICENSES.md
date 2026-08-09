# Third-party assets and licenses

## 3D characters — none downloaded (procedural)

The 3D presentation layer uses **no third-party model files**. Every character
(player, bumper, pedestrians) is built at runtime in `src/game3d/humanoid.ts`
from ~10 box primitives in nested pivot groups, with a hand-coded run cycle.

CC0 rigged glTF sets (Quaternius *Ultimate Animated Characters*, KayKit
*Character Pack*) were evaluated first, as planned. Procedural humanoids were
chosen instead for three reasons:

1. **Bundle budget.** `/play` first-load JS has a 350 KB gzip ceiling and
   three.js alone is 143 KB gzip. `GLTFLoader` plus a rigged, animated character
   set would have added roughly 30 KB of loader code and 0.5–2 MB of `.glb`.
2. **Mobile frame budget.** Skinned meshes with animation mixers cost per-frame
   CPU for every character on screen. Box hierarchies cost a few matrix updates.
3. **Animation fidelity to the existing game.** The run cycle must be driven by
   **distance travelled** (`scrollY / STRIDE_VU` from `src/game/anim.ts`) so it
   speeds up with the world and slows down during slowmo, exactly as the 2D
   version did. A baked glTF clip would have to be re-timed against that phase
   anyway.

If rigged characters are wanted later, the drop-in point is
`src/game3d/characters.ts` (`Actor`) — the pool already isolates creation,
recycling and disposal from the renderer.

## three.js

- **Package:** `three@0.185.x`
- **License:** MIT — Copyright © 2010–2025 three.js authors
- **Source:** https://github.com/mrdoob/three.js

## Textures

All textures (road surface, sky gradient, blob shadow, comic captions) are
generated at runtime into `<canvas>` elements in `src/game3d/world.ts` and
`src/game3d/effects.ts`. No image files are fetched.

## Legacy 2D sprites

`public/sprites/*.webp` were used by the retired 2D renderer and are no longer
loaded by the game. They remain in the repository as the original AI-generated
project assets.
