// まつぼっくり的あて の「的」の見た目(自分のぶんだけ描く)。
//
// 的の板: 厚みのある木の板に、自分の色の輪を手で塗ったような絵。ふちは濃い木の輪。
// 出かた・引っこみ方は種類ごと:
//   ハスの葉 … 水の中からハスの葉がせり上がり、ねかせてあった板がぱたんと起きる / 引っこむときは逆に沈む
//   切り株   … 土を散らして、地面から生える / 地面へもぐる
//   つるされた的・ハチの巣 … つるの綱から降りてきて、ぼよんと弾む / 綱へ引き上げられる
//   金の的   … トンボが横から運んでくる / 上へ飛んでいく
// もうすぐ引っこむときは、小きざみにゆれて知らせる。
// 当たったら: 板がまっぷたつに割れて飛ぶ(木くず)。金の的はきらきら。ハチの巣は大きくゆれて、ハチが飛び出す。
//
// 演出なので Math.random を使ってよい。位置と時間は rules の targetPos / born / life に合わせる。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { KINDS, VINE_Y, targetPos } from './rules.js';

const easeOutBack = (t) => { const c = 1.9; const k = t - 1; return 1 + (c + 1) * k * k * k + c * k * k; };
const easeOutBounce = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// 的の絵: 外から 白ふち / 色 / 白 / 色 / 赤いまん中。木目と、ところどころ塗りのかすれ
function faceTexture(ring, gold) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const c = S / 2;
  const rings = gold
    ? [[124, '#c98a12'], [112, '#ffe38a'], [92, '#ffc21f'], [68, '#fff3b8'], [44, '#ffb000'], [22, '#fff8d8']]
    : [[124, '#fff6e0'], [110, ring], [84, '#fff6e0'], [60, ring], [36, '#fff6e0'], [22, '#e8402f']];
  for (const [r, col] of rings) {
    x.fillStyle = col;
    x.beginPath();
    x.arc(c, c, r, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(60,30,10,.35)';
    x.lineWidth = 2.5;
    x.stroke();
  }
  // 木目(うすく)
  x.globalAlpha = 0.09;
  x.strokeStyle = '#5a3416';
  for (let i = 0; i < 26; i++) {
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    const y = Math.random() * S;
    x.moveTo(0, y);
    x.bezierCurveTo(S * 0.3, y + (Math.random() - 0.5) * 20, S * 0.7, y + (Math.random() - 0.5) * 20, S, y + (Math.random() - 0.5) * 10);
    x.stroke();
  }
  // 塗りのかすれ
  x.globalAlpha = 0.18;
  x.fillStyle = '#fff';
  for (let i = 0; i < 60; i++) {
    x.beginPath();
    x.ellipse(Math.random() * S, Math.random() * S, 1 + Math.random() * 4, 1 + Math.random() * 1.5, Math.random() * 3, 0, Math.PI * 2);
    x.fill();
  }
  if (gold) {
    // きらり
    x.globalAlpha = 0.85;
    x.fillStyle = '#fff';
    x.beginPath();
    x.ellipse(c - 52, c - 58, 16, 6, -0.7, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createTargets(scene, { splashAt = () => {}, onAppear = () => {} } = {}) {
  // ── 部品(使い回す) ───────────────────────────────
  const boardGeo = new THREE.CylinderGeometry(1, 1, 0.14, 32);
  boardGeo.rotateX(Math.PI / 2); // 面を +z(投げる子のほう)へ
  const halfGeos = [0, Math.PI].map((start) => {
    const g = new THREE.CylinderGeometry(1, 1, 0.14, 16, 1, false, start, Math.PI);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const rimGeo = new THREE.TorusGeometry(1, 0.075, 6, 32);
  const wood = toonMaterial(0x9a6a3e), woodDark = toonMaterial(0x6b4527), rope = toonMaterial(0x9a8a5a);
  const padMat = toonMaterial(0x5fae4a), padDark = toonMaterial(0x4a9440);
  const stumpMat = toonMaterial(0x8a5a32), stumpTop = toonMaterial(0xe0b77c), stumpRing = toonMaterial(0xb98a52);
  const goldEdge = toonMaterial(0xd99a12);
  let faceMat = null;
  const goldFace = new THREE.MeshBasicMaterial({ map: faceTexture('', true) });

  // ハスの葉(切れこみのある円盤)
  const padShape = new THREE.Shape();
  padShape.moveTo(0, 0);
  padShape.absarc(0, 0, 1, 0.28, Math.PI * 2 - 0.08, false);
  padShape.lineTo(0, 0);
  const padGeo = new THREE.ExtrudeGeometry(padShape, { depth: 0.04, bevelEnabled: false, curveSegments: 20 });
  padGeo.rotateX(-Math.PI / 2);

  // ハチの巣: 下がふくらんだ、紙のような段々
  const hiveGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = Math.sin(t * Math.PI) ** 0.7 * (0.38 + t * 0.12) * (1 + 0.06 * Math.sin(t * Math.PI * 9));
      pts.push(new THREE.Vector2(Math.max(0.02, r), 0.42 - t * 0.9));
    }
    const geo = new THREE.LatheGeometry(pts, 16);
    const p = geo.attributes.position;
    const cols = [];
    const a = new THREE.Color(0xe0a63a), b = new THREE.Color(0xb57a22);
    for (let i = 0; i < p.count; i++) {
      const c = Math.floor((0.42 - p.getY(i)) / 0.09) % 2 ? a : b;
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    return geo;
  })();
  const hiveMat = new THREE.MeshToonMaterial({ vertexColors: true });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x2a1606 });

  // ハチ: しま模様の胴と、すける羽
  const beeBody = new THREE.SphereGeometry(0.07, 8, 6);
  beeBody.scale(1.35, 1, 1);
  const beeStripe = new THREE.TorusGeometry(0.06, 0.018, 4, 10);
  beeStripe.rotateY(Math.PI / 2);
  const wingGeo = new THREE.PlaneGeometry(0.09, 0.05);
  const beeYellow = toonMaterial(0xffcf2e), beeBlack = toonMaterial(0x2b2420);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
  function makeBee() {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(beeBody, beeYellow));
    const s = new THREE.Mesh(beeStripe, beeBlack);
    s.position.x = -0.02;
    b.add(s);
    const wings = [];
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.position.set(0, 0.06, sz * 0.04);
      w.rotation.x = -Math.PI / 2;
      b.add(w);
      wings.push(w);
    }
    b.userData.wings = wings;
    return b;
  }

  // トンボ: 細長い胴(節)・大きな目・4枚の羽。金の的を足で抱えて運ぶ
  const dfBody = toonMaterial(0x2f8fd8), dfEye = toonMaterial(0x1c4f8a), dfWing = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const dfWingGeo = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(0.15, 0.07, 0.45, 0.07, 0.6, 0.02);
    sh.bezierCurveTo(0.45, -0.04, 0.15, -0.04, 0, 0);
    const g = new THREE.ShapeGeometry(sh, 8);
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  function makeDragonfly() {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(i === 0 ? 0.09 : 0.055 - i * 0.003, 8, 6), dfBody);
      seg.position.x = -0.05 - i * 0.09; // うしろ(-x)へ伸びる尾
      seg.scale.set(i === 0 ? 1.4 : 1.3, 1, 1);
      g.add(seg);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dfBody);
    head.position.x = 0.12;
    g.add(head);
    for (const sz of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dfEye);
      eye.position.set(0.15, 0.03, sz * 0.05);
      g.add(eye);
    }
    const wings = [];
    for (const sz of [-1, 1]) for (const fx of [0.02, -0.08]) {
      const w = new THREE.Mesh(dfWingGeo, dfWing);
      w.position.set(fx, 0.05, sz * 0.02);
      w.rotation.y = sz > 0 ? -Math.PI / 2 + (fx > 0 ? 0.25 : -0.25) : Math.PI / 2 - (fx > 0 ? 0.25 : -0.25);
      g.add(w);
      wings.push(w);
    }
    g.userData.wings = wings;
    return g;
  }

  // ── 的ひとつを組み立てる ───────────────────────────
  function board(gold) {
    const g = new THREE.Group();
    const face = new THREE.Mesh(boardGeo, [gold ? goldEdge : wood, gold ? goldFace : faceMat, gold ? goldEdge : woodDark]);
    const rim = new THREE.Mesh(rimGeo, gold ? goldEdge : woodDark);
    rim.position.z = 0.07;
    g.add(face, rim);
    g.userData.face = face;
    return g;
  }
  function make(tg) {
    const k = KINDS[tg.kind];
    const root = new THREE.Group(); // 位置(targetPos)
    const body = new THREE.Group(); // 出る・引っこむ動き
    root.add(body);
    const o = { tg, root, body, hit: 0, bees: [], dragonfly: null, rope: null, top: 0, board: null, pad: null, stump: null, halves: null, wob: Math.random() * 6 };
    switch (tg.kind) {
      case 'pad': {
        const pad = new THREE.Group();
        const leaf = new THREE.Mesh(padGeo, padMat);
        leaf.scale.set(0.8, 1, 0.8);
        leaf.rotation.y = Math.random() * 6;
        const vein = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), padDark);
        vein.rotation.x = -Math.PI / 2;
        vein.position.y = 0.045;
        pad.add(leaf, vein);
        pad.position.y = -tg.y + 0.0;
        body.add(pad);
        o.pad = pad;
        const hinge = new THREE.Group(); // 板の足もと(ここを軸に起き上がる)
        hinge.position.y = -tg.y + 0.05;
        const b = board(false);
        b.scale.setScalar(k.r);
        b.position.y = tg.y - 0.05;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, tg.y - k.r * 0.6, 6), wood);
        post.position.y = (tg.y - k.r * 0.6) / 2;
        hinge.add(post, b);
        body.add(hinge);
        o.hinge = hinge;
        o.board = b;
        break;
      }
      case 'stump': {
        const st = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.56, 0.7, 14), stumpMat);
        trunk.position.y = -0.82;
        const top = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), stumpTop);
        top.rotation.x = -Math.PI / 2;
        top.position.y = -0.465;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 14), stumpRing);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.46;
        st.add(trunk, top, ring);
        // 根っこ
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const root2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), stumpMat);
          root2.position.set(Math.cos(a) * 0.5, -1.08, Math.sin(a) * 0.5);
          root2.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
          st.add(root2);
        }
        body.add(st);
        const b = board(false);
        b.scale.setScalar(k.r);
        body.add(b);
        o.board = b;
        o.stump = st;
        break;
      }
      case 'swing': {
        const b = board(false);
        b.scale.setScalar(k.r);
        // つり金具
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 5, 10), woodDark);
        hook.position.y = k.r + 0.05;
        body.add(b, hook);
        o.board = b;
        o.top = k.r + 0.1;
        break;
      }
      case 'gold': {
        const b = board(true);
        b.scale.setScalar(k.r);
        body.add(b);
        o.board = b;
        const df = makeDragonfly();
        df.scale.setScalar(1.9);
        df.position.y = k.r + 0.3;
        // 向きは、動いている向き(左右)へ頭を向ける(毎フレーム sync で)
        // 足(的をつかむ細い線)
        for (const sx of [-0.08, 0.08]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 3), dfEye);
          leg.position.set(0, -0.08, sx);
          df.add(leg);
        }
        body.add(df);
        o.dragonfly = df;
        break;
      }
      case 'hive': {
        const hive = new THREE.Mesh(hiveGeo, hiveMat);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), holeMat);
        hole.position.set(0, -0.2, 0.41);
        const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), woodDark);
        twig.position.y = 0.5;
        body.add(hive, hole, twig);
        for (let i = 0; i < 4; i++) {
          const bee = makeBee();
          body.add(bee);
          o.bees.push({ obj: bee, ph: Math.random() * 6, r: 0.55 + Math.random() * 0.25, out: false });
        }
        o.top = 0.58;
        break;
      }
    }
    if (o.top) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5), rope);
      root.add(r); // 綱からのひもは「出る動き」に合わせて長さを変えるので、root に置く
      o.rope = r;
    }
    scene.add(root);
    return o;
  }

  // ── こわれる演出 ────────────────────────────────
  const bits = []; // { obj, vel, spin, t, life, g, water }
  const chipGeo = new THREE.BoxGeometry(0.08, 0.04, 0.12);
  const sparkGeo = new THREE.OctahedronGeometry(0.07, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  function bit(obj, vel, life, spin = 8, g = 9) {
    scene.add(obj);
    bits.push({ obj, vel, spin: new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin), t: 0, life, g });
  }
  function breakBoard(o, at) {
    const gold = o.tg.kind === 'gold';
    const k = KINDS[o.tg.kind];
    // まっぷたつ: 左右の半分が、うしろ・横へ飛んで回る
    halfGeos.forEach((geo, i) => {
      const m = new THREE.Mesh(geo, [gold ? goldEdge : wood, gold ? goldFace : faceMat, gold ? goldEdge : woodDark]);
      m.scale.setScalar(k.r);
      m.position.copy(at);
      const side = i === 0 ? 1 : -1;
      bit(m, new THREE.Vector3(side * (1.2 + Math.random()), 2.4 + Math.random(), -1.5 - Math.random()), 1.4, 9);
    });
    // 木くず
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(chipGeo, gold ? goldEdge : i % 3 ? wood : faceMat);
      m.position.copy(at);
      bit(m, new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.3) * 3), 0.9, 14);
    }
    if (gold) {
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(sparkGeo, sparkMat);
        m.position.copy(at);
        const a = (i / 16) * Math.PI * 2;
        bit(m, new THREE.Vector3(Math.cos(a) * 3, Math.sin(a) * 3 + 1, 1.5), 0.7, 6, 1);
      }
    }
  }
  function updateBits(dt) {
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.t += dt;
      b.vel.y -= b.g * dt;
      b.obj.position.addScaledVector(b.vel, dt);
      b.obj.rotation.x += b.spin.x * dt;
      b.obj.rotation.y += b.spin.y * dt;
      b.obj.rotation.z += b.spin.z * dt;
      if (b.obj.position.y < 0 && b.vel.y < 0 && !b.water) {
        b.water = true;
        if (b.obj.geometry === halfGeos[0] || b.obj.geometry === halfGeos[1]) splashAt(b.obj.position.x, b.obj.position.z, 5);
      }
      const k = b.t / b.life;
      if (k > 0.7) b.obj.scale.multiplyScalar(0.9);
      if (b.t >= b.life) {
        scene.remove(b.obj);
        bits.splice(i, 1);
      }
    }
  }

  // ── 毎フレーム ─────────────────────────────────
  const objs = new Map(); // id → o
  const tp = { x: 0, d: 0, y: 0 };
  const tmp = new THREE.Vector3();
  let swarm = []; // ハチの巣に当てたとき、飛び出したハチ { obj, t, ph, to }

  function sync(s, me, ox, camera, dt) {
    const now = s.t;
    const seen = new Set();
    for (const tg of s.targets) {
      if (me.hit.has(tg.id) && !objs.has(tg.id)) continue;
      seen.add(tg.id);
      if (!objs.has(tg.id)) {
        const o = make(tg);
        objs.set(tg.id, o);
        // 出てくるときのしぶき・土ぼこり
        targetPos(tg, now, tp);
        if (tg.kind === 'pad') splashAt(ox + tp.x, -tp.d, 6);
        if (tg.kind === 'stump') dust(ox + tp.x, tp.y - 0.9, -tp.d);
        onAppear(tg.kind);
      }
    }
    for (const [id, o] of objs) {
      const tg = o.tg;
      const age = now - tg.born, left = tg.born + tg.life - now;
      targetPos(tg, now, tp);
      o.root.position.set(ox + tp.x, tp.y, -tp.d);
      const inK = clamp01(age / 0.45), outK = clamp01(left / 0.45);
      const t = performance.now() / 1000;
      // もうすぐ引っこむ: 小きざみにゆれる
      const warn = left < 1.1 && o.hit === 0 ? Math.sin(t * 40 + o.wob) * 0.06 * (1 - left / 1.1 + 0.3) : 0;
      o.body.position.set(0, 0, 0);
      o.body.rotation.set(0, 0, 0);
      o.body.scale.setScalar(1);
      switch (tg.kind) {
        case 'pad': {
          // 葉がせり上がる → 板がぱたんと起きる
          const rise = easeOutBack(clamp01(age / 0.3)) * Math.min(1, outK * 1.6);
          o.body.position.y = -0.35 * (1 - rise);
          const up = easeOutBack(clamp01((age - 0.15) / 0.35)) * clamp01((left - 0.1) / 0.35);
          o.hinge.rotation.x = -Math.PI / 2 * (1 - up);
          o.hinge.rotation.z = warn;
          o.pad.rotation.y += dt * 0.15;
          break;
        }
        case 'stump': {
          const rise = easeOutBack(inK) * (1 - (1 - outK) ** 2);
          o.body.position.y = -1.25 * (1 - rise);
          o.body.rotation.z = warn;
          break;
        }
        case 'swing':
        case 'hive': {
          // 綱から降りてきて弾む。引っこむときは引き上げられる
          const drop = easeOutBounce(clamp01(age / 0.6)) * (outK < 1 ? outK ** 2 : 1);
          o.body.position.y = (VINE_Y - tg.y) * (1 - drop);
          const sw = Math.cos(age * 1.9 + tg.ph) * (tg.kind === 'hive' ? 0.12 : 0.22) + warn;
          const shake = o.hit > 0 && tg.kind === 'hive' ? Math.sin(t * 30) * 0.35 * Math.max(0, 1 - o.hit) : 0;
          o.root.rotation.z = sw + shake;
          break;
        }
        case 'gold': {
          // トンボが横から運んでくる / 上へ飛んでいく
          const come = 1 - easeOutBack(clamp01(age / 0.7));
          const go = 1 - outK;
          o.body.position.set(come * 7, go * go * 4 + Math.sin(t * 3) * 0.05, 0);
          o.body.rotation.z = warn + Math.sin(t * 2.3) * 0.08;
          for (const w of o.dragonfly.userData.wings) w.rotation.x = Math.sin(t * 60 + w.position.x * 10) * 0.6;
          // 金の的は左右に動く(rules の targetPos)。動く向きへ頭を向ける。来るときは左へ(右から来る)
          const vx = age < 0.7 ? -1 : Math.cos(age * 0.9 + tg.ph);
          const want = vx >= 0 ? 0 : Math.PI;
          o.dragonfly.rotation.y += (want - o.dragonfly.rotation.y) * Math.min(1, dt * 6);
          break;
        }
      }
      // ハチ: 巣のまわりを回る
      for (const b of o.bees) {
        const a = t * 2.4 + b.ph;
        b.obj.position.set(Math.cos(a) * b.r, Math.sin(a * 1.7) * 0.25 - 0.05, Math.sin(a) * b.r);
        b.obj.rotation.y = -a;
        for (const w of b.obj.userData.wings) w.rotation.y = Math.sin(t * 70 + b.ph) * 0.8;
      }
      // 綱からのひも
      if (o.rope) {
        const topY = o.body.position.y + o.top;
        const len = Math.max(0.01, VINE_Y + 0.2 - tp.y - topY);
        o.rope.scale.set(1, len, 1);
        o.rope.position.y = topY + len / 2;
      }
      // 当たった: 板はもう消えている(割れて飛んだ)。ハチの巣は、ゆれがおさまるまで残る
      if (o.hit > 0) {
        o.hit += dt;
        if (o.board) o.board.visible = false;
        if (o.dragonfly) o.dragonfly.position.y += dt * 3; // 金の的を落としたトンボは、あわてて上へ
      }
      const gone = left <= 0 || (!seen.has(id) && o.hit === 0) || (o.hit > 0 && tg.kind !== 'hive' && o.hit > (o.dragonfly || o.stump || o.pad ? 0.8 : 0.3));
      if (gone) {
        scene.remove(o.root);
        objs.delete(id);
      } else if (o.hit > 0 && tg.kind !== 'hive' && o.hit > 0.3) {
        // 割れたあとの台(切り株・葉・つりひも)は、しずかに引っこむ
        o.body.scale.setScalar(Math.max(0.001, 1 - (o.hit - 0.3) * 2));
        if (o.rope) o.rope.visible = false;
      }
    }
    // 飛び出したハチ: カメラのほうへ飛んできて、ぐるぐるしてから散る
    swarm = swarm.filter((b) => {
      b.t += dt;
      const k = Math.min(1, b.t / 0.8);
      tmp.copy(camera.position).add(b.to);
      b.obj.position.lerp(tmp, Math.min(1, dt * (2 + k * 2)));
      b.obj.position.x += Math.sin(b.t * 9 + b.ph) * dt * 2;
      b.obj.position.y += Math.cos(b.t * 7 + b.ph) * dt * 1.5;
      b.obj.lookAt(camera.position);
      for (const w of b.obj.userData.wings) w.rotation.y = Math.sin(b.t * 80 + b.ph) * 0.8;
      if (b.t > 1.6) b.to.y += dt * 6;
      if (b.t > 2.2) { scene.remove(b.obj); return false; }
      return true;
    });
    updateBits(dt);
  }

  const dustMat = toonMaterial(0x9a7a52);
  function dust(x, y, z) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(chipGeo, dustMat);
      m.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
      bit(m, new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2), 0.6, 10);
    }
  }

  return {
    // 自分の色が決まったら、的の絵を塗りなおす
    setColor(hex) {
      faceMat?.map.dispose();
      faceMat = new THREE.MeshBasicMaterial({ map: faceTexture('#' + hex.toString(16).padStart(6, '0'), false) });
    },
    sync,
    // 当たった(自分のまつぼっくりで)
    hit(id, at) {
      const o = objs.get(id);
      if (!o) return;
      o.hit = 0.001;
      if (o.tg.kind === 'hive') {
        // ハチが飛び出して、こっちへ向かってくる
        for (let i = 0; i < 7; i++) {
          const bee = makeBee();
          bee.position.copy(at);
          bee.scale.setScalar(0.8);
          scene.add(bee);
          swarm.push({ obj: bee, t: 0, ph: Math.random() * 6, to: new THREE.Vector3((Math.random() - 0.5) * 2.2, -0.7 + (Math.random() - 0.5) * 0.9, -3 - Math.random() * 1.5) });
        }
      } else breakBoard(o, at);
    },
    clear() {
      for (const o of objs.values()) scene.remove(o.root);
      objs.clear();
      for (const b of bits.splice(0)) scene.remove(b.obj);
      for (const b of swarm.splice(0)) scene.remove(b.obj);
    },
  };
}
