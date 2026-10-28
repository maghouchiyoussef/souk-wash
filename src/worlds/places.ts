import * as THREE from 'three';
import { buildOutdoor, canvasTex, tree } from './street';

// الأماكن الأربعة الخارجية، كل واحد بتفاصيله.

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });

/** المستوى 2: زنقة في الحومة (دكاكين، مقهى، عمارات) */
export const buildStreet = buildOutdoor({
  back: 'shops.jpg', front: 'building.jpg', sides: 'building.jpg', halfX: 9,
  extras: (root) => {
    // كراسي ودرّاجة نارية مركونة؟ نكتفي بحواجز الرصيف وصندوق بريد
    const bollard = std({ color: 0x2b2f34, metalness: 0.5 });
    for (let x = -8; x <= 8; x += 2) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 10), bollard);
      b.position.set(x, 0.56, -5.45); root.add(b);
    }
  },
});

/** المستوى 3: أمام مدرسة خاصة */
export const buildSchool = buildOutdoor({
  back: 'school.jpg', front: 'building.jpg', sides: 'building.jpg', halfX: 10, crosswalk: true,
  sign: { ar: 'مدرسة الأمل الخاصة', fr: 'École Privée Al Amal', color: '#1d4f9a', bg: '#ffffff' },
  extras: (root) => {
    // لوحة «انتباه أطفال»
    const t = canvasTex(256, 256, (g) => {
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(128, 12); g.lineTo(248, 236); g.lineTo(8, 236); g.closePath(); g.fill();
      g.strokeStyle = '#d0201a'; g.lineWidth = 20; g.stroke();
      g.fillStyle = '#111';
      for (const [x, s] of [[100, 1], [150, 0.8]] as [number, number][]) {
        g.beginPath(); g.arc(x, 120, 14 * s, 0, Math.PI * 2); g.fill();
        g.fillRect(x - 10 * s, 136, 20 * s, 50 * s);
      }
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), std({ color: 0x8a9096, metalness: 0.7 }));
    pole.position.set(7.5, 1.3, -5.6); root.add(pole);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), std({ map: t, transparent: true, side: THREE.DoubleSide }));
    sign.position.set(7.5, 2.7, -5.55); root.add(sign);
  },
});

/** المستوى 4: محطة الوقود (مظلّة ومضخّات) */
export const buildStation = buildOutdoor({
  back: 'station.jpg', front: 'building.jpg', sides: 'building.jpg', halfX: 10, orbit: 8,
  extras: (root, solids, obstacles) => {
    const white = std({ color: 0xf2f4f5, roughness: 0.5 });
    const green = std({ color: 0x1f8a4c, roughness: 0.5 });
    // المظلّة فوق المضخّات
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(15, 0.6, 8), white);
    canopy.position.set(0, 5.6, -0.6); root.add(canopy);
    const band = new THREE.Mesh(new THREE.BoxGeometry(15.04, 0.3, 8.04), green);
    band.position.set(0, 5.55, -0.6); root.add(band);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 7.8), std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    under.rotation.x = Math.PI / 2; under.position.set(0, 5.29, -0.6); root.add(under);
    for (const x of [-7, 7]) for (const z of [-4.3, 3.0]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.3, 0.4), white);
      p.position.set(x, 2.65, z); root.add(p); solids.push(p);
      obstacles.push(new THREE.Box3().setFromObject(p));
    }
    // جزيرة المضخّات خلف الشاحنة
    for (const z of [-3.7]) {
      const isl = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 1), std({ color: 0xc9cdd2 }));
      isl.position.set(0, 0.1, z); root.add(isl);
      obstacles.push(new THREE.Box3().setFromObject(isl).expandByScalar(0.05));
      for (const x of [-1.4, 1.4]) {
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.5), white);
        pump.position.set(x, 1.05, z); root.add(pump); solids.push(pump);
        obstacles.push(new THREE.Box3().setFromObject(pump).expandByScalar(0.1));
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.25, 0.52), green);
        top.position.set(x, 1.85, z); root.add(top);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), std({ color: 0x0b1d14, emissive: 0x1ae07a, emissiveIntensity: 0.3 }));
        scr.position.set(x, 1.35, z + (z > 0 ? -0.26 : 0.26)); scr.rotation.y = z > 0 ? Math.PI : 0; root.add(scr);
      }
    }
    // لوحة الأسعار
    const t = canvasTex(256, 512, (g) => {
      g.fillStyle = '#1f8a4c'; g.fillRect(0, 0, 256, 512);
      g.fillStyle = '#ffffff'; g.font = '700 34px Plex, sans-serif'; g.textAlign = 'center';
      g.fillText('CARBURANT', 128, 60);
      const rows: [string, string][] = [['Gasoil', '11.20'], ['Sans plomb', '13.10']];
      rows.forEach(([n, p], i) => {
        g.fillStyle = '#0b1d14'; g.fillRect(16, 110 + i * 170, 224, 140);
        g.fillStyle = '#ffffff'; g.font = '600 26px Plex, sans-serif'; g.fillText(n, 128, 150 + i * 170);
        g.fillStyle = '#ffd23a'; g.font = '700 54px Plex, sans-serif'; g.fillText(p, 128, 215 + i * 170);
      });
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.2), std({ map: t }));
    board.position.set(-8.5, 2.6, -5.6); root.add(board);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), std({ color: 0x8a9096 }));
    leg.position.set(-8.5, 0.7, -5.6); root.add(leg);
  },
});

/** المستوى 5: أمام المستودع (حاويات ومنصّات) */
export const buildDepot = buildOutdoor({
  back: 'depot.jpg', front: 'building.jpg', sides: 'depot.jpg', halfX: 12, orbit: 10,
  extras: (root, solids) => {
    const corrugated = (color: string) => {
      const t = canvasTex(256, 128, (g) => {
        g.fillStyle = color; g.fillRect(0, 0, 256, 128);
        for (let x = 0; x < 256; x += 8) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 3, 128); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 4, 0, 2, 128); }
      });
      return std({ map: t, metalness: 0.4, roughness: 0.6 });
    };
    const box = (w: number, h: number, d: number, mat: THREE.Material, pos: [number, number, number], solid = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(...pos); root.add(m); if (solid) solids.push(m);
    };
    box(2.4, 2.6, 6, corrugated('#1f5fa8'), [-13, 1.3, 2]);
    box(2.4, 2.6, 6, corrugated('#c2462b'), [-13, 3.9, 2]);
    box(2.4, 2.6, 6, corrugated('#2f8f6a'), [13, 1.3, 1.5]);
    const wood = std({ color: 0xb08a5a, roughness: 0.9 });
    for (let i = 0; i < 4; i++) box(1.2, 0.15, 1.0, wood, [10.5, 0.075 + i * 0.16, -4.9], false);
    // خطوط وقوف صفراء
    const y = std({ color: 0xf2c230 });
    for (const x of [-9, 9]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 9), y);
      l.rotation.x = -Math.PI / 2; l.position.set(x, 0.006, 0.6); root.add(l);
    }
    tree(root, -12, -6.5, 0.9);
  },
});
