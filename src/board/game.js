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
import { buildBoardScene } from './scene.js';
import { simulate } from './simulate.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const params = new URLSearchParams(location.search);
const GAME_NAMES = { daruma: 'だるまさんが ころんだ', catch: 'どんぐりキャッチ', sled: '落ち葉そりレース', mato: 'まつぼっくり的あて' };
const AREA_HAPPEN = { spring: '春の雨! 池があふれた', summer: 'どんぐりの雨!', autumn: 'つむじ風!', winter: '雪玉ころころ!' };

export async function createBoard({ renderer, settings, getAudio, onExit, playMinigame }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  atmosphere.sun.target.position.set(0, 0, 0);
  let st = STAGES.shiki;
  const view = buildBoardScene(scene, st);

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
  const sfx = {
    hop: (i) => voice({ type: 'triangle', pts: [[0, 520 + (i % 5) * 40], [0.08, 700 + (i % 5) * 40]], len: 0.1, gain: 0.05 }),
    tick: () => voice({ type: 'square', pts: [[0, 1400]], len: 0.03, gain: 0.02 }),
    stop: () => { voice({ type: 'triangle', pts: [[0, 880], [0.1, 1320]], len: 0.2, gain: 0.1 }); },
    gain: () => [1047, 1319].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.12, gain: 0.07, at: i * 0.06 })),
    lose: () => voice({ type: 'square', pts: [[0, 400], [0.25, 180]], len: 0.3, gain: 0.05 }),
    medal: () => [784, 988, 1175, 1568, 2093].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.3, gain: 0.09, at: i * 0.1 })),
    banner: () => voice({ type: 'sine', pts: [[0, 660], [0.12, 990]], len: 0.16, gain: 0.06 }),
    happen: () => [523, 466, 523, 698].forEach((f, i) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.04, at: i * 0.09 })),
  };

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
    return { g, acorn, draw, n: 1, spin: false, t: 0 };
  })();

  // ── コマ ──────────────────────────────────────────
  let game = null; // { s, players, pieces, cpus, ... }
  const tmp = new THREE.Vector3();
  function spotOf(i) {
    // 同じマスに何人かいたら、まるく並べる
    const s = game.s;
    const sq = game.pieces[i].sq;
    const here = s.players.map((_, k) => k).filter((k) => game.pieces[k].sq === sq);
    const pos = view.squarePos(sq, new THREE.Vector3());
    if (here.length > 1) {
      const k = here.indexOf(i);
      const a = (k / here.length) * Math.PI * 2;
      pos.x += Math.cos(a) * 0.5;
      pos.z += Math.sin(a) * 0.5;
    }
    return pos;
  }
  // コマを sq へ(はねる / すべる)。おわったら resolve
  function movePiece(i, sq, { hop = true, time = 0.24 } = {}) {
    const p = game.pieces[i];
    const from = p.holder.position.clone();
    p.sq = sq;
    const to = spotOf(i);
    return new Promise((resolve) => { p.anim = { from, to, t: 0, time, hop, resolve }; });
  }
  function settlePieces() {
    game.pieces.forEach((p, i) => { if (!p.anim) p.holder.position.copy(spotOf(i)); });
  }

  // ── 時間: 一時停止のあいだは止まる。「はやく」で3倍 ─────────────
  let clock = 0, fast = false, paused = false;
  const timers = [];
  const sleep = (sec) => new Promise((resolve) => timers.push({ at: clock + sec, resolve }));
  const speed = () => (fast ? 3 : 1);

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
  function name(i) { return i === 0 ? 'あなた' : game.players[i].name; }
  function renderCards() {
    const s = game.s;
    $('cardsB').replaceChildren(...(s.order.length ? s.order : s.players.map((_, i) => i)).map((i) => {
      const p = s.players[i];
      const d = document.createElement('div');
      d.className = 'bcard' + (i === 0 ? ' me' : '') + (s.phase === 'turn' && currentSlot(s) === i ? ' now' : '');
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

  // ── 大会のはじまり ──────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let opts = { turns: 10, stage: 'shiki' };
  let intro = 1;
  const INTRO_TIME = 3.2;
  let focus = new THREE.Vector3(), overview = true;
  let runId = 0;

  async function startTournament({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const pick = { rng: seedFrom(`${seed}:pick`) };
    const others = CHARACTERS.filter((c) => c.key !== picked).map((c) => c.key);
    const kinds = Object.keys(PERSONALITIES);
    const players = [{ character: picked, cpu: null, name: 'あなた' }];
    while (players.length < 5) {
      const key = others.splice(Math.floor(nextRandom(pick) * others.length), 1)[0];
      players.push({ character: key, cpu: kinds[Math.floor(nextRandom(pick) * kinds.length)], name: CHARACTERS.find((c) => c.key === key).name });
    }
    if (game) for (const p of game.pieces) scene.remove(p.holder);
    const s = createTournament(players, seed, { turns: opts.turns, stage: opts.stage });
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
    game = { s, seed, players, pieces, cpus: players.map((p, i) => (p.cpu ? createCpu(p.cpu, seed, i) : null)) };
    settlePieces();
    atmosphere.apply(params.get('time') || 'day');
    atmosphere.setupShadows(pieces.map((p) => p.holder), pieces.map((p) => p.holder));
    placeOwl(s.owl, true);
    setMode('playing');
    intro = fromSky ? 0 : 1;
    overview = true;
    renderCards();
    const id = ++runId;
    drive(id); // 進行(非同期でずっと回る。新しい大会が始まったら止まる)
  }

  function placeOwl(sq, snap = false) {
    const to = view.squarePos(sq, new THREE.Vector3());
    owl.root.userData.to = to;
    if (snap) owl.root.position.copy(to);
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

  // ── できごとを見せる ──────────────────────────────
  async function show(events) {
    const s = game.s;
    for (const e of events) {
      switch (e.type) {
        case 'orderRoll':
          showDice(e.slot, e.value);
          await sleep(0.8 / speed());
          break;
        case 'order':
          renderCards();
          splash(`${name(e.order[0])} から!`);
          await sleep(1.4 / speed());
          break;
        case 'turn':
          overview = true;
          renderCards();
          splash(`ターン ${e.turn}`, e.spurt ? 'gold' : '');
          await sleep(1.1 / speed());
          break;
        case 'spurt':
          splash('ラストスパート! 青も赤も2倍', 'gold');
          await sleep(1.6 / speed());
          break;
        case 'player':
          overview = false;
          renderCards();
          say(`${name(e.slot)}の番`);
          await sleep(0.4 / speed());
          break;
        case 'dice':
          // 止めたサイコロに、ほんとうの目を出す(2つ・3つのときは合計)
          showDice(e.slot, e.total, e.values.length > 1 ? e.values.join('+') : '');
          await sleep(0.7 / speed());
          break;
        case 'step':
          sfx.hop(e.left);
          await movePiece(e.slot, e.to, { time: 0.22 / speed() });
          settlePieces();
          break;
        case 'slide':
        case 'iceSlide':
          splash(e.type === 'slide' ? 'すべり台!' : 'つるつる!');
          await movePiece(e.slot, e.to, { hop: false, time: 0.8 / speed() });
          settlePieces();
          break;
        case 'pushBack':
        case 'blown':
        case 'swap': {
          if (e.type === 'swap') {
            const a = game.pieces[e.slot], b = game.pieces[e.target];
            const sa = b.sq, sb = a.sq;
            await Promise.all([movePiece(e.slot, sa, { time: 0.6 / speed() }), movePiece(e.target, sb, { time: 0.6 / speed() })]);
          } else await movePiece(e.slot, e.to, { time: 0.6 / speed() });
          settlePieces();
          break;
        }
        case 'acorns':
          if (e.delta > 0) sfx.gain(); else if (e.delta < 0) sfx.lose();
          pop(`${e.delta >= 0 ? '+' : ''}${e.delta}`, e.slot, e.delta >= 0 ? (e.slot === 0 ? 'me' : '') : 'red');
          renderCards();
          await sleep(0.45 / speed());
          break;
        case 'medal':
          sfx.medal();
          splash(`${name(e.slot)} メダルゲット!`, 'gold');
          renderCards();
          await sleep(1.6 / speed());
          break;
        case 'owlMove':
          splash('先生が飛んでいく!');
          placeOwl(e.to);
          await sleep(1.4 / speed());
          break;
        case 'owlPoor':
          say(`${name(e.slot)}: どんぐりが足りない…`);
          await sleep(0.6 / speed());
          break;
        case 'getItem':
        case 'buyItem':
          splash(`${name(e.slot)}: ${ITEMS[e.item].name}`);
          renderCards();
          await sleep(1.0 / speed());
          break;
        case 'useItem':
          splash(`${ITEMS[e.item].name}!`);
          renderCards();
          await sleep(1.0 / speed());
          break;
        case 'happen':
          sfx.happen();
          splash(AREA_HAPPEN[e.area] || 'ハプニング!', 'red');
          await sleep(1.4 / speed());
          break;
        case 'duel':
          splash(`対決! ${name(e.a)} vs ${name(e.b)}`, 'gold');
          await sleep(1.6 / speed());
          break;
        case 'duelEnd':
          splash(`${name(e.winner)} の勝ち! +${e.stake}`);
          renderCards();
          await sleep(1.4 / speed());
          break;
        case 'duelSkip':
          await sleep(0.3 / speed());
          break;
        case 'minigame':
          overview = true;
          splash(`競技: ${GAME_NAMES[e.game]}`, 'gold');
          await sleep(1.8 / speed());
          break;
        case 'minigameEnd':
          renderCards();
          await sleep(0.8 / speed());
          break;
        case 'bonus':
          overview = true;
          splash(`ボーナス: ${e.name}`, 'gold');
          await sleep(1.4 / speed());
          if (e.who.length) {
            for (const i of e.who) pop('メダル+1', i, 'gold');
            splash(`${e.who.map(name).join('・')}!`);
            sfx.medal();
          } else splash('なし');
          renderCards();
          await sleep(1.6 / speed());
          break;
      }
    }
  }

  // ── 進行 ────────────────────────────────────────
  async function drive(id) {
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
        else await sleep(0.7 / speed());
        action = cpuAct(game.cpus[pend.slot], s, pend.slot);
      }
      if (!live()) return;
      const ev = act(s, action);
      if (ev[0]?.type === 'invalid') console.warn('できない操作', pend, action, ev[0]);
      await show(ev);
    }
    if (live()) showResult();
  }

  // サイコロ: 頭の上で回る。人はタップで止める。CPU は少しして止める
  function rollDice(slot, human) {
    const p = game.pieces[slot];
    focus.copy(p.holder.position);
    dice.g.visible = true;
    dice.spin = true;
    dice.slot = slot;
    if (!human) return sleep(0.9 / speed()).then(stopDice);
    say('タップで止める!');
    return new Promise((resolve) => {
      const btn = { label: 'とめる!', value: 'stop', main: true };
      const tap = (e) => { if (e.target.closest('button') && !e.target.closest('#actsB')) return; done(); };
      const done = () => { window.removeEventListener('pointerdown', tap); $('actsB').replaceChildren(); stopDice(); resolve(); };
      window.addEventListener('pointerdown', tap);
      choose('タップで止める!', [btn]).then(done);
    });
  }
  function showDice(slot, n, detail) {
    dice.slot = slot;
    dice.spin = false;
    dice.g.visible = true;
    dice.t = 0;
    dice.draw(n);
    dice.pop = 0;
    if (detail) say(detail);
  }
  function stopDice() {
    dice.spin = false;
    sfx.stop();
    say('');
  }
  async function humanAct(pend) {
    const s = game.s;
    const me = s.players[0];
    const a = (type, extra = {}) => ({ slot: 0, type, ...extra });
    switch (pend.type) {
      case 'orderRoll':
      case 'roll': {
        await rollDice(0, true);
        return a('roll');
      }
      case 'item': {
        const v = await choose('どうぐをつかう?', [...me.items.map((k, i) => ({ label: ITEMS[k].name, value: i })), { label: 'つかわない', value: -1, main: true }]);
        return v < 0 ? a('skipItem') : a('useItem', { index: v });
      }
      case 'swapPick': {
        const v = await choose('だれと入れかえる?', s.players.map((_, i) => i).filter((i) => i !== 0).map((i) => ({ label: name(i), value: i })));
        return a('swap', { target: v });
      }
      case 'branch': {
        const label = (to) => (st.squares[to].path === 'lily' ? 'ハスの近道' : st.squares[to].path === 'ice' ? '氷の近道' : 'このまま');
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
      case 'duelPick': {
        const v = await choose('対決: だれと勝負する?', [
          ...s.players.map((_, i) => i).filter((i) => i !== 0).map((i) => ({ label: `${name(i)}<small>${s.players[i].acorns}</small>`, value: i, disabled: s.players[i].acorns <= 0 })),
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
    const res = await playMinigame(key, lineup, picked);
    active = true;
    setMode('playing');
    return { type: 'duelResult', winner: res.ranking[0] === 0 ? 0 : other };
  }

  function showResult() {
    const s = game.s;
    const order = ranking(s);
    const w = order[0];
    $('resultTitle').textContent = w === 0 ? 'あなたの優勝!' : `${game.players[w].name}の優勝!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = s.players[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = game.players[slot].cpu ? `CPU(${PERSONALITIES[game.players[slot].cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === game.players[slot].character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">メダル ${p.medals}<small>どんぐり ${p.acorns}</small></span>`;
      return li;
    }));
    if (w === 0) sfx.medal();
    setMode('result');
  }

  // ── 毎フレーム ──────────────────────────────────
  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    camera.fov = portrait ? 58 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    let pos, look;
    if (overview || !game) {
      // 島ぜんたい
      pos = new THREE.Vector3(0, portrait ? 74 : 40, portrait ? 52 : 36);
      look = new THREE.Vector3(0, 0, portrait ? 3 : 1);
    } else {
      const p = game.pieces[currentSlot(game.s)]?.holder.position || focus;
      focus.lerp(p, Math.min(1, dt * 6));
      pos = focus.clone().add(new THREE.Vector3(0, portrait ? 13 : 10, portrait ? 12 : 10));
      look = focus.clone().add(new THREE.Vector3(0, 0.6, 0));
    }
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(30, 70, 70);
      camera.position.lerpVectors(sky, pos, e);
      camera.lookAt(look);
      camera.userData.look = look.clone();
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.5);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
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
          if (a.hop) p.holder.position.y += Math.sin(k * Math.PI) * 0.7;
          const dx = a.to.x - a.from.x, dz = a.to.z - a.from.z;
          if (dx * dx + dz * dz > 0.01) p.face = Math.atan2(dx, dz);
          if (k >= 1) { p.anim = null; a.resolve(); }
        }
        p.holder.rotation.y += (p.face - p.holder.rotation.y) * Math.min(1, dt * 10);
        const s = game.s;
        const busy = p.anim && p.anim.hop;
        p.model.play(s.phase === 'finished' ? (ranking(s)[0] === i ? 'cheer' : 'wave') : busy ? 'run' : 'idle');
        p.model.update(dt);
      });
      // サイコロ
      if (dice.g.visible) {
        const p = game.pieces[dice.slot];
        dice.g.position.copy(p.holder.position).add(new THREE.Vector3(0, 3.4, 0));
        dice.t += dt;
        if (dice.spin) {
          dice.acorn.rotation.y += dt * 9;
          if (dice.t > 0.06) {
            dice.t = 0;
            dice.n = (dice.n % 10) + 1;
            dice.draw(dice.n);
            sfx.tick();
          }
        } else {
          // ほんとうの目が出たら、ぽんとふくらむ
          dice.g.scale.setScalar(1 + Math.max(0, 0.35 - dice.t) * 1.2);
          if (dice.t > 1.1) { dice.g.visible = false; dice.g.scale.setScalar(1); }
        }
      }
    }
    // 先生: いまのマスへ飛んでいく。頭の上でメダルが回る
    const to = owl.root.userData.to;
    if (to) owl.root.position.lerp(tmp.copy(to).setY(to.y + (owl.root.position.distanceTo(to) > 0.3 ? 2 : 0)), Math.min(1, dt * 2.5));
    owl.root.rotation.y += dt * 0.3;
    owl.update(dt);
    medal.position.copy(owl.root.position).add(new THREE.Vector3(0, 2.5, 0));
    medal.rotation.y += dt * 2.4;
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
  };

  updateCamera(0, true);
  await renderer.compileAsync(scene, camera).catch(() => {});

  return {
    scene,
    camera,
    frame,
    // opts: { turns, stage }
    async enter(character, { fromSky = true, turns = 10, stage = 'shiki' } = {}) {
      picked = character;
      opts = { turns, stage };
      st = STAGES[stage];
      unlockAudio();
      active = true;
      await startTournament({ fromSky });
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
