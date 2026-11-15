// The Gauntlet of Siegfried as an operator weapon (BO3 _zm_weap_dragon_gauntlet.gsc, scratch/gk/spec/gauntlet.md "The
// weapon"). Two forms, each BO3's own viewmodel on Dempsey's arms (gauntlet.js loads them, .tools/build_gk_gauntlet.py):
//   flame  (dragon_gauntlet_flamethrower, vm_z_dragon_gaunt_*): the whelp rides the arm. Left mouse: a cone of flame
//          (500 units, 22°) that kills a normal zombie at a touch; tough ones (Mangler, drone, mech, bosses) take 0.8%
//          of their health per 0.1 s. Melee (V): the arm swipe, a kill. Right mouse (power over 3%, 1 s after the
//          pull) sends the whelp out: the clip of it leaving the arm, then the punch form.
//   punch  (dragon_gauntlet, vm_z_aint_no_dragon_*; BO3's `_upg` viewmodel: blue trim, no whelp): left mouse punches
//          (everything within 128 of a point 40 ahead dies, at most 6 per 0.05 s), V is BO3's 1 s melee juke (the
//          player is thrown forward and everything within 96 of the path dies every 0.1 s). Right mouse calls the whelp
//          back (it lands on the arm: altRaiseAnim) and the flame form returns.
// The whelp (c_zom_dlc3_dragon_small, ai_zm_dlc3_dragon_whelp_*): flies within 300 (2D) of the player, picks the enemy
// nearest the player within 700 (Manglers -700, drones -500, its current target -300 as BO3's get_dragon_enemy), aims
// 0.2 s, spits a fireball (a kill; tough ones 5%), 1 s between shots. With nothing to shoot it fetches the nearest
// power-up within 2000 and carries it to the player. It never takes damage and goes when the gauntlet is put away
// (also when the player goes down: the operator mod puts the weapon away then).
// Power: 25 kills charge it (the operator mod; its own kills never do); flame drains 1/22 a second while it burns and
// 1/120 held, the whelp 1/30 a second: about 20-25 s of flame or 30 s of whelp on a full bar. At 0 it is put away.
// Every kill emits gk 'gauntlet:kill' (mode: 'flame' | 'whelp' | 'punch', z). Cause 'operator' (player points as usual).
// Sounds: BO3's (zm_stalingrad bank): the flame start/loop/stop, the whelp's screams, wing flaps, fireballs, poofs.
import * as THREE from 'three';
import { ViewWeapon, loadModel, Rig } from '../../animation.js';
import { disposeSkeletons } from '../../runtime-assets.js';

export const ID = 'dragon_gauntlet';
const KILLS = 25, FLAME_TIME = 22, HELD_TIME = 120, WHELP_TIME = 30;
const RANGE = 500, CONE = Math.cos(THREE.MathUtils.degToRad(22)), TICK = .1, TOUGH_TICK = .008, WHELP_TOUGH = .05;
const PUNCH_R = 128, PUNCH_AHEAD = 40, JUKE_R = 96, JUKE_TIME = 1, JUKE_SPEED = 520, KILL_CAP = 6;
const LEASH = 300, GUARD = 700, FETCH = 2000, AIM = .2, COOL = 1, FIREBALL_SPEED = 1500;
const tough = z => !!z?.boss || /raz|sentinel|mech|nikolai|mangler|panzer/.test(z?.kind ?? '');
const chest = z => z.root.position.clone().add(new THREE.Vector3(0, z.kind === 'dog' ? 20 : z.kind === 'sentinel' ? 0 : 40, 0));

