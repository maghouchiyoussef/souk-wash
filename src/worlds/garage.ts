import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { World } from './world';

// «گراج لافاج» مغربي: زليج، باب حديدي بقوس، أرضية مبلّلة، لافتة نيون.
// الصور مصمّمة في Canva وتوضع في www/img/garage/. إن لم تكن موجودة نرسم بديلًا بالكود.

const W = 16, D = 13, H = 4.6; // عرض، عمق، ارتفاع الگراج

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// ---------- بدائل مرسومة بالكود ----------
function drawWall(g: CanvasRenderingContext2D) {
  const r = rand(5), w = 1024, h = 512;
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(120,100,70,${r() * 0.05})`; g.fillRect(r() * w, r() * h * 0.5, 4, 4); }
  g.fillStyle = '#7a4a26'; g.fillRect(0, h * 0.48, w, 14);
  const cols = ['#1f6f6b', '#f2ead3', '#2c4f8a', '#f2ead3', '#c7952f', '#f2ead3'];
  const s = 32;
  for (let y = 0; y < (h * 0.5) / s; y++) for (let x = 0; x < w / s; x++) {
    g.fillStyle = cols[(x + y * 2) % cols.length];
    g.fillRect(x * s, h * 0.5 + y * s, s, s);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(x * s + s / 2, h * 0.5 + y * s + 2); g.lineTo(x * s + s - 2, h * 0.5 + y * s + s / 2);
    g.lineTo(x * s + s / 2, h * 0.5 + y * s + s - 2); g.lineTo(x * s + 2, h * 0.5 + y * s + s / 2);
    g.fill();
  }
}

function drawFloor(g: CanvasRenderingContext2D) {
  const r = rand(9), s = 512;
  g.fillStyle = '#7d8084'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 6000; i++) { const l = 100 + r() * 60; g.fillStyle = `rgba(${l},${l},${l + 4},0.25)`; g.fillRect(r() * s, r() * s, 2 + r() * 3, 2 + r() * 3); }
  for (let i = 0; i < 6; i++) {
    const gr = g.createRadialGradient(r() * s, r() * s, 4, r() * s, r() * s, 60 + r() * 80);
    gr.addColorStop(0, 'rgba(40,45,52,0.35)'); gr.addColorStop(1, 'rgba(40,45,52,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
}

function drawDoor(g: CanvasRenderingContext2D) {
  const w = 768, h = 576;
  g.fillStyle = '#e3d3b4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e5b55';
  g.beginPath(); g.moveTo(110, h); g.lineTo(110, 200); g.quadraticCurveTo(110, 70, w / 2, 60); g.quadraticCurveTo(w - 110, 70, w - 110, 200); g.lineTo(w - 110, h); g.fill();
  for (let y = 90; y < h; y += 22) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(110, y, w - 220, 3); }
}

function drawSign(g: CanvasRenderingContext2D) {
  g.fillStyle = '#111619'; g.beginPath(); g.roundRect(0, 0, 1024, 256, 40); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [blur, col] of [[30, '#38c6ff'], [8, '#9ae6ff'], [0, '#ffffff']] as [number, string][]) {
    g.shadowColor = '#38c6ff'; g.shadowBlur = blur; g.fillStyle = col;
    g.font = '700 120px Plex, sans-serif';
    g.fillText('LAVAGE', 330, 132);
  }
  for (const [blur, col] of [[30, '#ffb02e'], [8, '#ffd27a'], [0, '#fff6e0']] as [number, string][]) {
    g.shadowColor = '#ffb02e'; g.shadowBlur = blur; g.fillStyle = col;
    g.direction = 'rtl';
    g.font = '700 130px Plex, sans-serif';
    g.fillText('غسيل', 790, 120);
    g.direction = 'ltr';
  }
}

/** مادة بصورة من Canva إن وُجدت، وإلا بالبديل المرسوم. */
function imageMaterial(file: string, fallback: THREE.Texture, repeat: [number, number], opts: THREE.MeshStandardMaterialParameters = {}) {
  // التكرار بالمرآة يُخفي الحدود بين نسخ الصورة
  const wrap = repeat[0] > 1 || repeat[1] > 1 ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
  fallback.wrapS = fallback.wrapT = wrap;
  fallback.repeat.set(...repeat);
  const mat = new THREE.MeshStandardMaterial({ map: fallback, roughness: 0.85, ...opts });
  new THREE.TextureLoader().load(`img/garage/${file}`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = wrap;
    t.repeat.set(...repeat);
    t.anisotropy = 4;
    mat.map = t;
    mat.needsUpdate = true;
  }, undefined, () => { /* لا توجد صورة: نبقى على البديل */ });
  return mat;
}

function plane(w: number, h: number, mat: THREE.Material, pos: [number, number, number], ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos);
  m.rotation.set(rx, ry, 0, 'YXZ');
  return m;
}

export function buildGarage(scene: THREE.Scene, renderer: THREE.WebGLRenderer): World {
  const solids: THREE.Object3D[] = [];
  const root = new THREE.Group();
  scene.background = new THREE.Color(0x1d2226);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  root.add(new THREE.HemisphereLight(0xf2f6ff, 0x5c5650, 1.5));
  const top = new THREE.DirectionalLight(0xffffff, 1.7);
  top.position.set(2, 10, 5);
  root.add(top);

  // الأرضية
  const floor = plane(W, D, imageMaterial('floor.jpg', canvasTex(512, 512, drawFloor), [W / 4, D / 4], { roughness: 0.35, metalness: 0.05 }), [0, 0, 0], 0, -Math.PI / 2);
  root.add(floor); solids.push(floor);
  // خطوط صفراء حول مكان السيارة + بالوعة
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
  for (const [w, d, x, z] of [[6.4, 0.12, 0, 1.9], [6.4, 0.12, 0, -1.9], [0.12, 3.9, 3.2, 0], [0.12, 3.9, -3.2, 0]] as number[][]) {
    root.add(plane(w, d, yellow, [x, 0.005, z], 0, -Math.PI / 2));
  }
  const drain = canvasTex(256, 32, (g) => { g.fillStyle = '#2a2d30'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#0c0d0e'; for (let x = 4; x < 256; x += 10) g.fillRect(x, 5, 5, 22); });
  root.add(plane(5.2, 0.32, new THREE.MeshStandardMaterial({ map: drain, roughness: 0.4, metalness: 0.7 }), [0, 0.006, 2.6], 0, -Math.PI / 2));

  // الجدران
  const wallTiles = (len: number) => imageMaterial('wall.jpg', canvasTex(1024, 512, drawWall), [len / (H * 2), 1]);
  const walls: [number, number, number, number][] = [
    [0, -D / 2, 0, W], [0, D / 2, Math.PI, W], [-W / 2, 0, Math.PI / 2, D], [W / 2, 0, -Math.PI / 2, D],
  ];
  for (const [x, z, ry, len] of walls) {
    const m = plane(len, H, wallTiles(len), [x, H / 2, z], ry);
    root.add(m); solids.push(m);
  }
  // الباب الحديدي بقوس (الجدار الخلفي)
  root.add(plane(6.1, 4.58, imageMaterial('door.jpg', canvasTex(768, 576, drawDoor), [1, 1], { roughness: 0.6 }), [0, 2.29, -D / 2 + 0.02]));
  // جدار الخراطيم والرفوف (يسار) والجدار الأمامي
  const side = (pos: [number, number, number], ry: number) => plane(8.6, 4.3, imageMaterial('side.jpg', canvasTex(1024, 512, drawWall), [1, 1]), pos, ry);
  root.add(side([-W / 2 + 0.02, 2.15, 0], Math.PI / 2));
  root.add(side([0, 2.15, D / 2 - 0.02], Math.PI));
  // لافتة نيون (يمين)
  const signTex = canvasTex(1024, 256, drawSign);
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.9, roughness: 0.4 });
  const sign = plane(4.4, 1.1, signMat, [W / 2 - 0.03, 3.3, 0], -Math.PI / 2);
  root.add(sign);
  document.fonts?.load('700 120px Plex', 'غسيل LAVAGE').then(() => {
    const g = (signTex.image as HTMLCanvasElement).getContext('2d')!;
    g.clearRect(0, 0, 1024, 256); drawSign(g); signTex.needsUpdate = true;
  }).catch(() => {});

  // السقف وأضواؤه
  const ceil = plane(W, D, new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.9 }), [0, H, 0], 0, Math.PI / 2);
  root.add(ceil);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
  for (const z of [-3, 0, 3]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.35), lamp);
    l.position.set(0, H - 0.04, z);
    root.add(l);
  }

  // أغراض بسيطة: دلو، آلة الرشّ، مخروط
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f7fd0, roughness: 0.5, side: THREE.DoubleSide }));
  bucket.position.set(-6.6, 0.17, -4.6);
  root.add(bucket);
  const machine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0xf2b01e, roughness: 0.45 }));
  machine.position.set(-6.9, 0.45, 3.6);
  root.add(machine); solids.push(machine);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }));
  cone.position.set(5.6, 0.25, 4.4);
  root.add(cone);

  scene.add(root);
  return {
    root, solids,
    area: { minX: -W / 2 + 0.7, maxX: W / 2 - 0.7, minZ: -D / 2 + 0.7, maxZ: D / 2 - 0.7 },
    spawn: { x: 0, z: 4.6, yaw: 0 },
    orbit: 5.8,
  };
}
