// BGM を 鳴らす。songs.js の 楽譜を、WebAudio で その場で 演奏する(音の ファイルは つかわない)。
//
//   const music = createMusic();
//   music.attach(audio)       … AudioContext を わたす(さいしょの タップの あと)
//   music.play('title', 0.6)  … 曲を かえる(null で しずかに)。おなじ 曲なら そのまま。
//                               2つめは 曲の 大きさ(競技では 効果音が 聞こえる ように 下げる)
//   music.setVolume('low')    … 'on' / 'low' / 'off'
//   music.setRate(1.15)       … テンポを かえる(のこり すこしで いそぐ ときなど)
//   music.setCarve(12)        … 効果音の 帯域(SFX_BAND)を BGM から この dB だけ けずる(0 で もとどおり)
//   music.sfx()               … 競技に わたす AudioContext。destination に つなぐと 効果音として 聞かれて、
//                               鳴って いる あいだ BGM が すこし さがる(ダッキング)
//
// 効果音と BGM は おなじ 帯域で ぶつけない。効果音の 基本の 高さは SFX_BAND の 中に おき、
// BGM は 競技の あいだ その 帯域を けずって、低い ベース・たいこ と 高い 倍音・てっきん で きかせる。

import { SONGS, STEPS_PER_BAR, noteFreq } from './songs.js';

const VOLUME = { on: 0.32, low: 0.13, off: 0 };
export const SFX_BAND = [450, 1600]; // 効果音の 基本の 高さ(Hz)。BGM は ここを あける
const DUCK = 0.5; // 効果音が 鳴って いる あいだの BGM(-6dB)
const LOOKAHEAD = 0.18; // この 秒 さきまで 予約する
const FADE = 0.7;

