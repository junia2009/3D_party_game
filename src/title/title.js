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
import { CHARACTERS, PLAYER_COLORS, shownCharacters } from '../characters.js';
import { createModel, preload } from '../runtime/models.js';
import { recordBuild, release } from './release.js';
import { clearTaikai, loadTaikai } from '../board/save.js';
import { createAtmosphere } from '../games/daruma/atmosphere.js';
import { loadSettings, saveSettings } from '../settings.js';
import { createMusic } from '../music/player.js';
import { CARVE, GAME_MUSIC } from '../music/songs.js';
import { ROLES, buildIsland, islandHeight } from './island.js';
import { buildSign, drawSign } from './sign.js';
import { woodPlank } from './wood.js';
import { createLeafCurtain } from './leaves.js';
import { makePortraits } from './portraits.js';
import { createZukan } from './zukan.js';
import { LIST as STAGE_LIST } from '../board/stages/index.js';
import { setupOnline } from './online.js';
import { initAnalytics, track } from '../analytics.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const settings = loadSettings();

// PWA: オフラインでも遊べるように、配信するファイルを手元にしまっておく(sw.js)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// 匿名のアクセス集計(src/analytics.js)。手元の開発・E2E・?seed= 付きでは何もしない。
// ホーム画面から起動した(PWA として使われている)かも数える。
if (initAnalytics() && window.matchMedia?.('(display-mode: standalone)').matches) track('pwa-launch');

// 木の板の絵を、メニューのボタンの背景にする
document.documentElement.style.setProperty('--wood', `url(${woodPlank(640, 140, { seed: 3 })})`);
// 図鑑の表紙(色の濃い板)
document.documentElement.style.setProperty('--wood-cover', `url(${woodPlank(720, 480, { seed: 9, radius: 0.04, tone: ['#b9804a', '#a56d3c', '#8f5c30'] })})`);