// A (gauntlet.js): { J, sound(n, v), soundAt(n, pos, v), loop(n, v) -> {stop}, fix(root, mode), pool, whelpModel() }
export function setupGauntletWeapon(api, gk, A) {
  const { scene, viewScene, enemies, camera, audio, session, world, data, player, powerups } = api;
  const operator = window.kino?.operator;
  if (!operator) return null;
  const kino = window.kino;
  let fresh = false, live = null;
  const share = (z, s) => (z.boss ? s * 20000 : s * (z.maxHealth ?? 20000));
  // hurt with the operator cause; true when it died (and the kill is announced to the other systems)
  function strike(z, mode, s, head = false, melee = false) {
    if (!enemies.list.includes(z) || z.special) return false;
    enemies.hurt(z, tough(z) ? share(z, s) : 1e9, head, melee, 'operator');
    const dead = !enemies.list.includes(z);
    if (dead) gk.emit('gauntlet:kill', mode, z);
    return dead;
  }

  operator.register({ id: ID, name: 'Gauntlet of Siegfried', short: 'GAUNTLET', color: '#ff7a2a', kills: KILLS, drain: 0,
    icon: 'M6 11V6a1.5 1.5 0 0 1 3 0v4V4.5a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v5V7.5a1.5 1.5 0 0 1 3 0V15c0 3.5-2.8 6-6.2 6C8.5 21 6 18.5 6 15z',
    activate, given() { fresh = true; A.warmSounds?.(); } });

  // ---- the flame's sprites (BO1's flamethrower sheets, a pool made once at setup: gauntlet.js warms its materials) ----
  const P = A.pool;
  function tickSprites(dt) {
    for (const p of P.list) { if (!p.alive) continue;
      p.t += dt; const u = p.t / p.life;
      if (u >= 1) { p.alive = false; p.sprite.visible = false; continue; }
      p.vel.multiplyScalar(Math.exp(-dt * (p.kind === 'smoke' ? 1.2 : 1.4))); p.vel.y += (p.kind === 'smoke' ? 50 : 110) * dt;
      p.sprite.position.addScaledVector(p.vel, dt); p.sprite.material.rotation += p.spin * dt;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.sqrt(u));
      if (p.sh.anim) P.frame(p, Math.floor(u * p.sh.frames));
      p.sprite.material.opacity = p.kind === 'smoke' ? Math.min(1, (1 - u) * 2) * .7 : Math.min(1, (1 - u) * 1.8) * (u < .08 ? u / .08 : 1);
    }
  }

  function activate(ctx) {
    const mode = { cur: 'flame', busy: null, t: 0 };   // busy: 'release' | 'recall' (the swap clips)
    let vw = null, stand = null, ended = false, held = 0, firing = false, fireT = 0, tick = 0, flameLoop = null;
    let swing = null, juke = null, whelp = null;
    const baseFov = camera.fov, lastCam = camera.position.clone();
    const def = m => { const d = A.J?.[m]; return d ? { ...d, melee: { meleeTime: d.durations?.meleeAnim ?? .6, meleeDelay: .15 } } : null; };
    const note = n => {
      const m = /^sndnt#(.+)$/.exec(n); if (!m) return;
      const k = m[1], s = /^fly_gaunt_scream_(\d)$/.exec(k);
      if (s) A.sound('scream' + s[1], .45); else if (k === 'fly_gaunt_shake') A.sound('shake', .5);
      else if (k === 'fly_gaunt_attach') A.sound('attach', .6); else if (k === 'fly_gaunt_wings') A.sound('flap' + (1 + Math.floor(Math.random() * 3)), .35);
      else if (/melee_swipe/.test(k)) audio.play('knife', .5);
    };
    function equip(m, swap = null) {
      mode.cur = m; const d = def(m === 'flame' ? 'flame' : 'punch');
      if (!d || !viewScene) { standIn(); return; }
      vw ??= new ViewWeapon(viewScene, data, note);
      if (swap) vw.raiseWith = swap;
      vw.equip(d).then(() => { if (ended) { dropView(); return; } A.fix(vw.pivot, m); })
        .catch(e => { console.warn('[gauntlet] model', e); dropView(); standIn(); });
    }
    function standIn() {   // no BO3 files: an orange block of a glove
      if (stand || !viewScene) return;
      const m = new THREE.MeshStandardMaterial({ color: 0x6a3a1c, metalness: .6, roughness: .5, emissive: 0x401000 });
      stand = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 14), m); stand.position.set(7, -8, -15); viewScene.add(stand);
    }
    function dropView() { if (!vw) return; vw.pivot.removeFromParent(); if (vw.root) disposeSkeletons(vw.root); vw = null; }
    const real = () => vw?.ready;
    const play = (k, m = 'fire', speed = 1, fade = .04) => { if (!real() || !vw.rig.actions[k]) return false; vw.mode = m; vw.rig.play(k, false, speed, fade); return true; };
    equip('flame', fresh && A.J?.flame?.animations?.firstRaiseAnim ? 'firstRaiseAnim' : null); fresh = false;

    // ---- flame ----
    const viewCam = new THREE.PerspectiveCamera(51, 1, .01, 200), nz = new THREE.Vector3(), fwd = new THREE.Vector3();
    function nozzle(out) {
      const b = vw?.gun?.getObjectByName('tag_flash');
      viewCam.aspect = camera.aspect; viewCam.updateProjectionMatrix();
      if (b && real()) { b.getWorldPosition(nz); nz.project(viewCam); } else nz.set(.3, -.4, .5);
      nz.x = THREE.MathUtils.clamp(nz.x, -.9, .9); nz.y = THREE.MathUtils.clamp(nz.y, -.9, .9); nz.z = .5;
      nz.unproject(camera); return out.copy(camera.position).add(nz.sub(camera.position).normalize().multiplyScalar(26));
    }
    function flameOn(on) {
      if (on === firing) return; firing = on;
      if (on) { A.sound('flame_start', .7); flameLoop?.stop(); flameLoop = A.loop('flame_loop', .55); play('fireInAnim', 'fire', 2); fireT = 0; }
      else { flameLoop?.stop(); flameLoop = null; A.sound('flame_stop', .6); play('fireOutAnim', 'fire', 1.6); }
    }
    function burnTick() {
      camera.getWorldDirection(fwd);
      const wall = world.raycast?.(new THREE.Ray(camera.position.clone(), fwd.clone()), 1, RANGE), reach = wall ? Math.max(30, wall.distance - 10) : RANGE;
      for (const z of [...enemies.list]) {
        const c = chest(z), d = c.clone().sub(camera.position), dist = d.length();
        if (dist > reach + 30 || (dist > 40 && d.normalize().dot(fwd) < CONE)) continue;
        if (world.lineClear && !world.lineClear(camera.position, c)) continue;
        if (strike(z, 'flame', TOUGH_TICK)) kino.fx?.burn?.(c);
      }
      return reach;
    }
    function flameFx(dt, reach) {
      const at = nozzle(new THREE.Vector3()); camera.getWorldDirection(fwd);
      const n = Math.max(1, Math.round(dt * 70));
      for (let i = 0; i < n; i++) {
        const dir = fwd.clone().add(new THREE.Vector3((Math.random() - .5) * .16, (Math.random() - .5) * .12, (Math.random() - .5) * .16)).normalize();
        const sp = (reach / .5) * (.75 + Math.random() * .4);
        P.spawn(Math.random() < .6 ? 'base' : 'lick', at.clone().addScaledVector(dir, Math.random() * 10), dir.multiplyScalar(sp), .5, 4, 34 + Math.random() * 20);
      }
      if (Math.random() < dt * 9) P.spawn('smoke', at.clone().addScaledVector(fwd, reach * .7), fwd.clone().multiplyScalar(120), 1.2, 30, 90);
    }

    // ---- punch and juke ----
    function punchAt(p, r, mode2 = 'punch') {
      let n = 0;
      for (const z of enemies.list.map(z => ({ z, d: chest(z).distanceTo(p) })).filter(o => o.d <= r).sort((a, b) => a.d - b.d).map(o => o.z)) {
        if (n >= KILL_CAP) break;
        if (strike(z, mode2, .03, false, true)) { n++; fling(z, p); }
      }
      return n;
    }
    function fling(z, from) {
      const away = z.root.position.clone().sub(from).setY(0); if (away.lengthSq() < 1) away.copy(fwd).setY(0); away.normalize();
      z.life = Math.max(z.life ?? 0, 2); flung.push({ z, v: away.multiplyScalar(500).setY(260), t: 0 });
      kino.fx?.blood?.(chest(z).toArray(), 1.2);
    }
    const flung = [];
    function melee() {
      if (mode.busy || swing || juke) return;
      if (mode.cur === 'flame') {   // the arm swipe: a kill in front
        if (!real() || !vw.melee()) { swing = { t: 0, hit: .15, len: .6 }; } else swing = { t: 0, hit: .2, len: vw.meleeLeft };
        return;
      }
      // the punch form's juke: 1 s thrown forward, everything near the path dies
      juke = { t: 0, next: 0 }; play('meleeInAnim', 'fire') || play('meleeAnim', 'fire'); A.sound('poof' + (Math.random() < .5 ? 0 : 1), .4);
    }
    function fire(down) {
      if (mode.cur === 'flame') { if (!down || mode.busy || swing) flameOn(false); else if (ctx.power > 0) flameOn(true); return; }
      if (!down || mode.busy || swing || juke) return;
      swing = { t: 0, hit: .12, len: .45, punch: true }; play('meleeAnim', 'fire', 1.3); audio.play('knife', .5);
    }
    function aim(down) {
      if (!down || mode.busy) return;
      if (mode.cur === 'flame') { if (ctx.power > .03 && held >= 1) release(); }
      else recall();
    }
    function release() {
      flameOn(false); mode.busy = 'release'; mode.t = 0;
      if (!play('altDropAnim', 'fire')) mode.t = .3;
      A.sound('scream' + (1 + Math.floor(Math.random() * 5)), .6);
    }
    function recall() {
      mode.busy = 'recall'; mode.t = 0; swing = null; juke = null;
      if (whelp) whelp.home = true; else mode.t = 9;
    }

    // ---- the whelp ----
    function spawnWhelp() {
      const g = new THREE.Group(), w = { g, rig: null, model: null, target: null, aimT: 0, cool: .4, fetch: null, home: false, key: null, flap: 0, vel: new THREE.Vector3(), fireballs: [] };
      camera.getWorldDirection(fwd);
      g.position.copy(camera.position).addScaledVector(fwd, 40).add(new THREE.Vector3(0, -10, 0));
      scene.add(g);
      A.whelpModel().then(m => {
        if (!m || w.dead) { if (m) disposeSkeletons(m); if (!m && !w.dead) standInWhelp(w); return; }
        w.model = m; g.add(m); w.rig = new Rig(m);
        for (const [k, c] of Object.entries(A.whelpClips ?? {})) w.rig.add(k, c);
        w.rig.play('idle'); w.key = 'idle';
      }).catch(() => standInWhelp(w));
      A.soundAt('flap1', g.position, .6);
      return w;
    }
    function standInWhelp(w) {
      if (w.dead) return; const m = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, emissive: 0x401800 }));
      w.model = m; w.stand = true; w.g.add(m);
    }
    function killWhelp(w, poof = true) {
      if (!w || w.dead) return; w.dead = true;
      if (poof) { kino.fx?.explosion?.(w.g.position.clone(), .25, 0xffa040); A.soundAt('poof' + (Math.random() < .5 ? 0 : 1), w.g.position, .7); }
      if (w.fetch?.item) w.fetch.item.carried = false;
      w.g.removeFromParent(); if (w.model && !w.stand) disposeSkeletons(w.model); else if (w.stand) { w.model.geometry.dispose(); w.model.material.dispose(); }
    }
    const feet = () => player.getFeetPosition();
    function pickTarget(w) {
      const owner = feet(); let best = null, bs = Infinity;
      for (const z of enemies.list) {
        if (z.special || z.state === 'rising' || z.root.visible === false) continue;
        const p = z.root.position, d = Math.hypot(p.x - owner.x, p.z - owner.z); if (d > GUARD + (z.kind === 'raz' ? 300 : 0)) continue;
        const s = d - (z.kind === 'raz' ? 700 : z.kind === 'sentinel' ? 500 : 0) - (z === w.target ? 300 : 0);
        if (s < bs && (!world.lineClear || world.lineClear(w.g.position, chest(z)) || world.lineClear(camera.position, chest(z)))) { bs = s; best = z; }
      }
      return best;
    }
    const _v = new THREE.Vector3();
    function tickWhelp(w, dt) {
      const g = w.g, owner = feet();
      camera.getWorldDirection(fwd); const f2 = fwd.clone().setY(0).normalize(), right = new THREE.Vector3(-f2.z, 0, f2.x);
      let goal;
      if (w.home) goal = camera.position.clone().addScaledVector(fwd, 30).add(new THREE.Vector3(0, -12, 0));
      else if (w.fetch) goal = w.fetch.carry ? owner.clone().add(new THREE.Vector3(0, 40, 0)) : w.fetch.item.root.position.clone().add(new THREE.Vector3(0, 20, 0));
      else { if ((w.roof -= dt) <= 0 || w.roofH == null) { w.roof = .5; const up = world.raycast?.(new THREE.Ray(owner.clone().add(new THREE.Vector3(0, 40, 0)), new THREE.Vector3(0, 1, 0)), 0, 120); w.roofH = up ? Math.max(45, up.distance + 40 - 22) : 95; }   // under a low ceiling it flies lower
        goal = owner.clone().addScaledVector(f2, 70).addScaledVector(right, 60).add(new THREE.Vector3(0, Math.min(95, w.roofH) + Math.sin(session.time * 1.7) * 6, 0)); }
      // leash: never further than 300 (2D) from the player, unless fetching
      const to = goal.clone().sub(g.position), dist = to.length();
      const speed = w.home ? 900 : w.fetch ? 520 : Math.min(600, 80 + dist * 3);
      g.position.addScaledVector(to.normalize(), Math.min(dist, speed * dt));
      if (!w.fetch && !w.home) { const o = g.position.clone().sub(owner).setY(0); if (o.length() > LEASH) { o.setLength(LEASH); g.position.x = owner.x + o.x; g.position.z = owner.z + o.z; } }
      // facing: the target, else where it flies, else the player's view
      const face = w.target && enemies.list.includes(w.target) ? chest(w.target).sub(g.position) : dist > 10 ? to.clone() : f2.clone();
      if (face.lengthSq() > 1) { const yaw = Math.atan2(-face.z, face.x); let dy = yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 8); }
      // clip by motion: forward / back / sideways / hover
      if (w.rig && w.key !== 'attack') {
        let k = 'idle';
        if (dist > 30) { const loc = to.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y); k = Math.abs(loc.x) >= Math.abs(loc.z) ? (loc.x > 0 ? 'f' : 'b') : (loc.z > 0 ? 'r' : 'l'); }
        if (k !== w.key && w.rig.actions[k]) { w.rig.play(k, true, 1, .25); w.key = k; }
      }
      if ((w.flap -= dt) <= 0) { w.flap = 1.4 + Math.random(); A.soundAt('flap' + (1 + Math.floor(Math.random() * 3)), g.position, .3, 1200); }
      w.rig?.update(dt);
      if (w.home) return;
      // power-ups: fetch the nearest within 2000 when there is nothing to shoot
      if (w.fetch) {
        const it = w.fetch.item;
        if (!powerups?.items?.includes(it)) { w.fetch = null; }
        else if (!w.fetch.carry) { if (g.position.distanceTo(it.root.position) < 50) { w.fetch.carry = true; it.carried = true; } }
        else { it.age = Math.min(it.age, 20); it.root.position.copy(g.position).add(new THREE.Vector3(0, -18, 0));
          if (g.position.distanceTo(owner) < 120) it.root.position.copy(owner).add(new THREE.Vector3(0, 24, 0)); }
      }
      // attack: aim 0.2 s, fireball, 1 s
      w.cool -= dt;
      if (w.target && (!enemies.list.includes(w.target) || w.target.root.visible === false)) w.target = null;
      if (w.cool <= 0 && !w.aimT) { w.target = pickTarget(w); if (w.target) { w.aimT = AIM; if (w.fetch && !w.fetch.carry) w.fetch = null; } else { w.cool = .3; if (!w.fetch) fetch(w); } }
      if (w.aimT && (w.aimT -= dt) <= 0) {
        w.aimT = 0; w.cool = COOL;
        if (w.target && enemies.list.includes(w.target)) {
          if (w.rig?.actions.attack) { w.rig.play('attack', false, 2.2, .08); w.key = 'attack'; setTimeout(() => { if (!w.dead && w.key === 'attack') { w.key = null; } }, 800); }
          const from = g.position.clone(); const head = w.model?.getObjectByName?.('tag_flash'); if (head) head.getWorldPosition(from);
          w.fireballs.push({ p: from, z: w.target, t: 0 }); A.soundAt('fireball' + Math.floor(Math.random() * 4), from, .7);
        }
      }
      for (let i = w.fireballs.length - 1; i >= 0; i--) {
        const b = w.fireballs[i]; b.t += dt;
        const tgt = enemies.list.includes(b.z) ? chest(b.z) : b.last ?? b.p; b.last = tgt;
        const d = tgt.clone().sub(b.p), l = d.length(), step = FIREBALL_SPEED * dt;
        kino.fx?.emit?.({ key: 'fire', at: b.p.clone(), vel: d.clone().setLength(-60), size: [14, 26], life: .25, fade: [.05, .6], additive: true, opacity: .9 });
        if (l <= step || b.t > 1.5) {
          w.fireballs.splice(i, 1); kino.fx?.explosion?.(tgt.clone(), .22, 0xff7a2a);
          if (enemies.list.includes(b.z)) { if (strike(b.z, 'whelp', WHELP_TOUGH)) kino.fx?.burn?.(tgt); }
          for (const z of [...enemies.list]) if (z !== b.z && !tough(z) && chest(z).distanceTo(tgt) < 40) strike(z, 'whelp', 0);   // a little splash
        } else b.p.addScaledVector(d, step / l);
      }
    }
    function fetch(w) {
      if (!powerups?.items?.length) return;
      const owner = feet(); let best = null, bd = FETCH;
      for (const it of powerups.items) { if (it.carried) continue; const d = it.root.position.distanceTo(owner); if (d < bd && d > 70) { bd = d; best = it; } }
      if (best) w.fetch = { item: best, carry: false };
    }

    function update(dt) {
      held += dt;
      if (mode.busy === 'release') {
        mode.t += dt;
        if (!whelp && mode.t >= .3) whelp = spawnWhelp();
        if (mode.t >= (A.J?.flame?.durations?.altDropAnim ?? .5)) { mode.busy = null; equip('punch'); }
      } else if (mode.busy === 'recall') {
        mode.t += dt;
        if (!whelp || mode.t > 1.2 || whelp.g.position.distanceTo(camera.position) < 45) { killWhelp(whelp, false); whelp = null; mode.busy = null; A.sound('attach', .6); equip('flame', 'altRaiseAnim'); }
      }
      // drain: flame while it burns (and a little while held), the whelp while it's out
      ctx.drain(dt * (mode.cur === 'punch' || whelp ? 1 / WHELP_TIME : firing ? 1 / FLAME_TIME : 1 / HELD_TIME));
      if (mode.cur === 'punch' && !mode.busy && ctx.power <= .002) recall();
      if (firing) {
        if (ctx.power <= 0 || mode.busy) flameOn(false);
        else { fireT += dt; if (fireT > .45 && vw?.rig?.current === 'fireInAnim') play('fireLoopAnim', 'fire');
          if (vw?.rig?.current === 'fireLoopAnim' && !vw.rig.actions.fireLoopAnim.isRunning()) vw.rig.play('fireLoopAnim', false, 1, 0);
          let reach = RANGE; if ((tick -= dt) <= 0) { tick = TICK; reach = burnTick(); live.reach = reach; } flameFx(dt, live.reach ?? RANGE); }
      }
      if (swing) {
        swing.t += dt;
        if (swing.hit != null && swing.t >= swing.hit) {
          swing.hit = null; camera.getWorldDirection(fwd);
          if (swing.punch) { const n = punchAt(camera.position.clone().addScaledVector(fwd, PUNCH_AHEAD).add(new THREE.Vector3(0, -20, 0)), PUNCH_R); if (n) audio.play('hit', .6); }
          else { let best = null, bd = 110;
            for (const z of enemies.list) { const o = chest(z).sub(camera.position), d = o.length(); if (d < bd && (d < 40 || o.normalize().dot(fwd) > .3)) { best = z; bd = d; } }
            if (best && strike(best, 'flame', .02, false, true)) fling(best, camera.position); }
        }
        if (swing.t >= swing.len) swing = null;
      }
      if (juke) {
        juke.t += dt; camera.getWorldDirection(fwd); const f2 = fwd.clone().setY(0).normalize(), k = 1 - juke.t / JUKE_TIME;
        if (player.velocity && k > 0) { player.velocity.set(f2.x * JUKE_SPEED * (.4 + .6 * k), Math.max(player.velocity.y, 0), f2.z * JUKE_SPEED * (.4 + .6 * k)); player.onFloor = player.grounded = false; }
        if ((juke.next -= dt) <= 0) { juke.next = .1; punchAt(feet().add(new THREE.Vector3(0, 40, 0)).addScaledVector(f2, 50), JUKE_R); }
        if (juke.t > .23 && vw?.rig?.current === 'meleeInAnim') play('meleeAnim', 'fire');
        if (juke.t >= JUKE_TIME) juke = null;
      }
      for (let i = flung.length - 1; i >= 0; i--) { const o = flung[i]; o.t += dt; o.v.y -= 900 * dt; o.z.root.position.addScaledVector(o.v, dt); if (o.t > .6) flung.splice(i, 1); }
      if (whelp && !whelp.dead) tickWhelp(whelp, dt);
      if (vw?.ready) {
        const moved = camera.position.distanceTo(lastCam) / Math.max(dt, 1e-3); lastCam.copy(camera.position);
        const sprint = !!api.view?.input?.sprint && !firing && !swing && !juke && !mode.busy;
        vw.update(dt, { moving: moved > 20, sprint, ads: false, time: session.time });
        camera.fov = baseFov; camera.updateProjectionMatrix();
      }
    }
    function end() {
      ended = true; flameOn(false); flameLoop?.stop(); flameLoop = null;
      killWhelp(whelp, true); whelp = null; dropView();
      if (stand) { stand.removeFromParent(); stand.geometry.dispose(); stand.material.dispose(); stand = null; }
      live = null;
    }
    live = { mode, get whelp() { return whelp; }, get vw() { return vw; }, release, recall, fire, melee, reach: RANGE };
    return { update, fire, aim, melee, end };
  }
  // the particles run on their own (they finish after the gauntlet is put away)
  api.host.on('update', dt => { if (dt) tickSprites(dt); });
  api.host.on('reset', () => { for (const p of P.list) { p.alive = false; p.sprite.visible = false; } });
  return { get live() { return live; }, strike, tough };
}
