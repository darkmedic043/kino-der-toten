// The clock tower's breakable wall (2026-11-13, user: "whole lot missing here"). BO3 closes the top room of the clock tower
// with the scene p7_fxanim_zm_castle_quest_rune_clock_wall_bundle: a brick wall over the rune clock that the Fire Bow quest's
// first shot blows out. It is a script scene, so the map build never placed it: the room had a hole to the sky with the
// rune clock's works showing. This puts the wall back and breaks it when the Fire quest starts (bows.js `rune` leaving
// `idle`: the same for everyone in co-op, and already broken for a late joiner). Built by
// `.tools/build_castle_panzer.py clockwall` into clockwall/ (git-ignored: ripped art); without those files nothing changes.
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CollisionWorld } from '../../collision-world.js';

const DIR = new URL('clockwall/', import.meta.url).href;
// zm_castle's scriptbundle_scene: origin (-1053 1682 1068), no angles
export const WALL_AT = [-1053, 1068, -1682];

// a ring with three strokes, drawn once (never redrawn: one upload at load)
let sign = null;
function runeSign() {
  if (sign) return sign;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#fff'; g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 6;
  g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 33, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 36); g.lineTo(64, 92); g.moveTo(64, 50); g.lineTo(84, 40); g.moveTo(64, 68); g.lineTo(44, 80); g.stroke();
  sign = new THREE.CanvasTexture(c); sign.colorSpace = THREE.SRGBColorSpace; return sign;
}

export async function loadClockWall(at = WALL_AT) {
  const [model, index] = await Promise.all([loadModel(DIR + 'wall.glb').catch(() => null), fetch(DIR + 'anims.json').then(r => r.ok ? r.json() : null).catch(() => null)]);
  if (!model || !index?.break) return null;
  const m = cloneSkinned(model), holder = new THREE.Group(), rig = new Rig(m), glow = [];
  m.traverse(o => {
    if (o.isBone) o.userData.bindPosition = o.position.clone();
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = false;
    // the magma rune on the bricks, the mark to shoot: its picture is not in the export (the card drew plain white), so it glows with a drawn sign
    if (/magma_rune/.test(o.material.name ?? '')) { o.material = new THREE.MeshBasicMaterial({ name: 'de_clock_wall_rune', map: runeSign(), color: 0xff6a1c, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); glow.push(o.material); }
  });
  const clip = await loadAnimation(DIR + 'anims/break.json').catch(() => null);
  if (!clip) return null;
  rig.add('break', clip);
  holder.name = 'DE_clock_wall'; holder.add(m); holder.position.fromArray(at); holder.updateMatrix(); holder.updateMatrixWorld(true);
  // the wall as it stands before the shot, as triangles in the map's space: the player's barrier (see setupClockWall)
  const tris = [], v = new THREE.Vector3();
  m.traverse(o => {
    if (!o.isMesh || glow.includes(o.material)) return;
    const pos = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : pos.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, ix ? ix.getX(i) : i).applyMatrix4(o.matrixWorld); tris.push(v.x, v.y, v.z); }
  });
  const length = index.break.duration ?? 4.67;
  let broken = null, busy = 0;
  // intact = the clip held on its first frame; broken in play = played through; broken at load = its last frame
  const set = (on, instant = false) => {
    if (on === broken) return false; broken = on;
    rig.play('break', false, on ? 1 : 0, 0);
    if (instant || !on) { rig.update(on ? length + 1 : 0); busy = .1; } else busy = length + .2;
    for (const g of glow) g.opacity = on ? 0 : .85;
    return on && !instant;
  };
  const update = dt => { if (busy <= 0) return; busy -= dt; rig.update(dt); holder.updateMatrixWorld(true); };
  set(false, true);
  return { holder, rig, set, update, length, tris };
}

export function setupClockWall({ scene, host, camera, world }, { bows, sfxAt } = {}) {
  if (/[?&]noClockWall/.test(location.search)) return null;
  let wall = null, first = true;
  const at = new THREE.Vector3().fromArray(WALL_AT);
  const ready = loadClockWall().then(w => {
    if (!w) return;
    wall = w; scene.add(w.holder); host.warmObjects?.push(w.holder);
    // Solid for the player, before and after the break (the rune clock fills the hole in BO3, with clips around it): without
    // it the top room opened onto the roofs outside the map. Shots pass (`window`), so the quest's arrow still lands.
    if (w.tris.length && world?.dynamic) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(w.tris, 3));
      world.dynamic.push({ name: 'clock wall', collider: new CollisionWorld(g), box: new THREE.Box3().setFromBufferAttribute(g.attributes.position), enabled: true, window: true });
      world.collision?.invalidateCache?.();
    }
  });
  host.on('update', dt => {
    if (!wall) return;
    const stage = bows?.state?.().rune?.stage ?? 'idle';
    if (wall.set(stage !== 'idle', first)) sfxAt?.('wall_explo', at, camera, .9, 2600);
    first = false; wall.update(typeof dt === 'number' ? dt : 1 / 60);
  });
  host.on('reset', () => { first = true; });
  return { ready, model: () => wall?.holder ?? null };
}
