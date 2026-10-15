// タイトル画面: 読み込み → タイトル(タップしてはじめる)→ メニュー → 競技えらび → 競技の入口 → 競技。
//
// 3D は空に浮かぶ島(island.js)と木の看板(sign.js)。画面ごとに島の見え方を変える
// (縦長のメニューでは島を上へ、横長では左へずらして、メニューの場所をあける)。
// ブラウザの戻るボタンは無いものとして作る。どの画面にも「もどる」を置く。
//
// 競技も同じページで動く(ページを読みこみ直さない)。「スタート!」でカメラが島の大木へ飛びこみ、
// 葉っぱの幕(leaves.js)で画面がうまっているあいだに会場へ入れかえ、葉っぱが吹きとぶと会場の空から降りていく。
// 描画の器(renderer)と毎フレームの輪はここが持ち、競技の画面には frame() を呼んで描いてもらう。

import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../characters.js';
import { createModel, preload } from '../runtime/models.js';
import { createAtmosphere } from '../games/daruma/atmosphere.js';
import { loadSettings, saveSettings } from '../settings.js';
import { ROLES, buildIsland, islandHeight } from './island.js';
import { buildSign, drawSign } from './sign.js';
import { woodPlank } from './wood.js';
import { createLeafCurtain } from './leaves.js';
import { makePortraits } from './portraits.js';
import { createZukan } from './zukan.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const settings = loadSettings();

// 木の板の絵を、メニューのボタンの背景にする
document.documentElement.style.setProperty('--wood', `url(${woodPlank(640, 140, { seed: 3 })})`);
// 図鑑の表紙(色の濃い板)
document.documentElement.style.setProperty('--wood-cover', `url(${woodPlank(720, 480, { seed: 9, radius: 0.04, tone: ['#b9804a', '#a56d3c', '#8f5c30'] })})`);

// ── 音 ─────────────────────────────────────────────
let audio = null;
function unlockAudio() {
  if (audio || !settings.sound) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    audio = null;
  }
}
function tone(freq, start, len, type = 'triangle', gain = 0.12) {
  if (!audio || !settings.sound) return;
  const t = audio.currentTime + start;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}
// ジングル: ドミソド と、最後に鈴
function jingle() {
  [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.36]].forEach(([f, s]) => tone(f, s, 0.32, 'triangle', 0.13));
  [[1568, 0.36], [2093, 0.42], [2637, 0.48]].forEach(([f, s]) => tone(f, s, 0.5, 'sine', 0.05));
}
// 飛びこむときの「ヒュッ」: 雑音を高いほうへ流す
function whoosh(len = 0.9, up = true) {
  if (!audio || !settings.sound) return;
  const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  const t = audio.currentTime;
  f.frequency.setValueAtTime(up ? 300 : 2400, t);
  f.frequency.exponentialRampToValueAtTime(up ? 2400 : 300, t + len);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + len * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(audio.destination);
  src.start();
}
// 木の板を押したときの「コッ」
function knock() {
  tone(420, 0, 0.08, 'square', 0.04);
  tone(260, 0.01, 0.1, 'sine', 0.08);
}
function boop() {
  tone(330, 0, 0.12, 'sine', 0.08);
  tone(247, 0.1, 0.16, 'sine', 0.08);
}

