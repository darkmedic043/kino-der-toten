// The mounted MG42 on Pavlov's second floor (zm_stalingrad_mounted_mg.gsc, 2026-11-15): pavlov_turret, used from the
// pavlov_mg trigger (radius 64) for 1000 points; not while a lockdown runs. The player is held at the gun for up to 30 s
// (use again to get off); afterwards it smokes and cools for 15 s x the share of the 30 s used. Hold fire to shoot
// (turret_bo3_germans_zm_stalingrad: about 1150 rounds a minute); the barrel heats and overheats for 2.5 s if held too
// long. Kills emit gk 'mg:kill' (challenge 3_4). The gun turns with the view inside a 140° arc. Host/solo only (the local
// player). Debug: kino.gorod.mg.{state, mount, off}; ?noMg leaves it out.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { sceneData, makeProp, place, moved, solidOf, W } from './scene-props.js';

const TURRET = [-2846.52, 21070.1, 159.562], TURRET_YAW = 254.4, USE = [-2840.56, 21092.3, 207];
const COST = 1000, MAX_T = 30, COOL = 15, RATE = 1 / 19, ARC = 70 * Math.PI / 180, PITCH = [-35, 30].map(d => d * Math.PI / 180);
const HEAT_SHOT = 1 / 60, HEAT_COOL = .45, OVERHEAT = 2.5, RANGE = 8000, SPREAD = .012;

