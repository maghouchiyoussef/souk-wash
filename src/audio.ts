// كل الأصوات مولَّدة بالكود عبر Web Audio (بدون ملفات صوت).

let ctx: AudioContext | null = null;
let master: GainNode;
let sprayGain: GainNode, sprayFilter: BiquadFilterNode;
let enabled = true;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // ضجيج أبيض متكرّر لصوت الماء المضغوط
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  sprayFilter = ctx.createBiquadFilter();
  sprayFilter.type = 'bandpass'; sprayFilter.frequency.value = 1800; sprayFilter.Q.value = 0.6;
  sprayGain = ctx.createGain(); sprayGain.gain.value = 0;
  src.connect(sprayFilter).connect(sprayGain).connect(master);
  src.start();
}

export function setAudioEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? 0.9 : 0;
}

/** شدّة صوت الرش: 0 = متوقّف. hit = هل الماء يضرب سطحًا قريبًا */
export function setSpray(level: number, narrow: boolean, hit: boolean) {
  if (!ctx) return;
  const t = ctx.currentTime;
  sprayGain.gain.setTargetAtTime(level * (hit ? 0.32 : 0.2), t, 0.04);
  sprayFilter.frequency.setTargetAtTime((narrow ? 2600 : 1500) * (hit ? 1 : 1.4), t, 0.05);
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  if (!ctx || !enabled) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
  o.connect(g).connect(master);
  o.start(start); o.stop(start + dur + 0.05);
}

/** «تشينغ» عند لمعان جزء نظيف */
export function ching(pitch = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(1567 * pitch, t, 0.7, 0.18);
  tone(2349 * pitch, t + 0.05, 0.6, 0.12);
  tone(3136 * pitch, t + 0.1, 0.5, 0.07, 'triangle');
}

/** لحن قصير عند اكتمال المستوى (سلّم الحجاز) */
export function fanfare() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [293.7, 311.1, 370, 392, 440, 587.3].forEach((f, i) => {
    tone(f, t + i * 0.11, 0.5, 0.16, 'triangle');
    tone(f * 2, t + i * 0.11, 0.3, 0.05);
  });
}

export function click() {
  if (!ctx) return;
  tone(880, ctx.currentTime, 0.08, 0.08, 'square');
}
