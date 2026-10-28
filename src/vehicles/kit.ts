import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DirtVolume, DirtFn } from '../volume';
import { fbm, smoothstep, clamp01 } from '../noise';

// أدوات مشتركة لبناء كل المركبات: أسطح ملساء (loft)، لصق التفاصيل على السطح،
// عجلات، ملصقات، ومواد. كل مركبة تستعمل Kit ثم تستدعي finish().

export interface DirtMix { dust?: number; mud?: number; rust?: number; seed?: number }

export function dirtFn(mix: DirtMix, height = 1): DirtFn {
  const s = mix.seed ?? 0;
  return (p, n) => {
    const y = p.y / height; // نسبي لارتفاع المركبة حتى يتّسخ أسفل الشاحنة كأسفل الطاكسي
    const top = n.y > 0.6 ? 0.3 : 0;
    const dust = clamp01((smoothstep(0.28, 0.68, fbm(p.x * 2.1 + s, p.y * 2.1, p.z * 2.1)) * 0.75 + 0.25 + top) * (mix.dust ?? 1));
    const low = smoothstep(0.95, 0.2, y);
    const blob = smoothstep(0.36, 0.62, fbm(p.x * 2.8 + 7 + s, p.y * 3.6, p.z * 2.8 - 3));
    const splash = smoothstep(0.52, 0.7, fbm(p.x * 8 + s, p.y * 8 + 2, p.z * 8));
    const mud = clamp01((low * (0.3 + 0.95 * blob) + splash * 0.6 * low + 0.12 * splash) * (mix.mud ?? 1));
    const spot = smoothstep(0.6, 0.72, fbm(p.x * 1.6 + 31 + s, p.y * 1.6, p.z * 1.6 + 11));
    const rust = clamp01(spot * 1.5 * (mix.rust ?? 0) * (0.4 + low));
    return [dust, mud, rust];
  };
}

/** منحنى ناعم عبر نقاط (x, y) مرتّبة حسب x. */
export function curve(points: [number, number][]) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    const y0 = ys[Math.max(0, i - 1)], y1 = ys[i], y2 = ys[i + 1], y3 = ys[Math.min(ys.length - 1, i + 2)];
    return 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
  };
}

/** عرض المسقط العلوي: مستطيل بزوايا مدوّرة. */
export function planWidth(halfL: number, halfW: number, pFront = 3.2, pRear = 4.5) {
  return (x: number) => {
    const p = x > 0 ? pFront : pRear;
    const t = Math.min(1, Math.abs(x) / halfL);
    return halfW * Math.pow(Math.max(0, 1 - Math.pow(t, p * 1.6)), 1 / p);
  };
}

export interface LoftMeta { x: number; zn: number; yn: number; y: number }

