// 光と空気感: 時間帯(朝・昼・夕方・夜)、空、影、風、舞うもの。
//
// ルールには関係しない。時間帯だけは state.timeOfDay(シードで決まる)に合わせる。
// 乱数は演出なので Math.random でよい。
//
// 夜は暗くしすぎない。先生とキャラが見えないと遊べないので、月明かりを強めにして、
// カメラ側から弱い補助光を当てる。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── 時間帯ごとの設定 ─────────────────────────────────
export const TIMES = {
  morning: {
    label: 'あさ',
    zenith: 0x7fb8ea, horizon: 0xf3dcc4, fog: 0xe6dccf, fogNear: 45, fogFar: 220,
    sun: { dir: [-0.75, 0.38, 0.2], color: 0xffe9c8, intensity: 2.0 },
    hemi: { sky: 0xe3ecff, ground: 0x9fb390, intensity: 1.35 },
    fill: 0.15, disc: 0xfff4d6, rays: 0.32, rayColor: 0xfff0d0, mist: 0.6, stars: 0, birds: 'small',
  },
  day: {
    label: 'ひる',
    zenith: 0x4f9fe8, horizon: 0xcfe8f4, fog: 0xd2e7ee, fogNear: 60, fogFar: 330,
    sun: { dir: [0.35, 0.85, 0.4], color: 0xffffff, intensity: 2.3 },
    hemi: { sky: 0xffffff, ground: 0xa9c7a0, intensity: 1.5 },
    fill: 0.1, disc: 0xffffff, rays: 0.26, rayColor: 0xfffbe8, mist: 0, stars: 0, birds: 'butterfly',
  },
  evening: {
    label: 'ゆうがた',
    zenith: 0x5d64ad, horizon: 0xffa56b, fog: 0xf0b98f, fogNear: 45, fogFar: 260,
    sun: { dir: [0.55, 0.2, -0.8], color: 0xffa860, intensity: 2.3 },
    hemi: { sky: 0xffcfae, ground: 0x7a6478, intensity: 1.15 },
    fill: 0.35, disc: 0xffc070, rays: 0.28, rayColor: 0xffb070, mist: 0.2, stars: 0, birds: 'crow',
  },
  // たそがれ(遊園地): 紫の 空、ピンクの 地平線。電球が きれいに 見える
  dusk: {
    label: 'たそがれ',
    zenith: 0x34307a, horizon: 0xc9a2d8, fog: 0xb49ad0, fogNear: 80, fogFar: 340,
    sun: { dir: [0.55, 0.28, -0.8], color: 0xffb890, intensity: 1.9 },
    hemi: { sky: 0xd0c0ff, ground: 0x5a5078, intensity: 1.25 },
    fill: 0.4, disc: 0xffc8a0, rays: 0, rayColor: 0xffb090, mist: 0, stars: 0.5, birds: 'none',
  },
  night: {
    label: 'よる',
    zenith: 0x0c1636, horizon: 0x2c4472, fog: 0x22314f, fogNear: 30, fogFar: 190,
    sun: { dir: [-0.4, 0.75, -0.5], color: 0xb4c8ff, intensity: 1.3 },
    hemi: { sky: 0x7088c8, ground: 0x2a3142, intensity: 1.0 },
    fill: 0.55, disc: 0xf2f4ff, rays: 0, rayColor: 0xb4c8ff, mist: 0.3, stars: 1, birds: 'none',
  },
};

