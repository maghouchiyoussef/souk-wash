import * as THREE from 'three';
import { DirtVolume } from './volume';
import { WaterGun } from './gun';

// الرشّاش: نموذج يُمسك باليد، رمي أشعة (raycast) لمعرفة أين يصيب الماء، وجزيئات الرذاذ.

export interface Nozzle {
  id: 'narrow' | 'wide' | 'turbo';
  cone: number;      // زاوية انتشار الأشعة (راديان)
  rays: number;      // عدد الأشعة في كل إطار
  radius: number;    // نصف قطر أثر كل شعاع على السطح (متر)
  dust: number; mud: number; rust: number; // قوة الإزالة في الثانية
}

export const NOZZLES: Nozzle[] = [
  { id: 'wide', cone: 0.075, rays: 7, radius: 0.18, dust: 5.4, mud: 2.0, rust: 0 },
  { id: 'narrow', cone: 0.012, rays: 3, radius: 0.07, dust: 13, mud: 6.5, rust: 1.0 },
  { id: 'turbo', cone: 0.045, rays: 6, radius: 0.13, dust: 12, mud: 6, rust: 0.8 },
];

const RANGE = 8.5;
const MAX_P = 1100;
const JET_SPEED = 30;
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

/** خطوط ماء طولية تتحرّك على النفّاثة لتعطي إحساس الضغط. */
function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 64, y = Math.random() * 256, h = 20 + Math.random() * 90;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(225,245,255,${0.35 + Math.random() * 0.5})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, 1.5 + Math.random() * 3, h);
    if (y + h > 256) g.fillRect(x, y - 256, 3, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Sprayer {
  readonly gun: WaterGun;
  private jet: THREE.Mesh;
  private jetMat: THREE.MeshBasicMaterial;
  private jetBase: Float32Array;
  private jetEnd = new THREE.Vector3();
  private jetOn = 0;
  private nozzle: Nozzle = NOZZLES[0];
  private ray = new THREE.Raycaster();
  private targets!: THREE.Object3D[];
  private volume!: DirtVolume;
  private soap = false;
  private envTargets!: THREE.Object3D[];

  // جزيئات
  private pos = new Float32Array(MAX_P * 3);
  private col = new Float32Array(MAX_P * 3);
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private next = 0;
  private points: THREE.Points;

  private v = new THREE.Vector3(); private d = new THREE.Vector3(); private o = new THREE.Vector3();
  hitDistance = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera, volume: DirtVolume, envTargets: THREE.Object3D[]) {
    this.setTargets(volume, envTargets);

    this.gun = new WaterGun((camera as THREE.PerspectiveCamera).fov);

    // النفّاثة: مخروط شفاف من الفوهة إلى نقطة الإصابة، بخطوط ماء تتحرّك
    const jg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    jg.translate(0, 0.5, 0);
    this.jetBase = (jg.getAttribute('position').array as Float32Array).slice();
    this.jetMat = new THREE.MeshBasicMaterial({
      map: streakTexture(), color: 0xcfeeff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.jet = new THREE.Mesh(jg, this.jetMat);
    this.jet.frustumCulled = false;
    this.jet.renderOrder = 11; // يُرسم بعد الزجاج والملصقات حتى لا يختفي الماء تحتها
    scene.add(this.jet);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.07, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
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

  private isCar(o: THREE.Object3D | null): boolean {
    while (o) { if (o === this.volume.root) return true; o = o.parent; }
    return false;
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
  /** عند تغيير المستوى: المركبة والأسطح الجديدة */
  setTargets(volume: DirtVolume, envTargets: THREE.Object3D[]) {
    this.volume = volume;
    this.targets = [volume.root];
    this.envTargets = envTargets;
    this.life.fill(0);
    for (let i = 0; i < MAX_P; i++) this.pos[i * 3 + 1] = -100;
  }

  /**
   * يرشّ إطارًا واحدًا. power: مضاعف قوة المضخّة. soap: رشّ صابون بدل الماء.
   */
  spray(dt: number, camera: THREE.Camera, nz: Nozzle, power = 1, soap = false): { hit: boolean; rustLeft: number } {
    this.soap = soap;
    camera.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(camera.matrixWorld);
    const tipW = this.gun.tipInCameraSpace(new THREE.Vector3()).applyMatrix4(camera.matrixWorld);
    this.nozzle = nz;

    let anyHit = false, rustLeft = 0, nearest = RANGE;
    const all = [...this.targets, ...this.envTargets];
    for (let r = 0; r < nz.rays; r++) {
      // الشعاع الأول دائمًا في مركز علامة التصويب
      const a = Math.random() * Math.PI * 2, rr = r === 0 ? 0 : Math.sqrt(Math.random()) * nz.cone;
      this.d.copy(fwd).addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
      this.ray.set(origin, this.d);
      this.ray.far = RANGE;
      const hits = this.ray.intersectObjects(all, true);
      const h = hits[0];
      let end: THREE.Vector3;
      if (h) {
        end = h.point;
        nearest = Math.min(nearest, h.distance);
        const onCar = this.isCar(h.object);
        const partIdx = h.object.userData.part as number | undefined;
        if (onCar) {
          anyHit = true;
          const k = THREE.MathUtils.clamp(1.25 - h.distance / 5, 0.22, 1) * dt;
          const spread = 1 + h.distance * 0.12; // الرذاذ يتوسّع مع المسافة
          const kk = k * power / spread;
          rustLeft = Math.max(rustLeft, this.volume.spray(h.point, nz.radius * spread * (soap ? 1.3 : 1), soap ? { dust: 0, mud: 0, rust: 0, soap: 4 * k } : { dust: nz.dust * kk, mud: nz.mud * kk, rust: nz.rust * kk }));
        }
        // رذاذ يرتدّ من السطح
        if (h.face) {
          const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
          const dirty = partIdx != null && !this.volume.parts[partIdx].done;
          const hp = end.clone().addScaledVector(n, 0.03);
          for (let k = 0; k < 2; k++) {
            this.v.copy(n).multiplyScalar(1.5 + Math.random() * 3).add(this.o.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
            this.emit(hp, this.v, 0.3 + Math.random() * 0.3, dirty ? 0.62 : 0.85, dirty ? 0.55 : 0.93, dirty ? 0.45 : 1);
          }
        }
      } else {
        end = this.o.copy(origin).addScaledVector(this.d, RANGE);
      }
      if (r === 0) { this.jetEnd.copy(end); this.gun.aimAt(h ? h.distance : RANGE); }
      // ماء طائر من فوهة الرشّاش نحو الهدف
      for (let k = 0; k < 2; k++) {
        this.v.subVectors(end, tipW).normalize().multiplyScalar(JET_SPEED + Math.random() * 5);
        this.v.x += (Math.random() - 0.5) * 0.6; this.v.y += (Math.random() - 0.5) * 0.6; this.v.z += (Math.random() - 0.5) * 0.6;
        const p = tipW.clone().addScaledVector(this.v, Math.random() * 0.02);
        if (soap) this.emit(p, this.v, Math.min(0.4, (h ? h.distance : RANGE) / JET_SPEED), 1, 0.97, 1);
        else this.emit(p, this.v, Math.min(0.4, (h ? h.distance : RANGE) / JET_SPEED), 0.82, 0.94, 1);
      }
    }
    this.hitDistance = nearest;
    this.jetOn = 1;
    this.placeJet(tipW, nz, nearest);
    return { hit: anyHit, rustLeft };
  }

  /** يوجّه مخروط النفّاثة من الفوهة إلى نقطة الإصابة ويضبط عرضه حسب الرأس. */
  private placeJet(tipW: THREE.Vector3, nz: Nozzle, dist: number) {
    const dir = this.v.subVectors(this.jetEnd, tipW);
    const len = Math.max(0.05, dir.length());
    this.jet.position.copy(tipW);
    this.jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const fan = nz.id !== 'narrow';
    const r0 = fan ? 0.012 : 0.006;
    const r1 = fan ? Math.max(0.05, dist * nz.cone * 0.9) : 0.03;
    const pos = this.jet.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array, base = this.jetBase;
    for (let i = 0; i < arr.length; i += 3) {
      const t = base[i + 1]; // 0 عند الفوهة، 1 عند الهدف
      const r = r0 + (r1 - r0) * t;
      arr[i] = base[i] * r;
      arr[i + 1] = t * len;
      // الرأس العريض يعطي مروحة مسطّحة
      arr[i + 2] = base[i + 2] * (nz.id === 'wide' ? r * 0.25 : r);
      if (nz.id === 'turbo') { const a = t * 30 + performance.now() * 0.02; arr[i] += Math.sin(a) * r * 0.3; }
    }
    pos.needsUpdate = true;
    this.jet.geometry.computeBoundingSphere();
    (this.jetMat.map as THREE.Texture).repeat.set(1, Math.max(1, len / 1.5));
  }

  update(dt: number, spraying: boolean, time = 0) {
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

    // النفّاثة: تظهر أثناء الرش وتختفي بسرعة بعده، وخطوطها تجري نحو الهدف
    if (!spraying) this.jetOn = Math.max(0, this.jetOn - dt * 10);
    this.jetMat.opacity = this.jetOn * (this.nozzle.id === 'narrow' ? 0.85 : 0.55);
    this.jetMat.color.set(this.soap ? 0xffffff : 0xcfeeff);
    this.jet.visible = this.jetOn > 0.01;
    (this.jetMat.map as THREE.Texture).offset.y -= dt * 9;
    this.gun.update(dt, spraying, time);
  }
}
