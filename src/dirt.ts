import * as THREE from 'three';
import { atlasGeometry, Atlas, Rect } from './uvatlas';

// سطح قابل للتنظيف: قناع وسخ (غبار / طين / صدأ) مرسوم فوق مادة النموذج.
// القناع يُخزَّن في الذاكرة (Float32) ويُرفع إلى كرت الشاشة فقط في الأسطر التي تغيّرت.

export type DirtFn = (p: THREE.Vector3, n: THREE.Vector3) => [number, number, number];

export interface SprayPower { dust: number; mud: number; rust: number }

const CLEAN_EPS = 0.08;  // تحت هذه القيمة يُعتبر البكسل نظيفًا
const PART_DONE = 0.985; // نسبة إكمال الجزء قبل أن «يلمع» ويُنظَّف بالكامل

const DUST = new THREE.Color(0x9c8f78);
const MUD = new THREE.Color(0x4a3524);
const RUST = new THREE.Color(0x8a3d16);

export class DirtSurface {
  readonly mesh: THREE.Mesh;
  readonly atlas: Atlas;
  readonly size: number;
  readonly dirt: Float32Array;   // 3 قنوات لكل بكسل
  readonly pixels: Uint8Array;   // RGBA للرفع
  readonly valid: Uint8Array;    // 1 إن كان البكسل داخل مثلّث فعلي
  readonly tex: THREE.DataTexture;
  readonly uniforms = { uScan: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } };
  validCount = 0;
  clean = 0;      // 0..1
  done = false;
  changed = true;
  private uploaded = false;
  private dirtyY0 = 1e9; private dirtyY1 = -1; private dirtyX0 = 1e9; private dirtyX1 = -1;

  constructor(mesh: THREE.Mesh, fn: DirtFn, density = 85, maxSize = 512) {
    this.mesh = mesh;
    this.atlas = atlasGeometry(mesh.geometry, density, maxSize);
    const s = (this.size = this.atlas.size);
    this.dirt = new Float32Array(s * s * 3);
    this.pixels = new Uint8Array(s * s * 4);
    this.valid = new Uint8Array(s * s);
    this.rasterize(fn);

    this.tex = new THREE.DataTexture(this.pixels, s, s, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.needsUpdate = true;

    patchMaterial(mesh.material as THREE.MeshStandardMaterial, this.tex, this.uniforms);
    mesh.userData.dirt = this;
  }

  /** يرسم الوسخ الأولي: لكل بكسل داخل مثلّث، نحسب موضعه الحقيقي ثم نسأل دالة الوسخ. */
  private rasterize(fn: DirtFn) {
    const s = this.size;
    const geo = this.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const index = geo.getIndex();
    const total = index ? index.count : pos.count;
    const idx = (i: number) => (index ? index.getX(i) : i);
    this.mesh.updateWorldMatrix(true, false);
    const m = this.mesh.matrixWorld;
    const nm = new THREE.Matrix3().getNormalMatrix(m);

    const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const N = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const ux = [0, 0, 0], uy = [0, 0, 0];

    for (let i = 0; i < total; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = idx(i + k);
        P[k].fromBufferAttribute(pos, v).applyMatrix4(m);
        N[k].fromBufferAttribute(nor, v).applyMatrix3(nm).normalize();
        ux[k] = uv.getX(v) * s; uy[k] = uv.getY(v) * s;
      }
      const x0 = Math.max(0, Math.floor(Math.min(ux[0], ux[1], ux[2])));
      const x1 = Math.min(s - 1, Math.ceil(Math.max(ux[0], ux[1], ux[2])));
      const y0 = Math.max(0, Math.floor(Math.min(uy[0], uy[1], uy[2])));
      const y1 = Math.min(s - 1, Math.ceil(Math.max(uy[0], uy[1], uy[2])));
      const den = (uy[1] - uy[2]) * (ux[0] - ux[2]) + (ux[2] - ux[1]) * (uy[0] - uy[2]);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const a = ((uy[1] - uy[2]) * (px - ux[2]) + (ux[2] - ux[1]) * (py - uy[2])) / den;
          const b = ((uy[2] - uy[0]) * (px - ux[2]) + (ux[0] - ux[2]) * (py - uy[2])) / den;
          const c = 1 - a - b;
          if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue;
          const t = y * s + x;
          if (this.valid[t]) continue;
          p.set(0, 0, 0).addScaledVector(P[0], a).addScaledVector(P[1], b).addScaledVector(P[2], c);
          n.set(0, 0, 0).addScaledVector(N[0], a).addScaledVector(N[1], b).addScaledVector(N[2], c).normalize();
          const d = fn(p, n);
          this.dirt[t * 3] = d[0]; this.dirt[t * 3 + 1] = d[1]; this.dirt[t * 3 + 2] = d[2];
          this.valid[t] = 1;
          this.validCount++;
        }
      }
    }
    // توسيع الحواف ببكسلين حتى لا تظهر خطوط عند الفواصل (texture filtering).
    for (let pass = 0; pass < 2; pass++) {
      const filled = this.valid.slice();
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const t = y * s + x;
        if (filled[t]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= s || yy >= s) continue;
          const o = yy * s + xx;
          if (!filled[o]) continue;
          this.dirt[t * 3] = this.dirt[o * 3]; this.dirt[t * 3 + 1] = this.dirt[o * 3 + 1]; this.dirt[t * 3 + 2] = this.dirt[o * 3 + 2];
          this.valid[t] = 2; // بكسل حافة: يُرسم لكن لا يُحسب في النسبة
          break;
        }
      }
    }
    for (let t = 0; t < s * s; t++) this.writePixel(t);
  }

  private writePixel(t: number) {
    const d = this.dirt, o = t * 4;
    this.pixels[o] = d[t * 3] * 255;
    this.pixels[o + 1] = d[t * 3 + 1] * 255;
    this.pixels[o + 2] = d[t * 3 + 2] * 255;
    this.pixels[o + 3] = 255;
  }

  /** عدد بكسلات القناع في المتر عند هذا المثلّث (للحصول على نصف قطر الرش بالبكسل). */
  pixelsPerMeter(faceIndex: number): number {
    const geo = this.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const index = geo.getIndex();
    const i = faceIndex * 3;
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    const pa = new THREE.Vector3().fromBufferAttribute(pos, a);
    const wa = Math.hypot(pa.distanceTo(new THREE.Vector3().fromBufferAttribute(pos, b)), 1e-6);
    const wb = Math.hypot(pa.distanceTo(new THREE.Vector3().fromBufferAttribute(pos, c)), 1e-6);
    const ua = Math.hypot(uv.getX(b) - uv.getX(a), uv.getY(b) - uv.getY(a));
    const ub = Math.hypot(uv.getX(c) - uv.getX(a), uv.getY(c) - uv.getY(a));
    return ((ua / wa + ub / wb) / 2) * this.size;
  }

  /**
   * رشّة عند نقطة UV. القوة بوحدة «كمية الوسخ المزالة في هذه الرشة».
   * تُرجع نسبة البكسلات التي بقي فيها صدأ لم يتأثّر (لنعرض تلميح «استعمل الرأس الضيّق»).
   */
  spray(uv: THREE.Vector2, faceIndex: number, radiusPx: number, pw: SprayPower): number {
    if (this.done) return 0;
    const s = this.size;
    const rect: Rect = this.atlas.rects[this.atlas.triRect[faceIndex]] ?? { x: 0, y: 0, w: s, h: s };
    const cx = uv.x * s, cy = uv.y * s;
    const r = Math.max(1.5, radiusPx);
    const x0 = Math.max(rect.x - 2, Math.floor(cx - r)), x1 = Math.min(rect.x + rect.w + 1, Math.ceil(cx + r));
    const y0 = Math.max(rect.y - 2, Math.floor(cy - r)), y1 = Math.min(rect.y + rect.h + 1, Math.ceil(cy + r));
    if (x0 > x1 || y0 > y1) return 0;
    const r2 = r * r;
    let rustLeft = 0, touched = 0;
    const d = this.dirt;
    for (let y = Math.max(0, y0); y <= Math.min(s - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(s - 1, x1); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const q = (dx * dx + dy * dy) / r2;
        if (q >= 1) continue;
        const f = 1 - q;
        const t = y * s + x, k = t * 3;
        touched++;
        // الطبقات فوق بعضها: الغبار ثم الطين ثم الصدأ.
        let budget = f;
        const dust = Math.min(d[k], budget * pw.dust);
        d[k] -= dust;
        budget -= pw.dust > 0 ? dust / pw.dust : 0;
        if (budget > 0 && d[k + 1] > 0) {
          const mud = Math.min(d[k + 1], budget * pw.mud);
          d[k + 1] -= mud;
          budget -= pw.mud > 0 ? mud / pw.mud : 0;
        }
        if (budget > 0 && d[k + 2] > 0) {
          if (pw.rust > 0) d[k + 2] -= Math.min(d[k + 2], budget * pw.rust);
          else if (d[k + 1] < 0.05 && d[k + 2] > CLEAN_EPS) rustLeft++;
        }
        this.writePixel(t);
      }
    }
    this.markDirty(x0, x1, y0, y1);
    this.changed = true;
    return touched ? rustLeft / touched : 0;
  }

  private markDirty(x0: number, x1: number, y0: number, y1: number) {
    const s = this.size;
    this.dirtyX0 = Math.max(0, Math.min(this.dirtyX0, x0)); this.dirtyX1 = Math.min(s - 1, Math.max(this.dirtyX1, x1));
    this.dirtyY0 = Math.max(0, Math.min(this.dirtyY0, y0)); this.dirtyY1 = Math.min(s - 1, Math.max(this.dirtyY1, y1));
  }

  /** يُستدعى مرة كل إطار: يرفع الأسطر التي تغيّرت فقط. */
  upload() {
    if (this.dirtyY1 < 0) return;
    if (this.uploaded) {
      const s = this.size;
      for (let y = this.dirtyY0; y <= this.dirtyY1; y++) {
        this.tex.addUpdateRange((y * s + this.dirtyX0) * 4, (this.dirtyX1 - this.dirtyX0 + 1) * 4);
      }
    }
    this.tex.needsUpdate = true;
    this.uploaded = true;
    this.dirtyY0 = 1e9; this.dirtyY1 = -1; this.dirtyX0 = 1e9; this.dirtyX1 = -1;
  }

  /** حساب نسبة النظافة بعيّنة منخفضة الدقة (كل 4 بكسلات). */
  measure(): number {
    if (!this.changed) return this.clean;
    this.changed = false;
    const s = this.size, d = this.dirt, step = s >= 256 ? 4 : 2;
    let total = 0, dirty = 0;
    for (let y = 1; y < s; y += step) for (let x = 1; x < s; x += step) {
      const t = y * s + x;
      if (this.valid[t] !== 1) continue;
      total++;
      const k = t * 3;
      if (d[k] > CLEAN_EPS || d[k + 1] > CLEAN_EPS || d[k + 2] > CLEAN_EPS) dirty++;
    }
    this.clean = total ? 1 - dirty / total : 1;
    return this.clean;
  }

  /** هل اكتمل الجزء الآن؟ (يرجع true مرة واحدة فقط) */
  checkDone(): boolean {
    if (this.done || this.clean < PART_DONE) return false;
    this.done = true;
    this.clean = 1;
    this.dirt.fill(0);
    for (let t = 0; t < this.size * this.size; t++) this.writePixel(t);
    this.tex.clearUpdateRanges();
    this.tex.needsUpdate = true;
    this.uniforms.uFlash.value = 1;
    return true;
  }

  tick(dt: number, time: number, scan: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uScan.value = this.done ? 0 : scan;
    if (this.uniforms.uFlash.value > 0) this.uniforms.uFlash.value = Math.max(0, this.uniforms.uFlash.value - dt * 1.8);
  }
}

