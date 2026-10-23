// 競技を画面なしで、CPU だけで最後まで回す(大会の CPU どうしの対決・テストに使う)。
// THREE にも DOM にも触らない。競技のルールと CPU を、同じ形で呼べるようにまとめる。

import * as daruma from '../games/daruma/rules.js';
import * as darumaCpu from '../games/daruma/cpu.js';
import * as catchR from '../games/catch/rules.js';
import * as catchCpu from '../games/catch/cpu.js';
import * as sled from '../games/sled/rules.js';
import * as sledCpu from '../games/sled/cpu.js';
import * as mato from '../games/mato/rules.js';
import * as matoCpu from '../games/mato/cpu.js';
import * as tsumi from '../games/tsumi/rules.js';
import * as tsumiCpu from '../games/tsumi/cpu.js';
import * as ikada from '../games/ikada/rules.js';
import * as ikadaCpu from '../games/ikada/cpu.js';
import * as hana from '../games/hana/rules.js';
import * as hanaCpu from '../games/hana/cpu.js';
import * as hayauchi from '../games/hayauchi/rules.js';
import * as hayauchiCpu from '../games/hayauchi/cpu.js';
import * as sumo from '../games/sumo/rules.js';
import * as sumoCpu from '../games/sumo/cpu.js';
import * as kakure from '../games/kakure/rules.js';
import * as kakureCpu from '../games/kakure/cpu.js';
import * as dasshutsu from '../games/dasshutsu/rules.js';
import * as dasshutsuCpu from '../games/dasshutsu/cpu.js';
import * as tsuna from '../games/tsuna/rules.js';
import * as tsunaCpu from '../games/tsuna/cpu.js';
import * as nawa from '../games/nawa/rules.js';
import * as nawaCpu from '../games/nawa/cpu.js';
import * as kazan from '../games/kazan/rules.js';
import * as kazanCpu from '../games/kazan/cpu.js';
import * as yuki from '../games/yuki/rules.js';
import * as yukiCpu from '../games/yuki/cpu.js';
import * as bumper from '../games/bumper/rules.js';
import * as bumperCpu from '../games/bumper/cpu.js';
import * as kinoko from '../games/kinoko/rules.js';
import * as kinokoCpu from '../games/kinoko/cpu.js';
import * as ehon from '../games/ehon/rules.js';
import * as ehonCpu from '../games/ehon/cpu.js';
import * as mame from '../games/mame/rules.js';
import * as mameCpu from '../games/mame/cpu.js';
import * as volley from '../games/volley/rules.js';
import * as volleyCpu from '../games/volley/cpu.js';
import * as hikouki from '../games/hikouki/rules.js';
import * as hikoukiCpu from '../games/hikouki/cpu.js';
import * as ramune from '../games/ramune/rules.js';
import * as ramuneCpu from '../games/ramune/cpu.js';

export const GAMES = {
  daruma: { rules: daruma, createCpu: darumaCpu.createCpu, input: darumaCpu.cpuHold, picked: (s) => s.runners.map((r) => r.acorns) },
  catch: { rules: catchR, createCpu: catchCpu.createCpu, input: catchCpu.cpuInput, picked: () => null },
  sled: { rules: sled, createCpu: sledCpu.createCpu, input: sledCpu.cpuInput, picked: () => null },
  mato: { rules: mato, createCpu: matoCpu.createCpu, input: matoCpu.cpuInput, picked: () => null },
  tsumi: { rules: tsumi, createCpu: tsumiCpu.createCpu, input: tsumiCpu.cpuInput, picked: () => null },
  ikada: { rules: ikada, createCpu: ikadaCpu.createCpu, input: ikadaCpu.cpuInput, picked: () => null },
  hana: { rules: hana, createCpu: hanaCpu.createCpu, input: hanaCpu.cpuInput, picked: () => null },
  hayauchi: { rules: hayauchi, createCpu: hayauchiCpu.createCpu, input: hayauchiCpu.cpuInput, picked: () => null },
  sumo: { rules: sumo, createCpu: sumoCpu.createCpu, input: sumoCpu.cpuInput, picked: () => null },
  kakure: { rules: kakure, createCpu: kakureCpu.createCpu, input: kakureCpu.cpuInput, picked: () => null },
  dasshutsu: { rules: dasshutsu, createCpu: dasshutsuCpu.createCpu, input: dasshutsuCpu.cpuInput, picked: () => null },
  tsuna: { rules: tsuna, createCpu: tsunaCpu.createCpu, input: tsunaCpu.cpuInput, picked: () => null },
  nawa: { rules: nawa, createCpu: nawaCpu.createCpu, input: nawaCpu.cpuInput, picked: () => null },
  kazan: { rules: kazan, createCpu: kazanCpu.createCpu, input: kazanCpu.cpuInput, picked: () => null },
  yuki: { rules: yuki, createCpu: yukiCpu.createCpu, input: yukiCpu.cpuInput, picked: () => null },
  bumper: { rules: bumper, createCpu: bumperCpu.createCpu, input: bumperCpu.cpuInput, picked: () => null },
  kinoko: { rules: kinoko, createCpu: kinokoCpu.createCpu, input: kinokoCpu.cpuInput, picked: () => null },
  ehon: { rules: ehon, createCpu: ehonCpu.createCpu, input: ehonCpu.cpuInput, picked: () => null },
  mame: { rules: mame, createCpu: mameCpu.createCpu, input: mameCpu.cpuInput, picked: () => null },
  volley: { rules: volley, createCpu: volleyCpu.createCpu, input: volleyCpu.cpuInput, picked: () => null },
  hikouki: { rules: hikouki, createCpu: hikoukiCpu.createCpu, input: hikoukiCpu.cpuInput, picked: () => null },
  ramune: { rules: ramune, createCpu: ramuneCpu.createCpu, input: ramuneCpu.cpuInput, picked: () => null },
};

// lineup: [{ cpu: 性格 }]。返すのは { ranking(席の番号の順), picked }
export function simulate(key, lineup, seed) {
  const g = GAMES[key];
  const players = lineup.map((l, i) => ({ id: `p${i}` }));
  const s = g.rules.createGame(players, seed);
  const cpus = lineup.map((l, i) => g.createCpu(l.cpu || 'normal', seed, i));
  const limit = 600 / g.rules.STEP; // 10 分ぶん(終わらないときの見張り)
  for (let i = 0; s.phase !== 'finished'; i++) {
    if (i > limit) throw new Error(`${key} が終わらない`);
    g.rules.step(s, cpus.map((c, slot) => g.input(c, s, slot)));
  }
  return { ranking: g.rules.ranking(s), picked: g.picked(s) };
}
