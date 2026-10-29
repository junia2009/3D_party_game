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
  B7: ['B3', 'D#4', 'A4'], Bm: ['B3', 'D4', 'F#4'], A: ['A3', 'C#4', 'E4'], A7: ['A3', 'C#4', 'G4'],
  E7: ['E4', 'G#4', 'D5'], Gm: ['G3', 'Bb3', 'D4'],
};
const ROOT = { C: 'C3', C7: 'C3', D: 'D3', Dm: 'D3', Em: 'E2', F: 'F2', G: 'G2', G7: 'G2', Am: 'A2', Bb: 'Bb2', B7: 'B2', Bm: 'B2', A: 'A2', A7: 'A2', E7: 'E2', Gm: 'G2' };
const FIFTH = { C: 'G2', C7: 'G2', D: 'A2', Dm: 'A2', Em: 'B2', F: 'C3', G: 'D3', G7: 'D3', Am: 'E3', Bb: 'F3', B7: 'F#3', Bm: 'F#3', A: 'E3', A7: 'E3', E7: 'B2', Gm: 'D3' };
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

// ── 競技の 曲(雰囲気ごとに 1曲。おなじ 雰囲気の 競技で 使いまわす) ─────────────

// かけっこ「どんぐり かけっこ」── 走る・すべる・とぶ。前へ 前へ
const runA = ['D', 'D', 'G', 'A', 'D', 'Bm', 'G A', 'D'];
const runB = ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em A', 'D'];
const kakekko = {
  bpm: 150,
  swing: 0.08,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.5, notes: seq(`
        D5 . F#5 . A5 . F#5 A5 | B5 - A5 - F#5 - D5 - | G5 . B5 . D6 . B5 G5 | A5 - - - E5 - C#5 - |
        D5 . F#5 . A5 . D6 . | D6 - B5 - F#5 - B5 - | G5 B5 D6 B5 A5 C#6 E6 C#6 | D6 - - - . . . .`) },
      stab: { inst: 'marimba', gain: 0.4, notes: fromChords(runA, '. . x . . . x .') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(runA, 'r r f r r r f r') },
      shaker: { inst: 'drum', gain: 0.5, notes: seq(rep('s s s s s s s s', 8)) },
      poko: { inst: 'drum', gain: 0.65, notes: seq(`${rep('k . t . k k t .', 7)} | k t k t K T K T`) },
    },
    B: {
      lead: { inst: 'ocarina', gain: 0.55, notes: seq(`
        B5 - - - A5 - F#5 - | G5 - - - D5 - - - | F#5 - A5 - D6 - A5 - | E5 - - - - - . . |
        B5 - - - A5 - F#5 - | G5 - B5 - D6 - B5 - | E5 - G5 - A5 - C#6 - | D6 - - - - - - -`) },
      arp: { inst: 'marimba', gain: 0.45, notes: fromChords(runB, '0 1 2 3 0 1 2 3') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(runB, 'r r f r r r f r') },
      shaker: { inst: 'drum', gain: 0.5, notes: seq(rep('s s s s s s s s', 8)) },
      poko: { inst: 'drum', gain: 0.65, notes: seq(`${rep('k . t . k k t .', 7)} | K . K . K T T T`) },
    },
  },
  order: ['A', 'B'],
};

// おまつり「森の おまつり」── 笛(オカリナ)と 太鼓と ちゃんちき。和の 音階(ヨナ抜き)で
const fesA = ['Em', 'D', 'C', 'D', 'Em', 'D', 'C D', 'Em'];
const fesB = ['Em', 'D', 'Em', 'D', 'C', 'D', 'Em D', 'Em'];
const matsuri = {
  bpm: 120,
  swing: 0,
  sections: {
    A: {
      lead: { inst: 'ocarina', gain: 0.62, notes: seq(`
        E5 - G5 A5 B5 - A5 G5 | A5 - - - D5 - - - | E5 - G5 - E5 - D5 - | D5 - - - - - . . |
        B5 - D6 - B5 A5 G5 A5 | A5 - D6 - A5 - - - | G5 - E5 - A5 - D5 - | E5 - - - - - - -`) },
      shami: { inst: 'marimba', gain: 0.4, notes: fromChords(fesA, '0 . 2 . 3 . 2 .') },
      bass: { inst: 'bass', gain: 0.9, notes: fromChords(fesA, 'r - - - r - - -') },
      taiko: { inst: 'drum', gain: 0.8, notes: seq(`${rep('K . k . K k . k', 7)} | K k K k K . K .`) },
      kane: { inst: 'glock', gain: 0.25, notes: seq(rep('E6 . E6 . E6 E6 . .', 8)) },
    },
    B: {
      lead: { inst: 'marimba', gain: 1.45, notes: seq(`
        E5 E5 G5 . A5 . B5 . | A5 . G5 . A5 - - - | B5 B5 D6 . B5 . A5 . | A5 - - - . . . . |
        G5 . E5 . G5 . A5 . | A5 . D6 . A5 . G5 . | E5 G5 A5 B5 A5 G5 D5 . | E5 - - - . . . .`) },
      fue: { inst: 'ocarina', gain: 0.3, notes: fromChords(fesB, '3 - - - - - - -') },
      bass: { inst: 'bass', gain: 0.9, notes: fromChords(fesB, 'r - - - f - - -') },
      taiko: { inst: 'drum', gain: 0.8, notes: seq(`${rep('K . k k K . k .', 7)} | K K K . K . . .`) },
      kane: { inst: 'glock', gain: 0.25, notes: seq(rep('E6 . E6 . E6 E6 . .', 8)) },
      shaker: { inst: 'drum', gain: 0.4, notes: seq(rep('. s . s . s . s', 8)) },
    },
  },
  order: ['A', 'B'],
};

