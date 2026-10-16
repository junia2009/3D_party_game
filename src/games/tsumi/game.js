// どんぐりつみ の画面(会場・キャラ・ゆれるもの・山・くずれる演出・HUD)。
// ルールは rules.js、CPU は cpu.js。ここは state を読んで描くだけ(state を書くのは rules.step だけ)。
//
// 操作: 自分の番に、画面のどこかをタップ(PC はスペース)すると、ゆれているものを落とす。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { KINDS, RULES, STEP, createGame, ranking, stability, stackTop, step, swingX, tryPlace } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { BRANCH_Y, SEATS, STUMP_H, STUMP_R, buildStage, waitSpot } from './stage.js';
import { pieceMeshes } from './pieces.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

export async function createTsumi({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  atmosphere.sun.target.position.set(0, 1, 0);
  const stage = buildStage(scene);
  const makePiece = pieceMeshes();

  // ── 音 ──────────────────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function voice({ type = 'sine', pts, len, gain = 0.1, at = 0, vib = 0, vibRate = 12 }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(pts[0][1], t);
    for (const [dt, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t + dt);
    if (vib) {
      const l = audio.createOscillator(), lg = audio.createGain();
      l.frequency.value = vibRate;
      lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + len);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  let noiseBuf = null;
  function hiss({ type = 'bandpass', f0, f1 = f0, q = 1, len, gain = 0.1, at = 0, attack = 0.005 }) {
    if (!audio) return;
    if (!noiseBuf) {
      noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = audio.currentTime + at;
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = audio.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.05);
  }
  const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
  const sfx = {
    drop: () => hiss({ f0: 1800, f1: 600, q: 2, len: 0.35, gain: 0.05, attack: 0.02 }),
    // 乗った: ことん(高くなるほど音が上がる)
    land: (h, kind) => {
      // 高くなるほど音が上がる(ドレミ…で 2 オクターブまで)
      const up = 2 ** (SCALE[Math.min(h - 1, SCALE.length - 1)] / 12);
      const soft = kind === 'leaf' || kind === 'mushroom';
      voice({ type: 'triangle', pts: [[0, (soft ? 300 : 520) * up], [0.05, (soft ? 220 : 380) * up]], len: 0.12, gain: 0.12 });
      voice({ type: 'sine', pts: [[0, 1046 * up]], len: 0.25, gain: 0.04, at: 0.05 });
    },
    close: () => voice({ type: 'sine', pts: [[0, 660], [0.15, 600], [0.3, 680]], len: 0.4, gain: 0.04, vib: 20, vibRate: 9 }), // ぐらぐら…
    collapse: () => {
      for (let i = 0; i < 10; i++) voice({ type: 'triangle', pts: [[0, 400 - i * 25], [0.08, 200 - i * 10]], len: 0.12, gain: 0.08, at: i * 0.07 });
      hiss({ type: 'lowpass', f0: 900, f1: 200, len: 0.9, gain: 0.08, at: 0.1 });
      voice({ type: 'square', pts: [[0, 330], [0.4, 160]], len: 0.5, gain: 0.04, at: 0.2 });
    },
    miss: () => { hiss({ f0: 2000, f1: 400, len: 0.5, gain: 0.05 }); voice({ type: 'triangle', pts: [[0, 200], [0.1, 120]], len: 0.15, gain: 0.08, at: 0.45 }); },
    out: () => [523, 440, 349].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.2, gain: 0.06, at: i * 0.14 })),
    turn: () => [659, 880].forEach((f, i) => voice({ type: 'sine', pts: [[0, f]], len: 0.15, gain: 0.05, at: i * 0.07 })),
    myTurn: () => [784, 988, 1175].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.18, gain: 0.07, at: i * 0.08 })),
    tick: () => voice({ type: 'square', pts: [[0, 1568]], len: 0.05, gain: 0.04 }),
    beep: (hi) => voice({ type: 'square', pts: [[0, hi ? 1046 : 523]], len: hi ? 0.4 : 0.15, gain: 0.06 }),
    whistle: () => voice({ type: 'sine', pts: [[0, 2000], [0.5, 2100]], len: 0.6, gain: 0.08, vib: 60, vibRate: 30 }),
    fanfare: () => [784, 988, 1175, 1568].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.3 + i * 0.1, gain: 0.1, at: i * 0.13 })),
    finish: () => [659, 784].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.35, gain: 0.07, at: i * 0.16 })),
    // 5だん: きらりん / 10だん: ファンファーレ / 記録: のぼる音
    chime: () => [1319, 1568, 2093].forEach((f, i) => voice({ type: 'sine', pts: [[0, f]], len: 0.35, gain: 0.05, at: i * 0.06 })),
    ten: () => {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: i === 6 ? 0.7 : 0.16, gain: 0.08, at: i * 0.1 }));
      hiss({ type: 'highpass', f0: 4000, len: 0.5, gain: 0.03, at: 0.6 });
    },
    record: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => voice({ type: 'sine', pts: [[0, f], [0.08, f * 1.02]], len: 0.2, gain: 0.05, at: i * 0.05 })),
    // ドキドキ(どっくん)
    heart: (k = 1) => { voice({ type: 'sine', pts: [[0, 70], [0.1, 45]], len: 0.16, gain: 0.16 * k }); voice({ type: 'sine', pts: [[0, 62], [0.1, 40]], len: 0.14, gain: 0.11 * k, at: 0.17 }); },
    // けっしょう: 小太鼓のロールから、ジャン!
    final: () => {
      for (let i = 0; i < 14; i++) hiss({ type: 'bandpass', f0: 1800, q: 0.8, len: 0.06, gain: 0.03 + i * 0.003, at: i * 0.05 });
      [392, 523, 659, 784].forEach((f) => voice({ type: 'triangle', pts: [[0, f]], len: 0.8, gain: 0.06, at: 0.75 }));
      hiss({ type: 'lowpass', f0: 500, len: 0.5, gain: 0.08, at: 0.75 });
    },
    // 森の鳥
    bird: () => {
      const f = 2400 + Math.random() * 900;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) voice({ type: 'sine', pts: [[0, f], [0.07, f * 1.25]], len: 0.09, gain: 0.018, at: i * 0.13 });
    },
    oh: () => { for (let i = 0; i < 4; i++) hiss({ f0: 500 + i * 120, f1: 380 + i * 90, q: 5, len: 1.0, gain: 0.04, at: i * 0.04, attack: 0.1 }); },
    cheer: () => { for (let i = 0; i < 5; i++) hiss({ f0: 700 + i * 180, f1: 900 + i * 150, q: 4, len: 1.3, gain: 0.05, at: i * 0.05, attack: 0.15 }); },
  };

  // ── 読みこみ: 観客と審判の先生(枝の上) ─────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', ...new Set(SEATS.map((s) => s.kind))]);
  const owl = await createModel('hoho');
  owl.root.position.set(2.6, BRANCH_Y + 0.75, 0.4);
  owl.root.rotation.y = -0.2;
  owl.play('idle');
  scene.add(owl.root);
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.set(seat.x, 0.42, seat.z);
    m.root.rotation.y = Math.atan2(-seat.x, -seat.z);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));
  atmosphere.setupShadows([stage.group, owl.root], [stage.group]);
  atmosphere.setupShadows([], audience.map((a) => a.model.root));
  function react(clip, face, sec = 1.6) {
    for (const a of audience) { a.model.play(clip); a.model.setFace(face); a.until = sec * (0.8 + Math.random() * 0.4); }
  }

  // ── つる(枝から、ゆれるものまで) ────────────────────────────
  const vineMat = new THREE.MeshToonMaterial({ color: 0x5a7a2a });
  const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), vineMat);
  scene.add(vine);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), new THREE.MeshToonMaterial({ color: 0x5e3a1c }));
  scene.add(hook);
  const unitY = new THREE.Vector3(0, 1, 0);
  function placeVine(top, bottom) {
    const d = bottom.clone().sub(top);
    const len = d.length();
    vine.position.copy(top).addScaledVector(d, 0.5);
    vine.scale.set(1, len, 1);
    vine.quaternion.setFromUnitVectors(unitY, d.normalize());
    hook.position.copy(bottom);
  }

  // ── 落ちる場所の目安(山のてっぺんに落ちる影)。乗らない所では赤くなる ──────
  const aimShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 28),
    new THREE.MeshBasicMaterial({ color: 0x1f2a33, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  aimShadow.rotation.x = -Math.PI / 2;
  aimShadow.renderOrder = 2;
  aimShadow.visible = false;
  scene.add(aimShadow);
  // まっすぐ下への点線(ゆれているものから、影まで)
  const GUIDE_N = 9;
  const guideMat = new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false });
  const guide = new THREE.Points(new THREE.BufferGeometry().setFromPoints(Array.from({ length: GUIDE_N }, (_, i) => new THREE.Vector3(0, -(i + 0.5) / GUIDE_N, 0))), guideMat);
  guide.renderOrder = 3;
  guide.visible = false;
  // 影のふち(白い輪): 地面の色に負けないように
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  aimShadow.add(aimRing);
  scene.add(guide);
  const HANG_GAP = 1.9; // 山のてっぺんから、ゆれるものまでの高さ

  // ── 山の見た目 ─────────────────────────────────────
  // state の stack と同じ並びで、ものを置く。くずれるときは、落ちる段から上を飛ばす
  let pieces = []; // { obj, kind }(stack と同じ番号)
  let hanging = null; // ゆれているもの(つるの先)
  let falling = null; // 落ちているもの { obj, from, x, kind }
  const flying = []; // くずれて飛んでいくもの
  function clearPieces() {
    for (const p of pieces) scene.remove(p.obj);
    for (const f of flying.splice(0)) scene.remove(f.obj);
    pieces = [];
    wobble = topple = null;
    if (hanging) { scene.remove(hanging.obj); hanging = null; }
    if (falling) { scene.remove(falling.obj); falling = null; }
  }
  function syncStack(s) {
    // 増えた分を足す(落ちていたものを、山の一番上に置く)
    while (pieces.length < s.stack.length) {
      const st = s.stack[pieces.length];
      let obj;
      if (falling && falling.kind === st.kind) { obj = falling.obj; falling = null; } else { obj = makePiece(st.kind); scene.add(obj); }
      obj.rotation.set(0, 0, 0);
      pieces.push({ obj, kind: st.kind, x: st.x, y: STUMP_H + st.y, bounce: 0 });
      // ぽよん: 乗ったものと、そのすぐ下のもの(少しだけ)
      pieces[pieces.length - 1].bounce = 1;
      if (pieces.length > 1) pieces[pieces.length - 2].bounce = Math.max(pieces[pieces.length - 2].bounce, 0.45);
      pieces[pieces.length - 1].bounceT = 0;
      if (pieces.length > 1) pieces[pieces.length - 2].bounceT = 0;
    }
    updateWobble(s);
  }
  // ── ぐらぐら: きわどい段のふち(重心が寄っているがわ)を支点に、上をゆらす ───────
  // wobble: { level, px, py, side, amp, t } / topple: くずれる前に、上がかたむいていく
  let wobble = null, topple = null;
  function pivotOf(stack, level, side) {
    const sup = level === 0 ? { x: 0, w: RULES.base.w, grip: RULES.base.grip, y: 0, h: 0 } : stack[level - 1];
    return { px: sup.x + side * (sup.w / 2) * sup.grip, py: STUMP_H + sup.y + sup.h };
  }
  function updateWobble(s) {
    if (!s.stack.length) { wobble = null; return; }
    const st = stability(s.stack);
    if (st.fallFrom !== null || st.margin >= 0.14) { wobble = null; return; }
    // よゆうが少ないほど大きく(0.14 で 0、0 で いちばん)
    const amp = 0.11 * (1 - st.margin / 0.14) ** 1.2;
    wobble = { level: st.level, side: st.side, amp, t: 0, ...pivotOf(s.stack, st.level, st.side) };
  }
  // くずれる: まず上がかたむいて、それから飛ぶ
  function startTopple(s, from) {
    const stack = s.stack;
    const sup = from === 0 ? { x: 0 } : stack[from - 1];
    let m = 0, mx = 0;
    for (let j = from; j < stack.length; j++) { const w = KINDS[stack[j].kind].w * KINDS[stack[j].kind].h; m += w; mx += w * stack[j].x; }
    const side = Math.sign(mx / m - sup.x) || 1;
    wobble = null;
    topple = { from, side, t: 0, ...pivotOf(stack, from, side) };
  }
  // 支点のまわりに、角度 a だけまわした位置へ
  function placeAround(p, px, py, a) {
    const dx = p.x - px, dy = p.y - py;
    const c = Math.cos(a), sn = Math.sin(a);
    p.obj.position.set(px + dx * c - dy * sn, py + dx * sn + dy * c, 0);
    p.obj.rotation.z = a;
  }
  // くずれる: from 段めから上を、ばらばらに飛ばす
  function collapseFrom(from, side = 0) {
    const fall = pieces.splice(from);
    fall.forEach((p, i) => {
      const dir = side || Math.sign(p.obj.position.x || (Math.random() - 0.5)) || 1;
      // 上のものほど遠くへ(かたむいた勢いのまま)
      flying.push({ obj: p.obj, v: new THREE.Vector3(dir * (1.0 + Math.random() * 1.3 + i * 0.3), 1.2 + Math.random() * 1.6, (Math.random() - 0.3) * 1.6), spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5, -dir * (3 + Math.random() * 5)), t: -i * 0.03 });
    });
  }
  // 山がやりなおしになったら、残っていたものも転がり落ちる
  function resetStack() {
    topple = wobble = null;
    collapseFrom(0);
  }
  function updatePieces(dt) {
    if (wobble) wobble.t += dt;
    if (topple) {
      topple.t += dt;
      if (topple.t >= 0.5) { const { from, side, px, py } = topple; topple = null; puff(new THREE.Vector3(px, py, 0), 5, 0.9); collapseFrom(from, side); }
    }
    pieces.forEach((p, i) => {
      // ぽよん: ばねのように、つぶれて のびて おさまる
      let sy = 1, sxz = 1;
      if (p.bounce > 0) {
        p.bounceT += dt;
        const k = p.bounce * 0.22 * Math.exp(-p.bounceT * 6) * Math.cos(p.bounceT * 19);
        sy = 1 - k;
        sxz = 1 + k * 0.6;
        if (p.bounceT > 1) p.bounce = 0;
      }
      p.obj.scale.set(sxz, sy, sxz);
      if (topple && i >= topple.from) {
        // くずれる: 支点のまわりに、だんだん速くかたむく
        const a = -topple.side * 1.1 * (topple.t / 0.5) ** 2;
        placeAround(p, topple.px, topple.py, a);
      } else if (wobble && i >= wobble.level) {
        // ぐらぐら: 重心のがわへ かたむいて もどる、をくりかえす(はじめは大きく、だんだん小さく。でも止まらない)
        const amp = wobble.amp * (0.45 + 0.55 * Math.exp(-wobble.t * 1.2));
        const a = -wobble.side * amp * (0.5 + 0.5 * Math.sin(wobble.t * 9));
        placeAround(p, wobble.px, wobble.py, a);
      } else {
        p.obj.position.set(p.x, p.y, 0);
        p.obj.rotation.z = 0;
      }
    });
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.t += dt;
      if (f.t < 0) continue;
      f.v.y -= 12 * dt;
      f.obj.position.addScaledVector(f.v, dt);
      f.obj.rotation.x += f.spin.x * dt;
      f.obj.rotation.y += f.spin.y * dt;
      f.obj.rotation.z += f.spin.z * dt;
      // 切り株の上・地面ではねて、止まる(切り株の上では、ふちへ転がる)
      const onStump = Math.hypot(f.obj.position.x, f.obj.position.z) < STUMP_R;
      const floor = onStump ? STUMP_H + 0.08 : 0.1;
      if (f.obj.position.y < floor && f.v.y < 0 && (onStump ? f.obj.position.y > STUMP_H - 0.3 : true)) {
        if (f.v.y < -2.5) puff(f.obj.position.clone().setY(floor - 0.05), 3, 0.8);
        f.obj.position.y = floor;
        if (onStump) { const d = Math.hypot(f.obj.position.x, f.obj.position.z) || 1; f.v.x += (f.obj.position.x / d) * 0.8; f.v.z += (f.obj.position.z / d) * 0.8; }
        f.v.y *= -0.35;
        f.v.x *= 0.6;
        f.v.z *= 0.6;
        f.spin.multiplyScalar(0.5);
      }
      if (f.t > 3.2) {
        f.obj.scale.multiplyScalar(0.9);
        if (f.t > 3.6) { scene.remove(f.obj); flying.splice(i, 1); }
      }
    }
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    clearPieces();
    const state = createGame(players, seed);
    const n = players.length;
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      model.actions.idle.time = Math.random() * 2;
      const holder = new THREE.Group();
      // 待つ場所は、番の順にならぶ
      holder.position.copy(waitSpot(state.order.indexOf(slot), n));
      holder.lookAt(0, 0, 0);
      holder.add(model.root);
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      const head = model.node('head');
      return { model, holder, size: def.size || 1, home: holder.position.clone(), arms: [model.node('arm_L'), model.node('arm_R')], head, headRest: head?.rotation.clone(), faceIn: holder.quaternion.clone(), time: 0, droop: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, countdown: null, lastTick: null, best: 0, resets: 0, recordShown: false, beatT: 0.3, birdT: 3, finalCall: null };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    tapped = false;
    $('outT').classList.remove('show');
    $('hudT').classList.remove('final');
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoT').classList.add('show');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudT').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) { onExit(to); }

  // ── 一時停止 ───────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnT').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: タップで落とす ─────────────────────────────
  let tapped = false;
  const myTurn = () => game && game.state.phase === 'play' && game.state.cur === 0 && game.state.stage === 'aim';
  const canPress = (e) => mode === 'playing' && !paused && intro >= 1 && !e.target.closest('button, a');
  window.addEventListener('pointerdown', (e) => {
    if (!canPress(e)) return;
    unlockAudio();
    if (myTurn()) { tapped = true; $('howtoT').classList.remove('show'); }
  });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && !paused && intro >= 1) {
      e.preventDefault();
      unlockAudio();
      if (myTurn()) { tapped = true; $('howtoT').classList.remove('show'); }
    }
  });
  function myInput() {
    if (!tapped) return null;
    tapped = false;
    return { drop: true };
  }

  // ── HUD ─────────────────────────────────────────────
  const KIND_ICON = { acorn: '🌰', walnut: '🥜', pinecone: '🌲', mushroom: '🍄', leaf: '🍃', twig: '🪵' };
  function splash(text, cls = '') {
    const el = $('splashT');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    const s = game.state;
    $('chipsT').replaceChildren(...s.order.map((slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `<i></i><b>${slot === 0 ? 'あなた' : game.players[slot].name}</b>`;
      d.dataset.slot = slot;
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    for (const c of $('chipsT').children) {
      const slot = Number(c.dataset.slot);
      c.classList.toggle('out', !s.alive[slot]);
      c.classList.toggle('now', s.phase === 'play' && s.cur === slot);
    }
    $('heightT').firstChild.nodeValue = String(s.stack.length);
    // 次に来るもの
    const nx = $('nextT');
    const key = s.next || '';
    if (nx.dataset.k !== key) { nx.dataset.k = key; nx.querySelector('b').textContent = key ? KINDS[key].name : ''; }
    // 自分の番: 「タップで落とす!」と、のこり時間のバー
    const mine2 = myTurn();
    $('tapT').classList.toggle('show', mine2);
    const left = s.stage === 'aim' ? Math.max(0, RULES.aimLimit - s.stageT) : RULES.aimLimit;
    $('barT').style.transform = `scaleX(${(left / RULES.aimLimit).toFixed(3)})`;
    $('barT').parentElement.classList.toggle('show', s.stage === 'aim');
    $('barT').parentElement.classList.toggle('hurry', left < 2.5);
    if (mine2 && left < 3 && Math.ceil(left) !== game.lastTick) { game.lastTick = Math.ceil(left); sfx.tick(); }
  }

  // 「○○ 脱落」の札: 色の丸・名前・のこりの人数。上からおりてきて、少しして消える
  function showOutCard({ slot, left }) {
    const el = $('outT');
    el.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
    el.querySelector('b').textContent = slot === 0 ? 'あなた' : game.players[slot].name;
    el.querySelector('span').textContent = left >= 2 ? `のこり ${left}人` : '';
    el.classList.toggle('me', slot === 0);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    sfx.out();
  }

  // ── できごと ────────────────────────────────────────
  const name = (slot) => (slot === 0 ? 'あなた' : game.players[slot].name);
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('はじめ!');
          $('howtoT').classList.remove('show');
          sfx.whistle();
          owl.play('flap', { fade: 0.1 });
          break;
        case 'turn': {
          // 前のものは山に乗った / 落ちた。新しいものを、つるの先へ
          if (hanging) scene.remove(hanging.obj);
          const obj = makePiece(e.kind);
          scene.add(obj);
          hanging = { obj, kind: e.kind, t: 0 };
          game.lastTick = null;
          if (e.slot === 0) { splash('あなたの番!', 'gold'); sfx.myTurn(); } else { splash(`${name(e.slot)}の番`); sfx.turn(); }
          break;
        }
        case 'drop':
          falling = { obj: hanging.obj, kind: e.kind, from: hanging.obj.position.clone(), x: e.x, t: 0 };
          hanging = null;
          sfx.drop();
          game.runners[e.slot].throwT = 0.4;
          break;
        case 'land':
          syncStack(s);
          sfx.land(e.height, s.stack[s.stack.length - 1].kind);
          // 10だん: 紙ふぶきとファンファーレ / 5だん: きらりん / この試合の記録をこえた: さいこう記録!
          if (e.height % 10 === 0) {
            splash(`${e.height}だん!!`, 'gold');
            confetti(new THREE.Vector3(s.stack[s.stack.length - 1].x, STUMP_H + stackTop(s) + 0.2, 0));
            sfx.ten();
            sfx.cheer();
            react('cheer', 'happy', 2.6);
            owl.play('flap', { fade: 0.1 });
            game.showAll = 2.4;
          } else if (e.margin < 0.06) { splash('ぐらぐら…!', 'red'); sfx.close(); react('cheer', 'surprised', 1.2); }
          else if (e.height % 5 === 0) { splash(`${e.height}だん!`, 'gold'); sfx.chime(); react('cheer', 'happy'); game.showAll = 1.8; }
          else if (game.resets > 0 && e.height > game.best && !game.recordShown && e.height >= 4) { splash('さいこう記録!', 'gold'); sfx.record(); react('cheer', 'happy', 1.2); game.recordShown = true; }
          game.best = Math.max(game.best, e.height);
          break;
        case 'collapse':
          syncStack(s);
          startTopple(s, e.from);
          sfx.collapse();
          sfx.oh();
          splash('ガラガラ…!', 'red');
          react('cheer', 'surprised', 2);
          game.shake = 0.5;
          game.fallCam = { t: 2.4, side: topple ? topple.side : 1 };
          break;
        case 'miss':
          game.fallCam = { t: 2.0, side: Math.sign(e.x) || 1 };
          if (falling) { flying.push({ obj: falling.obj, v: new THREE.Vector3(Math.sign(e.x) * 1.5, 0, 0.8), spin: new THREE.Vector3(3, 2, -Math.sign(e.x) * 4), t: 0 }); falling = null; }
          sfx.miss();
          sfx.oh();
          splash('のらなかった…', 'red');
          break;
        case 'out': {
          const r = game.runners[e.slot];
          r.outT = 2.5;
          addCloud(r);
          game.outCard = { slot: e.slot, left: e.left, at: 1.0 };
          if (e.left === 2) game.finalCall = 2.9; // 札のあとに「けっしょう!」
          break;
        }
        case 'reset':
          resetStack();
          game.resets++;
          game.recordShown = false;
          break;
        case 'finished':
          splash(e.winner === 0 ? 'あなたの勝ち!' : `${name(e.winner)}の勝ち!`, 'gold');
          sfx.whistle();
          react('cheer', 'happy', 3);
          owl.play('flap', { fade: 0.1 });
          game.endTimer = 2.6;
          break;
      }
    }
  }

  function showResult() {
    const s = game.state;
    const order = ranking(s);
    if (tour) {
      const done = tour.onFinish;
      setMode('idle');
      done({ ranking: order, picked: null });
      return;
    }
    $('resultTitle').textContent = s.winner === 0 ? 'あなたの勝ち!' : `${game.players[s.winner].name}の勝ち!`;
    if (s.winner === 0) sfx.fanfare(); else sfx.finish();
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${s.alive[slot] ? 'のこった!' : `${s.out.indexOf(slot) + 1}ばんめに脱落`}<small>のせた ${r.placed}こ</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateHanging(dt) {
    const s = game.state;
    const top = new THREE.Vector3(0, BRANCH_Y, 0);
    // ゆれているもの: つるの先で、ルールの swingX にぴったり合わせる(落とした位置とずれないように)
    const topY = STUMP_H + stackTop(s);
    const hy = topY + HANG_GAP;
    if (hanging) {
      hanging.t += dt;
      const enter = s.stage === 'enter' ? Math.min(1, s.stageT / RULES.enterTime) : 1;
      const x = s.stage === 'aim' ? swingX(s) : s.stage === 'enter' ? swingX(s, 0) * enter : 0;
      hanging.obj.position.set(x, hy + (1 - enter) * 4, 0);
      hanging.obj.rotation.z = Math.cos(s.swing.phase + s.swing.w * s.stageT) * -0.25;
      top.x = x * 0.25;
      top.y = Math.max(BRANCH_Y, hy + 5); // 山が枝より高くなったら、つるは画面の上の外から
      placeVine(top, hanging.obj.position.clone().add(new THREE.Vector3(0, KINDS[hanging.kind].h + 0.08, 0)));
      vine.visible = hook.visible = true;
      // 影と点線: ねらっているあいだだけ。山に乗らないところは赤
      const aiming = s.stage === 'aim' && s.cur !== null;
      aimShadow.visible = guide.visible = aiming && enter >= 1;
      if (aimShadow.visible) {
        const r = tryPlace(s.stack, hanging.kind, x);
        const w = KINDS[hanging.kind].w;
        aimShadow.position.set(x, topY + 0.015, 0);
        aimShadow.scale.set(w, w * 0.6, 1);
        aimShadow.material.color.setHex(r.miss ? 0xe8344a : r.ok ? 0x1f2a33 : 0xd98a12);
        aimShadow.material.opacity = r.miss ? 0.6 : 0.4;
        aimRing.material.color.setHex(r.miss ? 0xffb0b0 : 0xffffff);
        guide.position.set(x, hy, 0);
        guide.scale.set(1, hy - topY - 0.05, 1);
        guideMat.color.setHex(r.miss ? 0xff8a8a : 0xffffff);
      }
    } else {
      vine.visible = hook.visible = aimShadow.visible = guide.visible = false;
    }
    // 落ちているもの: まっすぐ下へ(ルールの fallTime で、山のてっぺんへ)
    if (falling) {
      falling.t += dt;
      const k = Math.min(1, falling.t / RULES.fallTime);
      const y1 = STUMP_H + stackTop(s);
      falling.obj.position.set(falling.x, falling.from.y + (y1 - falling.from.y) * k * k, 0);
      falling.obj.rotation.z *= 0.9;
    }
  }
  function updateRunners(dt) {
    const s = game.state;
    s.order.forEach((slot) => {
      const v = game.runners[slot];
      v.time += dt;
      v.throwT = Math.max(0, (v.throwT || 0) - dt);
      v.outT = Math.max(0, (v.outT || 0) - dt);
      const out = !s.alive[slot] && s.phase !== 'finished' && mode !== 'result';
      // 番の子は、切り株の前へ一歩出る。脱落した子は、うしろへ下がる
      const now = s.phase === 'play' && s.cur === slot;
      const to = now ? v.home.clone().multiplyScalar(0.72) : out && v.outT <= 0 ? v.home.clone().multiplyScalar(1.22) : v.home;
      v.holder.position.lerp(to, Math.min(1, dt * (out ? 1.5 : 4)));
      let clip = 'idle', face = 'normal';
      if (s.phase === 'finished' || mode === 'result') { clip = s.winner === slot ? 'cheer' : 'wave'; face = s.winner === slot ? 'happy' : 'normal'; }
      else if (out) { clip = v.outT > 1.2 ? 'dizzy' : 'idle'; face = 'frustrated'; }
      else if (now && s.stage === 'aim') face = 'surprised';
      v.model.play(clip);
      v.model.setFace(face);
      // しょんぼり: 目が回りおわったら、うつむく(頭をアニメーションの上から足す)
      if (v.head && v.headRest) v.head.rotation.copy(v.headRest);
      v.model.update(dt);
      v.droop += ((out && v.outT <= 1.2 ? 1 : 0) - v.droop) * Math.min(1, dt * 3);
      if (v.head && v.droop > 0.01) v.head.rotation.x += v.droop * 0.45;
      if (v.cloud) updateCloud(v, dt);
      // 脱落した子は、こちら(カメラのほう)へ向きなおる(しょんぼり顔が見えるように)
      v.holder.quaternion.slerp(out && v.outT <= 1.6 ? FACE_CAM : v.faceIn, Math.min(1, dt * 2.5));
      // 番の子は、両手を上へ(落とす合図)。落としたら前へふる
      const [armL, armR] = v.arms;
      if (now && s.phase === 'play' && !(s.phase === 'finished')) {
        const up = v.throwT > 0 ? -1.2 : -2.7 + Math.sin(v.time * 6) * 0.1;
        armL?.rotation.set(up, 0, 0.3);
        armR?.rotation.set(up, 0, -0.3);
      } else if (out && v.droop > 0.01) {
        // 両手をだらんと
        armL?.rotation.set(0.15 * v.droop, 0, 0.12 * v.droop);
        armR?.rotation.set(0.15 * v.droop, 0, -0.12 * v.droop);
      }
      if (v.marker) v.marker.position.set(0, 2.1 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
  }

  const FACE_CAM = new THREE.Quaternion(); // 正面(+z)がカメラのほう

  // ── 脱落した子の頭の上の、小さな雨雲 ────────────────────────
  const cloudMat = new THREE.MeshToonMaterial({ color: 0x8a96a3, gradientMap: toonGradient, transparent: true });
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x7fb6e8, transparent: true });
  const dropGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4);
  function addCloud(v) {
    if (v.cloud) return;
    const g = new THREE.Group();
    for (const [x, y, r] of [[0, 0, 0.2], [-0.2, -0.04, 0.15], [0.21, -0.03, 0.16], [0.08, 0.1, 0.15], [-0.1, 0.08, 0.13]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
      m.position.set(x, y, 0);
      m.scale.y = 0.8;
      g.add(m);
    }
    const drops = [];
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(dropGeo, dropMat);
      d.userData.phase = i / 6;
      d.userData.x = (i / 5 - 0.5) * 0.4;
      g.add(d);
      drops.push(d);
    }
    g.position.y = 2.25 * v.size;
    g.scale.setScalar(0.01);
    v.holder.add(g);
    v.cloud = { g, drops, t: 0 };
  }
  function updateCloud(v, dt) {
    const c = v.cloud;
    c.t += dt;
    const life = 5.5;
    const k = c.t < 0.4 ? c.t / 0.4 : c.t > life - 0.6 ? Math.max(0, (life - c.t) / 0.6) : 1;
    c.g.scale.setScalar(Math.max(0.01, k * v.size));
    c.g.position.x = Math.sin(c.t * 1.3) * 0.05;
    for (const d of c.drops) {
      const p = (c.t * 1.6 + d.userData.phase) % 1;
      d.position.set(d.userData.x, -0.15 - p * 0.55, 0);
      d.visible = p < 0.9;
    }
    if (c.t >= life) { v.holder.remove(c.g); v.cloud = null; }
  }

  // ── 紙ふぶき: 10だんのお祝い。山のてっぺんから、ふきあがって ひらひら落ちる ─────
  const CONF_N = 140;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF_N);
  conf.frustumCulled = false;
  conf.count = 0;
  scene.add(conf);
  const confP = Array.from({ length: CONF_N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), t: 9 }));
  const CONF_COLORS = [0xffd24a, 0xff6b5a, 0x6cc4ff, 0x8fdc6a, 0xff9ad5, 0xffffff].map((c) => new THREE.Color(c));
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
  function confetti(pos) {
    confP.forEach((c, i) => {
      c.t = 0;
      c.p.copy(pos);
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
      c.v.set(Math.cos(a) * sp * 0.6, 3 + Math.random() * 3.5, Math.sin(a) * sp * 0.4 + 0.6);
      c.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      conf.setColorAt(i, CONF_COLORS[i % CONF_COLORS.length]);
    });
    conf.instanceColor.needsUpdate = true;
    conf.count = CONF_N;
  }
  function updateConfetti(dt) {
    if (!conf.count) return;
    let alive = 0;
    confP.forEach((c, i) => {
      c.t += dt;
      if (c.t < 3.5) alive++;
      // 重力と、空気にふわっと受けとめられる感じ(下へは ゆっくり)
      c.v.y -= 9 * dt;
      if (c.v.y < -1.1) c.v.y = -1.1;
      c.v.x *= 1 - dt * 1.2;
      c.v.z *= 1 - dt * 1.2;
      c.p.addScaledVector(c.v, dt);
      c.p.x += Math.sin(c.t * 5 + i) * dt * 0.4;
      c.r.set(c.r.x + c.w.x * dt, c.r.y + c.w.y * dt, c.r.z + c.w.z * dt);
      const k = c.t < 3 ? 1 : Math.max(0.001, (3.5 - c.t) / 0.5);
      tmpM.compose(c.p, tmpQ.setFromEuler(c.r), ONE.clone().multiplyScalar(k));
      conf.setMatrixAt(i, tmpM);
    });
    conf.instanceMatrix.needsUpdate = true;
    if (!alive) conf.count = 0;
  }

  // ── けむり: 落ちたものが はねたところに、ぽふっと ─────────────────
  const puffGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const puffs = Array.from({ length: 24 }, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshToonMaterial({ color: 0xf3ead8, gradientMap: toonGradient, transparent: true, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    return { m, t: 1, v: new THREE.Vector3() };
  });
  let puffNext = 0;
  function puff(pos, n = 4, size = 1) {
    for (let i = 0; i < n; i++) {
      const p = puffs[puffNext++ % puffs.length];
      p.t = 0;
      p.size = size * (0.7 + Math.random() * 0.6);
      p.m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.1, (Math.random() - 0.5) * 0.3));
      p.v.set((Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
      p.m.visible = true;
    }
  }
  function updatePuffs(dt) {
    for (const p of puffs) {
      if (p.t >= 1) continue;
      p.t += dt / 0.7;
      p.m.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 3);
      p.m.scale.setScalar(p.size * (0.4 + p.t * 1.2));
      p.m.material.opacity = 0.85 * (1 - p.t) ** 1.5;
      if (p.t >= 1) p.m.visible = false;
    }
  }

  let freeCamera = false;
  // 山のてっぺんと、ゆれるものが、画面いっぱいに入るように。距離は ゆれのはば と 高さの両方から決める
  const look = new THREE.Vector3(0, 2.4, 0);
  const cam = { d: 9, cy: 2.4 };
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    camera.fov = portrait ? 52 : 42;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * aspect;
    const s = game?.state;
    const topY = STUMP_H + (s ? stackTop(s) : 0);
    // 入れたいはんい: よこは ゆれのはば+もののはば、たては 山の少し下から ゆれるものの上まで
    const kind = s?.piece?.kind;
    let halfW = (s ? s.swing.A : 1) + (kind ? KINDS[kind].w / 2 : 0.5) + 0.45;
    // 下は 文字やバーがかぶるので、山のてっぺんが画面のまん中より少し下に来るように
    // 5だんごとに、少しのあいだ 山ぜんたいを見せる
    if (game?.showAll > 0) game.showAll = Math.max(0, game.showAll - dt);
    let lo = game?.showAll > 0 ? STUMP_H - 0.6 : Math.max(STUMP_H - 0.6, topY - 1.4);
    let hi = topY + HANG_GAP + 1.0;
    // くずれた・落ちたとき: 地面まで引いて、落ちていくがわへ少し寄る
    let xOff = 0;
    const fc = game?.fallCam;
    if (fc && fc.t > 0) {
      fc.t -= dt;
      lo = 0.2;
      hi = Math.max(topY + 0.6, STUMP_H + 1.6);
      halfW = 2.5;
      xOff = fc.side * 1.2;
    }
    cam.x = (cam.x ?? 0) + (xOff - (cam.x ?? 0)) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    let d = Math.max(halfW / tanH, ((hi - lo) / 2) / tanV * (game?.showAll > 0 ? 1.18 : 1.05), 5);
    // 自分の番でねらっているときは、少し寄る
    const mine = s && s.phase === 'play' && s.cur === 0 && s.stage === 'aim';
    if (mine) d *= 0.93;
    // はじまる前・おわったあとは、切り株とみんなが入るくらい引く
    if (!s || s.phase !== 'play') d = Math.max(d, portrait ? 11 : 8.5);
    const cy = (lo + hi) / 2 + (s && s.phase !== 'play' ? -0.6 : 0);
    const k = snap ? 1 : 1 - Math.exp(-dt * 3);
    cam.d += (d - cam.d) * k;
    cam.cy += (cy - cam.cy) * k;
    const shake = game?.shake ? (Math.random() - 0.5) * game.shake * 0.3 : 0;
    if (game?.shake) game.shake = Math.max(0, game.shake - dt);
    // 少し上から見下ろす(てっぺんの面が見えるように)。高くなるほど水平に近づけて、見上げる感じに
    const h = s ? s.stack.length : 0;
    const pos = new THREE.Vector3(shake + cam.x, cam.cy + cam.d * (0.16 - Math.min(0.12, h * 0.01)), cam.d);
    look.set(cam.x * 0.8, cam.cy, 0);
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(8, 22, 24);
      camera.position.lerpVectors(sky, pos, e);
      camera.lookAt(look);
      return;
    }
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  // ── 画質(ほかの競技と同じ考え方) ──────────────────────
  const quality = { level: 0, sum: 0, n: 0, timer: 0, shadows: true };
  function applyQuality() {
    if (settings.quality === 'light') quality.level = 2;
    if (settings.quality === 'high') quality.level = 0;
    renderer.setPixelRatio(quality.level === 0 ? Math.min(devicePixelRatio, 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 1);
    renderer.setSize(innerWidth, innerHeight, false);
    const shadows = quality.level < 2;
    renderer.shadowMap.enabled = shadows;
    if (quality.shadows !== shadows) scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    quality.shadows = shadows;
  }
  function watchQuality(rawDt) {
    quality.sum += rawDt;
    quality.n++;
    quality.timer += rawDt;
    if (quality.timer < 2) return;
    const avg = quality.sum / quality.n;
    quality.sum = quality.n = quality.timer = 0;
    if (avg < 1 / 40 || quality.level >= 2 || settings.quality === 'high') return;
    quality.level++;
    applyQuality();
  }

  // ── 1フレーム ───────────────────────────────────────
  let lampT = 0;
  function frame(rawDt, draw = true) {
    const dt = Math.min(rawDt, 0.1);
    if (draw && mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) intro = Math.min(1, intro + dt / INTRO_TIME);
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      if (s.phase === 'ready') {
        const n = Math.ceil(RULES.readyTime - s.t);
        if (n !== game.countdown && n > 0) { game.countdown = n; splash(String(n)); sfx.beep(false); }
      }
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : myInput()));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      if (game.outCard && (game.outCard.at -= dt) <= 0) { showOutCard(game.outCard); game.outCard = null; }
      if (game.finalCall && (game.finalCall -= dt) <= 0) {
        game.finalCall = null;
        splash('けっしょう!', 'gold');
        sfx.final();
        react('cheer', 'happy', 2);
        $('hudT').classList.add('final');
      }
      // ドキドキ: ぐらぐらしている・高いとき、ねらっているあいだ(高いほど速く)
      if (s.phase === 'play' && s.stage === 'aim' && (wobble || s.stack.length >= 8)) {
        game.beatT -= dt;
        if (game.beatT <= 0) { game.beatT = Math.max(0.42, 0.8 - s.stack.length * 0.025); sfx.heart(s.cur === 0 ? 1 : 0.6); }
      } else game.beatT = 0.3;
      // 森の鳥
      if ((game.birdT -= dt) <= 0) { game.birdT = 4 + Math.random() * 6; sfx.bird(); }
      if (game.endTimer !== null) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) { game.endTimer = null; showResult(); }
      }
    }
    if (game && mode === 'playing') renderHud();
    if (game && !paused) {
      updateHanging(dt);
      updatePieces(dt);
      updatePuffs(dt);
      updateConfetti(dt);
      updateRunners(dt);
    }
    if (!paused) {
      for (const a of audience) {
        if (a.until > 0 && (a.until -= dt) <= 0) { a.model.play('idle'); a.model.setFace('normal'); }
        a.model.update(dt);
      }
      owl.update(dt);
      if (owl.current === 'flap' && owl.actions.flap.time > 1.2) owl.play('idle');
      // ちょうちんが、ゆらゆら明るさを変える
      lampT += dt;
      stage.lanterns.forEach((l, i) => { l.scale.setScalar(1 + Math.sin(lampT * 2 + i) * 0.04); });
    }
    atmosphere.update(dt);
    updateCamera(dt);
    if (draw) renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dtsumi = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    camera, renderer, scene,
    freeCamera: (on) => { freeCamera = on; },
    snap: () => { updateCamera(0, true); renderer.render(scene, camera); },
    sync: () => syncStack(game.state),
    get debugPieces() { return { topple, wobble, pieces: pieces.map((p) => [p.kind, p.obj.position.x.toFixed(2), p.obj.position.y.toFixed(2), p.obj.rotation.z.toFixed(2)]), flying: flying.map((f) => [f.t.toFixed(2), f.obj.position.x.toFixed(2), f.obj.position.y.toFixed(2), f.obj.position.z.toFixed(2)]) }; },
    setTime: (key) => atmosphere.apply(key),
    tick: (sec) => { for (let i = 0; i < sec * 60; i++) frame(1 / 60, false); },
    advance: (sec) => {
      const me = createCpu('normal', 1, 0);
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
  };

  updateCamera(0, true);
  await renderer.compileAsync(scene, camera).catch(() => {});

  return {
    scene,
    camera,
    frame,
    async enter(character, { fromSky = true, lineup = null, onFinish = null } = {}) {
      picked = character;
      tour = onFinish ? { lineup, onFinish } : null;
      unlockAudio();
      applyQuality();
      await startGame({ fromSky });
      renderer.compile(scene, camera);
    },
    exit() { setMode('idle'); },
    get intro() { return intro; },
  };
}
