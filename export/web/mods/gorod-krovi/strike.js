// The Dragon Strike (zm_stalingrad_dragon_strike.gsc + _zm_weap_dragon_strike.gsc, 2026-11-15): the lockbox console on
// Pavlov's second floor, the quest that unlocks it, the strike itself, and its upgrade.
//   Console (dragon_strike_controller, yaw 332): four nixie tubes, one per player slot (empty slots count as pressed), red
//     until that player has pressed it; a press holds only while the player stays on Pavlov's second floor. All pressed:
//     flag dragonstrikeunlocked, and with dragonpavlovfirsttime (a landing at Pavlov's) pap.js runs the first lockdown,
//     whose end sets dragonstrikequestcomplete; then the console hands out the strike (1 charge; prompt priority as BO3's
//     function_10d61b3). Its scene bundle plays once the quest is done and a player is on the second floor.
//   Using it (the placeable-mine slot, here the Claymore key: 4, or the controller's claymore button): one press shows the
//     marker where the player looks (2500 out), green when a dragon can reach it (a clear line from 1000 out and 2000
//     up, four headings tried), red when not; fire or a second press calls it, right click or a weapon key cancels. A
//     flare lures zombies within 600 (800 upgraded); BO3's airstrike dragon (dragon.js strike: ai_zm_dlc3_dragon_strike_1
//     from that sky point, pitch 25) spits four fireballs at the spot ± 50 on its 'fireball' notes; each impact burns
//     every plain zombie within 300 (400) and takes a share off specials; the player is never hurt. One charge a round
//     and on a Max Ammo (2 upgraded); during the upgrade lockdown it refills after each use.
//   Upgrade (function_93510b8b): 20+10n Dragon Strike kills (stage 1), 10 s, then n of the four library banners stay
//     (dragonstrike_ee_banner) and each must be hit by a fireball (stage 3), every player presses the console again
//     (stage 4: the strike refilled, the upgrade lockdown starts at once), 15+5n strike kills during it; short = again.
//     Then draconiteavailable: the console gives the upgraded strike (2 charges).
// gk events: 'strike:kill' (challenge 3_3), 'strike:called' {at, upgraded}, 'strike:stage' n. Host/solo only (co-op v1:
// the local player). Debug: kino.gorod.strike.{state, give, call, unlock, stage}; ?noStrike leaves it out.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { sceneData, makeProp, place, play, step, hold, hidePart, moved, solidOf, W } from './scene-props.js';

const CONSOLE = [-3218.23, 21374.2, 160], CONSOLE_YAW = 332;
const FLOOR2 = { x: [-3800, -2200], y: [20700, 21950], z: [130, 420] };   // pavlovs_second_floor (a volume; bounds from the house's floor)
const BANNERS = [[-98.4, 7958.75, 231.76, 180], [-5155.3, 3383.25, 359.1, 270], [4719, 4422.75, -322, 135], [-1624.82, 106.51, 194.85, 300]];
const KIND = { normal: { fire: 300, lure: 600, ammo: 1, special: .25 }, upgraded: { fire: 400, lure: 800, ammo: 2, special: .4 } };
const AIM = 2500, SPEED = 2600, BANNER_HIT = 300, USE_R = 100, USE_H = 100;

