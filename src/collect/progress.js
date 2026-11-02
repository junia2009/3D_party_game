// ごほうびの 記録(どんぐり貯金・持ちもの・きせかえ・称号・スタンプ)。THREE にも DOM にも 触らない。
//
// 記録(p)は ただの オブジェクト。かえる 関数は p を 書きかえて、起きた ことを かえす(画面が 知らせに つかう)。
// 保存は load/save(localStorage。使えなければ 毎回 まっさら)。
// ガチャの 乱数は p.rng(src/rng.js)。はじめて 作る ときに たねを きめる。

import { nextRandom, seedFrom } from '../rng.js';
import { EARN, GACHA, PRIZES, RARE, STAMPS, TITLES, prizeById } from './catalog.js';

export const STORE_KEY = 'dongurinpic.collect';

export function freshProgress(seed = Date.now()) {
  return {
    v: 1,
    acorns: 0, // いま ある どんぐり
    rng: seedFrom(`collect:${seed}`),
    items: {}, // { 'hat:crown': 出た 回数 }
    look: { hat: null, scarf: null, title: 'rookie' }, // いま つけて いる もの
    stamps: {}, // { key: おした 日(ミリ秒) }
    titles: ['rookie'], // もらった 称号
    stats: { plays: 0, wins: 0, taikaiPlays: 0, taikaiWins: 0, onlinePlays: 0, gacha: 0, earned: 0, firsts: {}, stageWins: {} },
  };
}

// 古い・こわれた 記録を まっさらの 形に そろえる
export function normalize(raw) {
  const p = freshProgress();
  if (!raw || typeof raw !== 'object') return p;
  if (Number.isFinite(raw.acorns)) p.acorns = Math.max(0, Math.floor(raw.acorns));
  if (Number.isFinite(raw.rng)) p.rng = raw.rng | 0;
  if (raw.items && typeof raw.items === 'object') for (const [k, n] of Object.entries(raw.items)) if (prizeById(k) && n > 0) p.items[k] = n | 0;
  if (raw.stamps && typeof raw.stamps === 'object') for (const [k, t] of Object.entries(raw.stamps)) if (STAMPS.some((s) => s.key === k)) p.stamps[k] = t;
  if (Array.isArray(raw.titles)) p.titles = [...new Set(['rookie', ...raw.titles.filter((k) => TITLES.some((t) => t.key === k))])];
  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of ['plays', 'wins', 'taikaiPlays', 'taikaiWins', 'onlinePlays', 'gacha', 'earned']) if (Number.isFinite(raw.stats[k])) p.stats[k] = raw.stats[k];
    if (raw.stats.firsts && typeof raw.stats.firsts === 'object') p.stats.firsts = { ...raw.stats.firsts };
    if (raw.stats.stageWins && typeof raw.stats.stageWins === 'object') p.stats.stageWins = { ...raw.stats.stageWins };
  }
  const look = raw.look || {};
  if (look.hat && p.items[`hat:${look.hat}`]) p.look.hat = look.hat;
  if (look.scarf && p.items[`scarf:${look.scarf}`]) p.look.scarf = look.scarf;
  if (look.title && p.titles.includes(look.title)) p.look.title = look.title;
  return p;
}

export function loadProgress(storage = globalThis.localStorage) {
  try { return normalize(JSON.parse(storage?.getItem(STORE_KEY) || 'null')); } catch { return freshProgress(); }
}
export function saveProgress(p, storage = globalThis.localStorage) {
  try { storage?.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* 保存できなくても 遊べる */ }
}

// スタンプ・称号を 見なおして、新しく もらえた ものを かえす
const statsView = (p) => ({ ...p.stats, owned: Object.keys(p.items).length });
export function refresh(p, now = Date.now()) {
  const st = statsView(p);
  const stamps = [];
  for (const s of STAMPS) if (!p.stamps[s.key] && s.test(st)) { p.stamps[s.key] = now; stamps.push(s.key); }
  const titles = [];
  for (const t of TITLES) if (!p.titles.includes(t.key) && t.test(st)) { p.titles.push(t.key); titles.push(t.key); }
  return { stamps, titles };
}

function addAcorns(p, n) {
  p.acorns += n;
  p.stats.earned += n;
}

// 競技を 1本 あそんだ。place は 0 が 1位、count は 人数(ranking の 長さ)
export function recordGame(p, { game, place, count = 5, online = false }) {
  const table = EARN.game;
  const acorns = table[Math.min(place, table.length - 1, Math.max(0, count - 1))] ?? table[table.length - 1];
  p.stats.plays++;
  if (online) p.stats.onlinePlays++;
  if (place === 0) {
    p.stats.wins++;
    p.stats.firsts[game] = (p.stats.firsts[game] || 0) + 1;
  }
  addAcorns(p, acorns);
  return { acorns, ...refresh(p) };
}

// 大会を さいごまで あそんだ
export function recordTaikai(p, { stage, place, turns = 10, online = false }) {
  const base = EARN.taikai[Math.min(place, EARN.taikai.length - 1)];
  const acorns = Math.round((base * turns) / 10);
  p.stats.plays++;
  p.stats.taikaiPlays++;
  if (online) p.stats.onlinePlays++;
  if (place === 0) {
    p.stats.taikaiWins++;
    p.stats.stageWins[stage] = (p.stats.stageWins[stage] || 0) + 1;
  }
  addAcorns(p, acorns);
  return { acorns, ...refresh(p) };
}

// ガチャを 1回。どんぐりが たりなければ null
export function drawGacha(p) {
  if (p.acorns < GACHA.price) return null;
  p.acorns -= GACHA.price;
  p.stats.gacha++;
  // まず めずらしさを くじで、つぎに その 中から 1つ
  const total = Object.values(RARE).reduce((a, r) => a + r.weight, 0);
  let x = nextRandom(p) * total, rare = 'n';
  for (const [k, r] of Object.entries(RARE)) { if (x < r.weight) { rare = k; break; } x -= r.weight; }
  const pool = PRIZES.filter((q) => q.rare === rare);
  const prize = pool[Math.floor(nextRandom(p) * pool.length)];
  const dup = !!p.items[prize.id];
  p.items[prize.id] = (p.items[prize.id] || 0) + 1;
  if (dup) p.acorns += GACHA.refund;
  return { prize, dup, refund: dup ? GACHA.refund : 0, ...refresh(p) };
}

// つける / はずす(持って いない ものは つけられない)
export function wear(p, kind, key) {
  if (kind === 'title') {
    if (!p.titles.includes(key)) return false;
    p.look.title = key;
    return true;
  }
  if (key !== null && !p.items[`${kind}:${key}`]) return false;
  p.look[kind] = key;
  return true;
}
