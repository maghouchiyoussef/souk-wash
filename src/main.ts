import * as THREE from 'three';
import { Player } from './player';
import { Input } from './input';
import { Sprayer, NOZZLES, Nozzle } from './spray';
import { initAudio, setSpray, ching, fanfare, click, coin, setMusic, setAudioEnabled } from './audio';
import { nativeReady, hapticLight, hapticSuccess, minimize } from './native';
import { t, applyLang, Key } from './i18n';
import { save, loadSave, persist, Lang } from './save';
import { ITEMS, has, buy, powerMul, maxBar, ItemId } from './shop';
import { LEVELS, LevelDef, starsFor, coinsFor } from './levels';
import { disposeTree, World } from './worlds/world';
import type { Model } from './vehicles/kit';

// Lavage Mobile — غسيل متنقّل: خمس مهمّات، متجر، دراهم ونجوم.

const $ = (id: string) => document.getElementById(id)!;

// ---------- المحرّك ----------
const canvas = $('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
const MAX_PR = Math.min(devicePixelRatio || 1, 2);
let pixelRatio = Math.min(MAX_PR, 1.5);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const player = new Player(innerWidth / innerHeight);
scene.add(player.camera);
const input = new Input($('touch'));

// ---------- المستوى الحالي ----------
let level: LevelDef = LEVELS[0];
let world: World;
let model: Model;
let sprayer: Sprayer;
let buildMs = 0;

function loadLevel(def: LevelDef) {
  if (model) { model.volume.tex.dispose(); disposeTree(model.root); }
  if (world) disposeTree(world.root);
  level = def;
  const t0 = performance.now();
  world = def.world(scene, renderer);
  model = def.vehicle();
  buildMs = Math.round(performance.now() - t0);
  scene.add(model.root);
  player.obstacles = [model.box];
  player.area = world.area;
  player.heights = [1.62, 0.95, 2.35, ...(def.extraHeights ?? [])];
  player.reset(world.spawn.x, world.spawn.z, world.spawn.yaw);
  if (!sprayer) {
    sprayer = new Sprayer(scene, player.camera, model.volume, world.solids);
  } else sprayer.setTargets(model.volume, world.solids);
  sprayer.gun.scene.environment = scene.environment;
  sprayer.gun.maxBar = maxBar();
  resize();
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  player.camera.aspect = innerWidth / innerHeight;
  player.camera.updateProjectionMatrix();
  sprayer?.gun.setAspect(player.camera.aspect, player.camera.fov);
  document.body.classList.toggle('portrait', innerHeight > innerWidth);
}
addEventListener('resize', resize);

// ---------- الحالة ----------
type State = 'menu' | 'play' | 'pause' | 'done';
let state: State = 'menu';
let nozzles: Nozzle[] = [];
let nozzle = 0;
let soap = false;
let scanTime = 0;
let playTime = 0;
let measureTimer = 0;
let rustAcc = 0, rustFrames = 0, hintCooldown = 0;
let clean = 0;

const pctEl = $('pct'), barEl = $('bar-fill'), timeEl = $('time'), nozzleEl = $('nozzle-label'), toastEl = $('toast');
const PAGES = ['title', 'map', 'shop', 'settings'];

function show(page: string | null) {
  for (const p of PAGES) $(p).classList.toggle('hidden', p !== page);
  updateCoins();
}

function updateCoins() {
  for (const id of ['coins-title', 'coins-map', 'coins-shop']) $(id).textContent = String(save.coins);
}

function updateNozzleUI() {
  const nz = nozzles[nozzle];
  nozzleEl.textContent = t(nz.id);
  sprayer.gun.setNozzle(nz.id);
  document.body.dataset.noz = nz.id;
  $('btn-soap').classList.toggle('on', soap);
}

let toastTimer = 0;
function toast(msg: string, secs = 2.2) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  toastTimer = secs;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const vibrate = (fn: () => void) => { if (save.settings.haptics) fn(); };

// ---------- الشاشات ----------
function renderMap() {
  const box = $('cards');
  box.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const unlocked = i === 0 || (save.stars[LEVELS[i - 1].id] ?? 0) > 0;
    const st = save.stars[lv.id] ?? 0;
    const c = document.createElement('button');
    c.className = 'card-l' + (unlocked ? '' : ' locked');
    c.innerHTML = `<div class="ic">${lv.icon}</div><div class="nm">${t(lv.id as Key)}</div><div class="pl">${t((lv.id + 'p') as Key)}</div>
      <div class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div>`;
    c.addEventListener('click', () => { click(); if (unlocked) startLevel(lv); else toast(t('locked')); });
    box.appendChild(c);
  });
}

