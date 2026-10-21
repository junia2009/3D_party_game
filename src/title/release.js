// 競技の 会場を 片づける(メモリを 返す)。
//
// 競技は 組み立てると、3D の 会場(形・材質・テクスチャ)と、window や ボタンへの 入力の 受け口を 持つ。
// 受け口が のこっていると、そこから 会場ぜんぶが つながったままで、ブラウザが メモリを 返せない。
// 大会で 競技を 次々に 遊ぶと メモリが ふくらみつづけて、スマホでは ページごと 読み込みなおされてしまう。
//
// そこで 組み立てる あいだに 付けられた 受け口を 記録しておき、片づける ときに ぜんぶ はずす。
// 会場の 形・材質・テクスチャは dispose して GPU の メモリも 返す(また 使えば three が のせなおす)。

import * as THREE from 'three';

let recording = null;
const add = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, fn, opts) {
  if (recording) recording.push([this, type, fn, opts]);
  return add.call(this, type, fn, opts);
};

// build() の あいだに 付いた 受け口と、window に 生えた 確認用の 口(dxxx)を 記録する
export async function recordBuild(build) {
  const listeners = [];
  const before = new Set(Object.keys(window));
  const prev = recording;
  recording = listeners;
  try {
    const value = await build();
    return { value, listeners, globals: Object.keys(window).filter((k) => !before.has(k)) };
  } finally {
    recording = prev;
  }
}

export function disposeScene(scene) {
  const done = new Set();
  const free = (o) => { if (o && !done.has(o)) { done.add(o); o.dispose(); } };
  scene.traverse((o) => {
    free(o.geometry);
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) free(v);
      for (const u of Object.values(m.uniforms || {})) if (u?.value instanceof THREE.Texture) free(u.value);
      free(m);
    }
  });
  if (scene.background instanceof THREE.Texture) free(scene.background);
  scene.clear();
}

// 記録した ものを 使って 片づける
export function release({ value, listeners, globals }) {
  for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
  listeners.length = 0;
  for (const k of globals) delete window[k];
  if (value?.scene) disposeScene(value.scene);
}
