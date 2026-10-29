// BGM の 楽譜。音は 鳴らさない(データと 読みかただけ)。鳴らすのは player.js。
//
// 1こま = 8分音符。1小節 = 8こま。トラックは こまを 空白で ならべた 文字列:
//   C5 / Bb4 / F#3 … 音を 出す   - … ひとつ 前の 音を のばす   . … やすみ   | … 小節の 区切り(読みとばす)
//   C4+E4+G4 … 和音      k t s … たいこ(k ひくい ぽこ・t たかい ぽこ・s シェイカー。大文字は つよく)
//
// 森の 木の おもちゃの 音: 木琴(marimba)・オカリナ(ocarina)・木の ベース(bass)・
// てっきん(glock)・ぽこぽこ たいこ(drum)。

export const STEPS_PER_BAR = 8;

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 音の 名前 → 高さ(Hz)。A4 = 440
export function noteFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const midi = 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

export const seq = (str) => str.split(/\s+/).filter((t) => t && t !== '|');

// 和音の 名前 → 構成音(ねいろが まるく なる 高さで)
const CHORDS = {
  C: ['C4', 'E4', 'G4'], Dm: ['D4', 'F4', 'A4'], Em: ['E4', 'G4', 'B4'], F: ['F4', 'A4', 'C5'],
  G: ['G3', 'B3', 'D4'], G7: ['G3', 'B3', 'F4'], Am: ['A3', 'C4', 'E4'], Bb: ['Bb3', 'D4', 'F4'],
};
const ROOT = { C: 'C3', Dm: 'D3', Em: 'E2', F: 'F2', G: 'G2', G7: 'G2', Am: 'A2', Bb: 'Bb2' };
const FIFTH = { C: 'G2', Dm: 'A2', Em: 'B2', F: 'C3', G: 'D3', G7: 'D3', Am: 'E3', Bb: 'F3' };
const up = (n) => n.replace(/-?\d$/, (o) => String(Number(o) + 1));

// 小節ごとの 和音(「Dm G」は 半分ずつ)を、こまごとの 和音に ひらく
function chordAt(chords, step) {
  const bar = chords[Math.floor(step / STEPS_PER_BAR)].split(' ');
  return bar[Math.floor(((step % STEPS_PER_BAR) / STEPS_PER_BAR) * bar.length)];
}
// 1小節の もよう を 和音に あてて トラックに する。
//   0 1 2 … 和音の 何ばんめの 音   3 … 1ばんめの 1オクターブ 上   x … 和音 ぜんぶ   r f o … ベースの 根音・5度・根音の 上   . - … そのまま
export function fromChords(chords, pattern) {
  const pat = seq(pattern);
  const out = [];
  for (let i = 0; i < chords.length * STEPS_PER_BAR; i++) {
    const p = pat[i % pat.length];
    const c = chordAt(chords, i);
    const tones = CHORDS[c];
    if (p === '.' || p === '-') out.push(p);
    else if (p === 'x') out.push(tones.join('+'));
    else if (p === 'r') out.push(ROOT[c]);
    else if (p === 'f') out.push(FIFTH[c]);
    else if (p === 'o') out.push(up(ROOT[c]));
    else if (p === '3') out.push(up(tones[0]));
    else out.push(tones[Number(p)]);
  }
  return out;
}
const rep = (str, n) => Array(n).fill(str).join(' | ');

