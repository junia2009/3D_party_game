// どんぐり遊園地の 乗り物と 飾り(盤の 見た目。scene.js から よぶ)。
//
// - 入口のゲート: 赤白しまの 柱に「どんぐり遊園地」の 看板。てっぺんに 大きな どんぐり。スタートの うしろに立つ
// - メリーゴーラウンド: まん中。木馬が 上下しながら 回る
// - コーヒーカップ: 左の 内がわ。台と カップが それぞれ 回る
// - ジェットコースター: 右奥の 道の外。丘と 宙がえりの ある 輪っかの レール。車両が 走りつづける
// - 観覧車: 左奥の 道の外。ゴンドラは いつも 上を 向いたまま
// - おばけ屋敷: 左手前の 内がわ。窓が 光って、おばけが まわりを ふわふわ
// - 風船屋さん: 入口の そば
//
// 回るもの・動くものは userData.anchor を付ける(scene.js が そのまとまりごとに 描く回数を まとめる)。
// rides[key] は、コマが 乗り物に 乗るときの 道すじ(game.js が 使う)。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../runtime/models.js';
import { acornGeometry } from '../games/daruma/trees.js';

const anchor = (g) => { g.userData.anchor = true; return g; };
const mat = (() => {
  const cache = new Map();
  return (hex) => { if (!cache.has(hex)) cache.set(hex, toonMaterial(hex)); return cache.get(hex); };
})();
const glow = (() => {
  const cache = new Map();
  return (hex) => { if (!cache.has(hex)) cache.set(hex, new THREE.MeshBasicMaterial({ color: hex })); return cache.get(hex); };
})();
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };

function signTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 112;
  const x = cv.getContext('2d');
  x.fillStyle = '#4a2a12';
  x.beginPath();
  x.roundRect(2, 2, 508, 108, 30);
  x.fill();
  const g = x.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#ff6fae');
  g.addColorStop(0.5, '#ffb03a');
  g.addColorStop(1, '#5cc0ff');
  x.fillStyle = g;
  x.beginPath();
  x.roundRect(10, 10, 492, 92, 24);
  x.fill();
  x.font = '400 54px "Dela Gothic One", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 10;
  x.strokeStyle = '#4a2a12';
  x.strokeText(text, 256, 60);
  x.fillStyle = '#fff6e0';
  x.fillText(text, 256, 60);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 赤白しまの 柱(輪切りを 積む)
function stripedPole(r, h, a = 0xe8402f, b = 0xfff6e0, n = 8) {
  const g = new THREE.Group();
  const seg = new THREE.CylinderGeometry(r, r, h / n, 10);
  for (let i = 0; i < n; i++) g.add(mesh(seg, mat(i % 2 ? b : a), 0, h / n * (i + 0.5), 0));
  return g;
}