type Uniforms = DirtSurface['uniforms'];

function patchMaterial(mat: THREE.MeshStandardMaterial, tex: THREE.Texture, u: Uniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.dirtMap = { value: tex };
    shader.uniforms.uScan = u.uScan;
    shader.uniforms.uFlash = u.uFlash;
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uDust = { value: DUST };
    shader.uniforms.uMud = { value: MUD };
    shader.uniforms.uRust = { value: RUST };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDirtUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDirtUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vDirtUv;
uniform sampler2D dirtMap;
uniform float uScan, uFlash, uTime;
uniform vec3 uDust, uMud, uRust;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 dm = texture2D(dirtMap, vDirtUv).rgb;
float rustA = smoothstep(0.02, 0.45, dm.b);
float mudA = smoothstep(0.02, 0.55, dm.g);
float dustA = smoothstep(0.02, 0.7, dm.r);
vec3 dc = diffuseColor.rgb;
dc = mix(dc, uRust * (0.75 + 0.5 * dm.b), rustA);
dc = mix(dc, uMud * (0.8 + 0.3 * dm.g), mudA * 0.97);
dc = mix(dc, uDust, dustA * 0.8);
diffuseColor.rgb = dc;
float dirtAmt = max(max(dustA, mudA), rustA);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.95, dirtAmt);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor *= 1.0 - dirtAmt;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.15, 0.85, 1.0) * uScan * smoothstep(0.05, 0.3, dirtAmt) * (0.45 + 0.25 * sin(uTime * 9.0));
totalEmissiveRadiance += vec3(1.0, 0.92, 0.7) * uFlash * uFlash * 0.8;`);
  };
  mat.customProgramCacheKey = () => 'dirt-v1';
  mat.needsUpdate = true;
}