export default async function setupMg(api, gk) {
  const { world, session, enemies, player, camera, scene } = api, host = api.host;
  const q = new URLSearchParams(location.search);
  if (q.has('noMg') || (api.sync && api.sync.isHost === false)) return;
  const J = await sceneData();
  const P = await makeProp(J, 'mg42');

  const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol = 1) => { const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol); a.play().catch(() => {}); return a; };
  let loopA = null;
  const loopOn = () => { if (loopA) return; loopA = new Audio(BASE + 'mg_loop.ogg'); loopA.loop = true; loopA.volume = level(.75); loopA.play().catch(() => {}); };
  const loopOff = () => { if (!loopA) return; loopA.pause(); loopA.src = ''; loopA = null; };

  const D = Math.PI / 180, center = (TURRET_YAW - 90) * D;   // the camera yaw that looks down the barrel at rest
  const useAt = W(...USE), base = W(...TURRET);
  const M = { state: 'ready', t: 0, readyAt: 0, used: 0, firing: false, heat: 0, hot: 0, next: 0, kills: 0, shots: 0, feet: null, yaw: 0, pitch: 0 };

  // ---- the gun ------------------------------------------------------------------------------------------------------------
  let turret = null, barrel = null, flash = null; const bind = new Map();
  if (P) {
    place(P, TURRET, [0, TURRET_YAW, 0]); P.root.userData.noMerge = true; scene.add(P.root); moved(P.root);
    turret = P.bones.tag_turret ?? null; barrel = P.bones.tag_barrel ?? null; flash = P.bones.tag_flash ?? barrel ?? P.root;
    for (const b of [turret, barrel]) if (b) bind.set(b, b.quaternion.clone());
    try { const c = solidOf([P.root], { name: 'gk_mg42' }); if (c) { world.dynamic.push(c); world.collision?.invalidateCache?.(); } } catch (e) { console.warn('[gorod-krovi] mg collision', e); }
  }
  const pq = new THREE.Quaternion(), wq = new THREE.Quaternion();
  // turn a bone by a world-space rotation on top of its bind pose: local = parent⁻¹ · R · parent · bind
  function turn(b, axis, a) {
    if (!b) return;
    b.parent.updateMatrixWorld(true); b.parent.getWorldQuaternion(pq);
    wq.setFromAxisAngle(axis, a);
    b.quaternion.copy(pq).invert().multiply(wq).multiply(pq).multiply(bind.get(b));
  }
  const UP = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3();
  function aimGun(yaw, pitch) {
    turn(turret, UP, yaw);
    // the barrel pitches about the turret's right after the yaw
    right.set(Math.cos(center + yaw), 0, -Math.sin(center + yaw));
    if (barrel && barrel !== turret) turn(barrel, right, pitch);
    else if (turret) { wq.setFromAxisAngle(right, pitch); turret.parent.getWorldQuaternion(pq); turret.quaternion.premultiply(pq.clone().invert().multiply(wq).multiply(pq)); }
    P && moved(P.root); P?.root.updateMatrixWorld(true);
  }

  // ---- the prompt (function_f734357f) ---------------------------------------------------------------------------------------
  const lockdown = () => gk.pap?.state?.().state === 'active';
  world.addInteraction({
    position: useAt.clone(),
    hidden: () => (M.state === 'on' ? false : lockdown() || session.phase === 'reviving' || player.getFeetPosition().distanceTo(useAt) > 64 + 50),
    text: () => M.state === 'on' ? 'Get off the MG' : M.state === 'cool' ? 'The MG is cooling down' : `Use the MG [Cost: ${COST}]`,
    use: () => {
      if (M.state === 'on') return off(), true;
      if (M.state !== 'ready' || lockdown()) return false;
      if (session.points < COST) { sfx('strike_deny', .6); return false; }
      session.points -= COST; mount(); return true;
    },
  });

  function mount() {
    M.state = 'on'; M.t = 0; M.firing = false; M.heat = 0; M.hot = 0; M.yaw = 0; M.pitch = 0;
    const f = player.getFeetPosition();
    M.feet = new THREE.Vector3(useAt.x + (useAt.x - base.x) * .4, f.y, useAt.z + (useAt.z - base.z) * .4);
    camera.rotation.y = center; host.gunBlocked = true; host.hideViewmodel = true;
    api.toast?.('Hold fire to shoot · use to get off', 2.5);
  }
  function off() {
    if (M.state !== 'on') return;
    stopFire(); host.gunBlocked = false; host.hideViewmodel = false;
    M.used = Math.min(1, M.t / MAX_T); M.state = 'cool'; M.readyAt = session.time + COOL * M.used; M.smokeT = 0;
  }

  // the player is held at the gun (world.prePlayer, as the dragon ride)
  const pre = world.prePlayer;
  world.prePlayer = dt => {
    if (M.state === 'on' && M.feet) { player.setPosition(M.feet.clone()); return true; }
    return !!pre?.(dt);
  };

  // ---- firing -----------------------------------------------------------------------------------------------------------
  let mouse = false;
  addEventListener('mousedown', e => { if (M.state !== 'on' || e.button !== 0) return; e.stopImmediatePropagation(); mouse = true; }, true);
  addEventListener('mouseup', e => { if (e.button === 0) mouse = false; }, true);
  function startFire() { if (M.firing) return; M.firing = true; sfx('mg_first', .8); loopOn(); }
  function stopFire() { if (!M.firing) return; M.firing = false; loopOff(); sfx('mg_last', .8); }
  const ray = new THREE.Ray(), dir = new THREE.Vector3();
  function shot() {
    M.shots++;
    camera.getWorldDirection(dir);
    dir.x += (Math.random() - .5) * SPREAD * 2; dir.y += (Math.random() - .5) * SPREAD * 2; dir.z += (Math.random() - .5) * SPREAD * 2; dir.normalize();
    ray.set(camera.position.clone(), dir.clone());
    const wall = world.raycast(ray, 1, RANGE), far = wall ? wall.distance : RANGE;
    const h = enemies.rayHit(ray, far);
    const fx = window.kino?.fx, muzzle = flash.getWorldPosition(new THREE.Vector3());
    if (fx) {
      if (M.shots % 2) fx.flash?.(muzzle, { color: 0xffb060, intensity: 3, radius: 500, life: .05 });
      fx.emit?.({ key: 'glow', at: muzzle.clone(), size: [16, 34], life: .05, fade: [0, .5], additive: true, color: 0xffc070 });
      const end = h?.point ?? camera.position.clone().addScaledVector(dir, far);
      if (M.shots % 3 === 0) for (let k = 1; k <= 3; k++) fx.emit?.({ key: 'glow', at: muzzle.clone().lerp(end, k / 4), size: [6, 10], life: .04, fade: [0, .5], additive: true, color: 0xffd38a });
    }
    if (!h?.z) return;
    const z = h.z, plain = z.kind === 'zombie' && !z.special && !z.boss;
    const dmg = plain ? Math.max(150, (z.maxHealth ?? z.health ?? 500) * (h.head ? .55 : .3)) : 90 + 20 * (session.round ?? 1);
    enemies.hurt(z, dmg, !!h.head, false, 'bullet', true);
    if (!enemies.list.includes(z)) { M.kills++; gk.emit('mg:kill', z); }
  }

  host.on('update', dt => {
    if (!dt) return;
    try {
      if (M.state === 'cool') {
        const fx = window.kino?.fx;
        if (fx?.emit && (M.smokeT -= dt) <= 0) { M.smokeT = .15; fx.emit({ key: 'smoke', at: flash.getWorldPosition(new THREE.Vector3()), vel: new THREE.Vector3(0, 40, 0), size: [8, 40], life: 1.2, fade: [.1, .6], opacity: .3, color: 0x888888, drag: .5 }); }
        if (session.time >= M.readyAt) M.state = 'ready';
        return;
      }
      if (M.state !== 'on') return;
      M.t += dt;
      if (M.t >= MAX_T || session.phase === 'reviving' || session.phase === 'gameover' || lockdown()) return off();
      // the view stays inside the gun's arc
      let y = camera.rotation.y - center; y = Math.atan2(Math.sin(y), Math.cos(y));
      if (Math.abs(y) > ARC) { y = Math.sign(y) * ARC; camera.rotation.y = center + y; }
      if (camera.rotation.x < PITCH[0]) camera.rotation.x = PITCH[0]; if (camera.rotation.x > PITCH[1]) camera.rotation.x = PITCH[1];
      M.yaw = y; M.pitch = camera.rotation.x; aimGun(M.yaw, M.pitch);
      const want = (mouse || !!host.view?.input?.fire || !!api.view?.input?.fire) && M.hot <= 0;
      if (M.hot > 0) { M.hot -= dt; if (M.hot <= 0) M.heat = .3; }
      if (want) {
        startFire(); M.next -= dt;
        while (M.next <= 0) { M.next += RATE; shot(); M.heat += HEAT_SHOT; if (M.heat >= 1) { M.hot = OVERHEAT; stopFire(); sfx('mg_overheat', .9); break; } }
      } else { stopFire(); M.next = 0; M.heat = Math.max(0, M.heat - HEAT_COOL * dt); }
    } catch (e) { console.error('[gorod-krovi] mg', e); }
  });
  host.on('reset', () => { if (M.state === 'on') off(); M.state = 'ready'; M.readyAt = 0; M.kills = 0; if (turret || barrel) aimGun(0, 0); hud(); });

  // ---- HUD: time left and the barrel's heat ----------------------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `#gk-mg{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);pointer-events:none;z-index:6;display:none;font:600 12px/1.3 system-ui,sans-serif;color:#f2e2c8;text-shadow:0 1px 2px #000;text-align:center}
