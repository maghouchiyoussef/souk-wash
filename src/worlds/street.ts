import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { World } from './world';

// أماكن خارجية: زنقة الحومة، أمام المدرسة، محطة الوقود، المستودع.
// الواجهات والأرضية والسماء صور مصمّمة في Canva (www/img/city/)، والباقي مبني بالكود.

export interface OutdoorCfg {
  back: string;               // واجهة خلف المركبة
  front: string;              // واجهة خلف اللاعب
  sides: string;              // واجهتا الجانبين
  halfX: number;              // نصف طول الساحة
  sign?: { ar: string; fr: string; color: string; bg: string };
  extras?: (root: THREE.Group, solids: THREE.Object3D[], obstacles: THREE.Box3[]) => void;
  crosswalk?: boolean;
  orbit?: number;
}

const loader = new THREE.TextureLoader();

function tex(file: string, repeat: [number, number] = [1, 1], mirrored = false) {
  const t = loader.load(`img/city/${file}`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat[0] !== 1 || repeat[1] !== 1) {
    t.wrapS = t.wrapT = mirrored ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.load('700 40px Plex', 'مدرسة').then(() => { g.clearRect(0, 0, w, h); draw(g); t.needsUpdate = true; }).catch(() => {});
  return t;
}

function plane(w: number, h: number, mat: THREE.Material, pos: [number, number, number], ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos);
  m.rotation.set(rx, ry, 0, 'YXZ');
  return m;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });

/** عمود إنارة حديث */
export function lamp(root: THREE.Group, x: number, z: number, face: number) {
  const pole = std({ color: 0x3a3f45, metalness: 0.6, roughness: 0.4 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 10), pole);
  m.position.set(x, 3, z); root.add(m);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), pole);
  arm.position.set(x, 5.95, z + face * 0.6); root.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.6), pole);
  head.position.set(x, 5.92, z + face * 1.15); root.add(head);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.5), std({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1 }));
  led.rotation.x = Math.PI / 2; led.position.set(x, 5.87, z + face * 1.15); root.add(led);
}

/** شجرة في حوض */
export function tree(root: THREE.Group, x: number, z: number, s = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * s, 0.4 * s, 0.5 * s, 16), std({ color: 0xb8a58a }));
  pot.position.set(x, 0.25 * s, z); root.add(pot);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 1.6 * s, 8), std({ color: 0x6b4a2f }));
  trunk.position.set(x, 1.2 * s, z); root.add(trunk);
  const leaf = std({ color: 0x3f7a3a, roughness: 0.9 });
  for (const [dx, dy, dz, r] of [[0, 2.2, 0, 0.75], [0.35, 1.95, 0.2, 0.5], [-0.3, 2.0, -0.25, 0.55], [0.1, 2.6, -0.1, 0.5]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), leaf);
    b.position.set(x + dx * s, dy * s, z + dz * s); root.add(b);
  }
}

