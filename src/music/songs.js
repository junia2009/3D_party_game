// BGM の 楽譜。音は 鳴らさない(データと 読みかただけ)。鳴らすのは player.js。
//
// 1こま = 8分音符。1小節 = 8こま。トラックは こまを 空白で ならべた 文字列:
//   C5 / Bb4 / F#3 … 音を 出す   - … ひとつ 前の 音を のばす   . … やすみ   | … 小節の 区切り(読みとばす)
//   C4+E4+G4 … 和音      k t s … たいこ(k ひくい ぽこ・t たかい ぽこ・s シェイカー。大文字は つよく)
//
// 森の 木の おもちゃの 音: 木琴(marimba)・オカリナ(ocarina)・木の ベース(bass)・
// てっきん(glock)・ぽこぽこ たいこ(drum)・おもちゃの オルガン(calliope。遊園地の 回転木馬)。
//
// 大会の 曲は ステージの key と おなじ 名前(ステージの コンセプトに あわせる)。

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
  C: ['C4', 'E4', 'G4'], C7: ['C4', 'E4', 'Bb4'], D: ['D4', 'F#4', 'A4'], Dm: ['D4', 'F4', 'A4'], Em: ['E4', 'G4', 'B4'],
  F: ['F4', 'A4', 'C5'], G: ['G3', 'B3', 'D4'], G7: ['G3', 'B3', 'F4'], Am: ['A3', 'C4', 'E4'], Bb: ['Bb3', 'D4', 'F4'],
  B7: ['B3', 'D#4', 'A4'],
};
const ROOT = { C: 'C3', C7: 'C3', D: 'D3', Dm: 'D3', Em: 'E2', F: 'F2', G: 'G2', G7: 'G2', Am: 'A2', Bb: 'Bb2', B7: 'B2' };
const FIFTH = { C: 'G2', C7: 'G2', D: 'A2', Dm: 'A2', Em: 'B2', F: 'C3', G: 'D3', G7: 'D3', Am: 'E3', Bb: 'F3', B7: 'F#3' };
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

