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

/** الأصوات (الماء، الأزرار...). الموسيقى لها مفتاحها الخاص. */
export function setAudioEnabled(on: boolean) {
  enabled = on;
  if (sprayGain && !on) sprayGain.gain.value = 0;
}

/** شدّة صوت الرش: 0 = متوقّف. hit = هل الماء يضرب سطحًا قريبًا */
export function setSpray(level: number, narrow: boolean, hit: boolean) {
  if (!ctx || !enabled) return;
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

// ---------- الموسيقى: إيقاع «مقسوم» على الدربوكة ولحن نقري بسلّم الحجاز ----------
let musicGain: GainNode | null = null;
let musicOn = false;
let musicTimer: ReturnType<typeof setInterval> | undefined;
let nextBeat = 0, step = 0;
const BPM = 96;
// د ت _ ت د _ ت _  (D = دوم، T = تك)
const RHYTHM = ['D', 'T', '', 'T', 'D', '', 'T', ''];
const HIJAZ = [293.7, 311.1, 370, 392, 440, 466.2, 523.3, 587.3];
const MELODY = [0, 2, 3, 4, 3, 2, 1, 0, 4, 5, 4, 3, 2, 3, 1, 0, 0, 2, 4, 7, 6, 4, 3, 2, 4, 3, 2, 1, 2, 1, 0, -1];

function noiseBuffer() {
  const b = ctx!.createBuffer(1, ctx!.sampleRate * 0.2, ctx!.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  return b;
}
let nb: AudioBuffer | null = null;

function doum(t: number) {
  const o = ctx!.createOscillator(), g = ctx!.createGain();
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g).connect(musicGain!); o.start(t); o.stop(t + 0.4);
}
function tek(t: number, vol = 0.35) {
  const s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
  s.buffer = nb!; f.type = 'highpass'; f.frequency.value = 2500;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(musicGain!); s.start(t);
}
/** وتر منقور (Karplus-Strong مبسّط بمرشّح) */
function pluck(freq: number, t: number, vol = 0.22) {
  const o = ctx!.createOscillator(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
  o.type = 'sawtooth'; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.3);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  o.connect(f).connect(g).connect(musicGain!); o.start(t); o.stop(t + 0.75);
}

function schedule() {
  if (!ctx || !musicGain) return;
  const spb = 60 / BPM / 2; // ثُمن
  while (nextBeat < ctx.currentTime + 0.35) {
    const r = RHYTHM[step % RHYTHM.length];
    if (r === 'D') doum(nextBeat);
    if (r === 'T') tek(nextBeat);
    if (step % 2 === 1) tek(nextBeat, 0.08);
    const n = MELODY[Math.floor(step / 2) % MELODY.length];
    if (step % 2 === 0 && n >= 0) pluck(HIJAZ[n], nextBeat);
    if (step % 16 === 0) pluck(HIJAZ[0] / 2, nextBeat, 0.18);
    nextBeat += spb;
    step++;
  }
}

export function setMusic(on: boolean) {
  musicOn = on;
  if (!ctx) return;
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
    nb = noiseBuffer();
  }
  musicGain.gain.setTargetAtTime(on ? 0.13 : 0, ctx.currentTime, 0.3);
  if (on && !musicTimer) { nextBeat = ctx.currentTime + 0.1; musicTimer = setInterval(schedule, 120); }
  if (!on && musicTimer) { setTimeout(() => { if (!musicOn) { clearInterval(musicTimer); musicTimer = undefined; } }, 1200); }
}

/** صوت الشراء / الدراهم */
export function coin() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(988, t, 0.12, 0.12, 'square');
  tone(1319, t + 0.07, 0.3, 0.12, 'square');
}
