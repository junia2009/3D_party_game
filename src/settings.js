// せってい(音・BGM・画質)。端末の中にだけ保存する。
//
// quality: 'auto'(重ければ自動で下げる)/ 'high'(下げない)/ 'light'(はじめから軽く: 影なし・解像度低め)

const KEY = 'dongurinpic.settings';
// bgm: 'on' / 'low'(ちいさめ)/ 'off'。sound は 効果音
export const DEFAULTS = { sound: true, bgm: 'on', quality: 'auto' };

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境(プライベートブラウズなど)では、その場かぎりで使う
  }
}