// どきどき「そろり そろり」── しのび足。見つからない ように
const sneakA = ['Am', 'Am', 'Dm', 'E7', 'Am', 'Am', 'Dm E7', 'Am'];
const sneakB = ['Dm', 'Am', 'Dm', 'E7', 'Dm', 'Am', 'Dm E7', 'Am'];
const dokidoki = {
  bpm: 100,
  swing: 0.2,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.4, notes: seq(`
        A4 . . C5 . . E5 . | D#5 E5 . . . . . . | D5 . . F5 . . A5 . | G#5 - - - . . . . |
        A5 . . E5 . . C5 . | B4 C5 . . . . . . | D5 . F5 . E5 . G#4 . | A4 - - - . . . .`) },
      bass: { inst: 'bass', gain: 1, notes: fromChords(sneakA, 'r . f . o . f .') },
      tip: { inst: 'drum', gain: 0.5, notes: seq(`${rep('t . . t . . t .', 7)} | t . t . T . . .`) },
      shaker: { inst: 'drum', gain: 0.35, notes: seq(rep('. . s . . . s .', 8)) },
    },
    B: {
      lead: { inst: 'ocarina', gain: 0.5, notes: seq(`
        F5 - - - E5 - - - | C5 - - - - - - - | F5 - - - A5 - - - | G#5 - - - B5 - - - |
        A5 - - - F5 - - - | E5 - - - C5 - - - | D5 - - - B4 - - - | A4 - - - - - - -`) },
      tiptoe: { inst: 'marimba', gain: 0.5, notes: fromChords(sneakB, '0 . . 2 . . 1 .') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(sneakB, 'r . f . o . f .') },
      tip: { inst: 'drum', gain: 0.5, notes: seq(`${rep('t . . t . . t .', 7)} | t t t t T . . .`) },
    },
  },
  order: ['A', 'B'],
};

// しょうぶ「まけないぞ!」── ぶつかる・ひっぱる・なげる。力いっぱい
const battleA = ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'C A7', 'Dm'];
const battleB = ['Gm', 'Dm', 'A7', 'Dm', 'Gm', 'Dm', 'Bb A7', 'Dm'];
const shoubu = {
  bpm: 138,
  swing: 0,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.5, notes: seq(`
        D5 . D5 . A5 - - - | F5 . D5 . Bb4 - - - | C5 . E5 . G5 . C6 . | A5 - - - - - . . |
        D6 . C6 . A5 . F5 . | Bb5 . A5 . F5 . D5 . | E5 . G5 . C#5 . E5 . | D5 - - - D6 . . .`) },
      hit: { inst: 'marimba', gain: 0.45, notes: fromChords(battleA, 'x . . x . . x .') },
      bass: { inst: 'bass', gain: 1.05, notes: fromChords(battleA, 'r r . r f . r .') },
      poko: { inst: 'drum', gain: 0.75, notes: seq(`${rep('K . t . K K t .', 7)} | K T K T K K K .`) },
      shaker: { inst: 'drum', gain: 0.45, notes: seq(rep('s s s s s s s s', 8)) },
    },
    B: {
      lead: { inst: 'ocarina', gain: 0.6, notes: seq(`
        G5 - - - Bb5 - D6 - | A5 - - - F5 - D5 - | E5 - - - G5 - C#6 - | D6 - - - - - . . |
        Bb5 - - - G5 - D5 - | F5 - - - A5 - D6 - | D6 - Bb5 - C#6 - E6 - | D6 - - - - - - -`) },
      hit: { inst: 'marimba', gain: 0.45, notes: fromChords(battleB, 'x . . x . . x .') },
      glock: { inst: 'glock', gain: 0.35, notes: seq(`${empty(3)} | D6 . . . . . . . | ${empty(3)} | D6 . . . . . . .`) },
      bass: { inst: 'bass', gain: 1.05, notes: fromChords(battleB, 'r r . r f . r .') },
      poko: { inst: 'drum', gain: 0.75, notes: seq(`${rep('K . t . K K t .', 7)} | K K K K K . . .`) },
      shaker: { inst: 'drum', gain: 0.45, notes: seq(rep('s s s s s s s s', 8)) },
    },
  },
  order: ['A', 'B'],
};

