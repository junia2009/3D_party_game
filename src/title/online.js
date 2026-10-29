// オンラインの 入口と 部屋の 画面(タイトルの 中)。
//
// 入口: なまえ・部屋を つくる・あいことばで 入る・だれとでも。
// 部屋: あいことば と リンク・あつまった 子(あいた 席は はじめると CPU)・キャラ・あそびを えらぶ(ホスト)・はじめる。
// サーバーが「はじまった」と いったら、title.js の playOnline で 競技の 会場へ 入る。

import { NetClient, createRoom, matchRoom, saveName, savedName } from '../net/client.js';
import { ONLINE_GAMES } from '../net/games.js';

const COLORS = ['#ff5a4e', '#3d8bff', '#ffc23c', '#34c47c', '#9b6bff'];

// ctx: { $, go, toast, knock, unlockAudio, characters(), faces(), games, picked(), setPicked(key), playOnline(m, client), inGame() }
export function setupOnline(ctx) {
  const { $ } = ctx;
  let client = null;
  let lobby = null;
  let seat = null;
  const params = new URLSearchParams(location.search);
  let pendingRoom = /^\d{4}$/.test(params.get('room') || '') ? params.get('room') : null;

  $('netName').value = savedName();
  $('netName').addEventListener('change', () => saveName($('netName').value.trim()));
  const nameOf = () => { const n = $('netName').value.trim(); saveName(n); return n; };
  const status = (id, text) => { $(id).textContent = text; };

  function join(code) {
    client?.close();
    status('netStatus', 'つないで います…');
    client = new NetClient({
      status: (st) => {
        if (st === 'reconnecting') status('roomStatus', 'つなぎなおして います…');
        if (st === 'online') status('roomStatus', '');
      },
      joined: (m) => {
        seat = m.seat;
        status('netStatus', '');
        const url = new URL(location.href);
        url.searchParams.set('room', m.code);
        history.replaceState(null, '', url);
        if (!ctx.inGame()) ctx.go('room');
      },
      lobby: (l) => { lobby = l; renderRoom(); },
      start: (m) => {
        // つなぎなおしで おなじ 競技の とちゅうに もどった ときは そのまま つづける
        if (ctx.inGame()) return;
        ctx.playOnline(m, client);
      },
      error: (msg, fatal) => {
        ctx.toast(msg);
        status('netStatus', fatal ? msg : '');
        if (fatal) { client = null; if (!ctx.inGame()) ctx.go('online'); }
      },
    });
    client.connect(code, { name: nameOf(), character: ctx.picked() });
  }

  async function withServer(fn, label) {
    ctx.unlockAudio();
    ctx.knock();
    status('netStatus', label);
    try { join(await fn()); } catch (e) { status('netStatus', e.message || 'サーバーに つながりません'); }
  }
  $('netCreate').addEventListener('click', () => withServer(createRoom, '部屋を つくって います…'));
  $('netMatch').addEventListener('click', () => withServer(matchRoom, 'あいて いる 部屋を さがして います…'));
  $('netJoin').addEventListener('click', () => {
    const code = $('netCode').value.replace(/[^0-9]/g, '');
    if (code.length !== 4) { status('netStatus', 'あいことばは 数字 4けただよ'); return; }
    ctx.unlockAudio();
    ctx.knock();
    join(code);
  });
  $('netCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('netJoin').click(); });

  function leave() {
    client?.leave();
    client = null;
    lobby = null;
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }
  $('roomLeave').addEventListener('click', () => { ctx.knock(); leave(); ctx.go('online'); });
  $('roomShare').addEventListener('click', async () => {
    ctx.knock();
    if (!lobby) return;
    const url = `${location.origin}${location.pathname}?room=${lobby.code}`;
    const text = `ドングリンピックで あそぼう! あいことば ${lobby.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'ドングリンピック', text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); ctx.toast('リンクを コピーしたよ'); }
    } catch { /* やめた */ }
  });

  // ── 部屋の 画面 ──────────────────────────────────
  const isHost = () => lobby && lobby.hostSeat === seat;
  function renderRoom() {
    if (!lobby) return;
    const faces = ctx.faces() || {};
    const chars = ctx.characters();
    const nameOfChar = (k) => chars.find((c) => c.key === k)?.name ?? k;
    $('roomCode').textContent = lobby.code;
    $('roomTitle').textContent = lobby.isPublic ? 'だれとでも の 部屋' : '部屋';
    const n = lobby.seats.filter(Boolean).length;
    $('roomCount').textContent = `${n}/5 人(あいた 席は CPU)`;
    $('roomSeats').replaceChildren(...lobby.seats.map((s, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--c', COLORS[i]);
      if (!s) {
        li.className = 'cpu';
        li.innerHTML = '<i class="dot"></i><i class="face"></i><span>あき(CPU)</span><span></span>';
        return li;
      }
      if (i === seat) li.classList.add('me');
      if (!s.connected) li.classList.add('off');
      const face = faces[s.character] ? `<img class="face" src="${faces[s.character]}" alt="">` : '<i class="face"></i>';
      const tag = i === lobby.hostSeat ? '<em>ホスト</em>' : !s.connected ? '<em>きれた</em>' : '';
      li.innerHTML = `<i class="dot"></i>${face}<span></span>${tag}`;
      li.children[2].textContent = `${s.name || nameOfChar(s.character)}${i === seat ? '(あなた)' : ''}`;
      return li;
    }));
    // キャラ: ほかの 子が つかって いる キャラは えらべない
    const mine = lobby.seats[seat]?.character;
    const taken = new Set(lobby.seats.filter((s, i) => s && i !== seat).map((s) => s.character));
    $('roomChars').replaceChildren(...chars.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(c.key === mine));
      b.disabled = taken.has(c.key);
      const face = faces[c.key] ? `<img class="face" src="${faces[c.key]}" alt="">` : '<i class="face"></i>';
      b.innerHTML = `${face}<span>${c.name}</span>`;
      b.addEventListener('click', () => { ctx.knock(); ctx.setPicked(c.key); client?.setCharacter(c.key); });
      return b;
    }));
    // あそびを えらぶ(ホストだけ)
    const host = isHost();
    for (const b of $('roomMode').children) {
      b.setAttribute('aria-pressed', String(b.dataset.v === lobby.settings.mode));
      b.disabled = !host || b.dataset.v === 'taikai'; // すごろくは じゅんびちゅう
    }
    const sel = $('roomGame');
    if (!sel.options.length) {
      sel.append(new Option('おまかせ(毎回 ちがう 競技)', 'random'));
      for (const key of ONLINE_GAMES) sel.append(new Option(ctx.games[key].name, key));
    }
    sel.value = lobby.settings.game;
    sel.disabled = !host;
    $('roomHostNote').textContent = host ? 'あなたが ホスト' : 'ホストが きめるよ';
    $('roomStart').disabled = !host;
    $('roomStart').textContent = host ? 'はじめる!' : 'ホストが はじめるのを まってね';
  }
  for (const b of $('roomMode').children) b.addEventListener('click', () => { ctx.knock(); client?.setSettings({ mode: b.dataset.v }); });
  $('roomGame').addEventListener('change', () => client?.setSettings({ game: $('roomGame').value }));
  $('roomStart').addEventListener('click', () => { ctx.unlockAudio(); ctx.knock(); client?.start(); });

  return {
    get client() { return client; },
    get lobby() { return lobby; },
    // リンクから 来た: タイトルを おしたら この 部屋へ
    takePendingRoom() { const c = pendingRoom; pendingRoom = null; return c; },
    join,
    leave,
    render: renderRoom,
  };
}
