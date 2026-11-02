// ごほうびの 一覧(データだけ。THREE にも DOM にも 触らない。サーバーも 読む)。
//
// - ぼうし・かざり(hat)と スカーフの 柄(scarf)は どんぐりガチャで 出る。rare: 'n' ふつう / 'r' レア / 's' とくべつ
// - 称号(title)は スタンプの 数や 遊んだ 回数で もらえる(ガチャでは 出ない)
// - スタンプ(stamp)は やった ことごとに 1つ。スタンプ帳に おされる
//
// key は セーブと オンラインで そのまま 使う。名前を かえても key は かえない

import { MINIGAMES } from '../board/rules.js';

export const HATS = [
  { key: 'acorn', name: 'どんぐりぼうし', rare: 'n' },
  { key: 'leaf', name: 'はっぱの かざり', rare: 'n' },
  { key: 'flower', name: '花かんむり', rare: 'n' },
  { key: 'straw', name: 'むぎわらぼうし', rare: 'n' },
  { key: 'ribbon', name: 'おおきな リボン', rare: 'n' },
  { key: 'knit', name: 'ニットぼう', rare: 'n' },
  { key: 'cap', name: 'キャップ', rare: 'n' },
  { key: 'mushroom', name: 'きのこの かさ', rare: 'n' },
  { key: 'beret', name: 'ベレーぼう', rare: 'r' },
  { key: 'chef', name: 'コックぼう', rare: 'r' },
  { key: 'pirate', name: '海賊ぼうし', rare: 'r' },
  { key: 'tophat', name: 'シルクハット', rare: 'r' },
  { key: 'wizard', name: 'まほうの ぼうし', rare: 'r' },
  { key: 'crown', name: '王かん', rare: 's' },
  { key: 'halo', name: '天使の わっか', rare: 's' },
  { key: 'gold', name: '金の どんぐりぼうし', rare: 's' },
];

export const SCARVES = [
  { key: 'stripe', name: 'しましま', rare: 'n' },
  { key: 'dots', name: '水玉', rare: 'n' },
  { key: 'check', name: 'チェック', rare: 'n' },
  { key: 'wave', name: 'なみなみ', rare: 'n' },
  { key: 'heart', name: 'ハート', rare: 'r' },
  { key: 'star', name: 'お星さま', rare: 'r' },
  { key: 'flowers', name: '花がら', rare: 'r' },
  { key: 'rainbow', name: 'にじいろ', rare: 's' },
];

export const RARE = {
  n: { name: 'ふつう', weight: 70 },
  r: { name: 'レア', weight: 25 },
  s: { name: 'とくべつ', weight: 5 },
};

// ガチャ・どんぐり
export const GACHA = {
  price: 100, // 1回の どんぐり
  refund: 30, // もう 持って いる ものが 出たら 返す どんぐり
};

// 遊んで もらえる どんぐり(順位 → 数)。人数が 少ない 競技(対決など)は 上から 使う
export const EARN = {
  game: [30, 20, 15, 10, 8], // 競技 1本
  taikai: [150, 100, 80, 60, 50], // 大会(10ターン)。ターン数で 増減(5ターンは 半分、15ターンは 1.5ばい)
};

// ガチャの 中身(ぼうしと スカーフ)
export const PRIZES = [
  ...HATS.map((h) => ({ ...h, kind: 'hat', id: `hat:${h.key}` })),
  ...SCARVES.map((h) => ({ ...h, kind: 'scarf', id: `scarf:${h.key}` })),
];
export const prizeById = (id) => PRIZES.find((p) => p.id === id) ?? null;

