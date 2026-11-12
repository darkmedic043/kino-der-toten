// Der Eisendrache's own power switch (2026-11-12, user: "making the power be normal"). The map's POWER marker got
// CustomWorld's stand-in (a dark box with BO1's lever handle); BO3 plays the scene `power_switch` there with the model
// p7_fxanim_zm_power_switch_mod: a wall box with three dials, a bulb and a lever, and two clips (start = the lever
// thrown and the dials swinging over; idle = its rest afterwards, the same pose as the end of start, so unused here). Built by `.tools/build_castle_panzer.py switch` into switch/ (git-ignored:
// ripped art). Without those files the stand-in stays.
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const DIR = new URL('switch/', import.meta.url).href;
// zm_castle's scriptbundle_scene power_switch: origin (-4.144 2614.58 848), angles (0 180 0)
// The export has no colour image for the switch: BO3 colours its metal from material constants, and the image Greyhound
// lists as the diffuse is a rust detail tile (drawn once across the box it was a pale blotchy slab). So each part gets
// its colour here by material name, [pattern, rgb, metalness, roughness, opacity], over the tile at 5 repeats as grime.
const LOOK = [
  [/pswitch_body_brass$/, [.62, .45, .2], .85, .42, 1], [/pswitch_body_plastic_red$/, [.5, .06, .04], 0, .5, 1], [/pswitch_body_plastic$/, [.07, .06, .055], 0, .45, 1],
  [/pswitch_body$/, [.2, .25, .21], .55, .62, 1], [/pswitch_handle_red$/, [.55, .07, .05], 0, .5, 1], [/pswitch_handle_blk$/, [.05, .05, .05], .2, .5, 1],
  [/pswitch_handle$/, [.42, .42, .4], .9, .4, 1], [/pswitch_bulb$/, [.3, .03, .02], 0, .25, 1], [/glass/, [.8, .9, .9], 0, .08, .16],
];
export const SWITCH_AT = { pos: [-4.144, 848, -2614.58], yaw: Math.PI };

export async function loadSwitch(at = SWITCH_AT) {
  const [model, index] = await Promise.all([loadModel(DIR + 'switch.glb').catch(() => null), fetch(DIR + 'anims.json').then(r => r.ok ? r.json() : null).catch(() => null)]);
  if (!model || !index) return null;
  const m = cloneSkinned(model), holder = new THREE.Group(), rig = new Rig(m), bulbs = [];
  m.traverse(o => {
    if (o.isBone) o.userData.bindPosition = o.position.clone();
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = false;
    const name = o.material.name ?? '', look = LOOK.find(e => e[0].test(name));
    if (!look) return;
    const [, rgb, metal, rough, opacity] = look, mat = o.material = o.material.clone();
    mat.color.setRGB(...rgb); mat.metalness = metal; mat.roughness = rough;
    if (mat.map) { if (/glass|bulb/.test(name)) mat.map = null; else { mat.map.repeat.set(5, 5); mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; } }
    if (opacity < 1) { mat.transparent = true; mat.opacity = opacity; mat.depthWrite = false; }
    // the bulb lights up with the power
    if (/pswitch_bulb/.test(name)) { mat.emissive.setRGB(1, .12, .04); mat.emissiveIntensity = 0; bulbs.push(mat); }
  });
  await Promise.all(Object.keys(index).map(async k => { const d = await loadAnimation(DIR + 'anims/' + k + '.json').catch(() => null); if (d) rig.add(k, d); }));
  holder.name = 'DE_power_switch'; holder.add(m); holder.position.fromArray(at.pos); holder.rotation.y = at.yaw; holder.updateMatrix(); holder.updateMatrixWorld(true);
  let on = null, busy = 0;
  // the lever's state: thrown with the power on (played through when it changes in play, already down otherwise)
  const set = (power, instant = false) => {
    if (power === on) return; on = power;
    rig.play('start', false, power ? 1 : 0, 0);   // off = the clip held on its first frame (`idle` is the rest after the throw)
    if (instant || !power) { rig.update(power ? 10 : 0); busy = .1; } else busy = (index.start?.duration ?? 1.7) + .2;
    for (const b of bulbs) b.emissiveIntensity = power ? 2.4 : 0;
  };
  const update = dt => { if (busy <= 0) return; busy -= dt; rig.update(dt); holder.updateMatrixWorld(true); };
  set(false, true);
  return { holder, rig, set, update };
}

export function setupSwitch({ world, session, scene, host }) {
  if (/[?&]noSwitchModel/.test(location.search)) return null;
  let sw = null, first = true;
  const ready = loadSwitch().then(s => {
    if (!s) return;
    sw = s; scene.add(s.holder); host.warmObjects?.push(s.holder);
    if (world.powerPanel) world.powerPanel.visible = false;
    if (world.powerHandle) world.powerHandle.visible = false;
  });
  host.on('update', dt => { if (!sw) return; sw.set(!!session.power, first); first = false; sw.update(typeof dt === 'number' ? dt : 1 / 60); });
  host.on('reset', () => { first = true; });
  return { ready, model: () => sw?.holder ?? null };
}
