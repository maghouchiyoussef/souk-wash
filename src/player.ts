import * as THREE from 'three';

// اللاعب: كاميرا بمنظور الشخص الأول مع تصادم بسيط حول السيارة.

const RADIUS = 0.35;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0; pitch = -0.12;
  pos = new THREE.Vector3(0, 0, 4.6);
  private hIndex = 0;
  /** مستويات النظر: واقف، منحني، فوق سلّم (والمركبات الكبيرة لها سلّم أعلى) */
  heights = [1.62, 0.95, 2.35];
  private eye = 1.62;
  sens = 1;
  obstacles: THREE.Box3[] = [];
  area = { minX: -7, maxX: 7, minZ: -6, maxZ: 6 };

  reset(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.yaw = yaw; this.pitch = -0.12;
    this.hIndex = 0; this.eye = this.heights[0];
  }

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.05, 60);
    this.camera.rotation.order = 'YXZ';
  }

  cycleHeight() {
    this.hIndex = (this.hIndex + 1) % this.heights.length;
    return this.hIndex;
  }

  update(dt: number, move: { x: number; y: number }, look: { x: number; y: number }) {
    const sens = 0.0052 * (70 / this.camera.fov) * this.sens;
    this.yaw -= look.x * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * sens, -1.35, 1.2);

    const speed = this.hIndex === 1 ? 1.8 : 3.0;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.pos.x += (fx * move.y + rx * move.x) * speed * dt;
    this.pos.z += (fz * move.y + rz * move.x) * speed * dt;

    for (const b of this.obstacles) {
      const minX = b.min.x - RADIUS, maxX = b.max.x + RADIUS, minZ = b.min.z - RADIUS, maxZ = b.max.z + RADIUS;
      if (this.pos.x > minX && this.pos.x < maxX && this.pos.z > minZ && this.pos.z < maxZ) {
        const pens = [this.pos.x - minX, maxX - this.pos.x, this.pos.z - minZ, maxZ - this.pos.z];
        const m = Math.min(...pens);
        if (m === pens[0]) this.pos.x = minX; else if (m === pens[1]) this.pos.x = maxX;
        else if (m === pens[2]) this.pos.z = minZ; else this.pos.z = maxZ;
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, this.area.minX, this.area.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, this.area.minZ, this.area.maxZ);

    this.eye += (this.heights[this.hIndex] - this.eye) * Math.min(1, dt * 8);
    this.camera.position.set(this.pos.x, this.eye, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
