// Gorod Krovi's power switch (2026-11-17, user: "power switch is turned the wrong way"). BO3's own switch is in the map:
// the cabinet `p7_zm_sta_pswitch_body` (a static prop) and the lever `p7_zm_der_pswitch_handle` (a script model the
// build places, rolled 90). CustomWorld's stand-in (a dark box with BO1's lever) stood beside it, and the box was turned
// 90 degrees from its lever (it takes FACE but not the map's perkYaw), so it showed edge-on. The stand-in is hidden here
// and BO3's lever, drawn as its own mesh, swings down 90 degrees (zm_power: rotateroll -90 over .3 s) when the power
// comes on. Which way is down is measured, not assumed. `?noSwitchModel` keeps the stand-in.
import * as THREE from 'three';

export default function (api) {
  const { world, scene, session, host } = api;
  if (/[?&]noSwitchModel/.test(location.search) || !world.root) return;
  // the handle has three primitives: glTF gives a Group of that name holding three InstancedMeshes (same instances)
  const src = [];
  world.root.traverse(o => { if (/^prop_p7_zm_der_pswitch_handle_script/.test(o.name)) o.traverse(c => { if (c.isInstancedMesh && !src.includes(c)) src.push(c); }); });
  if (!src.length) { console.warn('[gorod-krovi] power switch: no BO3 lever in the map'); return; }
  world.root.updateMatrixWorld(true);
  const levers = [];
  for (let i = 0; i < src[0].count; i++) {
    const m = new THREE.Matrix4(); src[0].getMatrixAt(i, m); m.premultiply(src[0].matrixWorld);
    const inv = m.clone().invert(), holder = new THREE.Group();
    for (const im of src) {   // each primitive keeps its offset from the first (identity in practice)
      const mi = new THREE.Matrix4(); im.getMatrixAt(Math.min(i, im.count - 1), mi); mi.premultiply(im.matrixWorld);
      const mesh = new THREE.Mesh(im.geometry, im.material); mesh.matrixAutoUpdate = false; mesh.matrix.copy(inv.clone().multiply(mi));
      mesh.castShadow = im.castShadow; mesh.receiveShadow = im.receiveShadow; holder.add(mesh);
    }
    holder.name = 'GK_power_lever'; holder.matrixAutoUpdate = false; holder.matrix.copy(m); scene.add(holder); holder.updateMatrixWorld(true);
    levers.push({ holder, base: m.clone() });
    host.warmObjects?.push(holder);
  }
  for (const im of src) im.visible = false;
  // the roll that lowers the lever's middle is "down"
  const box = new THREE.Box3(), lowY = sign => { const l = levers[0]; l.holder.matrix.copy(l.base).multiply(new THREE.Matrix4().makeRotationX(sign * Math.PI / 2)); l.holder.updateMatrixWorld(true); return box.setFromObject(l.holder).getCenter(new THREE.Vector3()).y; };
  const dir = lowY(1) < lowY(-1) ? 1 : -1;
  const pose = a => { const r = new THREE.Matrix4().makeRotationX(dir * a * Math.PI / 2); for (const l of levers) { l.holder.matrix.copy(l.base).multiply(r); l.holder.updateMatrixWorld(true); } };
  pose(0);
  const hideStandIn = () => { if (world.powerPanel) world.powerPanel.visible = false; if (world.powerHandle) world.powerHandle.visible = false; };
  hideStandIn();
  let on = null, t = 1;
  host.on('update', dt => {
    hideStandIn();   // the handle is placed asynchronously
    const p = !!session.power;
    if (p !== on) { t = on === null ? 1 : 0; on = p; }
    if (t < 1) t = Math.min(1, t + (typeof dt === 'number' ? dt : 1 / 60) / .3);
    else if (t !== 1.5) { pose(on ? 1 : 0); t = 1.5; return; } else return;
    pose(on ? t : 1 - t);
  });
  host.on('reset', () => { on = null; });
  window.kino ??= {}; (window.kino.gorod ??= {}).power = { levers: levers.length, dir };
  console.info(`[gorod-krovi] power switch: ${levers.length} BO3 lever(s), stand-in hidden`);
}