export default async function setupStrike(api, gk) {
  const { world, session, enemies, player, camera, scene } = api, host = api.host, features = api.features;
  const q = new URLSearchParams(location.search);
  if (q.has('noStrike') || (api.sync && api.sync.isHost === false)) return;
  const J = await sceneData();
  const [con, cfx, ctl, ban0] = await Promise.all(['strike_console', 'strike_console_fx', 'strike_controller', 'strike_banner'].map(k => makeProp(J, k)));

  const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol = 1, at = null, range = 3000) => {
    const d = at ? camera.position.distanceTo(at) : 0; if (d > range) return null;
    const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol * (1 - d / range) ** 1.2); a.play().catch(() => {}); return a;
  };
  const n = () => Math.max(1, Math.min(4, api.sync?.players?.().length || 1));
  const cod = p => [p.x, -p.z, p.y];
  const onFloor2 = p => { const [x, y, z] = cod(p); return x > FLOOR2.x[0] && x < FLOOR2.x[1] && y > FLOOR2.y[0] && y < FLOOR2.y[1] && z > FLOOR2.z[0] && z < FLOOR2.z[1]; };
  const special = () => !!gk.bosses?.sentinelRound?.()?.active;

  // ---- state ------------------------------------------------------------------------------------------------------------
  const S = { owned: null, ammo: 0, aim: null, busy: false, pressed: false, upPressed: false, kills: 0, total: 0, upKills: 0, stage: 0, stageAt: 0, banners: [], log: [], played: false };
  const log = m => { S.log.push(`${session.time?.toFixed?.(1) ?? 0} ${m}`); if (S.log.length > 40) S.log.shift(); };

  // ---- the console ------------------------------------------------------------------------------------------------------
  const conAt = W(...CONSOLE);
  const nixies = [];
  if (con) {
    place(con, CONSOLE, [0, CONSOLE_YAW, 0]); con.root.userData.noMerge = true; scene.add(con.root);
    try { const c = solidOf([con.root], { name: 'gk_strike_console' }); if (c) { world.dynamic.push(c); world.collision?.invalidateCache?.(); } } catch (e) { console.warn('[gorod-krovi] strike console collision', e); }
    // the tubes' glow (BO3 lockbox_light_N clientfields: an fx at the tag): small unlit bulbs, red or green
    const g = new THREE.SphereGeometry(1.4, 10, 8);
    const mats = { red: new THREE.MeshBasicMaterial({ color: 0xff3a1a, toneMapped: false }), green: new THREE.MeshBasicMaterial({ color: 0x5cff6a, toneMapped: false }) };
    for (let i = 0; i < 4; i++) {
      const t = { red: con.bones['tag_nixie_red_' + i], green: con.bones['tag_nixie_green_' + i] }, o = {};
      for (const c of ['red', 'green']) { const m = new THREE.Mesh(g, mats[c]); m.visible = c === 'red'; m.frustumCulled = false; (t[c] ?? con.root).add(m); o[c] = m; }
      nixies.push(o);
    }
    moved(con.root);
    const anim = con.bones.tag_animate ?? con.root;
    for (const P of [cfx, ctl]) if (P) {
      P.root.userData.noMerge = true; scene.add(P.root);
      anim.updateMatrixWorld(true); anim.matrixWorld.decompose(P.root.position, P.root.quaternion, P.root.scale); P.root.scale.set(1, 1, 1);
      hold(P, 'idle', 0);
    }
  }
  const lights = k => { for (let i = 0; i < 4; i++) { const on = i < k; nixies[i].green.visible = on; nixies[i].red.visible = !on; } };
  lights(0);

  // ---- banners (dragonstrike_ee_banner): all four in the map from the start; n stay after stage 1 -------------------------
  if (ban0) {
    BANNERS.forEach(([x, y, z, yaw], i) => {
      const P = i ? { ...ban0, root: ban0.root.clone(true) } : ban0;
      P.root.position.copy(W(x, y, z)); P.root.rotation.set(0, yaw * Math.PI / 180, 0); P.root.userData.noMerge = true; scene.add(P.root); moved(P.root);
      S.banners.push({ i, P, at: W(x, y, z - 80), live: false, hit: false });
    });
  }
  function bannersOn() {
    const keep = [...S.banners].sort(() => Math.random() - .5).slice(0, n());
    for (const b of S.banners) { b.live = keep.includes(b); b.hit = false; if (!b.live) b.P.root.visible = false; }
    log(`banners ${keep.map(b => b.i).join(',')}`);
  }

  // ---- the strike in the hand -------------------------------------------------------------------------------------------
  const kind = () => KIND[S.owned ?? 'normal'];
  function give(upgraded) {
    S.owned = upgraded ? 'upgraded' : 'normal'; S.ammo = kind().ammo; hud();
    api.toast?.(upgraded ? 'Dragon Strike (upgraded) · press 4 to aim' : 'Dragon Strike · press 4 to aim', 3);
  }
  function refill() { if (S.owned && S.ammo < kind().ammo) { S.ammo = kind().ammo; hud(); } }
  host.on('roundEnd', () => refill());   // func_custom_placeable_mine_round_replenish
  if (session.powerup) { const o = session.powerup.bind(session); session.powerup = (type, ...r) => { const res = o(type, ...r); if (type === 'full_ammo') setTimeout(refill, 50); return res; }; }

  // ---- the console's prompt and use (function_10d61b3 / function_68299355) -------------------------------------------------
  const quest = () => gk.hasFlag('dragonstrikequestcomplete'), drac = () => gk.hasFlag('draconiteavailable');
  function prompt() {
    const has = S.owned === 'normal', hasUp = S.owned === 'upgraded';
    if (drac() && !hasUp) return 'Take the upgraded Dragon Strike';
    if (quest() && !drac() && !has && !hasUp) return 'Take the Dragon Strike';
    const unl = gk.hasFlag('dragonstrikeunlocked'), s3 = gk.hasFlag('dragonstage3started'), s4 = gk.hasFlag('dragonstage4started');
    if ((unl && has && !s3) || (unl && !quest()) || (drac() && hasUp) || (!drac() && s4) || special() || gk.pap?.state?.().state === 'active') return null;
    if (s3 && !S.upPressed) return 'Activate the Dragon Strike upgrade';
    if (S.pressed && !unl) return 'Waiting for every player';
    if (!unl && !S.pressed) return 'Activate the Dragon Strike console';
    return null;
  }
  function use() {
    if (!onFloor2(player.getFeetPosition())) return false;
    const t = prompt(); if (!t) return false;
    sfx('trap_button_' + (Math.random() < .5 ? 0 : 1), .7, conAt);
    if (drac() && S.owned !== 'upgraded') { sfx('strike_button_2', .8, conAt); give(true); return true; }
    if (quest() && !drac() && !S.owned) { sfx('strike_button_2', .8, conAt); give(false); gk.setFlag('dragonstrikeacquired'); return true; }
    if (gk.hasFlag('dragonstage3started') && !gk.hasFlag('dragonstage4started') && !S.upPressed) { S.upPressed = true; sfx('strike_button_2', .8, conAt); log('pressed (upgrade)'); return true; }
    if (!gk.hasFlag('dragonstrikeunlocked') && !S.pressed) { S.pressed = true; log('pressed'); return true; }
    return false;
  }
  if (con) world.addInteraction({
    position: conAt.clone().add(new THREE.Vector3(0, 50, 0)), radius: USE_R + 20, height: USE_H,
    hidden: () => !prompt() || !onFloor2(player.getFeetPosition()), text: () => prompt() ?? '', use: () => use(),
  });

  // ---- the quest, every frame ---------------------------------------------------------------------------------------------
  function questTick() {
    const others = n() - 1, feet = player.getFeetPosition();
    // presses hold while on the second floor (function_ea7e3000)
    if (S.pressed && !gk.hasFlag('dragonstrikeunlocked') && !onFloor2(feet)) { S.pressed = false; log('left the floor (press undone)'); }
    if (S.upPressed && !gk.hasFlag('dragonstage4started') && !onFloor2(feet)) { S.upPressed = false; log('left the floor (upgrade press undone)'); }
    if (!gk.hasFlag('dragonstrikeunlocked')) {
      const k = Math.min(4, 4 - n() + (S.pressed ? 1 : 0) + others);   // co-op v1: the other players count as pressed
      lights(k);
      if (S.pressed && k >= 4) { gk.setFlag('dragonstrikeunlocked'); gk.setFlag('dragonstage1started'); lights(4); S.stage = 1; S.kills = 0; log('unlocked: stage 1'); gk.emit('strike:stage', 1); }
    } else if (gk.hasFlag('dragonstage3started') && !gk.hasFlag('dragonstage4started')) {
      const k = Math.min(4, 4 - n() + (S.upPressed ? 1 : 0) + others);
      lights(k);
      if (S.upPressed && k >= 4) {
        gk.setFlag('dragonstage4started'); lights(4); S.stage = 4; S.upKills = 0; log('stage 4: the upgrade lockdown');
        if (S.owned === 'normal') { S.ammo = 1; hud(); }   // function_af4562b1
        gk.emit('strike:stage', 4);
        if (!gk.pap?.start?.('upgrade')) log('the upgrade lockdown did not start');
      }
    }
    // stage 1 done -> 10 s -> the banners (function_e6794c49, function_5cb61169)
    if (S.stage === 2 && session.time >= S.stageAt) { S.stage = 3; bannersOn(); api.toast?.('Something stirs in the streets', 3); }
    // the bundle plays once the quest is done and a player is on the second floor
    if (!S.played && quest() && onFloor2(feet)) { S.played = true; for (const P of [cfx, ctl]) if (P) play(P, 'idle', { loop: true }); }
  }
  gk.on('pap:lockdown', (s, k) => {
    if (k !== 'upgrade' || (s !== 'end' && s !== 'fail')) return;
    if (s === 'end' && S.upKills >= 15 + 5 * n()) {
      gk.setFlag('draconiteavailable'); S.stage = 5; log('draconite available'); sfx('strike_exit_cry', .8); api.announce?.('Dragon Strike', 'THE UPGRADE IS READY', 4); gk.emit('strike:stage', 5);
    } else {
      gk.clearFlag('dragonstage4started'); S.upPressed = false; S.stage = 3; log(`upgrade lockdown short (${S.upKills} kills): again`); lights(4 - n());
      api.toast?.(`Not enough Dragon Strike kills (${S.upKills} / ${15 + 5 * n()}) · press the console again`, 4);
    }
  });

  // ---- aiming -------------------------------------------------------------------------------------------------------------
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x5cff6a, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
  // the marker: a centre ring, and the area each fireball burns (K.fire round its landing spot, 2026-11-17, user: "make the
  // dragon fire more accurately represent where the fire is landing"; the 46-unit ring alone hid a 300-unit kill zone)
  const fillMat = ringMat.clone(); fillMat.opacity = .12;
  const ring = new THREE.Group(), mk = (g, m) => { const o = new THREE.Mesh(g.rotateX(-Math.PI / 2), m); o.frustumCulled = false; o.renderOrder = 5; o.userData.noMerge = true; ring.add(o); return o; };
  mk(new THREE.RingGeometry(34, 46, 40), ringMat);
  const zone = new THREE.Group(); ring.add(zone);
  zone.add(mk(new THREE.RingGeometry(.95, 1, 64), ringMat), mk(new THREE.CircleGeometry(1, 64), fillMat));
  ring.name = 'gk_strike_marker'; ring.userData.noMerge = true;
  host.warmObjects?.push(ring);
  const tmpR = new THREE.Ray();
  // function_c7832a90: a sky point 1000 out (away from the player) and 2000 up whose line to the spot + 96 is clear; 4 headings
  function skyFor(loc) {
    const f = player.getFeetPosition(); let a = Math.atan2(loc.z - f.z, loc.x - f.x);
    for (let k = 0; k < 4; k++, a += Math.PI / 2) {
      const sky = new THREE.Vector3(loc.x + Math.cos(a) * 1000, loc.y + 2000, loc.z + Math.sin(a) * 1000);
      if (world.lineClear(sky, loc.clone().add(new THREE.Vector3(0, 96, 0)))) return sky;
    }
    return null;
  }
  function aimPoint() {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    tmpR.set(camera.position.clone(), dir);
    const h = world.raycast(tmpR, 1, AIM);
    const p = h ? (h.point?.clone?.() ?? camera.position.clone().addScaledVector(dir, h.distance)) : camera.position.clone().addScaledVector(dir, AIM);
    return groundBelow(p.addScaledVector(dir, -20)) ?? p;   // a wall or a crate's side: the floor in front of it
  }
  function groundBelow(p, up = 40, far = 800) {
    const g = world.raycast(new THREE.Ray(p.clone().add(new THREE.Vector3(0, up, 0)), new THREE.Vector3(0, -1, 0)), 0, far);
    return g?.point ? g.point.clone() : null;
  }
  function aimTick() {
    if (!S.aim) return;
    if (session.phase === 'reviving' || session.phase === 'gameover' || !S.ammo) return stopAim();
    const p = aimPoint(); S.aim.at = p; S.aim.sky = skyFor(p);
    ring.position.copy(p).add(new THREE.Vector3(0, 8, 0)); zone.scale.setScalar(kind().fire + 50); ring.updateMatrixWorld(true);   // + the fireballs' ±50 spread
    ringMat.color.setHex(S.aim.sky ? (S.owned === 'upgraded' ? 0xffb030 : 0x5cff6a) : 0xff3a1a); fillMat.color.copy(ringMat.color);
  }
  function startAim() {
    if (S.busy) { sfx('strike_error', .7); api.toast?.('The dragon is still out', 2); return; }
    if (!S.ammo) { sfx('strike_error', .7); api.toast?.('Dragon Strike unavailable', 2); return; }
    S.aim = { t0: performance.now(), at: null, sky: null }; scene.add(ring); ring.visible = true; aimTick();
    api.toast?.('Fire or 4 to call the dragon · right click to cancel', 2.5);
  }
  function stopAim() { S.aim = null; ring.visible = false; scene.remove(ring); }
  function callIt() {
    if (!S.aim || performance.now() - S.aim.t0 < 250) return;
    aimTick();
    if (!S.aim.sky) { sfx('strike_error', .7); return; }   // dragon_strike_invalid_use
    const at = S.aim.at.clone(), sky = S.aim.sky.clone(); stopAim(); call(at, sky);
  }
  if (features) {
    const orig = features.placeClaymore;
    features.placeClaymore = (...a) => {
      if (!S.owned || session.phase === 'reviving') return orig?.call(features, ...a);
      if (S.aim) return callIt();
      return startAim();
    };
  }
  addEventListener('mousedown', e => {
    if (!S.aim) return;
    if (e.button === 0) { e.stopImmediatePropagation(); e.preventDefault(); callIt(); }
    else if (e.button === 2) { e.stopImmediatePropagation(); e.preventDefault(); stopAim(); }
  }, true);
  addEventListener('keydown', e => { if (S.aim && /^Digit[1-3]$|^KeyQ$|^Escape$/.test(e.code)) stopAim(); }, true);

  // ---- the strike ---------------------------------------------------------------------------------------------------------
  const balls = [];
  let lure = null;
  const lure0 = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    if (lure && !z.special && !z.boss && !z.thrall && z.kind === 'zombie' && z.root.position.distanceTo(lure.at) < lure.r) return lure.at;
    return lure0 ? lure0(z) : null;
  };
  function call(at, sky) {
    const K = kind(), up = S.owned === 'upgraded';
    S.ammo--; S.busy = true; S.total++; hud();
    sfx('strike_activate', .8);
    const flare = { at: at.clone(), r: K.lure, t: 0, done: false };
    lure = flare;
    sfx('strike_flare', .7, at);
    const strike = { at, sky, up, fired: 0, landed: 0, kills: 0 };
    gk.emit('strike:called', { at: at.clone(), upgraded: up });
    log(`called at ${cod(at).map(Math.round)}${up ? ' (upgraded)' : ''}`);
    const fireball = from => {
      if (strike.fired >= 4) return;
      strike.fired++; S.from = cod(from).map(Math.round);
      let to = null;
      for (let k = 0; k < 6; k++) {   // until the line from the throat is clear (was inverted before 2026-11-17: fireballs went through roofs)
        to = at.clone().add(new THREE.Vector3(Math.random() * 100 - 50, 0, Math.random() * 100 - 50)); to = groundBelow(to, 60, 200) ?? to;
        if (world.lineClear(from, to.clone().add(new THREE.Vector3(0, 8, 0)))) break;
      }
      const dir = to.clone().sub(from), len = dir.length(), hit = world.raycast(new THREE.Ray(from.clone(), dir.normalize()), 1, len);
      if (hit?.point && hit.distance < len - 8) to = hit.point.clone();   // still blocked: it bursts where it hits, and burns there
      balls.push({ strike, from: from.clone(), to, p: from.clone(), t: 0, dur: Math.max(.25, from.distanceTo(to) / SPEED), K });
    };
    const finish = () => {
      // the flare fades after the last fireball lands; the marker 3.5 s later (function_6efadb82)
      const t0 = performance.now();
      const wait = () => { if ((strike.fired < 4 && performance.now() - t0 < 15000) || strike.landed < strike.fired) return setTimeout(wait, 100); flare.done = true; if (lure === flare) lure = null; setTimeout(() => { S.busy = false; if (gk.hasFlag('dragonstage4started') && !drac() && gk.pap?.state?.().state === 'active') refill(); hud(); }, 3500); };
      wait();
    };
    const D = gk.dragon;
    if (D?.strike) {
      D.strike({ origin: sky, yaw: 0, pitch: 25,
        onNote: (name, throat) => {
          if (name === 'fireball') fireball(throat);
          else if (name === 'sndnt#zmb_dragon_strike_start_cry') sfx('strike_start_cry', .9, at, 9000);
          else if (name === 'sndnt#zmb_dragon_strike_exit_cry') sfx('strike_exit_cry', .9, at, 9000);
          else if (/^sndnt#zmb_dragon_strike_fire_\d$/.test(name)) sfx('strike_launch_' + (Math.min(4, +name.slice(-1)) - 1), .9, at, 9000);
        },
        onEnd: () => { while (strike.fired < 4) fireball(sky); },
      }).catch(e => { console.warn('[gorod-krovi] strike dragon', e); while (strike.fired < 4) fireball(sky); });
      finish();   // waits for the four fireballs (1.73-4.63 s into the clip) to land; the dragon flies on
    } else {   // no dragon: the four fireballs from the sky point with the clip's timing
      [1.733, 2.7, 3.667, 4.633].forEach((t, i) => setTimeout(() => { fireball(sky); sfx('strike_launch_' + i, .9, at, 9000); }, t * 1000));
      finish();
    }
  }
  function impact(b) {
    const fx = window.kino?.fx, at = b.to, K = b.K, st = b.strike;
    st.landed++; log(`impact ${cod(at).map(Math.round)} (aimed ${cod(st.at).map(Math.round)})`);
    fx?.explosion?.(at.clone().add(new THREE.Vector3(0, 20, 0)), 1.3);
    firePatch(at, K.fire);
    fx?.flash?.(at.clone().add(new THREE.Vector3(0, 80, 0)), { color: 0xff7a26, intensity: 8, radius: 1100, life: .6 });
    sfx(camera.position.distanceTo(at) < 900 ? 'strike_fireball_close' : 'strike_fireball', 1, at, 6000);
    for (const z of [...enemies.list]) {
      if (z.thrall || z.root.position.distanceTo(at) > K.fire) continue;
      const plain = z.kind === 'zombie' && !z.special && !z.boss;
      const dmg = plain ? Math.max(z.health ?? 0, 1e5) : Math.max(500, (z.maxHealth ?? z.health ?? 2000) * K.special);
      setTimeout(() => {   // dragon_strike_zombie_fire: a random 0-0.1 s stagger
        if (!enemies.list.includes(z)) return;
        fx?.burn?.(z.root.position.clone().add(new THREE.Vector3(0, 40, 0)));
        enemies.hurt(z, dmg, false, false, 'fire', true);
        if (!enemies.list.includes(z)) killed(st);
      }, Math.random() * 100);
    }
    // the banners take launcher_dragon_fire's blast (function_75a7ba2d)
    if (S.stage === 3) for (const bn of S.banners) if (bn.live && !bn.hit && bn.at.distanceTo(at) < BANNER_HIT) {
      bn.hit = true; bn.P.root.visible = false;
      const left = S.banners.filter(x => x.live && !x.hit).length;
      log(`banner ${bn.i} hit (${left} left)`);
      if (!left) { gk.setFlag('dragonstage3started'); sfx('strike_exit_cry', .8); lights(4 - n()); gk.emit('strike:stage', 3); api.toast?.('The console stirs', 3); }
      else sfx('strike_button_2', 1);
    }
  }
  // flames over the burn radius, on the floor, for about a second (every zombie inside dies at the impact)
  function firePatch(at, r) {
    const fx = window.kino?.fx; if (!fx?.emit) return;
    for (const [delay, count] of [[0, 18], [180, 12], [400, 8]]) setTimeout(() => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, d = r * Math.sqrt(Math.random()) * .95;
        const p = at.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d)), g = groundBelow(p, 80, 220);
        if (!g) continue;
        fx.emit({ key: 'fire', at: g.add(new THREE.Vector3(0, 22, 0)), vel: new THREE.Vector3(0, 40, 0), size: [60, 150], life: .7 + Math.random() * .6, fade: [.05, .55], additive: true, opacity: .85, spin: Math.random() * 2 - 1 });
      }
      if (!delay) for (let i = 0; i < 24; i++) {   // the rim: where the burn stops
        const a = i / 24 * Math.PI * 2, g = groundBelow(at.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)), 80, 220);
        if (g) fx.emit({ key: 'glow', at: g.add(new THREE.Vector3(0, 6, 0)), size: [60, 110], life: .9, fade: [.05, .7], additive: true, color: 0xff6a1a, opacity: .7 });
      }
    }, delay);
  }
  function killed(st) {
    st.kills++;
    gk.emit('strike:kill');
    if (S.stage === 1 && gk.hasFlag('dragonstage1started')) {
      S.kills++;
      if (S.kills >= 20 + 10 * n()) { S.stage = 2; S.stageAt = session.time + 10; log('stage 1 done'); gk.emit('strike:stage', 2); }
    }
    if (gk.hasFlag('dragonstage4started') && gk.pap?.state?.().state === 'active' && gk.pap.state().kind === 'upgrade') S.upKills++;
  }
  function ballsTick(dt) {
    const fx = window.kino?.fx;
    for (const b of [...balls]) {
      b.t += dt; const u = Math.min(1, b.t / b.dur);
      b.p.copy(b.from).lerp(b.to, u);
      if (fx?.emit) {
        fx.emit({ key: 'glow', at: b.p.clone(), size: [70, 200], life: .12, fade: [.05, .8], additive: true, color: 0xffa040 });
        for (let k = 0; k < 2; k++) fx.emit({ key: 'fire', at: b.p.clone().add(fx.jitter?.(14) ?? new THREE.Vector3()), vel: new THREE.Vector3(), size: [50, 110], life: .35, fade: [.04, .6], additive: true, opacity: .9, spin: Math.random() * 2 - 1 });
      }
      if (u >= 1) { balls.splice(balls.indexOf(b), 1); impact(b); }
    }
    if (lure && !lure.done && fx?.emit && (lure.t -= dt) <= 0) {   // the flare
      lure.t = .08;
      fx.emit({ key: 'glow', at: lure.at.clone().add(new THREE.Vector3(0, 10, 0)), size: [30, 90], life: .2, fade: [.05, .8], additive: true, color: 0xff2a10 });
      fx.emit({ key: 'smoke', at: lure.at.clone().add(new THREE.Vector3(0, 14, 0)), vel: new THREE.Vector3(0, 60, 0), size: [20, 90], life: 1.2, fade: [.1, .6], opacity: .35, color: 0xb04030, drag: .5 });
    }
  }

  host.on('update', dt => {
    if (!dt) return;
    try { questTick(); aimTick(); ballsTick(Math.min(dt, .1)); for (const P of [cfx, ctl]) if (P && S.played) step(P, dt); }
    catch (e) { console.error('[gorod-krovi] strike', e); }
  });
  host.on('reset', () => {
    stopAim(); balls.length = 0; lure = null;
    Object.assign(S, { owned: null, ammo: 0, busy: false, pressed: false, upPressed: false, kills: 0, total: 0, upKills: 0, stage: 0, stageAt: 0, played: false });
    for (const b of S.banners) { b.live = false; b.hit = false; b.P.root.visible = true; }
    lights(0); for (const P of [cfx, ctl]) if (P) hold(P, 'idle', 0); hud();
  });

  // ---- HUD: the strike's charges (BO3's dpad-right icon) ----------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `#gk-strike{position:fixed;right:24px;bottom:150px;pointer-events:none;z-index:6;display:none;font:600 13px/1.2 system-ui,sans-serif;color:#ffd9a8;text-shadow:0 1px 2px #000;text-align:right}