// ── 音 ─────────────────────────────────────────────
let audio = null;
const music = createMusic();
music.setVolume(settings.bgm);
function unlockAudio() {
  if (!settings.sound && settings.bgm === 'off') return;
  if (audio) {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return;
  }
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    audio = null;
    return;
  }
  music.attach(audio);
  setTimeout(updateMusic, 900); // はじめの ジングルの あとから
}
// いまの 場面の BGM
function musicFor() {
  if (active === 'title') return 'title';
  if (playing && playing === taikaiBoard) return taikai.stage; // ステージごとの 曲
  return GAME_MUSIC[playingKey] ?? null; // 競技は 雰囲気ごとの 曲
}
// 盤や 競技の あいだは 効果音が 聞こえる ように 小さめにして、効果音の 帯域を あける
function updateMusic() {
  const where = active === 'title' ? 'title' : playing === taikaiBoard ? 'board' : 'game';
  music.play(musicFor(), where === 'title' ? 1 : where === 'board' ? 0.8 : 0.6);
  if (audio) music.setCarve(where === 'title' ? 0 : where === 'board' ? CARVE.board : CARVE[playingKey] ?? CARVE.default);
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

// 図鑑の人数は、のっている子の数から(ゲストも なかま)
$('zukanCount').textContent = `${shownCharacters().length}人の なかまを 見る`;

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
  stages: { el: $('stages'), view: [0.24, 0.17], sign: false },
  settings: { el: $('settings'), view: [0.24, 0.17], sign: false },
  // 競技の入口: 選んだキャラが島の上でよろこぶのが見えるように、島を上の段に出す
  play: { el: $('play'), view: [0.24, 0], sign: false, foot: 'play', bias: 0.5 },
  // 大木へ飛びこんでいるところ / 競技の会場にいるあいだ
  dive: { el: null, view: [0, 0], sign: false },
  // キャラ図鑑(本は島の前でひらく。島はうしろでそのまま)
  zukan: { el: null, view: [0, 0], sign: false },
  // オンライン(入口と 部屋)
  online: { el: $('online'), view: [0.24, 0.17], sign: false },
  room: { el: $('room'), view: [0.24, 0.17], sign: false },
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
  if (next === 'stages') { renderStageMap(); renderResume(); requestAnimationFrame(drawPaper); }
  if (next === 'menu') $('resumeBadge').hidden = !loadTaikai();
  if (next === 'zukan') {
    track('zukan');
    ensureFaces();
    zukan.open();
  }
  if (next === 'online' || next === 'room') ensureFaces();
  if (next === 'room') online?.render();
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
  // リンクで 部屋に よばれた: その 部屋へ
  const code = online.takePendingRoom();
  if (code) { track('room-link'); go('online'); online.join(code); return; }
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
let picked = shownCharacters().some((c) => c.key === settings.character) ? settings.character : CHARACTERS[0].key;
let faces = null; // キャラの顔の絵(はじめて入口・図鑑をひらいたときに撮る)
function ensureFaces() {
  if (faces) return;
  faces = {};
  makePortraits(renderer, CHARACTERS.map((c) => c.key)).then((f) => {
    faces = f;
    if (screen === 'play') renderChars();
    if (screen === 'zukan') zukan.refreshTabs();
    if (screen === 'stages') renderResume();
    if (screen === 'room') online.render();
  });
}
function renderChars() {
  $('chars').replaceChildren(...shownCharacters().map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(c.key === picked));
    const color = '#' + c.main.toString(16).padStart(6, '0');
    const face = faces ? `<img class="face" src="${faces[c.key]}" alt="">` : `<i class="face" style="background:${color}"></i>`;
    b.innerHTML = `${face}<span>${c.name}</span>${c.guest ? '<em class="guest">ゲスト</em>' : ''}`;
    if (c.guest) b.classList.add('guest');
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
// 競技の一覧。入口に出す名前とルール、会場の組み立て方
const GAMES = {
  daruma: {
    name: 'だるまさんが ころんだ',
    rules: [
      '<b>長押し</b>で走る。はなすと止まる(少しすべる)。',
      'ホーホー先生が<b>ふりむいたら</b>ぴたっと止まる。',
      '動いているのが見つかると<b>5m もどされる</b>。',
      '先にゴールにタッチした人の勝ち!',
    ],
    load: () => import('../games/daruma/game.js').then((m) => m.createDaruma),
  },
  catch: {
    name: 'どんぐりキャッチ',
    rules: [
      'どこでも<b>指をおいて ずらす</b>と、その向きへ走る。',
      '枝がゆれたら、どんぐりの<b>影</b>の下で頭のかごに受けとめる。',
      '<b>金どんぐり</b>(金の輪)は 5 こ分。<b>毛虫・まつぼっくり</b>(赤い輪)は目が回る。',
      'ぶつかると、かごからこぼれる。いちばん多く集めた人の勝ち!',
    ],
    load: () => import('../games/catch/game.js').then((m) => m.createCatch),
  },
  sled: {
    name: '落ち葉そりレース',
    rules: [
      '画面の<b>左・右を押す</b>と、そっちへ曲がる。',
      '<b>両方おす</b>と、ふせて速くなる(そのあいだは曲がれない)。',
      'カーブは<b>内がわ</b>が近い。ふちの落ち葉にこすると遅くなる。',
      '<b>キノコ</b>でジャンプ、<b>どんぐり</b>で加速。わかれ道は近道と遠回り。',
    ],
    load: () => import('../games/sled/game.js').then((m) => m.createSled),
  },
  mato: {
    name: 'まつぼっくり的あて',
    rules: [
      'ゆびを<b>下へひっぱって、はなす</b>と、まっすぐ速く飛ぶ。長く引くほど上へ、左へ引くと右へ。',
      '<b>自分の色の的</b>に当てる。遠い的・つるされた的は 2 点、<b>金の的</b>は 5 点。',
      '<b>ハチの巣</b>に当てると 3 点へって、少し投げられない。',
      '<b>風</b>で横へ流される。<b>つづけて当てる</b>とボーナス!',
    ],
    load: () => import('../games/mato/game.js').then((m) => m.createMato),
  },
  tsumi: {
    name: 'どんぐりつみ',
    rules: [
      '上で<b>左右にゆれている森のもの</b>を、<b>タップ</b>で落として山に積む。',
      'みんなでひとつの山。順番に1こずつ積んでいく。',
      '<b>山をくずした子</b>・山に乗せそこねた子は脱落。山は切り株からやりなおし。',
      '丸いものの上はすべりやすい。<b>最後まで残った子</b>の勝ち!',
    ],
    load: () => import('../games/tsumi/game.js').then((m) => m.createTsumi),
  },
  ikada: {
    name: 'いかだレース',
    rules: [
      '画面の<b>左と右を こうごに たたいて</b>こぐ。こうごだと まっすぐ速い。',
      '本物の舟と同じく、<b>右へ行きたいときは左を</b>、<b>左へ行きたいときは右を</b>こぐ。同じがわを続けると大きく曲がる。',
      '<b>岩・流木</b>にぶつかると止まって回る。<b>うず</b>に入ったら強くこいで抜け出す。',
      '<b>小さな滝</b>はざぶーん! ほかのいかだに体当たりもできる。先にダムの水門へ着いた人の勝ち!',
    ],
    load: () => import('../games/ikada/game.js').then((m) => m.createIkada),
  },
  hana: {
    name: '花ぬり陣取り',
    rules: [
      'どこでも<b>指をおいて ずらす</b>と、その向きへ走る。<b>通ったところに 自分の色の花</b>がさく。',
      'ほかの子の花も、上を走れば<b>さきかえられる</b>。',
      '<b>じょうろ</b>はまわりを一気に、<b>ミツバチ</b>はしばらく 通り道を太く さかせる。',
      '<b>つむじ風</b>は花を散らす(赤い矢じるしが知らせ)。<b>全速力の体当たり</b>で相手のまわりを うばえる。いちばん広くさかせた人の勝ち!',
    ],
    load: () => import('../games/hana/game.js').then((m) => m.createHana),
  },
  hayauchi: {
    name: 'どんぐり早うち',
    rules: [
      'ホーホー先生が<b>黄色い どんぐりの旗</b>をあげたら、画面のどこでも<b>タップ</b>して うつ。',
      '1回ごとに、<b>いちばん遅かった子</b>が脱落。最後まで残った子の勝ち!',
      '旗より前に うつと<b>おてつき</b>で脱落。<b>赤い旗(うつな!)</b>・<b>にせの合図</b>・<b>じゃまもの</b>に つられないで。',
      '合図までの時間は毎回ちがう。<b>じっとがまん</b>!',
    ],
    load: () => import('../games/hayauchi/game.js').then((m) => m.createHayauchi),
  },
  sumo: {
    name: '切り株ずもう',
    rules: [
      'どこでも<b>指をおいて ずらす</b>と歩く。湖にうかぶ切り株から<b>おしだしたら</b>勝ち!',
      '右下の<b>「ためる」を おして、はなす</b>と とっしん。ためるほど強い。とっしんのあとは すきだらけ。',
      '<b>金どんぐり</b>で しばらく大きく重くなる。<b>こけ</b>の上は つるっとすべる。',
      'しばらくすると<b>土俵が 外から くずれる</b>(赤く ぐらぐらしたら にげて!)。最後まで残った人の勝ち!',
    ],
    load: () => import('../games/sumo/game.js').then((m) => m.createSumo),
  },
  kakure: {
    name: 'おぼえて かくれんぼ',
    rules: [
      'リスが ふせた<b>かご</b>に かくれて、かごが ぐるぐる いれかわる。<b>目で追って</b>!',
      '「リスは どこ?」で <b>かごを タップ</b>。あたりは 3 点、<b>早いもの順</b>に ボーナス。',
      '3回目から<b>キツネ</b>も まぎれる(えらぶと 1 点へる)。4回目から ちょうちんが<b>一瞬 消える</b>。',
      '5 回やって、点のいちばん多い人の勝ち!',
    ],
    load: () => import('../games/kakure/game.js').then((m) => m.createKakure),
  },
  dasshutsu: {
    name: 'どんぐりマンション だっしゅつ',
    rules: [
      'どこでも<b>指をおいて ずらす</b>と走る。ドアの前で<b>「あける」</b>。',
      '下の階へ行ける<b>ただしいドア</b>は 1つだけ。まちがいのドアは、ふしぎ! <b>同じドアから 出てきちゃう</b>。',
      'ドアの上に<b>どんぐりの印</b>が きらっと光ったら、そこが あたり!',
      '6かいから じめんの<b>出口</b>へ。いちばん早く だっしゅつした人の勝ち!',
    ],
    load: () => import('../games/dasshutsu/game.js').then((m) => m.createDasshutsu),
  },
  tsuna: {
    name: '川原の つなひき',
    rules: [
      '小川を はさんで <b>3人 対 3人</b>。人が たりない チームには <b>森の なかま</b>が すけっとに入る。',
      'どこでも <b>連打</b>で つなを ひく。たくさん タップするほど 強い!',
      '先生が ふいに <b>「せーの!」</b>。そのあいだは 力が <b>2ばい</b>! 足もとが <b>つるっ</b>と すべったら、連打で ふんばる。',
      '負けそうな チームには <b>観客の 応援</b>で 力が わく。相手を 小川に ひきこんだら 勝ち!',
    ],
    load: () => import('../games/tsuna/game.js').then((m) => m.createTsuna),
  },
  nawa: {
    name: 'お祭りの 大なわとび',
    rules: [
      'なわが 足もとに 来たら、どこでも <b>タップ</b>で ジャンプ。ひっかかったら 脱落!',
      '<b>「大なみ!」</b>は なわが 高い ところを 通る。<b>長おし</b>で 大ジャンプ!',
      'なわは <b>だんだん 速く</b>。ときどき 急に ゆっくりに なる ふいうちも。',
      'となりに <b>カエル</b>が 来て、くずれた リズムで とぶ。つられないで! さいごの 1人が 勝ち。',
    ],
    load: () => import('../games/nawa/game.js').then((m) => m.createNawa),
  },
  kazan: {
    name: '火山の 落ちものよけ',
    rules: [
      'どこでも <b>指を おいて ずらす</b>と 走る。空から ふってくる 岩や 火の玉を よけよう!',
      '落ちる ところには 先に <b>影</b>が 出る。大きい 影は 大岩! 火の玉の あとは しばらく <b>火</b>が のこる。',
      '<b>ころがる岩</b>は 右下の <b>「ジャンプ」</b>で とびこえる。だんだん 激しく、外がわの 足場も <b>くずれる</b>!',
      '<b>かさ</b>を ひろうと 1回だけ まもってくれる。さいごの 1人まで のこったら 勝ち!',
    ],
    load: () => import('../games/kazan/game.js').then((m) => m.createKazan),
  },
  yuki: {
    name: '雪山の 雪合戦',
    rules: [
      '<b>3人 対 3人</b>の 雪合戦。人が たりない チームには <b>森の なかま</b>が すけっとに入る。',
      'どこでも <b>指を おいて ずらす</b>と 走る。<b>すこしだけ</b> ずらすと その場で 向きだけ かわる。<b>「なげる」</b>で 向いている ほうへ!',
      '雪玉は 3こまで。<b>「つくる」を れんだ</b>すると できる。<b>こおり</b>の 上は つるつる、雪玉も つくれない。',
      '<b>金の 雪玉</b>は 当たると 2つ ぶん。4回 当てられると <b>雪だるま</b>! 相手を みんな 雪だるまに したら 勝ち。',
    ],
    load: () => import('../games/yuki/game.js').then((m) => m.createYuki),
  },
  bumper: {
    name: '遊園地の バンパーカー',
    rules: [
      'どこでも <b>指を おいて ずらす</b>と、その 向きへ <b>ハンドル</b>。車は 前へ しか 進まない!',
      '右下の <b>「ダッシュ」</b>で ぐんと 加速。ダッシュで ぶつけると 相手を 大きく はじきとばせる。',
      'リンクの ふちから 出たら 脱落。しばらくすると <b>リンクが ちぢむ</b>!',
      'まん中の <b>回る 円盤</b>に のると、ぐるぐる 回されて 外へ 流される。さいごの 1台が 勝ち!',
    ],
    load: () => import('../games/bumper/game.js').then((m) => m.createBumper),
  },
  kinoko: {
    name: '森の湖の いろいろキノコ',
    rules: [
      '湖に うかぶ <b>7色の キノコ</b>。ホーホー先生が <b>旗</b>を あげたら、その色の キノコへ 走ろう!',
      'ほかの キノコは 湖に <b>しずむ</b>。間に あわないと ざぶん! しずむまでの 時間は <b>だんだん 短く</b>。',
      'どこでも <b>指を おいて ずらす</b>と 走る。右下の <b>「ジャンプ」</b>、空中で もう一度 おすと <b>ヒップドロップ</b>で まわりを はじく。',
      '相手の 頭に のると <b>ふんづけ</b>(少し 動けない)。さいごまで のこった 子が 勝ち!',
    ],
    load: () => import('../games/kinoko/game.js').then((m) => m.createKinoko),
  },
  ehon: {
    name: '森の図書館の ぱらぱらブック',
    rules: [
      '大きな 絵本の ページが、奥から 手前へ <b>ぱたん!</b>と たおれてくる。',
      'ページには どんぐりや 星の 形の <b>穴</b>。たおれてくる とき、<b>穴の ところ</b>に いれば セーフ!',
      '穴の 外に いたら ぺちゃんこで 脱落。床に うつる <b>影</b>が 目じるし。',
      'どこでも <b>指を おいて ずらす</b>と 走る。めくれる 速さは <b>だんだん 速く</b>。さいごまで のこった 子が 勝ち!',
    ],
    load: () => import('../games/ehon/game.js').then((m) => m.createEhon),
  },
  mame: {
    name: '空まで まめのきジャンプ',
    rules: [
      'じぶんの <b>まめの木</b>を のぼろう。つぎの 葉っぱが <b>左か 右</b>に 生えてくる。',
      '生えた ほうの <b>ボタン</b>(画面の 左半分 / 右半分 でも OK)を おすと ぴょんと とびうつる。',
      'まちがえると すべり落ちて <b>2まい 下</b>へ。すこし 動けない。',
      '<b>40 秒</b>で いちばん 高く のぼった 子の 勝ち!',
    ],
    load: () => import('../games/mame/game.js').then((m) => m.createMame),
  },
  volley: {
    name: '夏の浜べの ビーチバレー',
    rules: [
      'くじで <b>3人 対 3人</b>の チームに わかれる(たりない ところは 森の なかまが すけっと)。',
      'ボールが 来ると まわりに <b>わ</b>が 出る。わが ちぢんで かさなった <b>しゅんかん</b>に おすと <b>ナイス!</b>',
      'レシーブ → トス → <b>スパイク</b>。トスは あなたに あがる。スパイクは <b>スティックで ねらう</b>。',
      '相手の スパイクは <b>ネットの 前で ブロック</b>。遠い ボールは <b>とびこんで</b> 拾える。先に <b>5点</b>で 勝ち!',
    ],
    load: () => import('../games/volley/game.js').then((m) => m.createVolley),
  },
  hikouki: {
    name: '森の谷まの かみひこうき',
    rules: [
      '紙ひこうきに のって 森の 谷まを とぶ。<b>スマホを かたむけて</b> あやつる(ゆびでも OK)。',
      '左右で まがる。<b>むこうへ たおすと 下がって 速く</b>、<b>てまえへ おこすと 上がる</b>。',
      'わっかを くぐると 1点、<b>金の わっか</b>は 3点。高い 金の わっかは 光る <b>風の 柱</b>で ふわっと 上がって ねらおう。',
      '<b>よこかぜ</b>・ゆれる <b>枝</b>・<b>鳥の むれ</b>に 気をつけて。ゴールまでに 点が いちばん 多い 子の 勝ち!',
    ],
    load: () => import('../games/hikouki/game.js').then((m) => m.createHikouki),
  },
  ramune: {
    name: '夏祭りの ラムネ しゅわしゅわ',
    rules: [
      'ラムネの びんを <b>スマホを ふって</b> しゅわしゅわ(ふれない ときは 画面を 連打)。あわが たまる。',
      '<b>「ポン!」</b>で ふたが とぶ。あわが 多いほど 高く とぶ。',
      '左の ゲージが <b>てっぺんまで いくと ふきこぼれて 0</b>! 上の ほうは あわで よく 見えない。びんが <b>がたがた</b> したら もうすぐ いっぱい。ふるのを やめても すこし ふえるよ。',
      'ふらないと こおりで あわが へって いく。<b>3回せん</b>の 合計で 勝負!',
    ],
    load: () => import('../games/ramune/game.js').then((m) => m.createRamune),
  },
  wataame: {
    name: '秋の森の わたあめ まき',
    rules: [
      'わりばしを <b>スマホを ぐるぐる 回して</b> まわす(画面を ゆびで なぞっても OK)。わたあめが 大きく なる。',
      'メーターの <b>みどり</b>で 回すと よく まける。<b>はやすぎると ちぎれる</b>! 大きく なるほど みどりは おそい ほうへ。',
      '<b>ざらめ チャンス</b>は わが ボタンに かさなった ときに おす。30びょうで いちばん 大きい 子の 勝ち!',
    ],
    load: () => import('../games/wataame/game.js').then((m) => m.createWataame),
  },
  keshigomu: {
    name: '森の学校の けしごむ大戦',
    rules: [
      '画面を おして <b>ひっぱって はなす</b>と、自分の けしごむを はじく。<b>ながく おすほど つよい</b>。とまって いる ときなら いつでも。',
      'ほかの けしごむに ぶつけて <b>つくえから おとそう</b>。ゆびを まげて ひくと <b>ひねり</b>で 回りながら すべる。',
      'けしごむの かたちで おもさと すべりが ちがう。しばらく すると <b>つくえが はしから けずれて</b> いく。さいごまで のこった 子の 勝ち!',
    ],
    load: () => import('../games/keshigomu/game.js').then((m) => m.createKeshigomu),
  },
  otoshi: {
    name: 'お正月の だるまおとし',
    rules: [
      'みんなで 1つの だるまを <b>じゅんばんに</b> たたく。じぶんの ばんに 画面を <b>おして ためて、はなして たたく</b>。',
      'ゲージの <b>みどりの まんなか</b>で はなすと きれいに ぬける。よわいと ずれる だけ、<b>つよすぎると ぐらぐら</b>。',
      '<b>かたい だん</b>は つよく、<b>すべる だん</b>は よわく。ぐらぐら して いる ときに たたくと くずれやすい。<b>くずした 子は アウト</b>。さいごの 1人が 勝ち!',
    ],
    load: () => import('../games/otoshi/game.js').then((m) => m.createOtoshi),
  },
  meiro: {
    name: '森の いせきの どんぐり めいろ',
    rules: [
      'いせきの <b>めいろ</b>を はしって <b>どんぐり</b>を あつめる(ゆびを おいて ずらすと はしる)。1こ 1点、<b>たからばこ</b>は 5点!',
      '<b>おばけ</b>に ぶつかると どんぐりを 3こ おとす。<b>うごく かべ</b>は でたり しずんだり。ひかる <b>矢じるし</b>を ふむと かべを とびこえる。',
      '60びょうで いちばん たくさん あつめた 子の 勝ち!',
    ],
    load: () => import('../games/meiro/game.js').then((m) => m.createMeiro),
  },
  bowl: {
    name: '森の 倒れ木の どんぐりボウリング',
    rules: [
      '5人 ならんで <b>いっせいに</b> 投げる。<b>ゆびを おいた 左右の 場所</b>に 立って、<b>上へ シュッと はじく</b>と どんぐりが ころがる。はやく はじくほど つよい。',
      'はじく さいごに <b>まげると カーブ</b>。<b>まつぼっくりの ピン</b>を たおした 本数が 点。<b>ストライク</b> +5、<b>スペア</b> +3、<b>金の ピン</b> +3!',
      'レーンの <b>小石や こぶ</b>に あたると 向きが かわる。3フレームで いちばん 点の 多い 子の 勝ち!',
    ],
    load: () => import('../games/bowl/game.js').then((m) => m.createBowl),
  },
  oni: {
    name: '夕ぐれの 森の おにごっこ',
    rules: [
      '<b>おに</b>(赤い つの)に <b>タッチ</b>されたら おにが 交代。ゆびを おいて ずらすと はしる。「<b>ダッシュ</b>」で ひと走り!',
      '<b>草むら</b>に 入ると かくれられる。<b>金の どんぐり</b>を ひろうと +2点。おにに なった 子は 前の おにを すぐには タッチ できない。',
      '60びょうで <b>おにで なかった 時間</b>が いちばん 長い 子の 勝ち!',
    ],
    load: () => import('../games/oni/game.js').then((m) => m.createOni),
  },
  // 大会(すごろく)。入口はステージ選択から(ターンをえらぶ)
  taikai: {
    name: '大会',
    rules: [
      '盤をまわって、<b>金どんぐりメダル</b>を集める。メダルはホーホー先生から どんぐり 20 こで買える。',
      '<b>どんぐりサイコロ</b>(1〜10)はタップで止める。青マスで +3、赤マスで -3。',
      'みんなが動いたら<b>競技</b>。順位でどんぐりがもらえる。',
      'さいごに<b>ボーナスメダル</b>が3つ。メダルがいちばん多い子が優勝!',
    ],
    load: () => import('../board/game.js').then((m) => m.createBoard),
  },
};
let current = 'daruma'; // 入口に出している競技
let taikai = { stage: 'shiki', turns: 10 }; // 大会の入口でえらんだもの
function openGame(key) {
  // ページ(カード)だけ 新しくて、この title.js が 古いと 競技が 見つからない。いちど だけ 読みなおす
  if (!GAMES[key]) {
    let tried = false;
    try { tried = sessionStorage.getItem('dongurinpic.reloadFor') === key; sessionStorage.setItem('dongurinpic.reloadFor', key); } catch { /* しまえない ときは そのまま */ }
    if (!tried) location.reload();
    return;
  }
  current = key;
  const isTaikai = key === 'taikai';
  $('turnSel').hidden = !isTaikai;
  $('play').querySelector('[data-back]').dataset.back = isTaikai ? 'stages' : 'games';
  if (isTaikai) renderTurns();
  $('playTitle').textContent = isTaikai ? `大会: ${STAGE_LIST.find((x) => x.key === taikai.stage).name}` : GAMES[key].name;
  $('playRules').innerHTML = GAMES[key].rules.map((r) => `<li><span>${r}</span></li>`).join('');
  ensureGame(key); // ルールを読んでいるあいだに、会場を組み立てておく
  go('play');
}
for (const b of document.querySelectorAll('[data-open]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    knock();
    openGame(b.dataset.open);
  });
}
$('start').addEventListener('click', () => enterGame());

// ── 競技の会場へ(同じページのまま) ─────────────────────
const curtain = createLeafCurtain($('leaves'), $('curtainLabel'));
let active = 'title'; // 'title' | 'game'(どちらを描くか)
const games = {}; // 競技 → 組み立て(Promise)
let playing = null; // いま会場にいる競技
let playingKey = null; // その 競技の 名前(曲を えらぶ)
let busy = false; // 入れかえのとちゅう
// 大木へ飛びこむ具合(0 = ふつう、1 = 葉の中)と、その向き
const dive = { k: 0, dir: 0, crown: new THREE.Vector3(-1.4, 4.5, -2.2) };
{
  const crowns = island.group.getObjectByName('oakCrowns');
  if (crowns) new THREE.Box3().setFromObject(crowns).getCenter(dive.crown);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 組み立てた 競技は ひとつだけ 手もとに おく(大会の あいだは 大会の 盤も)。
// ほかは 片づけて メモリを 返す。のこしつづけると、大会で 競技を 次々 遊ぶうちに
// メモリが ふくらんで、スマホでは ページごと 読み込みなおされてしまう(release.js)。
const built = {}; // 競技 → 片づけるための 記録
function releaseGame(key) {
  if (!built[key]) return;
  release(built[key]);
  delete built[key];
  delete games[key];
}
function trimGames(keep) {
  for (const k of Object.keys(built)) {
    if (k === keep || (k === 'taikai' && taikaiBoard)) continue;
    if (active === 'game' && built[k].value === playing) continue;
    releaseGame(k);
  }
}
function ensureGame(key) {
  if (!games[key]) trimGames(key);
  games[key] ??= GAMES[key].load()
    .then((create) => recordBuild(() => create({
      renderer,
      settings,
      getAudio: () => { unlockAudio(); return audio && music.sfx(); }, // 効果音は BGM の ダッキングを とおす
      onExit: (to) => leaveGame(to),
      playMinigame: (key2, lineup, character) => playMinigame(key2, lineup, character),
    })))
    .then((rec) => {
      built[key] = rec;
      if (active === 'title') applyQuality(); // 会場の組み立てで影の設定が変わるので、島に合わせなおす
      return rec.value;
    });
  return games[key];
}

async function enterGame() {
  if (busy) return;
  busy = true;
  unlockAudio();
  knock();
  whoosh(1.1, true);
  go('dive');
  dive.dir = 1;
  const ready = ensureGame(current);
  await wait(250);
  await curtain.cover();
  playing = await ready;
  const resume = current === 'taikai' && taikai.resume ? loadTaikai() : null;
  taikai.resume = false;
  if (current !== 'taikai') track('game-start', { key: current, name: GAMES[current].name });
  else if (resume) track('taikai-resume', { stage: resume.s.stage });
  else track('taikai-start', { stage: taikai.stage });
  await playing.enter(picked, current === 'taikai' ? { fromSky: true, turns: taikai.turns, stage: taikai.stage, resume } : undefined);
  taikaiBoard = current === 'taikai' ? playing : null;
  playingKey = current;
  active = 'game';
  updateMusic();
  dive.dir = 0;
  dive.k = 1;
  whoosh(0.8, false);
  await curtain.reveal();
  busy = false;
}

async function leaveGame(to) {
  if (busy) return;
  busy = true;
  if (onlineGame) {
    // オンラインの 競技を とちゅうで やめた: 部屋も ぬける(のこりは CPU が やる)
    online.leave();
    onlineGame = false;
    onlineTaikai = false;
    if (to === 'play') to = 'online';
  }
  whoosh(0.9, true);
  await curtain.cover();
  playing.exit();
  if (taikaiBoard && taikaiBoard !== playing) taikaiBoard.exit(); // 大会の競技のとちゅうでやめたら、大会もおわり
  const wasTaikai = !!taikaiBoard;
  taikaiBoard = null;
  // 大会から もどったら、大会の 盤と 競技を 片づける
  if (wasTaikai) for (const k of Object.keys(built)) releaseGame(k);
  active = 'title';
  updateMusic();
  applyQuality();
  go(to);
  // 葉の中から、うしろへ引いて島へもどる
  dive.k = 1;
  dive.dir = -1;
  clock.getDelta();
  await curtain.reveal();
  busy = false;
}

// ── オンライン: 部屋から 競技へ 入って、おわったら 部屋へ もどる ─────────────
const online = setupOnline({
  $, go, toast, knock, unlockAudio,
  characters: () => shownCharacters(),
  faces: () => faces,
  games: GAMES,
  picked: () => picked,
  setPicked: (k) => { picked = k; settings.character = k; saveSettings(settings); },
  playOnline: (m, client) => (onlineTaikai ? playOnlineInTaikai(m, client) : playOnline(m, client)),
  playOnlineTaikai: (m, client) => playOnlineTaikai(m, client),
  inGame: () => onlineGame,
  inMinigame: () => onlineGame && !!playing && playing !== taikaiBoard,
});
let onlineGame = false; // オンラインの 競技・大会の 会場に いる
let onlineTaikai = false; // オンラインの 大会の とちゅう
// オンラインの 大会: 部屋から 盤へ
async function playOnlineTaikai(m, client) {
  while (busy) await wait(100);
  busy = true;
  onlineGame = true;
  onlineTaikai = true;
  taikai.stage = m.stage; // 曲は ステージで きまる
  track('online-taikai', { stage: m.stage });
  unlockAudio();
  whoosh(1.1, true);
  go('dive');
  dive.dir = 1;
  const ready = ensureGame('taikai');
  await wait(250);
  await curtain.cover();
  const g = await ready;
  await g.enter(m.lineup[m.seat].character, { fromSky: true, net: { client, start: m, onFinish: () => backToRoom('taikai') } });
  playing = g;
  taikaiBoard = g;
  playingKey = 'taikai';
  active = 'game';
  updateMusic();
  dive.dir = 0;
  dive.k = 1;
  whoosh(0.8, false);
  await curtain.reveal();
  busy = false;
}
// オンラインの 大会の 競技: 盤から 競技へ 入って、おわったら 盤へ もどる
async function playOnlineInTaikai(m, client) {
  while (busy) await wait(100);
  const home = taikaiBoard;
  busy = true;
  whoosh(1.1, true);
  await curtain.cover();
  const g = await ensureGame(m.key);
  await g.enter(m.lineup[m.seat].character, {
    fromSky: true,
    lineup: m.lineup,
    net: { client, start: m },
    onFinish: async () => {
      while (busy) await wait(100);
      busy = true;
      whoosh(0.9, true);
      await curtain.cover();
      g.exit();
      playing = home;
      playingKey = 'taikai';
      updateMusic();
      releaseGame(m.key);
      home?.resume?.();
      await curtain.reveal();
      busy = false;
    },
  });
  playing = g;
  playingKey = m.key;
  updateMusic();
  whoosh(0.8, false);
  await curtain.reveal();
  busy = false;
}
async function playOnline(m, client) {
  while (busy) await wait(100);
  busy = true;
  onlineGame = true;
  track('online-game', { key: m.key, name: GAMES[m.key]?.name });
  unlockAudio();
  whoosh(1.1, true);
  go('dive');
  dive.dir = 1;
  const ready = ensureGame(m.key);
  await wait(250);
  await curtain.cover();
  const g = await ready;
  await g.enter(m.lineup[m.seat].character, { fromSky: true, lineup: m.lineup, net: { client, start: m }, onFinish: () => backToRoom(m.key) });
  playing = g;
  playingKey = m.key;
  active = 'game';
  updateMusic();
  dive.dir = 0;
  dive.k = 1;
  whoosh(0.8, false);
  await curtain.reveal();
  busy = false;
}
async function backToRoom(key) {
  while (busy) await wait(100);
  busy = true;
  whoosh(0.9, true);
  await curtain.cover();
  playing?.exit();
  if (taikaiBoard && taikaiBoard !== playing) taikaiBoard.exit();
  playing = null;
  taikaiBoard = null;
  onlineGame = false;
  onlineTaikai = false;
  releaseGame(key);
  active = 'title';
  updateMusic();
  applyQuality();
  go(online.client ? 'room' : 'online');
  dive.k = 1;
  dive.dir = -1;
  clock.getDelta();
  await curtain.reveal();
  busy = false;
}

// ── 大会: 盤から競技へ入れかえて、順位をもらってもどる ─────────────
let taikaiBoard = null; // 大会の盤(大会のあいだだけ)
async function playMinigame(key, lineup, character) {
  const home = playing;
  busy = true;
  whoosh(1.1, true);
  await curtain.cover();
  const g = await ensureGame(key);
  let finish;
  const done = new Promise((r) => { finish = r; });
  await g.enter(character, { fromSky: true, lineup, onFinish: (res) => finish(res) });
  playing = g;
  playingKey = key;
  updateMusic();
  whoosh(0.8, false);
  await curtain.reveal();
  busy = false;
  const res = await done;
  busy = true;
  whoosh(0.9, true);
  await curtain.cover();
  g.exit();
  playing = home;
  playingKey = 'taikai';
  updateMusic();
  releaseGame(key); // 大会の 競技は 遊びおわったら すぐ 片づける
  home.resume?.();
  await curtain.reveal();
  busy = false;
  return res;
}

// ── 大会: ステージ選択(地図の本) ────────────────────────
// 地図の紙に、ステージの島をえがく。遊べる島はタップできる。じゅんびちゅうの島は霧の中
// 島の 絵(宝の地図の 上に 描く)。下に 水彩の 海の にじみ、岩の 土台、上に ステージの 景色
const ISLE_BASE = (top, rock = '#8a6a50', id = '') => `
  <defs><radialGradient id="wc${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7ec8e3" stop-opacity=".55"/><stop offset=".7" stop-color="#7ec8e3" stop-opacity=".25"/><stop offset="1" stop-color="#7ec8e3" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="80" cy="74" rx="78" ry="30" fill="url(#wc${id})"/>
  <path d="M14 72 q8 -4 16 0 M132 80 q8 -4 16 0 M24 92 q7 -3 14 0" stroke="#5a9ab8" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".6"/>
  <path d="M22 60 Q24 84 80 88 Q136 84 138 60 Z" fill="${rock}" stroke="#4a2a12" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M40 76 l6 8 M62 82 l3 6 M100 82 l-2 6 M120 76 l-5 7" stroke="#4a2a12" stroke-width="1.4" opacity=".5"/>
  <ellipse cx="80" cy="58" rx="58" ry="24" fill="${top}" stroke="#4a2a12" stroke-width="2.6"/>`;
function isleSvg(ready, key) {
  if (!ready) {
    return `<svg viewBox="8 6 144 92">${ISLE_BASE('#c9bfa8', '#9a8a78', 'x')}<text x="80" y="64" text-anchor="middle" font-size="24" font-family="Dela Gothic One" fill="#8a7a6a">?</text></svg>`;
  }
  // どんぐり遊園地: 観覧車・ジェットコースター・テント・風船
  if (key === 'yuen') {
    const gond = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = (k / 8) * Math.PI * 2; return `<rect x="${48 + Math.cos(a) * 17 - 3}" y="${30 + Math.sin(a) * 17}" width="6" height="5" rx="1.5" fill="${['#ff6a8a', '#ffd23c', '#5cc0ff', '#7ad35a'][k % 4]}" stroke="#4a2a12" stroke-width=".8"/>`; }).join('');
    return `<svg viewBox="8 6 144 92">${ISLE_BASE('#9ad87a', '#8a6a50', 'y')}
      <ellipse cx="80" cy="58" rx="40" ry="15" fill="none" stroke="#fff6e0" stroke-width="2.4" stroke-dasharray="3 4"/>
      <path d="M38 56 L48 32 L58 56" stroke="#4a2a12" stroke-width="2" fill="none"/>
      <circle cx="48" cy="32" r="17" fill="none" stroke="#ff7aa8" stroke-width="2.6"/>
      <path d="M48 15 V49 M31 32 H65 M36 20 L60 44 M60 20 L36 44" stroke="#ff7aa8" stroke-width="1.1"/>${gond}
      <circle cx="48" cy="32" r="2.6" fill="#ffd23c" stroke="#4a2a12" stroke-width="1"/>
      <path d="M86 58 C88 40 96 36 100 46 C104 56 112 30 120 34 C126 37 124 50 132 54" stroke="#e8402f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M90 58 v-6 M100 58 v-10 M110 58 v-12 M120 58 v-16 M128 58 v-6" stroke="#8a5a32" stroke-width="1.2"/>
      <path d="M100 63 L112 46 L124 63 Z" fill="#fff6e0" stroke="#4a2a12" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M104 63 L112 46 L108 63 Z M116 63 L112 46 L120 63 Z" fill="#e8402f"/>
      <path d="M112 46 v-6" stroke="#4a2a12" stroke-width="1.4"/><path d="M112 40 l6 2 l-6 2 z" fill="#ffd23c" stroke="#4a2a12" stroke-width=".8"/>
      <g stroke="#4a2a12" stroke-width=".8"><path d="M70 44 q-1 8 2 14" fill="none"/><path d="M76 40 q2 9 -1 18" fill="none"/>
      <ellipse cx="70" cy="40" rx="4" ry="5" fill="#5cc0ff"/><ellipse cx="76" cy="36" rx="4" ry="5" fill="#ffd23c"/></g>
    </svg>`;
  }
  // 海の中の 探検: 水の 中の 島(サンゴ・海藻・沈没船・クジラの しお・あわ)
  if (key === 'umi') {
    return `<svg viewBox="8 6 144 92">
      <defs><linearGradient id="seaTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe0f0"/><stop offset="1" stop-color="#4fb0d8"/></linearGradient></defs>
      ${ISLE_BASE('url(#seaTop)', '#2a5a8a', 'u')}
      <path d="M36 58 q6 -3 12 0 t12 0 M98 66 q6 -3 12 0 t12 0 M66 70 q5 -3 10 0" stroke="#e8fbff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>
      <ellipse cx="80" cy="58" rx="40" ry="15" fill="none" stroke="#fff6e0" stroke-width="2.4" stroke-dasharray="3 4"/>
      <path d="M40 62 q-4 -10 0 -18 M40 52 q5 -5 9 -5 M36 56 q-6 -3 -7 -9 M44 60 q3 -6 8 -7" stroke="#ff7aa8" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M56 64 q-3 -8 1 -14 q-3 -6 1 -12 M61 64 q3 -7 -1 -13 q3 -6 -1 -11" stroke="#4f9a3a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <g transform="translate(108 52) rotate(14)"><path d="M-14 0 h28 l-5 7 h-18 z" fill="#8a5a32" stroke="#4a2a12" stroke-width="1.4" stroke-linejoin="round"/><path d="M0 0 v-15" stroke="#4a2a12" stroke-width="1.4"/><path d="M1 -14 l8 4 l-8 3 z" fill="#e8dcc0" stroke="#4a2a12" stroke-width=".8"/></g>
      <ellipse cx="86" cy="36" rx="18" ry="9" fill="#4a7ac8" stroke="#1a3050" stroke-width="1.8"/>
      <path d="M86 40 q10 4 18 -1" fill="#e8f2ff" stroke="none"/>
      <path d="M68 36 l-9 -7 l1 14 z" fill="#4a7ac8" stroke="#1a3050" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="97" cy="34" r="1.8" fill="#1a3050"/><path d="M92 39 q4 2 7 0" stroke="#1a3050" stroke-width="1" fill="none"/>
      <path d="M88 27 q0 -7 -3 -10 M88 27 q2 -8 6 -10 M88 27 q-4 -5 -9 -5" stroke="#bff0ff" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <g fill="#eafcff" stroke="#5a9ab8" stroke-width=".8"><circle cx="126" cy="44" r="2.4"/><circle cx="130" cy="36" r="1.8"/><circle cx="125" cy="29" r="1.3"/><circle cx="32" cy="40" r="1.6"/></g>
    </svg>`;
  }
  // 四季の森: 島を 4つに 分けて、春(桃)・夏(緑)・秋(橙)・冬(白)。それぞれの 木と、まん中に 大木
  return `<svg viewBox="8 6 144 92">
    <defs><clipPath id="isleClip"><ellipse cx="80" cy="58" rx="58" ry="24"/></clipPath></defs>
    ${ISLE_BASE('#9ad87a', '#8a6a50', 's')}
    <g clip-path="url(#isleClip)">
      <rect x="0" y="0" width="80" height="58" fill="#ffc8da"/><rect x="80" y="0" width="80" height="58" fill="#8fd060"/>
      <rect x="80" y="58" width="80" height="40" fill="#f0a24a"/><rect x="0" y="58" width="80" height="40" fill="#f4f8ff"/>
    </g>
    <ellipse cx="80" cy="58" rx="58" ry="24" fill="none" stroke="#4a2a12" stroke-width="2.6"/>
    <ellipse cx="80" cy="58" rx="40" ry="15" fill="none" stroke="#fff6e0" stroke-width="2.4" stroke-dasharray="3 4"/>
    <ellipse cx="46" cy="52" rx="7" ry="3" fill="#7ec8e3" stroke="#4a2a12" stroke-width="1"/>
    <g stroke="#4a2a12" stroke-width="1.2">
      <path d="M38 50 v-6" /><circle cx="38" cy="40" r="6" fill="#ff9ac0"/>
      <path d="M122 50 v-6"/><circle cx="122" cy="40" r="6.5" fill="#4f9a3c"/>
      <path d="M118 72 v-6"/><circle cx="118" cy="62" r="6" fill="#e8642c"/>
      <path d="M42 74 v-4"/><path d="M42 58 l-6 12 h12 z" fill="#2f6a4a"/><path d="M42 58 l-3 6 h6 z" fill="#fff"/>
    </g>
    <rect x="77" y="40" width="6" height="14" fill="#6b4c36" stroke="#4a2a12" stroke-width="1.2"/>
    <circle cx="80" cy="34" r="11" fill="#4f9a3c" stroke="#2f6b25" stroke-width="2"/>
    <circle cx="76" cy="31" r="1.6" fill="#c8843f"/><circle cx="84" cy="36" r="1.6" fill="#c8843f"/>
  </svg>`;
}
// つづきから: 保存しておいた 大会(board/save.js)が あれば、ステージの 地図の 上に 出す
function renderResume() {
  const d = loadTaikai();
  $('resumeBox').hidden = !d;
  if (!d) return;
  const stg = STAGE_LIST.find((x) => x.key === d.s.stage);
  const me = d.s.players[0];
  const turn = Math.min(d.s.turn, d.s.turns);
  $('resumeInfo').textContent = `${stg?.name || ''}・${turn}/${d.s.turns}ターン・メダル ${me.medals}・どんぐり ${me.acorns}`;
  ensureFaces();
  const face = faces?.[d.picked];
  $('resumeFace').innerHTML = face ? `<img src="${face}" alt="">` : '';
}
$('resumeBtn').addEventListener('click', () => {
  const d = loadTaikai();
  if (!d) { renderResume(); return; }
  unlockAudio();
  knock();
  current = 'taikai';
  taikai.resume = true;
  taikai.stage = d.s.stage;
  taikai.turns = d.s.turns;
  enterGame();
});
// けすのは 2回 おしたとき(まちがえて けさないように)
$('resumeDel').addEventListener('click', () => {
  const b = $('resumeDel');
  if (!b.classList.contains('sure')) {
    b.classList.add('sure');
    b.textContent = 'もう一度 おすと けします';
    setTimeout(() => { b.classList.remove('sure'); b.textContent = 'この大会を けす'; }, 3000);
    boop();
    return;
  }
  clearTaikai();
  knock();
  b.classList.remove('sure');
  b.textContent = 'この大会を けす';
  renderResume();
});
// ── 宝の地図の 紙(巻物)。実際の 大きさ(px)で SVG に 描く(ノイズの 模様が のびない ように)──
// 上下に 木の 軸と 巻いた 紙の まるみ。紙は 羊皮紙: 繊維の ざらつき・まだらな しみ・ちぎれた ふち・こげた 縁どり。
// 方位じしん から 放射の 航海線、折り目、コーヒーの 輪じみ、インクの はね、題字の リボン、縮尺、ろうの 封印
function paperSvg(W, H) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const R = 17; // 軸の 太さ
  const top = R + 8, bot = H - R - 8; // 紙の 上下(巻きの 下)
  const L = 10, Rr = W - 10;
  // ちぎれた 左右の ふち(ぎざぎざ)
  const edge = (x0, dir) => {
    const pts = [];
    for (let y = top; y <= bot; y += 7) pts.push([x0 + dir * (rnd() * 3.2 + (rnd() < 0.08 ? 3 : 0)), y]);
    return pts;
  };
  const le = edge(L, 1), re = edge(Rr, -1);
  const paper = `M${le[0][0]} ${top} L${re[0][0]} ${top} ${re.map(([x, y]) => `L${x.toFixed(1)} ${y}`).join(' ')} L${re.at(-1)[0]} ${bot} L${le.at(-1)[0]} ${bot} ${[...le].reverse().map(([x, y]) => `L${x.toFixed(1)} ${y}`).join(' ')} Z`;
  // 方位じしん(右、2つめの 島の 上)と 航海線
  const cx = W * 0.86, cy = top + (bot - top) * 0.33;
  const rays = Array.from({ length: 16 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2, len = Math.hypot(W, H);
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * len).toFixed(1)}" y2="${(cy + Math.sin(a) * len).toFixed(1)}" stroke="${k % 2 ? '#a07040' : '#7a4a24'}" stroke-width="${k % 4 ? 0.5 : 0.8}" ${k % 2 ? 'stroke-dasharray="3 4"' : ''}/>`;
  }).join('');
  const star = (r1, r2, n, rot = 0) => Array.from({ length: n * 2 }, (_, k) => { const a = rot + (k / (n * 2)) * Math.PI * 2 - Math.PI / 2; const r = k % 2 ? r2 : r1; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }).join(' ');
  const compass = `<g transform="translate(${cx} ${cy}) rotate(-8)">
    <circle r="30" fill="#f6e6bc" fill-opacity=".85" stroke="#7a4a24" stroke-width="1.8"/><circle r="26" fill="none" stroke="#7a4a24" stroke-width=".6"/>
    ${Array.from({ length: 32 }, (_, k) => { const a = (k / 32) * Math.PI * 2; return `<line x1="${(Math.cos(a) * 26).toFixed(1)}" y1="${(Math.sin(a) * 26).toFixed(1)}" x2="${(Math.cos(a) * (k % 4 ? 28 : 30)).toFixed(1)}" y2="${(Math.sin(a) * (k % 4 ? 28 : 30)).toFixed(1)}" stroke="#7a4a24" stroke-width=".6"/>`; }).join('')}
    <polygon points="${star(24, 5, 4, Math.PI / 4)}" fill="#e3c486" stroke="#7a4a24" stroke-width=".8"/>
    <polygon points="${star(27, 6, 4)}" fill="#c8a06a" stroke="#7a4a24" stroke-width="1"/>
    <path d="M0 -27 L6 -6 L0 0 Z M27 0 L6 6 L0 0 Z M0 27 L-6 6 L0 0 Z M-27 0 L-6 -6 L0 0 Z" fill="#7a4a24"/>
    <path d="M0 -27 L6 -6 L-6 -6 Z" fill="#c83a24" stroke="#7a4a24" stroke-width=".6"/>
    <circle r="3.2" fill="#ffd24a" stroke="#7a4a24" stroke-width=".8"/>
    <text y="-33" text-anchor="middle" font-size="9" font-family="Dela Gothic One" fill="#7a4a24">N</text>
  </g>`;
  // インクの はね
  const blots = Array.from({ length: 9 }, () => {
    const x = L + 20 + rnd() * (W - 60), y = top + 30 + rnd() * (bot - top - 60), r = 0.8 + rnd() * 2.2;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#4a2a12" opacity="${(0.15 + rnd() * 0.25).toFixed(2)}"/>`;
  }).join('');
  const ph = bot - top;
  // 軸(木)と 巻いた 紙の まるみ
  const rod = (y, flip) => `
    <rect x="8" y="${y - 7}" width="${W - 16}" height="14" rx="7" fill="url(#curl)" stroke="#9a7040" stroke-width=".8" transform="${flip ? `scale(1 -1) translate(0 ${-2 * y})` : ''}"/>
    <rect x="6" y="${y - R / 2 + (flip ? 6 : -6)}" width="${W - 12}" height="${R}" rx="${R / 2}" fill="url(#wood)" stroke="#3a1e08" stroke-width="1.6"/>
    <path d="M14 ${y + (flip ? 6 : -6) - 2} H${W - 14}" stroke="rgba(255,220,160,.45)" stroke-width="2" stroke-linecap="round"/>
    ${[R / 2 + 2, W - R / 2 - 2].map((x) => `<circle cx="${x}" cy="${y + (flip ? 6 : -6)}" r="${R / 2 + 3}" fill="url(#knob)" stroke="#3a1e08" stroke-width="1.6"/><circle cx="${x}" cy="${y + (flip ? 6 : -6)}" r="3" fill="#ffd24a" stroke="#3a1e08" stroke-width="1"/>`).join('')}`;
  const defs = `<defs>
    <radialGradient id="pBase" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff3d2"/><stop offset=".45" stop-color="#f4dfae"/><stop offset=".8" stop-color="#e4c286"/><stop offset="1" stop-color="#cfa060"/></radialGradient>
    <filter id="pStain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="4"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .34  0 0 0 0 .12  0 0 0 -2.6 1.75"/></filter>
    <filter id="pGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .2  0 0 0 0 .08  0 0 0 -1.6 1.05"/></filter>
    <filter id="pFiber" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.45" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .85  0 0 0 -2 1.2"/></filter>
    <filter id="pRough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter>
    <filter id="pBurn" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="14" result="d"/><feGaussianBlur in="d" stdDeviation="4"/></filter>
    <filter id="pRing" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter>
    <clipPath id="pClip"><path d="${paper}"/></clipPath>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b07a42"/><stop offset=".35" stop-color="#8a5428"/><stop offset=".7" stop-color="#5e3414"/><stop offset="1" stop-color="#3e2008"/></linearGradient>
    <radialGradient id="knob" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#c88a4a"/><stop offset="1" stop-color="#4a2a0e"/></radialGradient>
    <linearGradient id="curl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c89a5a"/><stop offset=".5" stop-color="#f6e2b4"/><stop offset="1" stop-color="#b0824a"/></linearGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d84a32"/><stop offset="1" stop-color="#9a2a1a"/></linearGradient>
    <radialGradient id="wax" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#e8503a"/><stop offset=".7" stop-color="#a82418"/><stop offset="1" stop-color="#6a1208"/></radialGradient>
  </defs>`;
  const svg = (cls, body) => `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${defs}${body}</svg>`;
  // 紙そのもの(ノイズの フィルターが 重いので、一度だけ 絵に 焼きつける)
  const bg = svg('paperbg', `
  <g filter="url(#pRough)"><path d="${paper}" fill="url(#pBase)"/></g>
  <g clip-path="url(#pClip)">
    <rect x="0" y="0" width="${W}" height="${H}" filter="url(#pStain)" opacity=".42"/>
    <rect x="0" y="0" width="${W}" height="${H}" filter="url(#pFiber)" opacity=".35"/>
    <rect x="0" y="0" width="${W}" height="${H}" filter="url(#pGrain)" opacity=".38"/>
    <g opacity=".22">${rays}</g>
    <g stroke="#8a5a2a" stroke-width=".6" stroke-dasharray="1.5 3" opacity=".35"><line x1="0" y1="${top + ph * 0.25}" x2="${W}" y2="${top + ph * 0.25}"/><line x1="0" y1="${top + ph * 0.75}" x2="${W}" y2="${top + ph * 0.75}"/><line x1="${W * 0.25}" y1="0" x2="${W * 0.25}" y2="${H}"/><line x1="${W * 0.75}" y1="0" x2="${W * 0.75}" y2="${H}"/></g>
    <g opacity=".5"><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="#8a5a2a" stroke-width="1.2" opacity=".35"/><line x1="${W / 2 + 1.5}" y1="0" x2="${W / 2 + 1.5}" y2="${H}" stroke="#fff8e0" stroke-width="1.6" opacity=".6"/>
      ${[1, 2].map((k) => `<line x1="0" y1="${top + (ph * k) / 3}" x2="${W}" y2="${top + (ph * k) / 3}" stroke="#8a5a2a" stroke-width="1.2" opacity=".3"/><line x1="0" y1="${top + (ph * k) / 3 + 1.5}" x2="${W}" y2="${top + (ph * k) / 3 + 1.5}" stroke="#fff8e0" stroke-width="1.6" opacity=".55"/>`).join('')}</g>
    <ellipse cx="${W * 0.2}" cy="${top + ph * 0.83}" rx="30" ry="28" fill="none" stroke="#7a4218" stroke-width="5" opacity=".14" filter="url(#pRing)"/>
    <ellipse cx="${W * 0.2}" cy="${top + ph * 0.83}" rx="27" ry="25" fill="none" stroke="#7a4218" stroke-width="1.4" opacity=".18" filter="url(#pRing)"/>
    ${blots}
    <path d="${paper}" fill="none" stroke="#5a2e0c" stroke-width="26" opacity=".55" filter="url(#pBurn)"/>
    <path d="${paper}" fill="none" stroke="#2e1606" stroke-width="5" opacity=".6" filter="url(#pBurn)"/>
  </g>`);
  // 焼きあがるまでの 下じき(フィルターなしの 紙の 形)
  const plain = svg('paperplain', `<path d="${paper}" fill="url(#pBase)"/>`);
  // 上に のる もの(文字は 焼きつけると フォントが 使えないので、ふつうの SVG のまま)
  const fg = svg('paper', `
  ${compass}
  <g transform="translate(${L + 18} ${bot - 16})" font-family="Dela Gothic One" fill="#7a4a24">
    <path d="M0 0 h72" stroke="#7a4a24" stroke-width="1.4"/>${[0, 24, 48, 72].map((x, i) => `<path d="M${x} -4 v8" stroke="#7a4a24" stroke-width="1.2"/>${i < 3 ? `<rect x="${x}" y="-2" width="24" height="4" fill="${i % 2 ? '#f6e6bc' : '#7a4a24'}" stroke="#7a4a24" stroke-width=".8"/>` : ''}`).join('')}
    <text x="0" y="-7" font-size="7">0</text><text x="72" y="-7" font-size="7" text-anchor="middle">300 歩</text>
  </g>
  <g transform="translate(${W / 2} ${top + 4})">
    <path d="M-92 4 l-14 8 l14 8 Z M92 4 l14 8 l-14 8 Z" fill="#8a2416" stroke="#4a1006" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M-84 -2 Q0 8 84 -2 L84 20 Q0 30 -84 20 Z" fill="url(#ribbon)" stroke="#4a1006" stroke-width="1.4"/>
    <text y="14.5" text-anchor="middle" font-size="12.5" font-family="Dela Gothic One" fill="#fff3d2" stroke="#4a1006" stroke-width="2.4" paint-order="stroke">どんぐり諸島 宝の地図</text>
  </g>
  <g transform="translate(${W - 30} ${bot - 26}) rotate(-14)">
    <path d="M0 -21 C9 -22 20 -14 21 -4 C24 6 16 19 4 21 C-8 24 -20 15 -21 3 C-23 -9 -12 -21 0 -21 Z" fill="url(#wax)" stroke="#5a0e06" stroke-width="1.2"/>
    <circle r="13.5" fill="none" stroke="#5a0e06" stroke-width="1.2" opacity=".6"/>
    <path d="M-6 -1 Q-6 10 0 12 Q6 10 6 -1 Z" fill="#c8402a" stroke="#5a0e06" stroke-width="1.1"/>
    <path d="M-8 -1 Q0 -9 8 -1 Z" fill="#8a1a0e" stroke="#5a0e06" stroke-width="1.1"/><path d="M0 -6 v-4" stroke="#5a0e06" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M-12 -12 q4 -3 8 -2" stroke="rgba(255,200,180,.6)" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
  ${rod(top, false)}
  ${rod(bot, true)}`);
  return { bg, plain, fg };
}
// 地図の 紙を かく。ノイズの フィルターは 毎フレーム 描きなおすと 重い(画面の 切りかえや 旗の ゆれが カクつく)ので、
// 紙そのものは 一度だけ canvas に 焼きつけて、大きさが 変わるまで つかいまわす
let paperCache = null; // { key, canvas }
function drawPaper() {
  const book = document.querySelector('#stages .mapbook');
  if (!book || !book.clientWidth) return;
  const W = book.clientWidth, H = book.clientHeight, key = `${W}x${H}`;
  let wrap = book.querySelector('.paperwrap');
  if (wrap?.dataset.key === key) return;
  wrap?.remove();
  wrap = document.createElement('div');
  wrap.className = 'paperwrap';
  wrap.dataset.key = key;
  const { bg, plain, fg } = paperSvg(W, H);
  if (paperCache?.key === key) wrap.append(paperCache.canvas);
  else {
    wrap.insertAdjacentHTML('beforeend', plain);
    // 焼くのは 画面の 切りかえ(0.35 びょう)が おわってから。そのあいだは 下じきで 見せる
    const dpr = Math.min(2, devicePixelRatio || 1);
    const big = bg.replace(`width="${W}" height="${H}"`, `width="${Math.round(W * dpr)}" height="${Math.round(H * dpr)}"`);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([big], { type: 'image/svg+xml' }));
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.className = 'paperbg';
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      paperCache = { key, canvas: c };
      if (!wrap.isConnected) return;
      c.classList.add('fresh');
      wrap.prepend(c);
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('fresh')));
      setTimeout(() => wrap.querySelector('.paperplain')?.remove(), 500);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    setTimeout(() => { img.src = url; }, 400);
  }
  wrap.insertAdjacentHTML('beforeend', fg);
  book.prepend(wrap);
}
addEventListener('resize', () => { if (screen === 'stages') drawPaper(); });

