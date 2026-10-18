// Bullet tracers (user, 2026-10-18: "can you add bullet tracers?"; then "should be instant and hitscan"): every hitscan
// bullet (each pellet too) draws a bright line from the gun's muzzle to where the shot stopped, all at once, and it
// fades out within LIFE seconds of real time (a flash showing where the shot went, not a flying bullet). The engine
// emits 'shot' {origin, direction, distance, hit, def} per pellet (engine.js shoot); projectile weapons, a mod's own
// fire hooks and the Thundergun return before it, so they get none, and sprays that run through the hitscan path
// (the underbarrel flamethrower, the Winter's Howl) are skipped here. The line starts at the muzzle's rough place in
// the world (the viewmodel is drawn in its own scene): below and right of the eye at the hip, centred when aiming.
// It tapers from the muzzle to the far end so it stays a few pixels wide along its whole length.
// window.kino.tracers: enabled (turns them off), life (seconds), live (count).
import * as THREE from 'three';

const LIFE = .07, POOL = 64, COLOR = 0xffd79a, OPACITY = .9, PX = .004, MIN_W = .15;

export default function setup({ host, scene, camera, view }) {
  const base = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -.5);   // tail at the origin, head forward (-z)
  const basePos = base.attributes.position.array.slice();
  const pool = Array.from({ length: POOL }, () => {
    const geo = base.clone(), mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; m.renderOrder = 5; m.userData.born = 0;
    // fades by the wall clock as it's drawn, so a paused or slowed game can't leave one hanging
    m.onBeforeRender = () => {
      const age = (performance.now() - m.userData.born) / 1000;
      if (age >= state.life) { m.visible = false; mat.opacity = 0; return; }
      mat.opacity = OPACITY * (1 - age / state.life);
    };
    scene.add(m); return m;
  });
  host.warmObjects?.push(pool[0]);
  let next = 0;
  const state = { enabled: true, life: LIFE, get live() { const now = performance.now(); return pool.filter(m => m.visible && now - m.userData.born < state.life * 1000).length; } };
  (window.kino ??= {}).tracers = state;
  const fwd = new THREE.Vector3(0, 0, -1), q = new THREE.Quaternion(), right = new THREE.Vector3(), up = new THREE.Vector3(), eye = new THREE.Vector3();
  const spray = def => !!(def?.flamethrower || def?.freeze || /^freezegun/.test(def?.baseId ?? def?.id ?? ''));

  host.on('shot', e => {
    if (!state.enabled || !e?.direction || !(e.distance > 40) || spray(e.def)) return;
    // the muzzle: down and right of the eye at the hip, nearly centred in ADS
    const aim = view?.aim ?? 0; camera.getWorldPosition(eye);
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const from = eye.clone().addScaledVector(e.direction, 26).addScaledVector(right, 6 * (1 - aim)).addScaledVector(up, -5 + 2.5 * aim);
    const end = e.origin.clone().addScaledVector(e.direction, e.distance), dir = end.clone().sub(from), dist = dir.length(); if (dist < 30) return;
    dir.divideScalar(dist);
    const m = pool[next]; next = (next + 1) % POOL;
    // a width proportional to the distance from the eye at each end: the head's cross-section is `ratio` times the tail's
    const wTail = Math.max(MIN_W, from.distanceTo(eye) * PX), ratio = Math.max(MIN_W, end.distanceTo(eye) * PX) / wTail;
    const pos = m.geometry.attributes.position, a = pos.array;
    for (let i = 0; i < a.length; i += 3) { const s = basePos[i + 2] < -.25 ? ratio : 1; a[i] = basePos[i] * s; a[i + 1] = basePos[i + 1] * s; }
    pos.needsUpdate = true;
    m.position.copy(from); m.quaternion.copy(q.setFromUnitVectors(fwd, dir)); m.scale.set(wTail, wTail, dist);
    m.updateMatrix(); m.updateMatrixWorld(true);
    m.userData.born = performance.now(); m.material.opacity = OPACITY; m.visible = true;
  });
  host.on('reset', () => { for (const m of pool) m.visible = false; });
}
