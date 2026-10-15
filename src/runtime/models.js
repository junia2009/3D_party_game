// glb のキャラをゲームで使うための薄い包み。
//
// - 素材をトゥーン調に差し替える(glb はふつうの PBR で入っている)
// - アニメーションを名前で切り替える(フェード付き)
// - 表情(face_*)とプレイヤーの色(player_color)を切り替える
//
// 約束ごと(ノード名・マテリアル名)は README の「glb の約束ごと」。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeSkinned } from './merge.js';
import { lineColor } from '../model-kit.js';

const BASE = new URL('../../models/', import.meta.url);

export const toonGradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export function toonMaterial(color) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });
}

const loader = new GLTFLoader();
const cache = new Map();
function loadGltf(key) {
  if (!cache.has(key)) cache.set(key, loader.loadAsync(new URL(`${key}.glb`, BASE).href));
  return cache.get(key);
}
export function preload(keys) {
  return Promise.all(keys.map(loadGltf));
}

// 1体ぶんの実体。同じ glb から何体作っても、色や表情は別々に持てる。
export async function createModel(key) {
  const gltf = await loadGltf(key);
  const root = gltf.scene.clone(true);
  const swap = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!swap.has(m)) {
      let next = m;
      if (m.isMeshStandardMaterial) {
        next = toonMaterial(m.color);
        next.name = m.name;
      } else if (m.name.startsWith('player')) {
        next = m.clone();
      }
      swap.set(m, next);
    }
    o.material = swap.get(m);
  });
  // いっしょに動く部品はまとめて描く。動く部品(アニメーションが動かすノード)と、
  // 切り替える部品(表情・星)はまとめずに残す
  const animated = new Set();
  for (const clip of gltf.animations) for (const t of clip.tracks) animated.add(t.name.split('.')[0]);
  mergeSkinned(root, (o) => animated.has(o.name) || o.name.startsWith('face_') || o.name === 'stars');
  return new Model(root, gltf.animations);
}

export class Model {
  constructor(root, animations) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = Object.fromEntries(animations.map((a) => [a.name, this.mixer.clipAction(a)]));
    this.current = null;
    this.faces = {};
    this.mats = {};
    root.traverse((o) => {
      if (o.name.startsWith('face_')) this.faces[o.name.slice(5)] = o;
      if (o.isMesh && o.material.name.startsWith('player')) this.mats[o.material.name] = o.material;
    });
    this.face = null;
  }

  node(name) {
    return this.root.getObjectByName(name);
  }

  play(name, { fade = 0.2, timeScale = 1, once = false } = {}) {
    const next = this.actions[name];
    if (!next) return;
    next.timeScale = timeScale;
    if (this.current === name) return;
    const prev = this.current && this.actions[this.current];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (prev) prev.crossFadeTo(next, fade, false);
    this.current = name;
  }

  // 使わない表情は大きさ 0 にして消す(体はまとめて1つに描いているので、visible では消せない)
  setFace(key) {
    if (this.face === key || !this.faces[key]) return;
    for (const [k, node] of Object.entries(this.faces)) node.scale.setScalar(k === key ? 1 : 0);
    this.face = key;
  }

  setPlayerColor(hex) {
    this.mats.player_color?.color.setHex(hex);
    this.mats.player_outline?.color.copy(lineColor(hex));
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
