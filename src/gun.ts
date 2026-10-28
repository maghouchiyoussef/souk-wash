import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// رشّاش عصري بتصميم خاص بنا: جسم غرافيت مطفي بحواف مدوّرة، شريط LED سماوي،
// شاشة ضغط رقمية، لمسات برتقالية، وأنبوب ألومنيوم.
// الرشّاش يُوجَّه دائمًا نحو نقطة التصويب، فيخرج الماء على امتداد الأنبوب تمامًا.
// يُرسم في مشهد منفصل فوق اللعبة، فلا يدخل في السيارة ولا في الجدران.

const BARS = 10;

export class WaterGun {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly group = new THREE.Group();
  readonly tip = new THREE.Object3D();
  private led: THREE.MeshStandardMaterial;
  private screen: CanvasRenderingContext2D;
  private screenTex: THREE.CanvasTexture;
  private shownLevel = -1;
  private narrowHead = new THREE.Group();
  private wideHead = new THREE.Group();
  private heads = new THREE.Group();
  private pressure = 0;
  private kick = 0;
  private spin = 0;
  private turbo = false;
  private targetSpin = 0;
  private aimDist = 5;
  private readonly base = new THREE.Vector3(0.13, -0.145, -0.33);
  private aimQ = new THREE.Quaternion();
  private tmp = new THREE.Vector3();

