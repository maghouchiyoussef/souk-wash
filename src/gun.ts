import * as THREE from 'three';

// «المِرشّ النحاسي»: رشّاش بتصميم خاص بنا — نحاس مغربي، مقبض أخضر، شريط زليج،
// خزّان زجاجي يضيء بالماء المضغوط، ومقياس ضغط بإبرة تتحرّك أثناء الرش.
// يُرسم في مشهد منفصل فوق اللعبة، فلا يدخل في السيارة ولا في الجدران.

function zelligeTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0f5d5a'; g.fillRect(0, 0, 256, 64);
  const star = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * i) / 8, rr = i % 2 ? r * 0.55 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  };
  for (let x = 16; x < 256; x += 32) { star(x, 32, 14, '#f2ead3'); star(x, 32, 7, '#c9962e'); }
  g.fillStyle = '#c9962e'; g.fillRect(0, 0, 256, 5); g.fillRect(0, 59, 256, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function gaugeTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6f1e4'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.lineWidth = 12;
  const arc = (a0: number, a1: number, col: string) => { g.strokeStyle = col; g.beginPath(); g.arc(64, 64, 46, a0, a1); g.stroke(); };
  arc(Math.PI * 0.75, Math.PI * 1.35, '#2fa84f');
  arc(Math.PI * 1.35, Math.PI * 1.85, '#f2b01e');
  arc(Math.PI * 1.85, Math.PI * 2.25, '#d23a2a');
  g.fillStyle = '#222'; g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WaterGun {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly group = new THREE.Group();
  readonly tip = new THREE.Object3D();
  private needle = new THREE.Group();
  private water: THREE.MeshStandardMaterial;
  private narrowHead = new THREE.Group();
  private wideHead = new THREE.Group();
  private heads = new THREE.Group();
  private pressure = 0;
  private kick = 0;
  private spin = 0;
  private targetSpin = 0;

  constructor(fov: number) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 5);
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x40505a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);

    const brass = new THREE.MeshStandardMaterial({ color: 0xd2a03a, roughness: 0.28, metalness: 0.95 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.15, metalness: 1 });
    const teal = new THREE.MeshStandardMaterial({ color: 0x0f5d5a, roughness: 0.55, metalness: 0.1 });
    const zellige = new THREE.MeshStandardMaterial({ map: zelligeTex(), roughness: 0.35, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32 });
    this.water = new THREE.MeshStandardMaterial({ color: 0x2fb7ff, emissive: 0x1aa6ff, emissiveIntensity: 0.4, roughness: 0.1 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.85 });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], parent: THREE.Object3D = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos); m.rotation.set(...rot);
      parent.add(m);
      return m;
    };
    const alongZ: [number, number, number] = [Math.PI / 2, 0, 0];

    // الجسم: أسطوانة بشريط زليج وحلقات نحاسية
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.17, 28), zellige, [0, 0, 0], alongZ);
    for (const z of [-0.09, 0.09]) add(new THREE.CylinderGeometry(0.038, 0.038, 0.018, 28), brass, [0, 0, z], alongZ);
    add(new THREE.SphereGeometry(0.036, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), brass, [0, 0, 0.1], [Math.PI / 2, 0, 0]);
    // المقبض والزناد
    add(new THREE.CapsuleGeometry(0.021, 0.085, 6, 16), teal, [0, -0.075, 0.055], [0.32, 0, 0]);
    for (const y of [-0.05, -0.08, -0.11]) add(new THREE.TorusGeometry(0.022, 0.003, 6, 20), brass, [0, y, 0.055 + (y + 0.075) * -0.33], [Math.PI / 2 + 0.32, 0, 0]);
    add(new THREE.TorusGeometry(0.018, 0.005, 8, 16, Math.PI), brass, [0, -0.036, -0.005], [0, Math.PI / 2, Math.PI]);
    // خزّان زجاجي فيه ماء مضيء
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 18), this.water, [0, 0.052, -0.005], alongZ);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.11, 20), glass, [0, 0.052, -0.005], alongZ);
    for (const z of [-0.062, 0.052]) add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 20), brass, [0, 0.052, z], alongZ);
    // مقياس الضغط بإبرة
    const gauge = new THREE.Group();
    gauge.position.set(0.0, 0.058, 0.08);
    gauge.rotation.set(-0.35, 0, 0);
    this.group.add(gauge);
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 24), brass, [0, 0, 0], [Math.PI / 2, 0, 0], gauge);
    add(new THREE.CircleGeometry(0.022, 24), new THREE.MeshBasicMaterial({ map: gaugeTex() }), [0, 0, 0.0065], [0, 0, 0], gauge);
    this.needle.position.set(0, 0, 0.008);
    add(new THREE.BoxGeometry(0.003, 0.018, 0.002), new THREE.MeshBasicMaterial({ color: 0xc0181c }), [0, 0.008, 0], [0, 0, 0], this.needle);
    gauge.add(this.needle);
    // الأنبوب الكروم بحلقات نحاسية
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.42, 14), chrome, [0, 0, -0.3], alongZ);
    for (const z of [-0.12, -0.36]) add(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 16), brass, [0, 0, z], alongZ);
    // رأسا الرش: الضيّق (مخروط) والعريض (مروحة مسطّحة)
    this.heads.position.set(0, 0, -0.52);
    this.group.add(this.heads);
    const cone = new THREE.LatheGeometry([new THREE.Vector2(0.016, 0), new THREE.Vector2(0.018, 0.012), new THREE.Vector2(0.012, 0.04), new THREE.Vector2(0.004, 0.05)], 20);
    add(cone, brass, [0, 0, 0], [-Math.PI / 2, 0, 0], this.narrowHead);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16), brass, [0, 0, 0.005], alongZ, this.wideHead);
    add(new THREE.BoxGeometry(0.06, 0.012, 0.04), brass, [0, 0, -0.025], [0, 0, 0], this.wideHead);
    add(new THREE.BoxGeometry(0.05, 0.003, 0.004), rubber, [0, 0, -0.046], [0, 0, 0], this.wideHead);
    this.heads.add(this.narrowHead, this.wideHead);
    this.tip.position.set(0, 0, -0.58);
    this.group.add(this.tip);
    // خرطوم يخرج من أسفل المقبض
    const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.13, 0.08), new THREE.Vector3(0.02, -0.22, 0.12), new THREE.Vector3(0.08, -0.4, 0.1)]);
    add(new THREE.TubeGeometry(hose, 20, 0.009, 8), rubber, [0, 0, 0]);

    this.group.position.set(0.15, -0.19, -0.4);
    this.group.rotation.set(0.04, 0.13, 0);
    this.scene.add(this.group);
    this.setNozzle('wide');
  }

  setNozzle(id: 'wide' | 'narrow') {
    this.narrowHead.visible = id === 'narrow';
    this.wideHead.visible = id === 'wide';
    this.targetSpin += Math.PI; // دوران قصير عند تبديل الرأس
  }

  setAspect(aspect: number, fov: number) {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** موضع الفوهة في فضاء الكاميرا الرئيسية (لأن كاميرا الرشّاش في الأصل). */
  tipInCameraSpace(out: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    return this.tip.getWorldPosition(out);
  }

  update(dt: number, spraying: boolean, time: number) {
    this.pressure += ((spraying ? 1 : 0) - this.pressure) * Math.min(1, dt * (spraying ? 6 : 2.5));
    this.needle.rotation.z = 1.9 - this.pressure * 3.2 + (spraying ? Math.sin(time * 40) * 0.05 : 0);
    this.water.emissiveIntensity = 0.35 + this.pressure * (1.4 + Math.sin(time * 18) * 0.3);
    this.kick = spraying ? 1 : Math.max(0, this.kick - dt * 6);
    const j = this.kick * 0.005;
    this.spin += (this.targetSpin - this.spin) * Math.min(1, dt * 10);
    this.heads.rotation.z = this.spin;
    this.group.position.set(0.15 + (Math.random() - 0.5) * j, -0.19 + (Math.random() - 0.5) * j, -0.4 + this.kick * 0.012);
  }
}