// 宝の地図: 島を 上から 順に 大きく ならべて、点線の 航路で つなぐ。島は 左、説明は 右(どの 島も おなじ 形)。
// 島を タップすると 旗が 立って えらばれる。下の「この 島へ!」で 進む
// 羽ペン: ペン先が 左下(0, 40)。
const QUILL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M3 37 L9 27" stroke="#2b1a0e" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M8 29 C11 18 20 8 36 2 C33 9 30 13 25 16 C29 16 31 15 33 14 C28 22 20 27 10 29 Z" fill="#fbf3df" stroke="#4a2a12" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M9 28 C16 20 24 12 34 4" stroke="#b38a5a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <path d="M15 22 l3 2 M19 18 l3 2 M23 14 l3 2" stroke="#d9c6a0" stroke-width="1" stroke-linecap="round"/>
</svg>`;

// 航路を インクで なぞる。from 番目の 島から to 番目の 島まで。着いたら done()。
// 前に なぞった インクは うすく なって 消える。横持ち(航路が 出ない)や 動きを へらす 設定では すぐ done()。
function inkTrace(ink, to, done) {
  const from = ink.at;
  ink.at = to;
  cancelAnimationFrame(ink.raf);
  ink.quill.classList.remove('writing');
  for (const old of ink.route.querySelectorAll('.ink:not(.fade)')) {
    old.classList.add('fade');
    setTimeout(() => old.remove(), 700);
  }
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || getComputedStyle(ink.route).display === 'none';
  if (from < 0 || from === to || still) { done(); return; }
  // 航路の 上の 点を こまかく とって おき、なぞった ところまでを 折れ線で かく
  // (航路の svg は 縦横で のびかたが ちがうので、点線の しくみ(dasharray)だと 途切れて 見える)
  if (!ink.pts) {
    const probe = ink.route.querySelector('path');
    const total = probe.getTotalLength();
    ink.pts = Array.from({ length: 241 }, (_, j) => { const p = probe.getPointAtLength((j / 240) * total); return [p.x, p.y]; });
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'ink');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  ink.route.append(path);
  // 島と 島の あいだの カーブは みな 同じ 形(左右 反転)なので、i 番目の 島は 長さの i/(n-1)
  const last = ink.pts.length - 1;
  // 島の 中心から 中心まで(島の 絵の うしろを 通るので、点線を のこさず ぜんぶ なぞる)
  const seg = last / (ink.n - 1);
  const a = from * seg, b = to * seg;
  const at = (u) => { const j = Math.min(last - 1, Math.floor(u)), f = u - j, p = ink.pts[j], q = ink.pts[j + 1]; return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; };
  const dur = 380 + Math.abs(to - from) * 420;
  const t0 = performance.now();
  ink.quill.classList.add('writing');
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const tip = a + (b - a) * e;
    const dir = b > a ? 1 : -1;
    const line = [at(a)];
    for (let j = dir > 0 ? Math.floor(a) + 1 : Math.ceil(a) - 1; dir > 0 ? j < tip : j > tip; j += dir) line.push(ink.pts[j]);
    const p = at(tip);
    line.push(p);
    path.setAttribute('d', 'M' + line.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L'));
    const r = ink.route.getBoundingClientRect();
    ink.quill.style.left = `${(p[0] / 100) * r.width}px`;
    ink.quill.style.top = `${(p[1] / 100) * r.height}px`;
    if (k < 1) { ink.raf = requestAnimationFrame(step); return; }
    ink.quill.classList.remove('writing');
    done();
  };
  ink.raf = requestAnimationFrame(step);
}

function renderStageMap() {
  const page = $('stageMap');
  page.replaceChildren();
  if (!STAGE_LIST.some((s) => s.key === taikai.stage && s.ready)) taikai.stage = STAGE_LIST.find((s) => s.ready).key;
  const n = STAGE_LIST.length;
  // 航路(島の 中心を 左右 互いちがいに 通る、ゆるい カーブ)
  const route = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  route.setAttribute('class', 'route');
  route.setAttribute('viewBox', '0 0 100 100');
  route.setAttribute('preserveAspectRatio', 'none');
  const pts = STAGE_LIST.map((_, i) => [i % 2 ? 36 : 24, ((i + 0.5) / n) * 100]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    d += ` C${x0} ${(y0 + y1) / 2} ${x1} ${(y0 + y1) / 2} ${x1} ${y1}`;
  }
  route.innerHTML = `<path d="${d}" fill="none" stroke="#a0703a" stroke-width="1.1" stroke-dasharray="2.2 2.2" vector-effect="non-scaling-stroke" style="stroke-width:3px"/>`;
  page.append(route);
  // 羽ペン(島を えらぶと、航路を インクで なぞって いく)
  const quill = document.createElement('span');
  quill.className = 'quill';
  quill.innerHTML = QUILL_SVG;
  page.append(quill);
  const ink = { route, quill, d, n, raf: 0, at: STAGE_LIST.findIndex((s) => s.key === taikai.stage) };
  page._ink = ink;
  STAGE_LIST.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'isle' + (i % 2 ? ' shift' : '') + (s.ready ? '' : ' soon') + (s.key === taikai.stage ? ' on' : '');
    b.style.setProperty('--i', String(i));
    b.innerHTML = `<span class="pic">${isleSvg(s.ready, s.key)}<svg class="flag" viewBox="0 0 30 40" aria-hidden="true"><path d="M5 38 L5 4" stroke="#4a2a12" stroke-width="3" stroke-linecap="round"/><path d="M6 5 L27 11 L6 18 Z" fill="#e8402f" stroke="#4a2a12" stroke-width="2" stroke-linejoin="round"/></svg></span>
      <span class="txt"><b>${s.name}</b><small>${s.desc}</small><span class="tags">${(s.tags || []).map((t) => `<i>${t}</i>`).join('')}</span></span>`;
    b.addEventListener('click', () => {
      unlockAudio();
      if (!s.ready) { boop(); toast('このステージは もうすこし まっててね!'); return; }
      knock();
      if (taikai.stage === s.key) return;
      taikai.stage = s.key;
      inkTrace(page._ink, i, () => {
        for (const o of page.querySelectorAll('.isle')) o.classList.toggle('on', o === b);
      });
      $('stageGo').querySelector('b').textContent = `${s.name}へ!`;
    });
    page.append(b);
  });
  $('stageGo').querySelector('b').textContent = `${STAGE_LIST.find((x) => x.key === taikai.stage).name}へ!`;
}
$('stageGo').addEventListener('click', () => { unlockAudio(); knock(); openGame('taikai'); });
function renderTurns() {
  for (const b of $('turnSeg').children) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === taikai.turns));
}
$('turnSeg').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  knock();
  taikai.turns = Number(v);
  renderTurns();
});

// せってい
function renderSettings() {
  for (const b of $('optSound').children) b.setAttribute('aria-pressed', String((b.dataset.v === 'on') === settings.sound));
  for (const b of $('optBgm').children) b.setAttribute('aria-pressed', String(b.dataset.v === settings.bgm));
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
$('optBgm').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  settings.bgm = v;
  saveSettings(settings);
  music.setVolume(v);
  unlockAudio();
  knock();
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
    playing.frame(rawDt);
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
// #menu: メニューから / #daruma・#catch: その競技の入口から / #zukan: 図鑑から
const hash = location.hash.slice(1);
if (hash === 'zukan') {
  ensureFaces();
  go('zukan');
} else if (GAMES[hash]) {
  openGame(hash);
} else {
  go(location.hash === '#menu' ? 'menu' : 'title');
}
frame();

// E2E 用の口
window.title = {
  camera, scene, go,
  get screen() { return screen; },
  get bgm() { return music.playing; },
  online: () => online,
  get active() { return active; },
  get busy() { return busy; },
  setTime: (k) => atmosphere.apply(k),
  redrop: () => { signDrop = 0; },
  pick: (key) => { picked = key; renderChars(); },
  start: () => enterGame(),
  ready: () => ensureGame(current),
  open: (key) => openGame(key),
  // 大会から競技を呼ぶ口(E2E で単体でためす用)
  playMinigame: (key, lineup, character) => playMinigame(key, lineup, character),
  zukan,
};
