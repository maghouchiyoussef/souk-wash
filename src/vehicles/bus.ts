import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit, Model, Item, M, curve, loft, planWidth, canvasTex, plateTex, honeycombTex, ledTex, paint, plastic, chrome, glass, lensMat, ledWhite, LoftMeta } from './kit';
import { smoothstep } from '../noise';

// المستوى 3 — «النقل المدرسي»: حافلة صغيرة عصرية بسقف عالٍ، صفراء بشريط أسود.
// تصميم خاص بنا (ليس نسخة من أي ماركة).

const L2 = 3.45, W2 = 1.06;
const WXF = 2.35, WXR = -1.95, WR = 0.4, AR = 0.5;

const top = curve([[-3.45, 2.62], [-3.38, 2.74], [-3.0, 2.8], [1.8, 2.8], [2.1, 2.72], [2.55, 2.0], [2.95, 1.32], [3.25, 1.2], [3.4, 1.05], [3.45, 0.85]]);
function bot(x: number) {
  let y = 0.36 + 0.06 * smoothstep(3.2, L2, Math.abs(x));
  for (const wx of [WXR, WXF]) {
    const d = Math.abs(x - wx);
    if (d < AR) y = Math.max(y, WR + Math.sqrt(AR * AR - d * d));
  }
  return y;
}
const planW = planWidth(L2, W2, 5, 9);

const sideText = () => canvasTex(1024, 256, (g) => {
  g.fillStyle = '#111111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl'; g.font = '700 110px Plex, sans-serif'; g.fillText('نقل مدرسي', 512, 82);
  g.direction = 'ltr'; g.font = '700 70px Plex, sans-serif'; g.fillText('TRANSPORT SCOLAIRE', 512, 200);
});
const frontText = () => canvasTex(512, 96, (g) => {
  g.fillStyle = '#111111'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#f6c21a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl'; g.font = '700 46px Plex, sans-serif'; g.fillText('نقل مدرسي', 256, 30);
  g.direction = 'ltr'; g.font = '700 30px Plex, sans-serif'; g.fillText('TRANSPORT SCOLAIRE', 256, 74);
});
const childSign = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(64, 6); g.lineTo(122, 118); g.lineTo(6, 118); g.closePath(); g.fill();
  g.strokeStyle = '#d0201a'; g.lineWidth = 10; g.stroke();
  g.fillStyle = '#111'; g.beginPath(); g.arc(52, 62, 8, 0, 7); g.arc(78, 62, 7, 0, 7); g.fill(); g.fillRect(45, 72, 14, 28); g.fillRect(72, 72, 12, 24);
});