// ── スタンプ ─────────────────────────────
// test(st) は 記録(stats)を 見て おせるか きめる。gameName は 競技の 名前(画面で わたす)
export const STAMPS = [
  { key: 'first', name: 'はじめの 一歩', hint: '競技か 大会を 1回 あそぶ', test: (st) => st.plays >= 1 },
  { key: 'play10', name: 'あそびずき', hint: '10回 あそぶ', test: (st) => st.plays >= 10 },
  { key: 'play50', name: '森の 常連さん', hint: '50回 あそぶ', test: (st) => st.plays >= 50 },
  { key: 'win1', name: 'はじめての 1位', hint: '競技で 1位に なる', test: (st) => st.wins >= 1 },
  { key: 'win10', name: '1位 10回', hint: '競技で 10回 1位に なる', test: (st) => st.wins >= 10 },
  { key: 'taikai1', name: '大会 さんか', hint: '大会を さいごまで あそぶ', test: (st) => st.taikaiPlays >= 1 },
  { key: 'champ', name: 'はじめての 優勝', hint: '大会で 優勝する', test: (st) => st.taikaiWins >= 1 },
  { key: 'champ-shiki', name: '四季の森 優勝', hint: '四季の森で 優勝する', test: (st) => !!st.stageWins.shiki },
  { key: 'champ-yuen', name: 'どんぐり遊園地 優勝', hint: 'どんぐり遊園地で 優勝する', test: (st) => !!st.stageWins.yuen },
  { key: 'champ-umi', name: '海の中の 探検 優勝', hint: '海の中の 探検で 優勝する', test: (st) => !!st.stageWins.umi },
  { key: 'online', name: 'みんなで あそんだ', hint: 'オンラインで あそぶ', test: (st) => st.onlinePlays >= 1 },
  { key: 'gacha1', name: 'はじめての ガチャ', hint: 'どんぐりガチャを 回す', test: (st) => st.gacha >= 1 },
  { key: 'rich', name: 'どんぐり 1000こ', hint: 'どんぐりを あわせて 1000こ ためる', test: (st) => st.earned >= 1000 },
  { key: 'collect10', name: 'おしゃれさん', hint: 'ぼうしか スカーフを 10しゅるい あつめる', test: (st) => st.owned >= 10 },
  { key: 'collectAll', name: 'ぜんぶ そろった!', hint: 'ガチャの 中身を ぜんぶ あつめる', test: (st) => st.owned >= PRIZES.length },
  // 競技ごと: 1位に なった
  ...MINIGAMES.map((g) => ({ key: `g-${g}`, game: g, name: null, hint: '1位に なる', test: (st) => (st.firsts[g] || 0) >= 1 })),
];
export const stampByKey = (k) => STAMPS.find((s) => s.key === k) ?? null;

// ── 称号 ─────────────────────────────
// スタンプや 記録で もらえる。名前の 下に 出る
export const TITLES = [
  { key: 'rookie', name: '森の しんまい', hint: 'さいしょから', test: () => true },
  { key: 'player', name: 'あそびずき', hint: '10回 あそぶ', test: (st) => st.plays >= 10 },
  { key: 'regular', name: '森の 常連さん', hint: '50回 あそぶ', test: (st) => st.plays >= 50 },
  { key: 'winner', name: '1位の 子', hint: '競技で 1位に なる', test: (st) => st.wins >= 1 },
  { key: 'ace', name: '競技の エース', hint: '競技で 10回 1位', test: (st) => st.wins >= 10 },
  { key: 'allround', name: 'なんでも 名人', hint: '10しゅるいの 競技で 1位', test: (st) => Object.keys(st.firsts).length >= 10 },
  { key: 'master', name: '森の 大名人', hint: 'ぜんぶの 競技で 1位', test: (st) => MINIGAMES.every((g) => st.firsts[g]) },
  { key: 'champ', name: '優勝者', hint: '大会で 優勝', test: (st) => st.taikaiWins >= 1 },
  { key: 'forest', name: '四季の 王者', hint: '四季の森で 優勝', test: (st) => !!st.stageWins.shiki },
  { key: 'park', name: '遊園地の スター', hint: 'どんぐり遊園地で 優勝', test: (st) => !!st.stageWins.yuen },
  { key: 'sea', name: '海の 探検家', hint: '海の中の 探検で 優勝', test: (st) => !!st.stageWins.umi },
  { key: 'legend', name: '伝説の チャンピオン', hint: 'ぜんぶの ステージで 優勝', test: (st) => ['shiki', 'yuen', 'umi'].every((k) => st.stageWins[k]) },
  { key: 'friend', name: 'みんなの なかま', hint: 'オンラインで 10回 あそぶ', test: (st) => st.onlinePlays >= 10 },
  { key: 'rich', name: 'どんぐり長者', hint: 'どんぐりを あわせて 1000こ', test: (st) => st.earned >= 1000 },
  { key: 'fashion', name: 'おしゃれさん', hint: '10しゅるい あつめる', test: (st) => st.owned >= 10 },
  { key: 'complete', name: 'コレクター', hint: 'ガチャの 中身を ぜんぶ', test: (st) => st.owned >= PRIZES.length },
];
export const titleByKey = (k) => TITLES.find((t) => t.key === k) ?? null;

// オンラインで ほかの 人から とどいた 見た目を たしかめる(知らない key は すてる)
export function cleanLook(look) {
  const out = {};
  if (look && typeof look === 'object') {
    if (HATS.some((h) => h.key === look.hat)) out.hat = look.hat;
    if (SCARVES.some((h) => h.key === look.scarf)) out.scarf = look.scarf;
    if (TITLES.some((t) => t.key === look.title)) out.title = look.title;
  }
  return out;
}
