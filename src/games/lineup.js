// 競技の参加者を作る(4つの競技で共通)。
//
// ふつう(競技だけで遊ぶとき): 席 0 が自分。のこりの席は、ほかのキャラからくじで CPU(性格もくじ)。
// 大会から呼ばれたとき: 大会が決めた顔ぶれ(lineup)をそのまま使う。席 0 が自分。
//   lineup: [{ character, cpu: 性格 | null, name? }](対決なら 2 人)

import { CHARACTERS } from '../characters.js';
import { nextRandom, seedFrom } from '../rng.js';

const nameOf = (key) => CHARACTERS.find((c) => c.key === key)?.name ?? key;

export function makePlayers({ picked, lineup = null, seed, kinds, slots = 5 }) {
  if (lineup) {
    return lineup.map((l, i) => ({ id: i === 0 ? 'me' : `cpu${i}`, name: i === 0 ? 'あなた' : l.name ?? nameOf(l.character), character: l.character, cpu: i === 0 ? null : l.cpu }));
  }
  const pick = { rng: seedFrom(`${seed}:pick`) };
  const others = CHARACTERS.filter((c) => c.key !== picked).map((c) => c.key);
  const cpuChars = [];
  while (cpuChars.length < slots - 1) cpuChars.push(others.splice(Math.floor(nextRandom(pick) * others.length), 1)[0]);
  return [
    { id: 'me', name: 'あなた', character: picked, cpu: null },
    ...cpuChars.map((key, i) => ({ id: `cpu${i}`, name: nameOf(key), character: key, cpu: kinds[Math.floor(nextRandom(pick) * kinds.length)] })),
  ];
}
