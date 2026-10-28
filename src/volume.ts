import * as THREE from 'three';

// قناع الوسخ ثلاثي الأبعاد: شبكة صغيرة (voxels) تغلّف النموذج كله.
// كل جزء يرسم الوسخ حسب موضعه في هذه الشبكة، فلا نحتاج UV خاصة لكل شكل،
// ويشتغل مع أي نموذج (أشكال منحنية، أو ملفات glTF لاحقًا).
// الشبكة محفوظة في DataArrayTexture (طبقة لكل شريحة z)، ونرفع فقط الطبقات التي تغيّرت.

export type DirtFn = (p: THREE.Vector3, n: THREE.Vector3) => [number, number, number];
export interface SprayPower { dust: number; mud: number; rust: number }

const CLEAN_EPS = 0.08;  // تحت هذه القيمة يُعتبر الجزء نظيفًا
const PART_DONE = 0.985; // نسبة الإكمال التي «يلمع» بعدها الجزء ويُنظَّف كليًا

export interface PartState {
  mesh: THREE.Mesh;
  name: string;
  area: number;
  core: Int32Array;   // الخلايا التي يغطيها سطح هذا الجزء
  owned: Int32Array;  // نفسها + الحواف الموسّعة
  clean: number;
  done: boolean;
  changed: boolean;
  flash: { value: number };
}

export class DirtVolume {
  readonly root: THREE.Object3D;
  readonly voxel: number;
  readonly min: THREE.Vector3;
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly dirt: Float32Array;
  readonly pixels: Uint8Array;
  readonly owner: Int16Array;
  readonly tex: THREE.DataArrayTexture;
  readonly parts: PartState[] = [];
  readonly uniforms = {
    dirtVol: { value: null as THREE.DataArrayTexture | null },
    uVolMat: { value: new THREE.Matrix4() },
    uVolDims: { value: new THREE.Vector3() },
    uScan: { value: 0 },
    uTime: { value: 0 },
  };
  private rootInv = new THREE.Matrix4();
  private pendingLayers = new Set<number>();
  private uploaded = false;
  private tmp = new THREE.Vector3();

  constructor(root: THREE.Object3D, parts: { mesh: THREE.Mesh; fn: DirtFn; name?: string }[], voxel = 0.035, margin = 0.08) {
    this.root = root;
    this.voxel = voxel;
    root.updateMatrixWorld(true);
    this.rootInv.copy(root.matrixWorld).invert();

    // حدود الشبكة في فضاء النموذج
    const box = new THREE.Box3();
    for (const p of parts) {
      const rel = new THREE.Matrix4().multiplyMatrices(this.rootInv, p.mesh.matrixWorld);
      p.mesh.geometry.computeBoundingBox();
      box.union(p.mesh.geometry.boundingBox!.clone().applyMatrix4(rel));
    }
    box.expandByScalar(margin);
    this.min = box.min.clone();
    const size = box.getSize(new THREE.Vector3());
    this.nx = Math.ceil(size.x / voxel); this.ny = Math.ceil(size.y / voxel); this.nz = Math.ceil(size.z / voxel);
    const n = this.nx * this.ny * this.nz;
    this.dirt = new Float32Array(n * 3);
    this.pixels = new Uint8Array(n * 4);
    this.owner = new Int16Array(n).fill(-1);

    const coreFlag = new Uint8Array(n);
    parts.forEach((p, i) => this.sampleSurface(p.mesh, p.fn, i, coreFlag));
    this.dilate(coreFlag, 2);

    // قوائم الخلايا لكل جزء
    const coreLists: number[][] = parts.map(() => []), ownedLists: number[][] = parts.map(() => []);
    for (let v = 0; v < n; v++) {
      const o = this.owner[v];
      if (o < 0) continue;
      ownedLists[o].push(v);
      if (coreFlag[v]) coreLists[o].push(v);
    }
    parts.forEach((p, i) => {
      this.parts.push({
        mesh: p.mesh, name: p.name ?? p.mesh.name, area: meshArea(p.mesh),
        core: Int32Array.from(coreLists[i]), owned: Int32Array.from(ownedLists[i]),
        clean: coreLists[i].length ? 0 : 1, done: coreLists[i].length === 0, changed: true, flash: { value: 0 },
      });
      p.mesh.userData.part = i;
    });

    for (let v = 0; v < n; v++) this.writePixel(v);
    this.tex = new THREE.DataArrayTexture(this.pixels, this.nx, this.ny, this.nz);
    this.tex.format = THREE.RGBAFormat;
    this.tex.type = THREE.UnsignedByteType;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.needsUpdate = true;

    // مصفوفة: عالم → إحداثيات 0..1 داخل الشبكة
    const s = new THREE.Vector3(1 / (this.nx * voxel), 1 / (this.ny * voxel), 1 / (this.nz * voxel));
    this.uniforms.dirtVol.value = this.tex;
    this.uniforms.uVolMat.value.makeScale(s.x, s.y, s.z)
      .multiply(new THREE.Matrix4().makeTranslation(-this.min.x, -this.min.y, -this.min.z))
      .multiply(this.rootInv);
    this.uniforms.uVolDims.value.set(this.nx, this.ny, this.nz);

    this.parts.forEach((p) => patchMaterial(p.mesh.material as THREE.MeshStandardMaterial, this.uniforms, p.flash));
  }

