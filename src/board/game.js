// 大会(すごろく)の画面。ルールは rules.js、CPU は cpu.js、盤の見た目は scene.js。
// ここは state を読んで見せるだけ(state を書くのは rules.act だけ)。
//
// 進め方: ルールが出したできごと(events)を、1つずつ順番に見せる(コマが1マスずつはねる、どんぐりの札が出る…)。
// 見せおわったら、s.pending を見て、人の番なら操作のボタンを出し、CPU の番なら少し待って CPU に操作させる。
// 競技・対決は、タイトルの playMinigame で競技の会場へ入れかえて遊ばせ、順位をもらってもどる。
// CPU どうしの対決は、画面なしで回して(simulate)すぐ決める。

import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../characters.js';
import { createModel, preload } from '../runtime/models.js';
import { nextRandom, seedFrom } from '../rng.js';
import { acornGeometry } from '../games/daruma/trees.js';
import { createAtmosphere } from '../games/daruma/atmosphere.js';
import { BONUSES, ITEMS, RULES, act, createTournament, currentSlot, ranking } from './rules.js';
import { PERSONALITIES, cpuAct, createCpu } from './cpu.js';
import { STAGES } from './stages/index.js';
import { buildBoardScene, podiumSpot } from './scene.js';
import { createEffects } from './effects.js';
import { simulate } from './simulate.js';
import { clearTaikai, saveTaikai } from './save.js';
import { replaceState } from '../net/drive.js';
import { track } from '../analytics.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const params = new URLSearchParams(location.search);
const GAME_NAMES = { daruma: 'だるまさんが ころんだ', catch: 'どんぐりキャッチ', sled: '落ち葉そりレース', mato: 'まつぼっくり的あて', tsumi: 'どんぐりつみ', ikada: 'いかだレース', hana: '花ぬり陣取り', hayauchi: 'どんぐり早うち', sumo: '切り株ずもう', kakure: 'おぼえて かくれんぼ', dasshutsu: 'どんぐりマンション だっしゅつ', tsuna: '川原の つなひき', nawa: 'お祭りの 大なわとび', kazan: '火山の 落ちものよけ', yuki: '雪山の 雪合戦', bumper: '遊園地の バンパーカー', kinoko: '森の湖の いろいろキノコ', ehon: '森の図書館の ぱらぱらブック', mame: '空まで まめのきジャンプ', volley: '夏の浜べの ビーチバレー', hikouki: '森の谷まの かみひこうき', ramune: '夏祭りの ラムネ しゅわしゅわ', wataame: '秋の森の わたあめ まき', keshigomu: '森の学校の けしごむ大戦', otoshi: 'お正月の だるまおとし', meiro: '森の いせきの どんぐり めいろ', bowl: '森の 倒れ木の どんぐりボウリング' };

