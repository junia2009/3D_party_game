// 葉っぱの幕。島の大木へ飛びこむとき、葉っぱが画面いっぱいに舞いこんでうめつくし、
// そのあいだに会場を入れかえて、風で吹きとばして会場を見せる。
//
// 2D の canvas に描く(3D とは別の層)。舞い方は演出なので Math.random を使ってよい。

const GREENS = ['#5fae45', '#4f9a3c', '#77c255', '#3f8530', '#8fcf5e'];
const AUTUMN = ['#e9a23b', '#d9773a', '#f2c14e'];
const INK = '#2f4a1c';

function leafPath(g, s) {
  // かしわの葉っぽく、ふちが波うつ葉
  g.beginPath();
  g.moveTo(0, -s);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const y = -s + t * 2 * s;
    const w = Math.sin(t * Math.PI) * s * 0.55 * (1 + 0.16 * Math.sin(t * Math.PI * 7));
    g.lineTo(w, y);
  }
  for (let i = 8; i >= 0; i--) {
    const t = i / 8;
    const y = -s + t * 2 * s;
    const w = Math.sin(t * Math.PI) * s * 0.55 * (1 + 0.16 * Math.sin(t * Math.PI * 7 + 1));
    g.lineTo(-w, y);
  }
  g.closePath();
}

function drawLeaf(g, leaf) {
  const { s, color } = leaf;
  leafPath(g, s);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = Math.max(2, s * 0.07);
  g.strokeStyle = INK;
  g.stroke();
  // 葉脈
  g.beginPath();
  g.moveTo(0, -s * 0.85);
  g.lineTo(0, s * 1.25);
  for (let i = 1; i <= 3; i++) {
    const y = -s + (i / 4) * 2 * s;
    g.moveTo(0, y + s * 0.18);
    g.lineTo(s * 0.32, y - s * 0.05);
    g.moveTo(0, y + s * 0.18);
    g.lineTo(-s * 0.32, y - s * 0.05);
  }
  g.lineWidth = Math.max(1.5, s * 0.045);
  g.strokeStyle = 'rgba(47, 74, 28, .55)';
  g.stroke();
  // 上に光
  g.save();
  leafPath(g, s);
  g.clip();
  g.fillStyle = 'rgba(255, 255, 220, .18)';
  g.fillRect(-s, -s, s * 0.9, s * 2);
  g.restore();
}