  /** سطح إضافي (ملصق، لوحة...) يأخذ الوسخ من الشبكة دون أن يُحسب كجزء مستقل. */
  addOverlay(mesh: THREE.Mesh) {
    patchMaterial(mesh.material as THREE.MeshStandardMaterial, this.uniforms, { value: 0 });
  }

  private index(x: number, y: number, z: number) { return x + this.nx * (y + this.ny * z); }

  /** نأخذ نقاطًا كثيرة على سطح الجزء ونعلّم الخلايا التي يمرّ منها، مع قيمة الوسخ الأولية. */
  private sampleSurface(mesh: THREE.Mesh, fn: DirtFn, part: number, coreFlag: Uint8Array) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const index = geo.getIndex();
    const total = index ? index.count : pos.count;
    const idx = (i: number) => (index ? index.getX(i) : i);
    const rel = new THREE.Matrix4().multiplyMatrices(this.rootInv, mesh.matrixWorld);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), p = new THREE.Vector3();
    const density = 4 / (this.voxel * this.voxel);
    for (let i = 0; i < total; i += 3) {
      a.fromBufferAttribute(pos, idx(i)).applyMatrix4(rel);
      b.fromBufferAttribute(pos, idx(i + 1)).applyMatrix4(rel);
      c.fromBufferAttribute(pos, idx(i + 2)).applyMatrix4(rel);
      e1.subVectors(b, a); e2.subVectors(c, a);
      nrm.crossVectors(e1, e2);
      const area = nrm.length() * 0.5;
      if (area < 1e-9) continue;
      nrm.normalize();
      const count = Math.max(3, Math.ceil(area * density));
      for (let k = 0; k < count; k++) {
        let u = Math.random(), v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        p.copy(a).addScaledVector(e1, u).addScaledVector(e2, v);
        this.mark(p, nrm, fn, part, coreFlag);
      }
      this.mark(a, nrm, fn, part, coreFlag); this.mark(b, nrm, fn, part, coreFlag); this.mark(c, nrm, fn, part, coreFlag);
    }
  }

  private mark(p: THREE.Vector3, n: THREE.Vector3, fn: DirtFn, part: number, coreFlag: Uint8Array) {
    const x = Math.floor((p.x - this.min.x) / this.voxel), y = Math.floor((p.y - this.min.y) / this.voxel), z = Math.floor((p.z - this.min.z) / this.voxel);
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return;
    const v = this.index(x, y, z);
    if (coreFlag[v]) return;
    coreFlag[v] = 1;
    this.owner[v] = part;
    this.tmp.set(this.min.x + (x + 0.5) * this.voxel, this.min.y + (y + 0.5) * this.voxel, this.min.z + (z + 0.5) * this.voxel);
    const d = fn(this.tmp, n);
    this.dirt[v * 3] = d[0]; this.dirt[v * 3 + 1] = d[1]; this.dirt[v * 3 + 2] = d[2];
  }

  /** توسيع القناع حول السطح حتى لا يبهت الوسخ بسبب الاستيفاء بين الخلايا. */
  private dilate(coreFlag: Uint8Array, passes: number) {
    const { nx, ny, nz } = this;
    const nb = [1, -1, nx, -nx, nx * ny, -nx * ny];
    for (let pass = 0; pass < passes; pass++) {
      const filled = Uint8Array.from(this.owner, (o) => (o >= 0 ? 1 : 0));
      for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
        const v = this.index(x, y, z);
        if (filled[v]) continue;
        for (const d of nb) {
          const o = v + d;
          if (!filled[o]) continue;
          this.owner[v] = this.owner[o];
          this.dirt[v * 3] = this.dirt[o * 3]; this.dirt[v * 3 + 1] = this.dirt[o * 3 + 1]; this.dirt[v * 3 + 2] = this.dirt[o * 3 + 2];
          break;
        }
      }
    }
    void coreFlag;
  }

  private writePixel(v: number) {
    const d = this.dirt, o = v * 4;
    this.pixels[o] = d[v * 3] * 255;
    this.pixels[o + 1] = d[v * 3 + 1] * 255;
    this.pixels[o + 2] = d[v * 3 + 2] * 255;
    this.pixels[o + 3] = 255;
  }

  /**
   * رشّة في نقطة من العالم بنصف قطر بالمتر. تُرجع نسبة الخلايا التي فيها صدأ لم يتأثّر
   * (لنعرض تلميح «استعمل الرأس الضيّق»).
   */
  spray(world: THREE.Vector3, radius: number, pw: SprayPower): number {
    const p = this.tmp.copy(world).applyMatrix4(this.rootInv);
    const cx = (p.x - this.min.x) / this.voxel - 0.5, cy = (p.y - this.min.y) / this.voxel - 0.5, cz = (p.z - this.min.z) / this.voxel - 0.5;
    const r = Math.max(1.2, radius / this.voxel), r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.nx - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.ny - 1, Math.ceil(cy + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(this.nz - 1, Math.ceil(cz + r));
    const d = this.dirt;
    let touched = 0, rustLeft = 0;
    for (let z = z0; z <= z1; z++) {
      let layerHit = false;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const q = (dx * dx + dy * dy + dz * dz) / r2;
        if (q >= 1) continue;
        const v = this.index(x, y, z);
        const o = this.owner[v];
        if (o < 0 || this.parts[o].done) continue;
        const k = v * 3;
        if (d[k] <= 0 && d[k + 1] <= 0 && d[k + 2] <= 0) continue;
        touched++;
        // الطبقات فوق بعضها: الغبار، ثم الطين، ثم الصدأ.
        let budget = 1 - q;
        const dust = Math.min(d[k], budget * pw.dust);
        d[k] -= dust;
        budget -= dust / pw.dust;
        if (budget > 0 && d[k + 1] > 0) {
          const mud = Math.min(d[k + 1], budget * pw.mud);
          d[k + 1] -= mud;
          budget -= mud / pw.mud;
        }
        if (budget > 0 && d[k + 2] > 0) {
          if (pw.rust > 0) d[k + 2] -= Math.min(d[k + 2], budget * pw.rust);
          else if (d[k + 1] < 0.05 && d[k + 2] > CLEAN_EPS) rustLeft++;
        }
        this.writePixel(v);
        this.parts[o].changed = true;
        layerHit = true;
      }
      if (layerHit) this.pendingLayers.add(z);
    }
    return touched ? rustLeft / touched : 0;
  }

  /** يُستدعى كل إطار: يرفع الطبقات التي تغيّرت فقط. */
  upload() {
    if (!this.pendingLayers.size) return;
    if (this.uploaded) for (const z of this.pendingLayers) this.tex.addLayerUpdate(z);
    this.pendingLayers.clear();
    this.tex.needsUpdate = true;
    this.uploaded = true;
  }

  /**
   * يحسب نسبة النظافة للأجزاء التي تغيّرت (عيّنة من الخلايا، وليس كل إطار).
   * يرجع الأجزاء التي اكتملت الآن.
   */
  measure(): PartState[] {
    const finished: PartState[] = [];
    const d = this.dirt;
    for (const part of this.parts) {
      if (part.done || !part.changed) continue;
      part.changed = false;
      const step = part.core.length > 4000 ? 3 : 1;
      let total = 0, dirty = 0;
      for (let i = 0; i < part.core.length; i += step) {
        const k = part.core[i] * 3;
        total++;
        if (d[k] > CLEAN_EPS || d[k + 1] > CLEAN_EPS || d[k + 2] > CLEAN_EPS) dirty++;
      }
      part.clean = total ? 1 - dirty / total : 1;
      if (part.clean >= PART_DONE) {
        part.done = true;
        part.clean = 1;
        for (const v of part.owned) {
          d[v * 3] = d[v * 3 + 1] = d[v * 3 + 2] = 0;
          this.writePixel(v);
          this.pendingLayers.add(Math.floor(v / (this.nx * this.ny)));
        }
        part.flash.value = 1;
        finished.push(part);
      }
    }
    return finished;
  }

  /** النسبة الكلية، موزونة بمساحة كل جزء. */
  overall(): number {
    let sum = 0, area = 0;
    for (const p of this.parts) { sum += p.clean * p.area; area += p.area; }
    return area ? sum / area : 1;
  }

  get allDone() { return this.parts.every((p) => p.done); }

  tick(dt: number, time: number, scan: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uScan.value = scan;
    for (const p of this.parts) if (p.flash.value > 0) p.flash.value = Math.max(0, p.flash.value - dt * 1.6);
  }
}

