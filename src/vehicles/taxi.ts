import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit, Model, Item, M, curve, loft, canvasTex, plateTex, honeycombTex, ledTex, paint, plastic, chrome, glass, lensMat, ledWhite, mergeAll } from './kit';
import { smoothstep } from '../noise';

// المستوى 1 — «الطاكسي الصغير»: هاتشباك عصري أحمر بتصميم خاص بنا (ليس نسخة من أي ماركة).
// الهيكل سطح أملس من مقاطع عرضية، والتفاصيل تُلصق على السطح الحقيقي بإسقاط شعاع.

// ---------- الأبعاد ----------
const CAR_SCALE = 1.1;
const L2 = 2.08;          // نصف الطول
const W2 = 0.87;          // نصف العرض
const WHEEL_X = 1.32, WHEEL_R = 0.34, WHEEL_Z = 0.73, ARCH_R = 0.42;

const bodyTop = curve([[-2.08, 0.86], [-2.0, 0.98], [-1.8, 1.03], [-1.0, 1.03], [0.9, 0.99], [1.35, 0.93], [1.75, 0.86], [1.98, 0.76], [2.08, 0.62]]);
const roofTop = curve([[-1.92, 1.0], [-1.86, 1.18], [-1.7, 1.34], [-1.2, 1.42], [-0.4, 1.44], [0.12, 1.41], [0.5, 1.23], [0.98, 1.0]]);

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

// ---------- ملصقات الطاكسي ----------
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

const signTex = () => canvasTex(256, 96, (g) => {
  g.fillStyle = '#f6c945'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 50px Plex, sans-serif';
  g.fillText('TAXI', 128, 34);
  g.direction = 'rtl';
  g.font = '700 30px Plex, sans-serif';
  g.fillText('طاكسي', 128, 76);
});

