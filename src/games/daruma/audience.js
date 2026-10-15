// 観客(森の小動物)の動きと反応。
//
// ルールには関係しない。rules.step のできごと(events)と state を見て、
// アニメーションと表情を切り替えるだけ。乱数は演出なので Math.random でよい。
//
// - 数えている間: 数える速さに合わせて体をゆらす
// - 先生が見張っている間: 観客もぴたっと止まる(いっしょに遊んでいる)
// - だれかが見つかった: 「あっ」とのけぞる子と、笑う子がいる
// - 落ち葉が鳴った・どんぐりが当たった: 近くの子が反応する
// - ゴール: みんなで拍手してはねる

import { createModel } from '../../runtime/models.js';
import { SEATS, STUMP_TOP } from './stage.js';

export async function createAudience(scene) {
  const members = await Promise.all(SEATS.map(async (seat) => {
    const model = await createModel(seat.kind);
    model.root.position.set(seat.x, seat.seat === 'stump' ? STUMP_TOP : 0, seat.z);
    // コースのほうを向く(少しスタート寄り = カメラのほう)
    model.root.rotation.y = Math.atan2(-seat.x, 2.5);
    model.setFace('normal');
    model.play('idle');
    model.actions.idle.time = Math.random() * 2.4; // みんなでそろって揺れないように
    scene.add(model.root);
    return { seat, model, react: null, until: 0 };
  }));

  let time = 0;

  function react(m, clip, face, length) {
    m.react = clip;
    m.until = time + length;
    m.model.play(clip, { fade: 0.08, once: clip === 'gasp' });
    m.model.setFace(face);
  }

  function near(x, z, r) {
    return members.filter((m) => Math.hypot(m.seat.x - x, m.seat.z - z) < r);
  }

  return {
    onEvent(e, s, laneX) {
      switch (e.type) {
        case 'caught':
          for (const m of members) {
            if (Math.random() < 0.7) react(m, 'gasp', 'surprised', 1.0 + Math.random() * 0.3);
            else react(m, 'laugh', 'happy', 1.4);
          }
          break;
        case 'rustle':
          for (const m of near(laneX(e.slot), -s.runners[e.slot].x, 7)) react(m, 'gasp', 'surprised', 0.9);
          break;
        case 'bonk':
          for (const m of near(laneX(e.slot), -e.x, 8)) react(m, 'laugh', 'happy', 1.2);
          break;
        case 'goal':
        case 'finished':
          for (const m of members) react(m, 'cheer', 'happy', 99);
          break;
      }
    },
    reset() {
      for (const m of members) {
        m.react = null;
        m.model.play('idle');
        m.model.setFace('normal');
      }
    },
    update(dt, s) {
      time += dt;
      const watching = s && (s.phase === 'turn' || s.phase === 'watch');
      for (const m of members) {
        if (m.react && time > m.until) {
          m.react = null;
          m.model.play('idle', { fade: 0.25 });
          m.model.setFace('normal');
        }
        let speed = 1;
        if (!m.react) {
          if (watching) speed = 0; // 先生が見ている間は、観客も止まる
          else if (s && s.phase === 'chant') speed = Math.min(2.2, 2.4 / s.chant.length + 0.6); // 速く数えるほど速くゆれる
        }
        if (m.model.actions.idle) m.model.actions.idle.timeScale = speed;
        m.model.update(dt);
      }
    },
  };
}
