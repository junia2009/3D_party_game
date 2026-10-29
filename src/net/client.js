// オンライン対戦の クライアント(WebSocket)。サーバー(Cloudflare Workers + Durable Objects)との やりとりを ここに まとめる。
// ルールの 計算は ここでは しない ── 権威は サーバーに ある。

// 接続先。デプロイ後の workers.dev の URL。
// 開発中は ?server=... で 上書きでき、localhost では 自動で 手元の サーバー(npm run server)を 見る。
const DEFAULT_SERVER = 'https://dongurinpic-server.uriboo-dev.workers.dev';
const KEY = 'dongurinpic.net';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function save(o) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...o })); } catch { /* しまえない ときは その場かぎり */ }
}

export function serverBase() {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override.replace(/\/$/, '');
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return `http://${location.hostname}:8787`;
  return DEFAULT_SERVER;
}

// おなじ 端末は おなじ ID を つかいつづける(つなぎなおしで もとの 席に もどる ため)
export function clientId() {
  let id = load().clientId;
  if (!id) {
    id = `c-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    save({ clientId: id });
  }
  return id;
}
export const savedName = () => load().name ?? '';
export const saveName = (name) => save({ name });

async function post(path) {
  const res = await fetch(`${serverBase()}${path}`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error ?? 'サーバーに つながりません');
  return data.code;
}
export const createRoom = () => post('/new');
export const matchRoom = () => post('/match');

const PING_MS = 20000;
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

// handlers: { status(s), joined(m), lobby(lobby), start(m), snap(m), end(m), error(msg, fatal) }
export class NetClient {
  constructor(handlers = {}) {
    this.h = handlers;
    this.ws = null;
    this.code = null;
    this.seat = null;
    this.lobby = null;
    this.closedByUs = false;
    this.retry = 0;
  }

  connect(code, { name, character }) {
    this.code = code;
    this.name = name;
    this.character = character;
    this.closedByUs = false;
    this.open();
  }

  open() {
    this.status('connecting');
    const ws = new WebSocket(`${serverBase().replace(/^http/, 'ws')}/room?code=${this.code}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.send({ t: 'hello', clientId: clientId(), name: this.name, character: this.character });
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this.send({ t: 'ping' }), PING_MS);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'joined') { this.seat = m.seat; this.status('online'); this.h.joined?.(m); }
      else if (m.t === 'lobby') { this.lobby = m.lobby; this.h.lobby?.(m.lobby); }
      else if (m.t === 'start') { this.seat = m.seat; this.h.start?.(m); }
      else if (m.t === 'snap') this.h.snap?.(m);
      else if (m.t === 'end') this.h.end?.(m);
      else if (m.t === 'error') {
        this.h.error?.(m.msg, m.fatal);
        if (m.fatal) this.close();
      }
    };
    ws.onclose = () => {
      clearInterval(this.pinger);
      if (this.ws !== ws) return;
      if (this.closedByUs) { this.status('closed'); return; }
      // きれた: すこし まって つなぎなおす(おなじ ID なので もとの 席に もどる)
      this.status('reconnecting');
      const wait = RETRY_MS[Math.min(this.retry++, RETRY_MS.length - 1)];
      setTimeout(() => { if (!this.closedByUs) this.open(); }, wait);
    };
  }

  status(s) { this.state = s; this.h.status?.(s); }
  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  setCharacter(character) { this.character = character; this.send({ t: 'chara', character }); }
  setSettings(settings) { this.send({ t: 'settings', settings }); }
  start() { this.send({ t: 'start' }); }
  sendInputs(v) { this.send({ t: 'in', v }); }

  leave() {
    this.send({ t: 'leave' });
    this.close();
  }
  close() {
    this.closedByUs = true;
    clearInterval(this.pinger);
    try { this.ws?.close(); } catch { /* 済 */ }
    this.ws = null;
  }
}