function renderShop() {
  const box = $('items');
  box.innerHTML = '';
  for (const it of ITEMS) {
    const owned = has(it.id);
    const locked = !!it.requires && !has(it.requires);
    const d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = `<div class="ic">${it.icon}</div><div class="nm">${t(('i_' + it.id) as Key)}</div><div class="ds">${t(('i_' + it.id + 'd') as Key)}</div>`;
    const b = document.createElement('button');
    b.disabled = owned || locked;
    b.textContent = owned ? `✓ ${t('owned')}` : locked ? `🔒 ${t('locked')}` : `${t('buy')} · ${it.price} ${t('dh')}`;
    b.addEventListener('click', () => {
      const r = buy(it.id as ItemId);
      if (r === 'ok') { coin(); vibrate(hapticSuccess); toast(t('bought')); renderShop(); updateCoins(); }
      else if (r === 'money') { click(); toast(t('notEnough')); }
    });
    d.appendChild(b);
    box.appendChild(d);
  }
}

function renderSettings() {
  const s = save.settings;
  $('set-sound').classList.toggle('on', s.sound);
  $('set-music').classList.toggle('on', s.music);
  $('set-haptics').classList.toggle('on', s.haptics);
  ($('set-sens') as HTMLInputElement).value = String(s.sens);
  document.querySelectorAll<HTMLElement>('#set-lang button').forEach((b) => b.classList.toggle('on', b.dataset.l === s.lang));
}

function applySettings() {
  setAudioEnabled(save.settings.sound);
  setMusic(save.settings.music);
  player.sens = save.settings.sens;
  persist();
}

// ---------- اللعب ----------
function startLevel(def: LevelDef) {
  initAudio();
  if (def !== level || state === 'done' || clean > 0) loadLevel(def);
  nozzles = NOZZLES.filter((n) => n.id !== 'turbo' || has('turbo'));
  nozzle = 0; soap = false;
  $('btn-soap').classList.toggle('hidden', !has('soap'));
  updateNozzleUI();
  playTime = 0; clean = 0; scanTime = 0;
  state = 'play';
  show(null);
  $('hud').classList.remove('hidden');
  $('done').classList.add('hidden');
  $('pause').classList.add('hidden');
  measure();
}

function backToMap() {
  state = 'menu';
  setSpray(0, false, false);
  $('hud').classList.add('hidden');
  $('done').classList.add('hidden');
  $('pause').classList.add('hidden');
  renderMap();
  show('map');
}

const tmpBox = new THREE.Box3(), tmpC = new THREE.Vector3(), tmpS = new THREE.Vector3();
let pitch = 1;
function measure() {
  for (const part of model.volume.measure()) {
    tmpBox.setFromObject(part.mesh);
    sprayer.sparkle(tmpBox.getCenter(tmpC), tmpBox.getSize(tmpS));
    if (save.settings.sound) ching(pitch);
    pitch = pitch >= 1.5 ? 1 : pitch * 1.06;
    vibrate(hapticLight);
  }
  clean = model.volume.allDone ? 1 : Math.min(0.999, model.volume.overall());
  pctEl.textContent = `${Math.floor(clean * 100)}%`;
  barEl.style.width = `${clean * 100}%`;
  if (clean >= 1 && state === 'play') finish();
}

function finish() {
  state = 'done';
  setSpray(0, false, false);
  if (save.settings.sound) fanfare();
  vibrate(hapticSuccess);
  const stars = starsFor(level, playTime);
  const earned = coinsFor(level, stars);
  save.coins += earned;
  save.stars[level.id] = Math.max(save.stars[level.id] ?? 0, stars);
  save.best[level.id] = Math.min(save.best[level.id] ?? 1e9, Math.round(playTime));
  persist();
  $('done-time').textContent = fmt(playTime);
  $('done-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('done-coins').textContent = String(earned);
  const idx = LEVELS.indexOf(level);
  $('done-next').classList.toggle('hidden', idx >= LEVELS.length - 1);
  setTimeout(() => { $('done').classList.remove('hidden'); coin(); }, 900);
}

// ---------- الأزرار ----------
const on = (id: string, fn: () => void) => $(id).addEventListener('click', () => { initAudio(); click(); fn(); });
on('go-play', () => { renderMap(); show('map'); });
on('go-shop', () => { renderShop(); show('shop'); });
on('go-settings', () => { renderSettings(); show('settings'); });
document.querySelectorAll('.back').forEach((b) => b.addEventListener('click', () => { click(); show('title'); }));
on('btn-pause', () => { if (state !== 'play') return; state = 'pause'; setSpray(0, false, false); $('pause').classList.remove('hidden'); });
on('resume', () => { state = 'play'; $('pause').classList.add('hidden'); });
on('quit', backToMap);
on('done-next', () => startLevel(LEVELS[LEVELS.indexOf(level) + 1]));
on('done-again', () => { loadLevel(level); startLevel(level); });
on('done-map', backToMap);
on('set-sound', () => { save.settings.sound = !save.settings.sound; renderSettings(); applySettings(); });
on('set-music', () => { save.settings.music = !save.settings.music; renderSettings(); applySettings(); });
on('set-haptics', () => { save.settings.haptics = !save.settings.haptics; renderSettings(); applySettings(); });
$('set-sens').addEventListener('input', (e) => { save.settings.sens = Number((e.target as HTMLInputElement).value); applySettings(); });
document.querySelectorAll<HTMLElement>('#set-lang button').forEach((b) => b.addEventListener('click', () => {
  click(); save.settings.lang = b.dataset.l as Lang; applyLang(); renderSettings(); persist();
}));
$('btn-soap').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (state !== 'play') return;
  soap = !soap; click(); updateNozzleUI();
  if (soap) toast(t('soapHint'));
});

