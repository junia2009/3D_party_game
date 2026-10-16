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
const VERSION = '4b0d3d7593a0';
const PRECACHE = [
  "./",
  "./assets/thumbs/catch.jpg",
  "./assets/thumbs/daruma.jpg",
  "./assets/thumbs/ikada.jpg",
  "./assets/thumbs/mato.jpg",
  "./assets/thumbs/sled.jpg",
  "./assets/thumbs/tsumi.jpg",
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
  "./models/komadori.glb",
  "./models/konko.glb",
  "./models/mimi.glb",
  "./models/mogura.glb",
  "./models/penne.glb",
  "./models/ponta.glb",
  "./models/risu.glb",
  "./src/board/cpu.js",
  "./src/board/effects.js",
  "./src/board/game.js",
  "./src/board/rules.js",
  "./src/board/scene.js",
  "./src/board/simulate.js",
  "./src/board/stages/index.js",
  "./src/board/stages/shiki.js",
  "./src/characters.js",
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
  "./src/games/ikada/course.js",
  "./src/games/ikada/cpu.js",
  "./src/games/ikada/game.js",
  "./src/games/ikada/raft.js",
  "./src/games/ikada/rules.js",
  "./src/games/ikada/scenery.js",
  "./src/games/ikada/stage.js",
  "./src/games/lineup.js",
  "./src/games/mato/cpu.js",
  "./src/games/mato/game.js",
  "./src/games/mato/pond.js",
  "./src/games/mato/rules.js",
  "./src/games/mato/sling.js",
  "./src/games/mato/stage.js",
  "./src/games/mato/targets.js",
  "./src/games/sled/course.js",
  "./src/games/sled/cpu.js",
  "./src/games/sled/game.js",
  "./src/games/sled/rules.js",
  "./src/games/sled/stage.js",
  "./src/games/tsumi/cpu.js",
  "./src/games/tsumi/game.js",
  "./src/games/tsumi/pieces.js",
  "./src/games/tsumi/rules.js",
  "./src/games/tsumi/stage.js",
  "./src/model-kit.js",
  "./src/npcs.js",
  "./src/rng.js",
  "./src/runtime/merge.js",
  "./src/runtime/models.js",
  "./src/settings.js",
  "./src/title/island.js",
  "./src/title/leaves.js",
  "./src/title/paint.js",
  "./src/title/portraits.js",
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
  // 同じサイトのもの: ネットワークを先に見て、だめならしまったもの
  e.respondWith(
    fetch(req)
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
