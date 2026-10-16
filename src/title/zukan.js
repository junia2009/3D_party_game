// キャラ図鑑: 島の前でひらく本。
//
// 横長の画面では左右に、縦長の画面では上下にひらく(片方のページにキャラ、もう片方にプロフィール)。
// キャラは実物のモデルを、ページの上の小さな canvas に描く(タイトルの renderer とは別の器。
// ページごとめくるので、ページの中に置く必要がある)。ドラッグで回り、さわるとポーズをとる。
// めくるときは、いまのページの写しを1枚の紙にのせて、背表紙を軸に回す。

import * as THREE from 'three';
import { shownCharacters } from '../characters.js';

const CHARACTERS = shownCharacters(); // 図鑑にのせる子(まだ出さない子は のせない)
import { createModel } from '../runtime/models.js';
import { lineColor } from '../model-kit.js';
import { paintElement } from './paint.js';

const STAT_LABELS = ['はやさ', 'ちから', 'わざ', 'うん'];
const POSES = [['wave', 1.2 * 2], ['cheer', 0.8 * 3], ['dizzy', 2.0]];
const FIT = 2.5; // ページに入れる高さ(いちばん大きいキャラが収まるように)

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
// 見出しやしおりの色: そのキャラの濃い色(白いキャラでも字が読めるように)。無ければ輪郭線の色
const accent = (c) => hex(c.dark ?? lineColor(c.main).getHex());
const ACORN = '<svg viewBox="0 0 20 22" aria-hidden="true"><ellipse cx="10" cy="13" rx="6.5" ry="7.5" fill="currentColor"/><path d="M2.5 9.5a7.5 5 0 0 1 15 0z" fill="#6e4a2a"/><rect x="9" y="2" width="2" height="4" rx="1" fill="#5a3c22"/></svg>';

// 図鑑の番号。ゲストは番号のかわりに「ゲスト」
const noLabel = (i) => (CHARACTERS[i].guest ? 'ゲスト' : `No.${i + 1}`);

function infoHtml(c, i) {
  const stats = c.stats.map((v, k) => `<div class="stat"><span>${STAT_LABELS[k]}</span><i>${
    Array.from({ length: 5 }, (_, n) => `<b class="${n < v ? 'on' : ''}">${ACORN}</b>`).join('')}</i></div>`).join('');
  return `<div class="z-in">
    <div class="z-name"><h3>${c.name}</h3><span class="z-species">${c.species}</span>${c.guest ? '<span class="z-guest">とくべつ出演</span>' : ''}</div>
    <p class="z-line">「${c.line}」</p>
    <dl class="z-facts">
      <div><dt>とくい</dt><dd>${c.role}</dd></div>
      <div><dt>せいかく</dt><dd>${c.personality}</dd></div>
      <div><dt>見分け方</dt><dd>${c.marks.join('・')}</dd></div>
      ${(c.facts || []).map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')}
    </dl>
    <div class="z-stats">${stats}</div>
    </div><span class="z-folio">- ${c.guest ? 'ゲスト' : i + 1} -</span>`;
}