// ── タイトル「どんぐりの もり」── 木もれびの 森へ、かろやかに 出かける
const titleChords = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb C', 'F'];
const title = {
  bpm: 108,
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

// ── 四季の森「森の 四季めぐり」── 春 → 夏 → 秋 → 冬 と ひとめぐり(盤も 四季を ぐるっと まわる)
const spring = ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am D', 'G'];
const summer = ['C', 'D', 'G', 'Em', 'C', 'D', 'G', 'G'];
const autumn = ['Em', 'C', 'Am', 'B7', 'Em', 'C', 'Am B7', 'Em'];
const winter = ['G', 'C', 'G', 'D', 'Em', 'C', 'D', 'G'];
const empty = (bars) => rep('. . . . . . . .', bars);
const shiki = {
  bpm: 112,
  swing: 0.14,
  sections: {
    // 春: オカリナが そよ風みたいに。木琴は うしろで ころころ
    spring: {
      lead: { inst: 'ocarina', gain: 0.55, notes: seq(`
        B4 - D5 - G5 - F#5 E5 | E5 - - - B4 - - - | C5 - E5 - G5 - E5 C5 | D5 - - - - - . . |
        B4 - D5 - G5 - A5 B5 | G5 - E5 - B4 - E5 - | C5 - A4 - F#5 - D5 - | G5 - - - - - . .`) },
      arp: { inst: 'marimba', gain: 0.42, notes: fromChords(spring, '0 1 2 1 0 1 2 1') },
      bass: { inst: 'bass', gain: 0.85, notes: fromChords(spring, 'r - - - f - - -') },
      shaker: { inst: 'drum', gain: 0.45, notes: seq(rep('. s . s . s . s', 8)) },
      poko: { inst: 'drum', gain: 0.45, notes: seq(`${rep('k . . . . . t .', 7)} | k . . t . t t .`) },
    },
    // 夏: 木琴が はずんで、ぽこぽこ たいこも にぎやか
    summer: {
      lead: { inst: 'marimba', gain: 1.7, notes: seq(`
        E5 E5 G5 . E5 . D5 . | F#5 F#5 A5 . F#5 . D5 . | G5 . B5 . A5 G5 F#5 G5 | E5 - - - B4 - - - |
        E5 E5 G5 . E5 . C5 . | D5 . F#5 . A5 . F#5 . | G5 . D5 . B4 . D5 . | G5 - - - . . . .`) },
      stab: { inst: 'marimba', gain: 0.5, notes: fromChords(summer, '. . x . . . x .') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(summer, 'r . f . r . f .') },
      glock: { inst: 'glock', gain: 0.4, notes: seq(`${empty(3)} | . . . . B5 . E6 . | ${empty(3)} | . . . . D6 . G6 .`) },
      shaker: { inst: 'drum', gain: 0.55, notes: seq(rep('s . s s s . s s', 8)) },
      poko: { inst: 'drum', gain: 0.7, notes: seq(`${rep('k . t . k k t .', 7)} | k t k t K . T .`) },
    },
    // 秋: すこし さみしい 短調。木の ベースが てくてく 歩く
    autumn: {
      lead: { inst: 'ocarina', gain: 0.52, notes: seq(`
        G5 - F#5 - E5 - B4 - | C5 - E5 - G5 - - - | A5 - G5 - E5 - C5 - | B4 - - - D#5 - F#5 - |
        G5 - F#5 - E5 - G5 - | E5 - C5 - G4 - C5 - | C5 - E5 - D#5 - F#5 - | E5 - - - - - . .`) },
      arp: { inst: 'marimba', gain: 0.36, notes: fromChords(autumn, '0 . 2 . 1 . 2 .') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(autumn, 'r . f . o . f .') },
      poko: { inst: 'drum', gain: 0.45, notes: seq(`${rep('k . . . t . . .', 7)} | k . t . t t T .`) },
    },
    // 冬: てっきんが 雪みたいに。シェイカーは そりの すず
    winter: {
      lead: { inst: 'glock', gain: 1.25, notes: seq(`
        D6 - - - B5 - G5 - | E6 - - - C6 - G5 - | D6 - B5 - G5 - B5 - | A5 - - - - - - - |
        B5 - - - G5 - E5 - | C6 - - - E5 - G5 - | A5 - - - F#5 - A5 - | G5 - - - - - - -`) },
      pad: { inst: 'ocarina', gain: 0.36, notes: fromChords(winter, '1 - - - - - - -') },
      arp: { inst: 'marimba', gain: 0.3, notes: fromChords(winter, '0 . 1 . 2 . 1 .') },
      bass: { inst: 'bass', gain: 0.8, notes: fromChords(winter, 'r - - - - - - -') },
      bells: { inst: 'drum', gain: 0.6, notes: seq(rep('s s s s s s s s', 8)) },
    },
  },
  order: ['spring', 'summer', 'autumn', 'winter'],
};

// ── どんぐり遊園地「回転木馬の マーチ」── おもちゃの オルガンが ぶんちゃっ ぶんちゃっ
const parkA = ['F', 'C7', 'F', 'C7', 'F', 'Bb', 'F C7', 'F'];
const parkB = ['Bb', 'F', 'C7', 'F', 'Bb', 'F', 'C7', 'F'];
const yuen = {
  bpm: 132,
  swing: 0,
  sections: {
    A: {
      lead: { inst: 'calliope', gain: 1.05, notes: seq(`
        A4 . C5 . F5 - E5 F5 | G5 - E5 . C5 - . . | A4 . C5 . F5 - A5 G5 | G5 - - - . . . . |
        A5 . G5 . F5 . A5 . | Bb5 - D5 - F5 - D5 - | C5 . A4 . G4 . E5 . | F5 - - - . . . .`) },
      oom: { inst: 'bass', gain: 1, notes: fromChords(parkA, 'r . . . f . . .') },
      pah: { inst: 'marimba', gain: 0.42, notes: fromChords(parkA, '. . x . . . x .') },
      glock: { inst: 'glock', gain: 0.4, notes: seq(`${empty(3)} | . . . . C6 . E6 . | ${empty(3)} | F6 . . . . . . .`) },
      poko: { inst: 'drum', gain: 0.55, notes: seq(`${rep('k . t . k . t .', 7)} | k . t t k t T .`) },
      shaker: { inst: 'drum', gain: 0.45, notes: seq(rep('s s s s s s s s', 8)) },
    },
    B: {
      lead: { inst: 'marimba', gain: 1.3, notes: seq(`
        D5 E5 F5 . D5 . Bb4 . | C5 D5 C5 A4 F4 . . . | E5 F5 G5 . E5 . C5 . | F5 E5 F5 A5 C6 . . . |
        D6 . Bb5 . F5 . D5 . | C6 . A5 . F5 . A5 . | G5 F#5 G5 A5 Bb5 A5 G5 E5 | F5 . C5 . F5 . . .`) },
      organ: { inst: 'calliope', gain: 0.35, notes: fromChords(parkB, '1 - - - 2 - - -') },
      oom: { inst: 'bass', gain: 1, notes: fromChords(parkB, 'r . . . f . . .') },
      pah: { inst: 'marimba', gain: 0.38, notes: fromChords(parkB, '. . x . . . x .') },
      poko: { inst: 'drum', gain: 0.55, notes: seq(`${rep('k . t . k . t .', 7)} | k t k t K . T .`) },
      shaker: { inst: 'drum', gain: 0.45, notes: seq(rep('s s s s s s s s', 8)) },
    },
  },
  order: ['A', 'A', 'B', 'A'],
};

export const SONGS = { title, shiki, yuen };
