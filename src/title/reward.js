// ごほうびの 画面: どんぐりガチャ・きせかえ・称号・スタンプ帳。
//
// 上の 舞台(小さな canvas)に 3D を 描く。ガチャの ときは どんぐりの 形の ガチャの 機械、
// ほかの ときは 自分の キャラが 台の 上で きせかえを 見せる。下が タブの 中身。
// 記録の 書きかえは src/collect/progress.js。保存と 島の きせかえは title.js(onChange)。

import * as THREE from 'three';
import { createModel } from '../runtime/models.js';
import { blob, shape } from '../model-kit.js';
import { applyLook, buildHat, scarfTexture } from '../collect/look3d.js';
import { HATS, SCARVES, RARE, GACHA, PRIZES, STAMPS, TITLES } from '../collect/catalog.js';
import { drawGacha, wear } from '../collect/progress.js';
import { mergeStatic } from '../runtime/merge.js';
import { toonGradient } from '../runtime/models.js';
import { CHARACTERS, PLAYER_COLORS } from '../characters.js';

const $ = (id) => document.getElementById(id);
const RARE_COLOR = { n: 0x5cc0ff, r: 0xb06ae0, s: 0xffc83a };
const ACORN = '<svg viewBox="0 0 20 22" aria-hidden="true"><ellipse cx="10" cy="13" rx="6.5" ry="7.5" fill="#c27a35" stroke="#4a2a12" stroke-width="1.4"/><path d="M2.5 9.5a7.5 5 0 0 1 15 0z" fill="#7a4f2c" stroke="#4a2a12" stroke-width="1.4"/><rect x="9" y="2" width="2" height="4" rx="1" fill="#4a2a12"/></svg>';

const TOON = new Map();
function toonify(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material.isMeshStandardMaterial) return;
    const hex = o.material.color.getHex();
    if (!TOON.has(hex)) TOON.set(hex, new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGradient }));
    o.material = TOON.get(hex);
  });
}
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

// ── ガチャの 機械(どんぐりの 形) ──────────────────────
function buildMachine() {
  const g = new THREE.Group();
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 32);
  // 台(木の 箱)と 金の 帯
  const base = new THREE.Group();
  base.add(at(blob(0xc8602f, 0.95, 0.62, 0.95), 0, 0.62, 0));
  base.add(at(shape(CYL, 0xffc83a, 1.03), 0, 1.05, 0));
  base.children[1].scale.set(0.9, 0.08, 0.9);
  base.add(at(shape(CYL, 0x8a4a22, 1.03), 0, 0.06, 0));
  base.children[2].scale.set(0.98, 0.12, 0.98);
  // 出口(くらい 穴)と 投入口
  base.add(at(blob(0x3a2010, 0.32, 0.22, 0.12, false), 0, 0.42, 0.86));
  base.add(at(blob(0xffe6a0, 0.36, 0.05, 0.1), 0, 0.3, 0.9));
  base.add(at(blob(0x4a2a12, 0.03, 0.11, 0.02, false), 0.48, 0.8, 0.79));
  toonify(base);
  mergeStatic(base);
  g.add(base);
  // ハンドル(回る)
  const handle = new THREE.Group();
  handle.position.set(0, 0.78, 0.93);
  const knob = shape(CYL, 0xffd24a, 1.06);
  knob.scale.set(0.24, 0.08, 0.24);
  knob.rotation.x = Math.PI / 2;
  handle.add(knob);
  const bar = blob(0xe8402f, 0.3, 0.06, 0.06);
  bar.position.z = 0.07;
  handle.add(bar);
  toonify(handle);
  g.add(handle);
  // ガラスの 玉と、中の カプセル
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.95, 32, 20), new THREE.MeshToonMaterial({ color: 0xd8f0ff, gradientMap: toonGradient, transparent: true, opacity: 0.34, depthWrite: false }));
  glass.position.y = 1.95;
  glass.renderOrder = 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 32), new THREE.MeshToonMaterial({ color: 0xffc83a, gradientMap: toonGradient }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.16;
  const caps = new THREE.Group();
  caps.position.y = 1.95;
  const cols = [0xff6a8a, 0x5cc0ff, 0xffd24a, 0x7ad35a, 0xb06ae0, 0xff9a3c];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39996, r = 0.55 * Math.sqrt((i + 0.5) / 16);
    const c = capsule(cols[i % cols.length], 0.22);
    c.position.set(Math.cos(a) * r * 1.1, -0.74 + Math.floor(i / 5) * 0.2 + (i % 2) * 0.04, Math.sin(a) * r * 1.1);
    c.rotation.set(i, i * 2, i * 0.5);
    c.userData.home = c.position.clone();
    caps.add(c);
  }
  // ガラスの つや
  const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  shine.scale.set(0.12, 0.28, 0.05);
  shine.position.set(-0.5, 2.3, 0.72);
  shine.rotation.z = 0.5;
  g.add(caps, glass, rim, shine);
  // 上の どんぐりの かさ
  const cap = new THREE.Group();
  cap.position.y = 2.62;
  const hemi = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const top = shape(hemi, 0x8a5a32, 1.04);
  top.scale.set(1.05, 0.55, 1.05);
  cap.add(top);
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 32), new THREE.MeshToonMaterial({ color: 0x6e4528, gradientMap: toonGradient }));
    ring.rotation.x = Math.PI / 2;
    const y = 0.1 + k * 0.15;
    ring.position.y = y;
    ring.scale.setScalar(1.04 * Math.sqrt(1 - (y / 0.56) ** 2));
    cap.add(ring);
  }
  const stem = shape(CYL, 0x5a3a1e, 1.08);
  stem.scale.set(0.09, 0.3, 0.09);
  stem.position.y = 0.66;
  stem.rotation.z = 0.2;
  cap.add(stem);
  const leaf = blob(0x6cbf58, 0.26, 0.04, 0.12);
  leaf.position.set(0.24, 0.72, 0);
  leaf.rotation.z = -0.4;
  cap.add(leaf);
  toonify(cap);
  g.add(cap);
  return { group: g, handle, caps, glass };
}
// カプセル: 上は 色、下は 白
function capsule(color, r) {
  const c = new THREE.Group();
  const hemi = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const topH = shape(hemi, color, 1.08);
  topH.scale.setScalar(r);
  const bot = shape(hemi, 0xfffaf0, 1.08);
  bot.scale.set(r, -r, r);
  const band = blob(0xffffff, r * 1.02, r * 0.12, r * 1.02, false);
  const top = new THREE.Group();
  top.add(topH);
  top.name = 'top';
  c.add(top, bot, band);
  toonify(c);
  return c;
}

