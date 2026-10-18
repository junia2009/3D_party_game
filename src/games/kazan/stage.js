// 火山の 落ちものよけ の会場「火山の ふもとの 岩場」。
//
// 夕焼けの 空に けむりを 上げる 火山。その ふもとの、ようがんの 海に つきでた まるい 岩の 台が 会場。
// 台の 外がわは かけら(扇形)に われていて、時間が たつと くずれて ようがんへ 落ちる(かけらは buildPieces で 作って 画面がわで 動かす)。
// まわりには ようがんの 中から つきでた とがった 岩、遠くの 黒い 山なみ。
//
// 座標: 台の まん中が 原点、台の 上の 面が y = 0。カメラは +z(手前)の 上から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { makeRand } from '../daruma/trees.js';
import { RULES } from './rules.js';

export const H = 0.9; // 台の あつみ(かけらの 高さ)
export const LAVA_Y = -3.2;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 岩の 上の 面: 黒っぽい 岩に、ひびと 小石
const rockTop = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5a4a44';
  g.fillRect(0, 0, w, h);
  const rand = makeRand(4);
  for (let i = 0; i < 900; i++) {
    const v = 60 + rand() * 50;
    g.fillStyle = `rgba(${v + 20},${v},${v - 6},${0.25 + rand() * 0.4})`;
    g.fillRect(rand() * w, rand() * h, 2 + rand() * 4, 2 + rand() * 4);
  }
  g.strokeStyle = 'rgba(30,20,18,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    let x = rand() * w, y = rand() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * 50; y += (rand() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
});
rockTop.wrapS = rockTop.wrapT = THREE.RepeatWrapping;
const topMat = new THREE.MeshToonMaterial({ map: rockTop, gradientMap: toonGradient });
const sideMat = toonMaterial(0x3e322e);
// 上の 面の UV: 世界の x, z を そのまま
const topUV = {
  generateTopUV(geometry, vertices, a, b, c) {
    return [a, b, c].map((i) => new THREE.Vector2(vertices[i * 3] / 4, vertices[i * 3 + 1] / 4));
  },
  generateSideWallUV(geometry, vertices, a, b, c, d) {
    return [a, b, c, d].map((i) => new THREE.Vector2(vertices[i * 3] * 0.5, vertices[i * 3 + 2]));
  },
};

// ようがん: 赤から 黄色の まだらを ゆっくり 流す
function lavaTexture() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d8401a';
    g.fillRect(0, 0, w, h);
    const rand = makeRand(8);
    // はしを またぐ 模様は 反対がわにも 描いて、つなぎめを なくす
    const wrap = (x, y, r, draw) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) if (x + ox > -r && x + ox < w + r && y + oy > -r && y + oy < h + r) draw(x + ox, y + oy); };
    for (let i = 0; i < 90; i++) {
      const x = rand() * w, y = rand() * h, r = 8 + rand() * 30;
      const c0 = rand() < 0.5 ? 'rgba(255,220,90,0.9)' : 'rgba(255,150,40,0.8)';
      wrap(x, y, r, (px, py) => {
        const grd = g.createRadialGradient(px, py, 0, px, py, r);
        grd.addColorStop(0, c0);
        grd.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      });
    }
    g.fillStyle = 'rgba(80,20,10,0.5)';
    for (let i = 0; i < 40; i++) {
      const x = rand() * w, y = rand() * h, rx = 6 + rand() * 18, ry = 3 + rand() * 8, rot = rand() * 3;
      wrap(x, y, rx, (px, py) => { g.beginPath(); g.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); g.fill(); });
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  return t;
}

function buildVolcano(g) {
  // 遠くの 大きな 火山: 黒い 山はだに ようがんの すじ、てっぺんは 赤く 光る
  const mat = toonMaterial(0x3a2c2a);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(9, 42, 34, 24, 1, true), mat);
  cone.position.set(-8, 17 - 2, -70);
  g.add(cone);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
  crater.position.set(-8, 32, -70);
  g.add(crater);
  const glow = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  const rand = makeRand(12);
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.35 + (rand() - 0.5) * 0.1;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const r = 9 + u * 26, y = 32 - u * 26;
      pts.push(new THREE.Vector3(-8 + Math.sin(a + Math.sin(u * 5 + i) * 0.05) * r, y, -70 + Math.cos(a + Math.sin(u * 5 + i) * 0.05) * r));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.6 - i * 0.04, 5), glow));
  }
  // 遠くの 山なみ
  const far = toonMaterial(0x4a3634);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(10 + rand() * 10, 10 + rand() * 12, 6), far);
    m.position.set(-90 + i * 22 + rand() * 6, 2, -95 - rand() * 20);
    g.add(m);
  }
}

// ようがんから つきでた とがった 岩
function buildSpires(g) {
  const mat = toonMaterial(0x2e2422);
  const rand = makeRand(21);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = 8 + rand() * 22;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 4;
    if (z > -6 && Math.abs(x) < 12) continue; // カメラと 台の あいだ・台の まわりは あける
    const h = 2 + rand() * 6;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.8 + rand() * 1.4, h, 5), mat);
    m.position.set(x, LAVA_Y + h / 2 - 0.3, z);
    m.rotation.set((rand() - 0.5) * 0.2, rand() * 6, (rand() - 0.5) * 0.2);
    g.add(m);
  }
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildVolcano(g);
  buildSpires(g);
  // 台の まん中(くずれない)と、台を ささえる 太い 岩の 柱
  const coreGeo = new THREE.CylinderGeometry(RULES.core + 0.01, RULES.core + 0.01, H, 32);
  const core = new THREE.Mesh(coreGeo, [sideMat, topMat, sideMat]);
  core.position.y = -H / 2;
  core.receiveShadow = true;
  g.add(core);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(RULES.core, 1.2, -LAVA_Y, 16), sideMat);
  pillar.position.y = -H + LAVA_Y / 2 + 0.2;
  g.add(pillar);
  mergeStatic(g);
  scene.add(g);
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lavaTexture() }));
  lava.position.y = LAVA_Y;
  scene.add(lava);
  return { group: g, lava, coreTop: core };
}

// くずれる かけら(扇形の 柱)
export function buildPieces(s, parent) {
  return s.pieces.map((p) => {
    const sh = new THREE.Shape();
    const gap = 0.02;
    sh.absarc(0, 0, p.outer, p.a0 + gap / p.outer, p.a1 - gap / p.outer, false);
    sh.absarc(0, 0, p.inner + 0.01, p.a1 - gap / p.inner, p.a0 + gap / p.inner, true);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false, curveSegments: 8, UVGenerator: topUV });
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, [topMat, sideMat]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { piece: p, mid: (p.a0 + p.a1) / 2, fall: null };
    parent.add(mesh);
    return mesh;
  });
}