export async function createBoard({ renderer, settings, getAudio, onExit, playMinigame }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  atmosphere.sun.target.position.set(0, 0, 0);
  let st = STAGES.shiki;
  let view = buildBoardScene(scene, st); // ステージが かわったら 組み立てなおす(startTournament)
  const fx = createEffects(scene);

  // ── 音(短いものだけ) ──────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function voice({ type = 'sine', pts, len, gain = 0.1, at = 0 }) {
    if (!audio) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(pts[0][1], t);
    for (const [dt, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t + dt);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  // 雑音(雨・風・葉っぱの音に使う)
  let noise = null;
  function hiss({ type = 'bandpass', f0, f1 = f0, q = 1, len, gain = 0.1, at = 0, attack = 0.01 }) {
    if (!audio) return;
    if (!noise) {
      noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = audio.currentTime + at;
    const src = audio.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = audio.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + len);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + len + 0.05);
  }
  const SEASON_STEP = { spring: 1, summer: 0.9, autumn: 0.8, winter: 1.2 }; // 季節で、歩く音の高さを少し変える
  const sfx = {
    // 一歩: ぴょこ(季節で音色が少しちがう。冬はさく、秋はかさっ)
    hop: (i, area) => {
      const k = SEASON_STEP[area] || 1;
      voice({ type: 'triangle', pts: [[0, (520 + (i % 5) * 40) * k], [0.08, (700 + (i % 5) * 40) * k]], len: 0.1, gain: 0.05 });
      if (area === 'autumn') hiss({ f0: 3000, len: 0.08, gain: 0.03 });
      if (area === 'winter') hiss({ type: 'highpass', f0: 4000, len: 0.06, gain: 0.025 });
    },
    tick: () => voice({ type: 'square', pts: [[0, 1400]], len: 0.03, gain: 0.02 }),
    // サイコロを割る: ぽかっ + ぱりん
    stop: () => {
      voice({ type: 'triangle', pts: [[0, 260], [0.06, 140]], len: 0.1, gain: 0.12 });
      hiss({ type: 'highpass', f0: 2500, len: 0.12, gain: 0.08, attack: 0.002 });
      voice({ type: 'triangle', pts: [[0, 880], [0.1, 1320]], len: 0.25, gain: 0.08, at: 0.05 });
    },
    gain: () => [1047, 1319].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.12, gain: 0.07, at: i * 0.06 })),
    lose: () => voice({ type: 'square', pts: [[0, 400], [0.25, 180]], len: 0.3, gain: 0.05 }),
    medal: () => [784, 988, 1175, 1568, 2093].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.3, gain: 0.09, at: i * 0.1 })),
    banner: () => voice({ type: 'sine', pts: [[0, 660], [0.12, 990]], len: 0.16, gain: 0.06 }),
    happen: () => [523, 466, 523, 698].forEach((f, i) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.04, at: i * 0.09 })),
    // 番のはじめ: ぽろん
    turn: () => [659, 880].forEach((f, i) => voice({ type: 'sine', pts: [[0, f]], len: 0.2, gain: 0.06, at: i * 0.08 })),
    // 先生: 羽ばたき(ばさっばさっ)とホーホー
    flap: () => { for (let i = 0; i < 4; i++) hiss({ type: 'lowpass', f0: 900, f1: 300, len: 0.14, gain: 0.07, at: i * 0.22 }); },
    owl: () => [[440, 0], [392, 0.32]].forEach(([f, at]) => voice({ type: 'sine', pts: [[0, f], [0.15, f * 0.92]], len: 0.28, gain: 0.07, at })),
    item: () => [1319, 1760, 2093].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.15, gain: 0.06, at: i * 0.05 })),
    slide: () => hiss({ f0: 600, f1: 2400, q: 1.5, len: 0.9, gain: 0.07, attack: 0.1 }),
    // ハプニングの音
    rain: () => hiss({ type: 'highpass', f0: 2500, len: 2.6, gain: 0.06, attack: 0.4 }),
    acornRain: () => { for (let i = 0; i < 14; i++) voice({ type: 'triangle', pts: [[0, 700 + Math.random() * 500], [0.04, 500]], len: 0.06, gain: 0.05, at: 0.4 + Math.random() * 1.4 }); },
    whirl: () => hiss({ f0: 300, f1: 1800, q: 2, len: 2.2, gain: 0.08, attack: 0.5 }),
    thunder: () => { hiss({ type: 'lowpass', f0: 900, f1: 120, len: 1.2, gain: 0.25, attack: 0.01 }); },
    bonk: () => { voice({ type: 'triangle', pts: [[0, 900], [0.15, 300]], len: 0.2, gain: 0.12 }); hiss({ type: 'lowpass', f0: 1200, len: 0.15, gain: 0.1, attack: 0.005 }); },
    splash: () => hiss({ type: 'lowpass', f0: 1800, f1: 300, len: 0.9, gain: 0.18, attack: 0.02 }),
    squash: () => voice({ type: 'square', pts: [[0, 300], [0.2, 90]], len: 0.25, gain: 0.05 }),
    snowball: () => { hiss({ type: 'lowpass', f0: 300, len: 2.6, gain: 0.1, attack: 0.3 }); voice({ type: 'sine', pts: [[0, 70], [2.4, 55]], len: 2.6, gain: 0.08 }); },
    duel: () => [392, 392, 523].forEach((f, i) => voice({ type: 'square', pts: [[0, f]], len: i === 2 ? 0.4 : 0.12, gain: 0.05, at: i * 0.16 })),
    // 表彰式: ドラムロールと、ファンファーレ
    roll: (sec) => { for (let i = 0; i < sec * 14; i++) hiss({ type: 'bandpass', f0: 180, q: 0.8, len: 0.05, gain: 0.05 + (i / (sec * 14)) * 0.05, at: i / 14 }); },
    fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: i === 5 ? 0.8 : 0.18, gain: 0.1, at: i * 0.15 })),
    cheer: () => { for (let i = 0; i < 5; i++) hiss({ f0: 700 + i * 180, f1: 900 + i * 150, q: 4, len: 1.6, gain: 0.05, at: i * 0.05, attack: 0.15 }); },
    // 遊園地: コースターの ごーっ / 観覧車の オルゴール / おばけの ひゅーどろ / 花火 / 風船
    coaster: (sec) => { hiss({ type: 'lowpass', f0: 250, f1: 500, len: sec, gain: 0.12, attack: 0.3 }); hiss({ f0: 800, f1: 2600, q: 1.2, len: sec, gain: 0.05, attack: sec * 0.6 }); },
    chime: () => [784, 988, 1175, 988, 784, 1175, 1568].forEach((f, i) => voice({ type: 'sine', pts: [[0, f]], len: 0.5, gain: 0.05, at: i * 0.32 })),
    spooky: () => { voice({ type: 'sine', pts: [[0, 330], [0.5, 260], [1.0, 360], [1.6, 200]], len: 1.7, gain: 0.07 }); hiss({ type: 'lowpass', f0: 400, len: 1.6, gain: 0.05, attack: 0.3 }); },
    boom: () => { hiss({ type: 'lowpass', f0: 500, f1: 90, len: 0.7, gain: 0.18, attack: 0.005 }); hiss({ type: 'highpass', f0: 3500, len: 0.9, gain: 0.04, at: 0.1, attack: 0.05 }); },
    balloon: () => [880, 1175, 1568].forEach((f, i) => voice({ type: 'sine', pts: [[0, f], [0.1, f * 1.2]], len: 0.14, gain: 0.05, at: i * 0.08 })),
  };

  // まわりの音: 季節ごと(春は小鳥、夏はセミ、秋は風と葉っぱ、冬は静かな風)。手番の子のいるエリアで変わる
  let amb = null;
  function startAmbience() {
    if (!audio || amb) return;
    if (!noise) hiss({ f0: 100, len: 0.01, gain: 0.0001 });
    const src = audio.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = audio.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.6;
    const g = audio.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(audio.destination);
    src.start();
    amb = { src, f, g, next: 2, area: 'spring' };
  }
  function stopAmbience() {
    if (!amb) return;
    amb.src.stop();
    amb = null;
  }
  function updateAmbience(dt, area) {
    if (!amb) return;
    amb.area = area;
    const wind = { spring: [0.012, 500], summer: [0.008, 700], autumn: [0.03, 450], winter: [0.03, 320] }[area] || [0.01, 500];
    amb.g.gain.value += (wind[0] - amb.g.gain.value) * Math.min(1, dt);
    amb.f.frequency.value += (wind[1] - amb.f.frequency.value) * Math.min(1, dt);
    amb.next -= dt;
    if (amb.next > 0) return;
    amb.next = 2.5 + Math.random() * 4;
    if (area === 'spring') { const f = 2600 + Math.random() * 1200; for (let i = 0; i < 3; i++) voice({ type: 'sine', pts: [[0, f], [0.05, f * 1.25], [0.09, f * 0.95]], len: 0.1, gain: 0.025, at: i * 0.13 }); }
    if (area === 'summer') voice({ type: 'sawtooth', pts: [[0, 4200], [1.4, 4000]], len: 1.6, gain: 0.008 });
    if (area === 'autumn') hiss({ f0: 2500, f1: 1500, len: 0.6, gain: 0.03, attack: 0.1 });
    if (area === 'winter') voice({ type: 'sine', pts: [[0, 2093]], len: 0.6, gain: 0.015 });
  }

  // ── 読みこみ ──────────────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho']);
  const owl = await createModel('hoho');
  owl.play('idle');
  scene.add(owl.root);
  const medalGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24);
  medalGeo.rotateX(Math.PI / 2);
  const medal = new THREE.Mesh(medalGeo, new THREE.MeshToonMaterial({ color: 0xffd24a, emissive: 0x6a4a00, emissiveIntensity: 0.4 }));
  scene.add(medal);

  // どんぐりサイコロ: 手番の子の頭の上で、数字の札をつけた大きなどんぐりが回る
  const dice = (() => {
    const g = new THREE.Group();
    const acorn = new THREE.Mesh(acornGeometry(), new THREE.MeshToonMaterial({ vertexColors: true }));
    acorn.scale.setScalar(7);
    acorn.position.y = -0.2;
    g.add(acorn);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    label.scale.setScalar(1.1);
    label.position.set(0, 0.15, 0);
    label.renderOrder = 10;
    g.add(label);
    g.visible = false;
    scene.add(g);
    const draw = (n) => {
      const x = cv.getContext('2d');
      x.clearRect(0, 0, 128, 128);
      x.fillStyle = '#fff6e0';
      x.strokeStyle = '#4a2a12';
      x.lineWidth = 8;
      x.beginPath();
      x.arc(64, 64, 52, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillStyle = '#4a2a12';
      x.font = '400 64px "Dela Gothic One", sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(n), 64, 68);
      tex.needsUpdate = true;
    };
    // 頭突きで割れたどんぐりの殻のかけら
    const shellGeo = new THREE.SphereGeometry(0.22, 6, 4, 0, Math.PI);
    const shellMats = [new THREE.MeshToonMaterial({ color: 0xb5702f }), new THREE.MeshToonMaterial({ color: 0x6e4a2a })];
    const bits = [];
    function burst() {
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(shellGeo, shellMats[i % 2]);
        m.position.copy(g.position);
        scene.add(m);
        const a = (i / 8) * Math.PI * 2;
        bits.push({ m, v: new THREE.Vector3(Math.cos(a) * 3, 2.5 + Math.random() * 2, Math.sin(a) * 3), t: 0, spin: Math.random() * 10 });
      }
    }
    function updateBits(dt) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.t += dt;
        b.v.y -= 12 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.x += b.spin * dt;
        b.m.rotation.z += b.spin * 0.7 * dt;
        b.m.scale.setScalar(Math.max(0.01, 1 - b.t / 0.9));
        if (b.t > 0.9) { scene.remove(b.m); bits.splice(i, 1); }
      }
    }
    // state: spin(回っている)/ hit(頭突き)/ show(目が出た)/ count(進むあいだ、のこりのマス)
    return { g, acorn, label, draw, burst, updateBits, n: 1, state: 'off', t: 0, burstDone: false };
  })();

  // ── コマ ──────────────────────────────────────────
  let game = null; // { s, players, pieces, cpus, ... }
  const tmp = new THREE.Vector3();
  function spotOf(i) {
    // 同じマスに何人かいたら、横一列(カメラから見て左右)に並べる。手番の子は、一歩手前へ
    const s = game.s;
    const sq = game.pieces[i].sq;
    const here = s.players.map((_, k) => k).filter((k) => game.pieces[k].sq === sq);
    const pos = view.squarePos(sq, new THREE.Vector3());
    if (here.length > 1) {
      const k = here.indexOf(i);
      pos.x += (k - (here.length - 1) / 2) * 1.1; // コマは 1.25 倍の大きさなので、1.1m あける
      pos.z -= 0.4;
      // 手番の子(開会式ではサイコロをふる子)は、一歩手前へ
      const now = s.phase === 'turn' ? currentSlot(s) : s.phase === 'order' ? s.pending?.slot : null;
      if (now === i) pos.z += 0.7;
    }
    return pos;
  }
  // コマを sq へ(はねる / すべる)。おわったら resolve
  function movePiece(i, sq, { hop = true, time = 0.24, arc = 0.7 } = {}) {
    const p = game.pieces[i];
    p.sq = sq;
    return animTo(p, spotOf(i), { hop, time, arc });
  }
  // コマを to へ動かす。動いているとちゅうに次の動きが来たら、前の動きは「おわった」ことにする(待っている側が止まらないように)
  function animTo(p, to, { hop = true, time = 0.24, arc = 0.7 } = {}) {
    p.anim?.resolve();
    const from = p.holder.position.clone();
    return new Promise((resolve) => { p.anim = { from, to: to.clone(), t: 0, time, hop, arc, resolve }; });
  }
  // 同じマスにいる子の並びを、いまの手番に合わせて動かしなおす
  function stepForward() {
    game.pieces.forEach((p, i) => { if (!p.anim) animTo(p, spotOf(i), { hop: false, time: 0.35 }); });
  }
  function settlePieces() {
    game.pieces.forEach((p, i) => { if (!p.anim) p.holder.position.copy(spotOf(i)); });
  }

  // ── 時間: 一時停止のあいだは止まる。「はやく」で3倍 ─────────────
  let clock = 0, fast = false, paused = false;
  const timers = [];
  const sleep = (sec) => new Promise((resolve) => timers.push({ at: clock + sec, resolve }));
  // オンラインで 演出が おくれて、とどいた 操作が たまって いる ときも はやく(おいつく)
  const speed = () => (fast || (game?.net?.backlog ?? 0) >= 2 ? 3 : 1);

  // ── HUD ─────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashB');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
    sfx.banner();
  }
  function say(text) { $('msgB').textContent = text; }
  const ME = () => game?.me ?? 0; // 自分の 席(オンラインでは 0 とは かぎらない)
  function name(i) { return i === ME() ? 'あなた' : game.players[i].name; }
  function renderCards() {
    const s = game.s;
    $('cardsB').replaceChildren(...(s.order.length ? s.order : s.players.map((_, i) => i)).map((i) => {
      const p = s.players[i];
      const d = document.createElement('div');
      d.className = 'bcard' + (i === ME() ? ' me' : '') + (s.phase === 'turn' && currentSlot(s) === i ? ' now' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[i].hex));
      d.innerHTML = `<span class="nm">${name(i)}</span><span class="vals"><span class="md">${p.medals}</span><span class="ac">${p.acorns}</span></span>` +
        `<span class="it">${p.items.map(() => '●').join('')}</span>`;
      return d;
    }));
    $('turnB').textContent = s.phase === 'order' ? '開会式' : `ターン ${Math.min(s.turn, s.turns)} / ${s.turns}`;
  }
  // ボタンを出して、えらばれたものを返す
  function choose(title, options) {
    say(title);
    return new Promise((resolve) => {
      $('actsB').replaceChildren(...options.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bact' + (o.main ? ' main' : '');
        b.disabled = !!o.disabled;
        b.innerHTML = o.label;
        b.addEventListener('click', () => { $('actsB').replaceChildren(); say(''); resolve(o.value); });
        return b;
      }));
    });
  }
  // 「+3」などを、そのコマの上にふわっと出す
  function pop(text, i, cls = '') {
    tmp.copy(game.pieces[i].holder.position).setY(game.pieces[i].holder.position.y + 2.2).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmp.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmp.y) / 2) * 100}%`;
    $('popsB').append(el);
    setTimeout(() => el.remove(), 900);
  }

  // キャラの反応(よろこぶ・がっかり・びっくり)を少しのあいだ
  function react(i, clip, face, sec = 1.5) {
    const p = game.pieces[i];
    p.react = { clip, face, t: sec };
  }

  // ── 大会のはじまり ──────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let opts = { turns: 10, stage: 'shiki' };
  let intro = 1;
  const INTRO_TIME = 3.2;
  const focus = new THREE.Vector3();
  let runId = 0;

  // resume: 保存しておいた 大会(save.js)。あれば そこから つづける
  async function startTournament({ fromSky = false, resume = null, net = null } = {}) {
    // オンライン: { client, start, onFinish }。顔ぶれ・種・いまの 状態は サーバーが きめる
    const me = net ? net.start.seat : 0;
    const seed = net ? net.start.seed : resume ? resume.seed : params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    let players;
    if (net) players = net.start.lineup.map((l, i) => ({ character: l.character, cpu: l.cpu, name: i === me ? 'あなた' : l.name }));
    else if (resume) players = resume.players;
    else {
      const pick = { rng: seedFrom(`${seed}:pick`) };
      const others = CHARACTERS.filter((c) => c.key !== picked && !c.guest).map((c) => c.key); // ゲストは CPU に出てこない
      const kinds = Object.keys(PERSONALITIES);
      players = [{ character: picked, cpu: null, name: 'あなた' }];
      while (players.length < 5) {
        const key = others.splice(Math.floor(nextRandom(pick) * others.length), 1)[0];
        players.push({ character: key, cpu: kinds[Math.floor(nextRandom(pick) * kinds.length)], name: CHARACTERS.find((c) => c.key === key).name });
      }
    }
    if (game) for (const p of game.pieces) scene.remove(p.holder);
    if (view.stage !== st.key) { view.dispose(); view = buildBoardScene(scene, st); }
    fx.hidePodium();
    const s = resume ? resume.s : createTournament(players, seed, { turns: opts.turns, stage: opts.stage });
    if (net) replaceState(s, JSON.parse(JSON.stringify(net.start.s)));
    const pieces = await Promise.all(players.map(async (p, i) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[i].hex);
      model.play('idle');
      model.actions.idle.time = Math.random() * 2;
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.scale.setScalar(1.25);
      scene.add(holder);
      return { model, holder, sq: s.players[i].sq, anim: null, face: 0 };
    }));
    const cpus = players.map((p, i) => (p.cpu && !net ? createCpu(p.cpu, seed, i) : null));
    if (resume) cpus.forEach((c, i) => { if (c && resume.cpus?.[i]) Object.assign(c, resume.cpus[i]); });
    game = { s, seed, players, pieces, cpus, me, net: net ? netLink(net) : null };
    save();
    settlePieces();
    atmosphere.apply(params.get('time') || st.time || 'day');
    atmosphere.setupShadows(pieces.map((p) => p.holder), pieces.map((p) => p.holder));
    placeOwl(s.owl, true);
    setMode('playing');
    intro = fromSky ? 0 : 1;
    camOn(me);
    focus.copy(game.pieces[me].holder.position);
    renderCards();
    const id = ++runId;
    drive(id); // 進行(非同期でずっと回る。新しい大会が始まったら止まる)
  }

  // 先生を、どこかの場所へ飛ばす(表彰式など、マスではないところ)
  function flyOwlTo(to) {
    owl.play('flap', { fade: 0.1 });
    const from = owl.root.position.clone();
    owl.root.userData.flight = { from, to: to.clone(), t: 0, time: 2.2, arc: 4 + from.distanceTo(to) * 0.12 };
  }
  function placeOwl(sq, snap = false) {
    const to = view.squarePos(sq, new THREE.Vector3());
    to.x += 0.9; // マスのとなり(コマとかさならないように)
    to.z -= 0.6;
    if (snap) { owl.root.position.copy(to); owl.root.userData.flight = null; return; }
    const from = owl.root.position.clone();
    owl.root.userData.flight = { from, to, t: 0, time: 2.4, arc: 6 + from.distanceTo(to) * 0.15 };
  }


  function setMode(m) {
    mode = m;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudB').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
    // 大会のいちじていし: 「さいしょから」は出さない(大会をやりなおすのは結果から)
    $('restart').hidden = m !== 'idle';
    $('pauseReselect').hidden = false;
    $('again').hidden = $('reselect').hidden = false;
    if (m === 'playing') startAmbience();
    if (m === 'idle') stopAmbience();
  }
  function leave(to) {
    runId++; // 進行を止める
    onExit(to);
  }
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
  }
  const mine = (fn) => () => { if (mode !== 'idle' && active) fn(); };
  let active = false; // いまこの画面がタイトルの輪から呼ばれているか(競技へ出ているあいだは false)
  $('pauseBtnB').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startTournament(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  $('fastB').addEventListener('pointerdown', () => { fast = !fast; $('fastB').classList.toggle('on', fast); });

  // ── 説明カード: 止まったマス・起きたことを、ことばで説明する ─────────────
  // 画面の下に「札の色・名前・何が起きるか」。時間がたつか、タップで次へ
  const KIND_INFO = {
    blue: { color: '#3d8bff', mark: '+', title: '青マス', text: (sp) => `どんぐりが ${RULES.blue * (sp ? 2 : 1)}こ ふえる` },
    red: { color: '#e8402f', mark: '−', title: '赤マス', text: (sp) => `どんぐりが ${RULES.red * (sp ? 2 : 1)}こ へる` },
    item: { color: '#34c47c', mark: '?', title: 'どうぐマス', text: () => 'どうぐを 1つ もらえる(3つまで持てる)' },
    happen: { color: '#9b6bff', mark: '!', title: 'ハプニングマス', text: () => 'その場所の できごとが おきる!' },
    duel: { color: '#ff9a2a', mark: 'VS', title: '対決マス', text: () => 'だれか1人と、どんぐりを かけて 1対1 で勝負!' },
    shop: { color: '#ffc23c', mark: '店', title: 'どうぐ屋', text: () => 'お店の前で ひとやすみ' },
    start: { color: '#fff6e0', mark: 'S', title: 'スタート', text: () => 'なにも おきない' },
    slide: { color: '#ff7a3a', mark: '≫', title: 'すべり台', text: () => '落ち葉のすべり台で、先のマスまで 一気にすべる!' },
    ice: { color: '#8fd3ff', mark: '❄', title: 'つるつる氷', text: () => '氷の上では 止まれない! もう少し すべる' },
    ride: { color: '#ff4f9a', mark: '乗', title: '乗り場', text: () => 'どんぐりを はらって 乗り物に 乗れる。行き先は くじ!' },
  };
  const HAPPEN_INFO = {
    spring: { title: '春の雨', text: '池があふれた! 止まった子は 3マス もどる' },
    summer: { title: 'どんぐりの雨', text: '大木がゆれた! 止まった子は どんぐり +10、近くの子も +3' },
    autumn: { title: 'つむじ風', text: '風にとばされて、盤のどこかへ!' },
    winter: { title: '雪玉ころころ', text: '大きな雪玉! 冬にいる子は みんな どんぐり -5' },
    gate: { title: '風船', text: '風船に つかまって、3〜5マス 先へ ふわっと!' },
    coaster: { title: '宙がえり', text: 'どんぐりを 5こ 落とした! コースターに いる 子が 山分け' },
    wheel: { title: '花火', text: 'きれいな 花火! みんな どんぐり +3、止まった子は +6' },
    ghost: { title: 'おばけの いたずら', text: 'おばけが だれかと 場所を 入れかえた!' },
  };
  // 乗り物の くじの 結果
  const RIDE_OUTCOME = {
    owl: { title: '大当たり!', text: 'ホーホー先生の すぐ手前に 着いた!', color: '#ffd24a' },
    ahead: { title: 'ぐーんと 先へ!', text: 'ずっと 先の マスに 着いた', color: '#3d8bff' },
    back: { title: 'あれれ…', text: 'うしろの マスに もどされた', color: '#e8402f' },
    warp: { title: 'どこかへ!', text: '盤の どこかの マスに 着いた', color: '#9b6bff' },
    stay: { title: 'いい けしき!', text: '景色を 見て ひとやすみ。どんぐりを もらった', color: '#34c47c' },
  };
  const ITEM_INFO = {
    dice2: 'サイコロを 2つ ふれる',
    dice3: 'サイコロを 3つ ふれる',
    swap: 'だれか1人と、いる場所を 入れかえる',
    whistle: 'ホーホー先生を、自分の すこし先へ よぶ',
    bag: 'どんぐりが 10こ ふえる',
  };
  let infoSkip = null;
  $('infoB').addEventListener('pointerdown', () => infoSkip?.());
  async function explain({ color = '#fff6e0', mark = '', title, text, who = null, sec = 2.4 }) {
    const el = $('infoB');
    el.querySelector('i').style.background = color;
    el.querySelector('i').textContent = mark;
    el.querySelector('b').textContent = (who !== null ? `${name(who)}: ` : '') + title;
    el.querySelector('p').textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    sfx.banner();
    await Promise.race([sleep(sec / speed()), new Promise((r) => { infoSkip = r; })]);
    infoSkip = null;
    el.hidden = true;
  }

  // ハプニングの演出。春と冬はみんなに起きるので、そのエリアを引いて見せる
  // ハプニングの 特殊演出(5秒くらい。はやく ▶▶ のときは 待ちを みじかく)。
  // 結果(もどる・どんぐり・とばされる)は、このあとの できごとで 見せる
  function happenTint(area) {
    const el = $('hfxB');
    if (el) el.className = 'hfx ' + (area || '');
  }
  async function playHappen(e) {
    const p = game.pieces[e.slot];
    const me = () => p.holder.position;
    happenTint(e.area);
    if (e.area === 'spring') {
      // 頭の上に 雨雲 → 雷と 大雨 → 足もとに 水たまり。あとで 波に 押しながされる(pushBack)
      camOn(e.slot);
      cam.close = true;
      react(e.slot, 'idle', 'surprised', 4);
      await sleep(0.4 / speed());
      fx.stormCloud(me().clone(), 3.0, () => { sfx.thunder(); cam.shake = 0.25; react(e.slot, 'dizzy', 'surprised', 1.2); });
      sfx.rain();
      await sleep(3.4 / speed());
    } else if (e.area === 'summer') {
      // どんぐりが どさどさ → さいごに 大きな 金の どんぐりが 頭に ゴツン
      camOn(e.slot);
      cam.close = true;
      react(e.slot, 'idle', 'surprised', 1.6);
      fx.acornRain(me().clone(), 3.4, 44);
      sfx.acornRain();
      await sleep(1.6 / speed());
      fx.goldAcorn(me, () => { sfx.bonk(); cam.shake = 0.2; p.squash = 1; react(e.slot, 'dizzy', 'surprised', 1.0); });
      await sleep(1.6 / speed());
      react(e.slot, 'cheer', 'happy', 1.6);
      await sleep(0.8 / speed());
    } else if (e.area === 'autumn') {
      // 落ち葉の 竜巻が 子を つつんで、くるくる 回りながら 空へ。あとで 遠くへ とんでいく(blown)
      camOn(e.slot);
      cam.close = true;
      fx.whirlwind(me, 3.6);
      sfx.whirl();
      react(e.slot, 'dizzy', 'surprised', 4.2);
      await sleep(0.6 / speed());
      p.lift = { t: 0, dur: 3.0 };
      await sleep(3.2 / speed());
    } else if (e.area === 'winter') {
      // ころがるほど 大きくなる 雪玉が 冬の エリアを かけぬける。ひかれた子は ぺしゃんこ
      const qs = st.squares.filter((q) => q.area === 'winter' && !q.path);
      camOn(e.slot);
      cam.close = true;
      react(e.slot, 'idle', 'surprised', 1.2);
      await sleep(0.6 / speed());
      sfx.snowball();
      const hitDone = new Set();
      // カメラは 雪玉を 追いかける
      cam.ball = fx.snowball(qs.map((q) => new THREE.Vector3(q.x, 0, q.z)), 3.4, (pos, r) => {
        cam.shake = Math.max(cam.shake || 0, 0.12);
        game.pieces.forEach((q, i) => {
          if (hitDone.has(i) || st.squares[q.sq].area !== 'winter') return;
          if (Math.hypot(q.holder.position.x - pos.x, q.holder.position.z - pos.z) < r + 0.5) {
            hitDone.add(i);
            q.squash = 1.6;
            react(i, 'dizzy', 'frustrated', 2);
            sfx.squash();
          }
        });
      });
      cam.mode = 'ball';
      cam.glide = true;
      await sleep(3.6 / speed());
      camOn(e.slot);
      await sleep(0.6 / speed());
    } else if (e.area === 'gate') {
      // 風船の たばが 頭の上に ぽんっ。ふわっと 浮きあがる(このあと float で 先の マスへ)
      camOn(e.slot);
      cam.close = true;
      p.balloons = fx.balloons(() => p.holder.position);
      sfx.balloon();
      react(e.slot, 'idle', 'surprised', 1.0);
      await sleep(0.7 / speed());
      p.floatUp = { t: 0, dur: 1.4 };
      react(e.slot, 'cheer', 'happy', 3);
      await sleep(1.6 / speed());
    } else if (e.area === 'coaster') {
      // コースターの いきおいで 宙がえり! どんぐりが こぼれる(このあと loop で とびちる)
      camOn(e.slot);
      cam.close = true;
      sfx.coaster(1.6);
      react(e.slot, 'dizzy', 'surprised', 3);
      p.flip = { t: 0, dur: 1.5 / speed() };
      await sleep(1.7 / speed());
      cam.shake = 0.2;
      sfx.squash();
    } else if (e.area === 'wheel') {
      // 夜空に 花火が どーん
      camOn(e.slot);
      cam.close = true;
      react(e.slot, 'cheer', 'happy', 4);
      fx.fireworks(me().clone(), 7, () => { sfx.boom(); });
      await sleep(4.0 / speed());
    } else if (e.area === 'ghost') {
      // うしろから 大きな おばけが ぬっ…「ばあ!」(このあと ghostSwap で 入れかわる)
      camOn(e.slot);
      cam.close = true;
      fx.bigGhost(me().clone(), 2.6 / speed());
      sfx.spooky();
      await sleep(0.7 / speed());
      p.jumpT = 0;
      react(e.slot, 'dizzy', 'surprised', 2);
      cam.shake = 0.3;
      await sleep(1.9 / speed());
    }
    cam.close = false;
    happenTint(null);
  }

  // 乗り物に 乗る: 乗り場へ → 乗り物の 道すじ(おばけ屋敷は 中へ 消えて、えんとつから とびだす)→ 行き先へ とぶ
  function ridePath(p, fn, dur, tilt = false) {
    return new Promise((resolve) => { p.ride = { fn, t: 0, dur, resolve, quat: tilt ? new THREE.Quaternion() : null }; });
  }
  async function playRide(e) {
    const p = game.pieces[e.slot];
    const r = view.rides[e.ride];
    const o = RIDE_OUTCOME[e.outcome];
    camOn(e.slot);
    if (r) {
      r.prepare?.();
      await animTo(p, r.enter, { time: 0.8 / speed(), arc: 1.4 });
      if (e.ride === 'ghost') {
        await animTo(p, r.door, { time: 0.4 / speed(), hop: false });
        p.holder.visible = false;
        r.scare(2.2 / speed());
        sfx.spooky();
        cam.shake = 0.35;
        await sleep(2.2 / speed());
        p.holder.position.copy(r.chimney);
        p.holder.visible = true;
        fx.puff(r.chimney.clone().setY(r.chimney.y - 0.5));
        react(e.slot, 'dizzy', 'surprised', 2);
      } else {
        // カメラは 乗っている 子を 追いかける
        cam.ball = p.holder.position;
        cam.mode = 'ball';
        cam.glide = true;
        if (e.ride === 'coaster') sfx.coaster(r.time / speed()); else sfx.chime();
        react(e.slot, 'cheer', 'happy', r.time + 1);
        await ridePath(p, r.path, r.time / speed(), e.ride === 'coaster');
        camOn(e.slot);
      }
    }
    // 行き先へ(その場なら 乗り場へ もどる)
    await movePiece(e.slot, e.to, { time: (e.outcome === 'stay' ? 1.2 : 1.8) / speed(), arc: e.outcome === 'stay' ? 2.5 : 6 });
    p.squash = 1;
    fx.sparkle(p.holder.position.clone().setY(0.4), 12, 2);
    settlePieces();
    if (e.outcome === 'owl') { sfx.medal(); fx.confetti(p.holder.position.clone(), 50); }
    else if (e.outcome === 'back') sfx.lose(); else sfx.gain();
    react(e.slot, e.outcome === 'back' ? 'dizzy' : 'cheer', e.outcome === 'back' ? 'frustrated' : 'happy', 1.8);
    await explain({ color: o.color, mark: '乗', title: o.title, text: o.text, who: e.slot, sec: 2.2 });
  }

  // ── できごとを見せる ──────────────────────────────
  async function show(events) {
    const s = game.s;
    for (const e of events) {
      switch (e.type) {
        case 'orderRoll':
          camOn(e.slot);
          showDice(e.slot, e.value);
          say(`${name(e.slot)}: ${e.value}`);
          await sleep(1.4 / speed());
          break;
        case 'order':
          renderCards();
          say('');
          camOver();
          await explain({ color: '#ffd24a', mark: '1', title: 'じゅんばん', text: e.order.map((i, k) => `${k + 1}${name(i)}`).join(' → ') + '(サイコロの大きい順)', sec: 3.6 });
          break;
        case 'turn':
          camOver();
          renderCards();
          splash(`ターン ${e.turn} / ${s.turns}`, e.spurt ? 'gold' : '');
          await sleep(2.0 / speed());
          break;
        case 'spurt':
          await explain({ color: '#ffd24a', mark: '!', title: 'ラストスパート!', text: 'のこり3ターン。青マス・赤マスの どんぐりが 2倍!', sec: 3.2 });
          break;
        case 'player':
          camOn(e.slot);
          renderCards();
          stepForward();
          splash(`${name(e.slot)}の番`);
          sfx.turn();
          await sleep(1.6 / speed());
          break;
        case 'dice':
          // 止めたサイコロに、ほんとうの目を出す(2つ・3つのときは合計)
          showDice(e.slot, e.total, e.values.length > 1 ? e.values.join(' + ') + ` = ${e.total}` : '');
          await sleep(1.3 / speed());
          say(`${e.total} マス すすむ`);
          break;
        case 'step':
          camOn(e.slot);
          sfx.hop(e.left, st.squares[e.to].area);
          // 頭の上に、のこりのマス
          if (e.left > 0) { dice.slot = e.slot; dice.state = 'count'; dice.g.visible = true; dice.acorn.visible = false; dice.draw(e.left); } else dice.g.visible = false;
          await movePiece(e.slot, e.to, { time: 0.34 / speed() });
          settlePieces();
          if (e.left === 0) say('');
          break;
        case 'land': {
          camOn(e.slot);
          dice.g.visible = false;
          view.pulse(e.sq);
          const q = st.squares[e.sq];
          const info = q.ice ? KIND_INFO.ice : KIND_INFO[e.kind];
          if (q.ride) await explain({ ...info, title: `${st.rides[q.ride].name}の 乗り場`, text: `どんぐり ${st.rides[q.ride].price}こで 乗れる。行き先は くじ!`, who: e.slot });
          else if (info && e.kind !== 'happen') await explain({ ...info, text: info.text(s.turns - s.turn < RULES.spurtTurns), who: e.slot });
          break;
        }
        case 'slide':
        case 'iceSlide':
          camOn(e.slot);
          sfx.slide();
          await movePiece(e.slot, e.to, { hop: false, time: 1.1 / speed() });
          settlePieces();
          break;
        case 'pushBack': {
          // 波に 押しながされる(すべるように、跳ねずに)
          camOn(e.slot);
          const p = game.pieces[e.slot];
          const to = view.squarePos(e.to, new THREE.Vector3());
          const dir = new THREE.Vector3(to.x - p.holder.position.x, 0, to.z - p.holder.position.z).normalize();
          fx.surge(() => p.holder.position, dir, 1.5 / speed());
          sfx.splash();
          react(e.slot, 'dizzy', 'surprised', 1.6);
          await movePiece(e.slot, e.to, { hop: false, time: 1.4 / speed() });
          settlePieces();
          await sleep(0.4 / speed());
          break;
        }
        case 'blown': {
          // 空から 大きな 弧を えがいて とんでいく。カメラは 追いかける
          camOn(e.slot);
          const p = game.pieces[e.slot];
          p.lift = null;
          p.spin = 1;
          await movePiece(e.slot, e.to, { time: 1.8 / speed(), arc: 6 });
          p.spin = 0;
          p.squash = 1;
          fx.sparkle(p.holder.position.clone().setY(0.4), 12, 2);
          settlePieces();
          await sleep(0.5 / speed());
          break;
        }
        case 'ride':
          await playRide(e);
          break;
        case 'rideSkip':
          if (e.why) await explain({ color: '#ff4f9a', mark: '乗', title: '乗れない…', text: 'どんぐりが たりない', who: e.slot, sec: 1.8 });
          break;
        case 'float': {
          // 風船で ふわっと 先の マスへ。着いたら 風船を はなす
          camOn(e.slot);
          const p = game.pieces[e.slot];
          p.floatUp = null;
          await movePiece(e.slot, e.to, { time: 2.4 / speed(), arc: 2.5 });
          p.balloons?.release();
          p.balloons = null;
          p.squash = 0.6;
          settlePieces();
          await sleep(0.5 / speed());
          break;
        }
        case 'loop':
          // どんぐりが こぼれて、コースターに いる 子へ とんでいく
          fx.spill(game.pieces[e.slot].holder.position.clone().setY(1.6), Math.max(4, e.drop * 2), e.to.map((i) => game.pieces[i].holder.position.clone()));
          sfx.lose();
          await sleep(0.8 / speed());
          break;
        case 'fireworks':
          break;
        case 'ghostSwap': {
          // ぽん! と けむりに なって、場所が 入れかわる
          camOver();
          const a = game.pieces[e.slot], b = game.pieces[e.target];
          fx.puff(a.holder.position.clone());
          fx.puff(b.holder.position.clone());
          sfx.spooky();
          const sa = b.sq, sb = a.sq;
          await Promise.all([movePiece(e.slot, sa, { time: 1.2 / speed(), arc: 4 }), movePiece(e.target, sb, { time: 1.2 / speed(), arc: 4 })]);
          settlePieces();
          fx.puff(a.holder.position.clone());
          fx.puff(b.holder.position.clone());
          react(e.slot, 'dizzy', 'surprised', 1.6);
          react(e.target, 'dizzy', 'surprised', 1.6);
          await explain({ color: '#9b6bff', mark: '!', title: 'おばけの いたずら!', text: `${name(e.slot)}と ${name(e.target)}が 入れかわった`, sec: 2 });
          camOn(e.slot);
          break;
        }
        case 'swap': {
          camOver();
          const a = game.pieces[e.slot], b = game.pieces[e.target];
          const sa = b.sq, sb = a.sq;
          await Promise.all([movePiece(e.slot, sa, { time: 1.0 / speed() }), movePiece(e.target, sb, { time: 1.0 / speed() })]);
          settlePieces();
          await explain({ color: '#34c47c', mark: '⇄', title: 'いれかえ!', text: `${name(e.slot)}と ${name(e.target)}が 入れかわった`, sec: 2 });
          camOn(e.slot);
          break;
        }
        case 'acorns':
          camOn(e.slot);
          react(e.slot, e.delta > 0 ? 'cheer' : 'idle', e.delta > 0 ? 'happy' : e.delta < 0 ? 'frustrated' : 'normal');
          if (e.delta > 0) sfx.gain(); else if (e.delta < 0) sfx.lose();
          pop(`${e.delta >= 0 ? '+' : ''}${e.delta}`, e.slot, e.delta >= 0 ? (e.slot === ME() ? 'me' : '') : 'red');
          renderCards();
          await sleep(0.9 / speed());
          break;
        case 'medal':
          camOn(e.slot);
          owl.play('flap', { fade: 0.1 });
          await fx.giveMedal(owl.root.position.clone().setY(owl.root.position.y + 1.5), game.pieces[e.slot].holder.position);
          react(e.slot, 'cheer', 'happy', 2.4);
          sfx.medal();
          splash('メダルゲット!', 'gold');
          pop('メダル +1', e.slot, 'gold');
          renderCards();
          await sleep(2.2 / speed());
          break;
        case 'owlMove': {
          // 先生が飛んでいくのを、カメラが追いかける
          owl.play('flap', { fade: 0.1 });
          sfx.flap();
          sfx.owl();
          placeOwl(e.to);
          camOwl();
          await explain({ color: '#ffd24a', mark: '★', title: 'ホーホー先生', text: '先生は 新しいマスへ とんでいった。そこで メダルが買える', sec: 3.4 });
          break;
        }
        case 'owlPoor':
          await explain({ color: '#ffd24a', mark: '★', title: 'ホーホー先生', text: `メダルは どんぐり ${RULES.medalPrice}こ。たりなくて 買えない…`, who: e.slot, sec: 2.2 });
          break;
        case 'getItem':
        case 'buyItem':
          sfx.item();
          fx.showItem(e.item, game.pieces[e.slot].holder.position);
          react(e.slot, 'cheer', 'happy', 1.4);
          renderCards();
          await explain({ color: '#34c47c', mark: '?', title: `${ITEMS[e.item].name}を ${e.type === 'buyItem' ? '買った' : 'もらった'}`, text: ITEM_INFO[e.item], who: e.slot, sec: 2.4 });
          break;
        case 'useItem':
          sfx.item();
          fx.showItem(e.item, game.pieces[e.slot].holder.position);
          renderCards();
          await explain({ color: '#34c47c', mark: '?', title: `${ITEMS[e.item].name}を つかった!`, text: ITEM_INFO[e.item], who: e.slot, sec: 2.2 });
          break;
        case 'happen': {
          sfx.happen();
          const h = HAPPEN_INFO[e.area];
          splash(h.title + '!', 'red');
          await playHappen(e);
          await explain({ color: '#9b6bff', mark: '!', title: `ハプニング: ${h.title}`, text: h.text, sec: 1.8 });
          break;
        }
        case 'duel':
          camOver();
          sfx.duel();
          await explain({ color: '#ff9a2a', mark: 'VS', title: `対決! ${name(e.a)} vs ${name(e.b)}`, text: `どんぐり ${e.stake}こを かけて、「${GAME_NAMES[e.game]}」で勝負!`, sec: 3.0 });
          break;
        case 'duelEnd':
          camOn(e.winner);
          splash(`${name(e.winner)}の勝ち!`, 'gold');
          await sleep(1.4 / speed());
          renderCards();
          break;
        case 'duelSkip':
          if (e.why) await explain({ color: '#ff9a2a', mark: 'VS', title: '対決なし', text: 'かけられる どんぐりが ないので、対決は おやすみ', who: e.slot, sec: 2 });
          break;
        case 'minigame':
          camOver();
          splash('競技のじかん!', 'gold');
          await sleep(1.6 / speed());
          await explain({ color: '#ffd24a', mark: '★', title: `競技: ${GAME_NAMES[e.game]}`, text: `順位で どんぐりが もらえる(1位 +${RULES.minigamePrize[0]}・2位 +${RULES.minigamePrize[1]}・3位 +${RULES.minigamePrize[2]}・4位 +${RULES.minigamePrize[3]}・5位 +${RULES.minigamePrize[4]})`, sec: 3.6 });
          break;
        case 'minigameEnd':
          renderCards();
          camOver();
          await explain({ color: '#ffd24a', mark: '★', title: '競技の結果', text: e.ranking.map((i, k) => `${k + 1}位 ${name(i)}(+${RULES.minigamePrize[k]})`).join('・'), sec: 3.4 });
          break;
        case 'bonus':
          if (!game.bonusIntro) {
            game.bonusIntro = true;
            camOver();
            splash('大会 おしまい!', 'gold');
            await sleep(1.8 / speed());
            await explain({ color: '#ffd24a', mark: '★', title: 'ボーナスメダルの発表', text: 'さいごに、ボーナスメダルを 3つ 発表します!', sec: 2.8 });
          }
          camOver();
          await explain({ color: '#ffd24a', mark: '★', title: `ボーナスメダル: ${e.name}`, text: bonusText(e.key), sec: 2.8 });
          if (e.who.length) {
            if (e.who.length === 1) camOn(e.who[0]);
            await sleep(0.6 / speed());
            for (const i of e.who) { pop('メダル +1', i, 'gold'); react(i, 'cheer', 'happy', 2); }
            splash(`${e.who.map(name).join('・')}!`, 'gold');
            sfx.medal();
          } else splash('該当なし');
          renderCards();
          await sleep(2.2 / speed());
          break;
      }
    }
  }
  function bonusText(key) {
    return {
      minigameWins: '競技で 1位を いちばん多く とった子に',
      gained: 'どんぐりを いちばん多く 手に入れた子に',
      happen: 'ハプニングマスに いちばん多く 止まった子に',
      diceSum: 'サイコロの目の合計が いちばん大きい子に',
      duelWins: '対決で いちばん多く 勝った子に',
      itemsUsed: 'どうぐを いちばん多く つかった子に',
    }[key];
  }

  // ── 進行 ────────────────────────────────────────
  // さいごの 手番を 端末に しまう(ページが 読み込みなおされても つづきから 遊べるように)
  function save() {
    if (!game || game.net) return; // オンラインの 大会は 端末に しまわない
    if (game.s.phase === 'finished') { clearTaikai(); return; }
    saveTaikai({ picked, seed: game.seed, players: game.players, s: game.s, cpus: game.cpus });
  }
  // オンライン: サーバーから とどく 操作を じゅんに うけとる
  function netLink(net) {
    const queue = [];
    let wake = null;
    net.client.h.bact = (m) => { queue.push(m); wake?.(); };
    return {
      ...net,
      get backlog() { return queue.length; },
      next: () => new Promise((resolve) => {
        const take = () => { if (queue.length) resolve(queue.shift()); else wake = () => { wake = null; take(); }; };
        take();
      }),
      send: (action) => net.client.send({ t: 'bact', action }),
      seen: (seq) => net.client.send({ t: 'bseen', seq }),
    };
  }
  async function driveOnline(id) {
    const live = () => id === runId && game;
    const n = game.net;
    const me = game.me;
    await sleep(0.1);
    n.seen(n.start.seq); // はじめの 状態は 見た
    while (live() && game.s.phase !== 'finished') {
      const s = game.s;
      const pend = s.pending;
      let msg;
      if (pend.type === 'minigame' || pend.type === 'duelGame') {
        // 競技へは タイトルが つれて いく(サーバーが はじめる)。出ない 対決は 盤で まつ
        if (pend.type === 'duelGame' && pend.a !== me && pend.b !== me) say(`${name(pend.a)} と ${name(pend.b)} が 対決中…`);
        msg = await n.next();
        say('');
      } else if (pend.slot === me) {
        const action = await humanAct(pend);
        if (!live()) return;
        n.send(action);
        msg = await n.next();
      } else if (pend.type === 'roll' || pend.type === 'orderRoll') {
        // ほかの 子の サイコロ: 回して いる あいだに 目が とどく
        [msg] = await Promise.all([n.next(), rollDice(pend.slot, false)]);
      } else {
        msg = await n.next();
      }
      if (!live()) return;
      const ev = act(s, msg.action);
      replaceState(s, msg.s); // サーバーの 状態で こたえあわせ
      await show(ev);
      n.seen(msg.seq);
    }
    if (live()) track('online-taikai-end', { stage: opts.stage });
    if (live()) await ceremony(live);
    // おわったら 部屋へ もどる(サーバーも 部屋に もどって いる)
    if (live()) { await sleep(3); n.onFinish?.(); }
  }
  async function drive(id) {
    if (game.net) return driveOnline(id);
    const live = () => id === runId && game;
    await sleep(0.1);
    while (live() && game.s.phase !== 'finished') {
      const s = game.s;
      const pend = s.pending;
      let action = null;
      if (pend.type === 'minigame') action = await runMinigame(pend);
      else if (pend.type === 'duelGame') action = await runDuel(pend);
      else if (pend.slot === 0) action = await humanAct(pend);
      else {
        if (pend.type === 'roll' || pend.type === 'orderRoll') await rollDice(pend.slot, false);
        else await sleep(1.1 / speed()); // CPU が考えている間
        action = cpuAct(game.cpus[pend.slot], s, pend.slot);
        if (pend.type === 'branch') {
          const path = st.squares[action.to].path;
          say(`${name(pend.slot)}は ${path === 'lily' ? 'ハスの近道' : path === 'ice' ? '氷の近道' : 'このままの道'}へ`);
          await sleep(1.0 / speed());
        }
        if (pend.type === 'ride') {
          say(`${name(pend.slot)}は ${st.rides[pend.ride].name}に ${action.type === 'rideYes' ? '乗る!' : '乗らない'}`);
          await sleep(1.0 / speed());
          say('');
        }
      }
      if (!live()) return;
      const ev = act(s, action);
      if (ev[0]?.type === 'invalid') console.warn('できない操作', pend, action, ev[0]);
      save(); // 見せる 前に しまう(見ている とちゅうで 切れても、この 手番は すんでいる)
      await show(ev);
    }
    if (live()) track('taikai-end', { stage: opts.stage });
    if (live()) await ceremony(live);
    if (live()) showResult();
  }

  // サイコロ: 頭の上で回る。人はタップで止める。CPU は少しして止める
  function rollDice(slot, human) {
    camOn(slot);
    stepForward();
    dice.g.visible = true;
    dice.acorn.visible = true;
    dice.state = 'spin';
    dice.t = 0;
    dice.slot = slot;
    if (!human) return sleep(1.5 / speed()).then(stopDice);
    say('タップで止める!');
    return new Promise((resolve) => {
      const btn = { label: 'とめる!', value: 'stop', main: true };
      const tap = (e) => { if (e.target.closest('button') && !e.target.closest('#actsB')) return; done(); };
      const done = () => { window.removeEventListener('pointerdown', tap); $('actsB').replaceChildren(); stopDice(); resolve(); };
      window.addEventListener('pointerdown', tap);
      choose('タップで止める!', [btn]).then(done);
    });
  }
  // ほんとうの目を出す(頭突きのあとに、大きく)
  function showDice(slot, n, detail) {
    dice.slot = slot;
    if (dice.state !== 'hit') { dice.state = 'show'; dice.t = 0; dice.acorn.visible = false; }
    dice.g.visible = true;
    dice.draw(n);
    if (detail) say(detail);
  }
  // 止める: コマがぴょんと跳んで、どんぐりに頭突き。どんぐりは割れる
  function stopDice() {
    dice.state = 'hit';
    dice.t = 0;
    dice.burstDone = false;
    game.pieces[dice.slot].jumpT = 0;
    say('');
  }
  async function humanAct(pend) {
    const s = game.s;
    const meSlot = ME();
    const me = s.players[meSlot];
    const a = (type, extra = {}) => ({ slot: meSlot, type, ...extra });
    switch (pend.type) {
      case 'orderRoll':
      case 'roll': {
        await rollDice(meSlot, true);
        return a('roll');
      }
      case 'item': {
        const v = await choose('どうぐをつかう?', [...me.items.map((k, i) => ({ label: ITEMS[k].name, value: i })), { label: 'つかわない', value: -1, main: true }]);
        return v < 0 ? a('skipItem') : a('useItem', { index: v });
      }
      case 'swapPick': {
        const v = await choose('だれと入れかえる?', s.players.map((_, i) => i).filter((i) => i !== meSlot).map((i) => ({ label: name(i), value: i })));
        return a('swap', { target: v });
      }
      case 'branch': {
        const label = (to) => (st.squares[to].path === 'lily' ? 'ハスの近道<small>みじかい・ハプニング多め</small>'
          : st.squares[to].path === 'ice' ? '氷の近道<small>みじかい・つるつるすべる</small>' : 'このまま<small>ふつうの道</small>');
        const v = await choose('どっちへ行く?', pend.options.map((to) => ({ label: label(to), value: to })));
        return a('branch', { to: v });
      }
      case 'owl': {
        const v = await choose(`先生: メダルを買う?(どんぐり ${RULES.medalPrice})`, [{ label: 'メダルを買う!', value: true, main: true }, { label: 'やめておく', value: false }]);
        return a(v ? 'buyMedal' : 'skipMedal');
      }
      case 'shop': {
        const items = Object.entries(ITEMS).filter(([, it]) => it.price !== null);
        const v = await choose('どうぐ屋: 何を買う?', [
          ...items.map(([k, it]) => ({ label: `${it.name}<small>${it.price}</small>`, value: k, disabled: me.acorns < it.price })),
          { label: 'かわない', value: null, main: true },
        ]);
        return v ? a('shopBuy', { item: v }) : a('shopSkip');
      }
      case 'ride': {
        const r = st.rides[pend.ride];
        const v = await choose(`${r.name}に 乗る?(どんぐり ${r.price})`, [{ label: '乗る!<small>行き先は くじ</small>', value: true, main: true }, { label: '乗らない', value: false }]);
        return a(v ? 'rideYes' : 'rideNo');
      }
      case 'duelPick': {
        const v = await choose('対決: だれと勝負する?', [
          ...s.players.map((_, i) => i).filter((i) => i !== meSlot).map((i) => ({ label: `${name(i)}<small>${s.players[i].acorns}</small>`, value: i, disabled: s.players[i].acorns <= 0 })),
          { label: 'やめておく', value: -1 },
        ]);
        return v < 0 ? a('duelSkip') : a('duelPick', { target: v });
      }
    }
    return null;
  }
  // みんなの競技: 競技の会場へ行って遊んで、順位をもらってくる(自分は席 0、大会の席と同じ並び)
  async function runMinigame(pend) {
    const lineup = game.players.map((p) => ({ character: p.character, cpu: p.cpu, name: p.name }));
    active = false;
    $('hudB').hidden = true;
    stopAmbience();
    const res = await playMinigame(pend.game, lineup, picked);
    active = true;
    setMode('playing');
    renderCards();
    return { type: 'minigameResult', ranking: res.ranking, picked: res.picked || undefined };
  }
  async function runDuel(pend) {
    const { a, b, game: key } = pend;
    if (a !== 0 && b !== 0) {
      const r = simulate(key, [{ cpu: game.players[a].cpu }, { cpu: game.players[b].cpu }], game.seed + game.s.turn * 31 + a);
      await sleep(1.2 / speed());
      return { type: 'duelResult', winner: r.ranking[0] === 0 ? a : b };
    }
    const other = a === 0 ? b : a;
    const lineup = [0, other].map((i) => ({ character: game.players[i].character, cpu: game.players[i].cpu, name: game.players[i].name }));
    active = false;
    $('hudB').hidden = true;
    stopAmbience();
    const res = await playMinigame(key, lineup, picked);
    active = true;
    setMode('playing');
    return { type: 'duelResult', winner: res.ranking[0] === 0 ? 0 : other };
  }

  // 表彰式: 台がせり上がって、3位・2位・1位の順に跳び乗る。1位に金どんぐりメダル、紙吹雪
  async function ceremony(live) {
    const s = game.s;
    const order = ranking(s);
    const ps = podiumSpot(st); // スタートの広場の奥(島の内がわ。まわりに木はない)
    const at = new THREE.Vector3(ps.x, 0, ps.z);
    cam.mode = 'podium';
    cam.podium = at.clone();
    cam.podiumNear = false;
    splash('表彰式', 'gold');
    sfx.fanfare();
    await sleep(1.4);
    fx.raisePodium(at);
    // みんな台のまわりへ(1〜3位は台の前、4位・5位は台の両わき)
    order.forEach((slot, rank) => {
      const p = game.pieces[slot];
      const spots = [[-0.6, 1.6], [0.6, 1.6], [1.8, 1.6], [-2.6, 0.2], [2.6, 0.2]];
      const [x, z] = spots[rank];
      const to = new THREE.Vector3(at.x + x, 0, at.z + z);
      animTo(p, to, { time: 1.2 });
      p.podium = true;
    });
    await sleep(1.6);
    for (const rank of [3, 2, 1]) {
      if (!live()) return;
      if (rank === 1) { sfx.roll(1.4); await sleep(1.5); }
      const slot = order[rank - 1];
      if (slot === undefined) continue;
      const p = game.pieces[slot];
      const top = fx.podiumTop(rank);
      await animTo(p, top, { time: 0.6 });
      p.face = 0;
      react(slot, rank === 1 ? 'cheer' : 'wave', 'happy', 99);
      splash(`${rank}位 ${name(slot)}`, rank === 1 ? 'gold' : '');
      sfx.gain();
      await sleep(1.6);
    }
    // 1位に、先生から金どんぐりメダル。先生は台のうしろへ飛んでくる
    const w = order[0];
    flyOwlTo(at.clone().add(new THREE.Vector3(0.8, 2.2, -1.2)));
    sfx.flap();
    cam.podiumNear = true;
    await sleep(2.6);
    await fx.giveMedal(owl.root.position.clone().setY(owl.root.position.y + 1.5), game.pieces[w].holder.position);
    sfx.medal();
    fx.confetti(at.clone().setY(1), 180);
    sfx.fanfare();
    sfx.cheer();
    splash(w === ME() ? 'あなたの優勝!' : `${name(w)}の優勝!`, 'gold');
    await sleep(3.2);
  }

  function showResult() {
    const s = game.s;
    const order = ranking(s);
    const w = order[0];
    $('resultTitle').textContent = w === ME() ? 'あなたの優勝!' : `${game.players[w].name}の優勝!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = s.players[slot];
      const li = document.createElement('li');
      if (slot === ME()) li.className = 'me';
      const who = game.players[slot].cpu ? `CPU(${PERSONALITIES[game.players[slot].cpu].label})` : slot === ME() ? 'あなた' : 'ともだち';
      const def = CHARACTERS.find((c) => c.key === game.players[slot].character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">メダル ${p.medals}<small>どんぐり ${p.acorns}</small></span>`;
      return li;
    }));
    if (w === ME()) sfx.medal();
    setMode('result');
  }

  // ── 毎フレーム ──────────────────────────────────
  // カメラ: ふだんは手番の子(いま何かが起きている子)を中心に、ゆっくりついていく。
  // 島ぜんたいを見せるのは、開会式・ターンのはじめ・競技の前など、みんなに関わるときだけ
  let freeCamera = false;
  const cam = { mode: 'overview', slot: 0, look: new THREE.Vector3(), pos: new THREE.Vector3() };
  function camOn(slot) {
    if (cam.mode !== 'slot' || cam.slot !== slot) cam.glide = true;
    cam.mode = 'slot';
    cam.slot = slot;
  }
  function camOver() { cam.mode = 'overview'; cam.glide = true; }
  function camOwl() { cam.mode = 'owl'; cam.glide = true; }
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    camera.fov = portrait ? 56 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    let pos, look;
    if (cam.mode === 'overview' || !game) {
      pos = new THREE.Vector3(0, portrait ? 74 : 40, portrait ? 52 : 36);
      look = new THREE.Vector3(0, 0, portrait ? 3 : 1);
    } else if (game && game.s.phase === 'order') {
      // 開会式: スタートに並んだ5人を、正面から(横の幅が入る遠さ)
      const st0 = view.squarePos(st.start, new THREE.Vector3());
      pos = st0.clone().add(new THREE.Vector3(0, portrait ? 4.5 : 3.5, portrait ? 11 : 8));
      look = st0.clone().add(new THREE.Vector3(0, 1.4, 0));
    } else if (cam.mode === 'podium') {
      // 表彰台を、正面の少し上から
      // 1位を発表したら、1位に寄る
      const near = cam.podiumNear;
      pos = cam.podium.clone().add(near ? new THREE.Vector3(0, portrait ? 4.2 : 3.4, portrait ? 7.5 : 6) : new THREE.Vector3(0, portrait ? 7 : 5, portrait ? 12 : 9));
      look = cam.podium.clone().add(new THREE.Vector3(0, near ? 2.0 : 1.0, 0));
    } else {
      const target = cam.mode === 'owl' ? owl.root.position : cam.mode === 'ball' ? cam.ball : game.pieces[cam.slot].holder.position;
      // 別の子へ切りかわったときは、ゆっくり移る(glide)。追いついたら、あとはぴったりついていく
      const d = focus.distanceTo(target);
      if (cam.glide && d < 1.2) cam.glide = false;
      const rate = cam.glide ? 2.2 + Math.min(4, d / 6) : 10;
      focus.lerp(target, snap ? 1 : 1 - Math.exp(-dt * rate));
      pos = focus.clone().add(new THREE.Vector3(0, portrait ? 12 : 9, portrait ? 8.5 : 7.5)); // 少し高めから(手前の木ごしにならないように)
      look = focus.clone().add(new THREE.Vector3(0, 0.8, portrait ? -1 : 0));
      if (cam.close) {
        // ハプニング: ぐっと 寄って、空も 少し 入れる
        pos = focus.clone().add(new THREE.Vector3(0, portrait ? 6.5 : 5, portrait ? 9 : 7.5));
        look = focus.clone().add(new THREE.Vector3(0, 2.2, 0));
      }
    }
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(30, 70, 70);
      camera.position.lerpVectors(sky, pos, e);
      camera.lookAt(look);
      cam.look.copy(look);
      return;
    }
    // ゆっくり動かす(はやくのときは少しだけ速く)。遠くへ移るときは、はなれているほど速く追う
    // 子や先生を追っているときは、カメラは注目点にぴったり(ゆるさは注目点の動きのほうでつける)。
    // 全体・エリア・表彰台へ切りかわるときは、ゆっくり
    const follow = cam.mode === 'slot' || cam.mode === 'owl' || cam.mode === 'ball';
    const far = Math.min(1, camera.position.distanceTo(pos) / 30);
    const rate = follow && !cam.glide ? 12 : (fast ? 2.6 : 1.5) + far * 2.5;
    const k = snap ? 1 : 1 - Math.exp(-dt * rate);
    camera.position.lerp(pos, k);
    cam.look.lerp(look, k);
    camera.lookAt(cam.look);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt);
      camera.position.x += (Math.random() - 0.5) * cam.shake * 1.2;
      camera.position.y += (Math.random() - 0.5) * cam.shake * 1.2;
    }
  }

  function frame(rawDt, draw = true) {
    const dt = Math.min(rawDt, 0.1);
    if (intro < 1 && !paused) intro = Math.min(1, intro + dt / INTRO_TIME);
    if (!paused && intro >= 1) {
      clock += dt;
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= clock) timers.splice(i, 1)[0].resolve();
    }
    if (game) {
      game.pieces.forEach((p, i) => {
        if (p.anim) {
          const a = p.anim;
          a.t += dt;
          const k = Math.min(1, a.t / a.time);
          p.holder.position.lerpVectors(a.from, a.to, k);
          if (a.hop) p.holder.position.y += Math.sin(k * Math.PI) * a.arc;
          const dx = a.to.x - a.from.x, dz = a.to.z - a.from.z;
          if (dx * dx + dz * dz > 0.01) p.face = Math.atan2(dx, dz);
          if (k >= 1) { p.anim = null; p.still = 0; a.resolve(); }
        } else {
          // 止まってしばらくしたら、カメラ(手前)のほうを向く
          p.still = (p.still || 0) + dt;
          if (p.still > 0.8) p.face = 0;
          if (p.podium) p.face = 0;
        }
        // サイコロへの頭突き(ぴょんと跳ぶ)
        let jump = 0;
        if (p.jumpT !== undefined && p.jumpT < 0.42) {
          p.jumpT += dt;
          jump = Math.sin(Math.min(1, p.jumpT / 0.42) * Math.PI) * 1.3;
        }
        // つむじ風で 巻きあげられる(くるくる 回りながら 上へ)
        let lift = 0;
        if (p.lift) {
          p.lift.t += dt;
          lift = Math.min(1, p.lift.t / p.lift.dur) ** 1.4 * 4.5;
          p.face += dt * 14;
          p.holder.rotation.y = p.face;
        }
        if (p.spin) { p.face += dt * 12; p.holder.rotation.y = p.face; }
        // 風船で ふわっと 浮く
        if (p.floatUp) {
          p.floatUp.t += dt;
          lift += Math.min(1, p.floatUp.t / p.floatUp.dur) ** 0.7 * 1.6 + Math.sin(p.floatUp.t * 3) * 0.08;
        }
        // 宙がえり(くるっと 2回)
        if (p.flip) {
          p.flip.t += dt;
          const k = Math.min(1, p.flip.t / p.flip.dur);
          lift += Math.sin(k * Math.PI) * 3.2;
          p.holder.rotation.x = k * Math.PI * 4;
          if (k >= 1) { p.flip = null; p.holder.rotation.x = 0; p.squash = 1; }
        }
        // 乗り物に 乗っている(道すじに そって 動く)
        if (p.ride) {
          const r = p.ride;
          r.t += dt;
          const k = Math.min(1, r.t / r.dur);
          const before = p.holder.position.clone();
          r.fn(k, p.holder.position, r.quat);
          if (r.quat) p.holder.quaternion.copy(r.quat);
          else {
            const dx = p.holder.position.x - before.x, dz = p.holder.position.z - before.z;
            if (dx * dx + dz * dz > 1e-6) p.face = Math.atan2(dx, dz);
          }
          if (k >= 1) {
            p.ride = null;
            if (r.quat) { p.holder.rotation.set(0, p.face, 0); }
            r.resolve();
          }
        }
        if (!p.anim && !p.podium && !p.ride) p.holder.position.y = spotOf(i).y + jump + lift;
        // ぺしゃんこ(雪玉・金の どんぐり・着地)から もどる
        if (p.squash > 0) {
          p.squash = Math.max(0, p.squash - dt * 2.2);
          const q = Math.min(1, p.squash) * 0.55;
          p.holder.scale.set(1.25 * (1 + q * 0.6), 1.25 * (1 - q), 1.25 * (1 + q * 0.6));
        } else if (p.holder.scale.y !== 1.25) p.holder.scale.setScalar(1.25);
        if (!p.lift && !p.spin && !p.ride?.quat) p.holder.rotation.y += (p.face - p.holder.rotation.y) * Math.min(1, dt * 8);
        const s = game.s;
        const busy = p.anim && p.anim.hop;
        let clip = 'idle', face = 'normal';
        if (p.react && (p.react.t -= dt) > 0) { clip = p.react.clip; face = p.react.face; } else p.react = null;
        if (busy) clip = 'run';
        if (s.phase === 'finished' && !p.react) { clip = ranking(s)[0] === i ? 'cheer' : 'wave'; face = ranking(s)[0] === i ? 'happy' : 'normal'; }
        p.model.play(clip);
        p.model.setFace(face);
        p.model.update(dt);
      });
      // サイコロ
      dice.updateBits(dt);
      if (dice.g.visible) {
        const p = game.pieces[dice.slot];
        dice.g.position.copy(p.holder.position).add(tmp.set(0, dice.state === 'count' ? 2.6 : 3.6, 0));
        if (dice.state !== 'count') dice.g.position.y = spotOf(dice.slot).y + 3.6;
        dice.t += dt;
        if (dice.state === 'spin') {
          dice.acorn.rotation.y += dt * 9;
          dice.label.scale.setScalar(0.95);
          if (dice.t > 0.06) {
            dice.t = 0;
            dice.n = (dice.n % 10) + 1;
            dice.draw(dice.n);
            sfx.tick();
          }
        } else if (dice.state === 'hit') {
          // 跳んだ頭がとどいたところで、どんぐりが割れる
          if (!dice.burstDone && dice.t > 0.2) {
            dice.burstDone = true;
            dice.acorn.visible = false;
            dice.burst();
            sfx.stop();
          }
          dice.acorn.scale.setScalar(5.5 * (1 + Math.min(0.2, dice.t) * 1.5));
          if (dice.burstDone) dice.label.scale.setScalar(1.1 + Math.max(0, 0.5 - (dice.t - 0.2)) * 1.6);
          if (dice.t > 0.7) { dice.state = 'show'; dice.t = 0.5; }
        } else if (dice.state === 'show') {
          dice.label.scale.setScalar(1.3 + Math.max(0, 0.3 - dice.t) * 2);
        } else if (dice.state === 'count') {
          dice.label.scale.setScalar(0.85);
        }
        if (dice.state !== 'hit') dice.acorn.scale.setScalar(5.5);
      }
    }
    // 先生: いまのマスへ、弧をえがいて飛んでいく。頭の上でメダルが回る。足もとに金の光の柱
    const fl = owl.root.userData.flight;
    if (fl) {
      fl.t += dt;
      const k = Math.min(1, fl.t / fl.time);
      const e2 = k * k * (3 - 2 * k);
      owl.root.position.lerpVectors(fl.from, fl.to, e2);
      owl.root.position.y += Math.sin(k * Math.PI) * fl.arc;
      const dx = fl.to.x - fl.from.x, dz = fl.to.z - fl.from.z;
      if (dx * dx + dz * dz > 0.01) owl.root.rotation.y = Math.atan2(dx, dz);
      if (k >= 1) { owl.root.userData.flight = null; owl.play('idle'); }
    } else {
      owl.root.rotation.y += (0 - owl.root.rotation.y) * Math.min(1, dt * 3); // 着いたら、手前を向く
    }
    owl.update(dt);
    medal.position.copy(owl.root.position).add(tmp.set(0, 2.5, 0));
    medal.rotation.y += dt * 2.4;
    fx.markOwl(owl.root.position);
    fx.update(dt);
    view.update(dt);
    if (game && !paused) updateAmbience(dt, st.squares[game.pieces[cam.slot]?.sq ?? 0]?.area || 'spring');
    atmosphere.update(dt);
    updateCamera(dt);
    if (draw) renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dboard = {
    get state() { return game?.s; },
    get game() { return game; },
    get mode() { return mode; },
    get intro() { return intro; },
    camera, renderer, scene,
    freeCamera: (on) => { freeCamera = on; },
    setFast: (on) => { fast = on; },
    tick: (sec) => { for (let i = 0; i < sec * 60; i++) frame(1 / 60, false); },
    show: (events) => show(events), // できごとを直接見せる(演出の確認用)
    // 表彰式だけを見せる(確認用。進行は止める)
    ceremony: () => { runId++; dice.g.visible = false; $('actsB').replaceChildren(); say(''); return ceremony(() => true).then(showResult); },
  };

  updateCamera(0, true);
  await renderer.compileAsync(scene, camera).catch(() => {});

  return {
    scene,
    camera,
    frame,
    // opts: { turns, stage }
    // resume: 保存しておいた 大会(save.js の loadTaikai)。あれば キャラ・ステージ・ターンも そちらに あわせる
    async enter(character, { fromSky = true, turns = 10, stage = 'shiki', resume = null, net = null } = {}) {
      picked = resume ? resume.picked : character;
      opts = net ? { turns: net.start.turns, stage: net.start.stage } : resume ? { turns: resume.s.turns, stage: resume.s.stage } : { turns, stage };
      st = STAGES[opts.stage];
      unlockAudio();
      active = true;
      await startTournament({ fromSky, resume, net });
      renderer.compile(scene, camera);
    },
    // 競技からもどってきたとき(タイトルが呼ぶ)
    resume() { active = true; setMode('playing'); },
    exit() {
      runId++;
      active = false;
      setMode('idle');
    },
    get intro() { return intro; },
  };
}
