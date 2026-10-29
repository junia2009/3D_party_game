// 競技の参加者を作る(4つの競技で共通)。
//
// ふつう(競技だけで遊ぶとき): 席 0 が自分。のこりの席は、ほかのキャラからくじで CPU(性格もくじ)。
// 大会から呼ばれたとき: 大会が決めた顔ぶれ(lineup)をそのまま使う。席 0 が自分(オンラインでは me)。
//   lineup: [{ character, cpu: 性格 | null, name? }](対決なら 2 人)

import { CHARACTERS } from '../characters.js';
import { nextRandom, seedFrom } from '../rng.js';

const nameOf = (key) => CHARACTERS.find((c) => c.key === key)?.name ?? key;

// オンライン: lineup の 人の 席は cpu: null(human: true)。自分の 席は me。
export function makePlayers({ picked, lineup = null, seed, kinds, slots = 5, me = 0 }) {
  if (lineup) {
    return lineup.map((l, i) => ({
      id: i === me ? 'me' : l.human ? `p${i}` : `cpu${i}`,
      name: i === me ? 'あなた' : l.name ?? nameOf(l.character),
      character: l.character,
      cpu: i === me || l.human ? null : l.cpu,
      human: !!l.human,
    }));
  }
  const pick = { rng: seedFrom(`${seed}:pick`) };
  // ゲスト(ほかのゲームから来た子)は CPU には出てこない
  const others = CHARACTERS.filter((c) => c.key !== picked && !c.guest).map((c) => c.key);
  const cpuChars = [];
  while (cpuChars.length < slots - 1) cpuChars.push(others.splice(Math.floor(nextRandom(pick) * others.length), 1)[0]);
  return [
    { id: 'me', name: 'あなた', character: picked, cpu: null },
    ...cpuChars.map((key, i) => ({ id: `cpu${i}`, name: nameOf(key), character: key, cpu: kinds[Math.floor(nextRandom(pick) * kinds.length)] })),
  ];
}
