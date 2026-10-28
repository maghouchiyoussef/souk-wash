import * as THREE from 'three';
import { DirtVolume, DirtFn } from './volume';
import { fbm, smoothstep, clamp01 } from './noise';

// «الطاكسي الصغير»: هاتشباك عصري بتصميم خاص بنا (ليس نسخة من أي ماركة).
// الهيكل مصنوع بسحب (extrude) مقطع جانبي منحني مع حواف مدوّرة.

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

const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.35 });
const plastic = (color = 0x16181b) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });

function extrude(shape: THREE.Shape, width: number, bevel: number, segments = 4): THREE.ExtrudeGeometry {
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: segments, curveSegments: 20,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

// ---------- المقاطع الجانبية (x للأمام، y للأعلى) ----------
const CAR_SCALE = 1.1;
const WHEEL_X = 1.32, WHEEL_R = 0.34, ARCH_R = 0.43, BOTTOM = 0.24;

function bodyShape(): THREE.Shape {
  const s = new THREE.Shape();
  const da = Math.asin((WHEEL_R - BOTTOM) / ARCH_R);
  const ax = ARCH_R * Math.cos(da);
  s.moveTo(-1.86, BOTTOM);
  s.lineTo(-WHEEL_X - ax, BOTTOM);
  s.absarc(-WHEEL_X, WHEEL_R, ARCH_R, Math.PI + da, -da, true);
  s.lineTo(WHEEL_X - ax, BOTTOM);
  s.absarc(WHEEL_X, WHEEL_R, ARCH_R, Math.PI + da, -da, true);
  s.lineTo(1.9, BOTTOM);
  s.quadraticCurveTo(2.02, BOTTOM + 0.04, 2.03, 0.42);   // الصدّام الأمامي
  s.lineTo(2.0, 0.66);
  s.quadraticCurveTo(1.97, 0.8, 1.7, 0.84);              // مقدّمة الغطاء
  s.quadraticCurveTo(1.3, 0.88, 0.92, 0.98);             // غطاء المحرك
  s.lineTo(-1.62, 1.02);                                 // خط الحزام
  s.quadraticCurveTo(-1.95, 1.0, -1.98, 0.82);           // الباب الخلفي
  s.lineTo(-2.0, 0.42);
  s.quadraticCurveTo(-2.0, BOTTOM, -1.86, BOTTOM);
  return s;
}

function glassShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.96, 0.96);
  s.quadraticCurveTo(0.62, 1.2, 0.2, 1.38);              // الزجاج الأمامي
  s.quadraticCurveTo(-0.7, 1.47, -1.5, 1.38);            // السقف
  s.quadraticCurveTo(-1.82, 1.3, -1.88, 0.98);           // الزجاج الخلفي
  s.lineTo(0.96, 0.96);
  return s;
}

function roofShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.16, 1.37);
  s.quadraticCurveTo(-0.7, 1.46, -1.46, 1.37);
  s.lineTo(-1.44, 1.42);
  s.quadraticCurveTo(-0.7, 1.52, 0.14, 1.42);
  s.lineTo(0.16, 1.37);
  return s;
}

// ---------- ملصقات مرسومة بالكود ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
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

function doorDecal() {
  return canvasTex(512, 160, (g) => {
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
}

function plateTex() {
  return canvasTex(256, 56, (g) => {
    g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 56);
    g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 52);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 34px Plex, sans-serif';
    g.fillText('15907', 70, 30);
    g.fillRect(132, 10, 2, 36); g.fillRect(190, 10, 2, 36);
    g.fillText('أ', 161, 30);
    g.fillText('6', 222, 30);
  });
}

