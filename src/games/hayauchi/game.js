// どんぐり早うち の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
// タイトルと同じページで動く(ほかの競技と同じ作り)。
//
// 動かし方: 画面のどこでもタップ(パソコンはスペース / エンター)で うつ。
// ホーホー先生が「どんぐりの旗(黄色)」をあげたら うつ。赤い旗(うつな!)や、にせの合図には つられない。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, aliveSlots, createGame, ranking, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { BARREL_TOP, CAN_Z, OWL_ROCK, RAIL_Y, SEATS, buildStage, laneX } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';
import { acornGeometry } from '../daruma/trees.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const sec2 = (v) => v.toFixed(2);

export async function createHayauchi({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene, SLOTS);

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
  function noise({ len, gain, freq, type = 'bandpass', q = 1, at = 0, attack = 0.005 }) {
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
    // パーン!: 合図
    bang() {
      noise({ len: 0.5, gain: 0.35, freq: [2500, 300], type: 'lowpass', q: 0.7 });
      voice({ type: 'square', pts: [[0, 180], [0.15, 60]], len: 0.2, gain: 0.1 });
    },
    // ポン: どんぐり鉄砲
    pop(vol = 1) {
      voice({ pts: [[0, 900], [0.05, 300]], len: 0.08, gain: 0.16 * vol });
      noise({ len: 0.05, gain: 0.12 * vol, freq: [3000, 1500] });
    },
    // カーン: かんに当たる
    kan(vol = 1) {
      [1760, 2637, 3520].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.5 - i * 0.1, gain: 0.07 * vol, vib: 15, vibRate: 30 }));
    },
    // ピピーッ: おてつき
    whistle() {
      voice({ type: 'square', pts: [[0, 2200]], len: 0.12, gain: 0.05 });
      voice({ type: 'square', pts: [[0, 2200]], len: 0.4, gain: 0.05, at: 0.16, vib: 60, vibRate: 25 });
    },
    // ブブー: 逆の旗
    buzz() { voice({ type: 'sawtooth', pts: [[0, 140]], len: 0.35, gain: 0.08 }); },
    // ホッ…: にせの合図(先生の言いかけ)
    hoot() { voice({ pts: [[0, 420], [0.2, 380]], len: 0.25, gain: 0.08, vib: 6, vibRate: 6 }); },
    // カァ
    crow() { voice({ type: 'sawtooth', pts: [[0, 700], [0.2, 500]], len: 0.28, gain: 0.06, vib: 40, vibRate: 40 }); },
    // ヒュー…(風と草のまり)
    wind(gain = 0.08) { noise({ len: 1.6, gain, freq: [500, 900], q: 3, attack: 0.5 }); },
    // ドクン: 待っているあいだの胸の音
    heart() {
      voice({ pts: [[0, 70], [0.1, 50]], len: 0.14, gain: 0.12 });
      voice({ pts: [[0, 64], [0.1, 46]], len: 0.14, gain: 0.09, at: 0.18 });
    },
    // ガーン: 脱落
    gaan() { voice({ type: 'triangle', pts: [[0, 330], [0.6, 160]], len: 0.7, gain: 0.08 }); },
  };

  // ── 読みこみ: 先生と観客 ───────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', ...new Set(SEATS.map((s) => s.kind))]);
  const owl = await createModel('hoho');
  owl.root.position.set(OWL_ROCK.x, OWL_ROCK.top, OWL_ROCK.z);
  owl.play('idle');
  owl.setFace('normal');
  scene.add(owl.root);
  atmosphere.attachOwlEyes(owl.node('head'));
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.set(seat.x, BARREL_TOP, seat.z);
    m.root.rotation.y = Math.atan2(-seat.x, -seat.z - 3);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    m.setFace('normal');
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));
  atmosphere.setupShadows([stage.group, owl.root], [stage.group]);
  atmosphere.setupShadows([], audience.map((a) => a.model.root));

  // ── 先生の旗: 黄色(どんぐり = うて)と赤(× = うつな) ─────────────
  function flagTexture(bg, draw) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 96);
    draw(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const yellowTex = flagTexture('#ffd23a', (g) => {
    // どんぐりの絵
    g.fillStyle = '#a8662e';
    g.beginPath(); g.ellipse(64, 56, 20, 26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6a4020';
    g.beginPath(); g.ellipse(64, 36, 25, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(61, 16, 6, 12);
  });
  const redTex = flagTexture('#e8344a', (g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(40, 22); g.lineTo(88, 74); g.moveTo(88, 22); g.lineTo(40, 74); g.stroke();
  });
  function makeFlag(tex, side) {
    const pivot = new THREE.Group(); // 先生の手もと。ここを中心に あげさげする
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 6), toonMaterial(0x7a5032));
    pole.position.y = 0.85;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.7, 6, 1), new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide }));
    cloth.position.set(side * 0.5, 1.33, 0);
    pivot.add(pole, cloth);
    pivot.position.set(OWL_ROCK.x + side * 0.6, OWL_ROCK.top + 0.6, OWL_ROCK.z + 0.35);
    pivot.userData = { side, up: 0, target: 0, cloth };
    pivot.traverse((o) => { o.castShadow = true; });
    scene.add(pivot);
    return pivot;
  }
  // 先生から見て右手(画面の左)に黄色、左手(画面の右)に赤
  const flagGo = makeFlag(yellowTex, -1);
  const flagNo = makeFlag(redTex, 1);
  // あげた(up = 1)ときは まっすぐ上、さげた(0)ときは ななめ下(どちらの旗も いつも見えるように)
  function updateFlags(dt) {
    for (const f of [flagGo, flagNo]) {
      const u = f.userData;
      u.up += (u.target - u.up) * (1 - Math.exp(-dt * 22));
      f.rotation.z = -u.side * (1 - u.up) * 2.0;
      // 布が はためく
      const p = u.cloth.geometry.attributes.position;
      const t = time * 9;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + 0.375;
        p.setZ(i, Math.sin(t + x * 6) * 0.06 * x);
      }
      p.needsUpdate = true;
    }
  }

  // ── どんぐり鉄砲・かん・とぶ どんぐり ───────────────────
  const acornGeo = acornGeometry();
  const acornMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
  function makeGun(color) {
    const g = new THREE.Group();
    const wood = toonMaterial(0xa8744a), dark = toonMaterial(0x6a4426);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 10).rotateX(Math.PI / 2), wood);
    barrel.position.z = 0.2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 10).rotateX(Math.PI / 2), toonMaterial(color));
    band.position.z = 0.05;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), dark);
    grip.position.set(0, -0.12, -0.04);
    grip.rotation.x = 0.35;
    const acorn = new THREE.Mesh(acornGeo, acornMat);
    acorn.scale.setScalar(1.3);
    acorn.rotation.x = Math.PI / 2;
    acorn.position.z = 0.5;
    g.add(barrel, band, grip, acorn);
    g.userData.acorn = acorn;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  const tinTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, '#9aa4ae'); grad.addColorStop(0.4, '#e8eef2'); grad.addColorStop(0.7, '#b8c2ca'); grad.addColorStop(1, '#8a949e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,.15)';
    for (const y of [6, 58]) g.fillRect(0, y, 64, 3);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  function makeCan(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 16), new THREE.MeshToonMaterial({ map: tinTex }));
    body.position.y = 0.18;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.16, 16, 1, true), toonMaterial(color));
    label.position.y = 0.18;
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16).rotateX(-Math.PI / 2), toonMaterial(0xc8d0d6));
    top.position.y = 0.361;
    g.add(body, label, top);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  const cans = []; // slot → { group, home, fly }
  const shots = []; // とんでいる どんぐり { mesh, from, to, t, len, hit, slot, miss }
  function fire(slot, hit) {
    const v = game.runners[slot];
    v.gun.updateMatrixWorld(true);
    const from = new THREE.Vector3(0, 0, 0.5).applyMatrix4(v.gun.matrixWorld);
    const c = cans[slot];
    const to = hit ? c.group.position.clone().setY(RAIL_Y + 0.2) : new THREE.Vector3(from.x + (Math.random() - 0.5) * 1.5, 0.05, from.z - 2.2 - Math.random());
    const mesh = new THREE.Mesh(acornGeo, acornMat);
    mesh.scale.setScalar(1.6);
    mesh.position.copy(from);
    scene.add(mesh);
    shots.push({ mesh, from, to, t: 0, len: hit ? 0.16 : 0.5, hit, slot });
    v.recoil = 1;
    v.gun.userData.acorn.visible = false;
    sfx.pop(slot === 0 ? 1 : 0.45);
  }
  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const sh = shots[i];
      sh.t += dt;
      const k = Math.min(1, sh.t / sh.len);
      sh.mesh.position.lerpVectors(sh.from, sh.to, k);
      sh.mesh.position.y += Math.sin(k * Math.PI) * (sh.hit ? 0.15 : 1.4);
      sh.mesh.rotation.x += dt * 20;
      if (k >= 1) {
        scene.remove(sh.mesh);
        shots.splice(i, 1);
        if (sh.hit) hitCan(sh.slot);
        else puff(sh.to.x, sh.to.z);
      }
    }
    for (let slot = 0; slot < cans.length; slot++) {
      const c = cans[slot];
      if (!c?.fly) continue;
      const f = c.fly;
      f.t += dt;
      f.vel.y -= dt * 12;
      c.group.position.addScaledVector(f.vel, dt);
      c.group.rotation.x += f.spin * dt;
      c.group.rotation.z += f.spin * 0.4 * dt;
      if (c.group.position.y < 0.16 && f.vel.y < 0) {
        // 地面で ころん
        c.group.position.y = 0.16;
        f.vel.multiplyScalar(0.4);
        f.vel.y = Math.abs(f.vel.y) > 1 ? -f.vel.y * 0.4 : 0;
        f.spin *= 0.5;
        if (Math.abs(f.vel.y) < 0.01) { c.group.rotation.set(Math.PI / 2, c.group.rotation.y, 0); c.fly = null; }
      }
    }
  }
  function hitCan(slot) {
    const c = cans[slot];
    c.fly = { t: 0, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 3.6, -2.2), spin: 10 + Math.random() * 6 };
    sparkle(c.group.position.clone().setY(RAIL_Y + 0.3), 0xfff3c0, 5, 0.35);
    sfx.kan(slot === 0 ? 1 : 0.4);
  }
  function resetCans() {
    cans.forEach((c, slot) => {
      if (!c) return;
      c.fly = null;
      c.group.position.copy(c.home);
      c.group.rotation.set(0, 0, 0);
      c.group.visible = game.state.alive[slot];
    });
  }

  // ── 草のまり・カラス(じゃまもの) ───────────────────────
  const weed = (() => {
    const g = new THREE.Group();
    const mat = toonMaterial(0xb08850);
    for (let i = 0; i < 26; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.3 + Math.random() * 0.12, 0.012, 3, 12), mat);
      t.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      g.add(t);
    }
    g.visible = false;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    return g;
  })();
  const crow = (() => {
    const g = new THREE.Group();
    const black = toonMaterial(0x2a2a34);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), black);
    body.scale.set(1.4, 0.8, 0.8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), black);
    head.position.set(0.3, 0.08, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), toonMaterial(0xe8b030));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.46, 0.06, 0);
    g.add(body, head, beak);
    const wings = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.5), black);
      w.position.z = s * 0.25;
      p.add(w);
      g.add(p);
      wings.push({ p, s });
    }
    g.userData.wings = wings;
    g.visible = false;
    scene.add(g);
    return g;
  })();
  const jama = { weed: null, crow: null };
  function startJama(kind) {
    if (kind === 'weed') {
      const dir = Math.random() < 0.5 ? 1 : -1;
      jama.weed = { t: 0, dir, z: -2.6 - Math.random() * 1.5 };
      weed.visible = true;
      sfx.wind(0.1);
    } else {
      const dir = Math.random() < 0.5 ? 1 : -1;
      jama.crow = { t: 0, dir };
      crow.visible = true;
      sfx.crow();
    }
  }
  function updateJama(dt) {
    if (jama.weed) {
      const w = jama.weed;
      w.t += dt;
      const x = w.dir * (-6.5 + w.t * 7);
      weed.position.set(x, 0.38 + Math.abs(Math.sin(w.t * 6)) * 0.35, w.z);
      weed.rotation.z = -w.dir * w.t * 9;
      if (w.t > 2.1) { jama.weed = null; weed.visible = false; }
    }
    if (jama.crow) {
      const c = jama.crow;
      c.t += dt;
      crow.position.set(c.dir * (-7 + c.t * 7.5), 3.4 + Math.sin(c.t * 3) * 0.4, -4);
      crow.rotation.y = c.dir > 0 ? 0 : Math.PI;
      for (const w of crow.userData.wings) w.p.rotation.x = w.s * Math.sin(c.t * 18) * 0.7;
      if (c.t > 2.1) { jama.crow = null; crow.visible = false; }
    }
  }

  // ── けむり・きらきら・紙ふぶき ───────────────────────────
  const fx = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.15, 1);
  function puff(x, z, n = 5) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xe8c9a0, transparent: true, opacity: 0.8 }));
      m.position.set(x, 0.1, z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3(Math.cos(a) * 0.8, 0.6 + Math.random() * 0.5, Math.sin(a) * 0.8), kind: 'puff' });
    }
  }
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
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  function sparkle(pos, color = 0xffffff, n = 5, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, color, transparent: true, depthWrite: false }));
      sp.position.copy(pos);
      sp.scale.setScalar(size);
      scene.add(sp);
      const a = Math.random() * Math.PI * 2;
      fx.push({ obj: sp, t: 0, life: 0.5, vel: new THREE.Vector3(Math.cos(a) * 1.6, 1.4 + Math.random(), Math.sin(a) * 1.6), size, kind: 'sparkle' });
    }
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 3, 3.5 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
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
      } else if (f.kind === 'puff') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.scale.setScalar(1 + k * 1.5);
        f.obj.material.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'confetti') {
        f.obj.position.addScaledVector(f.vel, dt);
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
  let pressed = false; // 自分が うった(次のステップで わたす)

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const c of cans.splice(0)) if (c) scene.remove(c.group);
    for (const s of shots.splice(0)) scene.remove(s.mesh);
    const n = players.length;
    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const def = CHARACTERS.find((c) => c.key === p.character);
      const size = def.size || 1;
      const front = new THREE.Box3().setFromObject(model.root).max.z;
      const holder = new THREE.Group();
      holder.add(model.root);
      const gun = makeGun(PLAYER_COLORS[slot].hex);
      holder.add(gun);
      const home = new THREE.Vector3(laneX(slot, n), 0, 0);
      holder.position.copy(home);
      holder.rotation.y = Math.PI; // 先生(奥)のほうを向く
      scene.add(holder);
      return { model, holder, gun, front, size, home, arms: [model.node('arm_L'), model.node('arm_R')], aim: 0, recoil: 0, back: 0, label: null };
    }));
    players.forEach((_, slot) => {
      const group = makeCan(PLAYER_COLORS[slot].hex);
      const home = new THREE.Vector3(laneX(slot, n), RAIL_Y, CAN_Z);
      group.position.copy(home);
      scene.add(group);
      cans[slot] = { group, home, fly: null };
    });
    // 自分の頭の上に しるし、足もとに輪
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    const foot = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex, transparent: true, opacity: 0.9, depthWrite: false }));
    foot.position.y = 0.025;
    runners[0].holder.add(foot);

    for (const f of fx.splice(0)) scene.remove(f.obj);
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, heart: 0 };
    flagGo.userData.target = flagNo.userData.target = 0;
    jama.weed = jama.crow = null;
    weed.visible = crow.visible = false;
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder).concat(cans.map((c) => c.group)), runners.map((r) => r.holder));
    pressed = false;
    buildChips();
    signal('');
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoW').classList.add('show');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudW').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) { onExit(to); }

  // ── 一時停止 ──────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnW').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもタップ / スペース・エンター ──────────────
  const canShoot = () => mode === 'playing' && !paused && intro >= 1 && game && ['ready', 'wait', 'go'].includes(game.state.phase);
  window.addEventListener('pointerdown', (e) => {
    if (mode !== 'playing' || paused || e.target.closest('button, a')) return;
    unlockAudio();
    if (canShoot()) pressed = true;
  });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      e.preventDefault();
      unlockAudio();
      if (canShoot()) pressed = true;
    }
  });

  // ── HUD ─────────────────────────────────────────────
  function signal(text, cls = '') {
    const el = $('signalW');
    el.textContent = text;
    el.className = 'signal' + (cls ? ' sig-' + cls : '');
    if (text) { void el.offsetWidth; el.classList.add('show'); }
  }
  function splash(text, cls = '') {
    const el = $('splashW');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function flash(cls) {
    const el = $('flashW');
    el.className = 'flash fl-' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsW').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `<i></i><b></b>`;
      d.title = p.name;
      return d;
    }));
  }
  function renderChips() {
    const s = game.state;
    [...$('chipsW').children].forEach((c, slot) => {
      const sh = s.shots[slot];
      let t = '';
      if (!s.alive[slot] && !(s.phase === 'judge' && s.last?.out.includes(slot))) t = '×';
      else if (sh?.fault) t = 'おてつき';
      else if (sh) t = sh.late ? '…' : sec2(sh.react);
      c.lastChild.textContent = t;
      c.classList.toggle('out', !s.alive[slot]);
      c.classList.toggle('fault', !!sh?.fault);
      c.classList.toggle('best', s.phase === 'judge' && s.last?.fastest === slot);
    });
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '') {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsW').append(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ── できごと ────────────────────────────────────────
  const FAULT_TEXT = { ready: 'はやすぎ!', wait: 'おてつき!', nise: 'にせもの!', jama: 'つられた!', gyaku: '赤い旗!' };
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'ready':
          resetCans();
          for (const v of game.runners) v.gun.userData.acorn.visible = true;
          flagGo.userData.target = flagNo.userData.target = 0;
          owl.setFace('glare');
          signal(e.round === 1 ? 'かまえて…' : `${aliveSlots(s).length}人 のこり… かまえて`, 'small');
          break;
        case 'wait':
          signal('');
          game.heart = 0.6;
          break;
        case 'fake':
          if (e.kind === 'gyaku') {
            flagNo.userData.target = 1;
            owl.play('flap', { fade: 0.05 });
            signal('うつな!', 'no');
            sfx.buzz();
            setTimeout(() => { flagNo.userData.target = 0; }, 700);
          } else if (e.kind === 'nise') {
            // 旗を半分あげて やめる / 言いかける(どちらかを交互に)
            if (e.id % 2) {
              flagGo.userData.target = 0.45;
              setTimeout(() => { flagGo.userData.target = 0; }, 350);
            } else {
              signal('どん…ぐりぃ…', 'small');
              setTimeout(() => signal(''), 700);
            }
            sfx.hoot();
          } else {
            startJama(e.id % 2 ? 'weed' : 'crow');
          }
          break;
        case 'go':
          flagGo.userData.target = 1;
          flagNo.userData.target = 0;
          owl.play('flap', { fade: 0.05 });
          owl.setFace('normal');
          signal('うて!', 'go');
          $('howtoW').classList.remove('show');
          flash('go');
          sfx.bang();
          break;
        case 'shot':
          fire(e.slot, true);
          if (e.slot === 0) pop(sec2(e.react), game.runners[0].holder.position.x, 2.1, 0, 'me');
          break;
        case 'fault': {
          fire(e.slot, false);
          const v = game.runners[e.slot];
          v.faultT = 1.2;
          if (e.slot === 0) { splash(FAULT_TEXT[e.kind] ?? 'おてつき!', 'red'); flash('no'); }
          else pop('おてつき', v.holder.position.x, 2.1, 0, 'red');
          sfx.whistle();
          break;
        }
        case 'judge': {
          flagGo.userData.target = 0;
          owl.play('idle');
          if (e.redo) {
            signal('みんな おてつき! やりなおし', 'small');
            break;
          }
          signal('');
          if (e.fastest !== null) {
            const v = game.runners[e.fastest];
            pop('いちばん!', v.holder.position.x, 2.5, 0, 'gold');
            v.happyT = 1.6;
          }
          for (const slot of e.out) {
            const v = game.runners[slot];
            v.outT = 0;
            pop('だつらく', v.holder.position.x, 2.5, 0, 'out');
          }
          if (e.out.includes(0)) { splash('だつらく…', 'red'); sfx.gaan(); }
          for (const a of audience) { a.model.play('cheer'); a.model.setFace('happy'); a.until = 1.2; }
          break;
        }
        case 'finished': {
          game.endTimer = 3.4;
          const w = game.runners[e.winner];
          signal(e.winner === 0 ? 'あなたの勝ち!' : `${game.players[e.winner].name}の勝ち!`, 'win');
          confetti(w.holder.position.x, w.holder.position.z);
          voice({ type: 'triangle', pts: [[0, 784]], len: 0.15, gain: 0.1 });
          voice({ type: 'triangle', pts: [[0, 988]], len: 0.15, gain: 0.1, at: 0.15 });
          voice({ type: 'triangle', pts: [[0, 1175]], len: 0.4, gain: 0.1, at: 0.3 });
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
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.best !== null ? `${sec2(r.best)}びょう` : '—'}<small>${r.faults ? `おてつき ${r.faults}` : 'いちばん速いとき'}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateRunners(dt) {
    const s = game.state;
    s.runners.forEach((_, i) => {
      const v = game.runners[i];
      const alive = s.alive[i];
      const out = !alive && !(s.phase === 'judge' && s.last?.out.includes(i) && v.outT < 0.9);
      v.happyT = Math.max(0, (v.happyT || 0) - dt);
      v.faultT = Math.max(0, (v.faultT || 0) - dt);
      if (v.outT !== undefined) v.outT += dt;
      v.recoil = Math.max(0, v.recoil - dt * 5);
      // かまえる: ready / wait / go のあいだ(脱落した子は下ろす)
      const aimNow = alive && ['ready', 'wait', 'go'].includes(s.phase) && !s.shots[i]?.fault;
      v.aim += ((aimNow ? 1 : 0) - v.aim) * (1 - Math.exp(-dt * 10));
      // 脱落した子は うしろへ下がって、こちらを向く
      v.back += ((out ? 1 : 0) - v.back) * (1 - Math.exp(-dt * 3));
      const win = s.phase === 'finished' && s.winner === i ? 1 : 0;
      v.win = (v.win || 0) + (win - (v.win || 0)) * (1 - Math.exp(-dt * 3));
      v.holder.position.set(v.home.x * (1 - v.win), 0, v.home.z + v.back * 0.9 + v.win * 2.4);
      v.holder.rotation.y = Math.PI * (1 - Math.max(v.back, v.win));
      let clip = 'idle', face = 'normal';
      if (s.phase === 'finished') {
        if (s.winner === i) { clip = 'cheer'; face = 'happy'; } else { clip = 'wave'; face = 'happy'; }
      } else if (v.faultT > 0 || (s.phase === 'judge' && s.last?.out.includes(i))) { clip = 'dizzy'; face = 'frustrated'; }
      else if (out) face = 'frustrated';
      else if (v.happyT > 0) { clip = 'cheer'; face = 'happy'; }
      else if (s.phase === 'wait' || s.phase === 'ready') face = 'normal';
      else if (s.phase === 'go' && s.shots[i]) face = 'happy';
      v.model.play(clip);
      v.model.setFace(face);
      v.model.update(dt);
      // 両手で前へ鉄砲をかまえる(アニメーションの腕の上に重ねる)
      const k = v.aim * (clip === 'idle' ? 1 : 0.3);
      v.arms.forEach((a, n) => {
        if (!a) return;
        const side = n === 0 ? 1 : -1;
        a.rotation.x += (-1.35 - a.rotation.x) * k;
        a.rotation.z += (-side * 0.35 - a.rotation.z) * k;
      });
      // 鉄砲: かまえると胸の前、下ろすと わきに。うつと少し はねる
      const y = (0.62 + 0.18 * v.aim) * v.size + v.recoil * 0.06;
      v.gun.position.set(-0.05 * (1 - v.aim) + 0.0, y, Math.max(0.3 * v.size, v.front + 0.02) * (0.6 + 0.4 * v.aim));
      v.gun.rotation.set(-v.recoil * 0.5 + (1 - v.aim) * 0.9, 0, 0);
      v.gun.visible = !out && v.win < 0.3;
      if (v.marker) v.marker.position.set(0, 2.0 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game?.state;
    let pos, look;
    if (s && (s.phase === 'finished' || mode === 'result')) {
      // 決着: 前へ出てきた 勝った子に寄る(うしろに みんな)
      pos = portrait ? new THREE.Vector3(0, 2.6, 8.4) : new THREE.Vector3(0, 2.1, 6.6);
      look = new THREE.Vector3(0, 1.0, 1.2);
    } else {
      // うしろから、列ごしに先生を見る。待っているあいだは、じわっと寄る
      const tense = s && s.phase === 'wait' ? Math.min(1, s.phaseT / 4) : 0;
      pos = portrait ? new THREE.Vector3(0, 4.4 - tense * 0.4, 10.2 - tense * 1.4) : new THREE.Vector3(0, 2.9 - tense * 0.3, 7.4 - tense * 1.2);
      look = portrait ? new THREE.Vector3(0, 1.3, -4.5) : new THREE.Vector3(0, 1.5, -5);
    }
    camera.fov = portrait ? 58 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      // 空から岩場へ: 岩山のほうから くるっと回りこむ
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(14, 22, -26);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, -8), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 3);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
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
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) intro = Math.min(1, intro + dt / INTRO_TIME);
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : pressed));
        pressed = false;
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      // 待っているあいだ: ドクン…ドクン…(長くなるほど速く)
      if (s.phase === 'wait') {
        game.heart -= dt;
        if (game.heart <= 0) { sfx.heart(); game.heart = Math.max(0.45, 0.9 - s.phaseT * 0.08); }
      }
      if (game.endTimer !== null) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) {
          game.endTimer = null;
          showResult();
        }
      }
    }
    if (game && mode === 'playing') renderChips();
    if (game && !paused) {
      updateRunners(dt);
      updateShots(dt);
      updateJama(dt);
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
      owl.update(dt);
      if (owl.current === 'flap' && owl.actions.flap.time > 1.0) owl.play('idle');
      updateFlags(dt);
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dhayauchi = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    shoot: () => { pressed = true; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分は うたない)
    advance: (sec) => {
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], game.state, slot) : false))));
      }
    },
    // つぎの phase まで すすめる
    until: (phase) => {
      for (let i = 0; i < 60 / STEP && game.state.phase !== phase && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], game.state, slot) : false))));
      }
    },
    // ひっかけを いま出す(演出の確認用)
    fake: (kind, id = 1) => {
      game.state.fake = { id, kind, left: RULES.fakeLife };
      onEvents([{ type: 'fake', id, kind }]);
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
      pressed = false;
    },
    get intro() { return intro; },
  };
}
