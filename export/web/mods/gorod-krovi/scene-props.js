// Shared loader for Gorod Krovi's scene props (BO3 fxanim models from scene bundles and script models), built by
// .tools/build_gk_scenes.py into the git-ignored mods/maps/gorod-krovi/scenes/ (ripped: never published).
// Used by sophia.js and scenes.js. Not a part of its own (not in mod.js PARTS).
// A prop: { key, root, rig, dur, next, t }. Built in inches, Y-up; clips hold absolute local rotations and offsets
// from each joint's bind position (userData.bindPosition is set before the clips are made, as gauntlet.js does).
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';

export const W = (x, y, z) => new THREE.Vector3(x, z, -y);
const ROOT = new URL('../../', import.meta.url), DIR = 'mods/maps/gorod-krovi/scenes/';
const abs = u => new URL(u, ROOT).href;
let data = null;
export function sceneData() {
  data ??= fetch(abs(DIR + 'scenes.json')).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return data;
}

// one copy of a prop (null when its assets are missing); onNote(name, key) gets the clips' notetracks
export async function makeProp(J, key, onNote = () => {}) {
  const d = J?.props?.[key]; if (!d) return null;
  try {
    const root = await loadModel(abs(d.model)); root.name = 'gk_scene_' + key;
    const P = { key, root, rig: null, dur: d.durations ?? {}, t: 0, next: null, bones: {} };
    P.rig = new Rig(root, n => onNote(n, key));
    root.traverse(o => {
      if (o !== root) o.userData.bindPosition = o.position.clone();
      if (o.isBone || o.type === 'Object3D') P.bones[o.name] ??= o;
      if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; }
    });
    for (const [a, u] of Object.entries(d.animations ?? {})) P.rig.add(a, await loadAnimation(abs(u)));
    return P;
  } catch (e) { console.warn('[gorod-krovi] scene prop', key, e?.message ?? e); return null; }
}

// BO3 origin + angles (pitch yaw roll, degrees) -> the prop's root
const D = Math.PI / 180;
export function place(P, origin, angles = [0, 0, 0]) {
  P.root.position.copy(W(...origin));
  P.root.rotation.set(angles[2] * D, angles[1] * D, -angles[0] * D, 'YZX');
  moved(P.root);
}
export const moved = o => { o.updateMatrix(); o.updateMatrixWorld(true); };
export function hold(P, a, at = 0) {   // still on a frame of a clip (0 = the scene's init pose)
  if (!P) return; if (!P.rig.actions[a]) { moved(P.root); return; }
  P.rig.play(a, false, 0, 0); if (at) P.rig.actions[a].time = at; P.rig.update(0); P.next = null; P.loop = false; moved(P.root);
}
export function play(P, a, { loop = false, then = null } = {}) {
  if (!P?.rig.actions[a]) return false;
  globalThis.kino?.staticFreeze?.thaw?.(P.root);
  P.rig.play(a, loop, 1, loop ? .25 : 0); P.t = P.dur[a] ?? 0; P.next = then; P.loop = loop; return true;
}
// a joint (and every joint under it) collapsed to nothing: BO3's hidepart on a skinned fxanim model
export function hidePart(P, name, hide = true) { const b = P?.bones[name]; if (!b) return false; b.scale.setScalar(hide ? 0 : 1); moved(P.root); return true; }
export const running = P => !!P && (P.loop || !!P.next || !!P.rig.actions[P.rig.current]?.isRunning());
// step a prop's clip; a once clip hands over to its `then` (looping) when it ends
export function step(P, dt) {
  P.rig.update(dt);
  if (P.next && (P.t -= dt) <= 0) { const n = P.next; P.next = null; play(P, n, { loop: true }); }
  P.root.updateMatrixWorld(true);
}
