// 森の学校の けしごむ大戦 の 会場(見た目だけ)。
//
// どんぐりの 森の 教室。大きな 木の つくえの 上が たたかいの ばしょ。つくえの 天板は 小さな 板の
// ならびで できて いて、せまく なると はしから ぽろぽろ くずれて おちる。
// まわりは 教室の ゆか・黒板・まど(そとは 森)・ほかの つくえ。
//
// 座標: ルールの (x, y) → 世界の (x, DESK_Y, -y)。カメラは 上から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { RULES, SHAPES } from './rules.js';

export const DESK_Y = 0.9; // 天板の 上の 高さ
export const FLOOR_Y = -6; // 教室の ゆか
const TILE = 0.5; // 天板の 板 1まい
const toWorld = (x, y, out = new THREE.Vector3()) => out.set(x, DESK_Y, -y);
export { toWorld };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const glowTex = canvasTex(64, 64, (g) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
});

// けしごむ: かたちごとに 白っぽい ゴムの からだと、プレイヤーの 色の 紙の スリーブ
const H = 0.5; // けしごむの あつさ
function roundedBox(w, d, h, r) {
  const sh = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  sh.moveTo(x + r, y);
  sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + d - r); sh.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  sh.lineTo(x + r, y + d); sh.quadraticCurveTo(x, y + d, x, y + d - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.04, 0);
  return g;
}
export function eraserMesh(kind, color) {
  const g = new THREE.Group();
  const rubber = new THREE.MeshToonMaterial({ color: 0xfafaf2, gradientMap: toonGradient });
  const sleeve = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });
  const sh = SHAPES[kind];
  // ルールの (x, y) → けしごむの 中の (x, -z)
  if (kind === 'kaku' || kind === 'naga') {
    const xs = sh.circles.map((c) => c[0]), ys = sh.circles.map((c) => c[1]), r = sh.circles[0][2];
    const w = Math.max(...xs) - Math.min(...xs) + r * 2, d = Math.max(...ys) - Math.min(...ys) + r * 2;
    g.add(new THREE.Mesh(roundedBox(w, d, H, 0.18), rubber));
    // スリーブ(まん中に 上から ぐるっと まく。上から 見ても 色が わかる)
    const sl = new THREE.Mesh(new THREE.BoxGeometry(w * (kind === 'naga' ? 0.5 : 0.56), H + 0.03, d + 0.03), sleeve);
    sl.position.y = H / 2 + 0.005;
    g.add(sl);
  } else if (kind === 'maru') {
    const r = sh.circles[0][2];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 28), rubber);
    body.position.y = H / 2;
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.02, r + 0.02, H * 0.45, 28, 1, true), sleeve);
    sl.material.side = THREE.DoubleSide;
    sl.position.y = H / 2;
    // 上の シール(プレイヤーの 色)
    const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.5, 24).rotateX(-Math.PI / 2), sleeve);
    top.position.y = H + 0.005;
    g.add(body, sl, top);
  } else {
    // どんぐり: 大きい まる(み)と 小さい まる(ぼうし)
    const [[x0, y0, r0], [x1, y1, r1]] = sh.circles;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, H, 24), new THREE.MeshToonMaterial({ color: 0xf4e2c0, gradientMap: toonGradient }));
    body.position.set(x0, H / 2, -y0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r1, r1, H * 1.05, 20), new THREE.MeshToonMaterial({ color: 0x9a6a3a, gradientMap: toonGradient }));
    cap.position.set(x1, H * 0.52, -y1);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.02, r0 + 0.02, H * 0.45, 24, 1, true), sleeve);
    sl.material.side = THREE.DoubleSide;
    sl.position.set(x0, H / 2, -y0);
    const top = new THREE.Mesh(new THREE.CircleGeometry(r0 * 0.5, 24).rotateX(-Math.PI / 2), sleeve);
    top.position.set(x0, H + 0.005, -y0);
    g.add(body, cap, sl, top);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { sleeve };
  return g;
}
export const ERASER_H = H;