export function buildOutdoor(cfg: OutdoorCfg) {
  return (scene: THREE.Scene, renderer: THREE.WebGLRenderer): World => {
    const root = new THREE.Group();
    const solids: THREE.Object3D[] = [];
    const HX = cfg.halfX, ZB = -8, ZF = 9.5;

    // السماء والإضاءة
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
    scene.background = new THREE.Color(0x8cc4ea);
    loader.load('img/city/sky.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = t;
    });
    root.add(new THREE.HemisphereLight(0xcfe6ff, 0x8a7a66, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-6, 12, 8);
    root.add(sun);

    // الطريق والرصيفان
    const road = plane(HX * 2 + 10, ZF - ZB, std({ map: tex('asphalt.jpg', [(HX * 2 + 10) / 6, (ZF - ZB) / 6], true), roughness: 0.75 }), [0, 0, (ZB + ZF) / 2], 0, -Math.PI / 2);
    root.add(road); solids.push(road);
    const walkMat = std({ map: tex('sidewalk.jpg', [(HX * 2 + 10) / 3, 1]), roughness: 0.8 });
    for (const [z0, z1] of [[ZB, ZB + 2.6], [ZF - 2.4, ZF]]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 + 10, 0.16, z1 - z0), walkMat);
      w.position.set(0, 0.08, (z0 + z1) / 2); root.add(w); solids.push(w);
      // حافة الرصيف بالأحمر والأبيض
      const curb = canvasTex(256, 16, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#c8281e'; g.fillRect(i * 32, 0, 32, 16); } });
      curb.wrapS = THREE.RepeatWrapping; curb.repeat.set((HX * 2 + 10) / 4, 1);
      const cz = z0 === ZB ? z1 : z0;
      const c = plane(HX * 2 + 10, 0.16, std({ map: curb }), [0, 0.08, cz + (z0 === ZB ? 0.001 : -0.001)], z0 === ZB ? 0 : Math.PI);
      root.add(c);
    }
    // خط أبيض متقطّع وسط الطريق
    const dash = canvasTex(256, 8, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 150, 8); });
    dash.wrapS = THREE.RepeatWrapping; dash.repeat.set((HX * 2 + 10) / 4, 1);
    root.add(plane(HX * 2 + 10, 0.14, std({ map: dash, transparent: true }), [0, 0.006, 4.2], 0, -Math.PI / 2));
    if (cfg.crosswalk) {
      const zebra = canvasTex(256, 256, (g) => { for (let i = 0; i < 8; i++) if (i % 2 === 0) { g.fillStyle = '#f4f4f4'; g.fillRect(i * 32, 0, 32, 256); } });
      root.add(plane(3.2, ZF - ZB - 5, std({ map: zebra, transparent: true, roughness: 0.7 }), [HX - 2.5, 0.007, (ZB + ZF) / 2], Math.PI / 2, -Math.PI / 2));
    }

    // الواجهات: خلف، أمام، جانبان (ارتفاع 10م على عرض 20م)
    const facade = (file: string, w: number, h: number, pos: [number, number, number], ry: number) => {
      const m = plane(w, h, std({ map: tex(file), roughness: 0.9 }), pos, ry);
      root.add(m); solids.push(m);
      return m;
    };
    const bw = HX * 2 + 4, bh = bw / 2;
    facade(cfg.back, bw, bh, [0, bh / 2 - 0.3, ZB], 0);
    facade(cfg.front, bw, bh, [0, bh / 2 - 0.3, ZF], Math.PI);
    const sw = ZF - ZB, sh = sw / 2;
    facade(cfg.sides, sw * 1.4, sh * 1.4, [-HX - 2, sh * 0.7 - 0.3, (ZB + ZF) / 2], Math.PI / 2);
    facade(cfg.sides, sw * 1.4, sh * 1.4, [HX + 2, sh * 0.7 - 0.3, (ZB + ZF) / 2], -Math.PI / 2);

    // لافتة المكان (نصّنا، بخطّنا)
    if (cfg.sign) {
      const s = cfg.sign;
      const t = canvasTex(1024, 200, (g) => {
        g.fillStyle = s.bg; g.beginPath(); g.roundRect(0, 0, 1024, 200, 28); g.fill();
        g.fillStyle = s.color; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.direction = 'rtl'; g.font = '700 74px Plex, sans-serif'; g.fillText(s.ar, 512, 66);
        g.direction = 'ltr'; g.font = '600 52px Plex, sans-serif'; g.fillText(s.fr, 512, 150);
      });
      root.add(plane(4.4, 0.86, std({ map: t, roughness: 0.5 }), [0, bh * 0.62, ZB + 0.05], 0));
    }

    // إنارة وأشجار على الأرصفة
    for (let x = -HX + 2; x <= HX - 2; x += 8) { lamp(root, x, ZB + 2.2, 1); tree(root, x + 4, ZB + 1.3, 0.9); }
    for (let x = -HX + 6; x <= HX - 2; x += 8) lamp(root, x, ZF - 2.1, -1);
    const obstacles: THREE.Box3[] = [];
    cfg.extras?.(root, solids, obstacles);

    scene.add(root);
    return {
      root, solids,
      area: { minX: -HX, maxX: HX, minZ: ZB + 2.9, maxZ: ZF - 2.7 },
      spawn: { x: 0, z: 5.2, yaw: 0 },
      orbit: cfg.orbit ?? 6.5,
      obstacles,
    };
  };
}
