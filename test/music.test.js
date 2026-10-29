import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARVE, GAME_MUSIC, SONGS, STEPS_PER_BAR, fromChords, noteFreq } from '../src/music/songs.js';
import { SFX_BAND, createMusic } from '../src/music/player.js';
import { LIST as STAGES } from '../src/board/stages/index.js';
import { MINIGAMES } from '../src/board/rules.js';

test('音の 名前から 高さ', () => {
  assert.equal(noteFreq('A4'), 440);
  assert.ok(Math.abs(noteFreq('C4') - 261.63) < 0.01);
  assert.ok(Math.abs(noteFreq('Bb3') - noteFreq('A#3')) < 1e-9);
  assert.equal(noteFreq('H4'), null);
});

test('和音から ベースと アルペジオを つくる', () => {
  assert.deepEqual(fromChords(['C'], 'r . f . 0 1 2 x'), ['C3', '.', 'G2', '.', 'C4', 'E4', 'G4', 'C4+E4+G4']);
  // 「Dm G」は 小節の 半分ずつ
  assert.deepEqual(fromChords(['Dm G'], 'r . . . r . . .'), ['D3', '.', '.', '.', 'G2', '.', '.', '.']);
});

test('どの 曲も 楽譜が ととのって いる(小節の 長さ・音の 名前・音の はんい)', () => {
  const DRUMS = new Set(['k', 't', 's', 'K', 'T', 'S']);
  for (const [name, song] of Object.entries(SONGS)) {
    assert.ok(song.bpm > 60 && song.bpm < 200, name);
    for (const key of song.order) assert.ok(song.sections[key], `${name}: ${key} が ない`);
    for (const [key, sec] of Object.entries(song.sections)) {
      const len = sec.lead.notes.length;
      assert.equal(len % STEPS_PER_BAR, 0, `${name}.${key}: 小節の とちゅうで おわる`);
      for (const [tn, tr] of Object.entries(sec)) {
        const where = `${name}.${key}.${tn}`;
        assert.equal(tr.notes.length, len, `${where}: 長さが ${tr.notes.length}(${len} の はず)`);
        assert.notEqual(tr.notes[0], '-', `${where}: のばす 音が ない`);
        for (const tok of tr.notes) {
          if (tok === '.' || tok === '-') continue;
          if (tr.inst === 'drum') { assert.ok(DRUMS.has(tok), `${where}: ${tok}`); continue; }
          for (const n of tok.split('+')) {
            const f = noteFreq(n);
            assert.ok(f, `${where}: ${n} が 読めない`);
            assert.ok(f > 60 && f < 2400, `${where}: ${n} は 高すぎる/低すぎる`);
          }
        }
      }
    }
  }
});

test('大会の ステージには それぞれの 曲が ある', () => {
  for (const st of STAGES.filter((x) => x.ready)) assert.ok(SONGS[st.key], `${st.name} の 曲が ない`);
});

test('どの 競技にも 曲が ある', () => {
  for (const key of MINIGAMES) assert.ok(SONGS[GAME_MUSIC[key]], `${key} の 曲が ない`);
});

// 音を 出さない にせの AudioContext。いつ どの 高さを 鳴らしたかを おぼえる
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect: (n) => n, disconnect() {}, gain: param(), frequency: param(), Q: param(), threshold: param(), ratio: param(), ...extra });
  const ctx = {
    currentTime: 0, sampleRate: 8000, destination: node(), played: [],
    createGain: () => node(), createBiquadFilter: () => node(), createDynamicsCompressor: () => node(),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
    createBufferSource: () => node({ start() {} }),
    createOscillator: () => {
      const o = node({ start() {}, stop() {}, detune: param() });
      o.frequency.setValueAtTime = (f, t) => ctx.played.push([f, t]);
      return o;
    },
  };
  return ctx;
}

test('えらんだ 曲の メロディを 拍に あわせて 鳴らし、止められる', () => {
  const ctx = fakeAudio();
  const music = createMusic({ manual: true }); // タイマーを 回さず、時間を すすめて pump する
  music.attach(ctx);
  music.play('title');
  assert.equal(music.playing, 'title');
  for (let k = 0; k < 75; k++) { ctx.currentTime = k * 0.04; music.pump(); }
  const step = 60 / SONGS.title.bpm / 2;
  const lead = SONGS.title.sections.A.lead.notes;
  const when = (name) => ctx.played.filter(([f]) => Math.abs(f - noteFreq(name)) < 1e-6).map(([, t]) => t);
  const t0 = when(lead[0])[0];
  assert.ok(t0 !== undefined, 'さいしょの 音が 鳴る');
  // 2ばんめの メロディ音は 2こま あと、3ばんめは 4こま あと
  assert.ok(Math.abs(when(lead[2])[0] - t0 - step * 2) < 1e-6);
  assert.ok(Math.abs(when(lead[4])[0] - t0 - step * 4) < 1e-6);
  music.play(null);
  assert.equal(music.playing, null);
  music.setVolume('off');
  music.play('yuen');
  assert.equal(music.playing, null, '音量 0 の ときは 鳴らさない');
  music.setVolume('low');
  assert.equal(music.playing, 'yuen');
  music.play(null);
});

test('競技の 効果音は べつの 入口を とおり、BGM は 効果音の 帯域を けずれる', () => {
  const ctx = fakeAudio();
  const filters = [];
  ctx.createBiquadFilter = () => {
    const f = { connect: (n) => n, frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0, setTargetAtTime(v) { this.value = v; } } };
    filters.push(f);
    return f;
  };
  const music = createMusic({ manual: true });
  music.attach(ctx);
  const fx = music.sfx();
  assert.notEqual(fx.destination, ctx.destination);
  ctx.currentTime = 3;
  assert.equal(fx.currentTime, 3, 'ほかは そのまま');
  assert.equal(typeof fx.createOscillator().start, 'function');
  const carve = filters.filter((f) => f.type === 'peaking');
  assert.equal(carve.length, 2);
  for (const f of carve) assert.ok(f.frequency.value > SFX_BAND[0] && f.frequency.value < SFX_BAND[1]);
  music.setCarve(CARVE.daruma);
  assert.ok(carve.every((f) => f.gain.value === -CARVE.daruma));
  music.setCarve(0);
  assert.ok(carve.every((f) => f.gain.value === 0));
});
