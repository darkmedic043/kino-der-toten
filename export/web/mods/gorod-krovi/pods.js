// Gorod Krovi: the drop pods and the dragon ride's craftable (2026-11-15, user: "make sure all side easter eggs, buildables,
// main easter egg, all that are also completable"). BO3 zm_stalingrad (zm_stalingrad_drop_pod.gsc, scratch/gk/spec):
// - code cylinders: once the power is on, a fully risen zombie's death drops one (10%, +2% a miss, back to 10% after a
//   drop); one in the world at a time, none while one is held or a pod is down. Colours come blue, yellow, red, then
//   red or blue at random once the ride is crafted. A cylinder lasts and blinks like a power-up (stand-in model: the
//   BO3 cylinders aren't in the dump).
// - the radios (their consoles are in the map: prop_p7_zm_sta_drop_pod_console_*): red = factory, blue = judicial,
//   yellow = library. The matching cylinder calls a pod onto a random open site (12 landing scenes, each needs its area
//   open; fountain1 once the first part is out). Not in a special round, not while a pod is down.
// - the defence: up to 6 zombies leave the chase to beat on the pod (45 a hit; 65 hits solo, 50 in co-op), sprinters
//   come from the site's harasser points (3 + players alive, first after 5/8/10 s by the radio's distance), and 15
//   kills inside the site's volume open it. The lamp shows its health (green >= 66%, yellow >= 33%, red, flashing
//   under 15%); the meter its kills. It fails at 0 health or with every player in Pavlov's House: it blows up (115:
//   kills zombies, 15 to players) and the site rests 120 s.
// - a win: the pod opens (spin_end, hatch, arms_up), 500 to the player, the site retires (judicial1 + 2 together), and the
//   next part floats over it: transmitter, codes, map; after the three, a pod gives a random power-up instead.
// - the console (dragonride_fuse_box, by Pavlov's stairs): the held parts go in their sockets; with all three the screen
//   turns green and the ride is crafted (flag dragonridecrafted, dragon.js stops its v1 power-on craft while gk.pods is
//   set). 'pod:green' (challenge 1_4) when a pod is won while its lamp is still green; also pod:land / pod:won / pod:lost /
//   pod:part / pod:crafted. Host or solo only (co-op clients keep dragon.js's power-on craft).
// Debug: kino.gorod.pods.{state(), cylinder(colour), call(site), win(), lose(), parts(), craft()}; ?noPods.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { POWERUP_LIFETIME, powerupVisible } from '../../rules.js';
import { sceneData, makeProp, place, play, step, hidePart, moved, solidOf, W } from './scene-props.js';

