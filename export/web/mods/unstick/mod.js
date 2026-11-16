// Unstick (2026-11-15, Gorod Krovi, user: "alot of spots cause the player to get stuck and not be able to escape"): a
// safety net for collision traps the map audits miss (.tools/stuck-audit.mjs finds the known ones, which get fixed in the
// map). The player counts as stuck after 3.5 s of trying to move (input held in directions over 90 degrees apart, or two
// jumps) while every position of that time fits in a 64-unit box (40 high), with no zombie within 80 (boxed in by zombies
// is the game), not downed, the controller enabled (scripted rides turn it off or move the player). Then they go back to
// the newest spot they walked freely: on the floor, faster than 60 u/s, and later left by 64 or more (so a spot inside the
// trap never counts), at least 48 from the trap. Also the wedge jump (wedge.js): jumping works when resting in a V.
// Debug: window.kino.unstick (state, `now()` forces a rescue).
import * as THREE from 'three';
import { wedgeAssist } from './wedge.js';

const HOLD = 3.5, BOX = 64, NEAR_ZOMBIE = 80, KEEP = 40, PROVE = 64;

export default function setup(api) {
  const { player, host, session, camera } = api;
  if (!player) return;
  const good = [], pending = [], trail = [], st = { sectors: new Set(), jumps: 0, wasJump: false, keepAt: 0, idle: 0, count: 0, t: 0 };
  const feet = () => player.feetPosition;
  const blocked = () => !player.enabled || ['reviving', 'gameover'].includes(session.phase) || window.kino?.movement?.state?.mantling;
  const zombieNear = p => (api.enemies?.list ?? []).some(z => z.root && z.state !== 'dead' && z.root.position.distanceTo(p) < NEAR_ZOMBIE);
  const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const reset = () => { trail.length = 0; st.sectors.clear(); st.jumps = 0; };
  const yaw = new THREE.Euler(0, 0, 0, 'YXZ'), wedge = { y: null, t: 0 };

  function rescue(f) {
    const back = [...good].reverse().find(g => flat(g, f) >= 48) ?? player.spawn;
    if (!back) return;
    console.warn('[unstick] stuck at', f.toArray().map(Math.round), '-> back to', back.toArray().map(Math.round));
    player.reset(back.clone().add(new THREE.Vector3(0, 2, 0)), { eye: false });
    st.count++; reset(); pending.length = 0;
    api.toast?.('Unstuck', 1.5);
  }

  host.on('update', dt => {
    if (!dt) return;
    st.t += dt;
    const f = feet();
    if (blocked()) { reset(); wedge.y = null; return; }
    wedgeAssist(player, dt, wedge);
    // free walking: a spot becomes good once the player has walked 64 away from it
    const v = player.velocity, speed = Math.hypot(v.x, v.z);
    st.keepAt -= dt;
    if (st.keepAt <= 0 && player.onFloor && speed > 60) { st.keepAt = .25; pending.push(f.clone()); if (pending.length > KEEP) pending.shift(); }
    for (let i = pending.length - 1; i >= 0; i--) if (flat(pending[i], f) >= PROVE) { good.push(...pending.splice(0, i + 1)); if (good.length > KEEP) good.splice(0, good.length - KEEP); break; }
    const inp = player.input ?? {}, moving = Math.abs(inp.forward ?? 0) > .1 || Math.abs(inp.strafe ?? 0) > .1;
    if (!moving) { st.idle += dt; if (st.idle > .4) reset(); return; }
    st.idle = 0;
    trail.push([st.t, f.clone()]);
    while (trail.length && st.t - trail[0][0] > HOLD) trail.shift();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [, p] of trail) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    if (x1 - x0 > BOX || z1 - z0 > BOX || y1 - y0 > 40) { const keep = trail.at(-1); reset(); trail.push(keep); return; }
    yaw.setFromQuaternion(camera.quaternion);
    const a = yaw.y + Math.atan2(-(inp.strafe ?? 0), inp.forward ?? 0);
    st.sectors.add(((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
    if (inp.jump && !st.wasJump) st.jumps++; st.wasJump = !!inp.jump;
    const spread = [...st.sectors].some(s => [...st.sectors].some(q => Math.min((s - q + 8) % 8, (q - s + 8) % 8) >= 2));
    if (st.t - trail[0][0] >= HOLD - .05 && (spread || st.jumps >= 2)) { if (zombieNear(f)) { reset(); return; } rescue(f); }
  });
  host.on('start', () => { reset(); good.length = 0; pending.length = 0; });
  window.kino.unstick = { state: st, wedge, good, pending, now: () => rescue(feet()) };
}
