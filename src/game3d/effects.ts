import * as THREE from 'three';
import { comicScale } from '@/game/fx/comic';
import { MAX_COMIC } from '@/game/fx/comic';
import { MAX_PARTICLES } from '@/game/fx/particles';
import type { Fx } from '@/game/fx';
import { TUNING } from '@/game/tuning';
import { toWorldHeight, toWorldX, toWorldZ, WORLD_PER_VU } from './coords';

/**
 * 3D presentation of the existing FX pools.
 *
 * The pools themselves (particles, comic captions, shake) are untouched game
 * code running on the wall clock; this module only reads them. Everything is
 * pre-allocated to the pools' own hard caps, so an impact never allocates.
 */

/** Ground clearance so effects read as being at chest height, not underfoot. */
const FX_BASE_Y = 0.95;

// ---------------------------------------------------------------------------
// Particles: one THREE.Points for the whole pool.
// ---------------------------------------------------------------------------

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.32, d);
  if (a * vAlpha <= 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

export class ParticleView {
  private readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly sizes = new Float32Array(MAX_PARTICLES);
  private readonly alphas = new Float32Array(MAX_PARTICLES);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly scratch = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    // The pool is a fixed 220 points; dead slots are drawn with alpha 0 and
    // discarded in the shader, which is cheaper than rebuilding the buffer.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Device-pixel scale for `gl_PointSize`; depends on canvas height and fov. */
  setProjection(canvasHeightPx: number, fovRad: number): void {
    this.material.uniforms.uScale.value = (canvasHeightPx * 0.5) / Math.tan(fovRad / 2);
  }

  update(fx: Fx): void {
    this.alphas.fill(0);
    let i = 0;
    fx.particles.forEach((p) => {
      const k = p.life / p.maxLife;
      const o = i * 3;
      this.positions[o] = toWorldX(p.x);
      this.positions[o + 1] = FX_BASE_Y + toWorldHeight(p.y, p.originY);
      this.positions[o + 2] = toWorldZ(p.originY);
      this.scratch.set(p.color);
      this.colors[o] = this.scratch.r;
      this.colors[o + 1] = this.scratch.g;
      this.colors[o + 2] = this.scratch.b;
      // Virtual-unit sizes are tiny in world space; the shader's perspective
      // term does the rest, so this only needs to be proportional.
      this.sizes[i] = Math.max(0.01, p.size * k * WORLD_PER_VU * 0.6);
      this.alphas[i] = k;
      i += 1;
    });
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// Comic captions: camera-facing sprites with a canvas texture per slot.
// ---------------------------------------------------------------------------

const COMIC_CANVAS_W = 512;
const COMIC_CANVAS_H = 192;

class ComicSlot {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  /** Repaints only when the caption itself changes, not every frame. */
  private key = '';

  constructor(scene: THREE.Scene) {
    this.canvas.width = COMIC_CANVAS_W;
    this.canvas.height = COMIC_CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.visible = false;
    this.sprite.renderOrder = 10;
    scene.add(this.sprite);
  }

  paint(text: string, color: string, burst: boolean): void {
    const key = `${text}|${color}|${burst}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.clearRect(0, 0, COMIC_CANVAS_W, COMIC_CANVAS_H);
    g.save();
    g.translate(COMIC_CANVAS_W / 2, COMIC_CANVAS_H / 2);
    if (burst) drawStarburst(g, 118);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 92px system-ui, sans-serif';
    g.lineJoin = 'round';
    g.lineWidth = 20;
    g.strokeStyle = '#12101c';
    g.strokeText(text, 0, 0);
    g.fillStyle = color;
    g.fillText(text, 0, 0);
    g.restore();
    this.texture.needsUpdate = true;
  }

  setOpacity(a: number): void {
    this.material.opacity = a;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }
}

function drawStarburst(g: CanvasRenderingContext2D, radius: number) {
  const spikes = 12;
  g.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.62;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.62;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = '#ffffff2e';
  g.fill();
}

export class ComicView {
  private readonly slots: ComicSlot[];

  constructor(scene: THREE.Scene) {
    this.slots = Array.from({ length: MAX_COMIC }, () => new ComicSlot(scene));
  }

  update(fx: Fx): void {
    for (const slot of this.slots) slot.sprite.visible = false;
    fx.comic.forEach((p, i) => {
      const slot = this.slots[i];
      slot.paint(p.text, p.color, p.burst);
      const k = p.life / p.maxLife;
      // Captions pop ~1-3 world units from the camera, where the visible frame
      // is barely a unit across — so the sprite is far smaller than the naive
      // "virtual units to world units" conversion of its authored font size.
      const scale = comicScale(p) * p.size * WORLD_PER_VU * 0.75;
      slot.sprite.visible = true;
      slot.sprite.position.set(
        toWorldX(p.x),
        FX_BASE_Y + toWorldHeight(p.y, p.originY) + 0.5,
        toWorldZ(p.originY),
      );
      slot.sprite.scale.set(scale * (COMIC_CANVAS_W / COMIC_CANVAS_H), scale, 1);
      slot.setOpacity(Math.min(1, k * 2.5));
    });
  }

  dispose(): void {
    for (const slot of this.slots) slot.dispose();
  }
}

// ---------------------------------------------------------------------------
// Counter impact: comic speech bubble + a Perfect-only flash ring.
// ---------------------------------------------------------------------------

const BUBBLE_W = 512;
const BUBBLE_H = 384;
/** Wall-clock life of the speech bubble. */
const BUBBLE_MS = 780;
/** Wall-clock life of the Perfect flash ring. */
const FLASH_MS = 300;
/** Balloon height — above the HUD's centred result banner. */
const BUBBLE_Y = 2.75;
/** The ring sits on the villain's jaw, i.e. where the punch lands. */
const FLASH_Y = 1.85;

/**
 * Jagged comic speech balloon: a white starburst bubble with a heavy black
 * outline and a tail, with the punchy grade text ("POW!" / "정의구현!") set in
 * bold across it. Deterministic spike jitter, so the shape is the same every
 * time and the texture only repaints when the TEXT changes.
 */
function paintBubble(g: CanvasRenderingContext2D, text: string): void {
  g.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
  g.save();
  g.translate(BUBBLE_W / 2, BUBBLE_H * 0.44);

  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = '#12101c';
  g.fillStyle = '#ffffff';

  // Tail first: the bubble's own fill then covers where the two overlap.
  g.beginPath();
  g.moveTo(-58, 70);
  g.lineTo(-20, 96);
  g.lineTo(-104, 172);
  g.lineTo(-46, 84);
  g.closePath();
  g.fill();
  g.stroke();

  const spikes = 15;
  const rx = 228;
  const ry = 138;
  g.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    // Alternating long/short radii + a fixed wobble = hand-drawn jaggedness.
    const k = (i % 2 === 0 ? 1 : 0.76) + Math.sin(i * 2.4) * 0.045;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.stroke();

  // Text, shrunk to fit the flat middle of the balloon. No outline: black on
  // the balloon's white fill is already maximum contrast, and a stroke at this
  // size just fattens the glyphs until the word closes up.
  let size = 112;
  const maxW = rx * 1.12;
  do {
    g.font = `900 ${size}px system-ui, sans-serif`;
    if (g.measureText(text).width <= maxW) break;
    size -= 6;
  } while (size > 40);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#12101c';
  g.fillText(text, 0, 4);
  g.restore();
}

/** Overshoot pop-in, brief hold, then a fade — the classic comic sting. */
function bubbleScale(t: number): number {
  if (t < 0.16) return 0.25 + (t / 0.16) * 1.05;
  if (t < 0.34) return 1.3 - ((t - 0.16) / 0.18) * 0.3;
  return 1 + (t - 0.34) * 0.14;
}

export class ImpactView {
  private readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private readonly flash: THREE.Mesh;
  private readonly flashMat: THREE.MeshBasicMaterial;
  private readonly flashGeo: THREE.RingGeometry;
  private text = '';
  private bubbleStart = -Infinity;
  private flashStart = -Infinity;

  constructor(scene: THREE.Scene) {
    this.canvas.width = BUBBLE_W;
    this.canvas.height = BUBBLE_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.visible = false;
    this.sprite.renderOrder = 12;
    scene.add(this.sprite);

    // Thin and short-lived: additive blending this close to the camera blows
    // the whole frame out if the ring is either fat or long.
    this.flashGeo = new THREE.RingGeometry(0.84, 1, 40);
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd93d,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Mesh(this.flashGeo, this.flashMat);
    this.flash.visible = false;
    this.flash.renderOrder = 11;
    scene.add(this.flash);
  }

  /**
   * Fires at the impact point. `perfect` adds the yellow flash ring.
   *
   * The bubble gets its own X because the HUD's centred "정의구현!" banner owns
   * the middle of the screen: the caller pushes the balloon to whichever side
   * has room, and the view lifts it clear of the banner's line.
   */
  trigger(
    impactX: number,
    impactZ: number,
    bubbleX: number,
    text: string,
    perfect: boolean,
    nowMs: number,
  ): void {
    if (text !== this.text) {
      this.text = text;
      paintBubble(this.ctx, text);
      this.texture.needsUpdate = true;
    }
    this.sprite.position.set(bubbleX, BUBBLE_Y, impactZ);
    this.bubbleStart = nowMs;
    if (perfect) {
      this.flash.position.set(impactX, FLASH_Y, impactZ);
      this.flashStart = nowMs;
    }
  }

  /** Wall-clock driven, like every other FX in the game. */
  update(nowMs: number, camera: THREE.Camera): void {
    const bt = (nowMs - this.bubbleStart) / BUBBLE_MS;
    this.sprite.visible = bt >= 0 && bt < 1;
    if (this.sprite.visible) {
      const scale = bubbleScale(bt) * 1.55;
      this.sprite.scale.set(scale * (BUBBLE_W / BUBBLE_H), scale, 1);
      // Snap in at full opacity, fade over the last third.
      this.material.opacity = Math.min(1, (1 - bt) * 3);
    }

    const ft = (nowMs - this.flashStart) / FLASH_MS;
    this.flash.visible = ft >= 0 && ft < 1;
    if (this.flash.visible) {
      this.flash.quaternion.copy(camera.quaternion);
      this.flash.scale.setScalar(0.3 + ft * 1.05);
      this.flashMat.opacity = (1 - ft) * 0.55;
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.flashGeo.dispose();
    this.flashMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Counter ring: the 2D timing cue, re-cut as two ground decals.
// ---------------------------------------------------------------------------

const RING_BASE = (TUNING.ENTITY_R + 14) * WORLD_PER_VU;
const RING_REACH = 110 * WORLD_PER_VU;

/**
 * Approach ring shrinking onto a fixed target ring, closing EXACTLY at
 * `windowCenterTs` (leadMs === 0) — identical wall-clock math to the 2D cue.
 * Drawn flat on the road so it reads as a ground decal in perspective.
 */
export class CounterRingView {
  private readonly target: THREE.Mesh;
  private readonly approach: THREE.Mesh;
  private readonly targetMat: THREE.MeshBasicMaterial;
  private readonly approachMat: THREE.MeshBasicMaterial;
  private readonly geo: THREE.RingGeometry;

  constructor(scene: THREE.Scene) {
    // Unit ring (inner 0.86, outer 1.0), scaled per frame.
    this.geo = new THREE.RingGeometry(0.86, 1, 40);
    this.targetMat = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.approachMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.target = new THREE.Mesh(this.geo, this.targetMat);
    this.approach = new THREE.Mesh(this.geo, this.approachMat);
    for (const m of [this.target, this.approach]) {
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
    }
  }

  hide(): void {
    this.target.visible = false;
    this.approach.visible = false;
  }

  show(x: number, z: number, leadMs: number): void {
    const inPerfect = Math.abs(leadMs) <= TUNING.PERFECT_MS;
    const inGood = Math.abs(leadMs) <= TUNING.GOOD_MS;
    this.targetMat.color.setHex(inPerfect ? 0xffd93d : inGood ? 0x7ee787 : 0xffffff);
    this.targetMat.opacity = inPerfect ? 1 : inGood ? 0.9 : 0.42;

    this.target.visible = true;
    this.target.position.set(x, 0.03, z);
    const base = RING_BASE * (inPerfect ? 1.14 : 1);
    this.target.scale.setScalar(base);

    const k = Math.max(0, Math.min(1, leadMs / TUNING.COUNTER_CUE_LEAD_MS));
    this.approach.visible = leadMs > 0;
    if (leadMs > 0) {
      this.approach.position.set(x, 0.04, z);
      this.approach.scale.setScalar(RING_BASE + k * RING_REACH);
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.targetMat.dispose();
    this.approachMat.dispose();
  }
}