  constructor(fov: number) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 5);
    this.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x3a4048, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);

    const graphite = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.42, metalness: 0.35 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85, metalness: 0 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xbfc6cf, roughness: 0.22, metalness: 1 });
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x51575f, roughness: 0.3, metalness: 0.9 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.4, metalness: 0.1 });
    this.led = new THREE.MeshStandardMaterial({ color: 0x7fe9ff, emissive: 0x2fd6ff, emissiveIntensity: 0.6 });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], parent: THREE.Object3D = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos); m.rotation.set(...rot);
      parent.add(m);
      return m;
    };
    const alongZ: [number, number, number] = [Math.PI / 2, 0, 0];

    // الجسم والمقبض
    add(new RoundedBoxGeometry(0.068, 0.082, 0.21, 4, 0.022), graphite, [0, 0, 0]);
    add(new RoundedBoxGeometry(0.046, 0.125, 0.056, 4, 0.019), rubber, [0, -0.088, 0.062], [0.3, 0, 0]);
    add(new THREE.BoxGeometry(0.003, 0.09, 0.008), this.led, [0, -0.086, 0.035], [0.3, 0, 0]);
    add(new RoundedBoxGeometry(0.014, 0.046, 0.02, 3, 0.006), orange, [0, -0.058, 0.004], [0.22, 0, 0]);
    // شريط LED علوي وخطوط برتقالية جانبية
    add(new THREE.BoxGeometry(0.014, 0.004, 0.17), this.led, [0, 0.0415, -0.005]);
    for (const sx of [1, -1]) add(new THREE.BoxGeometry(0.002, 0.01, 0.13), orange, [sx * 0.0345, 0.012, -0.02]);
    // شاشة الضغط الرقمية في الخلف
    const c = document.createElement('canvas');
    c.width = 128; c.height = 48;
    this.screen = c.getContext('2d')!;
    this.screenTex = new THREE.CanvasTexture(c);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Group();
    scr.position.set(0, 0.03, 0.106);
    scr.rotation.set(-0.45, 0, 0);
    this.group.add(scr);
    add(new RoundedBoxGeometry(0.058, 0.03, 0.008, 2, 0.003), rubber, [0, 0, -0.003], [0, 0, 0], scr);
    add(new THREE.PlaneGeometry(0.05, 0.022), new THREE.MeshBasicMaterial({ map: this.screenTex }), [0, 0, 0.0015], [0, 0, 0], scr);
    this.drawScreen(0);
    // الأنبوب: طوق، ألومنيوم، مسكة مضلّعة، وصلة سريعة
    add(new THREE.CylinderGeometry(0.03, 0.026, 0.03, 24), gunmetal, [0, 0, -0.118], alongZ);
    add(new THREE.CylinderGeometry(0.0105, 0.0105, 0.39, 16), alu, [0, 0, -0.32], alongZ);
    add(new THREE.CylinderGeometry(0.017, 0.017, 0.09, 18), rubber, [0, 0, -0.24], alongZ);
    for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.0185, 0.0185, 0.004, 18), gunmetal, [0, 0, -0.205 - i * 0.018], alongZ);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.028, 18), gunmetal, [0, 0, -0.51], alongZ);
    add(new THREE.CylinderGeometry(0.0165, 0.0165, 0.004, 18), orange, [0, 0, -0.5], alongZ);
    // رأسا الرش: ضيّق (مخروط بطرف برتقالي) وعريض (مروحة مسطّحة بطرف أبيض)
    this.heads.position.set(0, 0, -0.525);
    this.group.add(this.heads);
    const cone = new THREE.LatheGeometry([new THREE.Vector2(0.014, 0), new THREE.Vector2(0.012, 0.03), new THREE.Vector2(0.006, 0.05), new THREE.Vector2(0.003, 0.055)], 20);
    add(cone, gunmetal, [0, 0, 0], [-Math.PI / 2, 0, 0], this.narrowHead);
    add(new THREE.CylinderGeometry(0.0062, 0.0062, 0.008, 12), orange, [0, 0, -0.047], alongZ, this.narrowHead);
    add(new RoundedBoxGeometry(0.05, 0.014, 0.045, 2, 0.005), gunmetal, [0, 0, -0.022], [0, 0, 0], this.wideHead);
    add(new THREE.BoxGeometry(0.044, 0.006, 0.006), new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.4 }), [0, 0, -0.046], [0, 0, 0], this.wideHead);
    this.heads.add(this.narrowHead, this.wideHead);
    this.tip.position.set(0, 0, -0.585);
    this.group.add(this.tip);
    // الخرطوم
    const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.14, 0.085), new THREE.Vector3(0.02, -0.23, 0.12), new THREE.Vector3(0.08, -0.42, 0.1)]);
    add(new THREE.TubeGeometry(hose, 20, 0.009, 8), rubber, [0, 0, 0]);

    this.group.position.copy(this.base);
    this.scene.add(this.group);
    this.setNozzle('wide');
  }

  private drawScreen(level: number) {
    const g = this.screen;
    g.fillStyle = '#071318'; g.fillRect(0, 0, 128, 48);
    for (let i = 0; i < BARS; i++) {
      const on = i < level;
      const col = i < 6 ? '#2fd6ff' : i < 8 ? '#ffb020' : '#ff4630';
      g.fillStyle = on ? col : 'rgba(255,255,255,0.08)';
      g.fillRect(8 + i * 11.2, 30 - i * 1.6, 8, 12 + i * 1.6);
    }
    g.fillStyle = level ? '#e8fbff' : '#4c6670';
    g.font = '700 13px sans-serif';
    g.fillText(`${Math.round((level / BARS) * this.maxBar)} BAR`, 8, 16);
    this.screenTex.needsUpdate = true;
    this.shownLevel = level;
  }

  /** أقصى ضغط يظهر في الشاشة (يتغيّر مع ترقيات المضخّة) */
  maxBar = 150;

  setNozzle(id: 'wide' | 'narrow' | 'turbo') {
    this.narrowHead.visible = id !== 'wide';
    this.wideHead.visible = id === 'wide';
    this.turbo = id === 'turbo';
    this.targetSpin += Math.PI; // دوران قصير عند تبديل الرأس
  }

  setAspect(aspect: number, fov: number) {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** المسافة إلى نقطة التصويب: الرشّاش يتّجه نحوها فيخرج الماء موازيًا للأنبوب. */
  aimAt(distance: number) {
    this.aimDist = THREE.MathUtils.clamp(distance, 0.8, 9);
  }

  /** موضع الفوهة في فضاء الكاميرا الرئيسية (لأن كاميرا الرشّاش في الأصل). */
  tipInCameraSpace(out: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    return this.tip.getWorldPosition(out);
  }

  update(dt: number, spraying: boolean, time: number) {
    this.pressure += ((spraying ? 1 : 0) - this.pressure) * Math.min(1, dt * (spraying ? 6 : 2.5));
    const level = Math.round(this.pressure * BARS * (spraying ? 0.96 + Math.sin(time * 30) * 0.04 : 1));
    if (level !== this.shownLevel) this.drawScreen(level);
    this.led.emissiveIntensity = 0.5 + this.pressure * (1.6 + Math.sin(time * 16) * 0.3);

    // توجيه الأنبوب نحو نقطة التصويب (0,0,-d) في فضاء الكاميرا
    this.tmp.set(0, 0, -this.aimDist).sub(this.base).normalize();
    this.aimQ.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.tmp);
    this.group.quaternion.slerp(this.aimQ, Math.min(1, dt * 14));

    this.kick = spraying ? 1 : Math.max(0, this.kick - dt * 6);
    const j = this.kick * 0.004;
    this.spin += (this.targetSpin - this.spin) * Math.min(1, dt * 10);
    // رأس التوربو يدور باستمرار أثناء الرش
    if (this.turbo && spraying) this.targetSpin += dt * 40;
    this.heads.rotation.z = this.spin;
    this.group.position.set(this.base.x + (Math.random() - 0.5) * j, this.base.y + (Math.random() - 0.5) * j, this.base.z + this.kick * 0.012);
  }
}