export function buildTaxi(): Model {
  const kit = new Kit(1.5);
  const addMesh = kit.addMesh.bind(kit), group = kit.group.bind(kit), onSurf = kit.onSurf.bind(kit);
  const RED = 0xc4161c;

  // ===== الهيكل =====
  const bodyBuild = loft(-L2, L2, 90, 48, (x) => ({ yb: bodyBot(x), yt: bodyTop(x), w: planW(x), q: 5.5, tumble: 0.05 }));
  const body = addMesh('body', bodyBuild(() => true), paint(RED), { rust: 0.7 });

  // ===== المقصورة: زجاج + أعمدة سوداء + سقف أحمر =====
  const cabW = (x: number) => 0.78 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs((x + 0.47) / 1.47), 8)), 1 / 8) + 0.0;
  const cab = loft(-1.93, 0.99, 70, 40, (x) => ({ yb: bodyTop(x) - 0.03, yt: Math.max(bodyTop(x) - 0.03, roofTop(x)), w: Math.max(0.02, cabW(x)), q: 3.4, tumble: 0.24, topOnly: true }));
  const isRoof = (m: { x: number; yn: number }) => m.x > -1.66 && m.x < 0.16 && m.yn > 0.93;
  const isPillar = (m: { x: number; zn: number; yn: number }) =>
    m.yn < 0.12 ||                                   // إطار سفلي للنوافذ
    (m.x > -0.3 && m.x < -0.17 && m.zn > 0.3) ||     // العمود B
    (m.x > 0.12 && m.zn > 0.8 && m.yn > 0.2) ||      // العمود A
    (m.x < -1.62 && m.zn > 0.75);                    // العمود الخلفي
  // زجاج داكن عاكس (غير شفّاف): يلمع حين ينظف، ولا يُظهر الجهة الأخرى المتّسخة
  const glassMat = glass();
  addMesh('glass', cab((m) => !isRoof(m) && !isPillar(m)), glassMat, { mud: 0.3, dust: 0.9, seed: 9 });
  addMesh('pillars', cab((m) => !isRoof(m) && isPillar(m)), plastic(0x0b0c0e, 0.3), { mud: 0.3, seed: 8 });
  addMesh('roof', cab((m) => isRoof(m)), paint(RED), { mud: 0, dust: 1.2, seed: 5 });

  kit.setSurface(body);

  // ===== المقدّمة =====
  const headItems: Item[] = [];
  const drlItems: Item[] = [];
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
  addMesh('headlights', mergeAll(headItems), lensMat(), { mud: 0.5, seed: 42 });
  addMesh('drl', mergeAll(drlItems), ledWhite(), null);
  // الشبكة والشعار والممصّ السفلي
  const grilleMat = new THREE.MeshStandardMaterial({ map: honeycombTex(), roughness: 0.4, metalness: 0.5 });
  group('grille', grilleMat, { mud: 0.9, seed: 40 }, [
    [new RoundedBoxGeometry(0.62, 0.11, 0.03, 2, 0.015), onSurf([3, 0.69, 0], [-1, 0, 0], 0.0)],
    [new RoundedBoxGeometry(1.0, 0.13, 0.03, 2, 0.02), onSurf([3, 0.45, 0], [-1, 0, 0], 0.0)],
  ]);
  group('emblem', chrome(), null, [[new THREE.TorusGeometry(0.04, 0.008, 8, 24), onSurf([3, 0.72, 0], [-1, 0, 0], 0.02)]]);
  // ===== الخلف =====
  const tailMat = new THREE.MeshStandardMaterial({ map: ledTex(), color: 0xffffff, emissive: 0xff1010, emissiveMap: ledTex(), emissiveIntensity: 0.7, roughness: 0.1 });
  const tails: Item[] = [];
  for (const sz of [1, -1]) tails.push([new RoundedBoxGeometry(0.42, 0.09, 0.04, 2, 0.015), onSurf([-3, 0.9, sz * 0.58], [1, 0, 0], 0.0, [0, 0, sz * 0.05])]);
  tails.push([new THREE.BoxGeometry(0.7, 0.025, 0.03), onSurf([-3, 0.93, 0], [1, 0, 0], 0.0)]);
  addMesh('taillights', mergeAll(tails), tailMat, { mud: 0.5, seed: 60 });
  group('rear-reflectors', new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.2 }), null, [
    [new RoundedBoxGeometry(0.16, 0.035, 0.02, 2, 0.008), onSurf([-3, 0.42, 0.6], [1, 0, 0], 0.0)],
    [new RoundedBoxGeometry(0.16, 0.035, 0.02, 2, 0.008), onSurf([-3, 0.42, -0.6], [1, 0, 0], 0.0)],
  ]);

  // ===== الكسوة السوداء: صدّامات سفلية، جوانب، أقواس العجلات =====
  const clad: Item[] = [
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
  const liners: Item[] = [];
  for (const wx of [-WHEEL_X, WHEEL_X]) liners.push([new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 1.68, 24, 1, true, Math.PI / 2, Math.PI), M([wx, WHEEL_R, 0], [Math.PI / 2, 0, 0])]);
  const linerMat = plastic(0x070708, 0.9); linerMat.side = THREE.DoubleSide;
  group('liners', linerMat, null, liners);
  // أرضية سفلية داكنة
  group('underbody', plastic(0x0a0a0b, 0.9), null, [[new THREE.BoxGeometry(3.3, 0.04, 1.36), M([0, 0.27, 0])]]);

  // ===== الجوانب: مرايا، مقابض، خطوط الأبواب، غطاء الوقود، ملصق =====
  const mirrors: Item[] = [];
  const signals: Item[] = [];
  const handles: Item[] = [];
  const seams: Item[] = [];
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
    kit.decal(doorDecal(), 1.0, 0.31, onSurf([0.3, 0.6, sz * 2], [0, 0, -sz], 0.004));
  }
  group('mirrors', paint(RED), { seed: 50 }, mirrors);
  group('mirror-signals', new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0x804000, roughness: 0.2 }), null, signals);
  group('handles', chrome(), null, handles);
  group('seams', plastic(0x2a0405, 0.5), null, seams);

  // ===== السقف: قضبان، هوائي، جناح خلفي، لافتة =====
  const roofAcc: Item[] = [];
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
    const pl = kit.decal(signMat.map!, 0.5, 0.17, M([-0.62 + sx * 0.122, signBox.position.y, 0], [0, sx * Math.PI / 2, 0]), false);
    (pl.material as THREE.MeshStandardMaterial).emissive.set(0x332a10);
  }
  // الماسحات
  group('wipers', plastic(0x0c0d0f, 0.5), null, [
    [new THREE.BoxGeometry(0.02, 0.012, 0.55), M([0.9, bodyTop(0.9) + 0.03, 0.3], [0, 0.35, 0])],
    [new THREE.BoxGeometry(0.02, 0.012, 0.55), M([0.9, bodyTop(0.9) + 0.03, -0.25], [0, 0.35, 0])],
    [new THREE.BoxGeometry(0.012, 0.25, 0.012), M([-1.9, 1.18, 0], [0, 0, -0.5])],
  ]);

  // ===== اللوحات =====
  const plate = plateTex();
  kit.decal(plate, 0.48, 0.105, onSurf([3, 0.56, 0], [-1, 0, 0], 0.035), false);
  kit.decal(plate, 0.48, 0.105, onSurf([-3, 0.6, 0], [1, 0, 0], 0.035), false);

  // ===== العجلات =====
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    kit.wheel(`${sx}${sz}`, sx * WHEEL_X, sz * WHEEL_Z, sz, WHEEL_R, 0.24, { caliper: 0xd01818, seed: 80 + sx * 2 + sz });
  }

  // الطاكسي أكبر بـ 10%
  return kit.finish(CAR_SCALE, 0.035, [-L2 - 0.02, 0, -W2 - 0.12], [L2 + 0.02, 1.7, W2 + 0.12]);
}