function signTex() {
  return canvasTex(256, 96, (g) => {
    g.fillStyle = '#f6c945'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 50px Plex, sans-serif';
    g.fillText('TAXI', 128, 34);
    g.direction = 'rtl';
    g.font = '700 30px Plex, sans-serif';
    g.fillText('طاكسي', 128, 76);
  });
}

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

  const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], mix: DirtMix | null, rot?: [number, number, number]) => {
    // كل جزء يأخذ نسخة من مادّته حتى تكون له لمعته الخاصة
    const m = new THREE.Mesh(geo, mix ? mat.clone() : mat);
    m.name = name;
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    root.add(m);
    if (mix) parts.push({ mesh: m, fn: dirtFn(mix), name });
    else overlays.push(m);
    return m;
  };

  // الهيكل والزجاج والسقف
  add('body', extrude(bodyShape(), 1.74, 0.12, 5), paint(RED), [0, 0, 0], { rust: 0.7 });
  add('glass', extrude(glassShape(), 1.5, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x10171c, roughness: 0.05, metalness: 0.7 }), [0, 0, 0], { mud: 0.3, dust: 0.9, seed: 9 });
  add('roof', extrude(roofShape(), 1.5, 0.07, 3), paint(RED), [0, 0, 0], { mud: 0, dust: 1.2, seed: 5 });

  // المقدّمة: شبكة، أضواء LED، ممصّ هواء
  add('grille', new THREE.BoxGeometry(0.06, 0.16, 1.0), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.25, metalness: 0.6 }), [2.0, 0.55, 0], { mud: 0.8, seed: 40 });
  add('front-trim', new THREE.BoxGeometry(0.08, 0.12, 1.5), plastic(), [1.99, 0.3, 0], { mud: 1.6, seed: 41 });
  const led = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xbfe3ff, emissiveIntensity: 0.9, roughness: 0.1 });
  for (const sz of [1, -1]) {
    add(`headlight-${sz}`, new THREE.BoxGeometry(0.1, 0.07, 0.42), new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.08, metalness: 0.8 }), [1.92, 0.73, sz * 0.56], { mud: 0.4, seed: 42 + sz }, [0, sz * 0.12, -0.25]);
    const drl = add(`drl-${sz}`, new THREE.BoxGeometry(0.02, 0.018, 0.4), led, [1.975, 0.735, sz * 0.56], null, [0, sz * 0.12, -0.25]);
    drl.renderOrder = 1;
    // المرايا
    add(`mirror-${sz}`, new THREE.BoxGeometry(0.16, 0.1, 0.16), paint(RED), [0.86, 1.02, sz * 0.9], { seed: 50 + sz });
    // مقابض الأبواب
    for (const hx of [0.42, -0.72]) add(`handle-${sz}-${hx}`, new THREE.BoxGeometry(0.16, 0.03, 0.02), plastic(0x2a2d31), [hx, 0.86, sz * 0.875], { seed: 55 });
    // الجوانب السفلية
    add(`skirt-${sz}`, new THREE.BoxGeometry(1.75, 0.09, 0.05), plastic(), [0, 0.29, sz * 0.86], { mud: 2, seed: 57 + sz });
    // خطوط الأبواب
    for (const dx of [0.94, -0.18, -1.3]) {
      add(`seam-${sz}-${dx}`, new THREE.BoxGeometry(0.008, 0.62, 0.004), plastic(0x3a0a0c), [dx, 0.66, sz * 0.877], null);
    }
    // ملصق «PETIT TAXI» على الباب الأمامي
    const dec = add(`decal-${sz}`, new THREE.PlaneGeometry(1.05, 0.33), new THREE.MeshStandardMaterial({ map: doorDecal(), transparent: true, roughness: 0.3 }), [0.36, 0.64, sz * 0.879], null, [0, sz > 0 ? 0 : Math.PI, 0]);
    dec.renderOrder = 1;
  }

  // الخلف: شريط ضوء أحمر، صدّام
  add('taillight', new THREE.BoxGeometry(0.04, 0.06, 1.4), new THREE.MeshStandardMaterial({ color: 0xd0151b, emissive: 0x7a0508, roughness: 0.12 }), [-1.985, 0.86, 0], { mud: 0.5, seed: 60 });
  add('rear-trim', new THREE.BoxGeometry(0.08, 0.12, 1.5), plastic(), [-1.98, 0.3, 0], { mud: 1.8, rust: 0.8, seed: 61 });

  // اللوحات
  const plate = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.4 });
  add('plate-f', new THREE.PlaneGeometry(0.48, 0.105), plate, [2.036, 0.44, 0], null, [0, Math.PI / 2, 0]);
  add('plate-r', new THREE.PlaneGeometry(0.48, 0.105), plate.clone(), [-2.006, 0.56, 0], null, [0, -Math.PI / 2, 0]);

  // لافتة الطاكسي فوق السقف
  const sign = add('sign', new THREE.BoxGeometry(0.24, 0.2, 0.6), plastic(0xf6c945), [-0.62, 1.58, 0], { mud: 0, dust: 1.3, seed: 70 });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.35, emissive: 0x332a10 });
  for (const sx of [1, -1]) {
    add(`sign-face-${sx}`, new THREE.PlaneGeometry(0.56, 0.18), signMat, [sign.position.x + sx * 0.122, 1.58, 0], null, [0, sx * Math.PI / 2, 0]);
  }

  // العجلات: إطار + جنط عصري بخمس أذرع
  const tire = plastic(0x151515);
  tire.roughness = 0.9;
  const rim = new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 0.18, metalness: 0.9 });
  const rimDark = plastic(0x1e2125);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const wx = sx * WHEEL_X, wz = sz * 0.74;
    add(`tire-${sx}${sz}`, new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.24, 36, 1), tire, [wx, WHEEL_R, wz], { mud: 2.4, dust: 0.8, seed: 80 + sx * 2 + sz }, [Math.PI / 2, 0, 0]);
    const face = sz * 0.865;
    add(`rim-${sx}${sz}`, new THREE.CylinderGeometry(0.23, 0.23, 0.02, 36, 1), rimDark, [wx, WHEEL_R, face - sz * 0.004], { mud: 2, seed: 90 + sx * 2 + sz }, [Math.PI / 2, 0, 0]);
    const spokes = new THREE.Group();
    spokes.position.set(wx, WHEEL_R, face + sz * 0.006);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.21, 0.014), rim);
      sp.position.set(Math.sin((i / 5) * Math.PI * 2) * 0.11, Math.cos((i / 5) * Math.PI * 2) * 0.11, 0);
      sp.rotation.z = -(i / 5) * Math.PI * 2;
      spokes.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), rim);
    hub.rotation.x = Math.PI / 2;
    spokes.add(hub);
    root.add(spokes);
    spokes.children.forEach((c) => overlays.push(c as THREE.Mesh));
  }

  // الطاكسي أكبر بـ 10%
  root.scale.setScalar(CAR_SCALE);
  const volume = new DirtVolume(root, parts);
  for (const o of overlays) volume.addOverlay(o);
  const box = new THREE.Box3(new THREE.Vector3(-2.1, 0, -0.98), new THREE.Vector3(2.1, 1.7, 0.98));
  box.min.multiplyScalar(CAR_SCALE); box.max.multiplyScalar(CAR_SCALE);
  return { root, volume, box };
}
