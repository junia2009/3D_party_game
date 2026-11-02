// 競技・大会の 結果を タイトルへ しらせる(ごほうびの どんぐり用)。
// 競技は 自分では ごほうびを 数えない。タイトルが 遊びかた(ひとり / 大会の 中 / オンライン)を 見て きめる
export function reportResult(game, ranking, me) {
  if (typeof window === 'undefined' || !Array.isArray(ranking)) return;
  window.dispatchEvent(new CustomEvent('dg:result', { detail: { game, place: ranking.indexOf(me), count: ranking.length } }));
}

// 大会を さいごまで あそんだ
export function reportTaikai(stage, ranking, me, turns) {
  if (typeof window === 'undefined' || !Array.isArray(ranking)) return;
  window.dispatchEvent(new CustomEvent('dg:taikai', { detail: { stage, place: ranking.indexOf(me), turns } }));
}
