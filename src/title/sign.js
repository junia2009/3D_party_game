// タイトルの木の看板。
//
// 丸太を切った板に「ドングリンピック」を彫りこみ、彫ったみぞにクリーム色を塗ったもの。
// 板・字・リボン・葉っぱとどんぐりは canvas に描いて1枚の絵にし、カメラの前に貼る
// (3D で文字を作るより、字がくっきり読める)。縄で画面の上からつるして揺らす。

import * as THREE from 'three';
import { makeRand } from '../games/daruma/trees.js';

const W = 1600, H = 760;
export const SIGN_ASPECT = W / H;

function leaf(g, x, y, size, angle, tone) {
  // どんぐりの木の葉(ふちが波打つ)
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  const grad = g.createLinearGradient(0, -size, 0, size);
  grad.addColorStop(0, tone[0]);
  grad.addColorStop(1, tone[1]);
  g.fillStyle = grad;
  g.strokeStyle = '#2f5a24';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, -size);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const yy = -size + t * size * 2;
    const w = Math.sin(t * Math.PI) * size * 0.48 * (i % 2 ? 1.12 : 0.88);
    g.quadraticCurveTo(w * 1.15, yy - size * 0.12, w, yy);
  }
  for (let i = 8; i >= 0; i--) {
    const t = i / 8;
    const yy = -size + t * size * 2;
    const w = Math.sin(t * Math.PI) * size * 0.48 * (i % 2 ? 1.12 : 0.88);
    g.quadraticCurveTo(-w * 1.15, yy + size * 0.12, -w, yy);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(40, 80, 30, 0.55)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, -size * 0.9);
  g.lineTo(0, size * 1.1);
  g.stroke();
  g.restore();
}

function acorn(g, x, y, s, angle) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.lineWidth = 6;
  g.strokeStyle = '#4a2a14';
  // 実
  const body = g.createRadialGradient(-s * 0.25, s * 0.2, s * 0.1, 0, s * 0.35, s);
  body.addColorStop(0, '#e09a4e');
  body.addColorStop(1, '#a75f26');
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(0, s * 0.35, s * 0.62, s * 0.8, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // 光
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.ellipse(-s * 0.22, s * 0.15, s * 0.12, s * 0.24, -0.3, 0, Math.PI * 2);
  g.fill();
  // 帽子(網目)
  g.fillStyle = '#7a4f2c';
  g.beginPath();
  g.ellipse(0, -s * 0.18, s * 0.72, s * 0.4, 0, Math.PI, 0);
  g.ellipse(0, -s * 0.18, s * 0.72, s * 0.14, 0, 0, Math.PI);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(60, 35, 15, 0.6)';
  g.lineWidth = 3;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(i * s * 0.18, -s * 0.5);
    g.lineTo(i * s * 0.18 + s * 0.1, -s * 0.1);
    g.stroke();
  }
  // 軸
  g.strokeStyle = '#4a2a14';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(0, -s * 0.52);
  g.quadraticCurveTo(s * 0.08, -s * 0.75, s * 0.2, -s * 0.85);
  g.stroke();
  g.restore();
}

