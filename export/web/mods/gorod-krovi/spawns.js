// Gorod Krovi's round spawns as BO3's zone manager runs them (2026-11-15), from the table .tools/gorod_spawns.py writes
// into the git-ignored map folder (spawns.json: each zone's volume box and spot structs, the windows, the one-way zone
// links with their flags, add_zone_flags). Reimplemented from _zm_zonemgr.gsc, _zm_spawner.gsc and zm_stalingrad*.gsc:
// - enabled (zone_flag_wait / enable_zone): once a link's flag is set both its zones are enabled; start_A_zone is
//   enabled from the start (manage_zones' initial zone). powered_bridge_zone only while the bridge is down
//   (zm_stalingrad_powered_bridge activate_bridge sets is_enabled and takes it back, and disconnects the two bridge ends);
//   boss_arena_zone only by enable_zone from a script (gk.enableZone).
// - active, every second (manage_zones): the enabled zones a player's box touches (any_player_in_zone, istouching the
//   volume) plus the zones their connected links lead to (links are one-way: add_adjacent_zone(a, b, flag, 1)); none
//   touched -> start_A_zone.
// - the spot list (create_spawner_list): every spawn_location and riser_location of the active zones.
// - the pick (zm_stalingrad function_ff18dfdd, level.zm_custom_spawn_location_selection): any spot at random; with more
//   than one player, half the time one of the 5 spots nearest the next player in turn.
// - the entry: a spot whose script_string names a window set (zone_init links it to that window's path) sends its
//   zombie from the spot to that window, where it tears the boards down and climbs in; a "find_flesh" spot's zombie
//   goes straight for the players (should_skip_teardown). riser_location spots climb out of the ground (do_zombie_rise).
// The special spots (drop pods, Pavlov's lockdown, raz/sentinel) are not in the zones' spot lists and stay with their
// systems. world.activeZones keeps the enabled zones (doors, Pavlov's); gk.activeZones() is the active set (our ids),
// used by the bosses' spot picks as BO3's raz/sentinel locations are.
import * as THREE from 'three';

const URL_ = new URL('../maps/gorod-krovi/spawns.json', import.meta.url).href;
const PLAYER_R = 15, PLAYER_H = 72;   // the player's box for istouching

