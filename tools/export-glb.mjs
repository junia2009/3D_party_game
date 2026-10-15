// src/characters.js のキャラを models/<key>.glb に書き出す。
//
//   npm run export:glb
//
// GLTFExporter は Node でそのまま動くが、バイナリ出力の途中で
// FileReader(ブラウザにしかない)を使うので、最小限の代わりを置く。

import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { CHARACTERS, buildCharacter } from '../src/characters.js';

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
for (const def of CHARACTERS) {
  const { root, clips } = buildCharacter(def);
  root.updateMatrixWorld(true);
  const glb = await exporter.parseAsync(root, { binary: true, animations: clips });
  const file = new URL(`${def.key}.glb`, outDir);
  await writeFile(file, Buffer.from(glb));
  console.log(`${def.key}.glb  ${(glb.byteLength / 1024).toFixed(1)} KB  (${def.species} ${def.name})`);
}
