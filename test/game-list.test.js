import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MINIGAMES } from '../src/board/rules.js';

// 競技を 足したのに、ゲーム一覧(index.html の カード)・タイトルの 一覧(title.js の GAMES)・絵 を わすれていないか
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const title = readFileSync(new URL('../src/title/title.js', import.meta.url), 'utf8');

test('大会の 競技は みんな、ゲーム一覧の カードと 絵と タイトルの 一覧に ある', () => {
  for (const key of MINIGAMES) {
    assert.ok(html.includes(`data-open="${key}"`), `${key} の カード(index.html)`);
    assert.ok(existsSync(new URL(`../assets/thumbs/${key}.jpg`, import.meta.url)), `${key} の 絵`);
    assert.ok(new RegExp(`^  ${key}: \\{`, 'm').test(title), `${key}(title.js の GAMES)`);
  }
});
