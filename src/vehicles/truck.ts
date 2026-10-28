import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit, Model, Item, M, curve, loft, canvasTex, plateTex, honeycombTex, ledTex, paint, plastic, chrome, glass, lensMat, ledWhite, LoftMeta } from './kit';

// المستوى 4 «الكاميو» والمستوى 5 «الرموك»: رأس شاحنة عصري (قمرة فوق المحرّك) بلا شعار ولا ماركة.
// الكاميو: قمرة + صندوق نقل. الرموك: رأس جرّار + مقطورة طويلة بستارة.

const CW = 1.22;   // نصف عرض القمرة

/** قمرة الشاحنة: x من 0 (الخلف) إلى 2.3 (الأمام). ترجع السطح لِلّصق. */
function cab(kit: Kit, x0: number, color: number, roofHigh: boolean) {
  const H = roofHigh ? 3.75 : 3.25;
  const front = curve([[0, H], [1.6, H], [2.05, H - 0.08], [2.25, H - 0.35], [2.32, 2.4], [2.36, 1.4], [2.38, 0.95]]);
  const lo = 0.95;
  const build = loft(x0, x0 + 2.38, 60, 72, (x) => {
    const u = x - x0;
    return { yb: lo, yt: front(u), w: CW * (u > 2.2 ? 1 - (u - 2.2) * 0.6 : 1), q: 9, tumble: 0.04, r: 0.16 };
  });
  const ws = (m: LoftMeta) => m.x - x0 > 2.12 && m.y > 2.25 && m.y < H - 0.3 && m.zn < 0.88;
  const side = (m: LoftMeta) => m.zn > 0.96 && m.y > 2.2 && m.y < 2.95 && m.x - x0 > 1.15 && m.x - x0 < 2.15;
  const body = kit.addMesh('cab', build((m) => !ws(m) && !side(m)), paint(color), { rust: 0.5 });
  kit.addMesh('cab-glass', build((m) => ws(m) || side(m)), glass(), { mud: 0.4, dust: 1, seed: 9 });
  return { body, H, front: x0 + 2.38 };
}

/** شاسيه، عجلات، خزّانات وقود، صناديق، درج */
function chassis(kit: Kit, xFrom: number, xTo: number, axles: number[], rearDual: boolean) {
  const steel = plastic(0x1a1c1f, 0.6);
  kit.group('chassis', steel, { mud: 2.2, rust: 0.8, seed: 30 }, [
    [new THREE.BoxGeometry(xTo - xFrom, 0.28, 0.16), M([(xFrom + xTo) / 2, 0.85, 0.48])],
    [new THREE.BoxGeometry(xTo - xFrom, 0.28, 0.16), M([(xFrom + xTo) / 2, 0.85, -0.48])],
  ]);
  axles.forEach((ax, i) => {
    const dual = rearDual && i > 0;
    for (const sz of [1, -1]) {
      kit.wheel(`a${i}${sz}`, ax, sz * 0.98, sz, 0.52, 0.32, { spokes: 10, rim: 0xd8dde3, seed: 80 + i * 3 + sz });
      if (dual) kit.wheel(`a${i}${sz}i`, ax, sz * 0.66, sz, 0.52, 0.3, { spokes: 10, rim: 0xa8aeb5, seed: 90 + i * 3 + sz });
    }
  });
}

/** مصدّات الطين خلف العجلات */
function mudflaps(items: Item[], x: number) {
  for (const sz of [1, -1]) items.push([new THREE.BoxGeometry(0.02, 0.55, 0.5), M([x, 0.5, sz * 0.98])]);
}