// つくえ ぜんたいの 絵: 木目・えんぴつの らくがき・けしごむの かす・ほった 名前・まるい コップの あと
function deskTex(W, D) {
  return canvasTex(1024, Math.round(1024 * D / W), (c, w, h) => {
    // 木目(よこに ながい 板が 4まい)
    const planks = 4;
    for (let i = 0; i < planks; i++) {
      c.fillStyle = ['#efc98e', '#e8c084', '#f2cf96', '#ebc38a'][i];
      c.fillRect(0, (i * h) / planks, w, h / planks);
      for (let k = 0; k < 14; k++) {
        c.strokeStyle = `rgba(150,95,45,${0.08 + (k % 4) * 0.035})`;
        c.lineWidth = 1 + (k % 3);
        c.beginPath();
        const y0 = (i + (k + 0.5) / 14) * h / planks;
        c.moveTo(0, y0);
        for (let x = 0; x <= w; x += 24) c.lineTo(x, y0 + Math.sin(x * 0.012 + k * 1.7 + i) * 4);
        c.stroke();
      }
      // ふし
      c.strokeStyle = 'rgba(120,70,30,.35)'; c.lineWidth = 2;
      for (let r = 4; r < 22; r += 5) { c.beginPath(); c.ellipse(((i * 337 + 180) % w), (i + 0.5) * h / planks, r * 1.8, r * 0.6, 0, 0, 7); c.stroke(); }
      c.fillStyle = 'rgba(90,50,20,.35)'; c.fillRect(0, ((i + 1) * h) / planks - 2, w, 3);
    }
    // えんぴつの らくがき
    c.strokeStyle = 'rgba(70,70,80,.55)'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
    const pen = (f) => { c.beginPath(); f(); c.stroke(); };
    // どんぐり
    pen(() => { c.ellipse(170, 150, 38, 48, 0, 0, Math.PI * 2); });
    pen(() => { c.moveTo(128, 128); c.quadraticCurveTo(170, 80, 212, 128); c.lineTo(128, 128); c.moveTo(170, 96); c.lineTo(172, 76); });
    // ほし
    pen(() => { for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 0.8; const fn = k ? 'lineTo' : 'moveTo'; c[fn](860 + Math.cos(a) * 46, 560 + Math.sin(a) * 46); } });
    // にこにこ
    pen(() => { c.arc(790, 150, 40, 0, Math.PI * 2); });
    pen(() => { c.arc(790, 158, 22, 0.2, Math.PI - 0.2); });
    c.fillStyle = 'rgba(70,70,80,.55)'; c.beginPath(); c.arc(776, 138, 5, 0, 7); c.arc(804, 138, 5, 0, 7); c.fill();
    // あいあいがさ(なまえ なし)
    pen(() => { c.moveTo(160, 600); c.lineTo(160, 500); c.moveTo(110, 520); c.quadraticCurveTo(160, 460, 210, 520); c.lineTo(110, 520); });
    // ぐるぐる と 矢じるし
    pen(() => { for (let a = 0; a < 14; a += 0.2) c.lineTo(540 + Math.cos(a) * a * 3.2, 620 + Math.sin(a) * a * 3.2); });
    // ほって ある 名前「どんぐり ぐみ」
    c.font = 'bold 44px sans-serif'; c.fillStyle = 'rgba(120,70,30,.35)'; c.save(); c.translate(560, 120); c.rotate(-0.08); c.fillText('どんぐり ぐみ', 0, 0); c.restore();
    // コップの あと
    c.strokeStyle = 'rgba(140,90,50,.25)'; c.lineWidth = 6; c.beginPath(); c.arc(380, 420, 46, 0.3, Math.PI * 1.8); c.stroke();
    // けしごむの かす
    c.fillStyle = 'rgba(250,250,240,.8)';
    for (let k = 0; k < 40; k++) { const x = (k * 197) % w, y = (k * 113) % h; c.beginPath(); c.ellipse(x, y, 5, 2.5, k, 0, 7); c.fill(); }
  });
}

