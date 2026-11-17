// Gorod Krovi's buy doors as floating debris (2026-11-17, user: "doors being crates instead of what they actually are,
// being the floating debris"). BO3's buy doors here are fxanim shells whose real pieces were never exported, so the map
// builder stands a pile of crates in each passage (`door_pile_standin`, build_bo3_map.py). The pile stays as the door's
// collision and nav plug, undrawn; what is drawn is floating debris (fx/floating-debris.js) made from the map's own
// rubble, crates, boards and barrels, turned to the pile's own line (five of the piles stand across diagonal doorways).
// The gates and power doors keep their real models. `?noDebris` turns it off.
import * as THREE from 'three';
import { floatingDebris } from '../fx/floating-debris.js';

const PROPS = ['p7_debris_concrete_rubble_lg_03_no_metal_flat_edge', 'p7_debris_concrete_rubble_slab', 'p7_concrete_pillar_block', 'p7_crate_wood',
  'p7_crate_wood_02_iron_cross', 'p7_zm_ctl_crate_ammo_vintage', 'p7_barrel_metal_55gal_green_drk', 'p7_zm_sta_rubble_mud_debris_concrete_rocks_lg',
  'p7_debris_wood_board_2pc_2x8x128_lt_burn', 'p7_dock_wood_rustic_board_single_wide'];

// the yaw (0-90°) that fits the points' footprint tightest, and their box in that turned frame
function fit(pts) {
  let best = null;
  for (let d = 0; d < 90; d++) {
    const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const p of pts) { const u = c * p.x - s * p.z, w = s * p.x + c * p.z; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w; }
    const area = (u1 - u0) * (w1 - w0);
    if (!best || area < best.area) best = { a, area };
  }
  const frame = new THREE.Matrix4().makeRotationY(best.a), inv = frame.clone().invert(), box = new THREE.Box3();
  for (const p of pts) box.expandByPoint(p.clone().applyMatrix4(inv));
  const c = box.getCenter(new THREE.Vector3()), at = c.clone().applyMatrix4(frame);   // the frame sits at the pile's middle
  frame.setPosition(at); box.translate(c.negate());
  return { frame, box };
}

export default function (api) {
  const { world } = api;
  if (!world.doors || !world.root || /[?&]noDebris/.test(location.search)) return;
  const piles = [];
  for (const door of world.doors.values()) for (const part of door.parts) part.object.traverse(o => { if (/^door_pile_standin/.test(o.name)) piles.push({ door, node: o }); });
  if (!piles.length) return;
  const debris = floatingDebris(api, { models: PROPS, seed: 23 });
  let n = 0;
  for (const { door, node } of piles) {
    node.updateMatrixWorld(true);
    const pts = [];
    node.traverse(o => { const a = o.isMesh && o.geometry?.attributes.position; if (!a) return; for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld)); });
    if (!pts.length) continue;
    const { frame, box } = fit(pts);
    node.traverse(o => { o.layers.mask = 0; });   // the crates stay as collision and nav plug, undrawn
    if (debris.block(door, [box], frame)) n++;
  }
  window.kino ??= {}; (window.kino.gorod ??= {}).debris = debris;
  console.info(`[gorod-krovi] floating debris: ${n} piles, ${debris.kinds.length} prop kinds`);
}
