// 花ぬり陣取り の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
// タイトルと同じページで動く(キャッチと同じ作り)。描画の器(renderer)と音はタイトルから借りる。
//
// 動かし方: どこでもスティック(画面のどこかに指をおいて、ずらした向きへ走る)。パソコンは矢印キー / WASD。
//
// 花: ます目ごとに1りん。花びらと花のまん中は1つの InstancedMesh(色はプレイヤーの色。まん中は濃い色)、
// 葉っぱは別の InstancedMesh。ます目の持ち主が変わったら、ぽんと咲く(散るときは花びらが舞う)。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { CELL, FIELD_R, N, RULES, STEP, cellX, createGame, inField, ranking, share, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { SEATS, buildStage } from './stage.js';
import { createAtmosphere, windify } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const STUMP_TOP = 0.42;
const params = new URLSearchParams(location.search);
const pct = (v) => Math.round(v * 100);

export async function createHana({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene);
  windify(stage.group);

  // ── 音 ──────────────────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function tone(freq, len = 0.09, type = 'triangle', gain = 0.12, at = 0) {
    if (!audio) return;
    const t = audio.currentTime + at;
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
  function voice({ type = 'sine', pts, len, gain = 0.1, at = 0, vib = 0, vibRate = 12 }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
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
  // 雑音(シャワー・風)。freq は [はじめ, おわり]
  function noise({ len, gain, freq, type = 'bandpass', q = 1, at = 0, attack = 0.02 }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const buf = audio.createBuffer(1, Math.ceil(audio.sampleRate * len), audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq[0], t);
    f.frequency.exponentialRampToValueAtTime(freq[1], t + len);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t);
  }
  const sfx = {
    // ポン: じょうろ・ミツバチが出てくる
    pon(vol = 1) { voice({ pts: [[0, 520], [0.06, 880]], len: 0.12, gain: 0.08 * vol }); },
    // シャワー + きらきら: じょうろ
    shower(vol = 1) {
      noise({ len: 0.7, gain: 0.16 * vol, freq: [5000, 2500], type: 'highpass', attack: 0.05 });
      [1046, 1318, 1568, 2093].forEach((f, i) => voice({ pts: [[0, f]], len: 0.3, gain: 0.06 * vol, at: 0.08 + i * 0.07 }));
    },
    // ブーン: ミツバチ
    buzz(vol = 1) {
      voice({ type: 'sawtooth', pts: [[0, 190], [0.4, 230]], len: 0.5, gain: 0.05 * vol, vib: 25, vibRate: 30 });
      [1318, 1760].forEach((f, i) => voice({ pts: [[0, f]], len: 0.25, gain: 0.05 * vol, at: 0.15 + i * 0.07 }));
    },
    // ヒュルル: つむじ風が来る知らせ
    whistle() {
      voice({ pts: [[0, 600], [0.9, 1400]], len: 1.0, gain: 0.05, vib: 30, vibRate: 7 });
      noise({ len: 1.2, gain: 0.08, freq: [400, 1600], q: 2, attack: 0.4 });
    },
    // ゴォー: つむじ風が通る
    gust(vol = 1) { noise({ len: 1.6, gain: 0.18 * vol, freq: [300, 900], q: 0.8, attack: 0.3 }); },
    // ひゅーん + ぐるぐる: 飛ばされる
    blown(vol = 1) {
      voice({ pts: [[0, 900], [0.4, 300]], len: 0.45, gain: 0.08 * vol });
      voice({ type: 'triangle', pts: [[0, 700], [0.6, 260]], len: 0.65, gain: 0.06 * vol, at: 0.2, vib: 90, vibRate: 9 });
    },
    // ボヨン: 体当たり
    boyon(vol = 1) { voice({ pts: [[0, 160], [0.08, 420], [0.3, 150]], len: 0.36, gain: 0.14 * vol, vib: 30, vibRate: 16 }); },
  };
  function volFor(x, z) {
    const me = game.state.runners[0];
    return Math.max(0, 0.6 * (1 - Math.hypot(x - me.x, z - me.z) / 8));
  }

  // ── 読みこみ: 観客 ───────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), ...new Set(SEATS.map((s) => s.kind))]);
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.set(seat.x, STUMP_TOP, seat.z);
    m.root.rotation.y = Math.atan2(-seat.x, -seat.z);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    m.setFace('normal');
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));
  atmosphere.setupShadows([stage.group], [stage.group]);
  atmosphere.setupShadows([], audience.map((a) => a.model.root));

  // ── 花 ─────────────────────────────────────────────
  // 色だけでなく、形もプレイヤーごとに変える(色が見分けにくくても、だれの花か分かるように)。
  // 花びら(白)+ まん中(灰色 = プレイヤーの色の濃いところ)を1つの形にして、インスタンスの色をかける
  const FLOWER_KINDS = [
    { n: 5, len: 0.075, wid: 0.66, cup: 0.3 }, // あか: まるい5まい(さくらそう)
    { n: 9, len: 0.085, wid: 0.3, cup: 0.12, center: 0.05 }, // あお: ほそい花びら(ひなぎく)
    { n: 6, len: 0.08, wid: 0.42, cup: 0.45, pointed: true }, // きいろ: とがった6まい(ゆり)
    { n: 4, len: 0.08, wid: 0.85, cup: 0.22 }, // みどり: 大きな4まい(クローバーの花)
    { n: 8, len: 0.06, wid: 0.45, cup: 0.35, layers: 2 }, // むらさき: 2だんの花びら(アスター)
  ];
  function makeFlowerGeo({ n, len, wid, cup, pointed = false, layers = 1, center = 0.042 }) {
    const parts = [];
    for (let layer = 0; layer < layers; layer++) {
      const petal = pointed ? new THREE.ConeGeometry(0.06, 0.15, 6).rotateZ(-Math.PI / 2).translate(0.03, 0, 0) : new THREE.SphereGeometry(0.075, 8, 5);
      if (pointed) petal.scale(1, 0.3, wid * 1.6);
      else petal.scale(len / 0.075, 0.32, wid);
      const sc = 1 - layer * 0.3;
      for (let k = 0; k < n; k++) {
        const a = ((k + layer * 0.5) / n) * Math.PI * 2;
        const p = petal.clone();
        p.scale(sc, 1, sc);
        p.rotateZ(cup + layer * 0.3); // 少し上を向いて、おわんの形
        p.translate(len * 0.95 * sc, layer * 0.018, 0);
        p.rotateY(a);
        parts.push({ g: p, petal: true });
      }
    }
    const c = new THREE.SphereGeometry(center, 8, 5);
    c.scale(1, 0.55, 1);
    c.translate(0, 0.02 + layers * 0.01, 0);
    parts.push({ g: c, petal: false });
    const pos = [], nor = [], col = [], idx = [];
    let base = 0;
    for (const { g, petal } of parts) {
      const p = g.attributes.position, nn = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i) + 0.17, p.getZ(i));
        nor.push(nn.getX(i), nn.getY(i), nn.getZ(i));
        // 花びらは根もとを少し濃く、先を明るく。まん中は濃い色
        const r = Math.hypot(p.getX(i), p.getZ(i));
        const s = petal ? 0.8 + Math.min(1, r / 0.14) * 0.22 : 0.4;
        col.push(s, s, s);
      }
      for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
      base += p.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }
  // くきと葉っぱ(みどり)
  const mergeNonIndexed = (list) => {
    const geo = new THREE.BufferGeometry();
    const pos = [], nor = [];
    for (const g of list) {
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return geo;
  };
  const leafGeo = (() => {
    const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.17, 4).translate(0, 0.085, 0).toNonIndexed();
    const leaf = new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.18, 0.45);
    const l1 = leaf.clone().rotateZ(-0.4).translate(0.06, 0.05, 0).toNonIndexed();
    const l2 = leaf.clone().rotateZ(0.4).translate(-0.06, 0.07, 0).rotateY(1.3).toNonIndexed();
    return mergeNonIndexed([stem, l1, l2]);
  })();
  // まだ咲いていないところの、小さな芽(ふた葉)
  const sproutGeo = (() => {
    const leaf = new THREE.SphereGeometry(0.035, 6, 4).scale(1, 0.25, 0.55);
    const l1 = leaf.clone().rotateZ(0.5).translate(0.03, 0.045, 0).toNonIndexed();
    const l2 = leaf.clone().rotateZ(-0.5).translate(-0.03, 0.045, 0).toNonIndexed();
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.05, 4).translate(0, 0.025, 0).toNonIndexed();
    return mergeNonIndexed([stem, l1, l2]);
  })();
  const cells = []; // { k(ます目の番号), x, z, rot, size, tilt }
  {
    let h = 7;
    const rnd = () => (h = (h * 16807) % 2147483647) / 2147483647;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!inField(i, j)) continue;
      cells.push({ k: j * N + i, x: cellX(i) + (rnd() - 0.5) * CELL * 0.45, z: cellX(j) + (rnd() - 0.5) * CELL * 0.45, rot: rnd() * 6, size: 0.9 + rnd() * 0.35, tilt: (rnd() - 0.5) * 0.3 });
    }
  }
  const flowerMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  // プレイヤーごとに1つ(形がちがう)。その子の花でないところは大きさ 0
  const flowers = FLOWER_KINDS.map((k) => new THREE.InstancedMesh(makeFlowerGeo(k), flowerMat, cells.length));
  const stems = new THREE.InstancedMesh(leafGeo, toonMaterial(0x4f9a3c), cells.length);
  for (const m of [...flowers, stems]) {
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    scene.add(m);
  }
  const sprouts = new THREE.InstancedMesh(sproutGeo, toonMaterial(0x7cc35a), cells.length);
  sprouts.receiveShadow = true;
  sprouts.frustumCulled = false;
  scene.add(sprouts);
  const dummy = new THREE.Object3D();
  cells.forEach((c, ci) => {
    dummy.position.set(c.x, 0, c.z);
    dummy.rotation.set(0, c.rot, 0);
    dummy.scale.setScalar(c.size * 0.9);
    dummy.updateMatrix();
    sprouts.setMatrixAt(ci, dummy.matrix);
  });
  // プレイヤーの色(ます目ごとに、ほんの少しだけ明るさを変える)
  const tmpC = new THREE.Color();
  const colorFor = (slot, c) => tmpC.setHex(PLAYER_COLORS[slot].hex).offsetHSL(0, 0, (((c.k * 37) % 5) - 2) * 0.012);
  // 見えている状態: shown(だれの花か)、anim(咲いてからの時間)、delay(じょうろの波)、dying(しぼんでいるときの前の持ち主)
  const shown = new Int8Array(cells.length).fill(-1);
  const anim = new Float32Array(cells.length).fill(-1);
  const delay = new Float32Array(cells.length);
  const dying = new Int8Array(cells.length).fill(-1);
  const drawnIn = new Int8Array(cells.length).fill(-1); // いま どの形のメッシュに描いているか
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function setFlower(ci, owner, scale, wob = 0) {
    const c = cells[ci];
    if (drawnIn[ci] >= 0 && drawnIn[ci] !== owner) flowers[drawnIn[ci]].setMatrixAt(ci, ZERO);
    if (owner < 0 || scale <= 0.001) {
      if (drawnIn[ci] >= 0) flowers[drawnIn[ci]].setMatrixAt(ci, ZERO);
      drawnIn[ci] = -1;
      stems.setMatrixAt(ci, ZERO);
      return;
    }
    dummy.position.set(c.x, 0, c.z);
    dummy.rotation.set(c.tilt + wob, c.rot, wob * 0.5);
    dummy.scale.setScalar(scale * c.size);
    dummy.updateMatrix();
    flowers[owner].setMatrixAt(ci, dummy.matrix);
    stems.setMatrixAt(ci, dummy.matrix);
    drawnIn[ci] = owner;
  }
  const dirty = () => { for (const m of [...flowers, stems]) m.instanceMatrix.needsUpdate = true; };
  for (let ci = 0; ci < cells.length; ci++) {
    for (const m of flowers) m.setMatrixAt(ci, ZERO);
    stems.setMatrixAt(ci, ZERO);
  }
  const active = new Set();
  // じょうろの波: 同じフレームに咲いたところは、まん中から順に咲かせる
  let waves = [];
  function resetFlowers() {
    shown.fill(-1);
    anim.fill(-1);
    dying.fill(-1);
    active.clear();
    for (let ci = 0; ci < cells.length; ci++) setFlower(ci, -1, 0);
    dirty();
  }
  let petalBudget = 0;
  function syncFlowers(dt) {
    const g = game.state.grid;
    petalBudget = Math.min(petalBudget + dt * 160, 40);
    const colored = new Set();
    for (let ci = 0; ci < cells.length; ci++) {
      const o = g[cells[ci].k];
      if (o === shown[ci]) continue;
      const was = shown[ci];
      shown[ci] = o;
      if (o >= 0) {
        flowers[o].setColorAt(ci, colorFor(o, cells[ci]));
        colored.add(o);
        anim[ci] = 0;
        dying[ci] = -1;
        delay[ci] = 0;
        for (const w of waves) {
          const d = Math.hypot(cells[ci].x - w.x, cells[ci].z - w.z);
          if (d < w.r + 0.3) delay[ci] = Math.max(delay[ci], d * 0.16);
        }
        // 咲きかわるときは、前の色の花びらが少し舞う
        if (was >= 0 && petalBudget >= 1 && Math.random() < 0.35) { petalBudget--; scatterPetals(cells[ci].x, cells[ci].z, was, 1, 0.8); }
      } else {
        // 散る(つむじ風)
        dying[ci] = was;
        anim[ci] = 0;
        if (petalBudget >= 1) { petalBudget -= 1; scatterPetals(cells[ci].x, cells[ci].z, was, 2, 2.2, true); }
      }
      active.add(ci);
    }
    waves = [];
    for (const o of colored) if (flowers[o].instanceColor) flowers[o].instanceColor.needsUpdate = true;
    for (const ci of active) {
      if (delay[ci] > 0) {
        // 波がとどくまでは、前の花のまま
        delay[ci] -= dt;
        continue;
      }
      anim[ci] += dt;
      const t = anim[ci];
      if (dying[ci] >= 0) {
        // しぼむ
        const k = Math.min(1, t / 0.25);
        setFlower(ci, dying[ci], 1 - k, k * 0.8);
        if (k >= 1) { active.delete(ci); dying[ci] = -1; setFlower(ci, -1, 0); }
      } else {
        // ぽん!と大きめに咲いて、ゆれながら落ちつく
        const k = Math.min(1, t / 0.45);
        const s = k < 0.4 ? (k / 0.4) * 1.3 : 1.3 - 0.3 * Math.sin(((k - 0.4) / 0.6) * Math.PI * 0.5);
        setFlower(ci, shown[ci], s, Math.sin(t * 25) * 0.25 * (1 - k));
        if (k >= 1) { active.delete(ci); setFlower(ci, shown[ci], 1); }
      }
    }
    dirty();
  }

  // ── 舞う花びら(演出なので Math.random でよい) ─────────────
  const PETALS = 500;
  const petalGeo = new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.2, 0.6);
  const petals = new THREE.InstancedMesh(petalGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }), PETALS);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  petals.frustumCulled = false;
  petals.count = 0;
  scene.add(petals);
  const pp = []; // { x, y, z, vx, vy, vz, rx, ry, life, max, swirl }
  function scatterPetals(x, z, slot, n = 3, speed = 1.5, swirl = false) {
    for (let i = 0; i < n && pp.length < PETALS; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = { x, y: 0.2, z, vx: Math.cos(a) * speed * (0.4 + Math.random()), vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * speed * (0.4 + Math.random()), rx: Math.random() * 6, ry: Math.random() * 6, life: 1.2 + Math.random() * 0.8, max: 2, swirl };
      p.max = p.life;
      pp.push(p);
      petals.setColorAt(pp.length - 1, tmpC.setHex(PLAYER_COLORS[slot].hex));
    }
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
  }
  function updatePetals(dt) {
    let colorDirty = false;
    for (let i = pp.length - 1; i >= 0; i--) {
      const p = pp[i];
      p.life -= dt;
      if (p.life <= 0 || p.y < 0.02) {
        // 最後のものと入れかえる(色も)
        const last = pp.pop();
        if (i < pp.length) {
          pp[i] = last;
          petals.getColorAt(pp.length, tmpC);
          petals.setColorAt(i, tmpC);
          colorDirty = true;
        }
        continue;
      }
      // ふわふわ落ちる(空気にとめられる)
      p.vx *= 1 - dt * 1.2; p.vz *= 1 - dt * 1.2;
      p.vy = Math.max(p.vy - dt * 6, -0.7);
      p.x += p.vx * dt + Math.sin(p.life * 6 + i) * dt * 0.3;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += dt * 7; p.ry += dt * 4;
    }
    for (let i = 0; i < pp.length; i++) {
      const p = pp[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.scale.setScalar(Math.min(1, p.life * 3));
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.count = pp.length;
    petals.instanceMatrix.needsUpdate = true;
    if (colorDirty && petals.instanceColor) petals.instanceColor.needsUpdate = true;
  }

  // ── きらきら・紙ふぶき・水しぶき ─────────────────────────
  const sparkleTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 9 : 30, a = (i / 8) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.shadowColor = '#fff';
    g.shadowBlur = 8;
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const fx = [];
  function sparkle(pos, color = 0xffffff, n = 5, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, color, transparent: true, depthWrite: false }));
      sp.position.copy(pos);
      sp.scale.setScalar(size);
      scene.add(sp);
      const a = Math.random() * Math.PI * 2;
      fx.push({ obj: sp, t: 0, life: 0.45 + Math.random() * 0.2, vel: new THREE.Vector3(Math.cos(a) * 1.6, 1.4 + Math.random() * 1.2, Math.sin(a) * 1.6), size, kind: 'sparkle' });
    }
  }
  const dropGeo = new THREE.SphereGeometry(0.035, 6, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85 });
  // じょうろ: 拾ったところで ふわっと浮かんで、くるっと回りながら まわりへ水をまく。小さな にじが かかる
  const pours = [];
  const RAINBOW = [0xff6b6b, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0xb197fc];
  function pourCan(x, z) {
    const can = makeCan();
    can.position.set(x, 0.3, z);
    scene.add(can);
    const bow = new THREE.Group();
    RAINBOW.forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1.75 - i * 0.09, 0.05, 4, 32, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false }));
      bow.add(m);
    });
    bow.position.set(x, 0, z);
    bow.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);
    scene.add(bow);
    pours.push({ can, bow, x, z, t: 0, acc: 0 });
    // 地面に広がる水の輪
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, depthWrite: false }));
    ring.position.set(x, 0.05, z);
    ring.renderOrder = 2;
    scene.add(ring);
    fx.push({ obj: ring, t: 0, life: 0.9, r: RULES.canR, kind: 'wave' });
  }
  const spoutV = new THREE.Vector3();
  function updatePours(dt) {
    for (let i = pours.length - 1; i >= 0; i--) {
      const p = pours[i];
      p.t += dt;
      const t = p.t;
      // 0〜0.3 秒: 浮かぶ / 0.3〜1.2 秒: かたむけて、回りながら まく / そのあと きらっと消える
      const up = Math.min(1, t / 0.3);
      p.can.position.y = 0.3 + (1 - (1 - up) ** 3) * 1.6 + Math.sin(t * 6) * 0.05;
      p.can.rotation.z = -0.75 * Math.min(1, Math.max(0, (t - 0.15) / 0.2));
      p.can.rotation.y = t * 5;
      const end = Math.min(1, Math.max(0, (t - 1.2) / 0.25));
      p.can.scale.setScalar(1.3 * (1 - end) + 0.001);
      if (t > 0.25 && t < 1.25) {
        p.acc += dt * 70;
        // じょうろの口(はす口)から、外へ向かって水つぶ
        p.can.updateMatrixWorld();
        spoutV.set(0.5, 0.4, 0).applyMatrix4(p.can.matrixWorld);
        const out = new THREE.Vector3(spoutV.x - p.x, 0, spoutV.z - p.z).normalize();
        while (p.acc >= 1) {
          p.acc--;
          const m = new THREE.Mesh(dropGeo, dropMat);
          m.position.copy(spoutV);
          scene.add(m);
          const sp = 1.2 + Math.random() * 1.4;
          fx.push({ obj: m, t: 0, life: 0.9, vel: new THREE.Vector3(out.x * sp + (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.8, out.z * sp + (Math.random() - 0.5) * 0.6), kind: 'drop' });
        }
      }
      if (Math.abs(t - 1.25) < dt) sparkle(p.can.position, 0xffffff, 6, 0.35);
      // にじ: ふわっと出て、ゆっくり消える
      const bowA = Math.min(1, Math.max(0, (t - 0.3) / 0.3)) * (1 - Math.min(1, Math.max(0, (t - 1.4) / 0.6)));
      p.bow.children.forEach((m) => { m.material.opacity = bowA * 0.55; });
      p.bow.scale.setScalar(0.85 + bowA * 0.15);
      if (t > 2.1) {
        scene.remove(p.can, p.bow);
        p.bow.children.forEach((m) => m.material.dispose());
        pours.splice(i, 1);
      }
    }
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 3, 3.5 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), kind: 'confetti' });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (f.kind === 'sparkle') {
        f.vel.y -= dt * 4;
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.material.opacity = 1 - k;
        f.obj.scale.setScalar(f.size * (1 - k * 0.6));
      } else if (f.kind === 'drop') {
        f.vel.y -= dt * 12;
        f.obj.position.addScaledVector(f.vel, dt);
        if (f.obj.position.y < 0.05) f.t = f.life;
      } else if (f.kind === 'wave') {
        f.obj.scale.setScalar(0.2 + f.r * Math.min(1, k * 1.4));
        f.obj.material.opacity = 0.9 * (1 - k);
      } else if (f.kind === 'confetti') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.position.x += Math.sin(f.t * 5 + i) * dt * 0.5;
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
        if (f.obj.position.y < 0.2) { f.obj.position.y = 0.2; f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); }
      }
      if (k >= 1) {
        scene.remove(f.obj);
        if (f.kind !== 'drop') f.obj.material.dispose();
        fx.splice(i, 1);
      }
    }
  }

  // ── じょうろ・ミツバチ ───────────────────────────────
  function makeCan() {
    const g = new THREE.Group();
    const tin = toonMaterial(0x5fb8c8), dark = toonMaterial(0x3d8a9a), rose = toonMaterial(0xf2c14a);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.32, 16), tin);
    body.position.y = 0.16;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18).rotateX(Math.PI / 2), dark);
    rim.position.y = 0.32;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.42, 8), tin);
    spout.position.set(0.3, 0.26, 0);
    spout.rotation.z = -0.9;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.06, 12), rose);
    head.position.set(0.47, 0.39, 0);
    head.rotation.z = -0.9;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16, Math.PI), dark);
    handle.position.set(-0.17, 0.2, 0);
    handle.rotation.z = Math.PI / 2;
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 16, Math.PI), dark);
    top.position.set(0, 0.32, 0);
    g.add(body, rim, spout, head, handle, top);
    g.scale.setScalar(1.3);
    return g;
  }
  const beeWingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  function makeBee() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const yel = toonMaterial(0xffc928), blk = toonMaterial(0x2a2218);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), yel);
    b.scale.set(1, 0.9, 1.25);
    body.add(b);
    for (const z of [-0.06, 0.06]) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.03, 6, 18), blk);
      s.position.z = z - 0.02;
      s.scale.set(1, 0.92, 1);
      body.add(s);
    }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), blk);
    sting.rotation.x = -Math.PI / 2;
    sting.position.z = -0.2;
    body.add(sting);
    // 顔: 白目 + 黒目 + 光、ほっぺ、にっこり口。頭に2本の触角
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
    const cheek = new THREE.MeshBasicMaterial({ color: 0xff9a8a });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), white);
      e.position.set(s * 0.058, 0.045, 0.165);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), black);
      p.position.set(s * 0.06, 0.042, 0.193);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), white);
      hl.position.set(s * 0.06 + 0.008, 0.052, 0.214);
      const ck = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), cheek);
      ck.scale.set(1, 0.6, 0.4);
      ck.position.set(s * 0.1, -0.012, 0.15);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4), blk);
      ant.position.set(s * 0.045, 0.17, 0.11);
      ant.rotation.set(0.5, 0, -s * 0.35);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), blk);
      tip.position.set(s * 0.068, 0.225, 0.14);
      body.add(e, p, hl, ck, ant, tip);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 10, Math.PI), black);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, 0.0, 0.185);
    body.add(mouth);
    const wings = [];
    const wingGeo = new THREE.CircleGeometry(0.12, 12);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.05, 0.12, 0);
      const w = new THREE.Mesh(wingGeo, beeWingMat);
      w.scale.set(0.6, 1, 1);
      w.rotation.x = -Math.PI / 2;
      w.position.set(s * 0.09, 0, -0.03);
      pivot.add(w);
      body.add(pivot);
      wings.push({ pivot, s });
    }
    g.add(body);
    g.userData.wings = wings;
    g.scale.setScalar(1.6);
    return g;
  }
  const ringGeo = new THREE.RingGeometry(0.52, 0.62, 36).rotateX(-Math.PI / 2);
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(40,30,20,0.5)');
    r.addColorStop(0.7, 'rgba(40,30,20,0.3)');
    r.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function makeShadow(size) {
    const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.position.y = 0.03;
    m.scale.setScalar(size);
    m.renderOrder = 1;
    return m;
  }
  const items = new Map(); // id → { group, mesh, ring, kind, t }
  function addItem(e) {
    const group = new THREE.Group();
    group.position.set(e.x, 0, e.z);
    const mesh = e.kind === 'can' ? makeCan() : makeBee();
    mesh.traverse((o) => { o.castShadow = true; });
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: e.kind === 'can' ? 0x9fdcff : 0xffd24a, transparent: true, depthWrite: false }));
    ring.position.y = 0.04;
    ring.renderOrder = 2;
    group.add(mesh, ring, makeShadow(0.7));
    scene.add(group);
    items.set(e.id, { group, mesh, ring, kind: e.kind, t: 0 });
  }
  function removeItem(id) {
    const v = items.get(id);
    if (!v) return;
    scene.remove(v.group);
    v.ring.material.dispose();
    items.delete(id);
  }
  // ミツバチをもらった子のまわりを飛ぶハチ(1人に1ぴき)
  const followBees = new Map(); // slot → bee group
  function updateItems(dt) {
    const s = game.state;
    const byId = new Map(s.items.map((it) => [it.id, it]));
    for (const [id, v] of items) {
      const it = byId.get(id);
      v.t += dt;
      // 出てくるときは ぽんと大きく
      const pop = Math.min(1, v.t / 0.35);
      const sc = pop < 1 ? Math.sin(pop * Math.PI * 0.75) * 1.25 : 1;
      v.mesh.scale.setScalar((v.kind === 'can' ? 1.3 : 1.6) * Math.max(0.01, sc));
      if (v.kind === 'can') {
        v.mesh.position.y = 0.25 + Math.sin(v.t * 3) * 0.08;
        v.mesh.rotation.y = v.t * 1.2;
      } else {
        v.mesh.position.set(Math.sin(v.t * 1.7) * 0.25, 0.7 + Math.sin(v.t * 3.4) * 0.12, Math.sin(v.t * 3.4) * 0.12);
        v.mesh.rotation.y = Math.cos(v.t * 1.7) * 0.7; // 手前(カメラのほう)を向いて、左右に ゆらゆら
        v.mesh.rotation.z = -Math.cos(v.t * 1.7) * 0.15;
        for (const w of v.mesh.userData.wings) w.pivot.rotation.z = w.s * (0.3 + Math.sin(v.t * 60) * 0.5);
      }
      v.ring.scale.setScalar(1 + Math.sin(v.t * 4) * 0.06);
      // 消える前は点滅
      const blink = it && it.life < 2 && Math.sin(it.life * 20) < 0;
      v.mesh.visible = !blink;
      v.ring.material.opacity = blink ? 0.3 : 0.85;
    }
    // ついてくるハチ
    s.runners.forEach((r, slot) => {
      let b = followBees.get(slot);
      if (r.bee > 0 && !b) {
        b = makeBee();
        b.scale.setScalar(1.1);
        b.userData.t = Math.random() * 6;
        scene.add(b);
        followBees.set(slot, b);
      }
      if (!b) return;
      b.userData.t += dt;
      const t = b.userData.t;
      const rad = 0.75;
      b.position.set(r.x + Math.cos(t * 4) * rad, 0.55 + Math.sin(t * 7) * 0.12, r.z + Math.sin(t * 4) * rad);
      b.rotation.y = -t * 4;
      for (const w of b.userData.wings) w.pivot.rotation.z = w.s * (0.3 + Math.sin(t * 60) * 0.5);
      // 花粉のきらきらを落としていく
      b.userData.pollen = (b.userData.pollen || 0) + dt;
      if (r.bee > 0 && b.userData.pollen > 0.09) {
        b.userData.pollen = 0;
        sparkle(b.position, 0xffe27a, 1, 0.16);
      }
      // 時間ぎれ: 上へ飛んでいく
      if (r.bee <= 0) {
        b.userData.gone = (b.userData.gone || 0) + dt;
        b.position.y += b.userData.gone * 3;
        if (b.userData.gone > 0.8) { scene.remove(b); followBees.delete(slot); }
      } else b.userData.gone = 0;
    });
  }

  // ── つむじ風 ────────────────────────────────────────
  // 知らせ: 来る道に、地面の矢じるし(赤白のしま)がのびる。そのあと、白いうずが道を進む
  const arrowTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(8, 10); g.lineTo(40, 32); g.lineTo(8, 54); g.lineTo(22, 32); g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const winds = new Map(); // id → { path, twister, mark, t, gone }
  // うずの模様: ななめの白いすじ(上へ流して回すと、ねじれて巻き上がって見える)
  const swirlTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const y = (i / 9) * 128;
      const grad = g.createLinearGradient(0, y, 128, y + 40);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${0.55 + (i % 3) * 0.15})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = grad;
      g.lineWidth = 5 + (i % 3) * 3;
      g.beginPath();
      g.moveTo(-10, y);
      g.bezierCurveTo(40, y + 10, 90, y + 30, 138, y + 44);
      g.stroke();
      // 下へはみだしたぶんは上にも描く(つなぎ目を出さない)
      g.beginPath();
      g.moveTo(-10, y - 128);
      g.bezierCurveTo(40, y - 118, 90, y - 98, 138, y - 84);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  // 来るところの「!」
  const warnTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ff6a4e';
    g.strokeStyle = '#fff';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = '900 86px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 64, 70);
    return new THREE.CanvasTexture(c);
  })();
  // ろうと(じょうご)の形: 下が細く、上へ広がる
  const funnelGeo = new THREE.LatheGeometry([[0.12, 0], [0.22, 0.4], [0.38, 1.0], [0.62, 1.7], [0.95, 2.4], [1.25, 2.9]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const dustMat = new THREE.MeshToonMaterial({ color: 0xe8d6b4, gradientMap: toonGradient, transparent: true, opacity: 0.5, depthWrite: false });
  const dustGeo = new THREE.IcosahedronGeometry(0.15, 1);
  function makeTwister() {
    const g = new THREE.Group();
    const layers = [];
    for (const [sc, op, speed] of [[1, 0.55, 7], [0.72, 0.75, -10], [0.45, 0.6, 13]]) {
      const tex = swirlTex.clone();
      tex.repeat.set(2, 1.2);
      tex.needsUpdate = true;
      const m = new THREE.Mesh(funnelGeo, new THREE.MeshBasicMaterial({ map: tex, color: 0xf4fbff, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      m.scale.set(sc, 1, sc);
      m.renderOrder = 5;
      g.add(m);
      layers.push({ m, speed });
    }
    // 足もとの土ぼこり
    const dust = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(dustGeo, dustMat);
      g.add(m);
      dust.push({ m, a: (i / 9) * Math.PI * 2, r: 0.35 + (i % 3) * 0.12, ph: Math.random() * 6 });
    }
    // まきこまれた葉っぱ
    const leafMat = toonMaterial(0x7fbf4f);
    const bits = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 3).scale(1, 0.25, 0.6), leafMat);
      g.add(m);
      bits.push({ m, a: Math.random() * 6, h: Math.random() * 2.6 });
    }
    g.userData = { layers, dust, bits };
    return g;
  }
  function disposeTwister(t) {
    for (const { m } of t.userData.layers) { m.material.map.dispose(); m.material.dispose(); }
  }
  function addWind(e) {
    const len = Math.hypot(e.ex - e.x, e.ez - e.z);
    const mat = new THREE.MeshBasicMaterial({ map: arrowTex.clone(), color: 0xff6a4e, transparent: true, opacity: 0, depthWrite: false });
    mat.map.repeat.set(len / 0.9, 1);
    mat.map.needsUpdate = true;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(len, RULES.windR * 1.6).rotateX(-Math.PI / 2), mat);
    path.position.set((e.x + e.ex) / 2, 0.24, (e.z + e.ez) / 2); // 花の上に見えるように
    path.rotation.y = -Math.atan2(e.ez - e.z, e.ex - e.x);
    path.renderOrder = 3;
    scene.add(path);
    // 「!」は、花畑のふちの 来るところに
    const k = (Math.hypot(e.x, e.z) - FIELD_R + 0.4) / len;
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTex, transparent: true, depthTest: false }));
    mark.position.set(e.x + (e.ex - e.x) * k, 1.1, e.z + (e.ez - e.z) * k);
    mark.renderOrder = 9;
    scene.add(mark);
    const twister = makeTwister();
    twister.position.set(e.x, 0, e.z);
    twister.scale.setScalar(0.01);
    scene.add(twister);
    winds.set(e.id, { path, twister, mark, t: 0, gone: 0 });
    sfx.whistle();
  }
  let camShake = 0;
  function updateWinds(dt) {
    const s = game.state;
    const byId = new Map(s.winds.map((w) => [w.id, w]));
    const me = s.runners[0];
    for (const [id, v] of winds) {
      v.t += dt;
      const w = byId.get(id);
      let grow = 1;
      if (w) {
        v.twister.position.set(w.x, 0, w.z);
        v.path.material.map.offset.x -= dt * 2.5;
        if (w.warn > 0) {
          // 矢じるしが ちかちか流れる。「!」が ぽんぽん はねる。うずは外で だんだん育つ
          v.path.material.opacity = 0.4 + 0.35 * Math.abs(Math.sin(v.t * 8));
          const b = Math.abs(Math.sin(v.t * 9));
          v.mark.scale.setScalar(0.7 + b * 0.15);
          v.mark.position.y = 1.1 + b * 0.25;
          grow = Math.min(1, v.t / RULES.windWarn) * 0.55;
        } else {
          v.path.material.opacity = Math.max(0, v.path.material.opacity - dt * 0.8);
          v.mark.visible = false;
          grow = Math.min(1, v.twister.scale.y + dt * 3);
          if (!v.roared) { v.roared = true; sfx.gust(Math.max(0.35, volFor(w.x, w.z))); }
          if (Math.random() < dt * 24) scatterLeaf(w.x, w.z);
          // 近くを通ると、画面が少しゆれる
          const d = Math.hypot(w.x - me.x, w.z - me.z);
          if (d < 3) camShake = Math.max(camShake, 0.12 * (1 - d / 3));
        }
      } else {
        // 外へ抜けた: しぼんで消える
        v.gone += dt;
        grow = Math.max(0.01, 1 - v.gone * 2);
        v.path.material.opacity = 0;
        v.mark.visible = false;
        if (v.gone > 0.5) {
          scene.remove(v.path, v.twister, v.mark);
          v.path.material.map.dispose();
          v.path.material.dispose();
          v.mark.material.dispose();
          disposeTwister(v.twister);
          winds.delete(id);
          continue;
        }
      }
      // ゆらゆら首をふりながら(上ほど大きく)
      v.twister.scale.set(grow * (1 + Math.sin(v.t * 6) * 0.05), grow, grow * (1 + Math.cos(v.t * 6) * 0.05));
      v.twister.rotation.set(Math.sin(v.t * 2.3) * 0.08, 0, Math.cos(v.t * 1.9) * 0.08);
      const { layers, dust, bits } = v.twister.userData;
      for (const L of layers) {
        L.m.rotation.y += dt * L.speed;
        L.m.material.map.offset.y -= dt * 1.2;
      }
      for (const d of dust) {
        d.a += dt * 6;
        const p = (Math.sin(v.t * 5 + d.ph) + 1) / 2;
        d.m.position.set(Math.cos(d.a) * (d.r + p * 0.2), 0.1 + p * 0.12, Math.sin(d.a) * (d.r + p * 0.2));
        d.m.scale.setScalar(0.7 + p * 0.6);
      }
      for (const b of bits) {
        b.a += dt * 8;
        b.h = (b.h + dt * 1.6) % 2.8;
        const r = 0.25 + b.h * 0.38;
        b.m.position.set(Math.cos(b.a) * r, b.h, Math.sin(b.a) * r);
        b.m.rotation.set(b.a * 2, b.a, 0);
      }
    }
    camShake = Math.max(0, camShake - dt * 0.4);
  }
  // つむじ風のまわりで舞う葉っぱ(みどりの花びら)
  function scatterLeaf(x, z) {
    if (pp.length >= PETALS) return;
    const a = Math.random() * Math.PI * 2;
    pp.push({ x: x + Math.cos(a) * 0.5, y: 0.3, z: z + Math.sin(a) * 0.5, vx: -Math.sin(a) * 3, vy: 2 + Math.random() * 2, vz: Math.cos(a) * 3, rx: 0, ry: 0, life: 1, max: 1 });
    petals.setColorAt(pp.length - 1, tmpC.setHex(Math.random() < 0.5 ? 0xa8d878 : 0xd9c09a));
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), target: null };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const id of [...items.keys()]) removeItem(id);
    for (const [id, v] of winds) { scene.remove(v.path, v.twister, v.mark); disposeTwister(v.twister); winds.delete(id); }
    for (const [slot, b] of followBees) { scene.remove(b); followBees.delete(slot); }
    pp.length = 0;
    for (const p of pours.splice(0)) scene.remove(p.can, p.bow);

    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      const def = CHARACTERS.find((c) => c.key === p.character);
      const size = def.size || 1;
      const sh = makeShadow(0.95 * size);
      holder.add(sh);
      const r = state.runners[slot];
      holder.position.set(r.x, 0, r.z);
      model.root.rotation.y = Math.atan2(-r.x, -r.z);
      scene.add(holder);
      return { model, holder, shadow: sh, size, face: model.root.rotation.y, happyT: 0, spinT: 0 };
    }));
    // 自分の足もとに、自分の色の輪と、頭の上の しるし
    const foot = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    foot.position.y = 0.3;
    foot.renderOrder = 4;
    runners[0].holder.add(foot);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;

    for (const f of fx.splice(0)) scene.remove(f.obj);
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, lastSec: null, leader: null, leadAt: 0, finT: 0, fin: {} };
    resetFlowers();
    syncFlowers(1);
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    input.touch = null;
    input.stick = null;
    input.target = null;
    buildScores();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoH').classList.add('show');
    $('hudH').classList.remove('last');
    $('tallyH').hidden = true;
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudH').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) {
    input.touch = null;
    onExit(to);
  }

  // ── 一時停止 ──────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) input.touch = null;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnH').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック(キャッチと同じ) ──────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickH'), knobEl = stickEl.firstElementChild;
  const canSteer = (e) => mode === 'playing' && !paused && !e.target.closest('button, a');
  window.addEventListener('pointerdown', (e) => {
    if (!canSteer(e) || input.touch !== null) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoH').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    if (input.touch !== e.pointerId || !input.stick) return;
    let dx = e.clientX - input.stick.ox, dy = e.clientY - input.stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R * 1.4) {
      input.stick.ox += (dx / d) * (d - STICK_R * 1.4);
      input.stick.oy += (dy / d) * (d - STICK_R * 1.4);
      stickEl.style.left = `${input.stick.ox}px`;
      stickEl.style.top = `${input.stick.oy}px`;
      dx = e.clientX - input.stick.ox;
      dy = e.clientY - input.stick.oy;
    }
    const dist = Math.hypot(dx, dy);
    const k = Math.min(1, Math.max(0, (dist - DEAD) / (FULL - DEAD)));
    const a = Math.atan2(dy, dx);
    input.stick.dx = Math.cos(a) * k;
    input.stick.dy = Math.sin(a) * k;
    const shownD = Math.min(dist, STICK_R);
    knobEl.style.transform = `translate(calc(-50% + ${Math.cos(a) * shownD}px), calc(-50% + ${Math.sin(a) * shownD}px))`;
  });
  const release = (e) => {
    if (input.touch !== e.pointerId) return;
    input.touch = null;
    input.stick = null;
    stickEl.hidden = true;
  };
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, release);
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoH').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });

  const fwd = new THREE.Vector3();
  function myInput() {
    if (input.target) return input.target;
    const me = game.state.runners[0];
    let sx = 0, sy = 0;
    if (input.keys.size) {
      for (const k of input.keys) { sx += KEYS[k][0]; sy += KEYS[k][1]; }
      const d = Math.hypot(sx, sy);
      if (d) { sx /= d; sy /= d; }
    } else if (input.stick) {
      sx = input.stick.dx;
      sy = input.stick.dy;
    }
    if (Math.hypot(sx, sy) < 0.05) return null;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const wx = -fwd.z * sx + fwd.x * -sy, wz = fwd.x * sx + fwd.z * -sy;
    return { x: me.x + wx * 0.6, z: me.z + wz * 0.6 };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashH');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  // 札と結果に出す、その子の花の形(画面の花と同じ数・形の花びら)
  function flowerSvg(slot) {
    const k = FLOWER_KINDS[slot], col = css(PLAYER_COLORS[slot].hex);
    const rx = k.pointed ? 2.2 : 4.2 * k.wid + 0.6, ry = k.pointed ? 4.6 : 4.4;
    let petals = '';
    for (let layer = 0; layer < (k.layers || 1); layer++) {
      const sc = 1 - layer * 0.35;
      for (let i = 0; i < k.n; i++) {
        const a = ((i + layer * 0.5) / k.n) * 360;
        petals += `<ellipse cx="10" cy="${10 - 4.6 * sc}" rx="${rx * sc}" ry="${ry * sc}" transform="rotate(${a} 10 10)" fill="${col}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`;
      }
    }
    return `<svg class="fl" viewBox="0 0 20 20" aria-hidden="true">${petals}<circle cx="10" cy="10" r="2.6" fill="${col}" stroke="rgba(0,0,0,.45)" stroke-width="1.6"/></svg>`;
  }
  function buildScores() {
    $('scoresH').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `${flowerSvg(slot)}<b>0</b><small>%</small>`;
      d.title = p.name;
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    const left = s.phase === 'ready' ? RULES.timeLimit : timeLeft(s);
    $('timerH').firstChild.nodeValue = String(Math.ceil(left));
    $('timerH').classList.toggle('rain', s.last && s.phase === 'play');
    const order = ranking(s);
    const chips = [...$('scoresH').children];
    order.forEach((slot, rank) => {
      const c = chips[slot];
      c.style.order = rank;
      const b = c.children[1];
      const v = String(pct(share(s, slot)));
      if (b.textContent !== v) {
        b.textContent = v;
        if (slot === 0) {
          c.classList.remove('up');
          void c.offsetWidth;
          c.classList.add('up');
        }
      }
      c.classList.toggle('stun', s.runners[slot].stun > 0);
      c.classList.toggle('lead', rank === 0 && s.counts[slot] > 0);
    });
    // ラストスパートの秒読み
    if (s.last && s.phase === 'play') {
      const sec = Math.ceil(timeLeft(s));
      if (sec !== game.lastSec) {
        game.lastSec = sec;
        if (sec <= 3) { tone(1175, 0.09, 'square', 0.05); splash(String(sec), 'count'); }
        else tone(880, 0.06, 'square', 0.04);
      }
    }
    // トップが入れかわったら知らせる(はじめの数秒と、差がないときは だまっている)
    if (s.phase === 'play') {
      const lead = order[0];
      if (game.leader === null) game.leader = lead;
      const gap = s.counts[order[0]] - s.counts[order[1]];
      if (lead !== game.leader && gap >= 2 && s.t > RULES.readyTime + 5 && s.t - game.leadAt > 1.5) {
        const before = game.leader;
        game.leader = lead;
        game.leadAt = s.t;
        if (lead === 0) {
          notice('トップ!', 'up');
          tone(988, 0.08); tone(1318, 0.18, 'triangle', 0.1, 0.08);
        } else if (before === 0) notice('トップを とられた!', 'down');
        else notice(`${game.players[lead].name}が トップ!`, '', lead);
      }
    }
  }
  function notice(text, cls = '', slot = null) {
    const el = $('noticeH');
    el.innerHTML = (slot !== null ? flowerSvg(slot) : '') + text;
    el.className = 'notice ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  // 決着: 広さの帯をのばして、勝った子の名前
  function showTally() {
    const s = game.state, order = ranking(s);
    const el = $('tallyH');
    const bar = el.querySelector('.bar');
    bar.replaceChildren(...order.map((slot) => {
      const i = document.createElement('i');
      i.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      return i;
    }));
    el.querySelector('.labels').innerHTML = order.map((slot) => `<span class="${slot === 0 ? 'me' : ''}">${flowerSvg(slot)}${pct(share(s, slot))}%</span>`).join('');
    const win = el.querySelector('.win');
    win.textContent = '';
    win.className = 'win';
    el.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      [...bar.children].forEach((i, k) => { i.style.width = `${share(s, order[k]) * 100}%`; });
    }));
  }
  function showWinner() {
    const s = game.state;
    const win = $('tallyH').querySelector('.win');
    win.textContent = s.winner === 0 ? 'あなたの勝ち!' : `${game.players[s.winner].name}の勝ち!`;
    void win.offsetWidth;
    win.classList.add('show');
  }
  // 勝った子の花が、その子のところから波のように はねる
  function celebrate(t) {
    const s = game.state, w = s.runners[s.winner];
    for (let ci = 0; ci < cells.length; ci++) {
      if (shown[ci] !== s.winner || active.has(ci)) continue;
      const k = t - Math.hypot(cells[ci].x - w.x, cells[ci].z - w.z) * 0.12;
      setFlower(ci, s.winner, k > 0 && k < 0.45 ? 1 + 0.5 * Math.sin((k / 0.45) * Math.PI) : 1);
    }
    dirty();
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '') {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsH').append(el);
    setTimeout(() => el.remove(), 900);
  }

  // ── できごと ────────────────────────────────────────
  function cheer(x, z, r = 6) {
    for (const a of audience) {
      if (Math.hypot(a.seat.x - x, a.seat.z - z) > r) continue;
      a.model.play('cheer');
      a.model.setFace('happy');
      a.until = 1.2;
    }
  }
  function onEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('スタート!');
          setTimeout(() => $('howtoH').classList.remove('show'), 6000);
          tone(784, 0.12); tone(1046, 0.25, 'triangle', 0.12, 0.12);
          break;
        case 'last':
          splash('ラストスパート!', 'gold');
          $('hudH').classList.add('last');
          for (const a of audience) { a.model.play('cheer'); a.model.setFace('happy'); a.until = 2; }
          break;
        case 'item':
          addItem(e);
          sfx.pon(Math.max(0.3, volFor(e.x, e.z)));
          break;
        case 'itemGone':
          removeItem(e.id);
          break;
        case 'can': {
          removeItem(e.id);
          waves.push({ x: e.x, z: e.z, r: RULES.canR });
          pourCan(e.x, e.z);
          sfx.shower(e.slot === 0 ? 1 : Math.max(0.2, volFor(e.x, e.z)));
          game.runners[e.slot].happyT = 1;
          if (e.slot === 0) { splash('じょうろ!'); pop(`+${e.n}`, e.x, 1.6, e.z, 'me'); }
          cheer(e.x, e.z);
          break;
        }
        case 'bee':
          removeItem(e.id);
          sfx.buzz(e.slot === 0 ? 1 : Math.max(0.2, volFor(e.x, e.z)));
          game.runners[e.slot].happyT = 1;
          sparkle(new THREE.Vector3(e.x, 0.9, e.z), 0xffd24a, 7, 0.4);
          if (e.slot === 0) splash('ミツバチ!', 'gold');
          break;
        case 'wind':
          addWind(e);
          break;
        case 'blown': {
          const r = game.runners[e.slot];
          r.spinT = 0.9;
          sfx.blown(e.slot === 0 ? 1 : volFor(e.x, e.z));
          if (e.slot === 0) splash('ひゅーん!', 'red');
          break;
        }
        case 'bump': {
          sfx.boyon(Math.max(e.by === 0 || e.hit === 0 ? 1 : 0, volFor(e.x, e.z)));
          game.runners[e.hit].spinT = 0.5;
          game.runners[e.by].happyT = 0.6;
          sparkle(new THREE.Vector3(e.x, 1.1, e.z), 0xffffff, 6, 0.4);
          scatterPetals(e.x, e.z, e.by, 14, 2.5);
          if (e.by === 0) { splash('ドーン!'); pop(`+${e.n}`, e.x, 1.6, e.z, 'me'); }
          else if (e.hit === 0) splash('とられた!', 'red');
          cheer(e.x, e.z);
          break;
        }
        case 'finished': {
          game.endTimer = 6.5;
          game.finT = 0;
          splash('そこまで!');
          $('howtoH').classList.remove('show');
          $('hudH').classList.remove('last');
          tone(660, 0.3, 'square', 0.06);
          break;
        }
      }
    }
  }

  function showResult() {
    const s = game.state;
    if (tour) {
      const done = tour.onFinish;
      setMode('idle');
      done({ ranking: ranking(s), picked: null });
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
      const extra = [r.cans ? `じょうろ${r.cans}` : '', r.bees ? `ハチ${r.bees}` : ''].filter(Boolean).join('・');
      li.innerHTML = `<span class="no">${i + 1}</span>${flowerSvg(slot).replace('class="fl"', 'class="fl dot"')}` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${pct(share(s, slot))}%<small>${extra}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  function updateRunners(dt) {
    const s = game.state;
    const done = s.phase === 'finished';
    const winner = done ? s.runners[s.winner] : null;
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      v.holder.position.set(r.x, 0, r.z);
      const speed = Math.hypot(r.vx, r.vz);
      v.happyT = Math.max(0, v.happyT - dt);
      v.spinT = Math.max(0, v.spinT - dt);
      if (speed > 0.4 && r.stun <= 0) v.face = Math.atan2(r.vx, r.vz);
      let clip = 'idle', face = 'normal', timeScale = 1;
      if (r.stun > 0) {
        clip = 'dizzy';
        face = 'frustrated';
      } else if (done) {
        if (s.winner === i) {
          clip = 'cheer';
          face = 'happy';
          v.face = Math.atan2(camera.position.x - r.x, camera.position.z - r.z);
        } else {
          v.face = Math.atan2(winner.x - r.x, winner.z - r.z);
          clip = game.endTimer !== null && game.endTimer > 3 ? 'idle' : 'wave';
          face = clip === 'idle' ? 'frustrated' : 'happy';
        }
      } else if (speed > 0.3) {
        clip = 'run';
        timeScale = 0.6 + 0.6 * (speed / RULES.maxSpeed);
      }
      if (v.spinT > 0) face = 'surprised';
      else if (v.happyT > 0 && r.stun <= 0) face = 'happy';
      v.model.root.rotation.y = lerpAngle(v.model.root.rotation.y, v.face, 1 - Math.exp(-dt * 12)) + (v.spinT > 0 ? dt * Math.PI * 5 : 0);
      v.model.play(clip, { timeScale });
      v.model.setFace(face);
      v.model.update(dt);
      const lift = v.model.node('rig').position.y;
      v.shadow.scale.setScalar(0.95 * v.size * (1 - Math.min(0.5, lift * 0.9)));
      if (v.marker) v.marker.position.set(0, 2.0 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
  }

  // ひまわりは、いま いちばん広い子のほうへ、ゆっくり顔を向ける
  function updateSunflower(dt) {
    const sf = stage.sunflower;
    const s = game?.state;
    let target = 0;
    if (s && s.phase !== 'ready') {
      const lead = s.runners[ranking(s)[0]];
      target = Math.atan2(lead.x, lead.z);
    }
    sf.group.rotation.y = lerpAngle(sf.group.rotation.y, target, 1 - Math.exp(-dt * 1.2));
    sf.head.rotation.z = Math.sin(time * 1.3) * 0.05;
    stage.windmill.rotation.z -= dt * 0.7;
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const me = game ? game.state.runners[0] : { x: 0, z: 0 };
    let pos, look;
    if (game && (game.state.phase === 'finished' || mode === 'result')) {
      // 決着: 真上に近いところへ上がって、花畑ぜんぶを見せる
      pos = new THREE.Vector3(0, portrait ? 17 : 12.5, portrait ? 7.5 : 6.5);
      look = new THREE.Vector3(0, 0, 0.6);
    } else {
      // 自分を追いかける。花畑の広さが見えるよう、高めから。見る先は花畑の中に寄せる
      const fx = me.x * 0.65, fz = me.z * 0.65;
      pos = new THREE.Vector3(fx, portrait ? 10.5 : 7.6, fz + (portrait ? 7.6 : 6.6));
      look = new THREE.Vector3(fx, 0, fz - (portrait ? 0.6 : 0.6));
    }
    camera.fov = portrait ? 58 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      // 空から丘へ降りてくる: 風車のうしろから、くるっと回りこんで手前へ
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(-12, 24, -18);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, 0), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * (game?.state.phase === 'finished' ? 1.5 : 4));
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
    if (camShake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake, 0));
  }

  // ── 画質 ─────────────────────────────────────────
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

  // ── 1フレーム ─────────────────────────────────────
  let time = 0;
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
    }
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : myInput()));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      if (s.phase === 'finished') {
        game.finT += dt;
        const f = game.fin, t = game.finT;
        if (t > 1.3 && !f.tally) {
          f.tally = true;
          showTally();
          // ドロロロ…(帯がのびるあいだ)
          for (let i = 0; i < 10; i++) tone(300 + i * 30, 0.06, 'triangle', 0.05, i * 0.12);
        }
        if (t > 2.8 && !f.win) {
          f.win = true;
          showWinner();
          const w = s.runners[s.winner];
          confetti(w.x, w.z);
          for (const a of audience) { a.model.play('cheer'); a.model.setFace('happy'); a.until = 3; }
          tone(784, 0.15, 'triangle', 0.1); tone(988, 0.15, 'triangle', 0.1, 0.15); tone(1175, 0.4, 'triangle', 0.1, 0.3);
        }
        if (t > 2.8 && t < 5) celebrate(t - 2.8);
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
      syncFlowers(dt);
      updateRunners(dt);
      updateItems(dt);
      updateWinds(dt);
      updatePours(dt);
      updatePetals(dt);
      updateFx(dt);
    }
    if (!paused) {
      for (const a of audience) {
        if (a.until > 0) {
          a.until -= dt;
          if (a.until <= 0) { a.model.play('idle'); a.model.setFace('normal'); }
        }
        a.model.update(dt);
      }
      updateSunflower(dt);
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dhana = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    holdCpus: () => game.cpus.forEach((c) => { if (c) { c.think = 1e9; c.target = null; } }),
    // 描かずに、みんな CPU で sec 秒すすめる(途中の場面を撮る用)
    advance: (sec) => {
      const me = createCpu('normal', 1, 0);
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    sync: () => syncFlowers(1),
    // 指定した場所に じょうろ・ミツバチを置く(演出の確認用)
    spawn: (kind, x, z) => {
      const it = { id: game.state.nextId++, kind, x, z, life: 30 };
      game.state.items.push(it);
      onEvents([{ type: 'item', ...it }]);
    },
    get paused() { return paused; },
    camera, renderer, scene,
    freeCamera: (on) => { freeCamera = on; },
    setTime: (key) => atmosphere.apply(key),
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
    exit() {
      setMode('idle');
      input.touch = null;
      input.stick = null;
      $('stickH').hidden = true;
      input.keys.clear();
    },
    get intro() { return intro; },
  };
}
