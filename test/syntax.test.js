import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// ブラウザが 読む ファイルが ぜんぶ 文法として 正しいか(テストから 読まれない 画面の コードも 見る)
function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('src/ の ファイルは みんな 文法が 正しい', () => {
  const root = new URL('../src/', import.meta.url).pathname;
  const bad = [];
  for (const f of files(root)) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad.push(`${f}: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`); }
  }
  assert.deepEqual(bad, []);
});
