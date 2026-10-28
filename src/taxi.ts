import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DirtVolume, DirtFn } from './volume';
import { fbm, smoothstep, clamp01 } from './noise';

// «الطاكسي الصغير»: هاتشباك عصري بتصميم خاص بنا (ليس نسخة من أي ماركة).
// الهيكل سطح أملس مبني من مقاطع عرضية (loft): خصر، أكتاف، مقدّمة ومؤخّرة مدوّرتان.
// التفاصيل (أضواء، شبكة، مرايا...) تُلصق على السطح الحقيقي بإسقاط شعاع (raycast).

interface DirtMix { dust?: number; mud?: number; rust?: number; seed?: number }

function dirtFn(mix: DirtMix): DirtFn {
  const s = mix.seed ?? 0;
  return (p, n) => {
    const top = n.y > 0.6 ? 0.3 : 0;
    const dust = clamp01((smoothstep(0.28, 0.68, fbm(p.x * 2.1 + s, p.y * 2.1, p.z * 2.1)) * 0.75 + 0.25 + top) * (mix.dust ?? 1));
    const low = smoothstep(0.95, 0.2, p.y);
    const blob = smoothstep(0.36, 0.62, fbm(p.x * 2.8 + 7 + s, p.y * 3.6, p.z * 2.8 - 3));
    const splash = smoothstep(0.52, 0.7, fbm(p.x * 8 + s, p.y * 8 + 2, p.z * 8));
    const mud = clamp01((low * (0.3 + 0.95 * blob) + splash * 0.6 * low + 0.12 * splash) * (mix.mud ?? 1));
    const spot = smoothstep(0.6, 0.72, fbm(p.x * 1.6 + 31 + s, p.y * 1.6, p.z * 1.6 + 11));
    const rust = clamp01(spot * 1.5 * (mix.rust ?? 0) * (0.4 + low));
    return [dust, mud, rust];
  };
}

// ---------- الأبعاد ----------
const CAR_SCALE = 1.1;
const L2 = 2.08;          // نصف الطول
const W2 = 0.87;          // نصف العرض
const WHEEL_X = 1.32, WHEEL_R = 0.34, WHEEL_Z = 0.73, ARCH_R = 0.42;

/** منحنى بسيط عبر نقاط (x, y) مرتّبة. */
function curve(points: [number, number][]) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    const y0 = ys[Math.max(0, i - 1)], y1 = ys[i], y2 = ys[i + 1], y3 = ys[Math.min(ys.length - 1, i + 2)];
    // Catmull-Rom
    return 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
  };
}

const bodyTop = curve([[-2.08, 0.86], [-2.0, 0.98], [-1.8, 1.03], [-1.0, 1.03], [0.9, 0.99], [1.35, 0.93], [1.75, 0.86], [1.98, 0.76], [2.08, 0.62]]);
const roofTop = curve([[-1.92, 1.0], [-1.86, 1.2], [-1.7, 1.38], [-1.2, 1.46], [-0.4, 1.49], [0.12, 1.45], [0.5, 1.26], [0.98, 1.0]]);

function bodyBot(x: number) {
  const ax = Math.abs(x);
  let y = 0.24 + 0.08 * smoothstep(1.85, L2, ax);
  for (const wx of [-WHEEL_X, WHEEL_X]) {
    const d = Math.abs(x - wx);
    if (d < ARCH_R) y = Math.max(y, WHEEL_R + Math.sqrt(ARCH_R * ARCH_R - d * d));
  }
  return y;
}

/** العرض في المسقط العلوي: مستطيل بزوايا مدوّرة (المقدّمة أدور من المؤخّرة). */
function planW(x: number) {
  const p = x > 0 ? 3.2 : 4.5;
  const t = Math.min(1, Math.abs(x) / L2);
  return W2 * Math.pow(Math.max(0, 1 - Math.pow(t, p * 1.6)), 1 / p);
}

