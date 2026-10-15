// ページ(DOM)を、そのままの見た目で canvas に描きうつす。
//
// めくる紙は3Dで傾くので、字をそのまま(DOM の字として)のせると、ブラウザが低い解像度で描いて
// にじむ(とくに iPhone)。めくる前に、画面と同じ細かさの絵にしてからのせる。
// 図鑑のプロフィールのページに出てくるものだけ描ければよい:
// 背景色・角丸・枠線(全体 / 下だけ)・字(行ごと)・小さな SVG(どんぐり)。

const px = (v) => parseFloat(v) || 0;
const visible = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
}

function svgImage(svg, color) {
  const src = svg.outerHTML
    .replace(/currentColor/g, color)
    .replace('<svg', svg.getAttribute('xmlns') ? '<svg' : '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  return img.decode().then(() => img, () => null);
}

// root を描いた canvas を返す。paper(g, w, h) で下地(紙)を先に描く
export async function paintElement(root, paper) {
  const base = root.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(base.width * dpr);
  canvas.height = Math.round(base.height * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  paper(g, base.width, base.height);

  // SVG は読みこみに時間がかかるので、先にまとめて用意する
  const svgs = [...root.querySelectorAll('svg')];
  const images = await Promise.all(svgs.map((s) => svgImage(s, getComputedStyle(s).color)));

  const walk = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    const x = r.left - base.left, y = r.top - base.top;
    if (el !== root) {
      const rad = px(cs.borderTopLeftRadius);
      if (visible(cs.backgroundColor)) {
        g.fillStyle = cs.backgroundColor;
        roundRect(g, x, y, r.width, r.height, rad);
        g.fill();
      }
      const bw = px(cs.borderTopWidth);
      if (bw > 0 && visible(cs.borderTopColor)) {
        g.strokeStyle = cs.borderTopColor;
        g.lineWidth = bw;
        roundRect(g, x + bw / 2, y + bw / 2, r.width - bw, r.height - bw, Math.max(0, rad - bw / 2));
        g.stroke();
      } else if (px(cs.borderBottomWidth) > 0 && visible(cs.borderBottomColor)) {
        const b = px(cs.borderBottomWidth);
        g.fillStyle = cs.borderBottomColor;
        g.fillRect(x, y + r.height - b, r.width, b);
      }
    }
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) drawText(n, cs);
      else if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.tagName.toLowerCase() === 'svg') {
          const img = images[svgs.indexOf(n)];
          const sr = n.getBoundingClientRect();
          if (img) g.drawImage(img, sr.left - base.left, sr.top - base.top, sr.width, sr.height);
        } else walk(n);
      }
    }
  };

  // 字: 1文字ずつ位置を測って、同じ行の字をまとめて描く(折り返しも画面どおりになる)
  const range = document.createRange();
  const drawText = (node, cs) => {
    const text = node.nodeValue;
    if (!text.trim()) return;
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.fillStyle = cs.color;
    g.textBaseline = 'middle';
    let run = '', rx = 0, ry = 0, top = null;
    const flush = () => {
      if (run.trim()) g.fillText(run, rx, ry);
      run = '';
    };
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const cr = range.getBoundingClientRect();
      if (!cr.width && !cr.height) continue;
      if (top === null || Math.abs(cr.top - top) > 2) {
        flush();
        top = cr.top;
        rx = cr.left - base.left;
        ry = cr.top - base.top + cr.height / 2;
      }
      run += text[i];
    }
    flush();
  };

  walk(root);
  return canvas;
}
