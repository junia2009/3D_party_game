// オンラインで あそべる 競技(画面が「自分の 席 = game.me」と サーバーの 状態に 対応した もの)。
// 部屋で えらべるのも、おまかせで 出るのも ここに ある ものだけ。いまは ぜんぶの 競技。
import { MINIGAMES } from '../board/rules.js';

export const ONLINE_GAMES = [...MINIGAMES];
