import * as THREE from 'three';
import { DirtSurface, DirtFn } from './dirt';
import { fbm, smoothstep, clamp01 } from './noise';

// «الطاكسي الصغير» الأحمر، مبني بالكامل من أشكال Three.js الأساسية.
// كل جزء له مادّته وقناع وسخه الخاص.

interface DirtMix { dust?: number; mud?: number; rust?: number; seed?: number }

function dirtFn(mix: DirtMix): DirtFn {
  const s = mix.seed ?? 0;
  return (p, n) => {
    const top = n.y > 0.6 ? 0.25 : 0;
    const dust = clamp01((smoothstep(0.3, 0.7, fbm(p.x * 2.3 + s, p.y * 2.3, p.z * 2.3)) * 0.8 + 0.2 + top) * (mix.dust ?? 1));
    const low = smoothstep(1.0, 0.25, p.y);
    const blob = smoothstep(0.38, 0.62, fbm(p.x * 3.1 + 7 + s, p.y * 4.0, p.z * 3.1 - 3));
    const splash = smoothstep(0.55, 0.72, fbm(p.x * 9 + s, p.y * 9 + 2, p.z * 9));
    const mud = clamp01((low * (0.35 + 0.9 * blob) + splash * 0.7 * low + 0.15 * splash) * (mix.mud ?? 1));
    const spot = smoothstep(0.6, 0.72, fbm(p.x * 1.7 + 31 + s, p.y * 1.7, p.z * 1.7 + 11));
    const rust = clamp01(spot * 1.4 * (mix.rust ?? 0));
    return [dust, mud, rust];
  };
}

function std(color: number, rough = 0.35, metal = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** صندوق مدبّب: الوجه العلوي أصغر من السفلي (لمقصورة السيارة). */
function taperedBox(w: number, h: number, d: number, topX: number, topZ: number, shiftX = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * topX + shiftX, p.getY(i), p.getZ(i) * topZ);
  }
  g.computeVertexNormals();
  return g;
}

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  const draw = () => {
    g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#b3121c';
    g.font = '700 46px Plex, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TAXI', 128, 34);
    g.font = '700 30px Plex, sans-serif';
    g.direction = 'rtl';
    g.fillText('طاكسي', 128, 74);
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // نعيد الرسم بعد تحميل الخط
  document.fonts?.load('700 30px Plex', 'طاكسي').then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

export interface Model {
  root: THREE.Group;
  surfaces: DirtSurface[];
  /** صندوق التصادم (لا يمشي اللاعب داخله) */
  box: THREE.Box3;
}

export function buildTaxi(): Model {
  const root = new THREE.Group();
  const surfaces: DirtSurface[] = [];
  const RED = 0xc8161d;

  const add = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, pos: [number, number, number], mix: DirtMix | null, rot?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    root.add(m);
    if (mix) surfaces.push(new DirtSurface(m, dirtFn(mix)));
    return m;
  };

  // الهيكل
  add(new THREE.BoxGeometry(3.8, 0.62, 1.66), std(RED, 0.28, 0.25), [0, 0.62, 0], { rust: 0.8 });
  // غطاء المحرك (مائل قليلًا)
  add(taperedBox(0.95, 0.12, 1.6, 0.96, 0.98, -0.02), std(RED, 0.28, 0.25), [1.4, 0.99, 0], { rust: 1, seed: 3 });
  // المقصورة
  const cabH = 0.6, cabL = 2.0, topX = 0.74, topZ = 0.86;
  add(taperedBox(cabL, cabH, 1.52, topX, topZ, -0.05), std(RED, 0.28, 0.25), [-0.3, 0.93 + cabH / 2, 0], { seed: 5, mud: 0.4 });

  // الزجاج
  const glass = () => std(0x1d2b33, 0.06, 0.6);
  const frontA = Math.atan(((cabL / 2) * (1 - topX) + 0.05) / cabH);
  const rearA = Math.atan(((cabL / 2) * (1 - topX) - 0.05) / cabH);
  const sideA = Math.atan((0.76 * (1 - topZ)) / cabH);
  const winY = 0.93 + cabH / 2 + 0.02;
  const fx = -0.3 + cabL / 2 - (cabL / 2) * (1 - topX) / 2 - 0.025 + 0.03;
  add(new THREE.BoxGeometry(0.02, 0.56, 1.22), glass(), [fx + 0.012, winY, 0], { mud: 0.2, seed: 9 }, [0, 0, frontA]);
  const rx = -0.3 - cabL / 2 + (cabL / 2) * (1 - topX) / 2 - 0.025;
  add(new THREE.BoxGeometry(0.02, 0.54, 1.22), glass(), [rx - 0.012, winY, 0], { mud: 0.3, seed: 10 }, [0, 0, -rearA]);
  for (const sz of [1, -1]) {
    const z = sz * (0.76 - (0.76 * (1 - topZ)) / 2 + 0.012);
    add(new THREE.BoxGeometry(1.5, 0.46, 0.02), glass(), [-0.33, winY, z], { mud: 0.35, seed: 12 + sz }, [-sz * sideA, 0, 0]);
  }

  // اللافتة فوق السقف
  const signY = 0.93 + cabH + 0.13;
  add(new THREE.BoxGeometry(0.26, 0.24, 0.62), std(0xf4f1e6, 0.4, 0), [-0.3, signY, 0], { seed: 21, mud: 0 });
  const label = new THREE.MeshBasicMaterial({ map: signTexture() });
  for (const sx of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.22), label);
    pl.position.set(-0.3 + sx * 0.131, signY, 0);
    pl.rotation.y = sx * Math.PI / 2;
    root.add(pl);
  }

  // الصدّامات
  for (const sx of [1, -1]) {
    add(new THREE.BoxGeometry(0.14, 0.2, 1.72), std(0xb9bec4, 0.25, 0.85), [sx * 1.92, 0.42, 0], { rust: 1.4, mud: 1.2, seed: 30 + sx });
  }
  // الشبكة الأمامية والأضواء
  add(new THREE.BoxGeometry(0.03, 0.2, 0.8), std(0x222222, 0.6, 0.3), [1.905, 0.72, 0], { seed: 40 });
  for (const sz of [1, -1]) {
    add(new THREE.BoxGeometry(0.04, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0x6b6040, roughness: 0.1 }), [1.91, 0.74, sz * 0.6], { seed: 41 + sz, mud: 0.6 });
    add(new THREE.BoxGeometry(0.04, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: 0xd11a1a, emissive: 0x400000, roughness: 0.15 }), [-1.91, 0.76, sz * 0.62], { seed: 45 + sz, mud: 0.6 });
    // المرايا
    add(new THREE.BoxGeometry(0.1, 0.1, 0.16), std(RED, 0.3, 0.25), [0.62, 1.08, sz * 0.92], { seed: 50 + sz });
  }

  // العجلات
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20, 1), std(0x1b1b1b, 0.85, 0), [sx * 1.25, 0.33, sz * 0.74], { mud: 2.2, dust: 0.8, seed: 60 + sx * 2 + sz }, [Math.PI / 2, 0, 0]);
    add(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16, 1), std(0xd0d4d8, 0.2, 0.9), [sx * 1.25, 0.33, sz * 0.865], { mud: 1.8, rust: 0.9, seed: 70 + sx * 2 + sz }, [Math.PI / 2, 0, 0]);
  }

  const box = new THREE.Box3(new THREE.Vector3(-2.05, 0, -0.98), new THREE.Vector3(2.05, 2, 0.98));
  return { root, surfaces, box };
}