export function drawSign() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const rand = makeRand(1234);

  // ── 板の形: 丸太を切った横長の板。縁はでこぼこ ──
  const top = 70, bottom = 560, left = 70, right = W - 70;
  const plank = new Path2D();
  const edge = (t, k) => 10 * Math.sin(t * 13 + k) + 6 * Math.sin(t * 29 + k * 2);
  plank.moveTo(left + 60, top + edge(0, 1));
  for (let i = 0; i <= 40; i++) { const t = i / 40; plank.lineTo(left + 60 + t * (right - left - 120), top + edge(t, 1)); }
  plank.quadraticCurveTo(right + 10, top, right + edge(0.3, 3), (top + bottom) / 2);
  plank.quadraticCurveTo(right + 10, bottom, right - 60, bottom + edge(1, 2));
  for (let i = 40; i >= 0; i--) { const t = i / 40; plank.lineTo(left + 60 + t * (right - left - 120), bottom + edge(t, 2)); }
  plank.quadraticCurveTo(left - 10, bottom, left + edge(0.7, 4), (top + bottom) / 2);
  plank.quadraticCurveTo(left - 10, top, left + 60, top + edge(0, 1));
  plank.closePath();

  // 落ち影
  g.save();
  g.translate(10, 18);
  g.fillStyle = 'rgba(40, 25, 10, 0.35)';
  g.fill(plank);
  g.restore();
  // 樹皮(縁)
  g.fillStyle = '#5a3a22';
  g.fill(plank);
  // 中の木目
  g.save();
  g.clip(plank);
  const inner = new Path2D();
  inner.rect(left + 22, top + 24, right - left - 44, bottom - top - 48);
  const wood = g.createLinearGradient(0, top, 0, bottom);
  wood.addColorStop(0, '#e8bb7c');
  wood.addColorStop(0.5, '#d9a466');
  wood.addColorStop(1, '#c48d52');
  g.fillStyle = wood;
  g.beginPath();
  g.roundRect(left + 22, top + 22, right - left - 44, bottom - top - 44, 60);
  g.fill();
  // 木目の線
  for (let i = 0; i < 46; i++) {
    const y = top + 30 + i * ((bottom - top - 60) / 46) + (rand() - 0.5) * 6;
    g.strokeStyle = `rgba(140, 90, 45, ${0.15 + rand() * 0.25})`;
    g.lineWidth = 2 + rand() * 3;
    g.beginPath();
    g.moveTo(left, y);
    for (let x = left; x <= right; x += 40) g.lineTo(x, y + Math.sin(x * 0.006 + i) * 7 + Math.sin(x * 0.02 + i * 3) * 2);
    g.stroke();
  }
  // 節
  for (const [x, y, r] of [[300, 470, 26], [1330, 160, 20], [960, 500, 16]]) {
    for (let k = 4; k >= 1; k--) {
      g.strokeStyle = `rgba(110, 65, 30, ${0.25 + k * 0.08})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(x, y, r * k * 0.45 + 6, r * k * 0.28 + 3, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // 上のふちに光、下のふちに陰
  const shade = g.createLinearGradient(0, top, 0, bottom);
  shade.addColorStop(0, 'rgba(255, 240, 200, 0.35)');
  shade.addColorStop(0.15, 'rgba(255, 240, 200, 0)');
  shade.addColorStop(0.85, 'rgba(60, 30, 10, 0)');
  shade.addColorStop(1, 'rgba(60, 30, 10, 0.3)');
  g.fillStyle = shade;
  g.fillRect(left, top, right - left, bottom - top);
  g.restore();
  // 樹皮のでこぼこ
  g.strokeStyle = 'rgba(30, 18, 8, 0.5)';
  g.lineWidth = 3;
  g.stroke(plank);

  // 縄を通す穴
  for (const x of [left + 150, right - 150]) {
    g.fillStyle = '#3a2412';
    g.beginPath();
    g.arc(x, top + 52, 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9a26a';
    g.fillRect(x - 9, top - 10, 18, 66);
    g.strokeStyle = 'rgba(90, 60, 30, 0.7)';
    g.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(x - 9, top - 6 + k * 11);
      g.lineTo(x + 9, top + 2 + k * 11);
      g.stroke();
    }
  }

  // ── 文字: 1文字ずつ、少し傾けて上下させる(お祭りの看板らしく) ──
  const text = 'ドングリンピック';
  const size = 168;
  g.font = `400 ${size}px "Dela Gothic One", "Hiragino Sans", sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const widths = [...text].map((ch) => g.measureText(ch).width * 0.92);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = W / 2 - total / 2;
  const cy = 300;
  const tilts = [-0.07, 0.05, -0.04, 0.06, -0.05, 0.04, -0.06, 0.07];
  const lifts = [6, -10, 8, -6, 10, -8, 4, -10];
  [...text].forEach((ch, i) => {
    const cx = x + widths[i] / 2;
    x += widths[i];
    g.save();
    g.translate(cx, cy + lifts[i]);
    g.rotate(tilts[i]);
    // 彫りの深さ(下にずらした暗い字)
    g.fillStyle = '#4a2a12';
    g.fillText(ch, 4, 10);
    // ふち取り
    g.lineJoin = 'round';
    g.strokeStyle = '#5a3418';
    g.lineWidth = 22;
    g.strokeText(ch, 0, 0);
    // 塗り: クリーム → 橙(「ピック」だけ赤みを強く)
    const fill = g.createLinearGradient(0, -size / 2, 0, size / 2);
    const accent = i >= 5;
    fill.addColorStop(0, accent ? '#fff0c8' : '#fffbea');
    fill.addColorStop(0.55, accent ? '#ffb347' : '#ffe08a');
    fill.addColorStop(1, accent ? '#f2762e' : '#f5b24a');
    g.fillStyle = fill;
    g.fillText(ch, 0, 0);
    // 上半分の照り
    g.save();
    g.beginPath();
    g.rect(-size, -size, size * 2, size * 0.45);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillText(ch, 0, 0);
    g.restore();
    g.restore();
  });

  // ── リボン: 「森のなかまの どんぐり大会」 ──
  const rw = 760, rh = 104, rx = W / 2 - rw / 2, ry = 470;
  g.fillStyle = '#a8322a';
  for (const s of [-1, 1]) {
    // 折り返した端
    const ex = s < 0 ? rx - 70 : rx + rw + 70;
    g.beginPath();
    g.moveTo(s < 0 ? rx + 30 : rx + rw - 30, ry + 22);
    g.lineTo(ex, ry + 22);
    g.lineTo(ex + s * -34, ry + 22 + rh / 2);
    g.lineTo(ex, ry + 22 + rh);
    g.lineTo(s < 0 ? rx + 30 : rx + rw - 30, ry + 22 + rh);
    g.closePath();
    g.fill();
  }
  const rib = g.createLinearGradient(0, ry, 0, ry + rh);
  rib.addColorStop(0, '#f05a4a');
  rib.addColorStop(1, '#d23f33');
  g.fillStyle = rib;
  g.strokeStyle = '#7a221c';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(rx, ry);
  g.quadraticCurveTo(W / 2, ry - 26, rx + rw, ry);
  g.lineTo(rx + rw, ry + rh);
  g.quadraticCurveTo(W / 2, ry + rh - 26, rx, ry + rh);
  g.closePath();
  g.fill();
  g.stroke();
  g.font = '800 54px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  g.fillStyle = '#fff6e0';
  g.fillText('森のなかまの どんぐり大会', W / 2, ry + rh / 2 - 10);

  // ── 飾り: 左上と右下に葉っぱ、右からどんぐりが2つぶら下がる ──
  const green = [['#9bd36a', '#4f9a3c'], ['#7cc35a', '#3f8a34'], ['#b6e07c', '#5da844']];
  leaf(g, 150, 110, 70, -0.9, green[0]);
  leaf(g, 230, 70, 58, -0.2, green[1]);
  leaf(g, 95, 190, 52, -1.6, green[2]);
  leaf(g, W - 140, 520, 66, 2.3, green[1]);
  leaf(g, W - 230, 575, 52, 2.9, green[0]);
  // 右上の小枝からどんぐり
  g.strokeStyle = '#5a3a22';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(W - 300, top + 8);
  g.quadraticCurveTo(W - 200, top - 30, W - 110, top + 10);
  g.stroke();
  leaf(g, W - 180, top - 18, 48, 1.2, green[2]);
  acorn(g, W - 250, top + 62, 40, 0.15);
  acorn(g, W - 160, top + 74, 46, -0.2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 看板の3D: 絵の板 + うしろに厚みの影 + 上へのびる2本の縄。
// 返すのは「上の支点」でぶら下がるグループ(揺れはこの支点まわりの回転)
export function buildSign(tex) {
  const pivot = new THREE.Group();
  const w = 3.2, h = w / SIGN_ASPECT;
  const hang = new THREE.Group();
  hang.position.y = -0.9; // 支点から看板の上ふちまで
  pivot.add(hang);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  front.position.y = -h / 2;
  front.renderOrder = 11;
  // 板の厚み: 同じ形を暗くして、少し下にずらして重ねる
  const back = new THREE.Mesh(front.geometry, new THREE.MeshBasicMaterial({ map: tex, color: 0x3a2412, transparent: true, depthTest: false }));
  back.position.set(0.012, -h / 2 - 0.035, -0.01);
  back.renderOrder = 10;
  hang.add(back, front);
  // 縄(穴の位置から上へ)
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0xc9a26a, depthTest: false });
  for (const x of [-(w / 2) + (220 / 1600) * w, w / 2 - (220 / 1600) * w]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 4, 6), ropeMat);
    rope.position.set(x, 2 - (122 / 760) * h, -0.005);
    rope.renderOrder = 9;
    hang.add(rope);
  }
  return { pivot, width: w, height: h + 0.9 };
}