/** سطح أملس من مقاطع: لكل محطة x، مقطع superellipse بين أسفل وأعلى. يرجع دالة تبني جزءًا مختارًا من السطح. */
export function loft(
  x0: number, x1: number, stations: number, seg: number,
  section: (x: number) => { yb: number; yt: number; w: number; q: number; tumble: number; topOnly?: boolean; r?: number },
) {
  const pos: number[] = [], meta: LoftMeta[] = [];
  for (let i = 0; i <= stations; i++) {
    const u = i / stations;
    const x = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(Math.PI * u)); // محطات أكثف عند الطرفين
    const s = section(x);
    const yc = s.topOnly ? s.yb : (s.yb + s.yt) / 2, h = s.topOnly ? s.yt - s.yb : (s.yt - s.yb) / 2;
    if (s.r !== undefined) {
      // مقطع مستطيل بزوايا مدوّرة، نقاطه موزّعة بالتساوي على المحيط (جوانب مسطّحة بدقّة جيدة)
      const w = s.w, r = Math.min(s.r, w * 0.95, h * 0.95);
      const pts = roundedRect(w, h, r, seg);
      for (const [pz, py] of pts) {
        const ey = py / h;
        const up = THREE.MathUtils.clamp(ey, 0, 1);
        pos.push(x, yc + py, pz * (1 - s.tumble * up * up));
        meta.push({ x, zn: Math.abs(pz) / w, yn: ey, y: yc + py });
      }
      continue;
    }
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      const ez = Math.sign(c) * Math.pow(Math.abs(c), 2 / s.q);
      let ey = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / s.q);
      if (s.topOnly && ey < 0) ey = 0;
      const y = yc + h * ey;
      const up = THREE.MathUtils.clamp(ey, 0, 1);
      const z = s.w * ez * (1 - s.tumble * up * up) * (1 - 0.04 * Math.max(0, -ey) ** 2);
      pos.push(x, y, z);
      meta.push({ x, zn: Math.abs(ez), yn: ey, y });
    }
  }
  const quads: [number, number, number, number][] = [];
  for (let i = 0; i < stations; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
    quads.push([a, b, c, d]);
  }
  return (pick: (m: LoftMeta) => boolean) => {
    const idx: number[] = [];
    for (const [a, b, c, d] of quads) {
      const m = meta[a], m2 = meta[d];
      if (!pick({ x: (m.x + m2.x) / 2, zn: (m.zn + m2.zn) / 2, yn: (m.yn + m2.yn) / 2, y: (m.y + m2.y) / 2 })) continue;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
}

/** نقاط مستطيل (نصف عرض w، نصف ارتفاع h) بزوايا نصف قطرها r، بنفس ترتيب الزاوية t (تبدأ من الجانب +z وتدور نحو الأعلى). */
function roundedRect(w: number, h: number, r: number, seg: number): [number, number][] {
  const straightZ = 2 * (w - r), straightY = 2 * (h - r), arc = (Math.PI / 2) * r;
  const total = 2 * straightZ + 2 * straightY + 4 * arc;
  const at = (d: number): [number, number] => {
    // نبدأ من منتصف الجانب +z (z=w, y=0) ونمشي عكس عقارب الساعة
    const legs: [number, (u: number) => [number, number]][] = [
      [straightY / 2, (u) => [w, u]],
      [arc, (u) => { const a = u / r; return [w - r + r * Math.cos(a), h - r + r * Math.sin(a)]; }],
      [straightZ, (u) => [w - r - u, h]],
      [arc, (u) => { const a = Math.PI / 2 + u / r; return [-w + r + r * Math.cos(a), h - r + r * Math.sin(a)]; }],
      [straightY, (u) => [-w, h - r - u]],
      [arc, (u) => { const a = Math.PI + u / r; return [-w + r + r * Math.cos(a), -h + r + r * Math.sin(a)]; }],
      [straightZ, (u) => [-w + r + u, -h]],
      [arc, (u) => { const a = 1.5 * Math.PI + u / r; return [w - r + r * Math.cos(a), -h + r + r * Math.sin(a)]; }],
      [straightY / 2, (u) => [w, -h + r + u]],
    ];
    for (const [len, f] of legs) { if (d <= len) return f(d); d -= len; }
    return [w, 0];
  };
  const out: [number, number][] = [];
  for (let j = 0; j < seg; j++) out.push(at((j / seg) * total));
  return out;
}

// ---------- قوام مرسوم بالكود ----------
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  document.fonts?.load('700 30px Plex', 'طاكسي').then(() => { g.clearRect(0, 0, w, h); draw(g); t.needsUpdate = true; }).catch(() => {});
  return t;
}

export const plateTex = (num = '15907', letter = 'أ', region = '6') => canvasTex(256, 56, (g) => {
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 56);
  g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 52);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 34px Plex, sans-serif';
  g.fillText(num, 70, 30);
  g.fillRect(132, 10, 2, 36); g.fillRect(190, 10, 2, 36);
  g.fillText(letter, 161, 30);
  g.fillText(region, 222, 30);
});

