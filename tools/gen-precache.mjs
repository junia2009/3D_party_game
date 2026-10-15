// sw.js のプリキャッシュ一覧と版を書きなおす。
//
//   npm run gen:precache
//
// 配信するファイル(.github/workflows/pages.yml で _site にコピーするもの)を全部ならべ、
// その中身から版を作って、sw.js の <precache> 〜 </precache> のあいだに書く。

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// 1つずつ置くファイルと、中身を全部入れるフォルダ(viewer.html は開発用なので入れない)
export const FILES = ['index.html', 'daruma.html', 'manifest.webmanifest'];
export const DIRS = ['src', 'vendor', 'models', 'assets', 'icons'];

function walk(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const p = join(dir, name);
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p];
  });
}

export function precacheBlock() {
  const files = [...FILES, ...DIRS.flatMap(walk)].map((p) => relative(ROOT, join(ROOT, p)).split('\\').join('/')).sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(ROOT, f)));
  const version = hash.digest('hex').slice(0, 12);
  const list = ['./', ...files.map((f) => `./${f}`)];
  return `// <precache>\nconst VERSION = '${version}';\nconst PRECACHE = ${JSON.stringify(list, null, 2)};\n// </precache>`;
}

export function render(sw) {
  return sw.replace(/\/\/ <precache>[\s\S]*?\/\/ <\/precache>/, precacheBlock());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = join(ROOT, 'sw.js');
  const next = render(readFileSync(path, 'utf8'));
  writeFileSync(path, next);
  console.log('sw.js のプリキャッシュを書きなおしました');
}