#gk-strike b{color:#ff9a3a}#gk-strike.up b{color:#ffcf4a}#gk-strike.empty{opacity:.5}`;
  document.head.append(style);
  const el = document.createElement('div'); el.id = 'gk-strike'; document.body.append(el);
  let warmHud = false;
  function hud() {
    const show = warmHud || !!S.owned; el.style.display = show ? 'block' : 'none'; if (!show) return;
    const up = S.owned === 'upgraded', a = warmHud ? 1 : S.ammo;
    el.className = (up ? 'up' : '') + (a ? '' : ' empty');
    el.innerHTML = `[4] Dragon Strike${up ? ' II' : ''} <b>${'●'.repeat(a)}${'○'.repeat(Math.max(0, (up ? 2 : 1) - a))}</b>`;
  }
  host.on('warmHud', on => { warmHud = !!on; hud(); });

  // ---- handle ---------------------------------------------------------------------------------------------------------------
  const handle = {
    state: () => ({ owned: S.owned, ammo: S.ammo, busy: S.busy, aiming: !!S.aim, stage: S.stage, kills: S.kills, need1: 20 + 10 * n(), upKills: S.upKills, need4: 15 + 5 * n(), pressed: S.pressed, upPressed: S.upPressed,
      prompt: prompt(), onFloor2: onFloor2(player.getFeetPosition()), banners: S.banners.map(b => ({ i: b.i, live: b.live, hit: b.hit, at: cod(b.at).map(Math.round) })), balls: balls.length,
      flags: ['dragonpavlovfirsttime', 'dragonstrikeunlocked', 'dragonstage1started', 'dragonstrikequestcomplete', 'dragonstrikeacquired', 'dragonstage3started', 'dragonstage4started', 'draconiteavailable'].filter(f => gk.hasFlag(f)),
      total: S.total, from: S.from, log: S.log.slice(-12) }),
    give: up => give(!!up),
    call: (p, sky) => { const at = p?.isVector3 ? p.clone() : Array.isArray(p) ? new THREE.Vector3(...p) : aimPoint(); const s = sky ?? skyFor(at); if (!s) return false; if (!S.owned) give(false); S.ammo = Math.max(1, S.ammo); call(at, s); return true; },
    setKills: (k1, k4) => { if (k1 != null) S.kills = k1; if (k4 != null) S.upKills = k4; },
    press: () => use(), unlock: () => { S.pressed = true; },
    stage: k => { S.stage = k; if (k === 2) S.stageAt = session.time; },
    console: conAt, onFloor2, banners: S.banners, skyFor,
  };
  gk.strike = handle; if (window.kino?.gorod) window.kino.gorod.strike = handle;
}
