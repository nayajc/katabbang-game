import * as THREE from 'three';
import { ROAD_HALF_W, ROAD_TILE, WORLD_PER_VU } from './coords';

/**
 * Static environment: sky, lights, fog, the scrolling road and the recycled
 * city props. Nothing here allocates per frame — `update(scrollY)` only writes
 * a texture offset and a handful of z positions.
 */

const ROAD_LEN = 90;
const SKY_TOP = 0x1a2246;
const SKY_BOTTOM = 0x4a5590;
export const FOG_COLOR = 0x38406b;

/** Buildings per side, and their spacing along the road. */
const PROP_COUNT = 15;
const PROP_SPACING = 6;
const PROP_SPAN = PROP_COUNT * PROP_SPACING;

/** Deterministic pseudo-random in [0,1) — the skyline is the same every run. */
function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function roadTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  g.fillStyle = '#2c3149';
  g.fillRect(0, 0, W, H);
  // Subtle asphalt grain so the surface is not a flat gradient-free slab.
  g.fillStyle = '#00000018';
  for (let i = 0; i < 260; i += 1) {
    g.fillRect(hash(i) * W, hash(i + 977) * H, 2, 2);
  }
  // Road edges (virtual x 60 and 480 map to u 0 and 1).
  g.fillStyle = '#59628f';
  g.fillRect(0, 0, 5, H);
  g.fillRect(W - 5, 0, 5, H);
  // Dashed lane separators at virtual x 210 / 330.
  g.fillStyle = '#8b95c9';
  for (const u of [0.357, 0.643]) {
    g.fillRect(u * W - 2.5, H * 0.1, 5, H * 0.5);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, ROAD_LEN / ROAD_TILE);
  tex.anisotropy = 4;
  return tex;
}

/** Soft radial blob used as a contact shadow (no shadow maps: mobile budget). */
export function blobShadowTexture(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

function skyDome(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, `#${SKY_TOP.toString(16).padStart(6, '0')}`);
  grad.addColorStop(0.62, `#${SKY_BOTTOM.toString(16).padStart(6, '0')}`);
  grad.addColorStop(1, `#${FOG_COLOR.toString(16).padStart(6, '0')}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(180, 16, 12),
    // fog:false — the dome IS the horizon, so fog must not wash it out.
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  mesh.renderOrder = -1;
  return mesh;
}

export class World {
  private readonly roadTex: THREE.CanvasTexture;
  private readonly props: THREE.Mesh[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(scene: THREE.Scene) {
    scene.fog = new THREE.Fog(FOG_COLOR, 10, 34);

    scene.add(new THREE.HemisphereLight(0xa8c0ff, 0x2a2740, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d4, 1.15);
    sun.position.set(5, 12, 6);
    scene.add(sun);

    const sky = skyDome();
    scene.add(sky);
    this.disposables.push(sky.geometry, sky.material as THREE.Material);

    // --- road ---
    this.roadTex = roadTexture();
    const roadGeo = new THREE.PlaneGeometry(ROAD_HALF_W * 2, ROAD_LEN);
    const roadMat = new THREE.MeshLambertMaterial({ map: this.roadTex });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -ROAD_LEN / 2 + 10;
    scene.add(road);
    this.disposables.push(roadGeo, roadMat, this.roadTex);

    // --- sidewalks: raised kerbs framing the road ---
    const kerbGeo = new THREE.BoxGeometry(1.6, 0.22, ROAD_LEN);
    const kerbMat = new THREE.MeshLambertMaterial({ color: 0x474e75 });
    for (const side of [-1, 1] as const) {
      const kerb = new THREE.Mesh(kerbGeo, kerbMat);
      kerb.position.set(side * (ROAD_HALF_W + 0.8), 0.11, road.position.z);
      scene.add(kerb);
    }
    this.disposables.push(kerbGeo, kerbMat);

    // --- ground beyond the sidewalks ---
    const groundGeo = new THREE.PlaneGeometry(120, ROAD_LEN);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x232842 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, road.position.z);
    scene.add(ground);
    this.disposables.push(groundGeo, groundMat);

    // --- recycled skyline: low-poly boxes with flat colours ---
    const propGeo = new THREE.BoxGeometry(1, 1, 1);
    const propMats = [0x39406b, 0x2f3559, 0x444a7a, 0x2a2f4e].map(
      (color) => new THREE.MeshLambertMaterial({ color }),
    );
    this.disposables.push(propGeo, ...propMats);
    for (let i = 0; i < PROP_COUNT * 2; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const h = 2.5 + hash(i) * 9;
      const w = 2.2 + hash(i + 31) * 2.4;
      const mesh = new THREE.Mesh(propGeo, propMats[i % propMats.length]);
      mesh.scale.set(w, h, 2.2 + hash(i + 57) * 2);
      mesh.position.set(side * (ROAD_HALF_W + 2.6 + hash(i + 13) * 2.2), h / 2, 0);
      mesh.userData.slot = Math.floor(i / 2);
      scene.add(mesh);
      this.props.push(mesh);
    }
  }

  /** Scrolls the road texture and recycles the props, from the sim's distance. */
  update(scrollY: number): void {
    const travelled = scrollY * WORLD_PER_VU;
    this.roadTex.offset.y = (travelled / ROAD_TILE) % 1;
    for (const mesh of this.props) {
      const raw = (mesh.userData.slot as number) * PROP_SPACING + travelled;
      mesh.position.z = ((raw % PROP_SPAN) + PROP_SPAN) % PROP_SPAN - PROP_SPAN + 8;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
