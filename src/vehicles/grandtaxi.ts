import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit, Model, Item, M, curve, loft, planWidth, canvasTex, plateTex, honeycombTex, ledTex, paint, plastic, chrome, glass, lensMat, ledWhite } from './kit';
import { smoothstep } from '../noise';

// المستوى 2 — «الطاكسي الكبير»: مينيفان عصري بسبعة مقاعد، لون كريمي وخط أخضر.
// تصميم خاص بنا (ليس نسخة من أي ماركة).

const SCALE = 1.0;
const L2 = 2.35, W2 = 0.91;
const WX = 1.5, WR = 0.36, WZ = 0.76, AR = 0.44;

const bodyTop = curve([[-2.35, 1.0], [-2.3, 1.06], [-2.0, 1.08], [-0.5, 1.07], [1.05, 1.03], [1.6, 0.97], [2.0, 0.9], [2.25, 0.8], [2.35, 0.66]]);
const roofTop = curve([[-2.26, 1.06], [-2.24, 1.5], [-2.12, 1.76], [-1.6, 1.82], [0.0, 1.84], [0.45, 1.78], [0.8, 1.48], [1.08, 1.06]]);

function bodyBot(x: number) {
  let y = 0.27 + 0.08 * smoothstep(2.1, L2, Math.abs(x));
  for (const wx of [-WX, WX]) {
    const d = Math.abs(x - wx);
    if (d < AR) y = Math.max(y, WR + Math.sqrt(AR * AR - d * d));
  }
  return y;
}
const planW = planWidth(L2, W2, 3.4, 6);

const sideDecal = () => canvasTex(512, 200, (g) => {
  g.fillStyle = '#1e7a46'; g.fillRect(0, 70, 512, 18);
  g.fillStyle = '#1e7a46'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 48px Plex, sans-serif'; g.fillText('GRAND TAXI', 256, 34);
  g.direction = 'rtl'; g.font = '700 54px Plex, sans-serif'; g.fillText('طاكسي كبير', 256, 128);
  g.direction = 'ltr'; g.font = '600 26px Plex, sans-serif'; g.fillText('N° 742', 256, 178);
});

const roofSign = () => canvasTex(256, 96, (g) => {
  g.fillStyle = '#1e7a46'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 40px Plex, sans-serif'; g.fillText('GRAND TAXI', 128, 32);
  g.direction = 'rtl'; g.font = '700 28px Plex, sans-serif'; g.fillText('طاكسي كبير', 128, 72);
});