/** المقدّمة: شبكة، أضواء LED، صدّام، درج، مرايا، شمسية */
function cabDetails(kit: Kit, x0: number, H: number, color: number) {
  const S = kit.onSurf.bind(kit);
  const fx = x0 + 3;
  kit.group('grille', new THREE.MeshStandardMaterial({ map: honeycombTex(), roughness: 0.4, metalness: 0.5 }), { mud: 0.9, seed: 40 }, [
    [new RoundedBoxGeometry(1.5, 0.8, 0.05, 2, 0.04), S([fx, 1.65, 0], [-1, 0, 0])],
  ]);
  kit.group('grille-bars', chrome(), null, [0, 1, 2, 3].map((i) => [new THREE.BoxGeometry(1.45, 0.025, 0.02), S([fx, 1.38 + i * 0.18, 0], [-1, 0, 0], 0.03)] as Item));
  const head: Item[] = [], drl: Item[] = [];
  for (const sz of [1, -1]) {
    const m = S([fx, 1.25, sz * 0.92], [-1, 0, 0], -0.01);
    head.push([new RoundedBoxGeometry(0.42, 0.2, 0.06, 2, 0.04), m]);
    for (const dz of [0.1, -0.08]) head.push([new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), m.clone().multiply(M([sz * dz, 0.01, 0.03], [Math.PI / 2, 0, 0]))]);
    drl.push([new THREE.BoxGeometry(0.4, 0.018, 0.015), m.clone().multiply(M([0, -0.085, 0.031]))]);
  }
  kit.group('headlights', lensMat(), { mud: 0.5, seed: 42 }, head);
  kit.group('drl', ledWhite(), null, drl);
  kit.group('bumper', plastic(0x2a2d31, 0.5), { mud: 2, rust: 0.6, seed: 45 }, [
    [new RoundedBoxGeometry(0.32, 0.4, 2.46, 2, 0.06), M([x0 + 2.38, 0.85, 0])],
  ]);
  // درج القمرة ومقابض
  const steps: Item[] = [], mirrors: Item[] = [];
  for (const sz of [1, -1]) {
    for (const y of [0.6, 1.0]) steps.push([new THREE.BoxGeometry(0.42, 0.04, 0.22), M([x0 + 1.75, y, sz * (CW - 0.02)])]);
    steps.push([new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), M([x0 + 1.25, 1.75, sz * (CW + 0.03)])]);
    const base = M([x0 + 2.3, 2.6, sz * (CW + 0.05)]);
    mirrors.push([new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), base.clone().multiply(M([0, 0, sz * 0.18], [Math.PI / 2, 0, 0]))]);
    mirrors.push([new RoundedBoxGeometry(0.1, 0.5, 0.26, 2, 0.04), base.clone().multiply(M([0.02, -0.1, sz * 0.38]))]);
  }
  kit.group('steps', plastic(0x2a2d31, 0.4), { mud: 1.6, seed: 47 }, steps);
  kit.group('mirrors', plastic(0x15171a, 0.5), { mud: 0.3, seed: 50 }, mirrors);
  // شمسية فوق الزجاج وأضواء سقف برتقالية
  kit.group('visor', paint(color), { dust: 1.2, seed: 52 }, [[new RoundedBoxGeometry(0.3, 0.06, 2.3, 2, 0.02), M([x0 + 2.3, H - 0.25, 0], [0, 0, -0.25])]]);
  const amber: Item[] = [];
  for (const z of [-0.6, -0.3, 0, 0.3, 0.6]) amber.push([new THREE.BoxGeometry(0.05, 0.05, 0.12), M([x0 + 2.36, H - 0.18, z])]);
  kit.group('roof-lights', new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8a00, emissiveIntensity: 0.6 }), null, amber);
  kit.group('wipers', plastic(0x0c0d0f, 0.5), null, [
    [new THREE.BoxGeometry(0.02, 0.9, 0.02), M([x0 + 2.36, 2.55, 0.5], [0.8, 0, 0])],
    [new THREE.BoxGeometry(0.02, 0.9, 0.02), M([x0 + 2.36, 2.55, -0.35], [0.8, 0, 0])],
  ]);
  const plate = plateTex('58301', 'د', '6');
  kit.decal(plate, 0.52, 0.11, M([x0 + 2.55, 0.85, 0], [0, Math.PI / 2, 0]), false);
}

/** خزّان وقود وصندوق بطاريات على الجانبين */
function tanks(kit: Kit, x: number) {
  const items: Item[] = [];
  items.push([new THREE.CylinderGeometry(0.3, 0.3, 1.1, 24), M([x, 0.85, 0.95], [0, 0, Math.PI / 2])]);
  items.push([new RoundedBoxGeometry(0.8, 0.5, 0.45, 2, 0.05), M([x, 0.85, -0.95])]);
  kit.group('tanks', new THREE.MeshStandardMaterial({ color: 0xc6ccd3, roughness: 0.25, metalness: 0.9 }), { mud: 1.4, dust: 1, seed: 55 }, items);
}

const companyTex = (ar: string, fr: string, bg: string, fg: string) => canvasTex(1024, 256, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl'; g.font = '700 96px Plex, sans-serif'; g.fillText(ar, 512, 86);
  g.direction = 'ltr'; g.font = '700 64px Plex, sans-serif'; g.fillText(fr, 512, 196);
});

