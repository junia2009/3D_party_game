// 夕ぐれの 森の 広場の おにごっこ の 会場(見た目だけ)。
//
// 夕日の 森の 中の 丸い 原っぱ。まん中に 大きな 切り株(鬼の スタート)。
// 木・切り株は とおれない。草むらは かくれられる(低い やぶ。頭が すこし 見える)。
// ふちは 丸太の さくと ちょうちんの 列。外がわは 森の 木と 遠くの 山の かげ。
// 木の 葉っぱは、うしろに だれか いると うすく なる(上から 見る カメラで かくれない ように)。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { BUSHES, RULES, STUMPS, TREES } from './rules.js';

export const FLOOR_Y = 0;

const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// やわらかい 光の まる(ちょうちん・ほたる・金の どんぐり)
export const glowTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
});

// 原っぱ: 草の 緑に、ふまれて 土が 見える 道(まん中の 切り株の まわりと、ふちに そって)
function meadowTexture() {
  return canvasTex(512, 512, (c, w) => {
    c.fillStyle = '#7fb04a';
    c.fillRect(0, 0, w, w);
    const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    // 草の むら
    for (let i = 0; i < 900; i++) {
      c.fillStyle = ['#8cbc52', '#74a443', '#93c45a', '#6c9a3e'][i % 4];
      c.globalAlpha = 0.5;
      c.beginPath();
      c.arc(rnd() * w, rnd() * w, 3 + rnd() * 9, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    // ふまれた 土の 輪
    const ring = (r, wd) => {
      c.strokeStyle = 'rgba(176,138,86,.55)';
      c.lineWidth = wd;
      c.beginPath();
      c.arc(w / 2, w / 2, r, 0, Math.PI * 2);
      c.stroke();
    };
    ring(w * 0.12, 26);
    ring(w * 0.37, 18);
    // 小さな 花
    for (let i = 0; i < 160; i++) {
      c.fillStyle = ['#fff6d8', '#ffd0e0', '#ffe27a', '#d8c8ff'][i % 4];
      c.beginPath();
      c.arc(rnd() * w, rnd() * w, 2.2, 0, Math.PI * 2);
      c.fill();
    }
  });
}
// 切り株の 上: 年輪
function ringsTexture() {
  return canvasTex(128, 128, (c, w) => {
    c.fillStyle = '#e8c48a';
    c.fillRect(0, 0, w, w);
    for (let r = 6; r < w / 2; r += 6) {
      c.strokeStyle = r % 12 ? '#c99a5e' : '#b8864a';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(w / 2 + Math.sin(r) * 1.5, w / 2, r, 0, Math.PI * 2);
      c.stroke();
    }
  });
}

const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

export function buildStage(scene) {
  const g = new THREE.Group();
  const mat = (c) => toonMaterial(c);
  const R = RULES.fieldR;

  // 地面: 遠くの 森の 床と、広場の 原っぱ
  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48).rotateX(-Math.PI / 2), mat(0x4e7a36));
  ground.receiveShadow = true;
  g.add(ground);
  const meadow = new THREE.Mesh(new THREE.CircleGeometry(R + 0.6, 64).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: meadowTexture(), gradientMap: toonGradient }));
  meadow.position.y = 0.01;
  meadow.receiveShadow = true;
  g.add(meadow);

  // ふち: 丸太の さく(手前は ひくく)と、くいの 上の ちょうちん
  const POSTS = 28;
  const postGeo = new THREE.CylinderGeometry(0.13, 0.15, 1, 7);
  const lanterns = [];
  for (let i = 0; i < POSTS; i++) {
    const a = (i / POSTS) * Math.PI * 2;
    const x = Math.sin(a) * (R + 0.35), z = Math.cos(a) * (R + 0.35);
    const front = z > R * 0.55;
    const h = front ? 0.45 : 0.9;
    const p = at(new THREE.Mesh(postGeo, mat(0x8a5a32)), x, h / 2, z);
    p.scale.y = h;
    p.castShadow = true;
    g.add(p);
    // よこの 丸太(つぎの くいまで)
    const a2 = ((i + 1) / POSTS) * Math.PI * 2;
    const x2 = Math.sin(a2) * (R + 0.35), z2 = Math.cos(a2) * (R + 0.35);
    const len = Math.hypot(x2 - x, z2 - z);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6), mat(0xa06a3a));
    rail.position.set((x + x2) / 2, h * 0.7, (z + z2) / 2);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x2 - x, 0, z2 - z).normalize());
    g.add(rail);
    // ちょうちん: うしろ半分の くいの 上に 1つおき
    if (!front && i % 2 === 0) {
      const lp = at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), mat(0x5a3a22)), x, 1.35, z);
      g.add(lp);
      const lan = at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: [0xffb04a, 0xff7a5a, 0xffd86a][i % 3] })), x, 1.85, z);
      lan.scale.y = 1.25;
      lan.userData.noMerge = true;
      g.add(lan);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb860, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(x, 1.85, z);
      glow.scale.setScalar(1.6);
      g.add(glow);
      lanterns.push({ lan, glow, ph: i * 0.7 });
    }
  }

  // 広場の 木: 太い みき + 丸い 葉っぱ(夕日で だいだい色が まじる)。葉っぱは あとで うすく できる ように 別に もつ
  const canopies = [];
  const leafCols = [0x5f9a3a, 0x77a83e, 0xc8a03a, 0x6a9a44];
  TREES.forEach((t, i) => {
    const trunk = at(new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.62, t.r * 0.85, 2.6, 9), mat(0x7a4e2c)), t.x, 1.3, t.z);
    trunk.castShadow = true;
    g.add(trunk);
    // 根っこ
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + i;
      const root = at(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 5), mat(0x6e4426)), t.x + Math.cos(a) * t.r * 0.75, 0.12, t.z + Math.sin(a) * t.r * 0.75);
      root.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      g.add(root);
    }
    const crown = new THREE.Group();
    crown.position.set(t.x, 0, t.z);
    const leaf = new THREE.MeshToonMaterial({ color: leafCols[i % leafCols.length], gradientMap: toonGradient, transparent: true, opacity: 1 });
    leaf.userData.base = leafCols[i % leafCols.length];
    for (const [dx, dy, dz, s] of [[0, 3.4, 0, 1.35], [0.75, 3.0, 0.2, 0.9], [-0.75, 3.1, -0.2, 0.95], [0.1, 4.0, -0.3, 0.85]]) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(t.r * 1.15 * s, 1), leaf);
      m.position.set(dx * t.r, dy, dz * t.r);
      m.castShadow = true;
      crown.add(m);
    }
    crown.userData.noMerge = true;
    scene.add(crown);
    canopies.push({ crown, leaf, t, fade: 1 });
  });

  // 切り株: まん中の 大きいのと 小さいの
  const ringsMat = new THREE.MeshToonMaterial({ map: ringsTexture(), gradientMap: toonGradient });
  STUMPS.forEach((s, i) => {
    const h = i === 0 ? 0.75 : 0.45;
    const body = at(new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.95, s.r * 1.08, h, 14, 1, true), mat(0x8a5a32)), s.x, h / 2, s.z);
    body.castShadow = true;
    g.add(body);
    const top = at(new THREE.Mesh(new THREE.CircleGeometry(s.r * 0.95, 20).rotateX(-Math.PI / 2), ringsMat), s.x, h + 0.005, s.z);
    g.add(top);
    if (i === 0) {
      // 鬼の スタートの しるし: 切り株の 上に 小さな 旗
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), mat(0x5a3a22)), s.x + 0.5, h + 0.55, s.z - 0.3));
      const flag = at(new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.38), new THREE.MeshToonMaterial({ color: 0xe8402f, gradientMap: toonGradient, side: THREE.DoubleSide })), s.x + 0.78, h + 0.92, s.z - 0.3);
      g.add(flag);
      // きのこ
      for (const [dx, dz] of [[-1.1, 0.5], [-0.9, 0.85], [0.95, 0.75]]) {
        g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 6), mat(0xfff0d8)), s.x + dx, 0.11, s.z + dz));
        const cap = at(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe8503a)), s.x + dx, 0.2, s.z + dz);
        g.add(cap);
      }
    }
  });

  // 草むら: 低い やぶ(丸い 葉の かたまり + 花)
  const bushes = [];
  BUSHES.forEach((b, i) => {
    const grp = new THREE.Group();
    grp.position.set(b.x, 0, b.z);
    const n = 9;
    const bm = new THREE.MeshToonMaterial({ color: i % 2 ? 0x4f8a34 : 0x5a9a3c, gradientMap: toonGradient });
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i, rr = k === 0 ? 0 : b.r * (0.45 + (k % 3) * 0.17);
      const s = 0.55 + ((k * 37) % 10) / 30;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), bm);
      m.position.set(Math.cos(a) * rr, 0.35 + ((k * 13) % 5) / 25, Math.sin(a) * rr);
      m.scale.y = 0.75;
      m.castShadow = true;
      grp.add(m);
    }
    for (let k = 0; k < 7; k++) {
      const a = k * 2.1 + i, rr = b.r * 0.5 * ((k % 3) / 2 + 0.4);
      grp.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat([0xffd0e0, 0xfff6d8, 0xffe27a][k % 3])), Math.cos(a) * rr, 0.85, Math.sin(a) * rr));
    }
    grp.userData.noMerge = true;
    scene.add(grp);
    bushes.push({ grp, b, wob: 0 });
  });

  // 外がわの 森: 大きな 木の かげ(ふちの 外に ぐるっと)。手前は 低い しげみだけ
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + 0.05;
    const d = R + 3.2 + ((i * 7) % 5) * 0.9;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (z > R * 0.4) {
      g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + (i % 3) * 0.3, 1), mat(0x3e6a2c)), x, 0.5, z));
      continue;
    }
    const h = 5 + (i % 4) * 1.4;
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 7), mat(0x5a3a22)), x, h / 2, z));
    const col = [0x3e6a2c, 0x4f7a32, 0x9a6a2a, 0x5a7a30][i % 4];
    const c = at(new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + (i % 3) * 0.5, 1), mat(col)), x, h + 0.8, z);
    g.add(c);
  }
  // 遠くの 山の かげ
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + i * 0.4;
    const m = at(new THREE.Mesh(new THREE.ConeGeometry(9 + (i % 3) * 3, 9 + (i % 2) * 5, 6), new THREE.MeshBasicMaterial({ color: 0x8a6a8a })), Math.sin(a) * 52, 3, -Math.cos(a) * 52);
    g.add(m);
  }

  mergeStatic(g);
  scene.add(g);

  return {
    group: g,
    canopies,
    bushes,
    // t: 時間、runners: [{ x, z }]
    update(t, runners, dt) {
      for (const l of lanterns) {
        const k = 0.75 + Math.sin(t * 2.3 + l.ph) * 0.12 + Math.sin(t * 7.1 + l.ph) * 0.05;
        l.glow.material.opacity = k;
        l.lan.position.y = 1.85 + Math.sin(t * 1.6 + l.ph) * 0.04;
      }
      // 木の うしろ(カメラから 見て 奥)に だれか いると、葉っぱを うすく
      for (const c of canopies) {
        const behind = runners.some((r) => Math.abs(r.x - c.t.x) < c.t.r * 2 && r.z < c.t.z + 0.4 && r.z > c.t.z - 4.2);
        c.fade += ((behind ? 0.4 : 1) - c.fade) * Math.min(1, dt * 6);
        c.leaf.opacity = c.fade;
        c.leaf.depthWrite = c.fade > 0.95;
        c.crown.rotation.y = Math.sin(t * 0.6 + c.t.x) * 0.03;
      }
      // 草むら: だれかが 入って いると ゆれる
      for (const b of bushes) {
        const inside = runners.some((r) => Math.hypot(r.x - b.b.x, r.z - b.b.z) < b.b.r);
        b.wob = Math.max(0, b.wob - dt * 2) + (inside ? dt * 3 : 0);
        b.wob = Math.min(1, b.wob);
        b.grp.rotation.z = Math.sin(t * 9) * 0.04 * b.wob;
        b.grp.scale.setScalar(1 + Math.sin(t * 7) * 0.02 * b.wob);
      }
    },
  };
}