// ── 3D ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: $('cv'), antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);
scene.add(camera);
const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
atmosphere.sun.target.position.set(0, 0, 0);
atmosphere.apply(params.get('time') || 'day');
function applyQuality() {
  const light = settings.quality === 'light';
  renderer.setPixelRatio(Math.min(devicePixelRatio, light ? 1 : 2));
  // 影を切りかえたときだけ、素材を組み立てなおす(重いので、変わらないときはしない)
  if (renderer.shadowMap.enabled !== !light || applyQuality.light !== light) {
    renderer.shadowMap.enabled = !light;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
  applyQuality.light = light;
  resize();
}

const loadingText = $('loadingText');
loadingText.textContent = 'しまを つくっています…';
// 看板と表彰台に使う字を先に読みこむ(読みこむ前に描くと、ちがう字になる)
await Promise.all([
  document.fonts.load('46px "Dela Gothic One"', '123ドングリンピック'),
  document.fonts.load('800 54px "M PLUS Rounded 1c"', '森のなかまの どんぐり大会'),
]).catch(() => {});
const island = buildIsland(scene);

loadingText.textContent = 'なかまを よんでいます…';
await preload([...CHARACTERS.map((c) => c.key), 'hoho']);
const owl = await createModel('hoho');
owl.root.position.copy(island.perch);
owl.root.scale.multiplyScalar(island.oakScale / 0.8);
owl.root.rotation.y = Math.PI; // 体は幹のほう、首だけこっちを向く
owl.node('head').rotation.y = Math.PI;
owl.play('idle');
owl.setFace('normal');
scene.add(owl.root);

const actors = await Promise.all(ROLES.map(async (role, i) => {
  const m = await createModel(role.key);
  m.setPlayerColor(PLAYER_COLORS[i % PLAYER_COLORS.length].hex);
  m.setFace(role.face || 'normal');
  m.play(role.act === 'chase' ? 'run' : role.act);
  m.actions[role.act === 'chase' ? 'run' : role.act].time = i * 0.37; // みんなでそろわないように
  if (role.podium) m.root.position.copy(island.podiumTop);
  else m.root.position.set(role.x, islandHeight(role.x, role.z), role.z);
  scene.add(m.root);
  return { role, model: m, ang: role.lead ? 0.75 : 0 };
}));
atmosphere.setupShadows([island.group, owl.root, ...actors.map((a) => a.model.root)], [island.group]);

// 木の看板。カメラにくっつけて、画面の上からつるす
const sign = buildSign(drawSign());
camera.add(sign.pivot);
const signRest = new THREE.Vector3();
let signDrop = -1; // 落ちてきてからの時間(マイナスはまだ落ちていない)
let viewH = 1; // 看板の距離での画面の高さ
let signBottom = 0; // 看板の下ふち(画面の上からの px)。ここから下が島の段
// 上の切りかけ(ノッチ・ステータスバー)の高さ。CSS の env() は JS から直接読めないので、測る
const safeProbe = Object.assign(document.body.appendChild(document.createElement('div')), {
  style: 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top, 0px);visibility:hidden;pointer-events:none',
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 58 : 42;
  // 看板は画面の「上の段」。縦長は幅の 9 割(高さは画面の 24% まで)、横長は幅の 4 割まで。
  // 上ふちは、ノッチやステータスバーのすぐ下に来るように
  const portrait = camera.aspect < 1;
  const dist = 6;
  const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const w = h * camera.aspect;
  viewH = h;
  const board = sign.height - 0.9;
  const sc = Math.min((w * (portrait ? 0.9 : 0.42)) / sign.width, (h * (portrait ? 0.24 : 0.3)) / board);
  sign.pivot.scale.setScalar(sc);
  const topPx = safeProbe.offsetHeight + (portrait ? 10 : innerHeight * 0.05);
  signRest.set(0, h / 2 - (h * topPx) / innerHeight + 0.9 * sc, -dist);
  signBottom = topPx + ((board * sc) / h) * innerHeight;
}
addEventListener('resize', resize);
applyQuality();

// ── 画面の切りかえ ──────────────────────────────────
// view: 島をどれだけずらすか(画面の割合)。sign: 看板を出すか
// foot: 縦長のとき、島を「看板の下」と「この要素の上」のあいだに収める(下の段)
const SCREENS = {
  title: { el: null, view: [0, 0], sign: true, foot: 'tap', bias: 0.4 },
  menu: { el: $('menu'), view: [0.2, 0.17], sign: true, foot: 'menu', bias: 0.56 },
  games: { el: $('games'), view: [0.24, 0.17], sign: false },
  settings: { el: $('settings'), view: [0.24, 0.17], sign: false },
  // 競技の入口: 選んだキャラが島の上でよろこぶのが見えるように、島を上の段に出す
  play: { el: $('play'), view: [0.24, 0], sign: false, foot: 'play', bias: 0.5 },
  // 大木へ飛びこんでいるところ / 競技の会場にいるあいだ
  dive: { el: null, view: [0, 0], sign: false },
  // キャラ図鑑(本は島の前でひらく。島はうしろでそのまま)
  zukan: { el: null, view: [0, 0], sign: false },
};
let screen = 'loading';
const view = { x: 0, y: 0, sign: 1, r: 1 };
// 島がふつうの大きさで収まる段の高さ(画面の割合)。
// 島の見た目の中心を段のどのあたりに置くかは、画面ごとの bias(タイトルは島全体、メニューは下の岩を板にかくす)
const ISLAND_FILL = 0.3;

function go(next) {
  for (const [key, s] of Object.entries(SCREENS)) {
    if (!s.el) continue;
    if (key === next) {
      s.el.hidden = false;
      s.el.classList.add('enter');
      requestAnimationFrame(() => requestAnimationFrame(() => s.el.classList.remove('enter')));
    } else {
      s.el.hidden = true;
    }
  }
  $('tap').hidden = next !== 'title';
  $('ver').hidden = next !== 'title';
  screen = next;
  if (next === 'play') renderChars();
  if (next === 'zukan') {
    ensureFaces();
    zukan.open();
  }
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1400);
}