/** المستوى 4: شاحنة نقل بصندوق مغلق */
export function buildTruck(): Model {
  const kit = new Kit(3.4);
  const WHITE = 0xeef0f2;
  // القمرة في الأمام (x من 1.6 إلى 3.98)، الصندوق خلفها
  const c = cab(kit, 1.6, WHITE, false);
  kit.setSurface(c.body);
  cabDetails(kit, 1.6, c.H, WHITE);
  chassis(kit, -3.6, 3.7, [2.85, -2.2], true);
  tanks(kit, 0.9);
  // صندوق النقل: ألواح مضلّعة
  const panel = canvasTex(512, 256, (g) => {
    g.fillStyle = '#f2f3f4'; g.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 32) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, 0, 3, 256); }
  });
  panel.wrapS = THREE.RepeatWrapping; panel.repeat.set(3, 1);
  const boxMat = new THREE.MeshStandardMaterial({ map: panel, roughness: 0.5, metalness: 0.2 });
  kit.group('cargo', boxMat, { rust: 0.3, seed: 60 }, [[new RoundedBoxGeometry(5.0, 2.7, 2.48, 3, 0.05), M([-1.0, 2.5, 0])]]);
  kit.group('cargo-frame', plastic(0x8a9096, 0.4), { mud: 0.8, rust: 0.6, seed: 61 }, [
    [new THREE.BoxGeometry(5.04, 0.12, 2.52), M([-1.0, 1.16, 0])],
    [new THREE.BoxGeometry(5.04, 0.08, 2.52), M([-1.0, 3.84, 0])],
    [new THREE.BoxGeometry(0.06, 2.7, 2.52), M([-3.52, 2.5, 0])],
  ]);
  kit.setSurface(kit.root.getObjectByName('cargo') as THREE.Mesh);
  const S = kit.onSurf.bind(kit);
  for (const sz of [1, -1]) kit.decal(companyTex('نقل البضائع الحومة', 'TRANSPORT DE MARCHANDISES', '#1d4f9a', '#ffffff'), 4.2, 1.05, S([-1.0, 2.6, sz * 3], [0, 0, -sz], 0.004), false);
  // الأبواب الخلفية والأضواء
  const back: Item[] = [];
  for (const z of [-0.6, 0.6]) for (const y of [1.8, 3.2]) back.push([new THREE.BoxGeometry(0.03, 0.08, 0.3), M([-3.56, y, z])]);
  back.push([new THREE.BoxGeometry(0.03, 2.6, 0.02), M([-3.56, 2.5, 0])]);
  kit.group('rear-doors', chrome(), null, back);
  const tl = ledTex();
  kit.group('taillights', new THREE.MeshStandardMaterial({ map: tl, emissive: 0xff1010, emissiveMap: tl, emissiveIntensity: 0.7 }), { mud: 0.6, seed: 62 },
    [1, -1].map((sz) => [new RoundedBoxGeometry(0.06, 0.16, 0.4, 2, 0.02), M([-3.62, 1.0, sz * 0.9])] as Item));
  const flaps: Item[] = [];
  mudflaps(flaps, -2.85);
  kit.group('mudflaps', plastic(0x0d0e10, 0.9), { mud: 2.5, seed: 64 }, flaps);
  kit.decal(plateTex('58301', 'د', '6'), 0.52, 0.11, M([-3.65, 0.95, 0], [0, -Math.PI / 2, 0]), false);
  return kit.finish(1, 0.06, [-3.7, 0, -1.4], [4.1, 3.9, 1.4]);
}