export function buildGrandTaxi(): Model {
  const kit = new Kit(1.85);
  const CREAM = 0xe9e0c8;

  // الهيكل
  const body = kit.addMesh('body', loft(-L2, L2, 100, 48, (x) => ({ yb: bodyBot(x), yt: bodyTop(x), w: planW(x), q: 6, tumble: 0.05 }))(() => true), paint(CREAM), { rust: 0.6 });

  // المقصورة: زجاج ثلاث نوافذ جانبية، أعمدة سوداء، سقف كريمي
  const cabW = (x: number) => 0.8 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs((x + 0.59) / 1.67), 10)), 1 / 10);
  const cab = loft(-2.26, 1.08, 80, 40, (x) => ({ yb: bodyTop(x) - 0.03, yt: Math.max(bodyTop(x) - 0.03, roofTop(x)), w: Math.max(0.02, cabW(x)), q: 4, tumble: 0.18, topOnly: true }));
  const isRoof = (m: { x: number; yn: number }) => m.x > -2.05 && m.x < 0.5 && m.yn > 0.94;
  const isPillar = (m: { x: number; zn: number; yn: number }) =>
    m.yn < 0.1 ||
    (m.zn > 0.3 && ((m.x > 0.0 && m.x < 0.12) || (m.x > -1.28 && m.x < -1.16))) ||
    (m.x > 0.45 && m.zn > 0.82 && m.yn > 0.2) ||
    (m.x < -2.08 && m.zn > 0.75);
  kit.addMesh('glass', cab((m) => !isRoof(m) && !isPillar(m)), glass(), { mud: 0.3, dust: 0.9, seed: 9 });
  kit.addMesh('pillars', cab((m) => !isRoof(m) && isPillar(m)), plastic(0x0b0c0e, 0.3), { mud: 0.3, seed: 8 });
  kit.addMesh('roof', cab((m) => isRoof(m)), paint(CREAM), { mud: 0, dust: 1.2, seed: 5 });
  kit.setSurface(body);
  const S = kit.onSurf.bind(kit);

  // المقدّمة
  const head: Item[] = [], drl: Item[] = [];
  for (const sz of [1, -1]) {
    const m = S([4, 0.8, sz * 0.58], [-1, 0, 0], -0.008, [0, 0, sz * -0.1]);
    head.push([new RoundedBoxGeometry(0.46, 0.1, 0.04, 2, 0.018), m]);
    for (const dz of [0.11, -0.04]) head.push([new THREE.CylinderGeometry(0.032, 0.032, 0.02, 20), m.clone().multiply(M([sz * dz, 0, 0.02], [Math.PI / 2, 0, 0]))]);
    drl.push([new THREE.BoxGeometry(0.4, 0.014, 0.012), m.clone().multiply(M([0, -0.045, 0.02]))]);
    head.push([new THREE.CylinderGeometry(0.035, 0.035, 0.03, 18), S([4, 0.44, sz * 0.66], [-1, 0, 0], 0, [Math.PI / 2, 0, 0])]);
  }
  kit.group('headlights', lensMat(), { mud: 0.5, seed: 42 }, head);
  kit.group('drl', ledWhite(), null, drl);
  kit.group('grille', new THREE.MeshStandardMaterial({ map: honeycombTex(), roughness: 0.4, metalness: 0.5 }), { mud: 0.9, seed: 40 }, [
    [new RoundedBoxGeometry(0.7, 0.12, 0.03, 2, 0.015), S([4, 0.72, 0], [-1, 0, 0])],
    [new RoundedBoxGeometry(1.1, 0.14, 0.03, 2, 0.02), S([4, 0.48, 0], [-1, 0, 0])],
  ]);
  kit.group('chrome-bar', chrome(), null, [[new THREE.BoxGeometry(0.9, 0.018, 0.015), S([4, 0.79, 0], [-1, 0, 0], 0.012)]]);

  // الخلف
  const tl = ledTex();
  const tails: Item[] = [];
  for (const sz of [1, -1]) tails.push([new RoundedBoxGeometry(0.34, 0.1, 0.04, 2, 0.015), S([-4, 0.92, sz * 0.6], [1, 0, 0], 0, [0, 0, sz * 0.25])]);
  tails.push([new THREE.BoxGeometry(1.1, 0.03, 0.03), S([-4, 0.98, 0], [1, 0, 0])]);
  kit.group('taillights', new THREE.MeshStandardMaterial({ map: tl, emissive: 0xff1010, emissiveMap: tl, emissiveIntensity: 0.7, roughness: 0.1 }), { mud: 0.5, seed: 60 }, tails);

  // الكسوة السوداء، المرايا، المقابض، خطوط الأبواب
  const clad: Item[] = [
    [new RoundedBoxGeometry(0.16, 0.08, 1.1, 2, 0.025), M([L2 - 0.1, 0.33, 0])],
    [new RoundedBoxGeometry(0.16, 0.1, 1.2, 2, 0.03), M([-L2 + 0.1, 0.35, 0])],
  ];
  const mirrors: Item[] = [], handles: Item[] = [], seams: Item[] = [];
  for (const sz of [1, -1]) {
    clad.push([new RoundedBoxGeometry(2.0, 0.09, 0.05, 2, 0.02), S([0, 0.33, sz * 2], [0, 0, -sz], -0.005)]);
    for (const wx of [-WX, WX]) clad.push([new THREE.TorusGeometry(AR + 0.02, 0.035, 8, 28, Math.PI * 0.82), M([wx, WR, sz * (planW(wx) - 0.015)], [0, 0, Math.PI * 0.09])]);
    const base = S([0.95, 1.0, sz * 2], [0, 0, -sz]);
    mirrors.push([new RoundedBoxGeometry(0.06, 0.05, 0.12, 2, 0.02), base.clone().multiply(M([0, 0, 0.05]))]);
    mirrors.push([new RoundedBoxGeometry(0.22, 0.14, 0.09, 3, 0.04), base.clone().multiply(M([-0.03, 0.04, 0.14]))]);
    for (const hx of [0.45, -0.95]) handles.push([new RoundedBoxGeometry(0.18, 0.03, 0.02, 2, 0.008), S([hx, 0.92, sz * 2], [0, 0, -sz], 0.002)]);
    // باب منزلق خلفي (سكّة) وخطوط الأبواب
    handles.push([new THREE.BoxGeometry(1.2, 0.014, 0.012), S([-1.5, bodyTop(-1.5) - 0.04, sz * 2], [0, 0, -sz])]);
    for (const dx of [1.05, -0.12, -1.25]) for (let k = 0; k < 7; k++) {
      const y = 0.38 + k * 0.1;
      if (y > bodyTop(dx) - 0.05 || y < Math.max(bodyBot(dx - 0.04), bodyBot(dx + 0.04)) + 0.06) continue;
      seams.push([new THREE.BoxGeometry(0.006, 0.105, 0.006), S([dx, y, sz * 2], [0, 0, -sz])]);
    }
    kit.decal(sideDecal(), 1.1, 0.43, S([-0.1, 0.66, sz * 2], [0, 0, -sz], 0.004));
  }
  kit.group('cladding', plastic(0x141619, 0.7), { mud: 2.2, dust: 0.8, seed: 57 }, clad);
  kit.group('mirrors', paint(CREAM), { seed: 50 }, mirrors);
  kit.group('handles', chrome(), null, handles);
  kit.group('seams', plastic(0x4a4436, 0.5), null, seams);
  const liner = plastic(0x070708, 0.9); liner.side = THREE.DoubleSide;
  kit.group('liners', liner, null, [-WX, WX].map((wx) => [new THREE.CylinderGeometry(AR - 0.01, AR - 0.01, 1.76, 24, 1, true, Math.PI / 2, Math.PI), M([wx, WR, 0], [Math.PI / 2, 0, 0])] as Item));
  kit.group('underbody', plastic(0x0a0a0b, 0.9), null, [[new THREE.BoxGeometry(3.8, 0.04, 1.4), M([0, 0.3, 0])]]);

  // قضبان السقف واللافتة
  const roofAcc: Item[] = [];
  for (const sz of [1, -1]) {
    roofAcc.push([new THREE.CylinderGeometry(0.016, 0.016, 2.1, 10), M([-0.85, roofTop(-0.85) + 0.06, sz * 0.55], [0, 0, Math.PI / 2])]);
    for (const x of [-1.85, 0.15]) roofAcc.push([new RoundedBoxGeometry(0.09, 0.07, 0.05, 2, 0.015), M([x, roofTop(x) + 0.025, sz * 0.55])]);
  }
  kit.group('roof-acc', plastic(0x121417, 0.4), { dust: 1.3, mud: 0.2, seed: 70 }, roofAcc);
  const sign = kit.addMesh('sign', new RoundedBoxGeometry(0.26, 0.2, 0.7, 3, 0.03), plastic(0x1e7a46, 0.5), { mud: 0, dust: 1.3, seed: 71 });
  sign.position.set(-0.4, roofTop(-0.4) + 0.12, 0);
  const st = roofSign();
  for (const sx of [1, -1]) kit.decal(st, 0.6, 0.17, M([-0.4 + sx * 0.132, sign.position.y, 0], [0, sx * Math.PI / 2, 0]), false);
  kit.group('wipers', plastic(0x0c0d0f, 0.5), null, [
    [new THREE.BoxGeometry(0.02, 0.012, 0.6), M([1.05, bodyTop(1.05) + 0.03, 0.32], [0, 0.35, 0])],
    [new THREE.BoxGeometry(0.02, 0.012, 0.6), M([1.05, bodyTop(1.05) + 0.03, -0.26], [0, 0.35, 0])],
  ]);
  const plate = plateTex('74219', 'ب', '1');
  kit.decal(plate, 0.48, 0.105, S([4, 0.6, 0], [-1, 0, 0], 0.035), false);
  kit.decal(plate, 0.48, 0.105, S([-4, 0.72, 0], [1, 0, 0], 0.035), false);

  for (const sx of [1, -1]) for (const sz of [1, -1]) kit.wheel(`${sx}${sz}`, sx * WX, sz * WZ, sz, WR, 0.25, { spokes: 6, rim: 0xb8bec5, seed: 80 + sx * 2 + sz });

  return kit.finish(SCALE, 0.04, [-L2 - 0.02, 0, -W2 - 0.14], [L2 + 0.02, 2.05, W2 + 0.14]);
}