function drawAcorn(g, s) {
  g.lineWidth = Math.max(2, s * 0.09);
  g.strokeStyle = '#4a2a14';
  g.fillStyle = '#c27a35';
  g.beginPath();
  g.ellipse(0, s * 0.22, s * 0.55, s * 0.68, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#7a4f2c';
  g.beginPath();
  g.ellipse(0, -s * 0.22, s * 0.68, s * 0.42, 0, Math.PI, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(0, -s * 0.62);
  g.lineTo(s * 0.06, -s * 0.9);
  g.stroke();
}

export function createLeafCurtain(canvas, label) {
  const g = canvas.getContext('2d');
  let leaves = [];
  let phase = 'off'; // off → in → hold → out → off
  let t = 0;
  let last = 0;
  let done = null;
  let raf = 0;
  let W = 0, H = 0, dpr = 1;
  let cover = 0; // 下地の緑の濃さ(すきまを見せないため)
  let labelTimer = 0;

  function size() {
    dpr = Math.min(devicePixelRatio, 2);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function makeLeaves() {
    // 画面をうめる位置を、ずらした格子で決める。大きい葉で少なめに
    const s = Math.max(W, H) * 0.085;
    const step = s * 1.25;
    const list = [];
    for (let y = -step * 0.5; y < H + step; y += step * 0.8) {
      for (let x = -step * 0.5; x < W + step; x += step) {
        const tx = x + (Math.random() - 0.5) * step * 0.7 + ((y / step) % 2) * step * 0.4;
        const ty = y + (Math.random() - 0.5) * step * 0.6;
        const autumn = Math.random() < 0.18;
        list.push({
          tx, ty,
          s: s * (0.85 + Math.random() * 0.5),
          color: (autumn ? AUTUMN : GREENS)[Math.floor(Math.random() * (autumn ? AUTUMN.length : GREENS.length))],
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 5,
          // 入ってくる時間のずれ(下から先に、うずをまいて)
          delay: Math.random() * 0.35 + (1 - ty / H) * 0.12,
          // 吹きとぶ向き(右上へ)
          vx: 0.6 + Math.random() * 0.9,
          vy: -(0.5 + Math.random() * 0.9),
          outDelay: Math.random() * 0.15 + (tx / W) * 0.1,
          ph: Math.random() * 6.28,
          acorn: Math.random() < 0.04,
        });
      }
    }
    // 重なりの順をまぜる(下から順に積んだように見せない)
    leaves = list.sort(() => Math.random() - 0.5);
  }

  const easeOut = (x) => 1 - (1 - x) ** 3;
  const easeIn = (x) => x * x * x;

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (cover > 0) {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `rgba(79, 154, 60, ${cover})`);
      grad.addColorStop(1, `rgba(47, 110, 40, ${cover})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    for (const L of leaves) {
      let x, y, rot = L.rot, a = 1;
      if (phase === 'in') {
        const k = Math.min(1, Math.max(0, (t - L.delay) / 0.55));
        if (k <= 0) continue;
        const e = easeOut(k);
        // 左下から、うずをまいて所定の場所へ
        const sx = -W * 0.3 + Math.sin(L.ph) * W * 0.2, sy = H * 1.25;
        const swirl = (1 - e) * Math.max(W, H) * 0.25;
        x = sx + (L.tx - sx) * e + Math.cos(L.ph + e * 4) * swirl;
        y = sy + (L.ty - sy) * e + Math.sin(L.ph + e * 4) * swirl;
        rot += (1 - e) * L.spin * 2;
      } else if (phase === 'out') {
        const k = Math.max(0, (t - L.outDelay) / 0.5);
        const e = easeIn(Math.min(k, 1.4));
        x = L.tx + L.vx * e * W * 1.2 + Math.sin(L.ph + t * 3) * 20;
        y = L.ty + L.vy * e * H * 1.2;
        rot += e * L.spin;
        a = 1;
      } else {
        // その場でそよぐ
        x = L.tx + Math.sin(L.ph + t * 2) * 4;
        y = L.ty + Math.cos(L.ph + t * 1.7) * 3;
        rot += Math.sin(L.ph + t * 1.3) * 0.08;
      }
      g.save();
      g.globalAlpha = a;
      g.translate(x, y);
      g.rotate(rot);
      if (L.acorn) drawAcorn(g, L.s * 0.7);
      else drawLeaf(g, L);
      g.restore();
    }
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    t += dt;
    if (phase === 'in') {
      cover = Math.min(1, Math.max(0, (t - 0.45) / 0.35));
      if (t > 1.05) {
        phase = 'hold';
        t = 0;
        cover = 1;
        // 準備に時間がかかっているときだけ、ひとことを出す
        labelTimer = setTimeout(() => { label.hidden = false; }, 400);
        finish();
      }
    } else if (phase === 'out') {
      cover = Math.max(0, 1 - t / 0.25);
      if (t > 1.0) {
        phase = 'off';
        stop();
        finish();
        return;
      }
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    const d = done;
    done = null;
    d?.();
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(raf);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    canvas.hidden = true;
  }

  return {
    // 葉っぱで画面をうめる。うまったら解決する
    cover() {
      size();
      makeLeaves();
      canvas.hidden = false;
      phase = 'in';
      t = 0;
      cover = 0;
      startLoop();
      return new Promise((r) => { done = r; });
    },
    // 吹きとばして、下を見せる。見えきったら解決する
    reveal() {
      clearTimeout(labelTimer);
      label.hidden = true;
      phase = 'out';
      t = 0;
      return new Promise((r) => { done = r; });
    },
    get busy() { return phase !== 'off'; },
  };
}
