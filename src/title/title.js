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
import { ROLES, buildIsland, islandHeight } from './island.js';
import { buildSign, drawSign } from './sign.js';
import { woodPlank } from './wood.js';
import { createLeafCurtain } from './leaves.js';
import { makePortraits } from './portraits.js';
import { createZukan } from './zukan.js';
import { LIST as STAGE_LIST } from '../board/stages/index.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const settings = loadSettings();

// PWA: オフラインでも遊べるように、配信するファイルを手元にしまっておく(sw.js)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

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
  if (next === 'stages') { renderStageMap(); renderResume(); }
  if (next === 'menu') $('resumeBadge').hidden = !loadTaikai();
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
      'ボールの <b>かげ</b>の ところへ 走って <b>「うつ」</b>。とどく ところに 来ると 自動で うちかえす。',
      'チームで <b>3回まで</b>。レシーブ → トス → アタック。<b>ネットの 前</b>で うつと <b>スパイク!</b>',
      'ときどき <b>海風</b>が ふいて ボールが ながされる。先に <b>5点</b> とった チームの 勝ち!',
    ],
    load: () => import('../games/volley/game.js').then((m) => m.createVolley),
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
      getAudio: () => { unlockAudio(); return audio; },
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
  await playing.enter(picked, current === 'taikai' ? { fromSky: true, turns: taikai.turns, stage: taikai.stage, resume } : undefined);
  taikaiBoard = current === 'taikai' ? playing : null;
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
  playing.exit();
  if (taikaiBoard && taikaiBoard !== playing) taikaiBoard.exit(); // 大会の競技のとちゅうでやめたら、大会もおわり
  const wasTaikai = !!taikaiBoard;
  taikaiBoard = null;
  // 大会から もどったら、大会の 盤と 競技を 片づける
  if (wasTaikai) for (const k of Object.keys(built)) releaseGame(k);
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
  whoosh(0.8, false);
  await curtain.reveal();
  busy = false;
  const res = await done;
  busy = true;
  whoosh(0.9, true);
  await curtain.cover();
  g.exit();
  playing = home;
  releaseGame(key); // 大会の 競技は 遊びおわったら すぐ 片づける
  home.resume?.();
  await curtain.reveal();
  busy = false;
  return res;
}

// ── 大会: ステージ選択(地図の本) ────────────────────────
// 地図の紙に、ステージの島をえがく。遊べる島はタップできる。じゅんびちゅうの島は霧の中
const ISLE_SPOTS = [[30, 30], [72, 52], [34, 78]]; // 地図の上の位置(%)
function isleSvg(ready) {
  if (!ready) {
    return `<svg viewBox="0 0 120 80"><ellipse cx="60" cy="46" rx="44" ry="22" fill="#c9bfa8" stroke="#8a7a6a" stroke-width="3"/>
      <g fill="#fffaf0" opacity=".92"><ellipse cx="44" cy="40" rx="26" ry="13"/><ellipse cx="72" cy="36" rx="24" ry="12"/><ellipse cx="60" cy="50" rx="34" ry="12"/></g>
      <text x="60" y="47" text-anchor="middle" font-size="22" font-family="Dela Gothic One" fill="#8a7a6a">?</text></svg>`;
  }
  // 四季の森: 島を4つに分けて、春(桃)・夏(緑)・秋(橙)・冬(白)。まん中に大木
  return `<svg viewBox="0 0 120 80">
    <ellipse cx="60" cy="50" rx="46" ry="22" fill="#8a6a50" stroke="#4a2a12" stroke-width="3"/>
    <clipPath id="isleClip"><ellipse cx="60" cy="44" rx="46" ry="22"/></clipPath>
    <g clip-path="url(#isleClip)">
      <rect x="0" y="0" width="60" height="44" fill="#ffc3d6"/><rect x="60" y="0" width="60" height="44" fill="#8fd060"/>
      <rect x="60" y="44" width="60" height="40" fill="#f0a24a"/><rect x="0" y="44" width="60" height="40" fill="#f4f8ff"/>
    </g>
    <ellipse cx="60" cy="44" rx="46" ry="22" fill="none" stroke="#4a2a12" stroke-width="3"/>
    <ellipse cx="60" cy="44" rx="30" ry="13" fill="none" stroke="#fff6e0" stroke-width="3" stroke-dasharray="3 4"/>
    <rect x="57" y="30" width="6" height="12" fill="#6b4c36"/><circle cx="60" cy="28" r="10" fill="#4f9a3c" stroke="#2f6b25" stroke-width="2"/>
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
function renderStageMap() {
  const page = $('stageMap');
  page.replaceChildren();
  // 島と島をむすぶ、点線の航路
  const sea = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sea.setAttribute('class', 'sea');
  sea.setAttribute('viewBox', '0 0 100 100');
  sea.setAttribute('preserveAspectRatio', 'none');
  sea.innerHTML = `<path d="M${ISLE_SPOTS.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="#a07a4a" stroke-width=".8" stroke-dasharray="2 2"/>`;
  page.append(sea);
  STAGE_LIST.forEach((s, i) => {
    const [x, y] = ISLE_SPOTS[i % ISLE_SPOTS.length];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'isle' + (s.ready ? '' : ' soon');
    b.style.left = `${x}%`;
    b.style.top = `${y}%`;
    b.innerHTML = `${isleSvg(s.ready)}<b>${s.name}</b><small>${s.desc}</small>`;
    b.addEventListener('click', () => {
      unlockAudio();
      if (!s.ready) { boop(); toast('このステージは もうすこし まっててね!'); return; }
      knock();
      taikai.stage = s.key;
      openGame('taikai');
    });
    page.append(b);
  });
}
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
