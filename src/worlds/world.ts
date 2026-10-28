import * as THREE from 'three';

// واجهة مشتركة لكل الأماكن (الگراج، الزنقة، المدرسة...).

export interface World {
  root: THREE.Group;
  /** أسطح يرتدّ عنها الماء (أرض، جدران) */
  solids: THREE.Object3D[];
  /** حدود مشي اللاعب */
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; z: number; yaw: number };
  /** نصف قطر دوران الكاميرا في شاشة البداية */
  orbit: number;
  /** عوائق لا يمشي اللاعب داخلها (مضخّات، أعمدة...) */
  obstacles?: THREE.Box3[];
}

/** يحرّر الذاكرة (أشكال، مواد، صور) عند مغادرة المستوى. */
export function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      mat.dispose();
    }
  });
  obj.removeFromParent();
}
