// Worker 本体: あいことばから 部屋(Durable Object)へ ふりわける だけの うすい 層。
// 部屋の 状態と 進行は room-do.js、だれとでも の 名簿は match-do.js。

import { CODE_LENGTH, makeRoomCode, normalizeRoomCode } from './room-core.js';

export { RoomDO } from './room-do.js';
export { MatchDO } from './match-do.js';

// 静的サイトは GitHub Pages、サーバーは workers.dev と 別オリジン
const ALLOWED_ORIGINS = [
  'https://junia2009.github.io',
  'http://localhost:8000',
  'http://localhost:8010',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:8010',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
const json = (request, body, status = 200) => Response.json(body, { status, headers: corsHeaders(request) });

async function newRoom(env, isPublic) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeRoomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(`https://room/claim?code=${code}&public=${isPublic ? 1 : 0}`);
    const { free } = await res.json();
    if (free) return code;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === '/health') return json(request, { ok: true });

    // 新しい 部屋(あいことばで 入る)
    if (url.pathname === '/new') {
      const code = await newRoom(env, false);
      return code ? json(request, { code }) : json(request, { error: '部屋を つくれませんでした。もう一度 ためしてね' }, 503);
    }
    // だれとでも: あいて いる 部屋を さがす。なければ つくる
    if (url.pathname === '/match') {
      const m = env.MATCH.get(env.MATCH.idFromName('match'));
      const { code } = await (await m.fetch('https://match/find')).json();
      if (code) return json(request, { code });
      const fresh = await newRoom(env, true);
      return fresh ? json(request, { code: fresh }) : json(request, { error: '部屋を つくれませんでした' }, 503);
    }
    // 部屋へ つなぐ(WebSocket)
    if (url.pathname === '/room') {
      const code = normalizeRoomCode(url.searchParams.get('code'));
      if (code.length !== CODE_LENGTH) return json(request, { error: 'あいことばは 数字 4けたです' }, 400);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(`https://room/ws?code=${code}`, request);
    }
    return json(request, { error: 'not found' }, 404);
  },
};
