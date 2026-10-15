// メニューのボタンやパネルに使う、木の板の絵。看板と同じ描き方で小さく作り、
// CSS の背景(data: URL)にする。

import { makeRand } from '../games/daruma/trees.js';

export function woodPlank(w, h, { seed = 1, tone = ['#e8bb7c', '#d9a466', '#c48d52'], bark = '#5a3a22', radius = 0.35 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const rand = makeRand(seed);
  const r = h * radius;
  const shape = new Path2D();
  // 縁を少しでこぼこにした角丸の板
  const wob = (t, k) => h * 0.012 * Math.sin(t * 17 + k) + h * 0.008 * Math.sin(t * 41 + k);
  shape.moveTo(r, wob(0, 1) + 4);
  for (let i = 0; i <= 30; i++) { const t = i / 30; shape.lineTo(r + t * (w - 2 * r), 4 + wob(t, 1)); }
  shape.quadraticCurveTo(w - 2, 2, w - 3, h / 2);
  shape.quadraticCurveTo(w - 2, h - 2, w - r, h - 6 + wob(1, 2));
  for (let i = 30; i >= 0; i--) { const t = i / 30; shape.lineTo(r + t * (w - 2 * r), h - 6 + wob(t, 2)); }
  shape.quadraticCurveTo(2, h - 2, 3, h / 2);
  shape.quadraticCurveTo(2, 2, r, 4 + wob(0, 1));
  shape.closePath();
  g.fillStyle = bark;
  g.fill(shape);
  g.save();
  g.clip(shape);
  const b = Math.max(5, h * 0.07);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, tone[0]);
  grad.addColorStop(0.5, tone[1]);
  grad.addColorStop(1, tone[2]);
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(b, b, w - 2 * b, h - 2 * b - 3, r * 0.8);
  g.fill();
  // 木目
  const lines = Math.round(h / 7);
  for (let i = 0; i < lines; i++) {
    const y = b + (i + 0.5) * ((h - 2 * b) / lines) + (rand() - 0.5) * 3;
    g.strokeStyle = `rgba(130, 82, 40, ${0.12 + rand() * 0.2})`;
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 3 + Math.sin(x * 0.05 + i * 2) * 1);
    g.stroke();
  }
  // 節をひとつ
  const kx = w * (0.15 + rand() * 0.7), ky = h * (0.3 + rand() * 0.4);
  for (let k = 3; k >= 1; k--) {
    g.strokeStyle = `rgba(110, 65, 30, ${0.2 + k * 0.08})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(kx, ky, h * 0.06 * k + 3, h * 0.035 * k + 2, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // 上に光、下に陰
  const shade = g.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(255, 245, 210, 0.45)');
  shade.addColorStop(0.2, 'rgba(255, 245, 210, 0)');
  shade.addColorStop(0.8, 'rgba(60, 30, 10, 0)');
  shade.addColorStop(1, 'rgba(60, 30, 10, 0.3)');
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  g.restore();
  return c.toDataURL('image/png');
}