/** سطح أملس من مقاطع: لكل محطة x، مقطع superellipse بين أسفل وأعلى. */
function loft(
  x0: number, x1: number, stations: number, seg: number,
  section: (x: number) => { yb: number; yt: number; w: number; q: number; tumble: number; topOnly?: boolean },
) {
  const pos: number[] = [], meta: { x: number; zn: number; yn: number }[] = [];
  for (let i = 0; i <= stations; i++) {
    const u = i / stations;
    const x = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(Math.PI * u)); // محطات أكثف عند الطرفين
    const s = section(x);
    const yc = s.topOnly ? s.yb : (s.yb + s.yt) / 2, h = s.topOnly ? s.yt - s.yb : (s.yt - s.yb) / 2;
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
      meta.push({ x, zn: Math.abs(ez), yn: ey });
    }
  }
  const quads: [number, number, number, number][] = [];
  for (let i = 0; i < stations; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
    quads.push([a, b, c, d]);
  }
  const build = (pick: (m: { x: number; zn: number; yn: number }) => boolean) => {
    const idx: number[] = [];
    for (const [a, b, c, d] of quads) {
      const m = meta[a], m2 = meta[d];
      const mid = { x: (m.x + m2.x) / 2, zn: (m.zn + m2.zn) / 2, yn: (m.yn + m2.yn) / 2 };
      if (!pick(mid)) continue;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  return build;
}

// ---------- قوام مرسوم بالكود ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  document.fonts?.load('700 30px Plex', 'طاكسي').then(() => { g.clearRect(0, 0, w, h); draw(g); t.needsUpdate = true; }).catch(() => {});
  return t;
}

const doorDecal = () => canvasTex(512, 160, (g) => {
  g.fillStyle = '#f4f1e6';
  g.fillRect(0, 54, 512, 6);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 46px Plex, sans-serif';
  g.fillText('PETIT TAXI', 256, 28);
  g.direction = 'rtl';
  g.font = '700 50px Plex, sans-serif';
  g.fillText('طاكسي صغير', 256, 106);
  g.font = '600 26px Plex, sans-serif';
  g.direction = 'ltr';
  g.fillText('N° 1590', 256, 146);
});

const plateTex = () => canvasTex(256, 56, (g) => {
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 56);
  g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 52);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 34px Plex, sans-serif';
  g.fillText('15907', 70, 30);
  g.fillRect(132, 10, 2, 36); g.fillRect(190, 10, 2, 36);
  g.fillText('أ', 161, 30);
  g.fillText('6', 222, 30);
});

const signTex = () => canvasTex(256, 96, (g) => {
  g.fillStyle = '#f6c945'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 50px Plex, sans-serif';
  g.fillText('TAXI', 128, 34);
  g.direction = 'rtl';
  g.font = '700 30px Plex, sans-serif';
  g.fillText('طاكسي', 128, 76);
});

/** شبكة سداسية للمقدّمة */
const honeycombTex = () => canvasTex(256, 64, (g) => {
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

/** شريط LED بنقاط (للأضواء الخلفية) */
const ledTex = () => canvasTex(256, 32, (g) => {
  g.fillStyle = '#3a0306'; g.fillRect(0, 0, 256, 32);
  for (let x = 4; x < 256; x += 9) { g.fillStyle = '#ff2a2a'; g.fillRect(x, 10, 6, 12); }
});

// ---------- المواد ----------
const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.4 });
const plastic = (color = 0x111316, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.1 });
const chrome = () => new THREE.MeshStandardMaterial({ color: 0xd5dbe2, roughness: 0.12, metalness: 1 });

export interface Model {
  root: THREE.Group;
  volume: DirtVolume;
  box: THREE.Box3;
}

