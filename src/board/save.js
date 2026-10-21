// 大会の とちゅうを 端末に 保存する(つづきから 遊べるように)。
//
// ページが 読み込みなおされても(スマホの メモリ不足・うっかり 閉じた など)、さいごの 手番から つづけられる。
// 大会の 状態(rules.js の s)は ふつうの データ(乱数も 数ひとつ)なので、そのまま JSON に できる。
// CPU も 乱数を 持っているので いっしょに しまう。競技の とちゅうなら、その 競技を はじめから やりなおす。
//
// storage は ふつう localStorage。テストでは ちがう ものを わたせる。

const KEY = 'dongurinpic.taikai';
const VERSION = 1;

const store = (storage) => storage ?? globalThis.localStorage;

// data: { picked, seed, players, s, cpus }
export function saveTaikai(data, storage) {
  try {
    store(storage).setItem(KEY, JSON.stringify({ v: VERSION, savedAt: Date.now(), ...data }));
  } catch {
    // 保存できない環境(プライベートブラウズなど)では あきらめる
  }
}

export function loadTaikai(storage) {
  try {
    const d = JSON.parse(store(storage).getItem(KEY) || 'null');
    if (!d || d.v !== VERSION || !d.s || !Array.isArray(d.players) || d.s.phase === 'finished') return null;
    return d;
  } catch {
    return null;
  }
}

export function clearTaikai(storage) {
  try {
    store(storage).removeItem(KEY);
  } catch {
    // なにもしない
  }
}