export function buildPark(g, st, rand, { near, isle, podium }) {
  const keep = []; // [x, z, r] 木を 置かない ところ
  const movers = []; // (dt, t) → void
  const rides = {};
  let time = 0;

  // ── 入口のゲート(スタートの うしろ) ─────────────────
  {
    const q = st.squares[st.start];
    const gx = q.x, gz = podium.z - 3.6;
    const gate = new THREE.Group();
    for (const sx of [-3.4, 3.4]) {
      const pole = stripedPole(0.38, 4.6);
      pole.position.x = sx;
      gate.add(pole);
      gate.add(mesh(new THREE.SphereGeometry(0.5, 12, 8), mat(0xffd23c), sx, 4.85, 0));
      // 旗
      const flag = mesh(new THREE.ConeGeometry(0.35, 1.0, 3), mat(sx < 0 ? 0x5cc0ff : 0xff6fae), sx + 0.45, 5.6, 0);
      flag.rotation.z = -Math.PI / 2;
      gate.add(flag, mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), mat(0x8a5a32), sx, 5.4, 0));
    }
    const board = mesh(new THREE.PlaneGeometry(6.4, 1.4), new THREE.MeshToonMaterial({ map: signTexture('どんぐり遊園地'), gradientMap: toonGradient, side: THREE.DoubleSide }), 0, 4.1, 0.05);
    board.userData.noMerge = true;
    gate.add(board, mesh(new THREE.BoxGeometry(6.8, 1.6, 0.2), mat(0x7a4a24), 0, 4.1, -0.1));
    // 看板の まわりの 電球
    const bulb = new THREE.SphereGeometry(0.08, 6, 4);
    for (let i = 0; i < 18; i++) {
      const u = i / 17;
      gate.add(mesh(bulb, glow(i % 2 ? 0xfff2a0 : 0xffb8d8), -3.2 + u * 6.4, 4.95, 0.12));
      gate.add(mesh(bulb, glow(i % 2 ? 0xffb8d8 : 0xfff2a0), -3.2 + u * 6.4, 3.25, 0.12));
    }
    // てっぺんの 大きな どんぐり
    const acorn = new THREE.Mesh(acornGeometry(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
    acorn.scale.setScalar(7);
    acorn.position.set(0, 5.0, 0);
    gate.add(acorn);
    gate.position.set(gx, 0, gz);
    g.add(gate);
    keep.push([gx, gz, 4.2]);
  }

  // ── 風船屋さん(入口の そば) ─────────────────────
  {
    const x0 = 6.2, z0 = 5.6;
    const cart = new THREE.Group();
    cart.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), mat(0x5cc0ff), 0, 0.55, 0));
    for (const sx of [-0.45, 0.45]) cart.add(mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12), mat(0x4a2a12), sx, 0.22, 0.42));
    cart.position.set(x0, 0, z0);
    g.add(cart);
    const bunch = anchor(new THREE.Group());
    const ball = new THREE.SphereGeometry(0.32, 12, 10);
    ball.scale(1, 1.18, 1);
    const string = new THREE.CylinderGeometry(0.01, 0.01, 1, 3);
    const colors = [0xff4f6a, 0xffd23c, 0x5cc0ff, 0x7ad35a, 0xb48cff, 0xff9a3a, 0xff8fb8];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, r = 0.25 + (i % 3) * 0.22;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r * 0.7, by = 2.3 + (i % 4) * 0.28;
      bunch.add(mesh(ball, mat(colors[i % colors.length]), bx, by, bz));
      const s = mesh(string, mat(0xffffff), bx / 2, (by + 0.9) / 2, bz / 2);
      s.scale.y = Math.hypot(bx, by - 0.9, bz);
      s.lookAt(new THREE.Vector3(bx, by, bz).add(s.position).multiplyScalar(0.5));
      s.rotation.x += Math.PI / 2;
      bunch.add(s);
    }
    bunch.position.set(x0, 0, z0);
    g.add(bunch);
    movers.push((dt, t) => { bunch.position.y = Math.sin(t * 1.4) * 0.08; bunch.rotation.y = Math.sin(t * 0.6) * 0.15; });
    keep.push([x0, z0, 1.8]);
  }

  // ── メリーゴーラウンド(まん中) ───────────────────
  {
    const cx = 0, cz = -3.4;
    const base = new THREE.Group();
    base.add(mesh(new THREE.CylinderGeometry(2.9, 3.0, 0.35, 28), mat(0xfff6e0), 0, 0.17, 0));
    base.add(mesh(new THREE.CylinderGeometry(3.02, 3.02, 0.12, 28), mat(0xff6fae), 0, 0.3, 0));
    base.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.2, 12), mat(0xffd23c), 0, 1.9, 0));
    // 屋根: しまの 円すい
    const slices = 12;
    for (let i = 0; i < slices; i++) {
      const cone = new THREE.ConeGeometry(3.3, 1.5, 4, 1, false, (i / slices) * Math.PI * 2, (Math.PI * 2) / slices);
      base.add(mesh(cone, mat(i % 2 ? 0xfff6e0 : 0xff4f6a), 0, 4.2, 0));
    }
    base.add(mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.3, 28), mat(0xffd23c), 0, 3.35, 0));
    const flag = mesh(new THREE.ConeGeometry(0.3, 0.8, 3), mat(0x5cc0ff), 0.38, 5.4, 0);
    flag.rotation.z = -Math.PI / 2;
    base.add(flag, mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4), mat(0x8a5a32), 0, 5.2, 0));
    const bulb = new THREE.SphereGeometry(0.09, 6, 4);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      base.add(mesh(bulb, glow(i % 2 ? 0xfff2a0 : 0xffb8d8), Math.cos(a) * 3.35, 3.35, Math.sin(a) * 3.35));
    }
    base.position.set(cx, 0, cz);
    g.add(base);
    const spin = anchor(new THREE.Group());
    const horses = [];
    const body = new THREE.CapsuleGeometry(0.22, 0.55, 4, 8);
    body.rotateZ(Math.PI / 2);
    const head = new THREE.BoxGeometry(0.22, 0.42, 0.24);
    const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.9, 6);
    const hc = [0xfff6e0, 0xffd3e2, 0xd8f0ff, 0xfff0b0];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = Math.cos(a) * 2.2, pz = Math.sin(a) * 2.2;
      spin.add(mesh(pole, mat(0xffd23c), px, 1.85, pz));
      const h = anchor(new THREE.Group());
      h.add(mesh(body, mat(hc[i % 4]), 0, 0, 0));
      const hd = mesh(head, mat(hc[i % 4]), 0.38, 0.28, 0);
      hd.rotation.z = -0.4;
      h.add(hd, mesh(new THREE.BoxGeometry(0.3, 0.06, 0.28), mat(0xe8402f), -0.05, 0.22, 0)); // くら
      h.position.set(px, 1.4, pz);
      h.rotation.y = -a; // 進む向き(円の 接線)
      spin.add(h);
      horses.push({ h, ph: i * 0.8 });
    }
    spin.position.set(cx, 0, cz);
    g.add(spin);
    movers.push((dt, t) => {
      spin.rotation.y += dt * 0.5;
      for (const { h, ph } of horses) h.position.y = 1.35 + Math.sin(t * 2.4 + ph) * 0.22;
    });
    keep.push([cx, cz, 4.0]);
  }

  // ── コーヒーカップ(左の 内がわ) ─────────────────
  {
    const cx = -7.4, cz = -3.6;
    g.add(mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.25, 28), mat(0xd8f0ff), cx, 0.12, cz));
    const plate = anchor(new THREE.Group());
    plate.add(mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.12, 28), mat(0x8fd0ff), 0, 0.3, 0));
    const cups = [];
    const cupGeo = new THREE.CylinderGeometry(0.75, 0.5, 0.75, 16, 1, true);
    const inside = new THREE.CircleGeometry(0.62, 16).rotateX(-Math.PI / 2);
    const cc = [0xff6fae, 0xffd23c, 0x7ad35a];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const cup = anchor(new THREE.Group());
      const m = new THREE.MeshToonMaterial({ color: cc[i], gradientMap: toonGradient, side: THREE.DoubleSide });
      cup.add(mesh(cupGeo, m, 0, 0.72, 0), mesh(inside, mat(0x6b3a1a), 0, 0.85, 0));
      cup.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 10, Math.PI), mat(cc[i]), 0.78, 0.72, 0));
      cup.position.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25);
      plate.add(cup);
      cups.push(cup);
    }
    plate.position.set(cx, 0, cz);
    g.add(plate);
    movers.push((dt) => { plate.rotation.y -= dt * 0.4; for (const c of cups) c.rotation.y += dt * 1.6; });
    keep.push([cx, cz, 3.2]);
  }

  // ── ジェットコースター(右奥の 道の外) ─────────────
  {
    const P = [
      [1.5, 1.0, -14.7], [5, 1.0, -14.7], [9, 1.0, -14.7], [12.5, 1.4, -14.8], [14.8, 2.4, -15.6],
      [13.5, 3.8, -16.8], [10.5, 5.0, -17.0], [8.4, 1.6, -17.0],
      // 宙がえり(-x へ 進みながら、ぐるっと)
      [6.6, 1.3, -16.7], [5.0, 3.0, -16.8], [6.6, 4.8, -16.95], [8.2, 3.0, -17.1], [6.6, 1.3, -17.25],
      [4.0, 1.4, -17.2], [1.8, 2.0, -16.9], [0.4, 2.0, -15.8],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(P, true, 'centripetal');
    const frames = curve.computeFrenetFrames(200, true);
    const railCurve = (off) => {
      const c = new THREE.Curve();
      c.getPoint = (u, out = new THREE.Vector3()) => {
        const i = Math.min(199, Math.floor(u * 200));
        return curve.getPointAt(u, out).addScaledVector(frames.binormals[i], off);
      };
      return c;
    };
    for (const off of [-0.32, 0.32]) g.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve(off), 260, 0.08, 5, true), mat(0xe8402f)));
    // まくら木
    const tie = new THREE.BoxGeometry(0.8, 0.07, 0.16);
    for (let i = 0; i < 140; i++) {
      const u = i / 140;
      const k = Math.min(199, Math.floor(u * 200));
      const p = curve.getPointAt(u);
      const m = mesh(tie, mat(0x8a5a32), p.x, p.y - 0.05, p.z);
      const basis = new THREE.Matrix4().makeBasis(frames.binormals[k], frames.normals[k], frames.tangents[k]);
      m.quaternion.setFromRotationMatrix(basis);
      g.add(m);
    }
    // 柱(宙がえりの ところは のぞく)
    const post = new THREE.CylinderGeometry(0.07, 0.09, 1, 5);
    for (let i = 0; i < 46; i++) {
      const u = i / 46;
      const p = curve.getPointAt(u);
      if (p.x > 4.6 && p.x < 8.6 && p.z < -16.5 && p.y > 1.0) continue;
      if (p.y < 1.1) continue;
      const m = mesh(post, mat(0xfff6e0), p.x, (p.y - 0.15) / 2, p.z);
      m.scale.y = p.y - 0.15;
      g.add(m);
    }
    // 乗り場
    const stn = new THREE.Group();
    stn.add(mesh(new THREE.BoxGeometry(3.2, 0.5, 1.6), mat(0xfff6e0), 0, 0.25, 0.9));
    for (const sx of [-1.4, 1.4]) stn.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), mat(0x5cc0ff), sx, 1.1, 1.5));
    for (let k = 0; k < 6; k++) {
      const s = mesh(new THREE.BoxGeometry(0.6, 0.06, 2.0), mat(k % 2 ? 0xfff6e0 : 0x5cc0ff), -1.5 + k * 0.6, 2.25, 0.6);
      s.rotation.x = -0.15;
      stn.add(s);
    }
    stn.position.set(9, 0, -14.7);
    g.add(stn);
    // 車両(3つ つながり)。低いところほど 速い
    const cars = [];
    const carGeo = new THREE.BoxGeometry(0.62, 0.38, 0.9);
    const cc = [0xffd23c, 0x5cc0ff, 0x7ad35a];
    for (let i = 0; i < 3; i++) {
      const car = anchor(new THREE.Group());
      car.add(mesh(carGeo, mat(cc[i]), 0, 0.25, 0));
      car.add(mesh(new THREE.BoxGeometry(0.66, 0.1, 0.12), mat(0x4a2a12), 0, 0.42, 0.42));
      g.add(car);
      cars.push(car);
    }
    const len = curve.getLength();
    let u = 0;
    const top = Math.max(...P.map((p) => p.y));
    const tmp = new THREE.Vector3(), look = new THREE.Vector3();
    const place = (o, uu) => {
      uu = ((uu % 1) + 1) % 1;
      const k = Math.min(199, Math.floor(uu * 200));
      curve.getPointAt(uu, tmp);
      o.position.copy(tmp).addScaledVector(frames.normals[k], 0.05);
      const basis = new THREE.Matrix4().makeBasis(frames.binormals[k], frames.normals[k], frames.tangents[k]);
      o.quaternion.setFromRotationMatrix(basis);
    };
    movers.push((dt) => {
      const y = curve.getPointAt(u, look).y;
      const v = 3.5 + Math.sqrt(Math.max(0, top + 0.6 - y)) * 3.2; // m/秒
      u = (u + (v * dt) / len) % 1;
      cars.forEach((c, i) => place(c, u - (i * 1.0) / len));
    });
    // 乗り場(P[2])に いちばん 近い ところ
    let u0 = 0, best = Infinity;
    for (let i = 0; i < 400; i++) {
      const d = curve.getPointAt(i / 400, tmp).distanceToSquared(P[2]);
      if (d < best) { best = d; u0 = i / 400; }
    }
    rides.coaster = {
      time: 4.6,
      enter: new THREE.Vector3(9, 0.6, -14.2),
      // t: 0〜1 で 1周。乗り場から
      path(t, out = new THREE.Vector3()) {
        const uu = (u0 + t) % 1;
        const k = Math.min(199, Math.floor(uu * 200));
        return curve.getPointAt(uu, out).addScaledVector(frames.normals[k], 0.55);
      },
    };
    for (const [x, z, r] of [[2, -15.6, 2.4], [6.5, -16, 3.2], [10.5, -16, 3.2], [14, -15.6, 2.6]]) keep.push([x, z, r]);
  }

  // ── 観覧車(左奥の 道の外) ───────────────────────
  {
    const hx = -8, hz = -16.3, hy = 7.2, R = 5.6;
    const legs = new THREE.Group();
    for (const sz of [-0.9, 0.9]) {
      for (const sx of [-2.6, 2.6]) {
        const leg = mesh(new THREE.CylinderGeometry(0.14, 0.18, 1, 6), mat(0xfff6e0), sx / 2, hy / 2, sz);
        leg.scale.y = Math.hypot(sx, hy);
        leg.rotation.z = Math.atan2(sx, hy);
        legs.add(leg);
      }
    }
    legs.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 10).rotateX(Math.PI / 2), mat(0xffd23c), 0, hy, 0));
    legs.add(mesh(new THREE.BoxGeometry(6.6, 0.35, 2.6), mat(0xd8cbb0), 0, 0.17, 0));
    legs.position.set(hx, 0, hz);
    g.add(legs);
    const wheel = anchor(new THREE.Group());
    for (const sz of [-0.5, 0.5]) {
      wheel.add(mesh(new THREE.TorusGeometry(R, 0.1, 6, 48), mat(0xff6fae), 0, 0, sz));
      wheel.add(mesh(new THREE.TorusGeometry(R * 0.55, 0.07, 6, 32), mat(0xfff6e0), 0, 0, sz));
    }
    const spoke = new THREE.CylinderGeometry(0.05, 0.05, R, 4);
    const bulb = new THREE.SphereGeometry(0.1, 6, 4);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (const sz of [-0.5, 0.5]) {
        const s = mesh(spoke, mat(0xfff6e0), Math.cos(a) * R / 2, Math.sin(a) * R / 2, sz);
        s.rotation.z = a - Math.PI / 2;
        wheel.add(s);
      }
      wheel.add(mesh(bulb, glow(i % 2 ? 0xfff2a0 : 0xffb8d8), Math.cos(a) * R, Math.sin(a) * R, 0.62));
    }
    const gondolas = [];
    const gc = [0xff4f6a, 0xffd23c, 0x5cc0ff, 0x7ad35a, 0xb48cff, 0xff9a3a, 0xff8fb8, 0x4fd0c0];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const gd = anchor(new THREE.Group());
      gd.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), mat(0x4a2a12), 0, -0.25, 0));
      gd.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), mat(gc[i]), 0, -0.85, 0));
      gd.add(mesh(new THREE.BoxGeometry(0.7, 0.32, 0.92), mat(0xd8f0ff), 0, -0.78, 0));
      gd.add(mesh(new THREE.ConeGeometry(0.7, 0.35, 4).rotateY(Math.PI / 4), mat(gc[i]), 0, -0.35, 0));
      gd.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      wheel.add(gd);
      gondolas.push(gd);
    }
    wheel.position.set(hx, hy, hz);
    g.add(wheel);
    movers.push((dt) => {
      wheel.rotation.z += dt * 0.12;
      for (const gd of gondolas) gd.rotation.z = -wheel.rotation.z; // いつも 上を 向く
    });
    rides.wheel = {
      time: 4.2,
      enter: new THREE.Vector3(hx, 0.4, hz + 1.6),
      // 下から 右回りに てっぺんまで(ゴンドラの 前に 立つ)
      path(t, out = new THREE.Vector3()) {
        const a = -Math.PI / 2 - Math.PI * t;
        return out.set(hx + Math.cos(a) * R, hy + Math.sin(a) * R - 1.35, hz + 0.75);
      },
    };
    keep.push([hx, hz, 4.4]);
  }

  // ── おばけ屋敷(左手前の 内がわ) ───────────────────
  {
    const cx = -9.6, cz = 4.6;
    const house = anchor(new THREE.Group());
    const wall = mat(0x4a3a6a), roof = mat(0x2a2040), trim = mat(0xff9a3a);
    house.add(mesh(new THREE.BoxGeometry(4.2, 2.8, 3.0), wall, 0, 1.4, 0));
    const r = mesh(new THREE.ConeGeometry(3.3, 1.8, 4).rotateY(Math.PI / 4), roof, 0, 3.7, 0);
    r.scale.set(1, 1, 0.75);
    house.add(r);
    // 塔(少し かたむく)
    const tower = new THREE.Group();
    tower.add(mesh(new THREE.BoxGeometry(1.3, 2.4, 1.3), wall, 0, 1.2, 0));
    tower.add(mesh(new THREE.ConeGeometry(1.1, 1.7, 4).rotateY(Math.PI / 4), roof, 0, 3.25, 0));
    tower.add(mesh(new THREE.PlaneGeometry(0.45, 0.6), glow(0xffe066), 0, 1.6, 0.66));
    tower.position.set(1.5, 2.8, -0.4);
    tower.rotation.z = -0.08;
    house.add(tower);
    // 窓(光る)と ドア
    for (const [wx, wy] of [[-1.3, 1.9], [1.3, 1.9], [-1.3, 0.8]]) {
      house.add(mesh(new THREE.PlaneGeometry(0.7, 0.6), glow(0xffe066), wx, wy, 1.51));
      house.add(mesh(new THREE.BoxGeometry(0.85, 0.08, 0.1), trim, wx, wy - 0.35, 1.53));
    }
    house.add(mesh(new THREE.PlaneGeometry(0.95, 1.4), glow(0x1a1028), 0.3, 0.7, 1.51));
    house.add(mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 12, Math.PI), trim, 0.3, 1.4, 1.53));
    // えんとつ(ここから とびだす)
    house.add(mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), mat(0x3a2e52), -1.3, 3.9, -0.3));
    house.position.set(cx, 0, cz);
    g.add(house);
    // かぼちゃ
    const pump = new THREE.SphereGeometry(0.32, 10, 8);
    pump.scale(1.2, 0.85, 1.2);
    for (const [px, pz] of [[-1.8, 2.1], [1.6, 2.2], [2.6, 1.0]]) {
      g.add(mesh(pump, mat(0xff8a2a), cx + px, 0.27, cz + pz));
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 5), mat(0x4f8a3a), cx + px, 0.58, cz + pz));
    }
    // おばけ(まわりを ふわふわ)
    const ghostGeo = (() => {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector2(Math.max(0.01, Math.sin(Math.acos(1 - t * 2)) * 0.42 * (t > 0.5 ? 1 : 1) + (t > 0.5 ? (t - 0.5) * 0.12 : 0)), 0.45 - t * 0.95));
      }
      return new THREE.LatheGeometry(pts, 12);
    })();
    const ghosts = [];
    for (let i = 0; i < 3; i++) {
      const gh = anchor(new THREE.Group());
      gh.add(mesh(ghostGeo, new THREE.MeshToonMaterial({ color: 0xf6f2ff, gradientMap: toonGradient, transparent: true, opacity: 0.85 })));
      for (const ex of [-0.13, 0.13]) gh.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(0x1a1028), ex, 0.15, 0.37));
      g.add(gh);
      ghosts.push({ gh, ph: (i / 3) * Math.PI * 2 });
    }
    let scare = 0; // コマが 入っている あいだ、家が ゆれる
    movers.push((dt, t) => {
      for (const { gh, ph } of ghosts) {
        const a = t * 0.45 + ph;
        gh.position.set(cx + Math.cos(a) * 3.0, 2.2 + Math.sin(t * 1.7 + ph) * 0.35, cz + Math.sin(a) * 2.4);
        gh.rotation.y = -a;
      }
      scare = Math.max(0, scare - dt);
      const k = scare > 0 ? 1 : 0;
      house.rotation.z = Math.sin(t * 30) * 0.025 * k;
      house.scale.y = 1 + Math.sin(t * 22) * 0.03 * k;
    });
    rides.ghost = {
      time: 2.0,
      enter: new THREE.Vector3(cx + 0.3, 0.1, cz + 1.9), // ドアの 前
      door: new THREE.Vector3(cx + 0.3, 0.1, cz + 1.2),
      chimney: new THREE.Vector3(cx - 1.3, 4.6, cz - 0.3),
      scare(sec) { scare = sec; },
    };
    keep.push([cx, cz, 3.6]);
  }

  return {
    rides,
    blocked: (x, z, r) => keep.some(([kx, kz, kr]) => (x - kx) ** 2 + (z - kz) ** 2 < (kr + r) ** 2),
    update(dt) {
      time += dt;
      for (const f of movers) f(dt, time);
    },
  };
}
