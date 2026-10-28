import * as THREE from 'three';

// إعادة توزيع إحداثيات UV لكل نموذج حتى يكون لكل وجه مكانه الخاص في قناع الوسخ.
// (أشكال Three.js الأساسية تعطي كل وجه نفس المربّع 0..1، فلو استعملناها كما هي
//  لنظّف الرشّ على وجه واحد كل الوجوه الأخرى في نفس الوقت.)

export interface Rect { x: number; y: number; w: number; h: number }

export interface Atlas {
  size: number;          // حجم القناع بالبكسل (مربّع)
  rects: Rect[];         // مستطيل كل مجموعة وجوه داخل القناع (بالبكسل)
  triRect: Uint16Array;  // رقم المستطيل لكل مثلّث (للقصّ عند الرش)
  area: number;          // المساحة الحقيقية للسطح بالمتر المربّع
}

const PAD = 3;

interface GroupInfo {
  start: number; count: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
  W: number; H: number; // الأبعاد الحقيقية بالمتر
}

function shelfPack(groups: GroupInfo[], size: number, scale: number, out?: Rect[]): boolean {
  const order = groups.map((_, i) => i).sort((a, b) => groups[b].H - groups[a].H);
  let x = PAD, y = PAD, rowH = 0;
  for (const i of order) {
    const w = Math.max(4, Math.ceil(groups[i].W * scale));
    const h = Math.max(4, Math.ceil(groups[i].H * scale));
    if (w + 2 * PAD > size) return false;
    if (x + w + PAD > size) { x = PAD; y += rowH + 2 * PAD; rowH = 0; }
    if (y + h + PAD > size) return false;
    if (out) out[i] = { x, y, w, h };
    x += w + 2 * PAD;
    rowH = Math.max(rowH, h);
  }
  return true;
}

export function atlasGeometry(geo: THREE.BufferGeometry, density: number, maxSize = 512): Atlas {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const index = geo.getIndex();
  const idx = (i: number) => (index ? index.getX(i) : i);
  const total = index ? index.count : pos.count;
  const srcGroups = geo.groups.length ? geo.groups : [{ start: 0, count: total }];

  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3();

  let area = 0;
  const groups: GroupInfo[] = [];
  for (const g of srcGroups) {
    const info: GroupInfo = { start: g.start, count: Math.min(g.count, total - g.start), uMin: 1e9, uMax: -1e9, vMin: 1e9, vMax: -1e9, W: 0, H: 0 };
    let sumT = 0, sumB = 0, sumA = 0;
    for (let i = info.start; i < info.start + info.count; i += 3) {
      const a = idx(i), c = idx(i + 1), d = idx(i + 2);
      for (const v of [a, c, d]) {
        const u = uv.getX(v), w = uv.getY(v);
        info.uMin = Math.min(info.uMin, u); info.uMax = Math.max(info.uMax, u);
        info.vMin = Math.min(info.vMin, w); info.vMax = Math.max(info.vMax, w);
      }
      p0.fromBufferAttribute(pos, a); p1.fromBufferAttribute(pos, c); p2.fromBufferAttribute(pos, d);
      e1.subVectors(p1, p0); e2.subVectors(p2, p0);
      const triA = t.crossVectors(e1, e2).length() * 0.5;
      const du1 = uv.getX(c) - uv.getX(a), dv1 = uv.getY(c) - uv.getY(a);
      const du2 = uv.getX(d) - uv.getX(a), dv2 = uv.getY(d) - uv.getY(a);
      const r = du1 * dv2 - du2 * dv1;
      if (Math.abs(r) < 1e-12 || triA < 1e-10) continue;
      t.copy(e1).multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(r);
      b.copy(e2).multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(r);
      sumT += t.length() * triA; sumB += b.length() * triA; sumA += triA;
    }
    if (sumA <= 0) continue;
    area += sumA;
    info.W = (sumT / sumA) * Math.max(1e-6, info.uMax - info.uMin);
    info.H = (sumB / sumA) * Math.max(1e-6, info.vMax - info.vMin);
    groups.push(info);
  }

  // حجم القناع حسب المساحة، ثم أكبر مقياس يسمح بترتيب كل المستطيلات.
  let size = 64;
  while (size < maxSize && size < Math.sqrt(area) * density * 1.35) size *= 2;
  let lo = 0.5, hi = size * 4;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (shelfPack(groups, size, mid)) lo = mid; else hi = mid;
  }
  const rects: Rect[] = [];
  shelfPack(groups, size, lo, rects);

  const triRect = new Uint16Array(Math.ceil(total / 3));
  const done = new Uint8Array(pos.count);
  groups.forEach((g, gi) => {
    const r = rects[gi];
    for (let i = g.start; i < g.start + g.count; i++) {
      const v = idx(i);
      if (i % 3 === 0) triRect[i / 3] = gi;
      if (done[v]) continue;
      done[v] = 1;
      const u = (uv.getX(v) - g.uMin) / Math.max(1e-6, g.uMax - g.uMin);
      const w = (uv.getY(v) - g.vMin) / Math.max(1e-6, g.vMax - g.vMin);
      uv.setXY(v, (r.x + u * r.w) / size, (r.y + w * r.h) / size);
    }
  });
  uv.needsUpdate = true;
  return { size, rects, triRect, area };
}