// タイトル: どこを押してもメニューへ
addEventListener('pointerdown', () => {
  if (screen !== 'title') return;
  unlockAudio();
  jingle();
  go('menu');
});
addEventListener('keydown', (e) => {
  if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    unlockAudio();
    jingle();
    go('menu');
  } else if (e.code === 'Escape' && (screen === 'games' || screen === 'settings')) {
    go('menu');
  } else if (screen === 'zukan') {
    // 図鑑のキーは図鑑が見る
  } else if (e.code === 'Escape' && screen === 'play') {
    go('games');
  }
});

// メニュー
for (const b of document.querySelectorAll('#menu [data-go]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    knock();
    go(b.dataset.go);
  });
}
for (const b of document.querySelectorAll('[data-soon]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    boop();
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
    toast(`${b.dataset.soon}は もうすこし まっててね!`);
  });
}
for (const b of document.querySelectorAll('[data-back]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    knock();
    go(b.dataset.back || 'menu');
  });
}

// ── 競技の入口(ルールとキャラえらび) ───────────────────────
let picked = CHARACTERS.some((c) => c.key === settings.character) ? settings.character : CHARACTERS[0].key;
let faces = null; // キャラの顔の絵(はじめて入口・図鑑をひらいたときに撮る)
function ensureFaces() {
  if (faces) return;
  faces = {};
  makePortraits(renderer, CHARACTERS.map((c) => c.key)).then((f) => {
    faces = f;
    if (screen === 'play') renderChars();
    if (screen === 'zukan') zukan.refreshTabs();
  });
}
function renderChars() {
  $('chars').replaceChildren(...CHARACTERS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(c.key === picked));
    const color = '#' + c.main.toString(16).padStart(6, '0');
    const face = faces ? `<img class="face" src="${faces[c.key]}" alt="">` : `<i class="face" style="background:${color}"></i>`;
    b.innerHTML = `${face}<span>${c.name}</span>`;
    b.title = `${c.name}(${c.species})`;
    b.addEventListener('click', () => {
      unlockAudio();
      knock();
      picked = c.key;
      settings.character = picked;
      saveSettings(settings);
      renderChars();
    });
    return b;
  }));
  ensureFaces();
}

// ── キャラ図鑑 ──────────────────────────────────────
// ぱらっ(ページをめくる): 短い雑音を高いほうだけ
function rustle(len = 0.22) {
  if (!audio || !settings.sound) return;
  const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1400;
  const g = audio.createGain();
  g.gain.value = 0.3;
  src.connect(f).connect(g).connect(audio.destination);
  src.start();
}
const zukan = createZukan({
  sfx: { page: () => rustle(), open: () => { knock(); setTimeout(() => rustle(0.35), 650); }, close: () => { rustle(0.3); setTimeout(knock, 600); }, boop: () => tone(660, 0, 0.12, 'sine', 0.08) },
  onClose: () => go('menu'),
  faces: () => (faces && Object.keys(faces).length ? faces : null),
});
for (const b of document.querySelectorAll('[data-open]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    knock();
    ensureDaruma(); // ルールを読んでいるあいだに、会場を組み立てておく
    go('play');
  });
}
$('start').addEventListener('click', () => enterGame());

