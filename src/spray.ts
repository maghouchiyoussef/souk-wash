import * as THREE from 'three';
import { DirtSurface } from './dirt';

// الرشّاش: نموذج يُمسك باليد، رمي أشعة (raycast) لمعرفة أين يصيب الماء، وجزيئات الرذاذ.

export interface Nozzle {
  id: 'narrow' | 'wide';
  cone: number;      // زاوية انتشار الأشعة (راديان)
  rays: number;      // عدد الأشعة في كل إطار
  radius: number;    // نصف قطر أثر كل شعاع على السطح (متر)
  dust: number; mud: number; rust: number; // قوة الإزالة في الثانية
}

export const NOZZLES: Nozzle[] = [
  { id: 'wide', cone: 0.075, rays: 6, radius: 0.16, dust: 3.2, mud: 1.1, rust: 0 },
  { id: 'narrow', cone: 0.012, rays: 2, radius: 0.065, dust: 8, mud: 4, rust: 0.6 },
];

const RANGE = 7;
const MAX_P = 700;
const GRAV = -9.8;

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Sprayer {
  readonly gun = new THREE.Group();
  private tip = new THREE.Object3D();
  private ray = new THREE.Raycaster();
  private targets: THREE.Mesh[];
  private surfaces: DirtSurface[];
  private envTargets: THREE.Object3D[];

  // جزيئات
  private pos = new Float32Array(MAX_P * 3);
  private col = new Float32Array(MAX_P * 3);
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private next = 0;
  private points: THREE.Points;

  private v = new THREE.Vector3(); private d = new THREE.Vector3(); private o = new THREE.Vector3();
  private kick = 0;
  hitDistance = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera, surfaces: DirtSurface[], envTargets: THREE.Object3D[]) {
    this.surfaces = surfaces;
    this.targets = surfaces.map((s) => s.mesh);
    this.envTargets = envTargets;

    // نموذج الرشّاش (أصفر وأسود) مثبّت أمام الكاميرا ويُرسم فوق كل شيء.
    const body = new THREE.MeshStandardMaterial({ color: 0xf2b01e, roughness: 0.4, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5, metalness: 0.6 });
    const parts: [THREE.BufferGeometry, THREE.Material, [number, number, number], [number, number, number]][] = [
      [new THREE.BoxGeometry(0.07, 0.16, 0.09), body, [0, -0.07, 0.06], [0.25, 0, 0]],
      [new THREE.BoxGeometry(0.08, 0.08, 0.2), body, [0, 0.01, 0], [0, 0, 0]],
      [new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8), dark, [0, 0.02, -0.36], [Math.PI / 2, 0, 0]],
      [new THREE.CylinderGeometry(0.022, 0.016, 0.07, 10), dark, [0, 0.02, -0.66], [Math.PI / 2, 0, 0]],
    ];
    for (const [g, m, p, r] of parts) {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(...p); mesh.rotation.set(...r);
      mesh.renderOrder = 10;
      this.gun.add(mesh);
    }
    this.gun.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { m.depthTest = false; } });
    this.tip.position.set(0, 0.02, -0.71);
    this.gun.add(this.tip);
    this.gun.position.set(0.24, -0.25, -0.36);
    this.gun.scale.setScalar(0.8);
    this.gun.rotation.set(0.06, 0.1, 0);
    camera.add(this.gun);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.07, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX_P; i++) this.pos[i * 3 + 1] = -100;
    scene.add(this.points);
  }

  private emit(p: THREE.Vector3, v: THREE.Vector3, life: number, r: number, g: number, b: number) {
    const i = this.next; this.next = (this.next + 1) % MAX_P;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life;
  }

  /** نجوم صغيرة عند لمعان جزء. */
  sparkle(center: THREE.Vector3, size: THREE.Vector3) {
    for (let i = 0; i < 40; i++) {
      this.o.set(center.x + (Math.random() - 0.5) * size.x, center.y + (Math.random() - 0.5) * size.y, center.z + (Math.random() - 0.5) * size.z);
      this.v.set((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2);
      this.emit(this.o, this.v, 0.7 + Math.random() * 0.5, 1, 0.92, 0.55);
    }
  }

  /**
   * يرشّ إطارًا واحدًا. يرجع: هل أصاب الماء سطحًا قريبًا، وكمية الصدأ التي لم يزلها.
   */
  spray(dt: number, camera: THREE.Camera, nz: Nozzle): { hit: boolean; rustLeft: number } {
    camera.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(camera.matrixWorld);
    const tipW = this.tip.getWorldPosition(new THREE.Vector3());

    let anyHit = false, rustLeft = 0, nearest = RANGE;
    const all = [...this.targets, ...this.envTargets];
    for (let r = 0; r < nz.rays; r++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * nz.cone;
      this.d.copy(fwd).addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
      this.ray.set(origin, this.d);
      this.ray.far = RANGE;
      const hits = this.ray.intersectObjects(all, false);
      const h = hits[0];
      let end: THREE.Vector3;
      if (h) {
        end = h.point;
        nearest = Math.min(nearest, h.distance);
        const surf = h.object.userData.dirt as DirtSurface | undefined;
        if (surf && h.uv && h.faceIndex != null) {
          anyHit = true;
          const k = THREE.MathUtils.clamp(1.25 - h.distance / 5, 0.22, 1) * dt;
          const spread = 1 + h.distance * 0.12; // الرذاذ يتوسّع مع المسافة
          const px = nz.radius * spread * surf.pixelsPerMeter(h.faceIndex);
          rustLeft = Math.max(rustLeft, surf.spray(h.uv, h.faceIndex, px, { dust: nz.dust * k / spread, mud: nz.mud * k / spread, rust: nz.rust * k / spread }));
        }
        // رذاذ يرتدّ من السطح
        if (Math.random() < 0.7 && h.face) {
          const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
          this.v.copy(n).multiplyScalar(1 + Math.random() * 2).add(this.o.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2));
          const dirty = surf && !surf.done;
          this.emit(end.clone().addScaledVector(n, 0.03), this.v, 0.35 + Math.random() * 0.25, dirty ? 0.72 : 0.85, dirty ? 0.66 : 0.93, dirty ? 0.55 : 1);
        }
      } else {
        end = this.o.copy(origin).addScaledVector(this.d, RANGE);
      }
      // ماء طائر من فوهة الرشّاش نحو الهدف
      for (let k = 0; k < 2; k++) {
        this.v.subVectors(end, tipW).normalize().multiplyScalar(20 + Math.random() * 4);
        this.v.x += (Math.random() - 0.5) * 0.8; this.v.y += (Math.random() - 0.5) * 0.8; this.v.z += (Math.random() - 0.5) * 0.8;
        const p = tipW.clone().addScaledVector(this.v, Math.random() * 0.012);
        this.emit(p, this.v, Math.min(0.5, (h ? h.distance : RANGE) / 21), 0.8, 0.92, 1);
      }
    }
    this.hitDistance = nearest;
    this.kick = 1;
    return { hit: anyHit, rustLeft };
  }

  update(dt: number, spraying: boolean) {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] += GRAV * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.2; }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;

    // ارتجاج خفيف للرشّاش أثناء الرش
    this.kick = spraying ? this.kick : Math.max(0, this.kick - dt * 6);
    const j = this.kick * 0.004;
    this.gun.position.set(0.24 + (Math.random() - 0.5) * j, -0.25 + (Math.random() - 0.5) * j, -0.36 + this.kick * 0.01);
  }
}
