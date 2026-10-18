// Bullet tracers (user, 2026-10-18: "can you add bullet tracers?"): every hitscan bullet (each pellet too) sends a short
// bright streak from the gun's muzzle to where the shot stopped, at 15,000 units a second. The engine emits 'shot'
// {origin, direction, distance, hit, def} per pellet (engine.js shoot); projectile weapons and operator weapons draw
// their own. The streak starts at the muzzle's rough place in the world (the viewmodel is drawn in its own scene):
// below and right of the eye at the hip, centred when aiming. window.kino.tracers: enabled (turns them off), speed, live (count).
import * as THREE from 'three';

const SPEED = 15000, LENGTH = 150, POOL = 64, COLOR = 0xffd79a;

export default function setup({ host, scene, camera, view }) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -.5);   // a unit streak whose tail is at its origin, head forward (-z)
  const mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pool = Array.from({ length: POOL }, () => { const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; m.renderOrder = 5; scene.add(m); return m; });
  host.warmObjects?.push(pool[0]);
  const live = [];   // {m, from, dir, dist, t}
  let next = 0;
  const state = { enabled: true, speed: SPEED, get live() { return live.length; } };
  (window.kino ??= {}).tracers = state;
  const mid0 = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, -1), q = new THREE.Quaternion(), right = new THREE.Vector3(), up = new THREE.Vector3();

  host.on('shot', e => {
    if (!state.enabled || !e?.direction || !(e.distance > 40)) return;
    // the muzzle: down and right of the eye at the hip, nearly centred in ADS
    const aim = view?.aim ?? 0, eye = camera.getWorldPosition(new THREE.Vector3());
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const from = eye.clone().addScaledVector(e.direction, 26).addScaledVector(right, 6 * (1 - aim)).addScaledVector(up, -5 + 2.5 * aim);
    const end = e.origin.clone().addScaledVector(e.direction, e.distance), dir = end.clone().sub(from), dist = dir.length(); if (dist < 30) return;
    dir.divideScalar(dist);
    const m = pool[next]; next = (next + 1) % POOL;
    const old = live.findIndex(l => l.m === m); if (old >= 0) live.splice(old, 1);
    m.quaternion.copy(q.setFromUnitVectors(fwd, dir)); m.visible = true;
    live.push({ m, from, dir, dist, t: 0 });
  });
  host.on('update', dt => {
    if (!dt) return;
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i]; l.t += dt;
      const head = Math.min(l.dist, l.t * state.speed), tail = Math.max(0, head - Math.min(LENGTH, l.dist * .5));
      if (tail >= l.dist - 1) { l.m.visible = false; live.splice(i, 1); continue; }
      l.m.position.copy(l.from).addScaledVector(l.dir, tail);
      // a few pixels wide wherever it is: its width grows with the distance from the eye (0.6 units at least)
      const mid = mid0.copy(l.from).addScaledVector(l.dir, (head + tail) / 2), w = Math.max(.6, mid.distanceTo(camera.position) * .006);
      l.m.scale.set(w, w, Math.max(1, head - tail));
    }
  });
  host.on('reset', () => { for (const l of live) l.m.visible = false; live.length = 0; });
}