#gk-mg i{display:block;width:180px;height:5px;margin:3px auto 0;background:#0008;border:1px solid #0009}#gk-mg i b{display:block;height:100%;background:#ffb040}#gk-mg.hot i b{background:#ff4020}`;
  document.head.append(style);
  const el = document.createElement('div'); el.id = 'gk-mg'; el.innerHTML = '<span></span><i><b></b></i>'; document.body.append(el);
  let warm = false, shown = '';
  function hud() {
    const on = warm || M.state === 'on'; el.style.display = on ? 'block' : 'none'; if (!on) return;
    const s = `MG42 · ${Math.max(0, Math.ceil(MAX_T - M.t))} s${M.hot > 0 ? ' · OVERHEATED' : ''}`;
    if (s !== shown) { el.firstChild.textContent = s; shown = s; }
    el.className = M.hot > 0 ? 'hot' : ''; el.querySelector('b').style.width = `${Math.round(Math.min(1, warm ? .5 : M.heat) * 100)}%`;
  }
  host.on('update', () => { if (M.state === 'on' || el.style.display !== 'none') hud(); });
  host.on('warmHud', on => { warm = !!on; hud(); });

  const handle = {
    state: () => ({ state: M.state, t: +M.t.toFixed(1), readyIn: Math.max(0, +(M.readyAt - session.time).toFixed(1)), heat: +M.heat.toFixed(2), hot: M.hot > 0, kills: M.kills, shots: M.shots, yaw: +(M.yaw / D).toFixed(1), pitch: +(M.pitch / D).toFixed(1), bones: { turret: !!turret, barrel: !!barrel } }),
    mount: () => { if (M.state === 'on') return false; M.state = 'ready'; mount(); return true; }, off, fire: v => { mouse = !!v; },
  };
  gk.mg = handle; if (window.kino?.gorod) window.kino.gorod.mg = handle;
}
