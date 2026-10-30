// 匿名のアクセス集計(GoatCounter)。THREE にも DOM の部品にも触らない(テストから直接よぶ)。
//
// 知りたいのは「何人来て、どれだけ遊んだか」だけ。送るのは
//   - ゲームを開いた(リンク元つき。どこから来たかはここで分かる)
//   - 出来事(競技を遊んだ・大会を始めた/最後まで遊んだ・部屋を作った…)
// の2つに限る。名前・あいことば・部屋の番号・成績は送らない。Cookie も使わない
// (GoatCounter は個人を追わない作り)。集計画面は ENDPOINT のドメイン。
//
// **集計画面で読める名前で送る。** 画面に大きく出るのはパス(path)なので、
// そこを「🎯 競技を遊んだ ― どんぐりキャッチ」のような日本語にして、横に出る
// タイトル(title)に補足を入れる。名前は下の EVENTS の表からしか作らない ──
// 表に無い出来事・知らない競技やステージは送らないので、呼び出し側が
// 名前やあいことばを渡してしまっても外には出ていかない。
// 先頭の絵文字は分類(🎯 競技 / 🎲 大会 / 🌐 オンライン / 📖 図鑑 / 🏁 遊び切った)。
// 集計画面は件数順に並ぶので、名前の並びではまとまらない。目で拾うための印。
//
// **名前を変えると、集計画面では別の行になる**(過去の数とはつながらない)。
// 競技・ステージの名前もそのまま使うので、表示名を変えると行が分かれる。
//
// 数えないとき:
//   - 手元の開発(localhost など)
//   - E2E(navigator.webdriver が立つ)
//   - ?seed= / ?server= / ?time= / ?fps 付き(再現・検証用の URL。人が遊んでいる数に混ぜない)
// ?room=(さそわれたリンク)は数える。部屋の番号はパスに入らない(パスは固定の名前)。
//
// オフラインでもゲームは止めない。スクリプトの読み込みが失敗しても
// 何も起きないだけで、track は捨てられる。sw.js は別オリジンを扱わない
// ので、計測のリクエストを横取りすることもない。

import { MINIGAMES } from './board/rules.js';
import { LIST as STAGE_LIST } from './board/stages/index.js';

const ENDPOINT = 'https://dongurinpic.goatcounter.com/count';
const SCRIPT = 'https://gc.zgo.at/count.js';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', ''];
const DEV_PARAMS = ['seed', 'server', 'time', 'fps'];

// ゲームを開いた(ページの表示)。スクリプトが読み込まれたときに自動で数える
export const PAGEVIEW = { path: '🌰 ゲームを開いた', title: 'ページの表示。リンク元はこの行で見る' };

// 競技の名前は title.js の GAMES から渡してもらう(同じ名前を2か所に書かない)。
// ここでは「知っている競技か」と「名前らしい長さか」だけ見る。
const game = (key, name) => MINIGAMES.includes(key) && typeof name === 'string' && name.length > 0 && name.length <= 30 && name;
const stage = (key) => STAGE_LIST.find((s) => s.key === key && s.ready)?.name ?? null;

// 出来事の表。返す null / false は「送らない」(知らない値が来たとき)
const EVENTS = {
  'game-start': ({ key, name } = {}) => game(key, name) && {
    path: `🎯 競技を遊んだ ― ${game(key, name)}`, title: '競技えらびから 1 本だけ遊んだ(CPU 相手)',
  },
  'taikai-start': ({ stage: k } = {}) => stage(k) && {
    path: `🎲 大会を始めた ― ${stage(k)}`, title: 'CPU 相手の大会(すごろく)を始めた',
  },
  'taikai-resume': ({ stage: k } = {}) => stage(k) && {
    path: `🎲 大会のつづきを遊んだ ― ${stage(k)}`, title: 'とちゅうでやめた大会を、つづきから始めた',
  },
  'taikai-end': ({ stage: k } = {}) => stage(k) && {
    path: `🏁 大会を最後まで遊んだ ― ${stage(k)}`, title: 'CPU 相手の大会で、優勝が決まるまで遊んだ',
  },
  'room-create': () => ({ path: '🌐 部屋を作った', title: 'あいことばを発行した(ともだちをさそう側)' }),
  'room-match': () => ({ path: '🌐 あいている部屋をさがした', title: 'だれかの部屋に入りにいった' }),
  'room-join': () => ({ path: '🌐 あいことばで部屋に入った', title: 'あいことばを打ちこんだ(さそわれた側)' }),
  'room-link': () => ({ path: '🌐 さそいのリンクから来た', title: '?room= 付きのリンクを開いた' }),
  'online-game': ({ key, name } = {}) => game(key, name) && {
    path: `🌐 オンラインで競技 ― ${game(key, name)}`, title: '部屋で競技が始まった(大会の中の競技はふくまない)',
  },
  'online-taikai': ({ stage: k } = {}) => stage(k) && {
    path: `🌐 オンラインで大会 ― ${stage(k)}`, title: '部屋で大会が始まった',
  },
  'online-taikai-end': ({ stage: k } = {}) => stage(k) && {
    path: `🏁 オンラインの大会を最後まで遊んだ ― ${stage(k)}`, title: '優勝が決まるまで遊んだ',
  },
  zukan: () => ({ path: '📖 図鑑を見た', title: 'キャラクター図鑑を開いた' }),
  'pwa-launch': () => ({ path: '📱 ホーム画面から起動した', title: 'アプリとして追加して使っている' }),
};

// 出来事を集計画面の名前にする。知らない出来事・知らない値なら null(送らない)。純粋関数
export function describe(key, detail) {
  const make = EVENTS[key];
  if (!make) return null;
  return make(detail) || null;
}

// 数えてよい環境か。純粋関数
export function shouldCount({ hostname = '', search = '', webdriver = false } = {}) {
  if (webdriver) return false;
  if (LOCAL_HOSTS.includes(hostname)) return false;
  const q = new URLSearchParams(search);
  if (DEV_PARAMS.some((p) => q.has(p))) return false;
  return true;
}

let enabled = false;
const queue = [];

// 起動時に1回。数えてよい環境ならスクリプトを差し込む(ゲームを開いた数はこれで入る)
export function initAnalytics(win = globalThis.window) {
  if (!win?.document || enabled) return enabled;
  enabled = shouldCount({
    hostname: win.location?.hostname,
    search: win.location?.search,
    webdriver: !!win.navigator?.webdriver,
  });
  if (!enabled) return false;
  const s = win.document.createElement('script');
  s.async = true;
  s.src = SCRIPT;
  s.dataset.goatcounter = ENDPOINT;
  // ページの表示も読める名前で数える(既定ではパス /3d_party_game/ になり、
  // ?room= の番号もつく)。出来事は count() で path と title を毎回渡すので、
  // ここの値は表示の1回にしか効かない。
  s.dataset.goatcounterSettings = JSON.stringify(PAGEVIEW);
  // 読み込み前に起きた出来事(起動直後の PWA 起動など)は溜めておいて、ここで送る
  s.onload = () => flush(win);
  win.document.head.appendChild(s);
  return true;
}

// 出来事を1つ数える。数えない環境・知らない出来事では何もしない
export function track(key, detail) {
  if (!enabled) return;
  const ev = describe(key, detail);
  if (!ev) return;
  queue.push(ev);
  flush(globalThis.window);
}

function flush(win) {
  const gc = win?.goatcounter;
  if (!gc?.count) return;
  while (queue.length) {
    const { path, title } = queue.shift();
    try {
      gc.count({ path, title, event: true });
    } catch {
      // 集計の失敗でゲームを止めない
    }
  }
}