function meshArea(mesh: THREE.Mesh): number {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const index = geo.getIndex();
  const total = index ? index.count : pos.count;
  const idx = (i: number) => (index ? index.getX(i) : i);
  mesh.updateWorldMatrix(true, false);
  const s = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < total; i += 3) {
    a.fromBufferAttribute(pos, idx(i)).multiply(s);
    b.fromBufferAttribute(pos, idx(i + 1)).multiply(s);
    c.fromBufferAttribute(pos, idx(i + 2)).multiply(s);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  return area;
}

type Uniforms = DirtVolume['uniforms'];

const NOISE_GLSL = `
float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

/** يضيف الوسخ إلى أي مادة MeshStandardMaterial (حتى لو كانت لها صورة). */
export function patchMaterial(mat: THREE.MeshStandardMaterial, u: Uniforms, flash: { value: number }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.dirtVol = u.dirtVol;
    shader.uniforms.uVolMat = u.uVolMat;
    shader.uniforms.uVolDims = u.uVolDims;
    shader.uniforms.uScan = u.uScan;
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uFlash = flash;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uVolMat;\nvarying vec3 vDirtQ;\nvarying vec3 vDirtW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 dirtW = modelMatrix * vec4(transformed, 1.0);
vDirtW = dirtW.xyz;
vDirtQ = (uVolMat * dirtW).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray dirtVol;
uniform vec3 uVolDims;
uniform float uScan, uFlash, uTime;
varying vec3 vDirtQ;
varying vec3 vDirtW;
${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dzf = clamp(vDirtQ.z * uVolDims.z - 0.5, 0.0, uVolDims.z - 1.0);
float dz0 = floor(dzf);
vec3 dm = mix(texture(dirtVol, vec3(vDirtQ.xy, dz0)).rgb, texture(dirtVol, vec3(vDirtQ.xy, min(dz0 + 1.0, uVolDims.z - 1.0))).rgb, dzf - dz0);
float g1 = dNoise(vDirtW * 26.0), g2 = dNoise(vDirtW * 71.0 + 3.1), g3 = dNoise(vDirtW * 9.0 - 7.0);
float grain = g1 * 0.6 + g2 * 0.4;
float rustA = smoothstep(grain * 0.4, grain * 0.4 + 0.15, dm.b);
float mudA  = smoothstep(g1 * 0.45, g1 * 0.45 + 0.2, dm.g);
float dustA = smoothstep(g3 * 0.3 + g2 * 0.08, g3 * 0.3 + g2 * 0.08 + 0.32, dm.r);
vec3 dc = diffuseColor.rgb;
dc = mix(dc, vec3(0.25, 0.055, 0.012) * (0.7 + 0.6 * g3), rustA);
dc = mix(dc, vec3(0.075, 0.042, 0.02) * (0.75 + 0.5 * g1), mudA * 0.96);
dc = mix(dc, vec3(0.22, 0.18, 0.13) * (0.85 + 0.25 * g1), dustA * 0.85);
diffuseColor.rgb = dc;
float dirtAmt = max(max(dustA * 0.85, mudA), rustA);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.95, dirtAmt);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor *= 1.0 - dirtAmt;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= 1.0 - dirtAmt * 0.85;
totalEmissiveRadiance += vec3(0.15, 0.85, 1.0) * uScan * smoothstep(0.05, 0.3, max(max(dm.r, dm.g), dm.b)) * (0.45 + 0.25 * sin(uTime * 9.0));
totalEmissiveRadiance += vec3(1.0, 0.92, 0.7) * uFlash * uFlash * 0.7;`);
  };
  mat.customProgramCacheKey = () => 'dirtvol-v1' + (mat.map ? '-map' : '');
  mat.needsUpdate = true;
}