// manual: true なら タイマーを 回さない(テストで pump() を 自分で よぶ)
export function createMusic({ manual = false } = {}) {
  let audio = null;
  let bus = null; // ぜんぶの 曲が とおる 出口(音量)
  let volume = 'on';
  let want = null; // 鳴らしたい 曲
  let level = 1;
  let cur = null; // 鳴って いる 曲 { name, song, gain, order, sec, step, at }
  let rate = 1;
  let timer = null;
  let noiseBuf = null;
  let carve = [], duck = null, sfxIn = null, meter = null, sfxCtx = null, meterBuf = null, ducking = false;

  function attach(ctx) {
    if (!ctx || audio === ctx) return;
    audio = ctx;
    bus = audio.createGain();
    bus.gain.value = VOLUME[volume];
    // 大きい 音が かさなっても われない ように
    const comp = audio.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    // 効果音の 帯域を けずる へこみ(2つの ピーキングで SFX_BAND を おおう)
    const [lo, hi] = SFX_BAND;
    carve = [lo * 1.35, hi / 1.35].map((f) => {
      const eq = audio.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = f;
      eq.Q.value = 1.3;
      eq.gain.value = 0;
      return eq;
    });
    duck = audio.createGain();
    bus.connect(carve[0]).connect(carve[1]).connect(duck).connect(comp).connect(audio.destination);
    // 効果音の 入口。音の 大きさを はかって ダッキング する
    sfxIn = audio.createGain();
    sfxIn.connect(audio.destination);
    meter = audio.createAnalyser?.() ?? null;
    if (meter) { meter.fftSize = 512; meterBuf = new Float32Array(meter.fftSize); sfxIn.connect(meter); }
    sfxCtx = new Proxy(audio, {
      get(t, k) {
        if (k === 'destination') return sfxIn;
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    sync();
  }

  // ── 楽器 ──────────────────────────────────────────
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function osc(type, f, t, len, out) {
    const o = audio.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
    return o;
  }
  function noise(t, len, out) {
    const s = audio.createBufferSource();
    s.buffer = noiseBuf;
    s.connect(out);
    s.start(t, Math.random() * 0.5, len + 0.05);
  }
  const INST = {
    // 木琴: まるい 音 + すぐ きえる かたい 倍音 + コツッ
    marimba(out, f, t, dur, v) {
      const g = audio.createGain();
      env(g, t, 0.5 * v, 0.004, 0.25 + Math.min(dur, 0.6) * 0.5);
      osc('sine', f, t, 1, g);
      const h = audio.createGain();
      env(h, t, 0.12 * v, 0.002, 0.06);
      osc('sine', f * 3.93, t, 0.1, h);
      g.connect(out); h.connect(out);
    },
    // オカリナ: やわらかい 息の 音。のばすと ビブラート
    ocarina(out, f, t, dur, v) {
      const lp = audio.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = f * 3;
      const g = audio.createGain();
      const end = t + Math.max(0.12, dur - 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.06);
      g.gain.setValueAtTime(0.3 * v, end - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.14);
      const o = osc('triangle', f, t, dur + 0.2, lp);
      const s = osc('sine', f, t, dur + 0.2, g);
      if (dur > 0.4) {
        const lfo = audio.createOscillator();
        const depth = audio.createGain();
        lfo.frequency.value = 5;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(f * 0.008, t + 0.4);
        lfo.connect(depth);
        depth.connect(o.frequency); depth.connect(s.frequency);
        lfo.start(t); lfo.stop(end + 0.2);
      }
      lp.connect(g);
      // 息
      const bp = audio.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
      const bg = audio.createGain();
      env(bg, t, 0.03 * v, 0.02, 0.12);
      noise(t, 0.2, bp); bp.connect(bg);
      g.connect(out); bg.connect(out);
    },
    // 木の ベース: ぽん と はじく
    bass(out, f, t, dur, v) {
      const lp = audio.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(250, t + 0.25);
      const g = audio.createGain();
      env(g, t, 0.55 * v, 0.005, Math.min(0.5, 0.15 + dur * 0.6));
      osc('triangle', f, t, 0.8, lp);
      osc('sine', f, t, 0.8, lp);
      lp.connect(g).connect(out);
    },
    // てっきん: きらっ
    glock(out, f, t, dur, v) {
      const g = audio.createGain();
      env(g, t, 0.2 * v, 0.002, 1.1);
      osc('sine', f, t, 1.2, g);
      const h = audio.createGain();
      env(h, t, 0.05 * v, 0.002, 0.3);
      osc('sine', f * 2.76, t, 0.4, h);
      g.connect(out); h.connect(out);
    },
    // おもちゃの オルガン(回転木馬の カリオペ): 四角い 音を まるめて、ゆらゆら
    calliope(out, f, t, dur, v) {
      const lp = audio.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(4000, f * 5);
      const g = audio.createGain();
      const end = t + Math.max(0.08, dur - 0.04);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.015);
      g.gain.setValueAtTime(0.14 * v, end);
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.07);
      const lfo = audio.createOscillator();
      const depth = audio.createGain();
      lfo.frequency.value = 6.5;
      depth.gain.value = f * 0.006;
      lfo.connect(depth);
      for (const [type, mul, det] of [['square', 1, 0], ['triangle', 2, 4], ['square', 1, -6]]) {
        const o = osc(type, f * mul, t, dur + 0.15, lp);
        o.detune.value = det;
        depth.connect(o.frequency);
      }
      lfo.start(t); lfo.stop(end + 0.1);
      lp.connect(g).connect(out);
    },
    // ぽこぽこ たいこ・シェイカー
    drum(out, kind, t, dur, v) {
      const hard = kind === kind.toUpperCase();
      const k = kind.toLowerCase();
      const a = (hard ? 1.4 : 1) * v;
      if (k === 's') {
        const hp = audio.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 6500;
        const g = audio.createGain();
        env(g, t, 0.09 * a, 0.008, 0.05);
        noise(t, 0.08, hp); hp.connect(g).connect(out);
        return;
      }
      const [f0, f1, len] = k === 'k' ? [190, 95, 0.16] : [520, 380, 0.07];
      const g = audio.createGain();
      env(g, t, 0.5 * a, 0.002, len);
      const o = osc('sine', f0, t, len + 0.05, g);
      o.frequency.exponentialRampToValueAtTime(f1, t + len);
      // 木を たたく コツッ
      const bp = audio.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = k === 'k' ? 1200 : 2400; bp.Q.value = 3;
      const cg = audio.createGain();
      env(cg, t, 0.1 * a, 0.001, 0.02);
      noise(t, 0.03, bp); bp.connect(cg).connect(out);
      g.connect(out);
    },
  };

  // ── 演奏 ──────────────────────────────────────────
  const stepLen = (song) => 60 / song.bpm / 2 / rate;
  function playStep(c, t) {
    const sec = c.song.sections[c.order[c.sec]];
    for (const tr of Object.values(sec)) {
      const tok = tr.notes[c.step];
      if (!tok || tok === '.' || tok === '-') continue;
      // のばす 長さ
      let n = 1;
      while (tr.notes[c.step + n] === '-') n++;
      const dur = n * stepLen(c.song);
      if (tr.inst === 'drum') { INST.drum(c.gain, tok, t, dur, tr.gain); continue; }
      for (const name of tok.split('+')) {
        const f = noteFreq(name);
        if (f) INST[tr.inst](c.gain, f, t, dur, tr.gain);
      }
    }
  }
  // 効果音が 鳴って いれば BGM を さげる。きえたら ゆっくり もどす
  function watchSfx() {
    if (!meter || !duck?.gain.setTargetAtTime) return;
    meter.getFloatTimeDomainData(meterBuf);
    let sum = 0;
    for (const v of meterBuf) sum += v * v;
    const on = Math.sqrt(sum / meterBuf.length) > 0.004;
    if (on === ducking) return;
    ducking = on;
    duck.gain.setTargetAtTime(on ? DUCK : 1, audio.currentTime, on ? 0.015 : 0.25);
  }
  function tick() {
    if (!audio || !cur) return;
    watchSfx();
    const until = audio.currentTime + LOOKAHEAD;
    while (cur.at < until) {
      // 裏の 8分は すこし はねる
      const t = cur.at + (cur.step % 2 ? cur.song.swing * stepLen(cur.song) : 0);
      if (t >= audio.currentTime - 0.01) playStep(cur, Math.max(t, audio.currentTime));
      cur.at += stepLen(cur.song);
      cur.step++;
      const bars = cur.song.sections[cur.order[cur.sec]].lead.notes.length / STEPS_PER_BAR;
      if (cur.step >= bars * STEPS_PER_BAR) { cur.step = 0; cur.sec = (cur.sec + 1) % cur.order.length; }
    }
  }
  function fadeOut(c) {
    const t = audio.currentTime;
    c.gain.gain.cancelScheduledValues(t);
    c.gain.gain.setValueAtTime(c.gain.gain.value, t);
    c.gain.gain.linearRampToValueAtTime(0, t + FADE);
    if (!manual) setTimeout(() => c.gain.disconnect(), (FADE + LOOKAHEAD + 1.5) * 1000);
  }
  // want と 音量に あわせて、曲を かえたり 止めたり する
  function sync() {
    if (!audio) return;
    const name = volume === 'off' || globalThis.document?.hidden ? null : want;
    if (cur?.name === name) {
      // おなじ 曲で 大きさだけ かわった
      if (cur && cur.level !== level) { cur.level = level; cur.gain.gain.setTargetAtTime(level, audio.currentTime, 0.3); }
      return;
    }
    if (cur) { fadeOut(cur); cur = null; }
    if (name && SONGS[name]) {
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(level, audio.currentTime + FADE);
      gain.connect(bus);
      const song = SONGS[name];
      cur = { name, song, gain, level, order: song.order, sec: 0, step: 0, at: audio.currentTime + 0.1 };
    }
    if (cur && !timer && !manual) timer = setInterval(tick, 40);
    if (!cur && timer) { clearInterval(timer); timer = null; }
    tick();
  }
  // うらに まわった ときは 止める(タイマーが まばらに なって リズムが くずれる ため)。もどったら はじめから
  globalThis.document?.addEventListener('visibilitychange', sync);

  return {
    attach,
    play(name, lv = 1) { want = name; level = lv; sync(); },
    setVolume(v) {
      volume = v in VOLUME ? v : 'on';
      if (bus) bus.gain.setTargetAtTime(VOLUME[volume], audio.currentTime, 0.1);
      sync();
    },
    setRate(r) { rate = r; },
    setCarve(db) { for (const eq of carve) eq.gain.setTargetAtTime(-Math.abs(db), audio.currentTime, 0.3); },
    sfx: () => sfxCtx,
    pump: tick,
    get playing() { return cur?.name ?? null; },
  };
}