export function buildBus(): Model {
  const kit = new Kit(2.8);
  const YELLOW = 0xf6c21a;

  const build = loft(-L2, L2, 140, 72, (x) => ({ yb: bot(x), yt: top(x), w: planW(x), q: 9, tumble: 0.06, r: 0.22 }));
  // الزجاج الأمامي فقط يُقطع من الهيكل؛ النوافذ الجانبية والخلفية ألواح ملصقة (حوافّ نظيفة)
  const windshield = (m: LoftMeta) => m.x > 2.08 && m.x < 2.98 && m.yn > 0.2 && m.zn < 0.86;
  const body = kit.addMesh('body', build((m) => !windshield(m)), paint(YELLOW), { rust: 0.6 });
  const glassMesh = kit.addMesh('windshield', build(windshield), glass(), { mud: 0.4, dust: 1, seed: 9 });
  kit.setSurface(body);
  const S = kit.onSurf.bind(kit);

  // النوافذ الجانبية: شريط أسود ثم ألواح زجاج بأعمدة بينها
  const frames: Item[] = [], panes: Item[] = [];
  const winEdges = [1.95, 1.0, 0.0, -1.0, -2.0, -3.05];
  for (const sz of [1, -1]) {
    frames.push([new RoundedBoxGeometry(5.15, 0.86, 0.02, 2, 0.06), S([-0.55, 2.0, sz * 3], [0, 0, -sz], 0.004)]);
    for (let i = 0; i < winEdges.length - 1; i++) {
      const x0 = winEdges[i] - 0.06, x1 = winEdges[i + 1] + 0.06;
      panes.push([new RoundedBoxGeometry(x0 - x1, 0.72, 0.02, 2, 0.05), S([(x0 + x1) / 2, 2.0, sz * 3], [0, 0, -sz], 0.012)]);
    }
  }
  frames.push([new RoundedBoxGeometry(1.7, 0.82, 0.02, 2, 0.08), S([-5, 2.02, 0], [1, 0, 0], 0.004)]);
  panes.push([new RoundedBoxGeometry(1.56, 0.7, 0.02, 2, 0.06), S([-5, 2.02, 0], [1, 0, 0], 0.012)]);
  kit.group('window-frames', plastic(0x0b0c0e, 0.35), { mud: 0.3, seed: 8 }, frames);
  kit.group('windows', glass(), { mud: 0.4, dust: 1, seed: 10 }, panes);

  // المقدّمة: أضواء، شبكة، صدّام، لافتة
  const head: Item[] = [], drl: Item[] = [];
  for (const sz of [1, -1]) {
    const m = S([5, 1.0, sz * 0.72], [-1, 0, 0], -0.006);
    head.push([new RoundedBoxGeometry(0.4, 0.18, 0.05, 2, 0.03), m]);
    for (const dz of [0.1, -0.06]) head.push([new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20), m.clone().multiply(M([sz * dz, 0, 0.025], [Math.PI / 2, 0, 0]))]);
    drl.push([new THREE.BoxGeometry(0.36, 0.016, 0.012), m.clone().multiply(M([0, -0.08, 0.026]))]);
  }
  kit.group('headlights', lensMat(), { mud: 0.5, seed: 42 }, head);
  kit.group('drl', ledWhite(), null, drl);
  kit.group('grille', new THREE.MeshStandardMaterial({ map: honeycombTex(), roughness: 0.4, metalness: 0.5 }), { mud: 0.9, seed: 40 }, [
    [new RoundedBoxGeometry(1.0, 0.24, 0.03, 2, 0.02), S([5, 0.82, 0], [-1, 0, 0])],
  ]);
  kit.setSurface(body, glassMesh);
  kit.decal(frontText(), 1.3, 0.24, S([5, 2.6, 0], [-1, 0, 0], 0.012), false);
  kit.setSurface(body);
  // الكسوة السوداء: صدّامان، جوانب
  const clad: Item[] = [
    [new RoundedBoxGeometry(0.2, 0.26, 1.9, 2, 0.05), M([L2 - 0.02, 0.52, 0])],
    [new RoundedBoxGeometry(0.2, 0.26, 1.9, 2, 0.05), M([-L2 + 0.02, 0.52, 0])],
  ];
  for (const sz of [1, -1]) {
    clad.push([new RoundedBoxGeometry(3.3, 0.12, 0.05, 2, 0.02), S([0.2, 0.47, sz * 3], [0, 0, -sz], -0.01)]);
    for (const wx of [WXR, WXF]) clad.push([new THREE.TorusGeometry(AR + 0.02, 0.04, 8, 28, Math.PI * 0.8), M([wx, WR, sz * (planW(wx) - 0.01)], [0, 0, Math.PI * 0.1])]);
  }
  kit.group('cladding', plastic(0x141619, 0.7), { mud: 2.3, dust: 0.8, seed: 57 }, clad);
  // الخلف: أضواء عمودية، خطوط الباب الخلفي، لافتة طفل
  const tl = ledTex();
  const tails: Item[] = [];
  for (const sz of [1, -1]) tails.push([new RoundedBoxGeometry(0.12, 0.6, 0.04, 2, 0.02), S([-5, 1.25, sz * 0.86], [1, 0, 0])]);
  kit.group('taillights', new THREE.MeshStandardMaterial({ map: tl, emissive: 0xff1010, emissiveMap: tl, emissiveIntensity: 0.7, roughness: 0.1 }), { mud: 0.5, seed: 60 }, tails);
  kit.decal(childSign(), 0.42, 0.42, S([-5, 1.3, 0.35], [1, 0, 0], 0.006));

  // الجوانب: المرايا الكبيرة، الباب المنزلق، الكتابة، أضواء السقف
  const mirrors: Item[] = [], seams: Item[] = [], handles: Item[] = [];
  for (const sz of [1, -1]) {
    const base = S([2.3, 2.0, sz * 3], [0, 0, -sz]);
    mirrors.push([new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), base.clone().multiply(M([0.1, 0, 0.15], [Math.PI / 2, 0, 0]))]);
    mirrors.push([new RoundedBoxGeometry(0.12, 0.42, 0.22, 2, 0.04), base.clone().multiply(M([0.12, -0.12, 0.33]))]);
    // الباب المنزلق (جهة الرصيف فقط) وأبواب السائق
    const doorX = sz > 0 ? [1.0, -0.2] : [1.7];
    for (const dx of doorX) for (let k = 0; k < 12; k++) {
      const y = 0.55 + k * 0.1;
      if (y > 1.5) continue;
      seams.push([new THREE.BoxGeometry(0.007, 0.105, 0.007), S([dx, y, sz * 3], [0, 0, -sz])]);
    }
    handles.push([new RoundedBoxGeometry(0.22, 0.035, 0.025, 2, 0.01), S([sz > 0 ? 0.85 : 1.55, 1.15, sz * 3], [0, 0, -sz], 0.003)]);
    kit.decal(sideText(), 2.6, 0.65, S([-1.3, 1.1, sz * 3], [0, 0, -sz], 0.005));
  }
  kit.group('mirrors', plastic(0x15171a, 0.5), { mud: 0.4, seed: 50 }, mirrors);
  kit.group('seams', plastic(0x3a2a00, 0.5), null, seams);
  kit.group('handles', chrome(), null, handles);
  // السقف: مكيّف وأضواء تحذير صفراء
  kit.group('roof-ac', plastic(0xe8e8e8, 0.5), { dust: 1.4, mud: 0.1, seed: 70 }, [[new RoundedBoxGeometry(1.4, 0.22, 1.1, 3, 0.08), M([-0.8, 2.9, 0])]]);
  const amber: Item[] = [];
  for (const x of [1.95, -3.2]) for (const sz of [1, -1]) amber.push([new THREE.CylinderGeometry(0.07, 0.08, 0.1, 16), M([x, 2.84, sz * 0.75])]);
  kit.group('beacons', new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8a00, emissiveIntensity: 0.6, roughness: 0.2 }), null, amber);
  kit.group('wipers', plastic(0x0c0d0f, 0.5), null, [
    [new THREE.BoxGeometry(0.02, 0.012, 0.8), M([2.85, 1.42, 0.4], [0, 0, 0.6])],
    [new THREE.BoxGeometry(0.02, 0.012, 0.8), M([2.85, 1.42, -0.4], [0, 0, 0.6])],
  ]);
  const liner = plastic(0x070708, 0.9); liner.side = THREE.DoubleSide;
  kit.group('liners', liner, null, [WXR, WXF].map((wx) => [new THREE.CylinderGeometry(AR - 0.01, AR - 0.01, 2.0, 24, 1, true, Math.PI / 2, Math.PI), M([wx, WR, 0], [Math.PI / 2, 0, 0])] as Item));
  kit.group('underbody', plastic(0x0a0a0b, 0.9), null, [[new THREE.BoxGeometry(6.2, 0.05, 1.7), M([0, 0.4, 0])]]);
  const plate = plateTex('31508', 'و', '6');
  kit.decal(plate, 0.52, 0.11, S([5, 0.55, 0], [-1, 0, 0], 0.11), false);
  kit.decal(plate, 0.52, 0.11, S([-5, 0.8, 0], [1, 0, 0], 0.01), false);

  for (const sz of [1, -1]) {
    kit.wheel(`f${sz}`, WXF, sz * 0.86, sz, WR, 0.28, { spokes: 5, rim: 0xc5cbd2, seed: 80 + sz });
    kit.wheel(`r${sz}`, WXR, sz * 0.86, sz, WR, 0.28, { spokes: 5, rim: 0xc5cbd2, seed: 84 + sz });
  }

  return kit.finish(1, 0.05, [-L2 - 0.05, 0, -W2 - 0.3], [L2 + 0.05, 3.0, W2 + 0.3]);
}
