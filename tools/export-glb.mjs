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
const jobs = [
  ...CHARACTERS.map((def) => ({ key: def.key, label: `${def.species} ${def.name}`, build: () => buildCharacter(def) })),
  ...NPCS,
];
for (const job of jobs) {
  const { root, clips } = job.build();
  root.updateMatrixWorld(true);
  const glb = await exporter.parseAsync(root, { binary: true, animations: clips });
  await writeFile(new URL(`${job.key}.glb`, outDir), Buffer.from(glb));
  console.log(`${job.key}.glb  ${(glb.byteLength / 1024).toFixed(1)} KB  (${job.label})`);
}