// ── 競技の会場へ(同じページのまま) ─────────────────────
const curtain = createLeafCurtain($('leaves'), $('curtainLabel'));
let active = 'title'; // 'title' | 'game'(どちらを描くか)
let daruma = null;
let darumaReady = null;
let busy = false; // 入れかえのとちゅう
// 大木へ飛びこむ具合(0 = ふつう、1 = 葉の中)と、その向き
const dive = { k: 0, dir: 0, crown: new THREE.Vector3(-1.4, 4.5, -2.2) };
{
  const crowns = island.group.getObjectByName('oakCrowns');
  if (crowns) new THREE.Box3().setFromObject(crowns).getCenter(dive.crown);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDaruma() {
  darumaReady ??= import('../games/daruma/game.js')
    .then((m) => m.createDaruma({
      renderer,
      settings,
      getAudio: () => { unlockAudio(); return audio; },
      onExit: (to) => leaveGame(to),
    }))
    .then((d) => {
      daruma = d;
      if (active === 'title') applyQuality(); // 会場の組み立てで影の設定が変わるので、島に合わせなおす
      return d;
    });
  return darumaReady;
}

async function enterGame() {
  if (busy) return;
  busy = true;
  unlockAudio();
  knock();
  whoosh(1.1, true);
  go('dive');
  dive.dir = 1;
  const ready = ensureDaruma();
  await wait(250);
  await curtain.cover();
  const d = await ready;
  await d.enter(picked);
  active = 'game';
  dive.dir = 0;
  dive.k = 1;
  whoosh(0.8, false);
  await curtain.reveal();
  busy = false;
}

async function leaveGame(to) {
  if (busy) return;
  busy = true;
  whoosh(0.9, true);
  await curtain.cover();
  daruma.exit();
  active = 'title';
  applyQuality();
  go(to);
  // 葉の中から、うしろへ引いて島へもどる
  dive.k = 1;
  dive.dir = -1;
  clock.getDelta();
  await curtain.reveal();
  busy = false;
}

// せってい
function renderSettings() {
  for (const b of $('optSound').children) b.setAttribute('aria-pressed', String((b.dataset.v === 'on') === settings.sound));
  for (const b of $('optQuality').children) b.setAttribute('aria-pressed', String(b.dataset.v === settings.quality));
}
$('optSound').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  settings.sound = v === 'on';
  saveSettings(settings);
  if (settings.sound) {
    unlockAudio();
    knock();
  }
  renderSettings();
});
$('optQuality').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  settings.quality = v;
  saveSettings(settings);
  knock();
  applyQuality();
  renderSettings();
});
renderSettings();