export const honeycombTex = () => canvasTex(256, 64, (g) => {
  g.fillStyle = '#060708'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#3a3f46'; g.lineWidth = 2;
  const r = 7;
  for (let y = 0; y < 64 + r; y += r * 1.5) for (let x = 0; x < 256 + r; x += r * Math.sqrt(3)) {
    const ox = (Math.round(y / (r * 1.5)) % 2) * r * Math.sqrt(3) / 2;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; g.lineTo(x + ox + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath(); g.stroke();
  }
});

export const ledTex = () => canvasTex(256, 32, (g) => {
  g.fillStyle = '#3a0306'; g.fillRect(0, 0, 256, 32);
  for (let x = 4; x < 256; x += 9) { g.fillStyle = '#ff2a2a'; g.fillRect(x, 10, 6, 12); }
});

// ---------- المواد ----------
export const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.4 });
export const plastic = (color = 0x111316, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.1 });
export const chrome = () => new THREE.MeshStandardMaterial({ color: 0xd5dbe2, roughness: 0.12, metalness: 1 });
export const glass = () => new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.06, metalness: 0.8 });
export const lensMat = () => new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.05, metalness: 0.85 });
export const ledWhite = () => new THREE.MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0xc8ecff, emissiveIntensity: 1.2, roughness: 0.1 });

export type V3 = [number, number, number];
export type Item = [THREE.BufferGeometry, THREE.Matrix4];

export const M = (pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));

export function mergeAll(items: Item[]) {
  return mergeGeometries(items.map(([g, m]) => {
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    return c;
  }))!;
}

export interface Model {
  root: THREE.Group;
  volume: DirtVolume;
  box: THREE.Box3;
  /** ارتفاع المركبة (لمستويات النظر) */
  height: number;
}

export class Kit {
  readonly root = new THREE.Group();
  private parts: { mesh: THREE.Mesh; fn: DirtFn; name: string }[] = [];
  private overlays: THREE.Mesh[] = [];
  private surface: THREE.Mesh[] = [];
  private ray = new THREE.Raycaster();
  /** ارتفاع المركبة لتوزيع الطين (أكثر في الأسفل) */
  constructor(private height = 1.5) {}

  addMesh(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, mix: DirtMix | null) {
    // كل جزء يأخذ نسخة من مادّته حتى تكون له لمعته الخاصة
    const m = new THREE.Mesh(geo, mix ? mat.clone() : mat);
    m.name = name;
    this.root.add(m);
    if (mix) this.parts.push({ mesh: m, fn: dirtFn(mix, this.height / 1.5), name });
    else this.overlays.push(m);
    return m;
  }

  /** يجمع عدة أشكال (كل واحد بموضعه) في جزء واحد. */
  group(name: string, mat: THREE.Material, mix: DirtMix | null, items: Item[]) {
    return this.addMesh(name, mergeAll(items), mat, mix);
  }

  /** الأسطح التي تُلصق عليها التفاصيل */
  setSurface(...meshes: THREE.Mesh[]) {
    this.surface = meshes;
    for (const m of meshes) m.updateMatrixWorld();
  }