const RADIOS = { red: [-2422, 2892, 517], yellow: [2432, 2370, -140], blue: [-58, 5673, 341] };
const RADIO_NAME = { red: 'factory', yellow: 'library', blue: 'judicial' };
const COLOUR = { red: 0xff2a1a, yellow: 0xffc21a, blue: 0x2a7bff };
// site: [origin, flag, score-volume centre, harasser points [x, y, z, yaw]]
const SITES = {
  department_store1: [[-50, 1716, 329], 'departmentstoreupperopen', [-173, 1641, 323], [[-897, 2221, 336, 225], [-936, 2259, 336, 225], [918, 1704, 336, 45], [715, 1684, 336, 135], [782, 1522, 336, 135]]],
  red1: [[-735, 3138, 332], 'activateredbrick', [-660, 2905, 393], [[-1064, 3462, 320, 180], [-374, 2904, 320, 249]]],
  yellow1: [[752, 2944, 160], 'activateyellow', [822, 2787, 236], [[473, 3402, 160, 270], [69, 3287, 0, 270]]],
  judicial1: [[244, 3997, 0], 'activatejudicial', [78, 3978, 34], [[-794, 4073, 22, 180], [1110, 3579, -96, 180]]],
  judicial2: [[-223, 3997, 0], 'activatejudicial', [29, 4105, 91], [[-947, 4540, 0, 180], [1579, 3680, -160, 180]]],
  judicial3: [[68, 4961, 144], 'activatejudicial', [7, 5032, 237], [[648, 5090, 304, 180], [-668, 5035, 304, 180], [653, 4873, 144, 90], [-442, 5391, 144, 90]]],
  factory1: [[-1345, 2546, -23.8], 'factoryopen', [-1247, 2533, 60], [[-620, 2462, -1, 180], [-1176, 3596, 15, 180]]],
  factory2: [[-2191, 2439, 160], 'factoryopen', [-2146, 2341, 307], [[-2449, 1958, 160, 270], [-2255, 1678, 160, 0], [-2409, 3190, -14, 270]]],
  library1: [[1436, 2716, -189], 'libraryopen', [1486, 2730, -90], [[1819, 1760, -160, 180], [1666, 3738, -141, 180]]],
  library2: [[2558, 2639, -151.3], 'libraryopen', [2312, 2685, -73], [[2593, 1851, -160, 0], [1918, 3422, -159, 0]]],
  alley1: [[-3, 2251, 0], 'activatebunker', [-44, 2349, 36], [[-606, 2544, -1, 0], [-689, 2020, 16, 0], [226, 2057, 0, 180], [-932, 2827, 160, 0], [965, 2603, -51, 225]]],
  fountain1: [[17, 785, 0], null, [-59, 811, 49], [[563, -540, 27, 105], [-730, 577, 0, 270], [-724, -285, 0, 24], [550, 1186, 16, 270], [-386, 1180, -125, 180]]],
};
const TWINS = { judicial1: ['judicial2'], judicial2: ['judicial1'] };
const PARTS = [['net_part1', 'tag_part01', 'the transmitter'], ['net_part2', 'tag_part02', 'the code book'], ['net_part3', 'tag_part03', 'the map']];
const CONSOLE = [-64, 3207, -192], CONSOLE_USE = [-91, 3237, -132];
const KILLS = 15, HIT = 45, SLOTS = 6, SLOT_R = 45, VOLUME_R = 350, LURE_R = 700, BLAST = 115, REST = 120, LAND = 3.97;
const POWERUPS = ['nuke', 'insta_kill', 'double_points', 'full_ammo', 'carpenter', 'fire_sale'];
const inPavlov = p => p.x > -4700 && p.x < -1300 && p.z > -23300 && p.z < -19700 && p.y > -400 && p.y < 900;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export default async function setup(api, gk) {
  const { world, session, scene, player, enemies, host, camera } = api;
  const q = new URLSearchParams(location.search);
  if (q.has('noPods') || (api.sync && api.sync.isHost === false)) return;
  const J = await sceneData();
  if (!J?.props?.pod) { console.warn('[gorod-krovi] pods: scene assets missing (run .tools/build_gk_scenes.py)'); return; }
  const [pod, con, ...partModels] = await Promise.all(['pod', 'net_console', ...PARTS.map(p => p[0])].map(k => makeProp(J, k)));
  if (!pod) return;

  const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol, at = null, range = 2500, loop = false) => {
    const d = at ? camera.position.distanceTo(at) : 0; if (d > range) return null;
    const a = new Audio(BASE + name + '.ogg'); a.loop = loop; a.volume = level(vol * (1 - d / range)); a.play().catch(() => {}); return a;
  };
  const players = () => api.sync?.players?.() ?? [{ pos: player.getFeetPosition(), down: session.phase === 'reviving' }];
  const nPlayers = () => Math.max(1, Math.min(4, players().length));

  // ---- state ------------------------------------------------------------------------------------------------------------
  const S = { chance: .1, order: ['blue', 'yellow', 'red'], made: 0, cyl: null, held: null, parts: 0, carried: [], placed: [], crafted: false,
    retired: new Set(), resting: new Map(), active: null, log: [] };
  const sites = Object.entries(SITES).map(([id, [o, flag, vol, harass]]) => ({ id, flag, origin: o, at: W(...o), vol: W(...vol),
    slots: Array.from({ length: SLOTS }, (_, i) => { const a = i / SLOTS * Math.PI * 2; return W(o[0] + Math.cos(a) * SLOT_R, o[1] + Math.sin(a) * SLOT_R, o[2]); }),
    harass: harass.map(h => ({ p: W(h[0], h[1], h[2]), yaw: THREE.MathUtils.degToRad(h[3]) })) }));
  const open = s => !S.retired.has(s.id) && !(session.time < (S.resting.get(s.id) ?? 0)) && (s.flag ? gk.hasFlag(s.flag) : S.parts > 0);
  const special = () => !!gk.bosses?.sentinelRound?.()?.active;

  // ---- the cylinder (a stand-in: steel can, coloured band, a glow) --------------------------------------------------------
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: .35, metalness: .85 });
  const bands = Object.fromEntries(Object.entries(COLOUR).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: .4 })]));
  const can = new THREE.CylinderGeometry(3.2, 3.2, 12, 14), band = new THREE.CylinderGeometry(3.4, 3.4, 3.5, 14), cap = new THREE.CylinderGeometry(1.6, 1.6, 2, 10).translate(0, 7, 0);
  const cylRoot = new THREE.Group(); cylRoot.name = 'gk_pod_cylinder'; cylRoot.userData.noMerge = true; cylRoot.visible = false;
  const cylBody = new THREE.Group(); cylRoot.add(cylBody);
  cylBody.add(new THREE.Mesh(can, steel), new THREE.Mesh(cap, steel));
  const cylBand = new THREE.Mesh(band, bands.blue); cylBody.add(cylBand);
  for (const m of [cylBody.children[0], cylBody.children[1], cylBand]) m.castShadow = false;
  scene.add(cylRoot);
  for (const m of Object.values(bands)) { const w = new THREE.Mesh(band, m); w.scale.setScalar(.01); host.warmObjects?.push(w); }
  host.warmObjects?.push(new THREE.Mesh(can, steel));

  function dropCylinder(at, colour = null) {
    colour ??= S.crafted || S.made >= 3 ? (Math.random() < .5 ? 'red' : 'blue') : S.order[S.made];
    S.made++; S.cyl = { colour, at: at.clone(), age: 0 }; cylBand.material = bands[colour];
    cylRoot.position.copy(at).add(new THREE.Vector3(0, 22, 0)); cylRoot.visible = true;
    globalThis.kino?.staticFreeze?.thaw?.(cylRoot);
    api.audio?.event?.('powerup/spawn/spawn_00', .55);
    gk.emit('pod:cylinder', colour); return true;
  }
  host.on('kill', e => {
    const z = e?.enemy; if (!z || e.remote || z.kind !== 'zombie' || z.state === 'rising' || z.tempo && z.gkHarasser) return;
    if (!session.power || S.cyl || S.held || S.active) return;
    if (Math.random() < S.chance) { S.chance = .1; dropCylinder(z.root.position); } else S.chance += .02;
  });
  function tickCylinder(dt) {
    const c = S.cyl; if (!c) return;
    c.age += dt;
    if (c.age >= POWERUP_LIFETIME) { S.cyl = null; cylRoot.visible = false; return; }
    cylBody.visible = powerupVisible(c.age); cylBody.rotation.y += dt * 1.8; cylBody.position.y = Math.sin(c.age * 2.4) * 3; moved(cylRoot);
    const feet = player.getFeetPosition();
    if (session.phase !== 'reviving' && flat(feet, c.at) < 64 && Math.abs(feet.y - c.at.y) < 90 && !S.held) {
      S.held = c.colour; S.cyl = null; cylRoot.visible = false;
      api.audio?.event?.('powerup/grab/grab_00', .75);
      api.toast?.(`Picked up a ${c.colour} code cylinder · the ${RADIO_NAME[c.colour]} radio takes it`, 3);
      gk.emit('pod:held', S.held);
    }
  }

  // ---- the pod ---------------------------------------------------------------------------------------------------------
  pod.root.visible = false; pod.root.userData.noMerge = true; scene.add(pod.root);   // hidden world objects are warmed at load (engine warmShaders)
  const lamps = { green: 'tag_health_green', yellow: 'tag_health_yellow', red: 'tag_health_red' };
  const meter = pod.bones.tag_meter_capacity, meterBind = meter?.userData.bindPosition?.clone();
  let lampShown = null;
  function lamp(colour) { if (colour === lampShown) return; lampShown = colour; for (const [k, b] of Object.entries(lamps)) hidePart(pod, b, k !== colour); }
  function setMeter(k) { if (!meter || !meterBind) return; meter.position.copy(meterBind); meter.position.z -= 9.582 * (1 - k); }
  for (const P of partModels) if (P) { P.root.visible = false; P.root.userData.noMerge = true; scene.add(P.root); }

  function call(site, radio) {
    const A = S.active = { site, radio, state: 'land', t: 0, health: (nPlayers() > 1 ? 50 : 65) * HIT, max: (nPlayers() > 1 ? 50 : 65) * HIT,
      kills: 0, attackers: new Map(), wave: null, waveIn: 0, alarm: false, hum: null, out: null, reward: null, ends: 0 };
    A.waveIn = (() => { const d = flat(W(...RADIOS[radio]), site.at); return d < 1500 ? 5 : d < 3000 ? 8 : 10; })();
    place(pod, site.origin, [0, 225, 0]); pod.root.visible = true; globalThis.kino?.staticFreeze?.thaw?.(pod.root);
    pod.rig.stopSide?.(0); hidePart(pod, 'tag_hatch', false); lamp('green'); setMeter(0);
    play(pod, 'land', { then: 'spin' });
    sfx('pod_incoming', .8, site.at, 6000);
    S.log.push({ site: site.id, radio, at: +session.time.toFixed(1) });
    api.toast?.('A drop pod is coming down · defend it', 3);
    gk.emit('pod:land', site.id);
  }
  // the landed pod is solid to players and bullets (solidOf: built in its landed pose at each site, dropped when it goes)
  let podCol = null;
  function solid(on) {
    const D = world.dynamic;
    if (podCol) { const i = D.indexOf(podCol); if (i >= 0) D.splice(i, 1); podCol.collider.geometry.dispose(); podCol = null; }
    if (on) { try { podCol = solidOf([pod.root], { name: 'gk_pod' }); if (podCol) D.push(podCol); } catch (e) { console.warn('[gorod-krovi] pod collision', e); } }
    world.collision?.invalidateCache?.();
  }
  function release() {
    const A = S.active; if (!A) return;
    for (const z of A.attackers.values()) if (z) { z.gkPod = null; if (z.state === 'attack' && z.gkPodSwing) { z.state = 'chase'; z.rig?.play('walk'); } z.gkPodSwing = false; }
    A.attackers.clear(); A.wave?.stop?.(); A.wave = null;
    if (A.hum) { A.hum.pause(); A.hum.src = ''; A.hum = null; }
  }
  function win() {
    const A = S.active; if (!A || A.state !== 'defend') return;
    const green = A.health / A.max >= .66;
    release(); A.state = 'open'; A.t = 0;
    play(pod, 'spin_end', { then: null }); A.hatchAt = pod.dur.spin_end ?? 1.67;
    sfx('pod_shutdown', .7, A.site.at, 3000);
    session.addPoints ? session.addPoints(500) : (session.points += 500);
    S.retired.add(A.site.id); for (const t of TWINS[A.site.id] ?? []) S.retired.add(t);
    if (green) gk.emit('pod:green', A.site.id);
    gk.emit('pod:won', { site: A.site.id, green });
    api.toast?.('Drop pod defended · +500', 3);
  }
  function lose(why) {
    const A = S.active; if (!A || (A.state !== 'land' && A.state !== 'defend')) return false;
    release();
    const at = A.site.at.clone().add(new THREE.Vector3(0, 40, 0));
    globalThis.kino?.fx?.explosion?.(at, 1, 0xff7a2a); sfx('pod_explode', .9, at, 4000);
    for (const z of [...enemies.list]) if (z.root.position.distanceTo(A.site.at) < BLAST && z.kind === 'zombie') enemies.hurt(z, 1e6, false, false, 'explosion', false);
    const feet = player.getFeetPosition();
    if (feet.distanceTo(A.site.at) < BLAST && session.phase !== 'reviving') api.damage?.(15);
    S.resting.set(A.site.id, session.time + REST);
    gone(); gk.emit('pod:lost', { site: A.site.id, why });
    api.toast?.(why === 'pavlov' ? 'The drop pod was abandoned' : 'The drop pod was destroyed', 3);
    return true;
  }
  function gone() {
    const A = S.active; if (!A) return;
    A.state = 'gone'; pod.root.visible = false; pod.rig.stopSide?.(0); solid(false);
    if (A.out) A.out.root.visible = false;
    S.active = null;
  }

  // the lure: up to six zombies near the pod go for its slots and swing at it (enemies.js: a lured zombie never hurts a player)
  const lure0 = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    const A = S.active, L = z.gkPod;
    if (L && A?.state === 'defend' && A.attackers.get(L.slot) === z) {
      const s = A.site.slots[L.slot], p = z.root.position;
      if (z.state === 'chase' && flat(p, s) < 30 && Math.abs(p.y - s.y) < 70) {
        z.state = 'attack'; z.vel = 0; z.attackLeft = 1.15; z.attackDealt = false; z.gkPodSwing = true; z.gkPodHit = false; z.rig.play('attack', false);
      }
      return s;
    }
    if (L) z.gkPod = null;
    return lure0 ? lure0(z) : null;
  };
  function tickLure(A, dt) {
    for (const [slot, z] of A.attackers) {
      if (!enemies.list.includes(z) || z.state === 'rising') { A.attackers.delete(slot); if (z) z.gkPod = null; continue; }
      z.gkPod.t += dt;
      if (z.state === 'attack' && z.gkPodSwing) {
        z.root.rotation.y = Math.atan2(A.site.at.x - z.root.position.x, A.site.at.z - z.root.position.z);
        if (z.attackDealt && !z.gkPodHit) { z.gkPodHit = true; hit(A); }
        if (z.attackLeft <= 0) z.gkPodSwing = false;
      } else if (z.gkPod.t > 15 && flat(z.root.position, A.site.slots[slot]) > 60) { A.attackers.delete(slot); z.gkPod = null; }   // couldn't get there
    }
    if (A.attackers.size >= SLOTS) return;
    for (const z of enemies.list) {
      if (A.attackers.size >= SLOTS) break;
      if (z.kind !== 'zombie' || z.gkPod || z.gkHarasser || z.special || z.state !== 'chase' || z.boss) continue;
      if (z.root.position.distanceTo(A.site.at) > LURE_R) continue;
      let slot = -1, best = Infinity;
      for (let i = 0; i < SLOTS; i++) if (!A.attackers.has(i)) { const d = flat(z.root.position, A.site.slots[i]); if (d < best) { best = d; slot = i; } }
      if (slot < 0) break;
      A.attackers.set(slot, z); z.gkPod = { slot, t: 0 };
    }
  }
  function hit(A) {
    A.health = Math.max(0, A.health - HIT);
    sfx('pod_pulse_' + Math.floor(Math.random() * 3), .5, A.site.at, 1500);
    if (!A.alarm && A.health / A.max < .33) { A.alarm = true; sfx('pod_alarm', .7, A.site.at, 3000); }
    if (A.health <= 0) lose('health');
  }
  host.on('kill', e => {
    const A = S.active, z = e?.enemy; if (A?.state !== 'defend' || !z || e.remote) return;
    const p = z.root.position;
    if (flat(p, A.site.vol) < VOLUME_R && Math.abs(p.y - A.site.vol.y) < 260) { A.kills++; setMeter(A.kills / KILLS); if (A.kills >= KILLS) win(); }
  });

  function tickPod(dt) {
    const A = S.active; if (!A) return;
    A.t += dt; step(pod, dt);
    if (A.state === 'land' && A.t >= LAND) {
      A.state = 'defend'; A.t = 0; solid(true);
      sfx('pod_spin_' + (1 + Math.floor(Math.random() * 3)), .6, A.site.at, 2500);
      A.hum = sfx('pod_green', .35, A.site.at, 2500, true);
    }
    if (A.state === 'defend') {
      if (A.hum) A.hum.volume = level(.35 * Math.max(0, 1 - camera.position.distanceTo(A.site.at) / 2500));
      tickLure(A, dt);
      if (!A.wave && A.t >= A.waveIn && gk.bosses?.zombieWave) {
        A.wave = gk.bosses.zombieWave({ points: A.site.harass, total: Infinity, maxAlive: () => 3 + players().filter(p => !p.down).length, interval: 2.5,
          until: () => S.active !== A || A.state !== 'defend',
          onSpawn: z => { z.gkHarasser = true; gk.hazard?.runner?.(z) ?? (z.speed = Math.max(z.speed ?? 0, 205)); if (!z.rise) enemies.riseAt?.(z, z.root.position.clone()); } });
      }
      const k = A.health / A.max;
      lamp(k >= .66 ? 'green' : k >= .33 ? 'yellow' : k >= .15 || Math.floor(session.time * 4) % 2 ? 'red' : 'none');
      const ps = players();
      if (ps.length && ps.every(p => p.down || inPavlov(p.pos ?? p.position ?? player.getFeetPosition()))) lose('pavlov');
      else if (session.phase === 'gameover') { release(); gone(); }
    } else if (A.state === 'open') {
      if (A.hatchAt != null && A.t >= A.hatchAt) {
        A.hatchAt = null; play(pod, 'hatch'); pod.rig.playSide('arms_up', false, 1, 0); sfx('pod_hatch', .7, A.site.at, 2500);
        reward(A);
      }
      if (A.out?.root.visible) { const r = A.out.root; r.rotation.y += dt * 1.2; r.position.y = A.outY + Math.sin(A.t * 2) * 2; moved(r); }
      if (A.ends && session.time >= A.ends) gone();
    }
  }
  function reward(A) {
    const at = A.site.at.clone().add(new THREE.Vector3(0, 53 + 32, 0));
    if (S.parts >= PARTS.length) {
      const type = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      globalThis.kino?.debug?.dropPowerup?.(type, A.site.at.clone().add(new THREE.Vector3(0, 10, 0)).toArray());
      A.ends = session.time + 6; return;
    }
    const i = S.parts, P = partModels[i]; S.parts++;
    A.reward = i; A.outY = at.y;
    if (P) { P.root.position.copy(at); P.root.visible = true; globalThis.kino?.staticFreeze?.thaw?.(P.root); moved(P.root); A.out = P; }
    else take(A);
  }
  function take(A) {
    if (A?.reward == null) return false;
    const i = A.reward; A.reward = null; if (A.out) A.out.root.visible = false;
    S.carried.push(i); sfx('part_pickup', .7);
    api.toast?.(`Picked up ${PARTS[i][2]} · bring it to the console under Pavlov's House stairs`, 3.5);
    gk.emit('pod:part', i); A.ends = session.time + 4; return true;
  }
  const partAt = () => (S.active?.reward != null ? S.active.site.at.clone().add(new THREE.Vector3(0, 70, 0)) : null);
  const partUse = { position: new THREE.Vector3(), sight: false, hidden: () => S.active?.reward == null || !S.active?.out?.root.visible,
    text: () => 'Take ' + PARTS[S.active?.reward ?? 0][2], use: () => take(S.active) };
  world.addInteraction(partUse);

  // ---- the radios ------------------------------------------------------------------------------------------------------
  function radio(colour) {
    if (!session.power) { api.toast?.('The power must be activated'); return false; }
    if (S.held !== colour) return false;
    if (S.active) { api.toast?.('A drop pod is already down'); return false; }
    if (special()) { api.toast?.('No signal'); return false; }
    const list = sites.filter(open);
    if (!list.length) { api.toast?.('No landing site is open · open more of the city'); return false; }
    S.held = null; sfx('pod_insert', .7);
    call(list[Math.floor(Math.random() * list.length)], colour);
    return true;
  }
  for (const colour of Object.keys(RADIOS)) world.addInteraction({ position: W(...RADIOS[colour]).add(new THREE.Vector3(0, 40, 0)), sight: true,
    hidden: () => !session.power || !S.held,
    text: () => (S.held === colour ? `Insert the ${colour} code cylinder` : `The ${RADIO_NAME[colour]} radio takes a ${colour} cylinder`), use: () => radio(colour) });

  // ---- the console ------------------------------------------------------------------------------------------------------
  if (con) {
    place(con, CONSOLE); con.root.userData.noMerge = true; scene.add(con.root);
    try { const c = solidOf([con.root], { name: 'gk_net_console' }); if (c) { world.dynamic.push(c); world.collision?.invalidateCache?.(); } }
    catch (e) { console.warn('[gorod-krovi] console collision', e); }
    for (const [, tag] of PARTS) hidePart(con, tag);
    hidePart(con, 'tag_dragon_network_console_screen_green');
  }
  function craft() {
    if (!S.carried.length) { api.toast?.(S.crafted ? 'The network is up' : 'Parts are missing', 2); return false; }
    for (const i of S.carried) { S.placed.push(i); if (con) hidePart(con, PARTS[i][1], false); }
    S.carried = []; sfx('craft', .7, W(...CONSOLE), 2000);
    if (S.placed.length >= PARTS.length && !S.crafted) {
      S.crafted = true; gk.setFlag('dragonridecrafted');
      if (con) { hidePart(con, 'tag_dragon_network_console_screen_red'); hidePart(con, 'tag_dragon_network_console_screen_green', false); }
      api.toast?.('The dragon network is online · the roosts can be used', 4);
      gk.emit('pod:crafted');
    } else api.toast?.(`Parts placed · ${S.placed.length} of ${PARTS.length}`, 2.5);
    return true;
  }
  world.addInteraction({ position: W(...CONSOLE_USE), sight: true, hidden: () => S.crafted && !S.carried.length,
    text: () => (S.carried.length ? 'Place the network parts' : `Dragon network console · ${S.placed.length} of ${PARTS.length} parts`), use: craft });

  // ---- loop ------------------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    if (!dt) return;
    try {
      tickCylinder(dt); tickPod(dt);
      const p = partAt(); if (p) partUse.position.copy(p);
    } catch (e) { console.error('[gorod-krovi] pods', e); }
  });
  host.on('reset', () => {
    release(); gone(); S.cyl = null; cylRoot.visible = false; S.held = null; S.chance = .1; S.made = 0; S.parts = 0; S.carried = []; S.placed = []; S.crafted = false;
    S.retired.clear(); S.resting.clear();
    if (con) { for (const [, tag] of PARTS) hidePart(con, tag); hidePart(con, 'tag_dragon_network_console_screen_red', false); hidePart(con, 'tag_dragon_network_console_screen_green'); }
  });

  const handle = {
    crafts: true,
    state: () => ({ chance: +S.chance.toFixed(2), made: S.made, cylinder: S.cyl ? { colour: S.cyl.colour, at: S.cyl.at.toArray().map(Math.round), age: +S.cyl.age.toFixed(1) } : null,
      held: S.held, parts: S.parts, carried: [...S.carried], placed: [...S.placed], crafted: S.crafted, open: sites.filter(open).map(s => s.id),
      retired: [...S.retired], resting: [...S.resting].filter(([, t]) => t > session.time).map(([k]) => k),
      active: S.active ? { site: S.active.site.id, state: S.active.state, t: +S.active.t.toFixed(1), health: S.active.health, max: S.active.max, kills: S.active.kills,
        attackers: S.active.attackers.size, harassers: S.active.wave?.list?.size ?? 0, reward: S.active.reward, lamp: lampShown } : null, log: S.log }),
    cylinder: (colour = null) => { S.cyl = null; return dropCylinder(player.getFeetPosition(), colour); },
    give: colour => { S.held = colour; return true; },
    call: id => { const s = sites.find(x => x.id === id) ?? sites.filter(open)[0]; if (!s || S.active) return false; call(s, 'blue'); return true; },
    win: () => { const A = S.active; if (!A || (A.state !== 'land' && A.state !== 'defend')) return false; A.state = 'defend'; win(); return true; },
    lose: (why = 'health') => lose(why),
    take: () => take(S.active), radio, craft,
    parts: () => { S.carried = PARTS.map((_, i) => i).filter(i => !S.placed.includes(i)); S.parts = PARTS.length; return true; },
    sites: () => sites.map(s => ({ id: s.id, flag: s.flag, open: open(s) })),
  };
  gk.pods = handle; (window.kino ??= {}).gorod ??= {}; window.kino.gorod.pods = handle;
}
