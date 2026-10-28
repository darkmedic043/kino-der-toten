import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createAimAssist } from '../export/web/mods/controller/aim-assist.js';

// one zombie 500 units ahead, the eye 60 up, looking a little to its side
function rig({perks = [], clear = true} = {}) {
  const camera = new THREE.PerspectiveCamera(); camera.rotation.order = 'YXZ'; camera.position.set(0, 60, 0); camera.rotation.set(0, .05, 0);
  const z = {kind: 'zombie', state: 'chase', health: 100, root: new THREE.Object3D()}; z.root.position.set(0, 0, -500);
  const enemies = {list: [z], headPosition: z => z.root.position.clone().add(new THREE.Vector3(0, 63, 0))};
  const api = {camera, session: {perks: new Set(perks), phase: 'fighting'}, enemies, world: {lineClear: () => clear}};
  return {camera, z, api, aa: createAimAssist(api)};
}
const run = (aa, secs, o) => { let s = 1; for (let t = 0; t < secs; t += 1 / 60) s = aa.step(1 / 60, {level: 1, ads: false, moving: 0, turning: 0, ...o}); return s; };
// height of the crosshair's line at the zombie's distance
const aimY = camera => camera.position.y + Math.tan(camera.rotation.x) * 500;

test('ADS snap lands on the chest, and on the head with Deadshot', () => {
  const a = rig(); run(a.aa, .3, {ads: true});
  assert.ok(Math.abs(a.camera.rotation.y) < .002, 'yaw on target');
  assert.ok(Math.abs(aimY(a.camera) - 63 * .72) < 1.5, `chest, got ${aimY(a.camera)}`);
  const d = rig({perks: ['specialty_deadshot']}); run(d.aa, .3, {ads: true});
  assert.ok(Math.abs(aimY(d.camera) - 63) < 1.5, `head, got ${aimY(d.camera)}`);
  assert.equal(d.aa.state.head, true);
});

test('slowdown over a target, none off it or with the setting off', () => {
  const a = rig(); a.camera.rotation.set(0, 0, 0);
  assert.ok(run(a.aa, .05) < .7, 'slower over the zombie');
  const far = rig(); far.camera.rotation.set(0, .6, 0);
  assert.equal(run(far.aa, .05), 1);
  const off = rig(); off.camera.rotation.set(0, 0, 0);
  assert.equal(run(off.aa, .05, {level: 0}), 1);
  const yaw = off.camera.rotation.y; run(off.aa, .3, {level: 0, ads: true}); assert.equal(off.camera.rotation.y, yaw, 'no snap when off');
});

test('no snap without a clear line, tracking follows while strafing', () => {
  const b = rig({clear: false}); run(b.aa, .3, {ads: true});
  assert.equal(b.camera.rotation.y, .05);
  const a = rig(); a.camera.rotation.set(0, 0, 0); run(a.aa, .05);
  for (let i = 0; i < 30; i++) { a.camera.position.x += 4; a.aa.step(1 / 60, {level: 1, ads: false, moving: 1, turning: 0}); }
  // strafing right 120 units moves the zombie ~.24 rad left of where it was; tracking takes 40% of that
  assert.ok(a.camera.rotation.y > .07 && a.camera.rotation.y < .13, `followed by ${a.camera.rotation.y}`);
});