  /** مصفوفة تضع شكلًا على السطح: محوره z على اتجاه الوجه، مع إزاحة للخارج. */
  onSurf(from: V3, dir: V3, out = 0, extraRot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
    const f = new THREE.Vector3(...from), d = new THREE.Vector3(...dir).normalize();
    this.ray.set(f, d);
    const h = this.ray.intersectObjects(this.surface, false)[0];
    let p = f, n = d.clone().negate();
    if (h) { p = h.point; n = h.face!.normal.clone().transformDirection(h.object.matrixWorld); }
    else console.warn('vehicle: surface miss', from.join(','));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    // نحافظ على «الأعلى» قدر الإمكان
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const wantUp = new THREE.Vector3(0, 1, 0).projectOnPlane(n).normalize();
    if (wantUp.lengthSq() > 0.01) {
      const ang = Math.atan2(new THREE.Vector3().crossVectors(up, wantUp).dot(n), up.dot(wantUp));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(n, ang));
    }
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...extraRot)));
    return new THREE.Matrix4().compose(p.clone().addScaledVector(n, out), q, new THREE.Vector3(...scale));
  }

  /** ملصق مسطّح (نص، لوحة) يتّسخ مع السطح تحته. */
  decal(tex: THREE.Texture, w: number, h: number, m: THREE.Matrix4, transparent = true) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent, roughness: 0.3 }));
    d.applyMatrix4(m);
    d.renderOrder = 1;
    this.root.add(d);
    this.overlays.push(d);
    return d;
  }

  /** عجلة كاملة: إطار مدوّر، جنط بأذرع، قرص فرامل، كاليبر. side = +1 أو -1 (جهة z). */
  wheel(name: string, x: number, z: number, side: number, r: number, width: number, opts: { spokes?: number; rim?: number; caliper?: number; seed?: number } = {}) {
    const ri = r * 0.7;
    const prof = [
      [ri, -width / 2], [r * 0.88, -width / 2 - 0.002], [r * 0.97, -width * 0.46], [r, -width * 0.3],
      [r, width * 0.3], [r * 0.97, width * 0.46], [r * 0.88, width / 2 + 0.002], [ri, width / 2],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const tm = M([x, r, z], [Math.PI / 2, 0, 0]);
    const seed = opts.seed ?? 80;
    this.group(`tire-${name}`, plastic(0x141414, 0.88), { mud: 2.4, dust: 0.8, seed }, [[new THREE.LatheGeometry(prof, 40), tm]]);
    this.group(`brake-${name}`, new THREE.MeshStandardMaterial({ color: 0x6c7076, roughness: 0.4, metalness: 0.8 }), null, [[new THREE.CylinderGeometry(ri * 0.72, ri * 0.72, 0.02, 28), M([x, r, z + side * width * 0.08], [Math.PI / 2, 0, 0])]]);
    if (opts.caliper !== undefined) {
      this.group(`caliper-${name}`, new THREE.MeshStandardMaterial({ color: opts.caliper, roughness: 0.35 }), null, [[new RoundedBoxGeometry(ri * 0.42, ri * 0.5, 0.05, 2, 0.02), M([x - ri * 0.5, r + ri * 0.34, z + side * width * 0.17])]]);
    }
    const face = z + side * width * 0.42;
    const rim: Item[] = [
      [new THREE.TorusGeometry(ri, 0.014, 8, 36), M([x, r, face])],
      [new THREE.CylinderGeometry(ri * 0.26, ri * 0.26, 0.03, 20), M([x, r, face], [Math.PI / 2, 0, 0])],
    ];
    const n = opts.spokes ?? 5;
    for (let i = 0; i < n; i++) for (const off of [-0.11, 0.11]) {
      const a = (i / n) * Math.PI * 2 + off * (5 / n);
      rim.push([new THREE.BoxGeometry(ri * 0.11, ri * 0.8, 0.022), M([x + Math.sin(a) * ri * 0.6, r + Math.cos(a) * ri * 0.6, face - side * 0.006], [0, 0, -a])]);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
      rim.push([new THREE.CylinderGeometry(0.01, 0.01, 0.02, 8), M([x + Math.sin(a) * ri * 0.17, r + Math.cos(a) * ri * 0.17, face + side * 0.012], [Math.PI / 2, 0, 0])]);
    }
    this.group(`rim-${name}`, new THREE.MeshStandardMaterial({ color: opts.rim ?? 0x9aa2ab, roughness: 0.2, metalness: 0.95 }), { mud: 2, seed: seed + 10 }, rim);
  }

  /** ينهي المركبة: يكبّرها، ويبني قناع الوسخ ثلاثي الأبعاد. */
  finish(scale: number, voxel: number, boxMin: V3, boxMax: V3): Model {
    this.root.scale.setScalar(scale);
    const volume = new DirtVolume(this.root, this.parts, voxel);
    for (const o of this.overlays) volume.addOverlay(o);
    const box = new THREE.Box3(new THREE.Vector3(...boxMin).multiplyScalar(scale), new THREE.Vector3(...boxMax).multiplyScalar(scale));
    return { root: this.root, volume, box, height: box.max.y };
  }
}