export function buildTaxi(): Model {
  const root = new THREE.Group();
  const parts: { mesh: THREE.Mesh; fn: DirtFn; name: string }[] = [];
  const overlays: THREE.Mesh[] = [];
  const RED = 0xc4161c;

  const addMesh = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, mix: DirtMix | null) => {
    // كل جزء يأخذ نسخة من مادّته حتى تكون له لمعته الخاصة
    const m = new THREE.Mesh(geo, mix ? mat.clone() : mat);
    m.name = name;
    root.add(m);
    if (mix) parts.push({ mesh: m, fn: dirtFn(mix), name });
    else overlays.push(m);
    return m;
  };

  /** يجمع عدة أشكال (كل واحد بموضعه) في جزء واحد. */
  const group = (name: string, mat: THREE.Material, mix: DirtMix | null, items: [THREE.BufferGeometry, THREE.Matrix4][]) => {
    const geos = items.map(([g, m]) => {
      const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
      for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
      return c;
    });
    return addMesh(name, mergeGeometries(geos)!, mat, mix);
  };
  const M = (pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) =>
    new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));

  // ===== الهيكل =====
  const bodyBuild = loft(-L2, L2, 90, 48, (x) => ({ yb: bodyBot(x), yt: bodyTop(x), w: planW(x), q: 5.5, tumble: 0.05 }));
  const body = addMesh('body', bodyBuild(() => true), paint(RED), { rust: 0.7 });

  // ===== المقصورة: زجاج + أعمدة سوداء + سقف أحمر =====
  const cabW = (x: number) => 0.78 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs((x + 0.47) / 1.47), 8)), 1 / 8) + 0.0;
  const cab = loft(-1.93, 0.99, 70, 40, (x) => ({ yb: bodyTop(x) - 0.03, yt: Math.max(bodyTop(x) - 0.03, roofTop(x)), w: Math.max(0.02, cabW(x)), q: 3.4, tumble: 0.2, topOnly: true }));
  const isRoof = (m: { x: number; yn: number }) => m.x > -1.66 && m.x < 0.16 && m.yn > 0.93;
  const isPillar = (m: { x: number; zn: number; yn: number }) =>
    m.yn < 0.12 ||                                   // إطار سفلي للنوافذ
    (m.x > -0.3 && m.x < -0.17 && m.zn > 0.3) ||     // العمود B
    (m.x > 0.12 && m.zn > 0.8 && m.yn > 0.2) ||      // العمود A
    (m.x < -1.62 && m.zn > 0.75);                    // العمود الخلفي
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.03, metalness: 0.6, transparent: true, opacity: 0.8 });
  addMesh('glass', cab((m) => !isRoof(m) && !isPillar(m)), glassMat, { mud: 0.3, dust: 0.9, seed: 9 });
  addMesh('pillars', cab((m) => !isRoof(m) && isPillar(m)), plastic(0x0b0c0e, 0.3), { mud: 0.3, seed: 8 });
  addMesh('roof', cab((m) => isRoof(m)), paint(RED), { mud: 0, dust: 1.2, seed: 5 });

  // ===== أداة لصق التفاصيل على السطح =====
  const ray = new THREE.Raycaster();
  body.updateMatrixWorld();
  const surf = (from: THREE.Vector3, dir: THREE.Vector3) => {
    ray.set(from, dir.normalize());
    const h = ray.intersectObject(body, false)[0];
    if (!h) { console.warn('taxi: surface miss', from.toArray().join(',')); return { p: from.clone(), n: dir.clone().negate() }; }
    return { p: h.point, n: h.face!.normal.clone().transformDirection(body.matrixWorld) };
  };
  /** مصفوفة تضع شكلًا على السطح: محوره z على اتجاه الوجه، مع إزاحة للخارج. */
  const onSurf = (from: [number, number, number], dir: [number, number, number], out = 0, extraRot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) => {
    const { p, n } = surf(new THREE.Vector3(...from), new THREE.Vector3(...dir));
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
  };

  // ===== المقدّمة =====
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.05, metalness: 0.85 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0xc8ecff, emissiveIntensity: 1.2, roughness: 0.1 });
  const headItems: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  const drlItems: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  for (const sz of [1, -1]) {
    const m = onSurf([3, 0.76, sz * 0.5], [-1, 0, 0], -0.008, [0, 0, sz * -0.12]);
    headItems.push([new RoundedBoxGeometry(0.42, 0.09, 0.04, 2, 0.018), m]);
    // عدستا الإسقاط
    for (const dz of [0.1, -0.03]) headItems.push([new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20), m.clone().multiply(M([sz * dz, 0, 0.02], [Math.PI / 2, 0, 0]))]);
    // خط LED نهاري على شكل L
    drlItems.push([new THREE.BoxGeometry(0.36, 0.014, 0.012), m.clone().multiply(M([0, 0.04, 0.02]))]);
    drlItems.push([new THREE.BoxGeometry(0.014, 0.06, 0.012), m.clone().multiply(M([sz * -0.17, 0.01, 0.02]))]);
    // ضوء الضباب
    headItems.push([new THREE.CylinderGeometry(0.035, 0.035, 0.03, 18), onSurf([3, 0.4, sz * 0.62], [-1, 0, 0], 0.0, [Math.PI / 2, 0, 0])]);
  }
  addMesh('headlights', mergeAll(headItems), lensMat, { mud: 0.5, seed: 42 });
  addMesh('drl', mergeAll(drlItems), ledMat, null);
  // الشبكة والشعار والممصّ السفلي
  const grilleMat = new THREE.MeshStandardMaterial({ map: honeycombTex(), roughness: 0.4, metalness: 0.5 });
  group('grille', grilleMat, { mud: 0.9, seed: 40 }, [
    [new RoundedBoxGeometry(0.62, 0.11, 0.03, 2, 0.015), onSurf([3, 0.69, 0], [-1, 0, 0], 0.0)],
    [new RoundedBoxGeometry(1.0, 0.13, 0.03, 2, 0.02), onSurf([3, 0.45, 0], [-1, 0, 0], 0.0)],
  ]);
  group('emblem', chrome(), null, [[new THREE.TorusGeometry(0.04, 0.008, 8, 24), onSurf([3, 0.72, 0], [-1, 0, 0], 0.02)]]);
  // ===== الخلف =====
  const tailMat = new THREE.MeshStandardMaterial({ map: ledTex(), color: 0xffffff, emissive: 0xff1010, emissiveMap: ledTex(), emissiveIntensity: 0.7, roughness: 0.1 });
  const tails: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  for (const sz of [1, -1]) tails.push([new RoundedBoxGeometry(0.42, 0.09, 0.04, 2, 0.015), onSurf([-3, 0.9, sz * 0.58], [1, 0, 0], 0.0, [0, 0, sz * 0.05])]);
  tails.push([new THREE.BoxGeometry(0.7, 0.025, 0.03), onSurf([-3, 0.93, 0], [1, 0, 0], 0.0)]);
  addMesh('taillights', mergeAll(tails), tailMat, { mud: 0.5, seed: 60 });
  group('rear-reflectors', new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.2 }), null, [
    [new RoundedBoxGeometry(0.16, 0.035, 0.02, 2, 0.008), onSurf([-3, 0.42, 0.6], [1, 0, 0], 0.0)],
    [new RoundedBoxGeometry(0.16, 0.035, 0.02, 2, 0.008), onSurf([-3, 0.42, -0.6], [1, 0, 0], 0.0)],
  ]);

  // ===== الكسوة السوداء: صدّامات سفلية، جوانب، أقواس العجلات =====
  const clad: [THREE.BufferGeometry, THREE.Matrix4][] = [
    [new RoundedBoxGeometry(0.16, 0.07, 1.0, 2, 0.025), M([L2 - 0.1, 0.31, 0])],
    [new RoundedBoxGeometry(0.16, 0.1, 1.1, 2, 0.03), M([-L2 + 0.1, 0.33, 0])],
  ];
  for (const sz of [1, -1]) {
    clad.push([new RoundedBoxGeometry(1.7, 0.09, 0.05, 2, 0.02), onSurf([0, 0.3, sz * 2], [0, 0, -sz], -0.005)]);
    for (const wx of [-WHEEL_X, WHEEL_X]) {
      const z = sz * (planW(wx) - 0.015);
      clad.push([new THREE.TorusGeometry(ARCH_R + 0.02, 0.035, 8, 28, Math.PI * 0.82), M([wx, WHEEL_R, z], [0, 0, Math.PI * 0.09])]);
    }
  }
  group('cladding', plastic(0x141619, 0.7), { mud: 2.2, dust: 0.8, seed: 57 }, clad);
  // بطانة أقواس العجلات (سوداء من الداخل)
  const liners: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  for (const wx of [-WHEEL_X, WHEEL_X]) liners.push([new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 1.68, 24, 1, true, Math.PI / 2, Math.PI), M([wx, WHEEL_R, 0], [Math.PI / 2, 0, 0])]);
  const linerMat = plastic(0x070708, 0.9); linerMat.side = THREE.DoubleSide;
  group('liners', linerMat, null, liners);
  // أرضية سفلية داكنة
  group('underbody', plastic(0x0a0a0b, 0.9), null, [[new THREE.BoxGeometry(3.3, 0.04, 1.36), M([0, 0.27, 0])]]);

  // ===== الجوانب: مرايا، مقابض، خطوط الأبواب، غطاء الوقود، ملصق =====
  const mirrors: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  const signals: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  const handles: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  const seams: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  for (const sz of [1, -1]) {
    const base = onSurf([0.82, 0.95, sz * 2], [0, 0, -sz], 0.0);
    mirrors.push([new RoundedBoxGeometry(0.06, 0.05, 0.12, 2, 0.02), base.clone().multiply(M([0, 0.0, 0.05]))]);
    mirrors.push([new RoundedBoxGeometry(0.2, 0.12, 0.09, 3, 0.04), base.clone().multiply(M([-0.03, 0.03, 0.14]))]);
    signals.push([new THREE.BoxGeometry(0.1, 0.012, 0.012), base.clone().multiply(M([0.04, 0.0, 0.18]))]);
    for (const hx of [0.36, -0.78]) handles.push([new RoundedBoxGeometry(0.18, 0.03, 0.02, 2, 0.008), onSurf([hx, 0.88, sz * 2], [0, 0, -sz], 0.002)]);
    for (const dx of [0.9, -0.22, -1.38]) {
      for (let k = 0; k < 6; k++) {
        const y = 0.36 + k * 0.11;
        if (y > bodyTop(dx) - 0.05 || y < Math.max(bodyBot(dx - 0.04), bodyBot(dx + 0.04)) + 0.06) continue;
        seams.push([new THREE.BoxGeometry(0.006, 0.115, 0.006), onSurf([dx, y, sz * 2], [0, 0, -sz], 0.0)]);
      }
    }
    seams.push([new THREE.CylinderGeometry(0.075, 0.075, 0.004, 24), onSurf([-1.62, 0.88, sz * 2], [0, 0, -sz], 0.0, [Math.PI / 2, 0, 0])]);
    // خط كروم تحت النوافذ
    handles.push([new THREE.BoxGeometry(2.6, 0.012, 0.012), onSurf([-0.45, bodyTop(-0.45) - 0.02, sz * 2], [0, 0, -sz], 0.0)]);
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.31), new THREE.MeshStandardMaterial({ map: doorDecal(), transparent: true, roughness: 0.3 }));
    dec.applyMatrix4(onSurf([0.3, 0.6, sz * 2], [0, 0, -sz], 0.004));
    dec.renderOrder = 1;
    root.add(dec); overlays.push(dec);
  }
  group('mirrors', paint(RED), { seed: 50 }, mirrors);
  group('mirror-signals', new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0x804000, roughness: 0.2 }), null, signals);
  group('handles', chrome(), null, handles);
  group('seams', plastic(0x2a0405, 0.5), null, seams);

  // ===== السقف: قضبان، هوائي، جناح خلفي، لافتة =====
  const roofAcc: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  for (const sz of [1, -1]) {
    const z = sz * 0.5, y = roofTop(-0.75) + 0.05;
    roofAcc.push([new THREE.CylinderGeometry(0.014, 0.014, 1.5, 10), M([-0.75, y, z], [0, 0, Math.PI / 2 + 0.03])]);
    for (const x of [-1.45, -0.05]) roofAcc.push([new RoundedBoxGeometry(0.08, 0.06, 0.04, 2, 0.015), M([x, roofTop(x) + 0.02, z])]);
  }
  roofAcc.push([new RoundedBoxGeometry(0.12, 0.06, 0.04, 2, 0.02), M([-1.55, roofTop(-1.55) + 0.025, 0], [0, 0, 0.3])]);   // الهوائي
  roofAcc.push([new RoundedBoxGeometry(0.2, 0.03, 1.2, 2, 0.012), M([-1.66, roofTop(-1.66) + 0.005, 0], [0, 0, -0.12])]);  // الجناح
  group('roof-acc', plastic(0x121417, 0.4), { dust: 1.3, mud: 0.2, seed: 70 }, roofAcc);
  const signBox = addMesh('sign', new RoundedBoxGeometry(0.24, 0.2, 0.6, 3, 0.03), plastic(0xf6c945, 0.5), { mud: 0, dust: 1.3, seed: 71 });
  signBox.position.set(-0.62, roofTop(-0.62) + 0.13, 0);
  const signMat = new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.35, emissive: 0x332a10 });
  for (const sx of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.17), signMat);
    pl.position.set(-0.62 + sx * 0.122, signBox.position.y, 0);
    pl.rotation.y = sx * Math.PI / 2;
    root.add(pl); overlays.push(pl);
  }
  // الماسحات
  group('wipers', plastic(0x0c0d0f, 0.5), null, [
    [new THREE.BoxGeometry(0.02, 0.012, 0.55), M([0.9, bodyTop(0.9) + 0.03, 0.3], [0, 0.35, 0])],
    [new THREE.BoxGeometry(0.02, 0.012, 0.55), M([0.9, bodyTop(0.9) + 0.03, -0.25], [0, 0.35, 0])],
    [new THREE.BoxGeometry(0.012, 0.25, 0.012), M([-1.9, 1.18, 0], [0, 0, -0.5])],
  ]);

  // ===== اللوحات =====
  const plate = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.4 });
  for (const [from, dir] of [[[3, 0.56, 0], [-1, 0, 0]], [[-3, 0.6, 0], [1, 0, 0]]] as [[number, number, number], [number, number, number]][]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.105), plate);
    pl.applyMatrix4(onSurf(from, dir, 0.035));
    root.add(pl); overlays.push(pl);
  }

  // ===== الداخل (يُرى عبر الزجاج) =====
  const inner = plastic(0x2a2c30, 0.8);
  const interior: [THREE.BufferGeometry, THREE.Matrix4][] = [
    [new RoundedBoxGeometry(0.5, 0.25, 1.4, 2, 0.06), M([0.62, 0.95, 0])],                  // لوحة القيادة
    [new THREE.TorusGeometry(0.15, 0.022, 8, 24), M([0.38, 1.05, 0.36], [0, Math.PI / 2, 0.35])], // المقود
  ];
  for (const x of [-0.05, -1.0]) for (const z of x > -0.5 ? [0.36, -0.36] : [0]) {
    const w = x > -0.5 ? 0.5 : 1.3;
    interior.push([new RoundedBoxGeometry(0.5, 0.14, w, 2, 0.05), M([x, 0.62, z])]);
    interior.push([new RoundedBoxGeometry(0.12, 0.6, w, 2, 0.05), M([x - 0.24, 0.9, z], [0, 0, 0.18])]);
  }
  group('interior', inner, null, interior);

  // ===== العجلات =====
  const tireProfile = [new THREE.Vector2(0.24, -0.12), new THREE.Vector2(0.3, -0.122), new THREE.Vector2(0.33, -0.11), new THREE.Vector2(WHEEL_R, -0.07), new THREE.Vector2(WHEEL_R, 0.07), new THREE.Vector2(0.33, 0.11), new THREE.Vector2(0.3, 0.122), new THREE.Vector2(0.24, 0.12)];
  const tireGeo = new THREE.LatheGeometry(tireProfile, 40);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.2, metalness: 0.95 });
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const wx = sx * WHEEL_X, wz = sz * WHEEL_Z;
    const tm = M([wx, WHEEL_R, wz], [Math.PI / 2, 0, 0]);
    group(`tire-${sx}${sz}`, plastic(0x141414, 0.88), { mud: 2.4, dust: 0.8, seed: 80 + sx * 2 + sz }, [[tireGeo, tm]]);
    // قرص الفرامل، الكاليبر الأحمر
    group(`brake-${sx}${sz}`, new THREE.MeshStandardMaterial({ color: 0x6c7076, roughness: 0.4, metalness: 0.8 }), null, [[new THREE.CylinderGeometry(0.17, 0.17, 0.02, 28), M([wx, WHEEL_R, wz + sz * 0.02], [Math.PI / 2, 0, 0])]]);
    group(`caliper-${sx}${sz}`, new THREE.MeshStandardMaterial({ color: 0xd01818, roughness: 0.35 }), null, [[new RoundedBoxGeometry(0.1, 0.12, 0.05, 2, 0.02), M([wx - sx * 0.12, WHEEL_R + 0.08, wz + sz * 0.04])]]);
    // الجنط: حافة + 10 أذرع مزدوجة + غطاء مركزي + صواميل
    const face = wz + sz * 0.1;
    const rim: [THREE.BufferGeometry, THREE.Matrix4][] = [
      [new THREE.TorusGeometry(0.235, 0.014, 8, 36), M([wx, WHEEL_R, face])],
      [new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), M([wx, WHEEL_R, face], [Math.PI / 2, 0, 0])],
    ];
    for (let i = 0; i < 5; i++) for (const off of [-0.11, 0.11]) {
      const a = (i / 5) * Math.PI * 2 + off;
      rim.push([new THREE.BoxGeometry(0.026, 0.19, 0.022), M([wx + Math.sin(a) * 0.14, WHEEL_R + Math.cos(a) * 0.14, face - sz * 0.006], [0, 0, -a])]);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
      rim.push([new THREE.CylinderGeometry(0.01, 0.01, 0.02, 8), M([wx + Math.sin(a) * 0.04, WHEEL_R + Math.cos(a) * 0.04, face + sz * 0.012], [Math.PI / 2, 0, 0])]);
    }
    group(`rim-${sx}${sz}`, rimMat, { mud: 2, seed: 90 + sx * 2 + sz }, rim);
  }

  // الطاكسي أكبر بـ 10%
  root.scale.setScalar(CAR_SCALE);
  const volume = new DirtVolume(root, parts);
  for (const o of overlays) volume.addOverlay(o);
  const box = new THREE.Box3(new THREE.Vector3(-L2 - 0.02, 0, -W2 - 0.12), new THREE.Vector3(L2 + 0.02, 1.7, W2 + 0.12));
  box.min.multiplyScalar(CAR_SCALE); box.max.multiplyScalar(CAR_SCALE);
  return { root, volume, box };
}

function mergeAll(items: [THREE.BufferGeometry, THREE.Matrix4][]) {
  return mergeGeometries(items.map(([g, m]) => {
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    return c;
  }))!;
}