// ── タイトル「どんぐりの もり」── ゆったり、木もれびの 午後
const titleChords = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb C', 'F'];
const title = {
  bpm: 92,
  swing: 0.12,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.35, notes: seq(`
        C5 - A4 - F4 - A4 C5 | D5 - - - A4 - F4 - | Bb4 - D5 - F5 - D5 Bb4 | C5 - - - . . . . |
        A4 - C5 - F5 - E5 F5 | E5 - C5 - A4 - C5 E5 | D5 - Bb4 - E5 - C5 - | F5 - - - - - . .`) },
      bass: { inst: 'bass', gain: 0.9, notes: fromChords(titleChords, 'r - - - f - - -') },
      shaker: { inst: 'drum', gain: 0.5, notes: seq(rep('. s . s . s . s', 8)) },
      poko: { inst: 'drum', gain: 0.5, notes: seq(`${rep('k . . . . . t .', 3)} | k . . t . t t . | ${rep('k . . . . . t .', 3)} | k . t . t t T .`) },
    },
    B: {
      lead: { inst: 'ocarina', gain: 0.6, notes: seq(`
        A5 - - - G5 - F5 - | F5 - - - E5 - D5 - | D5 - - - C5 - Bb4 - | C5 - - - - - - - |
        C5 - F5 - A5 - G5 F5 | E5 - - - C5 - E5 - | F5 - D5 - G5 - E5 - | F5 - - - - - - -`) },
      arp: { inst: 'marimba', gain: 0.45, notes: fromChords(titleChords, '0 1 2 1 3 1 2 1') },
      bass: { inst: 'bass', gain: 0.9, notes: fromChords(titleChords, 'r - - - f - - -') },
      glock: { inst: 'glock', gain: 0.5, notes: seq(`F6 . . . . . . . | ${rep('. . . . . . . .', 3)} | A6 . . . . . . . | ${rep('. . . . . . . .', 2)} | . . . . C7 . A6 .`) },
      shaker: { inst: 'drum', gain: 0.5, notes: seq(rep('. s . s . s . s', 8)) },
      poko: { inst: 'drum', gain: 0.5, notes: seq(`${rep('k . . . . . t .', 7)} | k . t . t t T .`) },
    },
  },
  order: ['A', 'B'],
};

// ── すごろく「すごろく びより」── はずむ、木の おもちゃの 行進
const boardA = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm G', 'C'];
const boardB = ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'G7'];
const board = {
  bpm: 126,
  swing: 0.18,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.35, notes: seq(`
        E5 . G5 . C6 - G5 E5 | A5 - G5 E5 C5 - . . | F5 . A5 . F5 . C5 . | D5 - E5 D5 B4 - G4 - |
        E5 . G5 . C6 - D6 C6 | A5 - E5 - C5 - E5 - | D5 F5 A5 F5 G5 - B4 - | C5 - - - . . . .`) },
      stab: { inst: 'marimba', gain: 0.4, notes: fromChords(boardA, '. . x . . . x .') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(boardA, 'r . f . r . f .') },
      shaker: { inst: 'drum', gain: 0.55, notes: seq(rep('s . s s s . s s', 8)) },
      poko: { inst: 'drum', gain: 0.6, notes: seq(`${rep('k . t . k k t .', 7)} | k t k t K . T .`) },
    },
    B: {
      lead: { inst: 'ocarina', gain: 0.62, notes: seq(`
        A5 - - - G5 - F5 - | G5 - - - D5 - - - | E5 - G5 - B5 - G5 - | A5 - - - - - . . |
        F5 - A5 - C6 - A5 - | B5 - - - D6 - B5 - | C6 - G5 - E5 - G5 - | D5 - E5 - F5 - G5 -`) },
      arp: { inst: 'marimba', gain: 0.4, notes: fromChords(boardB, '0 1 2 3 2 1 0 1') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(boardB, 'r . . f r . f .') },
      glock: { inst: 'glock', gain: 0.45, notes: seq(`${rep('. . . . . . . .', 3)} | . . . . E6 . A6 . | ${rep('. . . . . . . .', 2)} | C7 . . . . . . . | . . . . . . . .`) },
      shaker: { inst: 'drum', gain: 0.55, notes: seq(rep('s . s s s . s s', 8)) },
      poko: { inst: 'drum', gain: 0.6, notes: seq(`${rep('k . t . k k t .', 7)} | k t k t k k T T`) },
    },
  },
  order: ['A', 'B'],
};

export const SONGS = { title, board };