export function buildStage(scene) {
  const group = new THREE.Group();
  const [W, D] = RULES.desk;
  // ゆか(教室の 板の ま)
  const floorTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#6a7a8a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#62727f' : '#71818f'; c.fillRect(0, i * 32, w, 31); }
    c.fillStyle = 'rgba(60,30,10,.25)'; for (let i = 0; i < 8; i++) c.fillRect(0, i * 32 + 31, w, 1);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(8, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: floorTex, gradientMap: toonGradient }));
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  floor.userData.noMerge = true;
  group.add(floor);
  // つくえの あし と わく(天板の 下)
  const legMat = toonMaterial(0x7a4e2e);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), legMat);
    leg.position.set(sx * (W / 2 - 0.6), DESK_Y - 3.3, sz * (D / 2 - 0.6));
    group.add(leg);
  }
  // 天板の まわりの こい ふち(わくだけ。中は 板が くずれると あなに なる)
  const rimMat = toonMaterial(0x6a4024);
  for (const [w, d, x, z] of [[W + 0.5, 0.25, 0, D / 2 + 0.125], [W + 0.5, 0.25, 0, -D / 2 - 0.125], [0.25, D, W / 2 + 0.125, 0], [0.25, D, -W / 2 - 0.125, 0]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.46, d), rimMat);
    r.position.set(x, DESK_Y - 0.2, z);
    group.add(r);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.5, D - 1.2), toonMaterial(0x8a5a32));
  frame.position.y = DESK_Y - 0.6;
  group.add(frame);
  // まわりの 教室(黒板・まど・ほかの つくえ)
  const board = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 0.3), toonMaterial(0x2f5a3e));
  board.position.set(0, 2, -16);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(18.8, 6.8, 0.2), toonMaterial(0x8a5a32));
  boardFrame.position.set(0, 2, -16.2);
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h);
    c.fillStyle = '#f4f4e8'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('けしごむ たいかい', w / 2, h / 2);
  }), transparent: true }));
  chalk.position.set(0, 2.6, -15.8);
  chalk.userData.noMerge = true;
  group.add(board, boardFrame, chalk);
  for (const [x, z] of [[-14, -6], [14, -6], [-14, 8], [14, 8], [0, 14]]) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 4), toonMaterial(0xc89a62));
    top.position.set(x, DESK_Y - 1.4, z);
    group.add(top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), legMat);
      leg.position.set(x + sx * 2.6, DESK_Y - 4, z + sz * 1.6);
      group.add(leg);
    }
  }
  // まわりの つくえの 上の もの(ふでばこ・ノート・えんぴつ・おべんとう)と いす・ランドセル
  const deskTopY = DESK_Y - 1.2;
  const things = [[-14, -6], [14, -6], [-14, 8], [14, 8], [0, 14]];
  const pastel = [0x7ac8ff, 0xff9ab8, 0xffd25a, 0x8ad08a, 0xc8a0ff];
  things.forEach(([x, z], k) => {
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.8), toonMaterial(pastel[k]));
    caseM.position.set(x - 1, deskTopY + 0.2, z - 0.8);
    caseM.rotation.y = 0.2 * (k % 2 ? 1 : -1);
    const note = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 2.6), toonMaterial(pastel[(k + 2) % 5]));
    note.position.set(x + 1.3, deskTopY + 0.06, z + 0.4);
    note.rotation.y = -0.15;
    const page = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.13, 2.45), toonMaterial(0xfaf6ea));
    page.position.set(x + 1.32, deskTopY + 0.07, z + 0.4);
    page.rotation.y = -0.15;
    group.add(caseM, note, page);
    // えんぴつ(6かくの 木と しん)
    for (let j = 0; j < 2; j++) {
      const pc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6).rotateZ(Math.PI / 2), toonMaterial([0x3a9a5a, 0xe8402f][j]));
      pc.position.set(x - 0.6 + j * 0.3, deskTopY + 0.1, z + 1.2 + j * 0.3);
      pc.rotation.y = 0.5 + j * 0.3;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6).rotateZ(-Math.PI / 2), toonMaterial(0xe8c890));
      tip.position.set(pc.position.x + Math.cos(-pc.rotation.y) * 1.27, pc.position.y, pc.position.z + Math.sin(-pc.rotation.y) * 1.27);
      tip.rotation.y = pc.rotation.y;
      group.add(pc, tip);
    }
    if (k % 2 === 0) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1), toonMaterial(0xff8a5a));
      box.position.set(x + 2, deskTopY + 0.25, z - 1.2);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 1.05), toonMaterial(0xfff2dc));
      lid.position.set(x + 2, deskTopY + 0.52, z - 1.2);
      group.add(box, lid);
    }
    // いす(せもたれ つき)
    const chairX = x + (Math.abs(x) > 1 ? 0 : 0), chairZ = z + 3.2 * (z > 0 ? 1 : 1);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 2.4), toonMaterial(0xc89a62));
    seat.position.set(chairX, DESK_Y - 3.4, chairZ);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.3), toonMaterial(0xc89a62));
    back.position.set(chairX, DESK_Y - 2.3, chairZ + 1.2);
    group.add(seat, back);
    // ランドセル(つくえの よこに かかる)
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 1.3), toonMaterial([0xd8402f, 0x3a6ad8, 0x8a5aa8, 0xd8402f, 0x3a8a5a][k]));
    bag.position.set(x + (x >= 0 ? -3.4 : 3.4), DESK_Y - 2.6, z);
    group.add(bag);
  });
  // 本だなと 植木ばち(おくの かべ ぎわ)
  for (const sx of [-1, 1]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 1.6), toonMaterial(0x9a6a3a));
    shelf.position.set(sx * 13, -3.5, -14.5);
    group.add(shelf);
    for (let k = 0; k < 9; k++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4 + (k % 3) * 0.2, 1.2), toonMaterial(pastel[k % 5]));
      book.position.set(sx * 13 - 2.4 + k * 0.6, -2.0 + ((k % 3) * 0.1), -14.1);
      group.add(book);
    }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 1, 10), toonMaterial(0xc8643a));
    pot.position.set(sx * 13 + 1.8, -0.5, -14.5);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), toonMaterial(0x4f9a4a));
    plant.position.set(sx * 13 + 1.8, 0.7, -14.5);
    group.add(pot, plant);
  }
  // 黒板の チョークの 絵・とけい・はりがみ
  const chalkArt = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(512, 160, (c, w, h) => {
    c.strokeStyle = '#f4f4e8'; c.lineWidth = 3; c.lineCap = 'round';
    // どんぐり 2つ と ほし
    for (const [x, y] of [[60, 110], [450, 100]]) { c.beginPath(); c.ellipse(x, y, 20, 26, 0, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - 24, y - 10); c.quadraticCurveTo(x, y - 40, x + 24, y - 10); c.closePath(); c.stroke(); }
    c.strokeStyle = '#ffd24a';
    c.beginPath(); for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 0.8; c[k ? 'lineTo' : 'moveTo'](120 + Math.cos(a) * 18, 40 + Math.sin(a) * 18); } c.stroke();
    c.strokeStyle = '#ff9ab8'; c.beginPath(); c.moveTo(380, 150); c.lineTo(500, 150); c.stroke();
    c.fillStyle = '#f4f4e8'; c.font = 'bold 18px sans-serif'; c.fillText('こくばん とうばん: ケロスケ', 330, 30);
  }) }));
  chalkArt.position.set(0, 2, -15.78);
  chalkArt.userData.noMerge = true;
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0xfffaf0 }));
  clockFace.position.set(11.5, 6.3, -15.8);
  const clockRim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 24), toonMaterial(0x8a5a32));
  clockRim.position.copy(clockFace.position);
  group.add(chalkArt, clockFace, clockRim);
  for (const [x, col] of [[-12, 0xffe08a], [-9.4, 0xc8f0ff]]) {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.6), new THREE.MeshBasicMaterial({ color: col }));
    paper.position.set(x, 6.2, -15.7);
    paper.rotation.z = x < -10 ? 0.06 : -0.05;
    group.add(paper);
  }
  // まど(そとは 森の みどり)
  for (const z of [-9, -2, 5]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshBasicMaterial({ color: 0x9fd28a }));
    win.position.set(-19.8, 2, z);
    win.rotation.y = Math.PI / 2;
    const wf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 6.6), toonMaterial(0xf2e6d0));
    wf.position.set(-20, 2, z);
    group.add(wf, win);
  }
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);

  // 天板: 小さな 板の ならび(せまく なると はしから くずれて おちる)
  const nx = Math.round(W / TILE), nz = Math.round(D / TILE);
  const tileMat = new THREE.MeshToonMaterial({ map: deskTex(W, D), gradientMap: toonGradient });
  // 板ごとに、つくえ ぜんたいの 絵の その 場所を はる(くずれた 板は らくがきの かけらごと おちる)
  tileMat.onBeforeCompile = (sh) => {
    sh.uniforms.uDesk = { value: new THREE.Vector2(W, D) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uDesk;\nattribute vec2 aHome;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vec2((aHome.x + position.x) / uDesk.x + 0.5, (aHome.y - position.z) / uDesk.y + 0.5);');
  };
  const tileGeo = new THREE.BoxGeometry(TILE * 0.98, 0.4, TILE * 0.98);
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, nx * nz);
  const home = new Float32Array(nx * nz * 2);
  tiles.receiveShadow = true;
  const tileInfo = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = -W / 2 + (i + 0.5) * TILE, y = -D / 2 + (j + 0.5) * TILE;
    const k = tileInfo.length;
    tileInfo.push({ x, y, fall: -1, spin: (Math.random() - 0.5) * 6, warn: 0 });
    home[k * 2] = x; home[k * 2 + 1] = y;
    dummy.position.set(x, DESK_Y - 0.2, -y);
    dummy.updateMatrix();
    tiles.setMatrixAt(k, dummy.matrix);
    col.setHex(((i + j) % 2) ? 0xffffff : 0xf2e6d6);
    tiles.setColorAt(k, col);
  }
  tileGeo.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 2));
  scene.add(tiles);
  // ふちの 線(いまの つくえの はし。くずれる まえに 赤く 光る)
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0 }));
  edge.position.y = DESK_Y + 0.01;
  scene.add(edge);

  // 天板を いまの 大きさに あわせる(はみ出た 板は くずれて おちる)。もうすぐ くずれる 板は 赤っぽく
  const BASE = new THREE.Color(0xffffff), WARN = new THREE.Color(0xff8a6a);
  function updateDesk(half, nextHalf, dt, t) {
    const dropped = [];
    tileInfo.forEach((d, k) => {
      const outside = Math.abs(d.x) > half[0] || Math.abs(d.y) > half[1];
      if (outside && d.fall < 0) { d.fall = 0; dropped.push(d); }
      const soon = !outside && (Math.abs(d.x) > nextHalf[0] || Math.abs(d.y) > nextHalf[1]);
      if (d.fall >= 0) {
        d.fall += dt;
        if (d.fall > 3) return;
        const f = d.fall;
        dummy.position.set(d.x, DESK_Y - 0.2 - f * f * 6, -d.y);
        dummy.rotation.set(f * d.spin, 0, f * d.spin * 0.6);
        dummy.scale.setScalar(f > 2.5 ? Math.max(0.01, 1 - (f - 2.5) * 2) : 1);
        dummy.updateMatrix();
        tiles.setMatrixAt(k, dummy.matrix);
      } else if (soon !== d.warn) {
        d.warn = soon;
      }
      if (d.fall < 0) {
        const blink = d.warn ? 0.5 + 0.5 * Math.sin(t * 10) : 0;
        col.copy(BASE).lerp(WARN, blink * 0.8);
        tiles.setColorAt(k, col);
      }
    });
    tiles.instanceMatrix.needsUpdate = true;
    tiles.instanceColor.needsUpdate = true;
    edge.scale.set(half[0] * 2, 1, half[1] * 2);
    edge.material.opacity = half[0] < W / 2 - 0.01 ? 0.5 + Math.sin(t * 6) * 0.3 : 0;
    return dropped;
  }
  function reset() {
    tileInfo.forEach((d, k) => {
      d.fall = -1; d.warn = false;
      dummy.position.set(d.x, DESK_Y - 0.2, -d.y);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      tiles.setMatrixAt(k, dummy.matrix);
    });
    tiles.instanceMatrix.needsUpdate = true;
  }
  // まどからの ひだまり(つくえと ゆかの 上の 光の 四角)と、光の 中を ただよう ちり
  const sunTex = canvasTex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(32, 32, 4, 32, 32, 34);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.7, 'rgba(255,240,200,.6)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const patches = [];
  for (const [x, y, z, w, d] of [[-3.5, DESK_Y + 0.012, -1.5, 3.2, 2.2], [1.5, DESK_Y + 0.012, 2.2, 3.2, 2.2], [-12, -5.98, 2, 5, 3.4], [-8, -5.98, 10, 5, 3.4]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, z);
    m.rotation.y = 0.35;
    scene.add(m);
    patches.push(m);
  }
  const motes = (() => {
    const n = 70, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = DESK_Y + 0.5 + Math.random() * 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: 0xfff0c8, size: 0.14, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(m);
    return m;
  })();
  const moteBase = Float32Array.from(motes.geometry.attributes.position.array);
  function update(t) {
    const mp = motes.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      mp.setX(i, moteBase[i * 3] + Math.sin(t * 0.25 + i) * 0.6);
      mp.setY(i, moteBase[i * 3 + 1] + Math.sin(t * 0.4 + i * 1.7) * 0.4);
    }
    mp.needsUpdate = true;
    for (const [k, m] of patches.entries()) m.material.opacity = 0.18 + Math.sin(t * 0.3 + k) * 0.04;
  }
  return { group, update, updateDesk, reset };
}