// のんびり「こつこつ かんがえる」── つむ・ぬる・おぼえる。木もれびの 机で
const calmA = ['C', 'Em', 'F', 'G', 'C', 'Em', 'F G', 'C'];
const calmB = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm G', 'C'];
const nonbiri = {
  bpm: 100,
  swing: 0.22,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.75, notes: seq(`
        G5 . E5 . C5 . E5 G5 | B5 - - - G5 . E5 . | A5 . F5 . C5 . F5 A5 | G5 - - - . . D5 . |
        E5 . G5 . C6 . B5 C6 | B5 - G5 - E5 - G5 - | A5 . C6 . B5 . D6 . | C6 - - - . . . .`) },
      bass: { inst: 'bass', gain: 0.85, notes: fromChords(calmA, 'r - - - f - - -') },
      pad: { inst: 'ocarina', gain: 0.25, notes: fromChords(calmA, '1 - - - - - - -') },
      shaker: { inst: 'drum', gain: 0.4, notes: seq(rep('. s . s . s . s', 8)) },
      poko: { inst: 'drum', gain: 0.4, notes: seq(rep('k . . . t . . .', 8)) },
    },
    B: {
      lead: { inst: 'glock', gain: 1.45, notes: seq(`
        E6 - - - C6 - A5 - | C6 - - - A5 - F5 - | G5 - C6 - E6 - C6 - | D6 - - - B5 - - - |
        C6 - E6 - A5 - C6 - | A5 - - - F5 - A5 - | F5 - A5 - G5 - B5 - | C6 - - - - - - -`) },
      arp: { inst: 'marimba', gain: 0.4, notes: fromChords(calmB, '0 1 2 1 0 1 2 1') },
      bass: { inst: 'bass', gain: 0.85, notes: fromChords(calmB, 'r - - - f - - -') },
      shaker: { inst: 'drum', gain: 0.4, notes: seq(rep('. s . s . s . s', 8)) },
      poko: { inst: 'drum', gain: 0.4, notes: seq(rep('k . . . t . . .', 8)) },
    },
  },
  order: ['A', 'B'],
};

// たんけん「いせき たんけん」── めいろ・火山。なぞと ドキドキの 冒険
const advA = ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C D', 'B7'];
const advB = ['C', 'D', 'Bm', 'Em', 'C', 'D', 'B7', 'Em'];
const tanken = {
  bpm: 126,
  swing: 0.05,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.45, notes: seq(`
        E5 . B4 . E5 . G5 . | F#5 . G5 . A5 - B5 - | G5 . E5 . C5 . E5 . | F#5 - - - A5 - - - |
        B5 . A5 . G5 . F#5 . | E5 . G5 . B5 . E6 . | E6 . C6 . D6 . A5 . | B5 - - - F#5 - D#5 -`) },
      bass: { inst: 'bass', gain: 1, notes: fromChords(advA, 'r . r . f . r .') },
      pad: { inst: 'ocarina', gain: 0.28, notes: fromChords(advA, '0 - - - - - - -') },
      poko: { inst: 'drum', gain: 0.65, notes: seq(`${rep('k . . k t . k .', 7)} | k . k . K . T T`) },
      shaker: { inst: 'drum', gain: 0.45, notes: seq(rep('s s s s s s s s', 8)) },
    },
    B: {
      lead: { inst: 'ocarina', gain: 0.58, notes: seq(`
        G5 - - - E5 - - - | F#5 - - - A5 - - - | B5 - - - D6 - - - | B5 - - - G5 - E5 - |
        C6 - - - G5 - - - | A5 - - - F#5 - D5 - | D#5 - - - F#5 - A5 - | G5 - - - E5 - - -`) },
      arp: { inst: 'marimba', gain: 0.42, notes: fromChords(advB, '0 1 2 3 2 1 0 1') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(advB, 'r . r . f . r .') },
      poko: { inst: 'drum', gain: 0.65, notes: seq(`${rep('k . . k t . k .', 7)} | K . K . K T T T`) },
      shaker: { inst: 'drum', gain: 0.45, notes: seq(rep('s s s s s s s s', 8)) },
    },
  },
  order: ['A', 'B'],
};

