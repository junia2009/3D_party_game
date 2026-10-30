// オフラインでも遊べるようにする(PWA)。
//
// - 入れたとき(install)に、配信するファイルを全部まとめて手元にしまう(プリキャッシュ)。
//   一度ひらけば、そのあとは電波がなくても CPU 戦が遊べる。
// - ふだんはネットワークを先に見る(新しい版がすぐ届く)。つながらないときだけ、しまったものを使う。
// - 字(Google Fonts)は、一度使ったものをしまっておく。
//
// 一覧と版(VERSION)は tools/gen-precache.mjs が書く。ファイルを足したり変えたりしたら
// `npm run gen:precache`(忘れると test/sw-precache.test.js が落ちる)。
// 版はファイルの中身から作るので、1つでも変われば sw.js が変わり、ブラウザが入れなおす。

// <precache>
const VERSION = '253181c5f7f9';
const PRECACHE = [
  "./",
  "./assets/thumbs/bowl.jpg",
  "./assets/thumbs/bumper.jpg",
  "./assets/thumbs/catch.jpg",
  "./assets/thumbs/daruma.jpg",
  "./assets/thumbs/dasshutsu.jpg",
  "./assets/thumbs/ehon.jpg",
  "./assets/thumbs/hana.jpg",
  "./assets/thumbs/hayauchi.jpg",
  "./assets/thumbs/hikouki.jpg",
  "./assets/thumbs/ikada.jpg",
  "./assets/thumbs/kakure.jpg",
  "./assets/thumbs/kazan.jpg",
  "./assets/thumbs/keshigomu.jpg",
  "./assets/thumbs/kinoko.jpg",
  "./assets/thumbs/mame.jpg",
  "./assets/thumbs/mato.jpg",
  "./assets/thumbs/meiro.jpg",
  "./assets/thumbs/nawa.jpg",
  "./assets/thumbs/otoshi.jpg",
  "./assets/thumbs/ramune.jpg",
  "./assets/thumbs/sled.jpg",
  "./assets/thumbs/sumo.jpg",
  "./assets/thumbs/tsumi.jpg",
  "./assets/thumbs/tsuna.jpg",
  "./assets/thumbs/volley.jpg",
  "./assets/thumbs/wataame.jpg",
  "./assets/thumbs/yuki.jpg",
  "./daruma.html",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./icons/maskable-512.png",
  "./index.html",
  "./manifest.webmanifest",
  "./models/gonzo.glb",
  "./models/harinezumi.glb",
  "./models/hoho.glb",
  "./models/kerosuke.glb",
  "./models/kirin.glb",
  "./models/komadori.glb",
  "./models/konko.glb",
  "./models/mimi.glb",
  "./models/mogura.glb",
  "./models/penne.glb",
  "./models/ponta.glb",
  "./models/ray.glb",
  "./models/risu.glb",
  "./src/board/cpu.js",
  "./src/board/effects.js",
  "./src/board/game.js",
  "./src/board/rules.js",
  "./src/board/save.js",
  "./src/board/scene-yuen.js",
  "./src/board/scene.js",
  "./src/board/simulate.js",
  "./src/board/stages/index.js",
  "./src/board/stages/shiki.js",
  "./src/board/stages/yuen.js",
  "./src/characters.js",
  "./src/games/bowl/cpu.js",
  "./src/games/bowl/game.js",
  "./src/games/bowl/rules.js",
  "./src/games/bowl/stage.js",
  "./src/games/bumper/cpu.js",
  "./src/games/bumper/game.js",
  "./src/games/bumper/rules.js",
  "./src/games/bumper/stage.js",
  "./src/games/catch/cpu.js",
  "./src/games/catch/game.js",
  "./src/games/catch/rules.js",
  "./src/games/catch/stage.js",
  "./src/games/daruma/atmosphere.js",
  "./src/games/daruma/audience.js",
  "./src/games/daruma/cpu.js",
  "./src/games/daruma/game.js",
  "./src/games/daruma/gimmicks.js",
  "./src/games/daruma/ground.js",
  "./src/games/daruma/rules.js",
  "./src/games/daruma/stage.js",
  "./src/games/daruma/trees.js",
  "./src/games/dasshutsu/cpu.js",
  "./src/games/dasshutsu/game.js",
  "./src/games/dasshutsu/rules.js",
  "./src/games/dasshutsu/stage.js",
  "./src/games/ehon/cpu.js",
  "./src/games/ehon/game.js",
  "./src/games/ehon/rules.js",
  "./src/games/ehon/stage.js",
  "./src/games/hana/cpu.js",
  "./src/games/hana/game.js",
  "./src/games/hana/rules.js",
  "./src/games/hana/stage.js",
  "./src/games/hayauchi/cpu.js",
  "./src/games/hayauchi/game.js",
  "./src/games/hayauchi/rules.js",
  "./src/games/hayauchi/stage.js",
  "./src/games/hikouki/cpu.js",
  "./src/games/hikouki/game.js",
  "./src/games/hikouki/rules.js",
  "./src/games/hikouki/stage.js",
  "./src/games/ikada/course.js",
  "./src/games/ikada/cpu.js",
  "./src/games/ikada/game.js",
  "./src/games/ikada/raft.js",
  "./src/games/ikada/rules.js",
  "./src/games/ikada/scenery.js",
  "./src/games/ikada/stage.js",
  "./src/games/kakure/cpu.js",
  "./src/games/kakure/game.js",
  "./src/games/kakure/rules.js",
  "./src/games/kakure/stage.js",
  "./src/games/kazan/cpu.js",
  "./src/games/kazan/game.js",
  "./src/games/kazan/rules.js",
  "./src/games/kazan/stage.js",
  "./src/games/keshigomu/cpu.js",
  "./src/games/keshigomu/game.js",
  "./src/games/keshigomu/rules.js",
  "./src/games/keshigomu/stage.js",
  "./src/games/kinoko/cpu.js",
  "./src/games/kinoko/game.js",
  "./src/games/kinoko/rules.js",
  "./src/games/kinoko/stage.js",
  "./src/games/lineup.js",
  "./src/games/mame/cpu.js",
  "./src/games/mame/game.js",
  "./src/games/mame/rules.js",
  "./src/games/mame/stage.js",
  "./src/games/mato/cpu.js",
  "./src/games/mato/game.js",
  "./src/games/mato/pond.js",
  "./src/games/mato/rules.js",
  "./src/games/mato/sling.js",
  "./src/games/mato/stage.js",
  "./src/games/mato/targets.js",
  "./src/games/meiro/cpu.js",
  "./src/games/meiro/game.js",
  "./src/games/meiro/rules.js",
  "./src/games/meiro/stage.js",
  "./src/games/nawa/cpu.js",
  "./src/games/nawa/game.js",
  "./src/games/nawa/rules.js",
  "./src/games/nawa/stage.js",
  "./src/games/otoshi/cpu.js",
  "./src/games/otoshi/game.js",
  "./src/games/otoshi/rules.js",
  "./src/games/otoshi/stage.js",
  "./src/games/ramune/cpu.js",
  "./src/games/ramune/game.js",
  "./src/games/ramune/rules.js",
  "./src/games/ramune/stage.js",
  "./src/games/sled/course.js",
  "./src/games/sled/cpu.js",
  "./src/games/sled/game.js",
  "./src/games/sled/rules.js",
  "./src/games/sled/stage.js",
  "./src/games/sumo/cpu.js",
  "./src/games/sumo/game.js",
  "./src/games/sumo/rules.js",
  "./src/games/sumo/stage.js",
  "./src/games/tsumi/cpu.js",
  "./src/games/tsumi/game.js",
  "./src/games/tsumi/pieces.js",
  "./src/games/tsumi/rules.js",
  "./src/games/tsumi/stage.js",
  "./src/games/tsuna/cpu.js",
  "./src/games/tsuna/game.js",
  "./src/games/tsuna/rules.js",
  "./src/games/tsuna/stage.js",
  "./src/games/volley/cpu.js",
  "./src/games/volley/game.js",
  "./src/games/volley/rules.js",
  "./src/games/volley/stage.js",
  "./src/games/wataame/cpu.js",
  "./src/games/wataame/game.js",
  "./src/games/wataame/rules.js",
  "./src/games/wataame/stage.js",
  "./src/games/yuki/cpu.js",
  "./src/games/yuki/game.js",
  "./src/games/yuki/rules.js",
  "./src/games/yuki/stage.js",
  "./src/guests/ray.js",
  "./src/model-kit.js",
  "./src/music/player.js",
  "./src/music/songs.js",
  "./src/net/client.js",
  "./src/net/drive.js",
  "./src/net/games.js",
  "./src/net/session.js",
  "./src/net/taikai-session.js",
  "./src/npcs.js",
  "./src/rng.js",
  "./src/runtime/merge.js",
  "./src/runtime/models.js",
  "./src/settings.js",
  "./src/title/island.js",
  "./src/title/leaves.js",
  "./src/title/online.js",
  "./src/title/paint.js",
  "./src/title/portraits.js",
  "./src/title/release.js",
  "./src/title/sign.js",
  "./src/title/title.js",
  "./src/title/wood.js",
  "./src/title/zukan.js",
  "./vendor/addons/loaders/GLTFLoader.js",
  "./vendor/addons/utils/BufferGeometryUtils.js",
  "./vendor/three.core.js",
  "./vendor/three.module.js"
];
// </precache>

const CACHE = `dongurinpic-${VERSION}`;
const FONTS = 'dongurinpic-fonts';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dongurinpic-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.gstatic.com') {
    // 字のファイルは中身が変わらないので、しまってあればそれを使う
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    // 字の一覧(CSS)は、しまってあるものをすぐ返し、裏で新しくする
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
      return hit || fresh;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // 同じサイトのもの: ネットワークを先に見て、だめならしまったもの。
  // ブラウザの HTTP キャッシュ(GitHub Pages は 10 分)を そのまま 使うと、新しい index.html に
  // 古い .js が まざって 動かなくなる(一覧に 出た 競技を おしても ひらかない)ので、かならず 問いあわせる
  // (かわっていなければ 304 で すぐ かえってくる)。ページ そのもの(navigate)は Request を 作りなおせないので そのまま
  e.respondWith(
    (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' }))
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
