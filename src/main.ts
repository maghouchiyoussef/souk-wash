import * as THREE from 'three';
import { buildWorld } from './world';
import { buildTaxi } from './taxi';
import { Player } from './player';
import { Input } from './input';
import { Sprayer, NOZZLES } from './spray';
import { initAudio, setSpray, ching, fanfare, click } from './audio';
import { nativeReady, hapticLight, hapticSuccess, minimize } from './native';
import { t } from './i18n';

// غسّال الحومة — النموذج الأولي (المستوى 1: الطاكسي).

const $ = (id: string) => document.getElementById(id)!;

// ---------- المشهد ----------
const canvas = $('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const MAX_PR = Math.min(devicePixelRatio || 1, 2);
let pixelRatio = Math.min(MAX_PR, 1.5);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const solids = buildWorld(scene, renderer);
const taxi = buildTaxi();
scene.add(taxi.root);
const surfaces = taxi.surfaces;
const totalArea = surfaces.reduce((s, x) => s + x.atlas.area, 0);

const player = new Player(innerWidth / innerHeight);
player.obstacles.push(taxi.box);
player.yaw = 0;
scene.add(player.camera);

const sprayer = new Sprayer(scene, player.camera, surfaces, solids);
const input = new Input($('touch'));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  player.camera.aspect = innerWidth / innerHeight;
  player.camera.updateProjectionMatrix();
  document.body.classList.toggle('portrait', innerHeight > innerWidth);
}
addEventListener('resize', resize);
resize();

// ---------- الحالة ----------
type State = 'start' | 'play' | 'done';
let state: State = 'start';
let nozzle = 0;
let scanTime = 0;
let playTime = 0;
let measureTimer = 0;
let rustAcc = 0, rustFrames = 0, rustHintCooldown = 0;
let clean = 0;

const pctEl = $('pct'), barEl = $('bar-fill'), timeEl = $('time'), nozzleEl = $('nozzle-label'), toastEl = $('toast');

function applyTexts() {
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t as any); });
}
applyTexts();

function updateNozzleUI() {
  const nz = NOZZLES[nozzle];
  nozzleEl.textContent = t(nz.id);
  $('btn-nozzle').dataset.kind = nz.id;
  document.body.dataset.noz = nz.id;
}
updateNozzleUI();

let toastTimer = 0;
function toast(msg: string, secs = 2.2) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  toastTimer = secs;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function start() {
  if (state !== 'start') return;
  initAudio();
  state = 'play';
  $('start').classList.add('hidden');
  $('hud').classList.remove('hidden');
}
input.onFirstTouch = () => { initAudio(); if (state === 'start') start(); };
$('start').addEventListener('pointerdown', start);

input.onNozzle = () => {
  if (state !== 'play') return;
  nozzle = (nozzle + 1) % NOZZLES.length;
  updateNozzleUI(); click(); hapticLight();
};
input.onScan = () => {
  if (state !== 'play' || scanTime > 0) return;
  scanTime = 2.6;
  $('btn-scan').classList.add('on');
  click();
};
input.onHeight = () => {
  if (state !== 'play') return;
  const h = player.cycleHeight();
  $('btn-height').dataset.level = String(h);
  click();
};

$('again').addEventListener('click', () => location.reload());

nativeReady(minimize);

// ---------- القياس ----------
const tmpBox = new THREE.Box3(), tmpC = new THREE.Vector3(), tmpS = new THREE.Vector3();
let pitch = 1;
function measure() {
  let sum = 0;
  for (const s of surfaces) {
    s.measure();
    if (s.checkDone()) {
      tmpBox.setFromObject(s.mesh);
      sprayer.sparkle(tmpBox.getCenter(tmpC), tmpBox.getSize(tmpS));
      ching(pitch);
      pitch = pitch >= 1.5 ? 1 : pitch * 1.06;
      hapticLight();
    }
    sum += s.clean * s.atlas.area;
  }
  clean = surfaces.every((s) => s.done) ? 1 : Math.min(0.999, sum / totalArea);
  const pct = Math.floor(clean * 100);
  pctEl.textContent = `${pct}%`;
  barEl.style.width = `${clean * 100}%`;
  if (clean >= 1 && state === 'play') finish();
}

function finish() {
  state = 'done';
  setSpray(0, false, false);
  fanfare();
  hapticSuccess();
  $('done-time').textContent = fmt(playTime);
  const stars = playTime < 240 ? 3 : playTime < 420 ? 2 : 1;
  $('done-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  setTimeout(() => $('done').classList.remove('hidden'), 900);
}

// ---------- ضبط الجودة التلقائي ----------
let fpsFrames = 0, fpsTime = 0, goodSecs = 0;
function adaptQuality(dt: number) {
  fpsFrames++; fpsTime += dt;
  if (fpsTime < 1) return;
  const fps = fpsFrames / fpsTime;
  fpsFrames = 0; fpsTime = 0;
  if (fps < 48 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); goodSecs = 0; renderer.setPixelRatio(pixelRatio); resize(); }
  else if (fps > 58) { if (++goodSecs >= 4 && pixelRatio < MAX_PR) { pixelRatio = Math.min(MAX_PR, pixelRatio + 0.1); goodSecs = 0; renderer.setPixelRatio(pixelRatio); resize(); } }
  else goodSecs = 0;
  ($('fps') as HTMLElement).textContent = `${Math.round(fps)} fps · ${pixelRatio.toFixed(2)}x`;
}

// ---------- الحلقة ----------
const clock = new THREE.Timer();
let time = 0;
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 1 / 20);
  time += dt;

  if (state === 'play') {
    playTime += dt;
    timeEl.textContent = fmt(playTime);
    player.update(dt, input.moveVector(), input.consumeLook());
    if (input.spraying) {
      const nz = NOZZLES[nozzle];
      const r = sprayer.spray(dt, player.camera, nz);
      setSpray(1, nz.id === 'narrow', sprayer.hitDistance < 6);
      rustAcc += r.rustLeft; rustFrames++;
    } else {
      setSpray(0, false, false);
    }
    measureTimer += dt;
    if (measureTimer > 0.35) {
      measureTimer = 0;
      measure();
      rustHintCooldown -= 0.35;
      if (rustFrames > 0 && rustAcc / rustFrames > 0.3 && NOZZLES[nozzle].id === 'wide' && rustHintCooldown <= 0) { toast(t('rustHint'), 2.8); rustHintCooldown = 8; }
      rustAcc = 0; rustFrames = 0;
    }
  } else {
    input.consumeLook();
    if (state === 'start') {
      // دوران بطيء حول السيارة في شاشة البداية
      player.yaw = time * 0.15;
      player.pos.set(Math.sin(player.yaw) * 5.6, 0, Math.cos(player.yaw) * 5.6);
      player.update(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    }
  }

  if (scanTime > 0) { scanTime -= dt; if (scanTime <= 0) $('btn-scan').classList.remove('on'); }
  const scan = scanTime > 0 ? Math.min(1, scanTime * 2, (2.6 - scanTime) * 6) : 0;
  for (const s of surfaces) { s.tick(dt, time, scan); s.upload(); }
  sprayer.update(dt, input.spraying && state === 'play');

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('on'); }
  adaptQuality(dt);
  renderer.render(scene, player.camera);
  requestAnimationFrame(frame);
}

measure();
requestAnimationFrame(frame);
(window as any).__game = { surfaces, player, input, get clean() { return clean; } };