// なつ「なつの はまべ」── 波と 太陽。木琴を スチールパンみたいに はずませる
const beachA = ['F', 'Bb', 'C', 'F', 'F', 'Bb', 'C C7', 'F'];
const beachB = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'C'];
const natsu = {
  bpm: 116,
  swing: 0.05,
  sections: {
    A: {
      lead: { inst: 'marimba', gain: 1.5, notes: seq(`
        C5 . F5 . . A5 . C6 | D6 . . Bb5 . F5 . . | E5 . G5 . . C6 . Bb5 | A5 - - - . . . . |
        C6 . A5 . . F5 . A5 | Bb5 . . D6 . Bb5 . F5 | G5 . . E5 . Bb5 . G5 | F5 - - - . . . .`) },
      stab: { inst: 'marimba', gain: 0.4, notes: fromChords(beachA, '. . x . . x . .') },
      bass: { inst: 'bass', gain: 1, notes: fromChords(beachA, 'r . . f . . r .') },
      poko: { inst: 'drum', gain: 0.6, notes: seq(`${rep('k . . t . . t .', 7)} | k . t t . t T .`) },
      shaker: { inst: 'drum', gain: 0.5, notes: seq(rep('s s s s s s s s', 8)) },
    },
    B: {
      lead: { inst: 'ocarina', gain: 0.58, notes: seq(`
        A5 - - - F5 - D5 - | D5 - F5 - Bb5 - - - | A5 - - - C6 - A5 - | G5 - - - - - . . |
        F5 - A5 - D6 - A5 - | Bb5 - - - F5 - D5 - | C5 - F5 - A5 - C6 - | G5 - E5 - C5 - - -`) },
      stab: { inst: 'marimba', gain: 0.4, notes: fromChords(beachB, '. . x . . x . .') },
      glock: { inst: 'glock', gain: 0.35, notes: seq(`${empty(3)} | . . . . C6 . E6 . | ${empty(3)} | . . . . G6 . . .`) },
      bass: { inst: 'bass', gain: 1, notes: fromChords(beachB, 'r . . f . . r .') },
      poko: { inst: 'drum', gain: 0.6, notes: seq(`${rep('k . . t . . t .', 7)} | k . t t . t T .`) },
      shaker: { inst: 'drum', gain: 0.5, notes: seq(rep('s s s s s s s s', 8)) },
    },
  },
  order: ['A', 'B'],
};

export const SONGS = { title, shiki, yuen, kakekko, matsuri, dokidoki, shoubu, nonbiri, tanken, natsu };

// 競技の あいだ BGM から 効果音の 帯域を けずる 深さ(dB)。合図の 音を 聞きとる 競技は ふかく
export const CARVE = { default: 12, board: 9, daruma: 22 };

// 競技 → 曲。競技を 足したら ここにも 足す(test/music.test.js が 見張る)
export const GAME_MUSIC = {
  // 走る・すべる・とぶ
  catch: 'kakekko', sled: 'kakekko', ikada: 'kakekko', hikouki: 'kakekko', mame: 'kakekko',
  // お祭り・お正月
  nawa: 'matsuri', ramune: 'matsuri', wataame: 'matsuri', otoshi: 'matsuri',
  // しのび足・まちぶせ
  daruma: 'dokidoki', kakure: 'dokidoki', dasshutsu: 'dokidoki', hayauchi: 'dokidoki',
  // ぶつかる・ひっぱる・なげる
  sumo: 'shoubu', tsuna: 'shoubu', yuki: 'shoubu', keshigomu: 'shoubu', mato: 'shoubu',
  // じっくり
  tsumi: 'nonbiri', hana: 'nonbiri', kinoko: 'nonbiri', ehon: 'nonbiri',
  // 冒険
  meiro: 'tanken', kazan: 'tanken',
  // 夏の 浜べ
  volley: 'natsu',
  // 遊園地は 大会の 遊園地と おなじ 曲
  bumper: 'yuen',
};
