// src/characters.js のキャラを models/<key>.glb に書き出す。
//
//   npm run export:glb
//
// GLTFExporter は Node でそのまま動くが、バイナリ出力の途中で
// FileReader(ブラウザにしかない)を使うので、最小限の代わりを置く。

import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { CHARACTERS, buildCharacter } from '../src/characters.js';
import { NPCS } from '../src/npcs.js';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildRay } from '../src/guests/ray.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,` + Buffer.from(buf).toString('base64');
      this.onloadend?.();
    });
  }
};

const outDir = new URL('../models/', import.meta.url);
await mkdir(outDir, { recursive: true });

const exporter = new GLTFExporter();
// ゲスト(ほかのゲームから来た子)は、もらった glb の形をそのまま使って組みなおす(src/guests/)
async function loadSource(name) {
  const buf = await readFile(new URL(`source/${name}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  return gltf.scene;
}
const raySrc = await loadSource('ray.glb');
const GUEST_BUILD = { ray: () => buildRay(raySrc) };
const ONLY = process.argv[2]; // 1体だけ書き出すとき(例: npm run export:glb -- ray)
const jobs = [
  ...CHARACTERS.map((def) => ({ key: def.key, label: `${def.species} ${def.name}`, build: def.guest ? GUEST_BUILD[def.key] : () => buildCharacter(def) })),
  ...NPCS,
];
for (const job of jobs.filter((j) => !ONLY || j.key === ONLY)) {
  const { root, clips } = job.build();
  root.updateMatrixWorld(true);
  const glb = await exporter.parseAsync(root, { binary: true, animations: clips });
  await writeFile(new URL(`${job.key}.glb`, outDir), Buffer.from(glb));
  console.log(`${job.key}.glb  ${(glb.byteLength / 1024).toFixed(1)} KB  (${job.label})`);
}