export function createReward({ el, getProgress, onChange, getPicked, sfx, toast }) {
  const canvas = $('rewardCv');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0xb89a6a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  let renderer = null;
  let tab = 'gacha';
  let t = 0;

  // 舞台: 木の 丸い 台
  const stage = new THREE.Group();
  scene.add(stage);
  const podium = new THREE.Group();
  const pd = shape(new THREE.CylinderGeometry(1, 1.05, 1, 32), 0xc99057, 1.03);
  pd.scale.set(1.25, 0.3, 1.25);
  pd.position.y = -0.15;
  podium.add(pd);
  const grass = blob(0x8ccf5a, 1.22, 0.06, 1.22);
  grass.position.y = 0.0;
  podium.add(grass);
  toonify(podium);
  stage.add(podium);

  const machine = buildMachine();
  machine.group.scale.setScalar(0.92);
  stage.add(machine.group);
  // 出て きた カプセル
  let out = null; // { group, top, t, opened, prize }
  // きせかえを 見せる キャラ
  let doll = null; // { key, model }
  let spin = 0, spinVel = 0, dragging = false;

  function ensureRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
  }
  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fit = tab === 'gacha' ? 3.6 : 2.6;
    const dist = (fit / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 0.8 / camera.aspect);
    camera.position.set(0, fit * 0.5 + 0.4, dist);
    camera.lookAt(0, fit * 0.42, 0);
    camera.updateProjectionMatrix();
  }

  async function showDoll() {
    const key = getPicked();
    const p = getProgress();
    if (doll?.key !== key) {
      if (doll) stage.remove(doll.model.root);
      const m = await createModel(key);
      m.setPlayerColor(PLAYER_COLORS[0].hex);
      m.play('idle');
      m.setFace('happy');
      doll = { key, model: m };
      const def = CHARACTERS.find((c) => c.key === key);
      m.root.scale.setScalar(1 / (def?.size || 1));
    }
    applyLook(doll.model, p.look, key);
    doll.model.setPlayerColor(PLAYER_COLORS[0].hex);
    for (const o of [doll.model.root]) if (!o.parent) stage.add(o);
    doll.model.root.visible = tab !== 'gacha';
    machine.group.visible = tab === 'gacha';
  }

  // ── ガチャを 回す ──────────────────────────────
  let turning = false;
  async function turn() {
    if (turning) return;
    const p = getProgress();
    if (p.acorns < GACHA.price) {
      sfx.boop();
      toast(`どんぐりが あと ${GACHA.price - p.acorns}こ たりないよ。競技や 大会で ためよう!`);
      return;
    }
    turning = true;
    closePrize();
    clearOut();
    const res = drawGacha(p);
    onChange(res);
    renderBar();
    if (tab === 'gacha') renderGacha();
    // ハンドルを 1回転(カチ カチ)
    const t0 = performance.now();
    await new Promise((done) => {
      let clicks = 0;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 1100);
        machine.handle.rotation.z = -k * Math.PI * 2;
        const c = Math.floor(k * 4);
        if (c > clicks) { clicks = c; sfx.click(); }
        for (const cap of machine.caps.children) {
          cap.position.copy(cap.userData.home);
          cap.position.x += Math.sin(t * 40 + cap.id) * 0.04 * (1 - k);
          cap.position.y += Math.abs(Math.sin(t * 30 + cap.id * 2)) * 0.08 * (1 - k);
        }
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    // カプセルが ころがり 出る
    const c = capsule(RARE_COLOR[res.prize.rare], 0.3);
    c.position.set(0, 0.4, 0.85);
    stage.add(c);
    out = { group: c, top: c.getObjectByName('top'), t: 0, opened: false, res, popT: 0, prize: null };
    sfx.pop();
    turning = false;
    $('rwHint').textContent = 'カプセルを タップして あけよう!';
    $('rwHint').hidden = false;
  }
  // カプセルを あける
  function openCapsule() {
    if (!out || out.opened) return;
    out.opened = true;
    out.popT = 0;
    $('rwHint').hidden = true;
    const prize = out.res.prize;
    let thing;
    if (prize.kind === 'hat') thing = buildHat(prize.key);
    else {
      const tex = scarfTexture(prize.key, PLAYER_COLORS[0].hex);
      thing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 12, 32), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient }));
      thing.rotation.x = 1.1;
    }
    thing.scale.setScalar(prize.kind === 'hat' ? 1.5 : 1.3);
    const holder = new THREE.Group();
    holder.add(thing);
    holder.position.copy(out.group.position);
    stage.add(holder);
    out.prize = holder;
    sfx.open(prize.rare);
    setTimeout(() => showPrize(out.res), 650);
  }
  function showPrize(res) {
    const box = $('rwPrize');
    const r = res.prize.rare;
    box.className = `rwprize ${r}`;
    box.innerHTML = `<span class="rare">${RARE[r].name}</span>
      <b>${res.prize.name}</b><small>${res.prize.kind === 'hat' ? 'ぼうし・かざり' : 'スカーフの 柄'}</small>
      ${res.dup ? `<em>もう 持ってる! どんぐり +${res.refund}</em>` : '<em class="new">NEW!</em>'}
      <div class="row"><button class="plank" type="button" data-act="wear"><b>つけてみる</b></button><button class="plank again" type="button" data-act="again"><b>もう1回</b></button></div>`;
    box.hidden = false;
    box.querySelector('[data-act="wear"]').addEventListener('click', () => {
      sfx.knock();
      wear(getProgress(), res.prize.kind, res.prize.key);
      onChange({});
      closePrize();
      setTab('dress');
    });
    box.querySelector('[data-act="again"]').addEventListener('click', () => { sfx.knock(); turn(); });
  }
  function closePrize() {
    $('rwPrize').hidden = true;
  }
  // 出て いた カプセルと 中身を 片づける
  function clearOut() {
    if (!out) return;
    stage.remove(out.group);
    if (out.prize) stage.remove(out.prize);
    out = null;
  }

  // ── 下の パネル ───────────────────────────────
  function renderBar() {
    $('rwAcorns').innerHTML = `${ACORN}<b>${getProgress().acorns}</b><small>こ</small>`;
  }
  // 絵: ぼうしは 3D を 撮る、スカーフは 柄の 絵
  const icons = {};
  function hatIcon(key) {
    if (icons[key]) return icons[key];
    ensureRenderer();
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0xb8a27a, 1.7));
    const l = new THREE.DirectionalLight(0xffffff, 2);
    l.position.set(1, 3, 4);
    sc.add(l);
    const h = buildHat(key);
    h.rotation.x = 0.35;
    sc.add(h);
    const box = new THREE.Box3().setFromObject(h);
    const c = box.getCenter(new THREE.Vector3());
    const s = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 0.62;
    const cam = new THREE.OrthographicCamera(-s, s, s, -s, 0.1, 10);
    cam.position.set(c.x, c.y, 5);
    cam.lookAt(c);
    const target = new THREE.WebGLRenderTarget(128, 128);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(sc, cam);
    const px = new Uint8Array(128 * 128 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, px);
    renderer.setRenderTarget(null);
    target.dispose();
    const cv = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const g = cv.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) img.data.set(px.subarray((127 - y) * 512, (128 - y) * 512), y * 512);
    g.putImageData(img, 0, 0);
    icons[key] = cv.toDataURL();
    return icons[key];
  }
  function scarfIcon(key) {
    const id = `s:${key}`;
    if (icons[id]) return icons[id];
    const tex = scarfTexture(key, PLAYER_COLORS[0].hex);
    const cv = Object.assign(document.createElement('canvas'), { width: 96, height: 96 });
    const g = cv.getContext('2d');
    g.save();
    g.beginPath();
    g.arc(48, 48, 44, 0, 7);
    g.clip();
    g.drawImage(tex.image, 0, 0, 128, 64, 0, 0, 192, 96);
    g.restore();
    icons[id] = cv.toDataURL();
    return icons[id];
  }

  function cardHtml(kind, item, owned, on) {
    const pic = !owned ? '<span class="lock">?</span>' : item ? `<img src="${kind === 'hat' ? hatIcon(item.key) : scarfIcon(item.key)}" alt="">` : '<span class="none">なし</span>';
    const name = !item ? 'なし' : owned ? item.name : '???';
    return `<button type="button" class="rwitem ${item?.rare || ''}${on ? ' on' : ''}${owned ? '' : ' locked'}" data-kind="${kind}" data-key="${item?.key ?? ''}" ${owned ? '' : 'disabled'}>${pic}<span>${name}</span></button>`;
  }
  function renderDress() {
    const p = getProgress();
    const sec = (kind, list, title) => {
      const have = list.filter((x) => p.items[`${kind}:${x.key}`]).length;
      return `<h3>${title}<small>${have} / ${list.length}</small></h3><div class="rwgrid">${cardHtml(kind, null, true, !p.look[kind])}${list.map((x) => cardHtml(kind, x, !!p.items[`${kind}:${x.key}`], p.look[kind] === x.key)).join('')}</div>`;
    };
    $('rwBody').innerHTML = sec('hat', HATS, 'ぼうし・かざり') + sec('scarf', SCARVES, 'スカーフの 柄');
    for (const b of $('rwBody').querySelectorAll('.rwitem:not(.locked)')) {
      b.addEventListener('click', () => {
        sfx.knock();
        wear(p, b.dataset.kind, b.dataset.key || null);
        onChange({});
        renderDress();
        showDoll();
        doll?.model.play('cheer', { once: true });
        setTimeout(() => doll?.model.play('idle'), 900);
      });
    }
  }
  function renderTitles() {
    const p = getProgress();
    $('rwBody').innerHTML = `<p class="rwnote">名前の 下に 出る 称号を えらぼう。遊んで いると ふえるよ</p><div class="rwtitles">${TITLES.map((x) => {
      const has = p.titles.includes(x.key);
      return `<button type="button" class="rwtitle${has ? '' : ' locked'}${p.look.title === x.key ? ' on' : ''}" data-key="${x.key}" ${has ? '' : 'disabled'}><b>${has ? x.name : '? ? ?'}</b><small>${x.hint}</small></button>`;
    }).join('')}</div>`;
    for (const b of $('rwBody').querySelectorAll('.rwtitle:not(.locked)')) {
      b.addEventListener('click', () => { sfx.knock(); wear(p, 'title', b.dataset.key); onChange({}); renderTitles(); renderBadge(); });
    }
  }
  function renderStamps(gameName) {
    const p = getProgress();
    const n = STAMPS.filter((s) => p.stamps[s.key]).length;
    $('rwBody').innerHTML = `<h3>スタンプ帳<small>${n} / ${STAMPS.length}</small></h3><div class="rwstamps">${STAMPS.map((s, i) => {
      const got = !!p.stamps[s.key];
      const name = s.name ?? gameName(s.game);
      return `<div class="rwstamp${got ? ' got' : ''}" style="--r:${((i * 37) % 21) - 10}deg"><i>${got ? '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13 21l5 5 9-11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</i><b>${name}</b><small>${got ? new Date(p.stamps[s.key]).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : s.hint}</small></div>`;
    }).join('')}</div>`;
  }
  function renderGacha() {
    const odds = Object.entries(RARE).map(([k, r]) => `<span class="${k}">${r.name} ${r.weight}%</span>`).join('');
    const have = PRIZES.filter((x) => getProgress().items[x.id]).length;
    $('rwBody').innerHTML = `<button class="plank rwturn" type="button" id="rwTurn"><span class="ico">${ACORN}</span><span><b>まわす</b><small>どんぐり ${GACHA.price}こ</small></span></button>
      <p class="rwnote">ぼうし・かざりと スカーフの 柄が 出るよ。もう 持って いる ものが 出たら どんぐりが ${GACHA.refund}こ もどる。<br>あつめた かず ${have} / ${PRIZES.length}</p>
      <div class="rwodds">${odds}</div>`;
    $('rwTurn').addEventListener('click', () => { sfx.knock(); turn(); });
  }
  function renderBadge() {
    const p = getProgress();
    const tt = TITLES.find((x) => x.key === p.look.title);
    $('rwBadge').innerHTML = tt ? `<small>称号</small>${tt.name}` : '';
    $('rwBadge').hidden = tab === 'gacha';
  }

  let gameName = (k) => k;
  function setTab(next) {
    tab = next;
    for (const b of el.querySelectorAll('.rwtabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    closePrize();
    clearOut();
    $('rwHint').hidden = true;
    if (tab === 'gacha') renderGacha();
    else if (tab === 'dress') renderDress();
    else if (tab === 'title') renderTitles();
    else renderStamps(gameName);
    renderBadge();
    showDoll();
    if (renderer) size();
  }
  for (const b of el.querySelectorAll('.rwtabs button')) b.addEventListener('click', () => { sfx.knock(); setTab(b.dataset.tab); });

  // 舞台を さわる: ガチャは ハンドル・カプセル、キャラは まわす
  const ray = new THREE.Raycaster();
  let downX = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; downX = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || tab === 'gacha') return;
    spinVel = (e.clientX - downX) * 0.01;
    downX = e.clientX;
    spin += spinVel;
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (tab !== 'gacha') return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    if (out && !out.opened && ray.intersectObject(out.group, true).length) { openCapsule(); return; }
    if (ray.intersectObject(machine.group, true).length) { sfx.knock(); turn(); }
  });

  return {
    open(names) {
      if (names) gameName = names;
      ensureRenderer();
      renderBar();
      setTab(tab);
      requestAnimationFrame(() => size());
    },
    refresh() { renderBar(); },
    frame(dt) {
      if (!renderer) return;
      t += dt;
      // 機械: ゆらゆら、カプセルは すこし はずむ
      machine.group.rotation.y = Math.sin(t * 0.6) * 0.18;
      if (!turning) for (const c of machine.caps.children) { c.position.copy(c.userData.home); c.position.y += Math.sin(t * 2 + c.id) * 0.01; }
      if (out) {
        out.t += dt;
        const g = out.group;
        // ころがって 前へ、ぽんぽん はずむ
        const k = Math.min(1, out.t / 0.7);
        g.position.z = 0.85 + k * 0.75;
        g.position.y = 0.3 + Math.abs(Math.sin(k * Math.PI * 2.5)) * 0.4 * (1 - k);
        g.rotation.x = k * 6;
        if (!out.opened) g.rotation.y = Math.sin(t * 6) * 0.15 * (k >= 1 ? 1 : 0);
        if (out.opened) {
          out.popT += dt;
          const q = Math.min(1, out.popT / 0.5);
          out.top.position.y = q * 0.9;
          out.top.rotation.z = q * 2.4;
          out.top.position.x = q * 0.5;
          if (out.prize) {
            out.prize.position.set(0, 0.6 + q * 1.2, 1.6);
            out.prize.rotation.y += dt * 1.6;
          }
          g.scale.setScalar(Math.max(0.001, 1 - Math.max(0, out.popT - 0.5) * 2));
        }
      }
      if (doll) {
        doll.model.update(dt);
        if (!dragging) { spinVel *= 0.92; spin += spinVel; spin += (Math.sin(t * 0.5) * 0.4 - spin) * 0.01; }
        doll.model.root.rotation.y = spin;
      }
      renderer.render(scene, camera);
    },
    resize() { if (renderer) size(); },
    // E2E 用
    turn,
    openCapsule,
  };
}