input.onFirstTouch = () => { initAudio(); if (save.settings.music) setMusic(true); };
input.onNozzle = () => {
  if (state !== 'play') return;
  nozzle = (nozzle + 1) % nozzles.length;
  updateNozzleUI(); click(); vibrate(hapticLight);
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

nativeReady(() => {
  if (state === 'play') { state = 'pause'; $('pause').classList.remove('hidden'); }
  else if (!$('title').classList.contains('hidden')) minimize();
  else if (state === 'menu') show('title');
  else backToMap();
});

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
  $('fps').textContent = `${Math.round(fps)} fps · ${pixelRatio.toFixed(2)}x`;
}

// ---------- الحلقة ----------
const clock = new THREE.Timer();
let time = 0;
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 1 / 20);
  time += dt;
  const spraying = input.spraying && state === 'play';

  if (state === 'play') {
    playTime += dt;
    timeEl.textContent = fmt(playTime);
    player.update(dt, input.moveVector(), input.consumeLook());
    if (spraying) {
      const nz = nozzles[nozzle];
      const r = sprayer.spray(dt, player.camera, nz, powerMul(), soap);
      if (save.settings.sound) setSpray(1, nz.id === 'narrow', sprayer.hitDistance < 6);
      rustAcc += r.rustLeft; rustFrames++;
    } else setSpray(0, false, false);
    measureTimer += dt;
    if (measureTimer > 0.35) {
      measureTimer = 0;
      measure();
      hintCooldown -= 0.35;
      if (rustFrames > 0 && rustAcc / rustFrames > 0.3 && nozzles[nozzle].id === 'wide' && !soap && hintCooldown <= 0) { toast(t('rustHint'), 2.8); hintCooldown = 8; }
      rustAcc = 0; rustFrames = 0;
    }
  } else {
    input.consumeLook();
    if (state === 'menu') {
      // دوران بطيء حول المركبة خلف القوائم
      player.yaw = time * 0.12;
      player.pos.set(Math.sin(player.yaw) * world.orbit, 0, Math.cos(player.yaw) * world.orbit);
      player.update(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    }
  }

  if (scanTime > 0) { scanTime -= dt; if (scanTime <= 0) $('btn-scan').classList.remove('on'); }
  const scan = scanTime > 0 ? Math.min(1, scanTime * 2, (2.6 - scanTime) * 6) : 0;
  model.volume.tick(dt, time, scan);
  model.volume.upload();
  sprayer.update(dt, spraying, time);
  sprayer.gun.group.visible = state !== 'menu';

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('on'); }
  adaptQuality(dt);
  renderer.clear();
  renderer.render(scene, player.camera);
  if (state !== 'menu') {
    renderer.clearDepth();
    renderer.render(sprayer.gun.scene, sprayer.gun.camera);
  }
  requestAnimationFrame(frame);
}

// ---------- البداية ----------
(async () => {
  await loadSave();
  applyLang();
  player.sens = save.settings.sens;
  setAudioEnabled(save.settings.sound);
  // خلف شاشة البداية: آخر مستوى مفتوح
  let lastOpen = LEVELS[0];
  LEVELS.forEach((l, i) => { if (i > 0 && (save.stars[LEVELS[i - 1].id] ?? 0) > 0) lastOpen = l; });
  loadLevel(lastOpen);
  show('title');
  requestAnimationFrame(frame);
  (window as any).__game = {
    get buildMs() { return buildMs; }, get volume() { return model.volume; }, player, input, save,
    get clean() { return clean; }, startLevel: (i: number) => startLevel(LEVELS[i]),
  };
})();