export function createZukan({ sfx, onClose, faces }) {
  const root = $('zukan');
  const book = $('book');
  const canvas = $('zukanCv');
  const info = $('zInfo');
  const leaf = $('zLeaf');
  let index = 0;
  let open = false;
  let turning = false;

  // ── キャラを描く小さな舞台 ─────────────────────────────
  let renderer = null;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0xb89a6a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  // 足元の丸い影
  const shadow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(90,60,30,.35)');
    r.addColorStop(1, 'rgba(90,60,30,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.position.y = 0.005;
    return m;
  })();
  scene.add(shadow);
  const holder = new THREE.Group();
  scene.add(holder);
  const models = new Map(); // key → Promise<Model>
  let shown = null; // { key, model }
  let yaw = 0, yawVel = 0, dragging = false, swayT = 0, poseT = 0, poseN = 0;

  function ensureRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
  }
  function sizeCanvas() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 高さ FIT が縦に収まり、横長のページでも小さくなりすぎないように
    const dist = (FIT / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 0.75 / camera.aspect);
    camera.position.set(0, FIT * 0.5 + 0.15, dist);
    camera.lookAt(0, FIT * 0.45, 0);
    camera.updateProjectionMatrix();
  }
  function getModel(key) {
    if (!models.has(key)) {
      models.set(key, createModel(key).then((m) => {
        m.play('idle');
        m.setFace('normal');
        return m;
      }));
    }
    return models.get(key);
  }
  async function show(key) {
    attach(key, await getModel(key));
  }
  // 読みこみ済みのモデルを、待たずに舞台へ出す
  function attach(key, m) {
    if (shown) holder.remove(shown.model.root);
    holder.add(m.root);
    shown = { key, model: m };
    m.play('idle');
    m.setFace('normal');
    poseT = 0;
    const def = CHARACTERS.find((c) => c.key === key);
    shadow.scale.setScalar(def.size || 1);
  }
  function render() {
    if (!renderer || !shown) return;
    holder.rotation.y = yaw + Math.sin(swayT * 0.6) * 0.35;
    renderer.render(scene, camera);
  }
  // そのキャラを描いた絵(めくる紙にのせる)。描いたあと、いまのキャラに描きもどす
  // (先に両方読みこんでから、待たずに 描く → 写す → 描きもどす。あいだに画面へ出ることはない)
  async function snapshot(key) {
    const keep = shown;
    const m = await getModel(key);
    attach(key, m);
    m.update(0);
    render();
    const url = canvas.toDataURL('image/png');
    if (keep) {
      attach(keep.key, keep.model);
      render();
    }
    return url;
  }

  // ── ページ ────────────────────────────────────────
  function fill(i) {
    const c = CHARACTERS[i];
    info.innerHTML = infoHtml(c, i);
    info.style.setProperty('--char', accent(c));
    $('zNo').textContent = noLabel(i);
    for (const [k, b] of [...$('zTabs').children].entries()) b.setAttribute('aria-current', String(k === i));
    $('zPrev').disabled = i === 0;
    $('zNext').disabled = i === CHARACTERS.length - 1;
  }
  function renderTabs() {
    const f = faces();
    $('zTabs').replaceChildren(...CHARACTERS.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = c.name;
      b.style.setProperty('--char', accent(c));
      b.innerHTML = f?.[c.key] ? `<img src="${f[c.key]}" alt="${c.name}">` : `<span>${c.name[0]}</span>`;
      b.setAttribute('aria-current', String(i === index));
      b.addEventListener('click', () => turnTo(i));
      return b;
    }));
  }

  const vertical = () => innerWidth < innerHeight;

  // プロフィールのページを絵にする(めくる紙にのせる。字のままだと傾いたときににじむ)
  function paper(g, w, h) {
    g.fillStyle = '#fbf4e2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(160, 120, 70, .13)';
    for (let y = 25; y < h; y += 26) g.fillRect(0, y, w, 1);
    // 背表紙の側の影(横長は左、縦長は上)
    const v = vertical();
    const s = v ? g.createLinearGradient(0, 0, 0, h * 0.14) : g.createLinearGradient(0, 0, w * 0.2, 0);
    s.addColorStop(0, 'rgba(110, 70, 30, .2)');
    s.addColorStop(1, 'rgba(110, 70, 30, 0)');
    g.fillStyle = s;
    g.fillRect(0, 0, w, h);
  }
  async function infoPicture(c, i) {
    // 見えない写しのページをプロフィールのページにぴったり重ねて組み、それを描く
    const ghost = info.cloneNode(false);
    ghost.removeAttribute('id');
    ghost.style.cssText = `position:absolute; left:${info.offsetLeft}px; top:${info.offsetTop}px; width:${info.offsetWidth}px; height:${info.offsetHeight}px; opacity:0; pointer-events:none;`;
    ghost.style.setProperty('--char', accent(c));
    ghost.innerHTML = infoHtml(c, i);
    info.parentNode.append(ghost);
    try {
      return await paintElement(ghost, paper);
    } finally {
      ghost.remove();
    }
  }
  function putPicture(face, cls, el) {
    face.className = cls;
    face.replaceChildren(el);
  }

  // めくる。next: つぎへ(右/下のページが、左/上へ)。prev: 前へ(左/上のページが、右/下へ)
  async function turnTo(i) {
    if (turning || !open || i === index) return;
    turning = true;
    const forward = i > index;
    sfx.page();
    const front = leaf.querySelector('.front');
    const back = leaf.querySelector('.back');
    leaf.className = 'leaf ' + (forward ? 'next' : 'prev');
    if (forward) {
      // 表: いまのプロフィール / 裏: つぎのキャラの絵
      const [pic, page] = await Promise.all([snapshot(CHARACTERS[i].key), infoPicture(CHARACTERS[index], index)]);
      putPicture(front, 'front page info', page);
      putPicture(back, 'back page pic', Object.assign(new Image(), { src: pic, alt: '' }));
      const was = index;
      index = i;
      fill(i);
      $('zNo').textContent = noLabel(was); // 左(上)のページは、めくり終わるまで前のキャラのまま
    } else {
      // 表: いまのキャラの絵 / 裏: 前のキャラのプロフィール
      const pic = canvas.toDataURL('image/png');
      const prev = CHARACTERS[i];
      putPicture(front, 'front page pic', Object.assign(new Image(), { src: pic, alt: '' }));
      putPicture(back, 'back page info', await infoPicture(prev, i));
      index = i;
      await show(prev.key);
      $('zNo').textContent = noLabel(i);
    }
    leaf.hidden = false;
    void leaf.offsetWidth;
    leaf.classList.add('go');
    // めくり終わるまで待つ(transitionend が来ないときのための保険つき)
    await new Promise((r) => {
      const t = setTimeout(r, parseFloat(getComputedStyle(leaf).transitionDuration) * 1000 + 400);
      leaf.addEventListener('transitionend', () => { clearTimeout(t); r(); }, { once: true });
    });
    if (forward) {
      await show(CHARACTERS[i].key);
      $('zNo').textContent = noLabel(i);
    } else fill(i);
    leaf.hidden = true;
    leaf.classList.remove('go');
    turning = false;
  }

  // ── さわる ────────────────────────────────────────
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, last: e.clientX, moved: 0 };
    dragging = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.last;
    down.last = e.clientX;
    down.moved += Math.abs(dx);
    yaw += dx * 0.012;
    yawVel = dx * 0.012 * 60;
  });
  const up = () => {
    if (!down) return;
    if (down.moved < 6 && shown) {
      // さわった: ポーズ
      const [clip, len] = POSES[poseN++ % POSES.length];
      shown.model.play(clip);
      shown.model.setFace(clip === 'dizzy' ? 'frustrated' : 'happy');
      poseT = len;
      sfx.boop();
    }
    down = null;
    dragging = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  // ページをはらって めくる(プロフィールのページ)
  let swipe = null;
  info.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY }; });
  info.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    const d = vertical() ? dy : dx;
    if (Math.abs(d) > 40) turnTo(d < 0 ? Math.min(CHARACTERS.length - 1, index + 1) : Math.max(0, index - 1));
  });
  $('zNext').addEventListener('click', () => turnTo(Math.min(CHARACTERS.length - 1, index + 1)));
  $('zPrev').addEventListener('click', () => turnTo(Math.max(0, index - 1)));
  $('zClose').addEventListener('click', () => close());
  addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') turnTo(Math.min(CHARACTERS.length - 1, index + 1));
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') turnTo(Math.max(0, index - 1));
    else if (e.code === 'Escape') close();
  });
  addEventListener('resize', () => { if (open) sizeCanvas(); });

  // ── ひらく・とじる ───────────────────────────────────
  async function openBook() {
    ensureRenderer();
    root.hidden = false;
    book.classList.remove('opened', 'closing');
    book.classList.add('closed');
    renderTabs();
    fill(index);
    sizeCanvas();
    await show(CHARACTERS[index].key);
    open = true;
    void book.offsetWidth;
    sfx.open();
    // 表紙がひらく
    setTimeout(() => {
      book.classList.remove('closed');
      book.classList.add('opened');
    }, 650);
  }
  async function close() {
    if (!open || turning) return;
    open = false;
    sfx.close();
    book.classList.remove('opened');
    book.classList.add('closing');
    await new Promise((r) => setTimeout(r, 760));
    root.hidden = true;
    book.classList.remove('closing');
    onClose();
  }

  return {
    open: openBook,
    close,
    get isOpen() { return open; },
    refreshTabs: renderTabs,
    frame(dt) {
      if (!open || !shown) return;
      swayT += dt;
      if (!dragging) {
        yaw += yawVel * dt;
        yawVel *= Math.exp(-dt * 4);
        yaw *= Math.exp(-dt * 0.8); // ゆっくり正面へもどる
      }
      if (poseT > 0) {
        poseT -= dt;
        if (poseT <= 0) {
          shown.model.play('idle');
          shown.model.setFace('normal');
        }
      }
      shown.model.update(dt);
      render();
    },
    // E2E 用
    get index() { return index; },
    turnTo,
  };
}
