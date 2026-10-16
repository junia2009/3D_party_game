// 落ち葉そりレース の画面(ひとり + CPU)。
//
// ルールは rules.js、コースは course.js、CPU は cpu.js、会場は stage.js。
// ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。タイトルと同じページで動く。
//
// 動かし方: 画面の左半分を押しているあいだ左へ、右半分で右へ。両方押すと伏せて速くなる(曲がれない)。
// パソコンは ← → / A D(両方、または ↓ で伏せる)。

import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, ranking, step } from './rules.js';
import { ACORNS, LENGTH, halfWidthAt } from './course.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { SEATS, buildStage, coursePoint, courseHeading } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';
import { acornGeometry } from '../daruma/trees.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

export async function createSled({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene);

  // ── 音 ──────────────────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
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
  // 雑音(ふつうの雑音と、落ち葉をふむ「シャカシャカ」の粒)。音を出せるようになったら1回だけ作る
  let noise = null;
  function noiseBufs() {
    if (noise) return noise;
    const len = audio.sampleRate * 2;
    const white = audio.createBuffer(1, len, audio.sampleRate);
    const w = white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    // 落ち葉: 短い「シャッ」がばらばらにたくさん(ふむたびに鳴る粒)+うすい雑音
    const leaf = audio.createBuffer(1, len, audio.sampleRate);
    const l = leaf.getChannelData(0);
    for (let i = 0; i < len; i++) l[i] = (Math.random() * 2 - 1) * 0.18;
    for (let k = 0; k < 260; k++) {
      const at = Math.floor(Math.random() * len), dur = Math.floor(audio.sampleRate * (0.004 + Math.random() * 0.02)), amp = 0.4 + Math.random() * 0.6;
      for (let j = 0; j < dur; j++) l[(at + j) % len] += (Math.random() * 2 - 1) * amp * (1 - j / dur) ** 2;
    }
    noise = { white, leaf };
    return noise;
  }
  // 雑音を短く鳴らす(ぼふっ・パン・シュイーン・わーっ)
  function hiss({ type = 'bandpass', f0, f1 = f0, q = 1, len, gain = 0.1, at = 0, attack = 0.005, buf = 'white' }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const src = audio.createBufferSource();
    src.buffer = noiseBufs()[buf];
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
    src.start(t, Math.random() * 1.5);
    src.stop(t + len + 0.05);
  }

  // すべりつづける音。3つを重ねて、速さ・曲がり・こすれで大きさと高さを変える
  //   leaves: 落ち葉をふむシャカシャカ(道のでこぼこで、こきざみにゆれる。速いほどこまかく)
  //   wind:   速いときのゴォー
  //   scrape: 土手をこするザザッ
  let slide = null;
  function startSlide() {
    if (!audio || slide) return;
    const { white, leaf } = noiseBufs();
    const layer = (buf, type, freq, q) => {
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = audio.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = audio.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(audio.destination);
      src.start(0, Math.random() * 1.5);
      return { src, f, g };
    };
    const leaves = layer(leaf, 'bandpass', 2500, 0.7);
    const wind = layer(white, 'lowpass', 400, 0.5);
    const scrape = layer(leaf, 'bandpass', 700, 1.2);
    // でこぼこのゆれ: 落ち葉の音の大きさを、ゆっくりした波でゆらす
    const lfo = audio.createOscillator(), lg = audio.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = 0;
    const shake = audio.createGain();
    shake.gain.value = 1;
    leaves.g.disconnect();
    leaves.g.connect(shake).connect(audio.destination);
    lfo.connect(lg).connect(shake.gain);
    lfo.start();
    slide = { leaves, wind, scrape, lfo, lg };
  }
  function stopSlide() {
    if (!slide) return;
    for (const l of [slide.leaves, slide.wind, slide.scrape]) l.src.stop();
    slide.lfo.stop();
    slide = null;
  }
  function updateSlide(dt, me, lean) {
    if (!slide) return;
    const on = mode === 'playing' && me.air <= 0 && me.finish === null;
    const k = on ? Math.min(1, me.v / 12) : 0;
    const ease = (p, to, rate = 8) => { p.value += (to - p.value) * Math.min(1, dt * rate); };
    ease(slide.leaves.g.gain, k * (0.07 + Math.abs(lean) * 0.05) * (me.tuck ? 0.75 : 1));
    ease(slide.leaves.f.frequency, 1600 + k * 2600 + Math.abs(lean) * 800);
    ease(slide.lfo.frequency, 4 + k * 10);
    ease(slide.lg.gain, k * 0.35);
    const fast = on ? Math.max(0, Math.min(1, (me.v - 8) / 6)) + (me.boost > 0 ? 0.5 : 0) : 0;
    ease(slide.wind.g.gain, fast * 0.09, 4);
    ease(slide.wind.f.frequency, 300 + fast * 700 + (me.tuck ? 200 : 0), 4);
    ease(slide.scrape.g.gain, on && me.scrape ? 0.16 : 0, 14);
  }

  const sfx = {
    koron: () => { voice({ type: 'triangle', pts: [[0, 880], [0.05, 830]], len: 0.08, gain: 0.1 }); voice({ type: 'triangle', pts: [[0, 1320]], len: 0.14, gain: 0.08, at: 0.06 }); },
    // どんぐりで加速: シュイーン(上がっていく風)
    zoom: () => { hiss({ f0: 500, f1: 3500, q: 3, len: 0.45, gain: 0.08, attack: 0.08 }); voice({ type: 'sine', pts: [[0, 600], [0.35, 1400]], len: 0.4, gain: 0.04, at: 0.05 }); },
    // キノコ: ぼよーん(ばねで上がる)
    jump: () => {
      voice({ type: 'triangle', pts: [[0, 140], [0.08, 90]], len: 0.12, gain: 0.14 });
      voice({ pts: [[0, 260], [0.35, 780]], len: 0.45, gain: 0.11, at: 0.04, vib: 30, vibRate: 14 });
    },
    // 着地: ぼふっ(落ち葉の山に落ちる)
    land: () => { hiss({ type: 'lowpass', f0: 1800, f1: 300, len: 0.3, gain: 0.2, buf: 'leaf' }); voice({ type: 'sine', pts: [[0, 110], [0.12, 55]], len: 0.16, gain: 0.13 }); },
    bump: () => voice({ pts: [[0, 180], [0.08, 380], [0.25, 150]], len: 0.28, gain: 0.1, vib: 25, vibRate: 16 }),
    beep: (hi) => voice({ type: 'square', pts: [[0, hi ? 1046 : 523]], len: hi ? 0.4 : 0.15, gain: 0.06 }),
    fanfare: () => [784, 988, 1175, 1568].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.3 + i * 0.1, gain: 0.1, at: i * 0.13 })),
    // テープが切れる: パン!
    snap: () => { hiss({ type: 'highpass', f0: 2500, len: 0.12, gain: 0.16, attack: 0.002 }); voice({ type: 'square', pts: [[0, 1600], [0.05, 600]], len: 0.06, gain: 0.03 }); },
    // 観客の歓声: わーっ(人の声くらいの高さの雑音を、いくつかずらして重ねる)
    cheer: (gain = 0.06) => {
      for (let i = 0; i < 5; i++) hiss({ f0: 700 + i * 180, f1: 900 + i * 150, q: 4, len: 1.2 + Math.random() * 0.5, gain: gain * (0.6 + Math.random() * 0.4), at: i * 0.05, attack: 0.15 });
    },
  };

  // ── 読みこみ: 観客(ゴールのまわり)と、ゴールの門の上の先生 ─────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', ...new Set(SEATS.map((s) => s.kind))]);
  const owl = await createModel('hoho');
  owl.root.position.copy(coursePoint(LENGTH, 0, 4.25));
  owl.root.rotation.y = courseHeading(LENGTH).yaw + Math.PI; // 向かってくるそりのほうを見る
  owl.play('idle');
  scene.add(owl.root);
  let owlCheer = 0;
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.copy(coursePoint(seat.s, seat.x, 0.4));
    m.root.rotation.y = courseHeading(seat.s).yaw + Math.PI + (seat.x > 0 ? 0.6 : -0.6);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));
  atmosphere.setupShadows([stage.group, owl.root], [stage.group]);
  atmosphere.setupShadows([], audience.map((a) => a.model.root));

  // ── 落ち葉のそり(大きなもみじの葉) ─────────────────────
  const leafShape = (() => {
    const sh = new THREE.Shape();
    const pts = [];
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI / 2 + (k / 14) * Math.PI * 2;
      const r = k % 2 ? 0.42 : 0.95 - Math.abs(Math.sin(a)) * 0.05;
      pts.push([Math.cos(a) * r * 0.7, Math.sin(a) * r]);
    }
    sh.moveTo(...pts[0]);
    for (const p of pts.slice(1)) sh.lineTo(...p);
    return sh;
  })();
  const sledGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  sledGeo.rotateX(-Math.PI / 2);
  sledGeo.rotateY(Math.PI); // 葉の先を前(キャラの正面 +z)へ
  sledGeo.scale(0.75, 1, 0.75);
  // 葉の先を、そりのように上へ反らせる。うしろのはしも少しだけ
  {
    const p = sledGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const up = z > 0.3 ? (z - 0.3) ** 2 * 1.6 : z < -0.45 ? (-0.45 - z) ** 2 * 0.8 : 0;
      p.setY(i, p.getY(i) + up);
    }
    sledGeo.computeVertexNormals();
  }
  // 葉の柄(うしろへ伸びて、くるんと上がる)
  const stemGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.08, -0.6), new THREE.Vector3(0, 0.07, -0.82), new THREE.Vector3(0, 0.12, -0.98), new THREE.Vector3(0, 0.24, -1.04),
  ]), 12, 0.028, 6);
  const sledColors = [0xe2402f, 0xf08a24, 0xf2b632, 0xc4532a, 0xd96a2a];

  // ── どんぐり(自分のぶんだけ見せる。拾うと消える) ─────────────
  const acornGeo = acornGeometry();
  const acornMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
  const acornMeshes = ACORNS.map((a) => {
    const m = new THREE.Mesh(acornGeo, acornMat);
    m.scale.setScalar(3);
    m.position.copy(coursePoint(a.s, a.x, 0.55));
    m.castShadow = true;
    scene.add(m);
    return m;
  });

  // ── 舞いあがる落ち葉(演出なので Math.random でよい) ─────────
  // 落ち葉の粒は、まとめて1回で描く(そりのうしろから出つづけるので数が多い)。
  // 落ち葉はふわりと落ちる: 重さは軽く、空気でとまり、くるくる回って左右にゆれる
  const LEAF_MAX = 420;
  const leafGeo = new THREE.ShapeGeometry(leafShape);
  leafGeo.scale(0.19, 0.19, 0.19);
  const leafPool = new THREE.InstancedMesh(leafGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), LEAF_MAX);
  leafPool.frustumCulled = false;
  leafPool.count = 0;
  scene.add(leafPool);
  // 0〜4: 落ち葉の色 / 5〜: 紙吹雪の色(ゴールで、もみじの形の紙吹雪をまく)
  const leafColors = [0xe2402f, 0xf08a24, 0xf6b93b, 0xc4532a, 0xe8a03a, 0xff5a4e, 0xffd23c, 0x3d8bff, 0x34c47c, 0x9b6bff, 0xff8ad8, 0xffffff].map((c) => new THREE.Color(c));
  const LEAF_KINDS = 5;
  const leaves = []; // { pos, vel, rot, spin, t, life, size, sway }
  for (let i = 0; i < LEAF_MAX; i++) leafPool.setColorAt(i, leafColors[i % leafColors.length]);
  function emitLeaf(pos, vel, size = 1, life = 0.9 + Math.random() * 0.6, color = Math.floor(Math.random() * LEAF_KINDS)) {
    if (leaves.length >= LEAF_MAX) leaves.shift(); // いっぱいなら古いものから
    leaves.push({
      pos: pos.clone(), vel: vel.clone(), t: 0, life, size: size * (0.7 + Math.random() * 0.6),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14),
      sway: Math.random() * 6, color,
    });
  }
  // はじける(ジャンプ・着地・どんぐり)
  const tmpV = new THREE.Vector3();
  function spray(pos, n, up = 2) {
    for (let i = 0; i < n; i++) {
      tmpV.set((Math.random() - 0.5) * 3, up * (0.6 + Math.random()), (Math.random() - 0.5) * 3);
      emitLeaf(pos, tmpV, 1.2);
    }
  }
  const leafDummy = new THREE.Object3D();
  function updateFx(dt) {
    for (let i = leaves.length - 1; i >= 0; i--) {
      const f = leaves[i];
      f.t += dt;
      if (f.t >= f.life) { leaves.splice(i, 1); continue; }
      f.vel.y -= (f.color >= LEAF_KINDS ? 2.2 : 4.5) * dt; // 紙吹雪はもっとゆっくり
      f.vel.multiplyScalar(Math.exp(-dt * (f.color >= LEAF_KINDS ? 1.6 : 2.2))); // 空気でとまる
      f.pos.addScaledVector(f.vel, dt);
      f.pos.x += Math.sin(f.t * 5 + f.sway) * dt * 0.6; // ひらひら
      f.rot.x += f.spin.x * dt;
      f.rot.y += f.spin.y * dt;
      f.rot.z += f.spin.z * dt;
    }
    leaves.forEach((f, i) => {
      leafDummy.position.copy(f.pos);
      leafDummy.rotation.copy(f.rot);
      leafDummy.scale.setScalar(f.size * Math.min(1, (f.life - f.t) * 3)); // 消えぎわに小さく
      leafDummy.updateMatrix();
      leafPool.setMatrixAt(i, leafDummy.matrix);
      leafPool.setColorAt(i, leafColors[f.color]);
    });
    leafPool.count = leaves.length;
    leafPool.instanceMatrix.needsUpdate = true;
    if (leafPool.instanceColor) leafPool.instanceColor.needsUpdate = true;
  }

  // そりのうしろから、速さに応じて落ち葉が舞いつづける。曲がると外がわへはね上げる。
  // 自分のそりは多め、ほかの子は少なめ(数をおさえる)
  const trailPos = new THREE.Vector3(), trailVel = new THREE.Vector3(), side = new THREE.Vector3(), fwd = new THREE.Vector3();
  function trail(v, r, mine, dt) {
    if (r.air > 0 || r.finish !== null || r.v < 2) return;
    const k = Math.min(1, r.v / 13);
    v.trailAcc = (v.trailAcc || 0) + dt * (mine ? 60 : 14) * k * (1 + Math.abs(v.lean) * 1.5 + (r.tuck ? 0.4 : 0));
    fwd.set(0, 0, 1).applyQuaternion(v.holder.quaternion);
    side.set(1, 0, 0).applyQuaternion(v.holder.quaternion); // キャラの左
    while (v.trailAcc >= 1) {
      v.trailAcc -= 1;
      const lr = Math.random() < 0.5 ? 1 : -1;
      trailPos.copy(v.holder.position).addScaledVector(fwd, -0.55).addScaledVector(side, lr * 0.3);
      trailPos.y += 0.1;
      // うしろ・上へ。曲がっているときは外がわ(lean > 0 の右曲がりなら左 = +side)へ
      trailVel.copy(fwd).multiplyScalar(-(0.5 + Math.random()) * k * 2)
        .addScaledVector(side, (Math.random() - 0.5) * 1.6 + v.lean * 3.2 * k)
        .setY(1.6 + Math.random() * 2.8 * k);
      emitLeaf(trailPos, trailVel, mine ? 1 : 0.9, 0.6 + Math.random() * 0.5);
    }
  }

  // ゴールの紙吹雪: 門の両方の柱の上から、内がわ・上へふきだす
  function confetti(n = 70) {
    const head = courseHeading(LENGTH);
    const hw = halfWidthAt(LENGTH) + 0.8;
    for (const sd of [-1, 1]) {
      const top = coursePoint(LENGTH, sd * hw, 4.2);
      const inward = coursePoint(LENGTH, 0, 0).sub(coursePoint(LENGTH, sd * hw, 0)).normalize();
      for (let i = 0; i < n / 2; i++) {
        tmpV.copy(inward).multiplyScalar(2 + Math.random() * 4);
        tmpV.x += Math.sin(head.th) * (Math.random() - 0.3) * 3; // 少し前(広場のほう)へ
        tmpV.z -= Math.cos(head.th) * (Math.random() - 0.3) * 3;
        tmpV.y = 3 + Math.random() * 4;
        emitLeaf(top, tmpV, 0.8, 2.4 + Math.random() * 1.4, LEAF_KINDS + Math.floor(Math.random() * (leafColors.length - LEAF_KINDS)));
      }
    }
  }

  // ゴールテープ: 1位が通ると切れて、走りぬけた子に押されて前へ流れ、先が地面につく(ひらひらゆれる)
  const tape = (() => {
    const hw = halfWidthAt(LENGTH) + 0.8;
    const grp = new THREE.Group();
    grp.position.copy(coursePoint(LENGTH, 0, 0.95));
    grp.rotation.y = courseHeading(LENGTH).yaw;
    scene.add(grp);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 16;
    const g2 = c.getContext('2d');
    for (let i = 0; i < 16; i++) { g2.fillStyle = i % 2 ? '#ffffff' : '#ff5a4e'; g2.fillRect(i * 16, 0, 16, 16); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const droop = Math.asin(0.9 / hw); // 先が地面につく傾き
    const halves = [-1, 1].map((sd) => {
      const pivot = new THREE.Group();
      pivot.position.x = sd * hw;
      const geo = new THREE.PlaneGeometry(hw, 0.14, 12, 1);
      geo.translate(-sd * hw / 2, 0, 0); // 柱から内がわへのびる
      const m = new THREE.Mesh(geo, mat);
      pivot.add(m);
      grp.add(pivot);
      return { pivot, sd, swing: 0, vel: 0, turn: 0, tvel: 0 };
    });
    return {
      broken: false,
      reset() { this.broken = false; for (const h of halves) { h.swing = h.vel = h.turn = h.tvel = 0; h.pivot.rotation.set(0, 0, 0); } },
      cut() { this.broken = true; for (const h of halves) { h.vel = 3; h.tvel = 9; } },
      update(dt) {
        if (!this.broken) return;
        for (const h of halves) {
          // ばねで、先が地面につく傾き(下へ)と、前へ流れる向きへ。ゆれながらおちつく
          h.vel += ((droop - h.swing) * 30 - h.vel * 3) * dt;
          h.swing += h.vel * dt;
          h.tvel += ((1.0 - h.turn) * 20 - h.tvel * 2.5) * dt;
          h.turn += h.tvel * dt;
          h.pivot.rotation.z = h.sd * h.swing;
          h.pivot.rotation.y = h.sd * (h.turn + Math.sin(performance.now() / 260 + h.sd) * 0.08);
        }
      },
    };
  })();

  // 風の線: 速いとき、道のわきを白い線が流れていく(世界に置いた線を、そりが追いぬいていく)
  const WIND = 18;
  const windGeo = new THREE.PlaneGeometry(0.03, 1);
  windGeo.rotateX(-Math.PI / 2);
  const windMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const winds = Array.from({ length: WIND }, () => {
    const m = new THREE.Mesh(windGeo, windMat);
    m.visible = false;
    scene.add(m);
    return { m, s: -1e9, x: 0, h: 0 };
  });
  function updateWind(dt) {
    const me = game.state.runners[0];
    const k = mode === 'playing' && me.air <= 0 && me.finish === null ? Math.max(0, Math.min(1, (me.v - 8) / 5)) + (me.boost > 0 ? 0.6 : 0) : 0;
    windMat.opacity += (Math.min(0.55, k * 0.4) - windMat.opacity) * Math.min(1, dt * 6);
    const head = courseHeading(me.s);
    for (const w of winds) {
      // うしろへ行ったら、前へ置きなおす(道のまん中は避けて、左右と上)
      if (w.s < me.s - 3) {
        w.s = me.s + 6 + Math.random() * 22;
        const a = Math.random() < 0.5 ? -1 : 1;
        w.x = me.x + a * (1.6 + Math.random() * 3);
        w.h = 0.4 + Math.random() * 2.6;
      }
      coursePoint(w.s, w.x, w.h, w.m.position);
      w.m.rotation.set(0, head.yaw, 0);
      w.m.scale.set(1, 1, 1.2 + Math.min(1, k) * 2.4);
      w.m.visible = windMat.opacity > 0.02;
    }
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { pointers: new Map(), keys: new Set() };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const pick = { rng: seedFrom(`${seed}:pick`) };
    const others = CHARACTERS.filter((c) => c.key !== picked).map((c) => c.key);
    const cpuChars = [];
    while (cpuChars.length < SLOTS - 1) cpuChars.push(others.splice(Math.floor(nextRandom(pick) * others.length), 1)[0]);
    const kinds = Object.keys(PERSONALITIES);
    const players = [
      { id: 'me', name: 'あなた', character: picked, cpu: null },
      ...cpuChars.map((key, i) => ({ id: `cpu${i}`, name: CHARACTERS.find((c) => c.key === key).name, character: key, cpu: kinds[Math.floor(nextRandom(pick) * kinds.length)] })),
    ];
    if (game) for (const r of game.runners) scene.remove(r.holder);
    leaves.length = 0;
    for (const w of winds) w.s = -1e9;
    tape.reset();
    acornMeshes.forEach((m) => { m.visible = true; });

    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      const body = new THREE.Group(); // かたむける(曲がる・伏せる)
      holder.add(body);
      const sledMat = toonMaterial(sledColors[slot % sledColors.length]);
      const sled = new THREE.Group();
      sled.add(new THREE.Mesh(sledGeo, sledMat), new THREE.Mesh(stemGeo, sledMat));
      sled.position.y = 0.05;
      body.add(sled);
      const seat = new THREE.Group(); // 体の傾き(曲がる・伏せる)はここ。そりは別に傾ける
      seat.position.z = -0.12; // 足を前へ投げ出すので、おしりを少しうしろへ
      body.add(seat);
      seat.add(model.root);
      const def = CHARACTERS.find((c) => c.key === p.character);
      scene.add(holder);
      const node = (n) => model.node(n);
      return {
        model, holder, body, sled, seat, size: def.size || 1, lean: 0, tuck: 0, air: 0, sit: 1, time: Math.random() * 10,
        arms: [node('arm_L'), node('arm_R')], legs: [node('leg_L'), node('leg_R')], head: node('head'),
      };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;

    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, countdown: null };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.sun.target.position.copy(coursePoint(LENGTH / 2, 0));
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    input.pointers.clear();
    buildBoard();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoS').classList.add('show');
    updateRunners(0);
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudS').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
    if (m !== 'playing') stopSlide();
  }
  function leave(to) {
    input.pointers.clear();
    onExit(to);
  }

  // ── 一時停止(ほかの競技と同じ画面。この会場にいるときだけ反応する) ────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) { input.pointers.clear(); if (slide) for (const l of [slide.leaves, slide.wind, slide.scrape]) l.g.gain.value = 0; }
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnS').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: 画面の左右 ─────────────────────────────────
  const canPress = (e) => mode === 'playing' && !paused && !e.target.closest('button, a');
  window.addEventListener('pointerdown', (e) => {
    if (!canPress(e)) return;
    unlockAudio();
    startSlide();
    input.pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? 'left' : 'right');
    $('howtoS').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    // 指をずらして反対がわへ行ったら、そちらに切りかえる
    if (input.pointers.has(e.pointerId)) input.pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? 'left' : 'right');
  });
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, (e) => input.pointers.delete(e.pointerId));
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'tuck', KeyS: 'tuck' };
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      startSlide();
      input.keys.add(KEYS[e.code]);
      $('howtoS').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(KEYS[e.code]));
  window.addEventListener('blur', () => { input.keys.clear(); input.pointers.clear(); });
  function myInput() {
    const v = new Set([...input.pointers.values(), ...input.keys]);
    if (v.has('tuck')) return { left: true, right: true };
    return { left: v.has('left'), right: v.has('right') };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashS');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  // コースの進み具合: たての帯に、みんなの色の点
  function buildBoard() {
    $('trackS').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'dot' + (slot === 0 ? ' me' : '');
      d.style.background = css(PLAYER_COLORS[slot].hex);
      return d;
    }));
  }
  const RANK = ['1', '2', '3', '4', '5'];
  function renderHud() {
    const s = game.state;
    const order = ranking(s);
    const rank = order.indexOf(0);
    const el = $('rankS');
    if (el.dataset.rank !== String(rank)) {
      el.dataset.rank = String(rank);
      el.innerHTML = `${RANK[rank]}<small>位</small>`;
      el.classList.remove('up');
      void el.offsetWidth;
      el.classList.add('up');
    }
    const t = Math.max(0, s.t - RULES.readyTime);
    const me = s.runners[0];
    $('timeS').textContent = (me.finish ?? t).toFixed(1);
    const dots = $('trackS').children;
    s.runners.forEach((r, i) => {
      dots[i].style.bottom = `calc(8px + (100% - 16px) * ${Math.min(1, Math.max(0, r.s / LENGTH)).toFixed(4)})`;
    });
    // 押しているほうのしるしを光らせる
    const inp = myInput();
    $('padL').classList.toggle('on', inp.left);
    $('padR').classList.toggle('on', inp.right);
    $('boostS').classList.toggle('on', me.boost > 0);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('スタート!');
          sfx.beep(true);
          break;
        case 'acorn':
          if (e.slot === 0) {
            acornMeshes[e.i].visible = false;
            sfx.koron();
            // 加速のシュイーンは、続けて拾ったときに鳴りすぎないように間をあける
            if (s.t - (game.zoomAt ?? -9) > 1.2) { sfx.zoom(); game.zoomAt = s.t; }
            spray(acornMeshes[e.i].position, 4, 1.5);
          }
          break;
        case 'jump': {
          const r = game.runners[e.slot];
          if (e.slot === 0) { sfx.jump(); splash('ジャンプ!', 'gold'); }
          spray(r.holder.position.clone().setY(r.holder.position.y + 0.3), 8, 3);
          break;
        }
        case 'land': {
          const r = game.runners[e.slot];
          if (e.slot === 0) sfx.land();
          spray(r.holder.position.clone().setY(r.holder.position.y + 0.1), 10, 2);
          break;
        }
        case 'bump':
          if (e.a === 0 || e.b === 0) sfx.bump();
          break;
        case 'goal': {
          const r = game.runners[e.slot];
          if (e.slot === 0) {
            const rank = ranking(s).indexOf(0);
            splash(`ゴール! ${rank + 1}位`, rank === 0 ? 'gold' : '');
            sfx.fanfare();
          }
          for (const a of audience) { a.model.play('cheer'); a.model.setFace('happy'); a.until = 2; }
          // 1位がテープを切る。紙吹雪は1位と自分のときに
          sfx.cheer(e.slot === 0 || !tape.broken ? 0.07 : 0.035);
          if (!tape.broken) { sfx.snap(); tape.cut(); spray(r.holder.position.clone().setY(r.holder.position.y + 0.9), 6, 2); }
          if (e.slot === 0 || ranking(s)[0] === e.slot && s.runners.filter((o) => o.finish !== null).length === 1) confetti(e.slot === 0 ? 90 : 60);
          owl.play('cheer');
          owlCheer = 2.5;
          break;
        }
        case 'finished':
          game.endTimer = 2.4;
          break;
      }
    }
  }

  function showResult() {
    const s = game.state;
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
      const time = r.finish !== null ? `${r.finish.toFixed(1)}びょう` : `のこり ${Math.max(0, LENGTH - r.s).toFixed(0)}m`;
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${time}<small>どんぐり ${r.acorns}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  // そりに座るかっこう。アニメーション(idle)の上から、腕と脚を上書きする(sit で混ぜる)。
  // 脚は前へ投げ出す。腕はふだん、そりのへりをつかむように前・横へ。
  // 曲がるとき: 外がわの腕を上げてバランス、内がわの腕は下へ / ふせるとき: 腕をうしろへ引いて小さくなる /
  // 空中: ばんざい / ふちをこすっているとき: 腕をばたばた
  function seatedPose(v, r) {
    const k = v.sit, t = v.time;
    const mix = (node, x, y, z) => {
      if (!node) return;
      node.rotation.x += (x - node.rotation.x) * k;
      node.rotation.y += (y - node.rotation.y) * k;
      node.rotation.z += (z - node.rotation.z) * k;
    };
    v.legs.forEach((leg, j) => {
      const side = j === 0 ? 1 : -1;
      const kick = v.air * Math.sin(t * 14 + j * Math.PI) * 0.25; // 空中では足をぱたぱた
      mix(leg, -1.4 + v.tuck * 0.15 + kick, 0, side * (0.14 + v.air * 0.2));
    });
    v.arms.forEach((arm, j) => {
      const side = j === 0 ? 1 : -1; // L はキャラの左(+x)
      // lean > 0 は右へ曲がる。右(キャラの右 = -x)が内がわ
      const outer = Math.max(0, side * v.lean); // この腕が外がわのとき 0〜1
      const inner = Math.max(0, -side * v.lean);
      let x = -0.75 - inner * 0.2 + v.tuck * 1.35;
      let z = side * (0.35 + outer * 1.0 - inner * 0.2 - v.tuck * 0.2);
      if (r.scrape) z += side * Math.sin(t * 22 + j) * 0.6;
      x += (0.25 - x) * v.air; // 腕を上げたときは + で前へ(- だとうしろへ倒れて頭にかくれる)
      z += (side * 2.2 + Math.sin(t * 12 + j * 2) * 0.3 - z) * v.air; // まっすぐ上だと大きな頭にかくれるので、ななめ上に V の字
      mix(arm, x, 0, z);
    });
    if (v.head) mix(v.head, v.tuck * 0.25 - v.air * 0.15, 0, -v.lean * 0.15);
  }

  const tmp = new THREE.Vector3();
  function updateRunners(dt) {
    const s = game.state;
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      const h = r.air > 0 ? Math.sin((1 - r.air / RULES.jumpTime) * Math.PI) * 1.6 : 0;
      coursePoint(r.s, r.x, h, v.holder.position);
      const head = courseHeading(r.s);
      v.holder.rotation.set(0, head.yaw, 0);
      // 坂にそって前に少し傾ける。曲がる向きに体をかたむける
      const steer = Math.max(-1, Math.min(1, r.vx / RULES.steer));
      v.lean += (steer - v.lean) * (1 - Math.exp(-dt * 8));
      v.tuck += ((r.tuck ? 1 : 0) - v.tuck) * (1 - Math.exp(-dt * 10));
      v.air += ((r.air > 0 ? 1 : 0) - v.air) * (1 - Math.exp(-dt * 12));
      // ゴールしたら、そりの上で立ちあがる
      v.sit += ((r.finish === null ? 1 : 0) - v.sit) * (1 - Math.exp(-dt * 4));
      v.time += dt;
      // そりごと坂にそわせる。空中では先を上げる。体は曲がる向きへ倒す
      v.body.rotation.set(head.slope - v.air * 0.3, 0, 0); // + で先が下がる
      v.sled.rotation.z = v.lean * 0.12;
      v.seat.rotation.set(v.tuck * 0.65 * v.sit, -v.lean * 0.3 * v.sit, v.lean * 0.55 * v.sit);
      // 道のでこぼこで、こきざみにゆれる(速いほど)
      const rattle = r.air > 0 || r.finish !== null ? 0 : Math.min(1, r.v / 12) * 0.012;
      v.model.root.position.y = 0.12 - 0.17 * v.sit * v.size + Math.sin(v.time * 37) * rattle;
      v.model.root.position.z = 0;
      let clip = 'idle', face = 'normal';
      if (r.finish !== null) { clip = s.winner === i || ranking(s)[0] === i ? 'cheer' : 'wave'; face = 'happy'; }
      else if (r.air > 0) face = 'happy';
      else if (r.boost > 0) face = 'happy';
      else if (r.scrape) face = 'surprised';
      v.model.play(clip);
      v.model.setFace(face);
      v.model.update(dt);
      if (v.sit > 0.01) seatedPose(v, r);
      // ふちにこすっていると、落ち葉が舞う
      if (r.scrape && Math.random() < dt * 20) spray(tmp.copy(v.holder.position).setY(v.holder.position.y + 0.2), 2, 1.5);
      trail(v, r, i === 0, dt);
      if (v.marker) v.marker.position.set(0, 2.1 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
    // どんぐりはくるくる回る
    for (const m of acornMeshes) m.rotation.y += dt * 2;
    // すべる音: 自分の速さ・曲がり・こすれで
    updateSlide(dt, s.runners[0], game.runners[0].lean);
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const me = game ? game.state.runners[0] : { s: 0, x: 0, air: 0 };
    let pos, look;
    if (game && (game.state.phase === 'finished' || mode === 'result')) {
      // 決着: ゴールの門の前から、勝った子を映す
      const w = game.state.runners[game.state.winner];
      pos = coursePoint(Math.min(w.s, LENGTH + 20) + 6, w.x * 0.5, 2.4);
      look = coursePoint(Math.min(w.s, LENGTH + 20), w.x, 1);
    } else {
      // うしろから追いかける。縦長は高めに、少し遠く
      const back = portrait ? 6.5 : 5.2, up = portrait ? 3.6 : 2.6;
      pos = coursePoint(me.s - back, me.x * 0.6, up);
      look = coursePoint(me.s + (portrait ? 7 : 8), me.x * 0.4, 0.6);
    }
    // 速いほど、視野を少し広げる(スピード感)
    const fast = game && mode === 'playing' && me.finish === null ? Math.max(0, Math.min(1, (me.v - 9) / 6)) + (me.boost > 0 ? 0.4 : 0) : 0;
    camera.userData.fast = (camera.userData.fast || 0) + (fast - (camera.userData.fast || 0)) * Math.min(1, dt * 3);
    camera.fov = (portrait ? 66 : 52) + camera.userData.fast * 7;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      // 空から: 山の上のほうから、スタートの門のうしろへ降りてくる
      const e = 1 - (1 - intro) ** 3;
      const sky = coursePoint(-30, 14, 26);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(coursePoint(40, 0, 0), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
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

  // ── 1フレーム(タイトルの輪から呼ばれる) ─────────────────
  function frame(rawDt, draw = true) {
    const dt = Math.min(rawDt, 0.1);
    if (draw && mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) intro = Math.min(1, intro + dt / INTRO_TIME);
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      // 3・2・1
      if (s.phase === 'ready') {
        const n = Math.ceil(RULES.readyTime - s.t);
        if (n !== game.countdown && n > 0) {
          game.countdown = n;
          splash(String(n));
          sfx.beep(false);
        }
      }
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : myInput()));
        onEvents(step(s, inputs));
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
      updateFx(dt);
      updateWind(dt);
      tape.update(dt);
    }
    if (!paused) {
      for (const a of audience) {
        if (a.until > 0) {
          a.until -= dt;
          if (a.until <= 0) { a.model.play('idle'); a.model.setFace('normal'); }
        }
        a.model.update(dt);
      }
      if (owlCheer > 0 && (owlCheer -= dt) <= 0) owl.play('idle');
      owl.update(dt);
    }
    atmosphere.update(dt);
    updateCamera(dt);
    if (draw) renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dsled = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    camera, renderer, scene,
    debugPoint: (s, x, h) => coursePoint(s, x, h),
    freeCamera: (on) => { freeCamera = on; },
    setTime: (key) => atmosphere.apply(key),
    // 描かずに、画面の動き(落ち葉・カメラ)ごと sec 秒すすめる。自分は押しているキーのまま
    tick: (sec) => { for (let i = 0; i < sec * 60; i++) frame(1 / 60, false); },
    // 描かずに、みんな CPU で sec 秒すすめる(途中の場面を撮る用)
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
    async enter(character, { fromSky = true } = {}) {
      picked = character;
      unlockAudio();
      applyQuality();
      await startGame({ fromSky });
      renderer.compile(scene, camera);
    },
    exit() {
      setMode('idle');
      input.pointers.clear();
      input.keys.clear();
    },
    get intro() { return intro; },
  };
}
