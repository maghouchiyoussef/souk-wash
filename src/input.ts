// التحكّم: جويستيك يسار للمشي، سحب يمين للنظر، وأزرار. يدعم عدّة أصابع.
// على الحاسوب (للتجربة): WASD + سحب بالفأرة + المسافة للرش.

export class Input {
  move = { x: 0, y: 0 };       // -1..1 (y موجب = إلى الأمام)
  lookDX = 0; lookDY = 0;      // بكسلات منذ آخر إطار
  spraying = false;
  onNozzle?: () => void;
  onScan?: () => void;
  onHeight?: () => void;
  onFirstTouch?: () => void;

  private joyId = -1; private joyX = 0; private joyY = 0;
  private lookIds = new Map<number, { x: number; y: number }>();
  private keys = new Set<string>();
  private joyBase: HTMLElement; private joyKnob: HTMLElement;
  private readonly R = 56;

  constructor(layer: HTMLElement) {
    this.joyBase = document.getElementById('joy')!;
    this.joyKnob = document.getElementById('joy-knob')!;

    layer.addEventListener('pointerdown', (e) => {
      this.onFirstTouch?.();
      layer.setPointerCapture(e.pointerId);
      if (e.clientX < innerWidth * 0.42 && this.joyId < 0) {
        this.joyId = e.pointerId; this.joyX = e.clientX; this.joyY = e.clientY;
        this.joyBase.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        this.joyBase.classList.add('on');
        this.setKnob(0, 0);
      } else {
        this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) {
        let dx = e.clientX - this.joyX, dy = e.clientY - this.joyY;
        const l = Math.hypot(dx, dy);
        if (l > this.R) { dx *= this.R / l; dy *= this.R / l; }
        this.move.x = dx / this.R; this.move.y = -dy / this.R;
        this.setKnob(dx, dy);
      } else this.trackLook(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.joyId) {
        this.joyId = -1; this.move.x = 0; this.move.y = 0;
        this.joyBase.classList.remove('on');
      }
      this.lookIds.delete(e.pointerId);
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);

    // زر الرش: الضغط المطوّل يرش، وتحريك نفس الإصبع يحرّك الكاميرا أيضًا.
    const spray = document.getElementById('btn-spray')!;
    spray.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); this.onFirstTouch?.();
      spray.setPointerCapture(e.pointerId);
      this.spraying = true; spray.classList.add('on');
      this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    spray.addEventListener('pointermove', (e) => this.trackLook(e, 0.8));
    const sprayEnd = (e: PointerEvent) => { this.spraying = false; spray.classList.remove('on'); this.lookIds.delete(e.pointerId); };
    spray.addEventListener('pointerup', sprayEnd);
    spray.addEventListener('pointercancel', sprayEnd);

    this.tap('btn-nozzle', () => this.onNozzle?.());
    this.tap('btn-scan', () => this.onScan?.());
    this.tap('btn-height', () => this.onHeight?.());

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') this.spraying = true;
      if (e.code === 'KeyQ') this.onNozzle?.();
      if (e.code === 'KeyE') this.onScan?.();
      if (e.code === 'KeyC') this.onHeight?.();
      this.onFirstTouch?.();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Space') this.spraying = false; });
    addEventListener('blur', () => { this.keys.clear(); this.spraying = false; this.move.x = this.move.y = 0; });
  }

  private tap(id: string, fn: () => void) {
    const el = document.getElementById(id)!;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onFirstTouch?.(); fn(); });
  }

  private trackLook(e: PointerEvent, k = 1) {
    const p = this.lookIds.get(e.pointerId);
    if (!p) return;
    this.lookDX += (e.clientX - p.x) * k; this.lookDY += (e.clientY - p.y) * k;
    p.x = e.clientX; p.y = e.clientY;
  }

  private setKnob(dx: number, dy: number) {
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** يجمع اتجاه الحركة من الجويستيك ولوحة المفاتيح. */
  moveVector() {
    let x = this.move.x, y = this.move.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }
}