export default async function setupSpawns(api, gk) {
  const { world, session, enemies, player } = api;
  let T; try { T = await (await fetch(URL_)).json(); } catch (e) { console.warn('[gorod-krovi] spawns: no spawns.json (.tools/gorod_spawns.py); the build\'s spawns are used'); return; }
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  // the window barriers (custom-world: WINDOW markers) by BO3 window set: the nearest within 80
  const winBar = T.windows.map(w => {
    let best = null, bd = 80;
    for (const b of world.barriers) if (b.boards?.length) { const d = b.position.distanceTo(V(w)); if (d < bd) { bd = d; best = b; } }
    return best;
  });
  const zones = new Map();
  for (const [name, z] of Object.entries(T.zones)) {
    const zone = { name, id: z.id, box: new THREE.Box3(V(z.box[0]), V(z.box[1])), out: [], spots: [] };
    for (const [k, s] of z.spots.entries()) {
      const p = V(s), at = world.closest?.(p, { x: 48, y: 120, z: 48 }) ?? p, win = s[5] >= 0 ? winBar[s[5]] : null;
      const e = { gk: true, id: `${name}#${k}`, zone: name, group: z.id, kind: s[4], spot: at, yaw: s[3], win, set: s[5] >= 0 ? T.windows[s[5]][3] : null,
        position: at.clone(), outside: at.clone(), inside: at.clone(), boards: [], count: 0, walk: s[4] === 's', repairTime: 0, rewardRound: 0, reward: 0 };
      e.rise = { inside: at, outside: at, position: at, boards: [], count: 0, walk: false };
      zone.spots.push(e);
    }
    zones.set(name, zone);
  }
  for (const [a, b, flag] of T.links) if (zones.has(a) && zones.has(b)) zones.get(a).out.push({ to: zones.get(b), flag });
  const stats = { spawns: [], arrived: 0, lost: 0 };
  const missingWin = [...zones.values()].flatMap(z => z.spots).filter(e => e.set && !e.win).length;

  // flags: gk.flags() (doors, power, script flags, add_zone_flags already folded in)
  const forced = new Set();   // enable_zone from a script (boss_arena_zone)
  gk.enableZone = name => forced.add(name);
  const enabled = new Set([T.initial]);   // sticky, as is_enabled (but powered_bridge_zone)
  const BRIDGE = 'powered_bridge_zone';
  const connected = (l, f) => f.has(l.flag);
  function enable(f) {
    for (const z of zones.values()) for (const l of z.out) if (connected(l, f)) { enabled.add(z.name); enabled.add(l.to.name); }
    for (const n of forced) enabled.add(n);
    for (const x of session.flags) if (x.startsWith('zone:')) for (const z of zones.values()) if (z.id === x.slice(5)) enabled.add(z.name);
    if (!f.has('activatebridge')) enabled.delete(BRIDGE);
  }
  const players = () => {
    const list = [player.getFeetPosition().clone()];
    for (const r of window.kino?.coop?.remotes?.values() ?? []) if (r.target && !r.dead && performance.now() - r.lastSeen < 5000) list.push(r.target.clone());
    return list;
  };
  const touch = (z, p) => p.x + PLAYER_R >= z.box.min.x && p.x - PLAYER_R <= z.box.max.x && p.z + PLAYER_R >= z.box.min.z && p.z - PLAYER_R <= z.box.max.z && p.y + PLAYER_H >= z.box.min.y && p.y <= z.box.max.y;
  const st = { t: -1, active: new Set(), occupied: new Set(), list: [], fallback: false, sel: 0 };
  function manage() {
    const f = gk.flags(); if (session.flags.has('zone:pavlovsb')) f.add('dragonridecrafted');   // the roosts' landing stands in for the ride's craftable
    enable(f);
    const occ = new Set(), act = new Set(), ps = players();
    for (const n of enabled) { const z = zones.get(n); if (z && ps.some(p => touch(z, p))) occ.add(n); }
    for (const n of occ) { act.add(n); for (const l of zones.get(n).out) if (connected(l, f) && enabled.has(l.to.name)) act.add(l.to.name); }
    st.fallback = !occ.size; if (st.fallback) act.add(T.initial);
    st.occupied = occ; st.active = act;
    st.list = [...act].flatMap(n => zones.get(n)?.spots ?? []);
  }
  const tick = () => { const t = performance.now() / 1000; if (st.t < 0 || t - st.t >= 1) { st.t = t; manage(); } };   // manage_zones: wait(1)

  const spawnBarriers0 = world.spawnBarriers.bind(world);
  world.spawnBarriers = s => {
    if (world.entry?.nearbySpawns && world.playerFeet && world.offMesh?.(world.playerFeet)) return spawnBarriers0(s);   // parkour: points on the player's surface
    tick(); return st.list;
  };
  // get_zone_from_position: the zone whose volume holds p (the smallest box where they overlap), as our zone id
  world.zoneAt = p => { let best = null, bv = Infinity; for (const z of zones.values()) if (z.box.containsPoint(p)) { const s = z.box.getSize(new THREE.Vector3()), v = s.x * s.y * s.z; if (v < bv) { bv = v; best = z; } } return best?.id; };
  // where a teleport may put the player (Gersh Device, QED, Anywhere But Here; world.playerSpots): the inside spot of each
  // boarded window of an enabled zone. The zones' spots above are BO3's zombie spawn spots, mostly outside the play space,
  // and the teleports took the player there (2026-11-17, user: "gersch/qed can teleport player out of bounds")
  world.playerSpots = () => { tick(); const set = new Set(); for (const n of enabled) for (const e of zones.get(n)?.spots ?? []) if (e.win?.inside && !e.win.submerged) set.add(e.win); return [...set].map(b => b.inside); };
  gk.activeZones = () => { tick(); return new Set([...st.active].map(n => zones.get(n)?.id).filter(Boolean)); };

  if (enemies) {
    const choices0 = enemies.spawnChoices.bind(enemies);
    enemies.spawnChoices = pl => {
      const list = world.spawnBarriers(session);
      if (!list.length || !list[0].gk) return choices0(pl);
      // function_ff18dfdd: co-op, half the time the 5 spots nearest the next player in turn
      const ps = players();
      if (ps.length > 1 && Math.random() < .5) {
        const p = ps[st.sel++ % ps.length];
        return list.map(b => ({ b, d: b.spot.distanceToSquared(p) })).sort((a, c) => a.d - c.d).slice(0, 5).map(({ b }) => ({ b, len: 0 }));
      }
      return list.map(b => ({ b, len: 0 }));
    };
    // a spot's zombie: climbs out of the ground at a riser spot, appears at a spawn spot; a window feeder's then walks to its window
    const spawn0 = enemies.spawn.bind(enemies);
    enemies.spawn = (position = null, barrier = null, kind, ...rest) => {
      if (!barrier?.gk) return spawn0(position, barrier, kind, ...rest);
      const e = barrier, z = spawn0(e.spot.clone(), e.kind === 'r' ? e.rise : null, kind, ...rest);
      if (!z) return z;
      z.root.rotation.y = THREE.MathUtils.degToRad(e.yaw ?? 0);
      if (z.state === 'barricade') { z.state = 'chase'; z.barrier = null; }   // no riser clip: up in place
      z.gkSpot = e.id;
      if (e.win && z.kind !== 'dog') { z.gkWin = e.win; z.gkSince = performance.now(); }
      stats.spawns.push({ id: e.id, zone: e.zone, kind: e.kind, set: e.set, at: e.spot.toArray().map(Math.round), round: session.round, t: Math.round(session.time ?? 0) });
      if (stats.spawns.length > 400) stats.spawns.shift();
      return z;
    };
    // the walk to the window: lureTarget is the point every chaser steers to (enemies.js); there, the window's barricade state
    const lure0 = enemies.lureTarget?.bind(enemies);
    enemies.lureTarget = z => {
      const w = z.gkWin;
      if (w && z.state === 'chase') {
        const o = w.outside, p = z.root.position, d = Math.hypot(o.x - p.x, o.z - p.z), age = performance.now() - z.gkSince;
        const done = z.path?.length > 1 && z.pathIndex >= z.path.length && d < 120;   // the navmesh ends short of the sill
        const lost = age > 6000 && (z.path?.length ?? 0) < 2 || age > 30000;            // no walk there: put it at the window
        if (d < 40 && Math.abs(o.y - p.y) < 70 || done || lost) {
          if (lost) { p.copy(o); stats.lost++; } else stats.arrived++;
          z.gkWin = null; z.barrier = w; z.state = 'barricade'; z.tearLeft = .6; z.path = []; z.pathIndex = 0;
        }
        return o;
      }
      return lure0 ? lure0(z) : null;
    };
  }
  window.kino ??= {}; window.kino.gorodSpawns = {
    state: () => { tick(); return { active: [...st.active], occupied: [...st.occupied], enabled: [...enabled], fallback: st.fallback, spots: st.list.length }; },
    stats, zones, zoneAt: world.zoneAt,
  };
  const total = [...zones.values()].reduce((n, z) => n + z.spots.length, 0);
  console.info(`[gorod-krovi] spawns: BO3 zone manager, ${zones.size} zones, ${total} spots, ${winBar.filter(Boolean).length}/${T.windows.length} windows matched` + (missingWin ? `, ${missingWin} feeders without a window` : ''));
}
