// だるまさんがころんだ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、
// 結果を3Dと HUD に映す」だけ。state を書きかえるのは rules.step だけにする
// (オンライン対応のとき、step をサーバーに移せば済むように)。
//
// タイトル(src/title/title.js)と同じページで動く。描画の器(renderer)と音はタイトルから借り、
// 1フレームぶんの更新と描画は frame() をタイトルの輪から呼んでもらう。
// ルール説明とキャラえらびはタイトルの島の上でやるので、ここにはない。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { MORA, RULES, STEP, TRACK, chantCount, createGame, inMud, lookAmount, ranking, step } from './rules.js';
import { PERSONALITIES, cpuHold, createCpu } from './cpu.js';
import { PERCH, buildStage, laneX } from './stage.js';
import { createAudience } from './audience.js';
import { createAtmosphere, windify } from './atmosphere.js';
import { CRITTERS } from '../../npcs.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

// renderer: タイトルと共有の描画の器 / settings: タイトルの「せってい」(音・画質。書きかわったらそのまま効く)
// getAudio: 音の出口(まだ鳴らせないときは null) / onExit(to): やめるとき。to は 'menu'(メニューへ)か 'play'(キャラをかえる)
export async function createDaruma({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const atmosphere = createAtmosphere(scene, renderer, camera);

  const stage = buildStage(scene);
  windify(stage.group);

  // 足元の丸い影
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(20,50,20,0.38)');
    r.addColorStop(1, 'rgba(20,50,20,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  function shadow(size) {
    const m = new THREE.Mesh(shadowGeo, shadowMat);
    m.position.y = 0.012;
    m.scale.setScalar(size);
    return m;
  }

  // ── 音(数える声のかわりの ピッ) ─────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function beep(freq, len = 0.09, type = 'triangle', gain = 0.12) {
    if (!audio) return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len);
  }
  function sweep(from, to, len, type = 'square', gain = 0.06) {
    if (!audio) return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len);
  }
  // ガサガサ(落ち葉): 雑音を短く何回か
  function rustleSound() {
    if (!audio) return;
    const len = 0.5;
    const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audio.sampleRate;
      const burst = Math.max(0, Math.sin(t * 38)) ** 3; // 細かく途切れる
      d[i] = (Math.random() * 2 - 1) * burst * (1 - t / len);
    }
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    const g = audio.createGain();
    g.gain.value = 0.35;
    src.connect(f).connect(g).connect(audio.destination);
    src.start();
  }

  // ── 読み込み ────────────────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', ...CRITTERS.map((c) => c.key)]);
  const audience = await createAudience(scene);
  const owl = await createModel('hoho');
  owl.root.position.copy(PERCH); // 大木の低い枝の上
  owl.root.rotation.y = Math.PI; // 体はうしろ(大木の幹)を向く
  owl.play('idle');
  owl.setFace('normal');
  scene.add(owl.root);
  const owlHead = owl.node('head');
  atmosphere.attachOwlEyes(owlHead);
  atmosphere.setupShadows([stage.group, owl.root], [stage.group]);
  atmosphere.setupShadows([], audience.roots); // 観客は小さいので影は落とさない(受けるだけ)

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle'; // idle(タイトルにいる)→ playing → result
  let picked = CHARACTERS[0].key;
  let tour = null; // 大会から呼ばれているとき { lineup, onFinish }
  let game = null; // { state, players, cpus, runners(見た目), acc, endTimer }
  let held = false;
  // 空から広場へ降りてくる演出(0 → 1)。降りきるまでは「よーい」を始めない
  let intro = 1;
  const INTRO_TIME = 2.6;

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    // 前のゲームの片付け
    if (game) for (const r of game.runners) scene.remove(r.holder);

    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      model.root.rotation.y = Math.PI; // ゴールのほうを向く
      const def = CHARACTERS.find((c) => c.key === p.character);
      const sh = shadow(0.95 * (def.size || 1));
      holder.add(sh);
      holder.position.set(laneX(slot), 0, 0);
      scene.add(holder);
      return { model, holder, shadow: sh, size: def.size || 1, x: 0 };
    }));
    // 自分の頭の上の目印
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;

    game = {
      seed,
      players,
      state: createGame(players, seed),
      cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)),
      runners,
      acc: 0,
      endTimer: null,
      lastCount: 0,
    };
    held = false;
    paused = false;
    stage.setGame(game.state);
    atmosphere.apply(params.get('time') || game.state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.model.root), runners.map((r) => r.model.root));
    audience.reset();
    buildTrackDots();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    // 大会のあいだは「さいしょから」「キャラをかえる」は出さない
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hud').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }

  function leave(to) {
    press(false);
    onExit(to);
  }

  // ── 一時停止 ────────────────────────────────────────
  // ブラウザの戻るボタンは無いものとして作る(PWA にしたとき無いので)。
  // プレイ中にやめたいときは、右上のボタンからメニューを開く。
  // アプリを裏に回したとき・画面を切ったときも、自動で止める。
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; } // ほかの競技の いちじていし にさわらない
    paused = on && mode === 'playing';
    if (paused) press(false);
    $('pause').hidden = !paused;
  }
  // いちじていし・結果の画面は、ほかの競技と共有している。この競技の会場にいるときだけ反応する
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtn').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力 ────────────────────────────────────────────
  function press(on) {
    if (mode !== 'playing' || (on && (paused || intro < 1))) return;
    held = on;
    $('run').classList.toggle('down', on);
  }
  const runBtn = $('run');
  runBtn.addEventListener('pointerdown', (e) => {
    unlockAudio();
    runBtn.setPointerCapture(e.pointerId);
    press(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) runBtn.addEventListener(ev, () => press(false));
  // ボタンの外を押しても走れる(押したまま指がずれても止まらないように)
  window.addEventListener('pointerdown', (e) => {
    // 一時停止ボタンやメニューを押したときは走らない
    if (mode !== 'playing' || paused || e.target === runBtn || e.target.closest('button, a')) return;
    unlockAudio();
    press(true);
  });
  window.addEventListener('pointerup', (e) => { if (e.target !== runBtn) press(false); });
  window.addEventListener('blur', () => press(false));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      setPaused(!paused);
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      unlockAudio();
      if (!e.repeat) press(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') press(false);
  });
  document.addEventListener('contextmenu', (e) => { if (mode !== 'idle') e.preventDefault(); });

  // ── HUD ─────────────────────────────────────────────
  function splash(text, red = false) {
    const el = $('splash');
    el.textContent = text;
    el.classList.toggle('red', red);
    el.classList.remove('show');
    void el.offsetWidth; // アニメーションをやり直す
    el.classList.add('show');
  }

  function buildTrackDots() {
    $('track').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'dot' + (slot === 0 ? ' me' : '');
      d.style.background = css(PLAYER_COLORS[slot].hex);
      d.title = p.name;
      return d;
    }));
  }

  function renderHud() {
    const s = game.state;
    const chant = $('chant');
    const count = chantCount(s);
    if (s.phase === 'ready') {
      if (chant.dataset.mode !== 'ready') {
        chant.dataset.mode = 'ready';
        chant.className = 'chant';
        chant.innerHTML = '<span class="msg">よーい…</span>';
      }
    } else {
      if (chant.dataset.mode !== 'mora') {
        chant.dataset.mode = 'mora';
        chant.replaceChildren(...MORA.map((m) => Object.assign(document.createElement('span'), { textContent: m })));
      }
      chant.classList.toggle('watch', s.phase === 'turn' || s.phase === 'watch');
      [...chant.children].forEach((el, i) => el.classList.toggle('on', i < count));
    }
    const left = Math.max(0, RULES.timeLimit - Math.max(0, s.t - RULES.readyTime));
    $('timer').firstChild.nodeValue = String(Math.ceil(left));
    $('acorns').lastChild.nodeValue = String(s.runners[0].acorns);
    const dots = $('track').children;
    s.runners.forEach((r, i) => {
      dots[i].style.bottom = `calc(10px + (100% - 20px) * ${(game.runners[i].x / TRACK).toFixed(4)})`;
      dots[i].classList.toggle('stun', r.stun > 0);
    });
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      stage.onEvent(e, s);
      audience.onEvent(e, s, laneX);
      switch (e.type) {
        case 'chant':
          owl.setFace('normal');
          owl.play('chant', { timeScale: 2.5 / s.chant.length });
          game.lastCount = 0;
          break;
        case 'fake':
          owl.play('idle');
          splash('……?');
          break;
        case 'resume':
          owl.play('chant', { timeScale: 2.5 / s.chant.length });
          break;
        case 'turn':
          sweep(300, 900, 0.25, 'sawtooth', 0.05);
          splash('ころんだ!', true);
          owl.play('idle');
          break;
        case 'watch':
          owl.setFace('glare');
          break;
        case 'rustle':
          rustleSound();
          if (e.slot === 0) splash('ガサガサッ!');
          break;
        case 'pickup':
          beep(1046, 0.08, 'sine', 0.1); setTimeout(() => beep(1568, 0.12, 'sine', 0.1), 70);
          break;
        case 'drop':
          beep(180, 0.08, 'sine', 0.12);
          break;
        case 'bonk':
          sweep(260, 90, 0.18, 'square', 0.08);
          if (e.slot === 0) splash('ゴツン!');
          break;
        case 'caught':
          owl.play('flap', { fade: 0.1 });
          sweep(700, 120, 0.4, 'square', 0.07);
          if (e.slot === 0) splash('みつかった!', true);
          break;
        case 'back':
          owl.setFace('normal');
          owl.play('idle');
          break;
        case 'goal':
          beep(784, 0.12); setTimeout(() => beep(1046, 0.25), 120);
          splash(e.slot === 0 ? 'ゴール!' : `${game.players[e.slot].name} ゴール!`);
          break;
        case 'timeup':
          splash('そこまで!');
          break;
        case 'finished':
          game.endTimer = 2.6;
          break;
      }
    }
    // 数える声のかわりに、1文字ごとに ピッ
    const count = chantCount(s);
    if (s.phase === 'chant' && count > game.lastCount) {
      for (let i = game.lastCount; i < count; i++) beep(520 + i * 28, 0.07);
      game.lastCount = count;
    }
  }

  function showResult() {
    const s = game.state;
    if (tour) {
      // 大会: 結果画面は出さずに、順位(と拾ったどんぐり)を返す
      const done = tour.onFinish;
      setMode('idle');
      done({ ranking: ranking(s), picked: s.runners.map((r) => r.acorns) });
      return;
    }
    const order = ranking(s);
    const winner = game.players[s.winner];
    $('resultTitle').textContent = s.winner === 0 ? 'あなたの勝ち!' : `${winner.name}の勝ち!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      const dist = (r.finishTime !== null ? 'ゴール' : `のこり ${(TRACK - r.x).toFixed(1)}m`) + `<small>どんぐり ${r.acorns}</small>`;
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${dist}</span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 結果のボタン ────────────────────────────────────
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));

  // ── 見た目を state に合わせる ─────────────────────────
  function updateRunners(dt) {
    const s = game.state;
    const done = s.phase === 'finished';
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      // 見つかって戻されたときは、すっと引き戻す(瞬間移動に見せない)
      const diff = r.x - v.x;
      v.x = Math.abs(diff) > 0.3 ? v.x + diff * (1 - Math.exp(-dt * 7)) : r.x;
      v.holder.position.set(laneX(i), 0, -v.x);
      // ぬかるみを走ると泥がはねる
      if (r.v > 0.3 && inMud(s.lanes[i], r.x) && Math.random() < dt * 14 * (r.v / RULES.maxSpeed)) stage.splash(laneX(i), -r.x, 2);
      let clip = 'idle', face = 'normal', timeScale = 1;
      if (r.stun > 0) {
        clip = 'dizzy';
        face = 'frustrated';
      } else if (r.finishTime !== null || (done && s.winner === i)) {
        clip = 'cheer';
        face = 'happy';
      } else if (r.v > 0.1) {
        clip = 'run';
        timeScale = 0.5 + 0.7 * (r.v / RULES.maxSpeed);
      } else if (done) {
        face = 'frustrated';
      } else if (s.phase === 'turn' || s.phase === 'watch') {
        face = 'surprised';
      }
      // 決着したら、勝った人はみんなのほうへふり向く
      const turn = done && s.winner === i ? 0 : Math.PI;
      v.model.root.rotation.y += (turn - v.model.root.rotation.y) * (1 - Math.exp(-dt * 6));
      v.model.play(clip, { timeScale });
      v.model.setFace(face);
      v.model.update(dt);
      const lift = v.model.node('rig').position.y;
      v.shadow.scale.setScalar(0.95 * v.size * (1 - Math.min(0.5, lift * 0.9)));
      if (v.marker) v.marker.position.set(0, 2.05 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
  }

  let freeCamera = false; // E2E でカメラを自由に置くとき
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    let z, pos, look;
    const s = game?.state;
    if (s && s.phase === 'finished' && game.endTimer !== null || mode === 'result') {
      // 決着: 勝った人を正面(先生の側)から映す
      const w = s.winner;
      const wz = -game.runners[w].x;
      // 勝った人はコースのほうへふり向いて喜ぶ。それをコース側から、大木と先生を背景に映す
      // (ゴールの向こう側から映すと、大木の根や枝がカメラにかぶる)
      pos = new THREE.Vector3(laneX(w) * 0.6, 1.9, wz + (portrait ? 5.2 : 4.2));
      look = new THREE.Vector3(laneX(w) * 0.9, 1.3, wz - 1);
    } else if (mode === 'playing') {
      // 自分のうしろ。5レーン全部が入るよう引きぎみにして、少しだけ自分の側へ寄せる
      z = -game.runners[0].x;
      const bias = laneX(0) * 0.3;
      pos = new THREE.Vector3(bias, portrait ? 7.2 : 4.6, z + (portrait ? 11 : 7.5));
      look = new THREE.Vector3(bias, 0.4, Math.max(-TRACK - 1, z - (portrait ? 6 : 7.5)));
    } else {
      // 待っているあいだ: コース全体と先生
      pos = new THREE.Vector3(0, portrait ? 10 : 8, portrait ? 12 : 9);
      look = new THREE.Vector3(0, 0, -TRACK / 2 - 2);
    }
    camera.fov = portrait ? 60 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      // 空から広場へ降りてくる: 高いところから見下ろして、くるっと回りこみながら自分のうしろへ
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(pos.x - 6, pos.y + 34, pos.z - 14);
      const skyLook = new THREE.Vector3(0, 0, -TRACK / 2);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(skyLook, look, Math.min(1, e * 1.15));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
  }

  // ── 重さに合わせて画質を下げる ──────────────────────────
  // 2秒ごとに1フレームの平均時間を見て、遅ければ 解像度 → 影 の順に下げる。
  // ?fps を付けると、左下に1秒あたりのフレーム数を出す(実機で重さを確かめる用)。
  // 「かるい」ははじめから一番下、「きれい」は下げない。
  // renderer はタイトルと共有なので、会場に入るたびに applyQuality() で合わせなおす。
  const quality = { level: 0, sum: 0, n: 0, timer: 0, shadows: true };
  function applyQuality() {
    if (settings.quality === 'light') quality.level = 2;
    if (settings.quality === 'high') quality.level = 0;
    renderer.setPixelRatio(quality.level === 0 ? Math.min(devicePixelRatio, 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 1);
    renderer.setSize(innerWidth, innerHeight, false);
    // 影を切りかえたときだけ、素材を組み立てなおす(重いので、変わらないときはしない)
    const shadows = quality.level < 2;
    renderer.shadowMap.enabled = shadows;
    if (quality.shadows !== shadows) scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    quality.shadows = shadows;
  }
  const fpsEl = params.has('fps') ? Object.assign(document.body.appendChild(document.createElement('div')), {
    style: 'position:fixed;left:8px;bottom:8px;z-index:9;background:rgba(0,0,0,.6);color:#fff;font:12px monospace;padding:3px 6px;border-radius:6px;pointer-events:none',
  }) : null;
  function watchQuality(rawDt) {
    quality.sum += rawDt;
    quality.n++;
    quality.timer += rawDt;
    if (quality.timer < 2) return;
    const avg = quality.sum / quality.n;
    if (fpsEl) fpsEl.textContent = `${(1 / avg).toFixed(0)} fps / 画質 ${['高', '中', '低'][quality.level]} / ${renderer.info.render.calls} 回`;
    quality.sum = quality.n = quality.timer = 0;
    if (avg < 1 / 40 || quality.level >= 2 || settings.quality === 'high') return; // 40fps 以上出ていれば下げない
    quality.level++; // 1: 解像度を下げる 2: 影を切る(影のための2回目の描画がなくなる)
    applyQuality();
  }

  // ── 1フレーム(タイトルの輪から呼ばれる) ─────────────────
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
    }
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const holds = game.players.map((p, slot) => (p.cpu ? cpuHold(game.cpus[slot], s, slot) : held));
        onEvents(step(s, holds));
        game.acc -= STEP;
      }
      if (game.endTimer !== null) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) {
          game.endTimer = null;
          showResult();
        }
      }
    }
    if (game && mode === 'playing') renderHud();
    if (game && !paused) {
      updateRunners(dt);
      stage.update(dt, game.state);
    }
    if (!paused) audience.update(dt, game && mode === 'playing' ? game.state : null);
    atmosphere.update(dt);
    // 先生の首: 0 = うしろ、1 = こっち。回り始めと終わりをなめらかに
    const look = !game || mode === 'idle' ? 0 : game.state.phase === 'finished' ? 1 : lookAmount(game.state);
    owlHead.rotation.y = Math.PI * (look * look * (3 - 2 * look));
    if (!paused) owl.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.daruma = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    hold: (on) => press(on),
    get paused() { return paused; },
    camera,
    renderer,
    scene,
    freeCamera: (on) => { freeCamera = on; },
    setTime: (key) => atmosphere.apply(key),
    // 指定した場所にどんぐりを落とす(演出の確認用)
    dropAt: (lane, x) => {
      const d = { lane, x, left: RULES.dropWarn };
      game.state.drops.push(d);
      onEvents([{ type: 'dropWarn', ...d }]);
    },
  };

  updateCamera(0, true);
  // シェーダーを先に組み立てておく(会場に入った瞬間に固まらないように)
  await renderer.compileAsync(scene, camera).catch(() => {});

  return {
    scene,
    camera,
    frame,
    // 会場に入る。fromSky: 空から降りてくる演出つき
    // 大会から呼ぶときは lineup(顔ぶれ)と onFinish(順位を返す)をわたす。そのときは結果画面を出さない
    async enter(character, { fromSky = true, lineup = null, onFinish = null } = {}) {
      picked = character;
      tour = onFinish ? { lineup, onFinish } : null;
      unlockAudio();
      applyQuality();
      await startGame({ fromSky });
      renderer.compile(scene, camera);
    },
    // 会場を出る(タイトルへ)
    exit() {
      setMode('idle');
      press(false);
    },
    // 空から降りてくる演出を、あとから始める(葉っぱで画面をかくしているあいだに準備して、ひらいてから降りる)
    get intro() { return intro; },
  };
}
