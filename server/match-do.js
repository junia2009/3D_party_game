// Durable Object(ひとつだけ): 「だれとでも」で 入れる 部屋の 名簿。
// 部屋の ほうが 空きが かわる たびに しらせて くる(room-do.js の syncMatch)。
// しばらく しらせが ない 部屋は 名簿から けす(たたまれた 部屋を さがさない ため)。

const STALE_MS = 10 * 60 * 1000;

export class MatchDO {
  constructor(ctx) {
    this.ctx = ctx;
    this.rooms = new Map(); // code → { n, at }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    for (const [code, r] of this.rooms) if (now - r.at > STALE_MS) this.rooms.delete(code);
    if (url.pathname.endsWith('/update')) {
      const code = url.searchParams.get('code');
      if (url.searchParams.get('open') === '1') this.rooms.set(code, { n: Number(url.searchParams.get('n')) || 0, at: now });
      else this.rooms.delete(code);
      return Response.json({ ok: true });
    }
    if (url.pathname.endsWith('/find')) {
      // 人の 多い 部屋から(はやく そろう ように)
      let best = null;
      for (const [code, r] of this.rooms) if (!best || r.n > best.n) best = { code, n: r.n };
      return Response.json({ code: best?.code ?? null });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
