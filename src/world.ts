import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ساحة صغيرة في الحومة: أرضية حجرية، جدران مغربية بلون الطين، وشريط زليج.
// كل القوام مرسوم بالكود على canvas (لا صور خارجية).

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function cobble(g: CanvasRenderingContext2D) {
  const r = rand(7);
  g.fillStyle = '#6f655a'; g.fillRect(0, 0, 512, 512);
  const n = 8, cell = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ox = (y % 2) * cell / 2;
    const l = 120 + r() * 50;
    g.fillStyle = `rgb(${l + 18},${l + 6},${l - 10})`;
    g.beginPath();
    g.roundRect(x * cell + ox + 3, y * cell + 3, cell - 6, cell - 6, 12);
    g.fill();
    if (ox) { g.beginPath(); g.roundRect(-cell / 2 + 3, y * cell + 3, cell - 6, cell - 6, 12); g.fill(); }
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
    g.fillRect(r() * 512, r() * 512, 2, 2);
  }
}

function zelligeBand(g: CanvasRenderingContext2D, w: number, y0: number, h: number) {
  const cols = ['#1f6f6b', '#f2ead3', '#2c4f8a', '#f2ead3', '#c7952f', '#f2ead3'];
  const s = h / 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < w / s; x++) {
    g.fillStyle = cols[(x + y * 2) % cols.length];
    g.fillRect(x * s, y0 + y * s, s, s);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.moveTo(x * s + s / 2, y0 + y * s + 2); g.lineTo(x * s + s - 2, y0 + y * s + s / 2);
    g.lineTo(x * s + s / 2, y0 + y * s + s - 2); g.lineTo(x * s + 2, y0 + y * s + s / 2);
    g.fill();
  }
  g.fillStyle = '#5b3b22';
  g.fillRect(0, y0 - 6, w, 6);
}

function wall(g: CanvasRenderingContext2D, door: boolean) {
  const r = rand(door ? 3 : 11);
  const W = 1024, H = 320;
  g.fillStyle = '#d29a5f'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,230,200' : '90,50,20'},${r() * 0.07})`;
    g.fillRect(r() * W, r() * H, 3 + r() * 6, 3 + r() * 6);
  }
  zelligeBand(g, W, H - 64, 64);
  if (door) {
    const cx = W / 2, dw = 120, top = 110;
    g.fillStyle = '#e9d9b8';
    g.beginPath(); g.ellipse(cx, top + 6, dw / 2 + 14, 62, 0, Math.PI, 0); g.lineTo(cx + dw / 2 + 14, H); g.lineTo(cx - dw / 2 - 14, H); g.fill();
    g.fillStyle = '#2f5d7a';
    g.beginPath(); g.ellipse(cx, top + 10, dw / 2, 52, 0, Math.PI, 0); g.lineTo(cx + dw / 2, H); g.lineTo(cx - dw / 2, H); g.fill();
    g.fillStyle = '#c7952f';
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) { g.beginPath(); g.arc(cx - 36 + x * 36, top + 40 + y * 34, 4, 0, Math.PI * 2); g.fill(); }
  }
}

function sky(g: CanvasRenderingContext2D) {
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#4f9fd8'); gr.addColorStop(0.6, '#a9d4ef'); gr.addColorStop(1, '#f3e6cf');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
}

export const AREA = { minX: -7.3, maxX: 7.3, minZ: -6.3, maxZ: 6.3 };

export function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer): THREE.Object3D[] {
  const solids: THREE.Object3D[] = [];
  const bg = canvasTex(4, 256, sky);
  bg.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bg;
  scene.fog = new THREE.Fog(0xe9dcc4, 18, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x8a6a48, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(6, 10, 4);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 18),
    new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, cobble, [7, 6]), roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  solids.push(ground);

  // بقعة ماء/ظل تحت السيارة (أرخص من الظلال الحقيقية)
  const blob = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  scene.add(shadow);

  const H = 4.4;
  const walls: [number, number, number, number, boolean][] = [
    [0, -8, 0, 20, true], [0, 8, Math.PI, 20, false], [-9, 0, Math.PI / 2, 18, false], [9, 0, -Math.PI / 2, 18, true],
  ];
  for (const [x, z, ry, len, door] of walls) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(len, H),
      new THREE.MeshStandardMaterial({ map: canvasTex(1024, 320, (g) => wall(g, door)), roughness: 0.95 }),
    );
    m.position.set(x, H / 2, z);
    m.rotation.y = ry;
    scene.add(m);
    solids.push(m);
  }
  return solids;
}