// 風: 木の葉と草をゆらす。シェーダーに少し足すだけ(CPU で頂点を動かすと重い)
const wind = { uTime: { value: 0 } };
export function addWind(material, { amount = 0.08, mode = 'tip' } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 base = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float ph = base.x * 0.37 + base.z * 0.23;
        float k = ${mode === 'tip' ? 'max(position.y, 0.0)' : '(position.y + 1.0) * 0.5'};
        float sway = sin(uTime * 1.6 + ph) * 0.7 + sin(uTime * 3.1 + ph * 1.7) * 0.3;
        transformed.x += sway * ${amount.toFixed(3)} * k;
        transformed.z += cos(uTime * 1.3 + ph) * ${(amount * 0.5).toFixed(3)} * k;
      }`);
  };
  material.customProgramCacheKey = () => `wind-${mode}-${amount}`;
  material.needsUpdate = true;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.5)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function cloudTexture() {
  const [c, g] = canvas(256, 128);
  for (let i = 0; i < 18; i++) {
    const x = 40 + Math.random() * 176, y = 60 + (Math.random() - 0.5) * 30, r = 20 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}
// 光の筋: 上が明るく下へ消えていく縦長の板
function rayTexture() {
  const [c, g] = canvas(32, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 256);
  const side = g.createLinearGradient(0, 0, 32, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 32, 256);
  return new THREE.CanvasTexture(c);
}

// opts.course: だるまさんのコースまわりにだけ置くもの(光の筋・光るキノコ・ホタルの場所)を出すか
export function createAtmosphere(scene, renderer, camera, opts = {}) {
  const course = opts.course !== false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 光
  const hemi = new THREE.HemisphereLight(0xffffff, 0xa9c7a0, 1.5);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, -11); // 影はコースのまわりだけ(広げると影がぼやける)
  const fill = new THREE.DirectionalLight(0xffffff, 0.2); // カメラ側からの補助光
  scene.add(hemi, sun, sun.target, fill);

  // 空: 内側から見る大きな球。上と地平線の色をなめらかにつなぐ
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 zenith; uniform vec3 horizon; varying vec3 vP; void main(){ float t = pow(clamp(vP.y * 1.4 + 0.05, 0.0, 1.0), 0.75); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  // 太陽・月
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), fog: false, depthWrite: false, transparent: true }));
  disc.scale.setScalar(60);
  scene.add(disc);
  // 星
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 500; i++) {
    const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.4;
    sp.push(Math.cos(a) * Math.cos(e) * 550, Math.sin(e) * 550, Math.sin(a) * Math.cos(e) * 550);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true }));
  scene.add(stars);

  // 雲
  const cloudTex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true }));
    m.scale.set(120 + Math.random() * 80, 45 + Math.random() * 20, 1);
    m.position.set(-300 + i * 75 + Math.random() * 30, 90 + Math.random() * 60, -380 + Math.random() * 120);
    scene.add(m);
    clouds.push(m);
  }

  // 谷の朝もや: 谷の上にうすい板を何枚か
  const mistTex = glowTexture('rgba(255,255,255,0.9)');
  const mists = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(160, 60), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(-60 + i * 35, -26 + (i % 3) * 4, -70 - (i % 2) * 40);
    scene.add(m);
    mists.push(m);
  }

  // 木漏れ日の光の筋(大木の茂みとコースのまわり)
  const rayMat = new THREE.MeshBasicMaterial({ map: rayTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const rayParts = [];
  // 大木の茂みの下だけ。茂みのすき間から斜めに差しこむ(空に突き出すと光の柱に見える)
  for (const [x, z, w] of [[-3.0, -15.8, 1.0], [1.6, -17.6, 0.7], [-0.6, -13.6, 0.9], [-6.0, -18.6, 1.1], [2.8, -14.8, 0.6]]) {
    for (const turn of [0, Math.PI / 2]) {
      const r = new THREE.PlaneGeometry(0.9 * w, 7.2);
      r.translate(0, -3.6, 0);
      r.rotateZ(0.22); // 少し斜めに
      r.rotateY(turn + 0.4);
      r.translate(x, 7.0, z);
      rayParts.push(r);
    }
  }
  const rays = new THREE.Mesh(mergeGeometries(rayParts), rayMat); // 16枚を1回で描く
  scene.add(rays);

  // ── 舞うもの ──
  // 舞い落ちる葉っぱ(カメラのまわりで、くり返し落ちてくる)
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -0.07);
  leafShape.quadraticCurveTo(0.05, -0.01, 0, 0.07);
  leafShape.quadraticCurveTo(-0.05, -0.01, 0, -0.07);
  const leafMat = toonMaterial(0xffffff);
  leafMat.side = THREE.DoubleSide;
  const LEAVES = 36;
  const leaves = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape, 3), leafMat, LEAVES);
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const leafState = [];
  const leafColors = [0x8fbf4a, 0xd9a43a, 0xc9632a, 0x7aa83f, 0xe0b24a];
  for (let i = 0; i < LEAVES; i++) {
    leafState.push({ p: new THREE.Vector3(), v: 0.4 + Math.random() * 0.4, ph: Math.random() * 10, spin: 1 + Math.random() * 2, age: 99 });
    leaves.setColorAt(i, new THREE.Color(leafColors[i % leafColors.length]));
  }
  scene.add(leaves);

  // ホタル(夜)・光の粒(朝と昼の光の中に浮かぶほこり)
  const FLIES = 70;
  const flyGeo = new THREE.BufferGeometry();
  const flyPos = new Float32Array(FLIES * 3);
  const flyHome = [];
  for (let i = 0; i < FLIES; i++) {
    const side = i % 2 ? 1 : -1;
    flyHome.push(new THREE.Vector3(side * (3.8 + Math.random() * 7), 0.4 + Math.random() * 2.2, 4 - Math.random() * 30));
  }
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flyMat = new THREE.PointsMaterial({ map: glowTexture('rgba(255,255,255,1)'), color: 0xd8ff7a, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const flies = new THREE.Points(flyGeo, flyMat);
  scene.add(flies);

  // 鳥・蝶: 小さな「く」の字が羽ばたきながら飛ぶ
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, 0.1, -0.4, 0, 0, -0.5, 0, 0, 0, 1, 0.1, -0.4, 0, 0, -0.5], 3));
  wingGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
  const birdMesh = new THREE.InstancedMesh(wingGeo, birdMat, 9);
  birdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  birdMesh.frustumCulled = false;
  scene.add(birdMesh);
  const birds = [];
  for (let i = 0; i < 9; i++) birds.push({ ph: Math.random() * 10, off: new THREE.Vector3((i % 3) * 2.2, (i % 4) * 0.8, Math.floor(i / 3) * 2.4) });
  const birdDummy = new THREE.Object3D();

  // 夜だけ: 道ばたの光るキノコと、先生の光る目
  const capParts = [];
  const glowPts = [];
  for (let z = -1; z > -21; z -= 2.6) {
    for (const sd of [-1, 1]) {
      const x = sd * (3.55 + Math.random() * 0.3), zz = z + Math.random();
      const cap = new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.translate(x, 0.08, zz);
      capParts.push(cap);
      glowPts.push(x, 0.16, zz);
    }
  }
  const shrooms = new THREE.Group();
  shrooms.add(new THREE.Mesh(mergeGeometries(capParts), new THREE.MeshBasicMaterial({ color: 0x9df0ff })));
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
  shrooms.add(new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTexture('rgba(150,240,255,0.9)'), size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(shrooms);
  const eyeGlowMat = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,220,90,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  let eyeGlows = [];

  let preset = TIMES.day;
  let time = 0;
  const tmp = new THREE.Vector3();

  function apply(key) {
    preset = TIMES[key] || TIMES.day;
    const p = preset;
    skyMat.uniforms.zenith.value.setHex(p.zenith);
    skyMat.uniforms.horizon.value.setHex(p.horizon);
    scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    hemi.color.setHex(p.hemi.sky);
    hemi.groundColor.setHex(p.hemi.ground);
    hemi.intensity = p.hemi.intensity;
    // 会場ごとに、時間帯の太陽の向きを変えられる(opts.sunDir: { evening: [x, y, z] })
    const dir = new THREE.Vector3(...(opts.sunDir?.[key] || p.sun.dir)).normalize();
    sun.position.copy(sun.target.position).addScaledVector(dir, 60);
    sun.color.setHex(p.sun.color);
    sun.intensity = p.sun.intensity;
    fill.intensity = p.fill;
    fill.color.setHex(key === 'night' ? 0x9fb4ff : 0xffffff);
    disc.material.color.setHex(p.disc);
    disc.position.copy(dir).multiplyScalar(500);
    disc.scale.setScalar(key === 'night' ? 34 : 70);
    // 太陽がカメラの真うしろにあると見えないので、空に出すのは見える向きのときだけ
    disc.visible = dir.z < 0.3;
    stars.material.opacity = p.stars;
    stars.visible = p.stars > 0;
    for (const c of clouds) {
      c.material.color.setHex(key === 'evening' ? 0xffc9a8 : key === 'dusk' ? 0xe8a8c8 : key === 'night' ? 0x3a4a72 : 0xffffff);
      c.material.opacity = key === 'night' ? 0.5 : 0.9;
    }
    for (const m of mists) {
      m.material.opacity = p.mist;
      m.visible = p.mist > 0;
      m.material.color.setHex(key === 'night' ? 0x6a7aa0 : key === 'evening' ? 0xffd2b0 : 0xffffff);
    }
    rayMat.color.setHex(p.rayColor);
    rayMat.opacity = p.rays;
    rays.visible = course && p.rays > 0;
    // 光の粒: 夜はホタル、朝と昼は光の中のほこり、夕方はなし
    flies.visible = key !== 'evening';
    flyMat.color.setHex(key === 'night' ? 0xd8ff7a : 0xfff6d8);
    flyMat.size = key === 'night' ? 0.4 : 0.12;
    shrooms.visible = course && key === 'night';
    for (const e of eyeGlows) e.visible = key === 'night';
    birdMat.color.setHex(p.birds === 'crow' ? 0x1c1c22 : p.birds === 'butterfly' ? 0xffd04a : 0x5a4a3a);
    birdMesh.visible = p.birds !== 'none';
    // 葉っぱは夕方に多め
    leaves.count = key === 'evening' ? LEAVES : key === 'night' ? 8 : 20;
  }

  // 影を落とす/受けるものを決める
  // 影を落とすのは、コースのまわりの立っているものだけ。地面・道・遠くの山は落とさない
  // (落とすと、影を描くための2回目の描画がそのぶん増える)
  const NO_CAST = new Set(['terrain', 'path', 'dirt']);
  function setupShadows(objects, receivers) {
    for (const o of objects) {
      o.traverse((m) => {
        if (!m.isMesh || m.isInstancedMesh || NO_CAST.has(m.name) || m.material.isMeshBasicMaterial) return;
        m.castShadow = true;
      });
    }
    for (const o of receivers) o.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
  }

  // 先生の目に光を付ける(夜だけ見える)
  function attachOwlEyes(head) {
    for (const s of [-1, 1]) {
      const g = new THREE.Sprite(eyeGlowMat);
      g.position.set(0.18 * s, 0.03, 0.5);
      g.scale.setScalar(0.5);
      g.visible = false;
      head.add(g);
      eyeGlows.push(g);
    }
  }

  function update(dt) {
    time += dt;
    wind.uTime.value = time;
    fill.position.copy(camera.position).add(tmp.set(0, 4, 0));
    fill.target.position.set(0, 0, camera.position.z - 10);
    fill.target.updateMatrixWorld();
    sky.position.copy(camera.position);
    for (const c of clouds) {
      c.position.x += dt * 2.5;
      if (c.position.x > 380) c.position.x = -380;
    }
    // 舞い落ちる葉
    for (let i = 0; i < leaves.count; i++) {
      const L = leafState[i];
      L.age += dt;
      if (L.age > 9 || L.p.y < 0.05) {
        L.p.set(camera.position.x + (Math.random() - 0.5) * 14, 5 + Math.random() * 5, camera.position.z - 3 - Math.random() * 16);
        L.age = 0;
      }
      L.p.y -= L.v * dt;
      L.p.x += Math.sin(time * 1.3 + L.ph) * dt * 0.6 + dt * 0.25;
      L.p.z += Math.cos(time * 0.9 + L.ph) * dt * 0.3;
      dummyLeaf.position.copy(L.p);
      dummyLeaf.rotation.set(time * L.spin + L.ph, time * 0.7 + L.ph, Math.sin(time * 2 + L.ph) * 0.8);
      dummyLeaf.updateMatrix();
      leaves.setMatrixAt(i, dummyLeaf.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
    // 光の粒・ホタル: ふわふわ漂って、ゆっくり明滅
    if (flies.visible) {
      for (let i = 0; i < FLIES; i++) {
        const h = flyHome[i];
        flyPos[i * 3] = h.x + Math.sin(time * 0.5 + i) * 0.8;
        flyPos[i * 3 + 1] = h.y + Math.sin(time * 0.8 + i * 1.7) * 0.3;
        flyPos[i * 3 + 2] = h.z + Math.cos(time * 0.4 + i * 0.3) * 0.8;
      }
      flyGeo.attributes.position.needsUpdate = true;
      flyMat.opacity = 0.65 + 0.35 * Math.sin(time * 2.2);
    }
    // 光の筋がわずかに揺らぐ
    rayMat.opacity = preset.rays * (0.85 + 0.15 * Math.sin(time * 0.7));
    // 鳥・蝶
    const kind = preset.birds;
    const flap = Math.sin(time * (kind === 'butterfly' ? 14 : 9));
    const wp = wingGeo.attributes.position;
    wp.setY(1, 0.1 + flap * 0.5);
    wp.setY(4, 0.1 + flap * 0.5);
    wp.needsUpdate = true;
    birds.forEach((b, i) => {
      if (kind === 'butterfly') {
        // 花のまわりをひらひら
        const cx = (i % 2 ? 1 : -1) * (5 + (i % 3) * 1.5), cz = -2 - i * 2.2;
        birdDummy.position.set(cx + Math.sin(time * 0.7 + b.ph) * 1.2, 0.6 + Math.sin(time * 1.9 + b.ph) * 0.3, cz + Math.cos(time * 0.5 + b.ph) * 1.2);
        birdDummy.rotation.set(0, time * 0.7 + b.ph, 0);
        birdDummy.scale.setScalar(0.12);
      } else {
        // 空を横切る群れ
        const t = ((time * 0.06 + (i < 5 ? 0 : 0.5)) % 1);
        birdDummy.position.set(-140 + t * 280 + b.off.x, 34 + b.off.y + Math.sin(time + b.ph) * 0.5, -70 + b.off.z);
        birdDummy.rotation.set(0, -Math.PI / 2, 0);
        birdDummy.scale.setScalar(kind === 'crow' ? 1.1 : 0.7);
      }
      birdDummy.updateMatrix();
      birdMesh.setMatrixAt(i, birdDummy.matrix);
    });
    birdMesh.instanceMatrix.needsUpdate = true;
  }
  const dummyLeaf = new THREE.Object3D();

  apply('day');
  return { apply, update, setupShadows, attachOwlEyes, sun, hemi };
}

// 木や草に風を入れる(stage が作ったものを、名前で探して材質に足す)
export function windify(root) {
  root.traverse((o) => {
    if (!o.isInstancedMesh && !o.isMesh) return;
    if (o.name === 'grassTufts') addWind(o.material, { amount: 0.25, mode: 'tip' });
    if (o.name === 'crowns') addWind(o.material, { amount: 0.05, mode: 'whole' });
    // 大木の葉はまとめて1つのメッシュになっている。座標が高さそのものなので、高いほど大きく揺れる
    if (o.isMesh && o.parent?.name === 'oakCrowns') addWind(o.material, { amount: 0.006, mode: 'tip' });
  });
}