/** المستوى 5: رأس جرّار + مقطورة بستارة */
export function buildSemi(): Model {
  const kit = new Kit(4.0);
  const RED = 0xb8141b;
  const x0 = 4.2;
  const c = cab(kit, x0, RED, true);
  kit.setSurface(c.body);
  cabDetails(kit, x0, c.H, RED);
  // الواقي الهوائي فوق القمرة وواقيات جانبية
  kit.group('deflector', paint(RED), { dust: 1.2, seed: 53 }, [[new RoundedBoxGeometry(1.4, 0.3, 2.3, 3, 0.1), M([x0 + 0.8, c.H + 0.1, 0], [0, 0, 0.12])]]);
  chassis(kit, -7.4, x0 + 2.5, [x0 + 1.75, x0 - 0.2, -4.0, -5.3, -6.6], true);
  tanks(kit, x0 + 0.65);
  // صحن الربط والأنابيب
  kit.group('fifth-wheel', plastic(0x222428, 0.5), { mud: 1.4, rust: 0.8, seed: 66 }, [[new THREE.CylinderGeometry(0.7, 0.7, 0.12, 24), M([x0 - 0.3, 1.12, 0])]]);
  kit.group('air-lines', new THREE.MeshStandardMaterial({ color: 0xffd200, roughness: 0.5 }), null, [
    [new THREE.TorusGeometry(0.25, 0.02, 6, 20), M([x0 - 0.05, 2.0, 0.3], [0, Math.PI / 2, 0])],
  ]);
  // المقطورة
  const curtain = canvasTex(512, 256, (g) => {
    g.fillStyle = '#e8eaec'; g.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 64) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 4, 256); }
  });
  curtain.wrapS = THREE.RepeatWrapping; curtain.repeat.set(5, 1);
  const trailerLen = 10.8, tx = -7.6 + trailerLen / 2;
  kit.group('trailer', new THREE.MeshStandardMaterial({ map: curtain, roughness: 0.7 }), { seed: 70 }, [[new RoundedBoxGeometry(trailerLen, 2.8, 2.5, 3, 0.05), M([tx, 2.75, 0])]]);
  kit.group('trailer-frame', plastic(0x3c4046, 0.4), { mud: 1, rust: 0.8, seed: 71 }, [
    [new THREE.BoxGeometry(trailerLen + 0.04, 0.3, 2.54), M([tx, 1.25, 0])],
    [new THREE.BoxGeometry(trailerLen + 0.04, 0.1, 2.54), M([tx, 4.18, 0])],
  ]);
  const guards: Item[] = [];
  for (const sz of [1, -1]) guards.push([new THREE.BoxGeometry(3.5, 0.06, 0.04), M([0.2, 0.75, sz * 1.18])], [new THREE.BoxGeometry(3.5, 0.06, 0.04), M([0.2, 0.55, sz * 1.18])]);
  for (const x of [1.8, -1.4]) for (const sz of [1, -1]) guards.push([new THREE.BoxGeometry(0.06, 0.4, 0.04), M([x, 0.75, sz * 1.18])]);
  kit.group('side-guards', plastic(0xd0d4d8, 0.4), { mud: 1.8, seed: 72 }, guards);
  kit.group('landing-gear', plastic(0x2a2d31, 0.5), { mud: 1.6, rust: 0.6, seed: 73 }, [1, -1].map((sz) => [new THREE.BoxGeometry(0.12, 0.8, 0.12), M([1.6, 0.7, sz * 0.9])] as Item));
  kit.setSurface(kit.root.getObjectByName('trailer') as THREE.Mesh);
  const S = kit.onSurf.bind(kit);
  for (const sz of [1, -1]) kit.decal(companyTex('مستودعات المغرب للنقل', 'LOGISTIQUE & TRANSPORT', '#b8141b', '#ffffff'), 6.0, 1.5, S([tx, 2.8, sz * 3], [0, 0, -sz], 0.004), false);
  const tl = ledTex();
  kit.group('taillights', new THREE.MeshStandardMaterial({ map: tl, emissive: 0xff1010, emissiveMap: tl, emissiveIntensity: 0.7 }), { mud: 0.6, seed: 74 },
    [1, -1].map((sz) => [new RoundedBoxGeometry(0.06, 0.16, 0.4, 2, 0.02), M([-7.64, 1.15, sz * 0.9])] as Item));
  kit.group('rear-bar', plastic(0xd94a1a, 0.5), { mud: 1.4, seed: 75 }, [[new THREE.BoxGeometry(0.1, 0.16, 2.2), M([-7.6, 0.6, 0])]]);
  const flaps: Item[] = [];
  mudflaps(flaps, -7.3); mudflaps(flaps, x0 - 0.75);
  kit.group('mudflaps', plastic(0x0d0e10, 0.9), { mud: 2.5, seed: 76 }, flaps);
  kit.decal(plateTex('20614', 'هـ', '6'), 0.52, 0.11, M([-7.67, 0.85, 0], [0, -Math.PI / 2, 0]), false);
  return kit.finish(1, 0.075, [-7.7, 0, -1.4], [x0 + 2.75, 4.3, 1.4]);
}

