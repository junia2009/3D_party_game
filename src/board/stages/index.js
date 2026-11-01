// 大会のステージの一覧。THREE にも DOM にも触らない。
//
// ステージを足すときは、stages/<名前>.js にデータを書いて、ここの STAGES と LIST に足す。
// LIST はステージ選択画面に出す順。ready: false は「じゅんびちゅう」の札。

import { STAGE as shiki } from './shiki.js';
import { STAGE as yuen } from './yuen.js';
import { STAGE as umi } from './umi.js';

export const STAGES = { shiki, yuen, umi };

export const LIST = [
  { key: 'shiki', name: '四季の森', desc: '春の池・夏の森・秋の山・冬の雪原を、ぐるっとめぐる', ready: true },
  { key: 'yuen', name: 'どんぐり遊園地', desc: 'コースター・観覧車・おばけ屋敷。乗り物で 一気に 大移動', ready: true },
  { key: 'umi', name: '海の中の 探検', desc: 'サンゴ礁から 深海へ。海流と クジラで ぐんと 進む', ready: true },
];
