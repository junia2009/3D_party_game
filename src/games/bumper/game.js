// 遊園地の バンパーカー の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも 指を おいて ずらすと、その 向きへ ハンドルを きって 走る(どこでもスティック)。
// 右下の「ダッシュ」で ぐんと 加速。パソコンは 矢印 / WASD で 走って、スペースで ダッシュ。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, onDisk, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { FLOOR_Y, SEATS, buildStage } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

export async function createBumper({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
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
  function noise({ len, gain, freq, type = 'bandpass', q = 1, at = 0, attack = 0.01 }) {
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
    // ボヨン: ゴムの バンパーで ぶつかる(強いほど 低く大きく)
    boing(force, vol = 1) {
      const k = Math.min(1, force / 8);
      voice({ type: 'triangle', pts: [[0, 320 - k * 120], [0.06, 520 - k * 160], [0.22, 140]], len: 0.25, gain: (0.06 + k * 0.1) * vol });
      noise({ len: 0.08, gain: (0.03 + k * 0.08) * vol, freq: [900, 300], type: 'lowpass' });
    },
    // ブルン: ためる
    rev() { voice({ type: 'sawtooth', pts: [[0, 90], [0.2, 160]], len: 0.22, gain: 0.025 }); },
    // ビューン: ダッシュ
    dash(vol = 1) { noise({ len: 0.35, gain: 0.1 * vol, freq: [600, 2800], q: 0.8 }); voice({ type: 'square', pts: [[0, 200], [0.3, 420]], len: 0.32, gain: 0.02 * vol }); },
    // ガシャーン ひゅ〜: 落ちる
    out(vol = 1) { noise({ len: 0.4, gain: 0.15 * vol, freq: [2000, 400], type: 'lowpass', attack: 0.004 }); voice({ pts: [[0, 900], [0.6, 250]], len: 0.6, gain: 0.05 * vol, at: 0.1 }); },
    // ブーッ: リンクが ちぢむ 合図
    buzzer() { voice({ type: 'square', pts: [[0, 220]], len: 0.5, gain: 0.04 }); voice({ type: 'square', pts: [[0, 220]], len: 0.5, gain: 0.04, at: 0.7 }); },
    // くるりん: 回る 向きが かわる
    flip() { [660, 880, 660].forEach((f, i) => voice({ pts: [[0, f]], len: 0.12, gain: 0.04, at: i * 0.08 })); },
    whistle() { voice({ pts: [[0, 1400], [0.5, 500]], len: 0.5, gain: 0.03 }); },
    // ガコン: 床の 輪が 切りはなされる
    clunk() { noise({ len: 0.3, gain: 0.12, freq: [600, 120], type: 'lowpass', attack: 0.004 }); voice({ type: 'square', pts: [[0, 160], [0.2, 90]], len: 0.22, gain: 0.03 }); },
    // ピッ ピッ ピッ ポーン: スタートの 合図
    beep(last) { voice({ type: 'square', pts: [[0, last ? 1320 : 660]], len: last ? 0.5 : 0.16, gain: 0.05 }); },
    // パフパフ: 車の クラクション
    honk(vol = 1) { voice({ type: 'square', pts: [[0, 520], [0.12, 500]], len: 0.14, gain: 0.03 * vol }); voice({ type: 'square', pts: [[0, 660]], len: 0.14, gain: 0.025 * vol, at: 0.18 }); },
    // ドロドロ: いっきうち
    drum() { for (let i = 0; i < 18; i++) noise({ len: 0.06, gain: 0.05 + i * 0.004, freq: [220, 120], type: 'lowpass', at: i * 0.07 }); },
    // ヒュー… ドーン: 花火
    boom(vol = 1) { noise({ len: 0.7, gain: 0.2 * vol, freq: [500, 90], type: 'lowpass', attack: 0.005 }); noise({ len: 0.9, gain: 0.04 * vol, freq: [4000, 2500], type: 'highpass', at: 0.1, attack: 0.05 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };
  function volFor(x, z) {
    const me = game.state.runners[0];
    return Math.max(0.2, 1 - Math.hypot(x - me.x, z - me.z) / 10);
  }

  // ── 読みこみ: 観客 ───────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), ...new Set(SEATS.map((s) => s.kind))]);
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.set(seat.x, seat.y, seat.z);
    m.root.rotation.y = Math.atan2(-seat.x, -seat.z);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    m.setFace('happy');
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));

  // ── バンパーカー ────────────────────────────────────
  // ボディ(子の 色)・ゴムの バンパー・ハンドル・うしろの ポール(先が 光る)
  const bodyGeo = (() => {
    const sh = new THREE.Shape();
    const w = 0.5, l = 0.62, r = 0.22;
    sh.moveTo(-w + r, -l); sh.lineTo(w - r, -l); sh.quadraticCurveTo(w, -l, w, -l + r);
    sh.lineTo(w, l - r); sh.quadraticCurveTo(w, l, w - r, l); sh.lineTo(-w + r, l);
    sh.quadraticCurveTo(-w, l, -w, l - r); sh.lineTo(-w, -l + r); sh.quadraticCurveTo(-w, -l, -w + r, -l);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.52, 0);
    return g;
  })();
  const bumperGeo = new THREE.TorusGeometry(0.62, 0.11, 8, 28).rotateX(Math.PI / 2);
  bumperGeo.scale(1, 1, 1.12);
  const wheelGeo = new THREE.TorusGeometry(0.13, 0.025, 5, 14);
  function makeCar(hex) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGradient }));
    body.castShadow = true;
    const bumper = new THREE.Mesh(bumperGeo, toonMaterial(0x2e2a3a));
    bumper.position.y = 0.2;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.14), toonMaterial(0x3a2a4a));
    seat.position.set(0, 0.72, -0.42);
    const wheel = new THREE.Mesh(wheelGeo, toonMaterial(0x2e2a3a));
    wheel.position.set(0, 0.78, 0.36);
    wheel.rotation.x = -0.9;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5), toonMaterial(0xd8d8e0));
    pole.position.set(0, 1.35, -0.55);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
    tip.position.set(0, 2.22, -0.55);
    // 前の ライト
    for (const sx of [-0.25, 0.25]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      l.position.set(sx, 0.38, 0.69);
      g.add(l);
    }
    g.add(body, bumper, seat, wheel, pole, tip);
    return { g, body, tip, wheel };
  }

  // ── けむり・星・紙ふぶき ───────────────────────────
  const fx = [];
  const puffGeo = new THREE.SphereGeometry(0.2, 6, 4);
  function puff(x, y, z, n = 4, color = 0xe8e0f0, size = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.4);
      m.scale.setScalar(size);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.6 + Math.random() * 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2), kind: 'puff', size });
    }
  }
  const starGeo = (() => {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.08 : 0.2;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ShapeGeometry(sh);
  })();
  function stars(x, z, n = 8, power = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: [0xffd23c, 0xffffff, 0xff8fd0][i % 3], transparent: true, side: THREE.DoubleSide }));
      m.position.set(x, FLOOR_Y + 0.6, z);
      scene.add(m);
      const a = (i / n) * Math.PI * 2;
      fx.push({ obj: m, t: 0, life: 0.55, vel: new THREE.Vector3(Math.cos(a) * 3.5 * power, 2 + Math.random() * 2, Math.sin(a) * 3.5 * power), kind: 'spark', spin: new THREE.Vector3(0, 0, 8) });
    }
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 4, 4 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
    }
  }
  // タイヤの あと: 横すべりや ダッシュの とき、うしろの タイヤから 黒い 点(だんだん 小さく なって 消える)
  const SKID_N = 500;
  const skid = new THREE.InstancedMesh(new THREE.CircleGeometry(0.09, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a2a4a, transparent: true, opacity: 0.55, depthWrite: false }), SKID_N);
  skid.frustumCulled = false;
  scene.add(skid);
  const skids = Array.from({ length: SKID_N }, () => ({ x: 0, z: 0, life: 0 }));
  let skidAt = 0;
  const dummy = new THREE.Object3D();
  function addSkid(x, z) {
    const k = skids[skidAt];
    skidAt = (skidAt + 1) % SKID_N;
    k.x = x; k.z = z; k.life = 2.5;
  }
  function updateSkids(dt) {
    skids.forEach((k, i) => {
      k.life = Math.max(0, k.life - dt);
      const sc = k.life > 0 ? Math.min(1, k.life / 1.2) : 0.0001;
      dummy.position.set(k.x, FLOOR_Y + 0.012, k.z);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      skid.setMatrixAt(i, dummy.matrix);
    });
    skid.instanceMatrix.needsUpdate = true;
  }
  // ダッシュの 風の すじ
  const streakGeo = new THREE.PlaneGeometry(0.06, 1.1).rotateX(-Math.PI / 2);
  function streak(x, z, h) {
    const m = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    const side = (Math.random() - 0.5) * 1.1;
    m.position.set(x - Math.sin(h) * 0.9 + Math.cos(h) * side, FLOOR_Y + 0.3 + Math.random() * 0.5, z - Math.cos(h) * 0.9 - Math.sin(h) * side);
    m.rotation.y = h;
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.3, vel: new THREE.Vector3(-Math.sin(h) * 3, 0, -Math.cos(h) * 3), kind: 'fade' });
  }
  // ぶつかった ところに 広がる 輪
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
  function shock(x, z, color = 0xffffff, size = 1) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, FLOOR_Y + 0.06, z);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.45, vel: new THREE.Vector3(), kind: 'ring', size });
  }
  // ポールの 先の ぱちぱち(バンパーカーの 天井の 電気)
  function zap(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xa8e4ff : 0xfff2a0, transparent: true }));
      m.scale.setScalar(0.35);
      m.position.set(x, y, z);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), kind: 'spark', spin: new THREE.Vector3() });
    }
  }
  // 頭の上を まわる 星(回る 円盤・ふらふら・落ちた あと)
  function dizzyStars(u) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xffd23c, side: THREE.DoubleSide }));
      m.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.45, 0, Math.sin((i / 3) * Math.PI * 2) * 0.45);
      g.add(m);
    }
    g.position.y = 1.75;
    g.visible = false;
    u.holder.add(g);
    return g;
  }
  // 花火: 下から 打ちあがって、上で 色とりどりに ひらく
  const fwGeo = new THREE.SphereGeometry(0.21, 6, 4);
  function firework(x, z, delay = 0) {
    const color = [0xff4f6a, 0xffd23c, 0x5cc0ff, 0x7ad35a, 0xb48cff, 0xff8fd0][Math.floor(Math.random() * 6)];
    const m = new THREE.Mesh(fwGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.set(x, 0.5, z);
    m.visible = false;
    scene.add(m);
    fx.push({ obj: m, t: -delay, life: 99, vel: new THREE.Vector3(0, 13, 0), kind: 'rocket', top: 4 + Math.random() * 1.6, color });
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.kind === 'rocket') {
        if (f.t < 0) continue;
        f.obj.visible = true;
        f.obj.position.addScaledVector(f.vel, dt);
        if (f.obj.position.y >= f.top) {
          for (let j = 0; j < 40; j++) {
            const p = new THREE.Mesh(fwGeo, new THREE.MeshBasicMaterial({ color: f.color, transparent: true }));
            p.position.copy(f.obj.position);
            scene.add(p);
            fx.push({ obj: p, t: 0, life: 1.4, vel: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random()), kind: 'burst' });
          }
          sfx.boom(0.6);
          scene.remove(f.obj);
          f.obj.material.dispose();
          fx.splice(i, 1);
        }
        continue;
      }
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'puff') {
        f.vel.multiplyScalar(Math.exp(-3 * dt));
        f.obj.scale.setScalar(f.size * (1 + k * 1.6));
        f.obj.material.opacity = 0.85 * (1 - k);
      } else if (f.kind === 'spark') {
        f.vel.y -= 10 * dt;
        f.obj.rotation.z += f.spin.z * dt;
        f.obj.lookAt(camera.position);
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'burst') {
        f.vel.multiplyScalar(Math.exp(-dt * 1.8));
        f.vel.y -= 2.5 * dt;
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'fade') {
        f.obj.material.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'ring') {
        f.obj.scale.setScalar(f.size * (0.4 + k * 2.2));
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'confetti') {
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
        if (f.obj.position.y < 0.02) { f.obj.position.y = 0.02; f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); }
      }
      if (k >= 1) {
        scene.remove(f.obj);
        f.obj.material.dispose();
        fx.splice(i, 1);
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
  const input = { touch: null, stick: null, keys: new Set(), dash: false, target: null };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      const car = makeCar(PLAYER_COLORS[slot].hex);
      const def = CHARACTERS.find((c) => c.key === p.character);
      const size = def.size || 1;
      model.root.scale.setScalar(0.78 / size ** 0.3);
      model.root.position.set(0, 0.32, -0.08);
      car.g.add(model.root);
      holder.add(car.g);
      scene.add(holder);
      const u = { model, holder, car, size, out: null, roll: 0, pitch: 0, squash: 0, skidT: 0, fxT: 0 };
      u.dizzy = dizzyStars(u);
      return u;
    }));
    for (const k of skids) k.life = 0;
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, shake: 0, duel: false, slow: 0, count: 4, bulbT: 0, donut: 0 };
    $('hudQ').classList.remove('shrink');
    atmosphere.apply(params.get('time') || 'dusk');
    atmosphere.setupShadows([...runners.map((r) => r.holder)], [stage.group, ...stage.rings.map((r) => r.mesh), stage.disk]);
    Object.assign(input, { touch: null, stick: null, dash: false, target: null });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoQ').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudQ').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) { onExit(to); }

  // ── 一時停止 ──────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) input.touch = null;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnQ').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック + ダッシュボタン ──────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickQ'), knobEl = stickEl.firstElementChild;
  const dashEl = $('dashQ');
  const playing = () => mode === 'playing' && !paused;
  dashEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.dash = true;
    dashEl.classList.add('down');
  });
  const dashUp = () => { input.dash = false; dashEl.classList.remove('down'); };
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) dashEl.addEventListener(ev, dashUp);
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoQ').classList.remove('show');
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
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); input.dash = true; return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoQ').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (e.code === 'Space' || e.code === 'Enter') input.dash = false;
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; input.dash = false; stickEl.hidden = true; });

  function myInput() {
    if (input.target) return { ...input.target };
    let sx = 0, sy = 0;
    if (input.keys.size) {
      for (const k of input.keys) { sx += KEYS[k][0]; sy += KEYS[k][1]; }
      const d = Math.hypot(sx, sy);
      if (d) { sx /= d; sy /= d; }
    } else if (input.stick) {
      sx = input.stick.dx;
      sy = input.stick.dy;
    }
    // カメラは 手前の 上から 奥(-z)を 見ているので、画面の 右 = +x、画面の 上 = 奥(-z)
    return { x: sx, z: sy, dash: input.dash };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashQ');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsQ').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b></b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsQ').children].forEach((c, i) => c.classList.toggle('out', !s.runners[i].alive));
    $('timeQ').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    const me = s.runners[0];
    dashEl.hidden = s.phase === 'finished' || !me.alive;
    dashEl.style.setProperty('--k', String(1 - me.cool / RULES.cool));
    dashEl.classList.toggle('wait', me.cool > 0);
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsQ').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('スタート!');
          sfx.beep(true);
          setTimeout(() => $('howtoQ').classList.remove('show'), 6000);
          break;
        case 'windup': {
          const r = s.runners[e.slot];
          if (e.slot === 0) sfx.rev();
          puff(r.x - Math.sin(r.h) * 0.7, FLOOR_Y + 0.2, r.z - Math.cos(r.h) * 0.7, 2, 0x9a90b0, 0.8);
          break;
        }
        case 'dash': {
          const r = s.runners[e.slot];
          sfx.dash(volFor(r.x, r.z));
          puff(r.x - Math.sin(r.h) * 0.8, FLOOR_Y + 0.2, r.z - Math.cos(r.h) * 0.8, 5, 0xe8e0f0, 1.2);
          zap(r.x - Math.sin(r.h) * 0.55, FLOOR_Y + 2.25, r.z - Math.cos(r.h) * 0.55, 6);
          break;
        }
        case 'bump': {
          const strong = e.by !== null;
          sfx.boing(e.force, volFor(e.x, e.z));
          stars(e.x, e.z, strong ? 12 : 6, strong ? 1.3 : 0.7);
          if (strong) pop(e.force > 6 ? 'ドカーン!' : 'ドン!', e.x, FLOOR_Y + 1.4, e.z, 'gold');
          else if (e.force > 2.5) pop('ボヨン', e.x, FLOOR_Y + 1.2, e.z);
          if (e.a === 0 || e.b === 0) game.shake = Math.max(game.shake, strong ? 0.35 : 0.15);
          for (const i of [e.a, e.b]) { game.runners[i].jolt = 0.3; game.runners[i].squash = Math.min(1, 0.4 + e.force / 8); }
          if (e.force > 1.5) shock(e.x, e.z, strong ? 0xffd23c : 0xffffff, strong ? 1.3 : 0.8);
          if (strong) for (const i of [e.a, e.b]) { const r = s.runners[i]; zap(r.x - Math.sin(r.h) * 0.55, FLOOR_Y + 2.25, r.z - Math.cos(r.h) * 0.55, 4); }
          break;
        }
        case 'shrinkWarn':
          splash('リンクが ちぢむよ!', 'gold small');
          sfx.buzzer();
          break;
        case 'shrink':
          $('hudQ').classList.add('shrink');
          setTimeout(() => $('hudQ').classList.remove('shrink'), 2500);
          break;
        case 'flip':
          pop('ぎゃく回り!', 0, FLOOR_Y + 1.6, 0, 'gold', 1200);
          sfx.flip();
          shock(0, 0, 0xffd23c, 2.2);
          stars(0, 0, 10, 0.8);
          break;
        case 'fall': {
          const u = game.runners[e.slot];
          const r = s.runners[e.slot];
          const d = Math.hypot(r.x, r.z) || 1;
          u.out = { t: 0, x: r.x, z: r.z, y: FLOOR_Y, vx: (r.x / d) * 3 + r.vx * 0.5, vz: (r.z / d) * 3 + r.vz * 0.5, vy: 4.5 };
          sfx.out(volFor(r.x, r.z));
          pop(e.by !== null ? 'おしだし!' : 'あ〜っ!', r.x, FLOOR_Y + 1.5, r.z, e.slot === 0 ? 'red' : 'out');
          if (e.slot === 0) splash('おちちゃった…', 'red small');
          game.slow = 0.6;
          for (const a of audience) a.until = time + 1.6 + Math.random();
          if (s.phase === 'play' && s.runners.filter((x) => x.alive).length === 2 && !game.duel) {
            game.duel = true;
            setTimeout(() => { splash('いっきうち!', 'gold small'); sfx.drum(); }, 900);
          }
          break;
        }
        case 'finished': {
          game.endTimer = 4.5;
          const win = e.winner === 0;
          splash(e.timeUp ? 'じかん ぎれ!' : win ? 'さいごの 1台!' : 'しゅうりょう!', win ? 'gold' : '');
          if (win) sfx.fanfare();
          const r = s.runners[e.winner];
          confetti(r.x, r.z);
          // リンクの まわりから 花火、観客は 大よろこび、勝った 車は クラクション
          for (let i = 0; i < 9; i++) firework(r.x + (Math.random() - 0.5) * 10, r.z - 5.5 - Math.random() * 3, 0.3 + i * 0.35); // 寄った カメラの 奥に 見える ところ
          for (const a of audience) a.until = time + 6;
          sfx.honk();
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
    $('resultTitle').textContent = order[0] === 0 ? 'あなたの 勝ち!' : `${order.indexOf(0) + 1}位`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.alive ? 'のこった!' : ''}<small>おしだし ${r.pushes}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    for (const [slot, u] of game.runners.entries()) {
      const r = s.runners[slot];
      let clip = 'idle', face = 'normal';
      if (u.out) {
        // ふちから とびだして、広場へ ころん
        const o = u.out;
        o.t += dt;
        o.vy -= 14 * dt;
        o.x += o.vx * dt;
        o.z += o.vz * dt;
        o.y += o.vy * dt;
        if (o.y < 0 && Math.hypot(o.x, o.z) > RULES.r0 + 0.5) {
          o.y = 0;
          if (!o.landed) { o.landed = true; puff(o.x, 0.1, o.z, 6, 0xd8c8a8, 1.2); o.vy = 2; }
          else o.vy = 0;
          o.vx *= 0.5; o.vz *= 0.5;
        }
        u.holder.position.set(o.x, o.y, o.z);
        u.holder.rotation.y += dt * (o.landed ? Math.max(0, 6 - o.t * 3) : 9);
        u.holder.rotation.x = o.landed ? 0 : Math.sin(o.t * 12) * 0.4;
        u.holder.rotation.z = o.landed ? 0 : Math.cos(o.t * 10) * 0.3;
        clip = 'dizzy';
        face = o.landed ? 'frustrated' : 'surprised';
        u.dizzy.visible = o.landed;
      } else {
        // 走る 向き・ハンドルで かたむく・ぶつかると ぶるっ
        const speed = Math.hypot(r.vx, r.vz);
        u.roll += (-r.steer * Math.min(1, speed / 3) * 0.12 - u.roll) * Math.min(1, dt * 6);
        u.pitch += ((r.wind > 0 ? -0.12 : r.dash > 0 ? 0.1 : 0) - u.pitch) * Math.min(1, dt * 10);
        u.jolt = Math.max(0, (u.jolt || 0) - dt);
        const j = u.jolt > 0 ? Math.sin(time * 60) * u.jolt * 0.25 : 0;
        const buzz = r.wind > 0 ? Math.sin(time * 70) * 0.03 : 0;
        u.holder.position.set(r.x + buzz, FLOOR_Y + Math.abs(j) * 0.4, r.z);
        u.holder.rotation.set(u.pitch, r.h, u.roll + j);
        // 勝った 車は その場で くるくる(ドーナツターン)
        if (s.phase === 'finished' && slot === s.winner) {
          game.donut += dt * 5.5;
          u.holder.rotation.y = r.h + game.donut;
          u.holder.rotation.z = 0.08;
          if (Math.random() < 0.5) {
            const a = r.h + game.donut;
            addSkid(r.x - Math.sin(a) * 0.5, r.z - Math.cos(a) * 0.5);
          }
        }
        // ぶつかると ボディが むにゅっ
        u.squash = Math.max(0, u.squash - dt * 4);
        const q = Math.sin(u.squash * Math.PI) * 0.18 * u.squash;
        u.car.g.scale.set(1 + q, 1 - q, 1 + q);
        // 横すべり・ダッシュ: タイヤの あと / ダッシュの すじ / ためて いる あいだの けむり
        const lat = Math.abs(r.vx * Math.cos(r.h) - r.vz * Math.sin(r.h));
        u.skidT -= dt;
        if (u.skidT <= 0 && (lat > 1.1 || r.dash > 0 || r.wind > 0) && s.phase === 'play') {
          u.skidT = 0.035;
          const bx = r.x - Math.sin(r.h) * 0.45, bz = r.z - Math.cos(r.h) * 0.45;
          addSkid(bx + Math.cos(r.h) * 0.38, bz - Math.sin(r.h) * 0.38);
          addSkid(bx - Math.cos(r.h) * 0.38, bz + Math.sin(r.h) * 0.38);
        }
        u.fxT -= dt;
        if (u.fxT <= 0 && r.dash > 0) { u.fxT = 0.03; streak(r.x, r.z, r.h); }
        else if (u.fxT <= 0 && r.wind > 0) { u.fxT = 0.06; puff(r.x - Math.sin(r.h) * 0.75, FLOOR_Y + 0.25, r.z - Math.cos(r.h) * 0.75, 1, 0x9a90b0, 0.7); }
        // 回る 円盤・ふらふら: 頭の上に 星
        u.dizzy.visible = (onDisk(r) || r.stun > 0) && s.phase !== 'finished';
        u.car.wheel.rotation.z = -r.steer * 0.8;
        u.car.tip.material.color.setHex(r.dash > 0 || r.wind > 0 ? 0xff6fd0 : Math.floor(time * 4 + slot) % 2 ? 0xfff2a0 : 0xffffff);
        if (onDisk(r)) face = 'surprised';
        if (r.stun > 0) { clip = 'dizzy'; face = 'frustrated'; }
        else if (r.dash > 0) face = 'happy';
        if (s.phase === 'finished') { clip = 'cheer'; face = 'happy'; }
      }
      u.model.play(clip);
      u.model.setFace(face);
      u.model.update(dt);
      if (u.dizzy.visible) u.dizzy.rotation.y += dt * 5;
      if (u.marker) {
        u.marker.visible = !u.out;
        u.marker.position.set(0, 2.6 + 0.1 * Math.sin(performance.now() / 180), 0);
      }
    }
    // 観客: だれかが 落ちると よろこぶ
    for (const a of audience) {
      a.model.play(a.until > time ? 'cheer' : 'idle');
      a.model.update(dt);
    }
    // スポットライト: いっきうちは のこった 2台を、決着は 勝った 車を てらす
    const alive = s.runners.map((r, i) => i).filter((i) => s.runners[i].alive);
    const focus = s.phase === 'finished' && s.winner !== null ? [s.winner, s.winner, s.winner] : game.duel ? [alive[0], alive[1], null] : [null, null, null];
    stage.spots.forEach((m, i) => {
      const f = focus[i];
      m.userData.focus = f !== null && f !== undefined;
      if (m.userData.focus) {
        const r = s.runners[f];
        m.position.x += (r.x + (i === 2 ? 0.3 : 0) - m.position.x) * Math.min(1, dt * 5);
        m.position.z += (r.z - m.position.z) * Math.min(1, dt * 5);
      }
    });
    // 電球: いっきうち・決着で 速く 流れる
    game.bulbT += dt * (s.phase === 'finished' ? 3 : game.duel ? 1.8 : 1);
    // リンクが ちぢむ: 暗くなる 輪の ふちに 火花、沈む 輪から けむり
    const ch = stage.update(game.bulbT, s, dt);
    for (const r of ch.dimmed) {
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; zap(Math.cos(a) * r.outer, FLOOR_Y + 0.1, Math.sin(a) * r.outer, 2); }
      sfx.clunk();
    }
    for (const r of ch.gone) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, rr = (r.inner + r.outer) / 2; puff(Math.cos(a) * rr, FLOOR_Y - 0.2, Math.sin(a) * rr, 1, 0x9a90b0, 1.2); }
    updateSkids(dt);
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const pos = portrait ? new THREE.Vector3(0, 25.5, 16) : new THREE.Vector3(0, 13.5, 13.5);
    const look = new THREE.Vector3(0, portrait ? -0.3 : -0.2, portrait ? 1.3 : 0.6);
    const s = game?.state;
    if (s && (game.duel || s.phase === 'finished')) {
      const alive = s.runners.filter((r) => r.alive);
      const target = s.phase === 'finished' && s.winner !== null ? [s.runners[s.winner]] : alive;
      if (target.length) {
        const mx = target.reduce((a, r) => a + r.x, 0) / target.length, mz = target.reduce((a, r) => a + r.z, 0) / target.length;
        const near = s.phase === 'finished' ? 0.45 : 0.75;
        look.set(mx * 0.6, 0.4, mz * 0.6);
        pos.set(look.x, look.y + (pos.y - look.y) * near, look.z + (pos.z - look.z) * near);
        // 決着: 低めの 正面から(奥の 空に 花火が 見える)
        if (s.phase === 'finished') { look.set(mx, 1.6, mz - 1); pos.set(mx, 5.2, mz + 8.5); }
      }
    }
    camera.fov = portrait ? 52 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(8, 16, -24);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 4, -10), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.6;
    }
    camera.lookAt(camera.userData.look);
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
    let dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
    }
    // スタートの 合図: 3・2・1(クラクションも)
    if (game && mode === 'playing' && intro >= 1 && game.state.phase === 'ready') {
      const n = Math.ceil(RULES.readyTime - game.state.t);
      if (n < game.count && n >= 1) {
        game.count = n;
        splash(String(n), 'small');
        sfx.beep(false);
        if (n === 2) sfx.honk(0.6);
      }
    }
    // 落ちた 瞬間は 少し スロー
    if (game?.slow > 0) { game.slow = Math.max(0, game.slow - dt); dt *= 0.4; }
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
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
      updateWorld(dt);
      updateFx(dt);
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dbumper = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
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
      input.dash = false;
      $('stickQ').hidden = true;
    },
    get intro() { return intro; },
  };
}