// ── 動かす ──────────────────────────────────────────
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const rawDt = clock.getDelta();
  requestAnimationFrame(frame);
  if (active === 'game') {
    daruma.frame(rawDt);
    return;
  }
  const dt = Math.min(rawDt, 0.1);
  t += dt;
  const portrait = camera.aspect < 1;
  // 島のずらし方を、画面に合わせてなめらかに変える
  const target = SCREENS[screen] || SCREENS.title;
  const k = 1 - Math.exp(-dt * 5);
  let ty = target.view[1], tr = 1;
  if (portrait && target.foot) {
    // 島の段: 看板の下ふちから、下の段(メニュー・「タップしてはじめる」)の上ふちまで
    const foot = $(target.foot).getBoundingClientRect().top;
    const top = target.sign ? signBottom : safeProbe.offsetHeight + 12;
    if (foot > 0) {
      const gap = foot - top;
      ty = (innerHeight / 2 - (top + gap * target.bias)) / innerHeight;
      tr = THREE.MathUtils.clamp((ISLAND_FILL * innerHeight) / gap, 1, 1.35); // 段がせまいときは引いて小さく
    }
  }
  // 飛びこむあいだは、直前の画面の見え方のまま(島が遠のいて見えないように)
  if (screen !== 'dive') {
    view.x += ((portrait ? 0 : target.view[0]) - view.x) * k;
    view.y += ((portrait ? ty : 0) - view.y) * k;
    view.r += (tr - view.r) * k;
  }
  view.sign += ((portrait && !target.sign ? 0 : 1) - view.sign) * k;
  // 大木へ飛びこむ(行きはだんだん速く、帰りはだんだんゆっくり)
  if (dive.dir) {
    dive.k = THREE.MathUtils.clamp(dive.k + (dive.dir * dt) / 1.1, 0, 1);
    if (dive.k === 0) dive.dir = 0;
  }
  const dk = dive.dir >= 0 ? dive.k ** 2.2 : 1 - (1 - dive.k) ** 0.45;
  const off = 1 - dk;
  camera.setViewOffset(innerWidth, innerHeight, view.x * off * innerWidth, view.y * off * innerHeight, innerWidth, innerHeight);
  // カメラは島のまわりをゆっくり回る
  const a = t * 0.06 + 0.5;
  const r = (portrait ? 25 : 20) * view.r;
  camera.position.set(Math.sin(a) * r, portrait ? 6.5 : 5.2, Math.cos(a) * r);
  const look = new THREE.Vector3(0, portrait ? 2.6 : 1.4, 0);
  if (dk > 0) {
    const near = dive.crown.clone().add(camera.position.clone().sub(dive.crown).setLength(1.2));
    camera.position.lerp(near, dk);
    look.lerp(dive.crown, Math.min(1, dk * 1.6));
  }
  camera.lookAt(look);
  camera.updateProjectionMatrix();

  const showPick = screen === 'play' || screen === 'dive';
  for (const actor of actors) {
    const { role, model } = actor;
    const me = showPick && role.key === picked;
    if (me) {
      // 選ばれたキャラは、その場でよろこぶ
      model.play('cheer');
      model.setFace('happy');
    } else {
      model.play(role.act === 'chase' ? 'run' : role.act);
      model.setFace(role.face || 'normal');
    }
    if (role.act === 'chase' && !me) {
      // 大木の幹のまわりを追いかけっこ
      actor.ang += dt * 0.7;
      const x = Math.cos(actor.ang) * 2.3 - 1.4, z = Math.sin(actor.ang) * 2.3 - 2.2;
      model.root.position.set(x, islandHeight(x, z), z);
      model.root.rotation.y = -actor.ang;
    } else {
      // カメラのほうを向く
      const to = Math.atan2(camera.position.x - model.root.position.x, camera.position.z - model.root.position.z);
      let d = to - model.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      model.root.rotation.y += d * (1 - Math.exp(-dt * 8));
    }
    model.update(dt);
  }
  owl.update(dt);
  island.update(dt, t);

  // 看板: 上から落ちてきて弾み、そのあとはゆらゆら。島を上へずらした分は戻して、画面の上に残す
  if (signDrop >= 0) signDrop += dt;
  const fall = signDrop < 0 ? 1 : Math.exp(-3.2 * signDrop);
  sign.pivot.position.copy(signRest);
  // 縦長: 島を上へずらした分だけ看板を下げて、画面の上に残す(看板もカメラにくっついているので、一緒に動いてしまう)
  // 横長: 看板は島と一緒に左へ動いて、島の上にいる
  sign.pivot.position.y -= viewH * view.y;
  if (signDrop < 0) sign.pivot.position.y += viewH;
  else sign.pivot.position.y += 3 * fall * Math.cos(signDrop * 9) * (signDrop < 0.17 ? 1 : 0.35);
  sign.pivot.position.y += (1 - view.sign) * viewH * 0.5; // 競技えらび・せっていでは上へしまう
  sign.pivot.rotation.z = Math.sin(t * 1.1) * 0.022 + fall * Math.sin(Math.max(0, signDrop) * 7) * 0.12;

  atmosphere.update(dt);
  renderer.render(scene, camera);
  if (screen === 'zukan') zukan.frame(dt);
}

// 読み込みおわり
$('loading').classList.add('done');
setTimeout(() => $('loading').remove(), 600);
signDrop = 0;
// #menu: メニューから / #daruma: だるまさんがころんだ の入口から / #zukan: 図鑑から
if (location.hash === '#zukan') {
  ensureFaces();
  go('zukan');
} else if (location.hash === '#daruma') {
  ensureDaruma();
  go('play');
} else {
  go(location.hash === '#menu' ? 'menu' : 'title');
}
frame();

// E2E 用の口
window.title = {
  camera, scene, go,
  get screen() { return screen; },
  get active() { return active; },
  get busy() { return busy; },
  setTime: (k) => atmosphere.apply(k),
  redrop: () => { signDrop = 0; },
  pick: (key) => { picked = key; renderChars(); },
  start: () => enterGame(),
  ready: () => ensureDaruma(),
  zukan,
};
