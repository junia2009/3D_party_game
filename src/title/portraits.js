// キャラえらびのボタンに使う顔の絵。実物のモデルを、共有の renderer で小さく撮って画像にする。
// (別の絵を用意すると、モデルを直したときに食いちがう)

import * as THREE from 'three';
import { CHARACTERS } from '../characters.js';
import { createModel } from '../runtime/models.js';

const SIZE = 256; // 撮る大きさ。半分に縮めて使う(ふちをなめらかにするため)

export async function makePortraits(renderer, keys) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a27a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(1.5, 3, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const big = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const bg = big.getContext('2d', { willReadFrequently: true });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const shadows = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  const out = {};
  for (const key of keys) {
    const m = await createModel(key);
    m.setFace('happy');
    m.play('idle');
    m.update(0.6);
    m.root.rotation.y = 0.35;
    scene.add(m.root);
    m.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    m.node('head').getWorldPosition(head);
    // 頭の回る点が 顔のまんなかにない子(ゲスト)は、その ずれ(faceLift)だけ上げる。
    // 動かない部品は まとめて描くので、頭のノードの下には形が残っていない(箱では測れない)
    head.y += CHARACTERS.find((c) => c.key === key)?.faceLift ?? 0;
    const box = new THREE.Box3().setFromObject(m.root);
    const h = box.max.y - box.min.y;
    // 顔がまん中に大きく入るように(肩が少し見えるくらい)
    camera.position.set(head.x + h * 0.12, head.y + h * 0.05, head.z + h * 1.55);
    camera.lookAt(head.x, head.y - h * 0.04, head.z);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
    scene.remove(m.root);
    // 上下さかさまで読めるので、ひっくり返して canvas へ
    const img = bg.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    bg.putImageData(img, 0, 0);
    const small = Object.assign(document.createElement('canvas'), { width: SIZE / 2, height: SIZE / 2 });
    const sg = small.getContext('2d');
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(big, 0, 0, SIZE / 2, SIZE / 2);
    out[key] = small.toDataURL('image/png');
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = shadows;
  target.dispose();
  return out;
}
