// まつぼっくり的あて の「ぱちんこ」と「まつぼっくりのかご」(見た目だけ)。
//
// Y の字の木の枝に、2本のゴムと革の袋。袋にまつぼっくりを入れて、うしろへ引いて、はなす。
// ゴムの袋はばねで動く: 引いているあいだは引いた場所へ、はなすと前へはねて、ふるえながらもどる。
// 置き場所はキャラの holder(キャラから見て +z が前、+x がキャラの左)。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';

const wood = toonMaterial(0x8a5a32), woodDark = toonMaterial(0x5e3a1c), rubber = toonMaterial(0xc8442e), leather = toonMaterial(0x7a4a24);
const basketMat = toonMaterial(0xc99a5a), basketDark = toonMaterial(0x9a6e3a);
const unitY = new THREE.Vector3(0, 1, 0);

export function makeSling(pineGeo, pineMat) {
  const group = new THREE.Group();
  // 持ち手と、Y の字の2本の先
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.26, 7), wood);
  handle.position.y = -0.13;
  group.add(handle);
  const tips = [];
  for (const sx of [-1, 1]) {
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.2, 6), wood);
    prong.position.set(sx * 0.05, 0.08, 0);
    prong.rotation.z = -sx * 0.5;
    group.add(prong);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), woodDark);
    knob.position.set(sx * 0.1, 0.17, 0);
    group.add(knob);
    tips.push(knob.position.clone());
  }
  // ゴム2本(長さと向きは毎フレーム合わせる)と、革の袋
  const bands = tips.map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), rubber);
    group.add(m);
    return m;
  });
  const pouch = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), leather);
  pad.scale.set(1.2, 0.8, 0.5);
  pouch.add(pad);
  const pine = new THREE.Mesh(pineGeo, pineMat);
  pine.scale.setScalar(0.75);
  pine.position.z = 0.02;
  pine.rotation.x = Math.PI / 2;
  pouch.add(pine);
  group.add(pouch);

  const rest = new THREE.Vector3(0, 0.15, -0.02); // 引いていないときの袋(2本の先のあいだ、少し手前)
  const off = new THREE.Vector3(), vel = new THREE.Vector3(), want = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  return {
    group,
    pouch,
    // pull: 0〜1(引く強さ)/ yaw: ねらう左右(+ は右へ飛ぶ = 袋は左へ)/ loaded: 袋にまつぼっくりがあるか
    update(dt, { pull = 0, yaw = 0, loaded = true }) {
      want.set(yaw * 0.35 * Math.min(1, pull * 2), -0.05 * pull, -0.5 * pull);
      // ばね: 引いているあいだは しっかりついていく。はなしたら前へはねて、ふるえながらもどる
      const k = pull > 0.01 ? 900 : 420, c = pull > 0.01 ? 40 : 7;
      vel.addScaledVector(tmp.copy(want).sub(off), k * dt).multiplyScalar(Math.exp(-c * dt));
      off.addScaledVector(vel, dt);
      pouch.position.copy(rest).add(off);
      pine.visible = loaded;
      // ゴム: 先から袋まで
      bands.forEach((b, i) => {
        tmp.copy(pouch.position).sub(tips[i]);
        const len = tmp.length();
        b.position.copy(tips[i]).addScaledVector(tmp, 0.5);
        b.scale.set(1, len, 1);
        b.quaternion.setFromUnitVectors(unitY, tmp.normalize());
      });
      return pouch.position;
    },
  };
}

// 足もとのかご: 編んだ円柱に、まつぼっくりが山もり
export function makeBasket(pineGeo, pineMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.2, 12, 1, true), basketMat);
  body.position.y = 0.1;
  body.material.side = THREE.DoubleSide;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), basketDark);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.01;
  g.add(body, bottom);
  for (const y of [0.05, 0.12, 0.19]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15 + y * 0.25, 0.012, 4, 14), basketDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(pineGeo, pineMat);
    p.scale.setScalar(0.7);
    const a = (i / 6) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.08 * (i % 2 + 0.5), 0.2 + (i % 3) * 0.03, Math.sin(a) * 0.08);
    p.rotation.set(Math.random() * 3, Math.random() * 3, 1.2);
    g.add(p);
  }
  return g;
}
