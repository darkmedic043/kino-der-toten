// Nuketown extras (map id `nuketown`, the UGX World at War map Nuketown Remastered 1.2 ported by build_waw_map.py):
// the original's scripted quest, rebuilt on the engine's hooks from the ENT_ nodes and the positions in entities.json
// (game space: x, y up, z; docs/fork/waw-ports.md).
//   - Power: two levers in the lab. The second one (pf5006_auto340) is a plain interaction; the engine's POWER marker
//     (the first lever) stays locked until it was pulled.
//   - The bunker: three transformers (ENT_bunker_generator) in the streets are shoot targets; blowing all three swings
//     the bunker door (ENT_bunker_door, pivoted on its entity origin) open and drops its clip.
//   - Pack-a-Punch: three tools lie around the lab (ENT_tool1..3); each repairs one panel of the key elevator once the
//     power is on; the elevator then lifts the skull key out of the pit; placing it at the sealed alcove in hell raises
//     a skull for 20 s and then clears the books and wall (ENT_pap_door) in front of the machine (world.papLocked).
//   - A free perk bottle in the closet beside the yellow house's back (free_maxammo), lava that burns, the hell portals
//     that bring the player back up to the street, the original's zone links (blue back opens construction, brady back
//     opens brady) and its round-start lines (sounds/round_start_0N.ogg, ripped with the map so git-ignored).
//   - Falling perks (perks.js): six machines come down from the sky once called, onto crate piles.
//   - The map's own zombies (characters.js): BO2 Nuketown's hazmat, soldier and civilian zombies.
//   - Tab tiles (tab.js) and the journal's Nuketown quests (journal/quests.js) read kino.nuketown.state().
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { setupAtmosphere } from './atmosphere.js';
import { setupPerkDrops, mapSound } from './perks.js';
import { setupZombies } from './characters.js';
import { setupTab } from './tab.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
// the two power switches (_nt_power.gsc): a handle sticks straight out of its panel (roll 90) and swings up to roll 0 in 0.4 s.
// The script's angle references, pf5006_auto343 and 347 (roll 0, a stray lever standing near each panel), are deleted at its
// start; 340 is baked in place, and 347 is baked at roll 0 away from the panel, so it's moved in as the first switch's handle
// (`baked` = the roll in the map's geometry). `at` is the handle's origin, within a unit of the struct the script turns it about
const LEVERS = [
  { name: 'pf5006_auto340', from: V(-2225.93, 1445.8, -1471.4), at: V(-2225.93, 1445.8, -1471.4), yaw: 27.8, baked: 90 },
  { name: 'pf5006_auto347', from: V(-1359.49, 1426.3, -145.71), at: V(-1398.86, 1439.8, -160.04), yaw: 70, baked: 0 },
];
const LEVER_TIME = .4;
// the blue house's floor (bo1_rus_art_metal_panel) stops short under its stairs: two gaps you can walk into, and the rest of
// the space under them (the original fences that off with a clip volume but draws nothing): tiled over and made solid,
// [x0, z0, x1, z1] just under the floor's height
const FLOOR_HOLES = [[-1036, 1711, -982, 1751], [-1036, 1764, -982, 1805], [-983, 1710, -832, 1816]], FLOOR_Y = 1690.8, FLOOR_TILE = 128;
// the map's shadow plate (caulk_shadow, a solid sheet under the whole town, y 1612-1613, [x0, x1, z0, z1]) and the lower one
// at 712 catch anyone who slips through a gap in the ground: under the map, with no way back. The hell hole and the
// bunker stairs come down through the plate's slots, so nothing legitimate stands on it. POCKETS are hollows in the
// wrecks you can drop into and not climb out of, told from the ground around them by having no navmesh, or none that reaches ROAD.
const PLATE_Y = 1613, VOID_Y = 800;
const PLATES = [[-1754, -1590, 1972, 3952], [-1590, -1428, 1791, 3952], [-2771, -1854, -1642, 3952], [-1854, -1428, -1642, 1791],
  [-664, -563, 445, 680], [-563, 872, 352, 680], [-1348, -1048, 352, 680], [-1348, 872, 680, 3952], [-1348, 872, -1544, 352]];
const POCKETS = [[992, 1170, -320, -105], [28, 118, 684, 770]], ROAD = V(-300, 1692, 1300);
const GENERATOR_COUNT = 3;
// the door swings from its entity origin to bunker_door_moveto (yaw 340 -> 128.3); its clip is a box in entities.json
const BUNKER = { origin: V(-1383, 1706, -1232), to: V(-1280, 1706, -1432), turn: (128.304 - 340 + 360) * DEG, clip: [[-1442, 1695, -1256], [-1369, 1945, -1224]], time: 2.2 };
// the way down is a drop (the shaft behind the bunker door, 306 units into the lab tunnel with no ladder in the original;
// the holes into hell): a landing below the surface takes no fall damage
const UNDERGROUND = 1560;
const TOOLS = [
  { node: 'tool1', name: 'screwdriver', at: V(-1528, 1381, 703), panel: V(-1390, 1380, 772) },
  { node: 'tool2', name: 'wire cutters', at: V(-1943, 1384, -3), panel: V(-1667, 1380, 840) },
  { node: 'tool3', name: 'hammer', at: V(-473, 1400, 1355), panel: V(-1755, 1380, 670) },
];
const ELEVATOR = { rise: 160, time: 3, doorRise: 100, clip: [[-1604, 1335, 902], [-1455, 1457, 962]], key: V(-1548, 1172, 1003) };
const PAP = { trig: V(-1177, 1024, 2588), skull: V(-1195, 1030, 2582), rise: 100, time: 20, clip: [[-1241, 976, 2507], [-1171, 1187, 2642]] };
const FREE_PERK = V(1153, 1672, -1278);
const LAVA = [[[-560, 953, 2456], [-243, 993, 2809]], [[-299, 977, 2408], [66, 1014, 2703]], [[-491, 890, 2942], [38, 945, 3421]]];   // the three lava_damage triggers
const PORTALS = [V(-1166, 1324, 1828), V(-662, 1055, 3267), V(-207, 1091, 3181), V(-1883, 1092, 2441)];
const ZONE_LINKS = { blueback: 'construction', bradyback: 'brady' };   // zone opened -> zone that opens with it (the original's enter_* flags)
// the water spouts (_watershoot.gsc): stand on one for 3 s and it throws the player up its shaft, then carries them along the
// original's script_origin chain onto the floor above and opens that area (script_flag enter_brady / enter_blue_back).
// `trig` is the water_shoot trigger, `top` the bottom of the end-spot trigger; the lab's comes up in the Brady house, hell's
// at the blue house's back
const SPOUTS = [
  { trig: [[-905, 1432, 464], [-816, 1440, 569]], top: 1660, zones: ['brady', 'bradyback'],
    path: [[-855, 1696, 533], [-854, 1716, 552], [-852, 1728, 575], [-851, 1732, 600], [-850, 1730, 623], [-850, 1721, 642], [-850, 1704, 653]] },
  { trig: [[-1716, 1304, 1850], [-1633, 1312, 1934]], top: 1688, zones: ['blueback'],
    path: [[-1661, 1739, 1880], [-1646, 1762, 1880], [-1618, 1780, 1880], [-1579, 1790, 1880], [-1542, 1780, 1880], [-1513, 1753, 1880], [-1489, 1709, 1880]] },
].map(q => ({ ...q, centre: V((q.trig[0][0] + q.trig[1][0]) / 2, q.trig[1][1], (q.trig[0][2] + q.trig[1][2]) / 2), path: q.path.map(a => V(...a)) }));
const SPOUT = { prepare: 3, speed: 900, step: .2, cooldown: 3, safe: 1.5 };
const ROUND_LINES = 4, ROUND_LINE_GAIN = .5;   // round-start lines: gain into the master (.42 x the volume setting)

export default async function setup(api) {
  if (api.map?.id !== 'nuketown') return;
  try { setupAtmosphere(api); } catch (e) { console.warn('[nuketown] atmosphere', e); }
  try { setupQuest(api); } catch (e) { console.warn('[nuketown] quest', e); }
  try { setupSounds(api); } catch (e) { console.warn('[nuketown] sounds', e); }
  // awaited (2026-10-29): the engine's shader warm-up draws enemies.templates/heads (and the dismemberment mod's gib pieces)
  // once the mods are set up, so the zombies (12 MB, slow over the tunnel) must have replaced BO1's by then, or their
  // programs compile at the first spawn instead: 2-3 s a program on Windows/D3D11
  try { const z = await setupZombies(api); if (globalThis.kino?.nuketown) globalThis.kino.nuketown.zombies = z; } catch (e) { console.warn('[nuketown] zombies', e); }
}

// ---- scene helpers: the builder bakes every ENT_ prop in world space under a node with no transform (several nodes can
// share a name: a prop placed more than once, or a brushmodel's surfaces split by material)
// the top-most nodes named ENT_<name>[_N]: a brushmodel's group and its meshes share the name, and taking both moved the
// meshes twice (the key elevator rose 320 into the ceiling, 2026-10-29)
function nodesOf(root, name) {
  const re = new RegExp('^ENT_' + name + '(?:[._]\\d+)?$'), out = [];
  const walk = o => { if (re.test(o.name)) out.push(o); else for (const c of o.children) walk(c); };
  if (root) walk(root);
  return out;
}
// moves the node's origin to `origin` (the entity's origin) so it can be rotated about it: the geometry is re-based
function pivot(node, origin) {
  if (node.userData.pivoted) return node;
  node.traverse(m => { if (m.isMesh && m.geometry) { m.geometry = m.geometry.clone().translate(-origin.x, -origin.y, -origin.z); m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox(); } });
  node.position.copy(origin); node.userData.pivoted = true;
  live(node); return node;
}
// a custom map's nodes leave optimizeStaticScene with matrixAutoUpdate off and the static freeze never thaws those
function live(node) { node.matrixAutoUpdate = true; node.updateMatrix(); node.updateMatrixWorld(true); }
function moved(node) { node.updateMatrix(); node.updateMatrixWorld(true); }
function show(nodes, on) { for (const n of nodes) n.visible = on; }
// a solid box from an entities.json `bounds` pair as a dynamic collider (brushmodel clips aren't in the static collision)
function boxCollider(world, [lo, hi], enabled) {
  const size = V(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), centre = V((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z).translate(centre.x, centre.y, centre.z);
  const dyn = { collider: new CollisionWorld(geo), box: new THREE.Box3().setFromBufferAttribute(geo.attributes.position), enabled, window: true, nuketown: true };
  world.dynamic.push(dyn); return dyn;
}
// a floor tile over a gap, sharing the floor's material (planar uvs at its tile size)
function patchFloor(world, material, [x0, z0, x1, z1]) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, FLOOR_Y, (z0 + z1) / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / FLOOR_TILE, pos.getZ(i) / FLOOR_TILE);
  world.root.add(new THREE.Mesh(geo, material));
  boxCollider(world, [[x0, FLOOR_Y - 20, z0], [x1, FLOOR_Y, z1]], true);
}
const inBox = (p, [lo, hi], pad = 0, up = 0) => p.x >= lo[0] - pad && p.x <= hi[0] + pad && p.z >= lo[2] - pad && p.z <= hi[2] + pad && p.y >= lo[1] - 20 && p.y <= hi[1] + up;
const ease = t => t < .5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

function setupQuest(api) {
  const { world, session, host, audio, toast, announce, player, damage } = api;
  const root = world.root;
  if (!root) { console.warn('[nuketown] no map root'); return; }
  const flag = f => session.flags?.has('nuketown:' + f), setFlag = f => session.flags?.add('nuketown:' + f);
  const sfx = (k, v = 1) => { try { audio?.play?.(k, v); } catch {} };
  const burst = (position, count = 30) => host.emit?.('effect', { position: position.clone(), color: new THREE.Color(1, .7, .3), count });
  const papLockedText = 'Sealed: the skull key is somewhere in the lab';
  const st = {};   // per-game state, rebuilt on reset

  let floor = null;
  root.traverse(o => { if (o.isMesh && o.material?.name?.endsWith('bo1_rus_art_metal_panel')) floor = o.material; });
  if (floor) for (const hole of FLOOR_HOLES) patchFloor(world, floor, hole);
  // ---- power: lever 2 first, then the engine's POWER marker
  show(nodesOf(root, 'pf5006_auto343'), false);
  const levers = LEVERS.map(l => ({ ...l, t: -1, axis: V(Math.cos(l.yaw * DEG), 0, -Math.sin(l.yaw * DEG)),
    nodes: nodesOf(root, l.name).map(n => { pivot(n, l.from); n.position.copy(l.at); return n; }) }));
  // t: 0 out of the panel, 1 pulled up
  const setLever = (l, t) => {
    if (t === l.t) return;
    l.t = t;
    for (const n of l.nodes) { n.quaternion.setFromAxisAngle(l.axis, (90 * (1 - ease(t)) - l.baked) * DEG); moved(n); }
  };
  const leverTick = dt => {
    for (const l of levers) {
      const on = l.baked ? flag('lever2') : session.power;
      setLever(l, on ? Math.min(1, l.t + dt / LEVER_TIME) : 0);
    }
  };
  world.addInteraction({
    position: LEVERS[0].at.clone().add(V(0, 10, 0)), nuketown: true,
    hidden: () => flag('lever2'), text: () => 'Pull the lever · 1 of 2',
    use() { setFlag('lever2'); sfx('buy'); toast('One more lever powers the site', 4); return true; },
  });
  const power = world.interactions.find(i => i.kind === 'power');
  if (power) { power.locked = () => !flag('lever2'); power.lockedText = 'Pull the other lever in the lab first'; }

  // ---- the bunker: three transformers, then the door
  const generators = nodesOf(root, 'bunker_generator');
  const bunkerDoor = nodesOf(root, 'bunker_door').map(n => pivot(n, BUNKER.origin));
  const bunkerClip = boxCollider(world, BUNKER.clip, true);
  // each transformer is several ENT_bunker_generator nodes (one per surface): group them by where they stand
  const genGroups = [];
  for (const g of generators) {
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) continue;
    const c = box.getCenter(new THREE.Vector3());
    const grp = genGroups.find(q => q.centre.distanceTo(c) < 250);
    if (grp) { grp.nodes.push(g); grp.box.union(box); grp.box.getCenter(grp.centre); } else genGroups.push({ nodes: [g], box: box.clone(), centre: c });
  }
  const armGenerators = () => {
    if (world.shootTargets) world.shootTargets = world.shootTargets.filter(t => !t.nuketown);
    for (const grp of genGroups) {
      grp.down = false;
      world.addShootTarget({
        position: grp.centre, radius: Math.max(40, grp.box.getSize(new THREE.Vector3()).length() / 2), nuketown: true,
        hit() {
          if (grp.down) return;
          grp.down = true; show(grp.nodes, false); st.generators++; burst(grp.centre, 36); sfx('explosion', .8);
          if (st.generators < GENERATOR_COUNT) { toast(`Transformer destroyed · ${st.generators} / ${GENERATOR_COUNT}`, 4); return; }
          st.bunkerT = 0; sfx('explosion', .5); announce('THE BUNKER IS OPEN', 'The lab under the test site awaits', 5);
        },
      });
    }
  };
  const setBunker = t => { const k = ease(Math.min(1, t)); for (const n of bunkerDoor) { n.position.lerpVectors(BUNKER.origin, BUNKER.to, k); n.rotation.y = BUNKER.turn * k; moved(n); } bunkerClip.enabled = k < .5; };

  // ---- Pack-a-Punch: tools, panels, the elevator, the skull
  const tools = TOOLS.map(t => ({ ...t, nodes: nodesOf(root, t.node) }));
  const elevator = [...nodesOf(root, 'pap_key_elevator'), ...nodesOf(root, 'pap_key')].map(n => (live(n), n));
  const elevatorDoor = nodesOf(root, 'elevator_door').map(n => (live(n), n));
  const elevatorClip = boxCollider(world, ELEVATOR.clip, true);
  const papSkull = nodesOf(root, 'pap_skull').map(n => (live(n), n));
  const papDoor = nodesOf(root, 'pap_door');
  const papClip = boxCollider(world, PAP.clip, true);
  for (const t of tools) {
    world.addInteraction({
      position: t.at.clone().add(V(0, 8, 0)), nuketown: true,
      hidden: () => flag('got_' + t.node), text: () => `Take the ${t.name}`,
      use() { setFlag('got_' + t.node); show(t.nodes, false); sfx('buy'); toast(`${t.name[0].toUpperCase() + t.name.slice(1)} · ${TOOLS.filter(u => flag('got_' + u.node)).length} / ${TOOLS.length} tools: it repairs a panel by the elevator in the lab`, 5); return true; },
    });
    world.addInteraction({
      position: t.panel.clone(), nuketown: true,
      hidden: () => flag('fixed_' + t.node), text: () => `Repair the panel with the ${t.name}`,
      locked: () => !session.power || !flag('got_' + t.node), get lockedText() { return session.power ? `Needs the ${t.name} from the lab` : 'The power must be activated'; },
      use() {
        setFlag('fixed_' + t.node); st.fixed++; sfx('buy');
        if (st.fixed < TOOLS.length) { toast(`Panel repaired · ${st.fixed} / ${TOOLS.length}`, 4); return true; }
        st.elevatorT = 0; sfx('teleport', .6); toast('The elevator is coming up: take the skull key from it', 5); return true;
      },
    });
  }
  const setElevator = t => {
    const k = ease(Math.min(1, t));
    for (const n of elevator) { n.position.y = ELEVATOR.rise * k; moved(n); }
    const d = ease(Math.min(1, Math.max(0, (t - .6) / .4)));
    for (const n of elevatorDoor) { n.position.y = ELEVATOR.doorRise * d; moved(n); }
    elevatorClip.enabled = d < .6;
  };
  world.addInteraction({
    position: ELEVATOR.key.clone().add(V(0, ELEVATOR.rise + 10, 0)), nuketown: true,
    hidden: () => !flag('elevator') || flag('skull'), text: () => 'Take the skull',
    use() { setFlag('skull'); show(nodesOf(root, 'pap_key'), false); sfx('powerup', .7); toast('The skull key: place it at the sealed alcove in hell', 5); return true; },
  });
  world.addInteraction({
    position: PAP.trig.clone().add(V(0, 20, 0)), nuketown: true,
    hidden: () => flag('placed'), text: () => 'Place the skull',
    locked: () => !flag('skull'), lockedText: 'Sealed: the skull key is somewhere in the lab',
    use() { setFlag('placed'); st.skullT = 0; show(papSkull, true); sfx('packapunch', .6); toast('The seal is breaking', 5); return true; },
  });
  const setSkull = t => {
    const k = Math.min(1, t / PAP.time), shake = k < 1 ? 2.5 * (1 - k) : 0;
    for (const n of papSkull) { n.position.set((Math.random() - .5) * shake, PAP.rise * k, (Math.random() - .5) * shake); moved(n); }
  };
  const openPap = () => { show(papDoor, false); papClip.enabled = false; world.papLocked = false; burst(PAP.trig.clone().add(V(0, 60, 0)), 40); sfx('explosion', .7); announce('PACK-A-PUNCH', 'The alcove is open', 5); };

  // ---- the free perk (a loot bottle), zone links, lava, portals
  let perkItem = null;
  const perkDoor = [...world.doors?.values?.() ?? []].filter(d => d.cost >= 3000 && d.box).sort((a, b) => a.box.distanceToPoint(FREE_PERK) - b.box.distanceToPoint(FREE_PERK))[0] ?? null;
  const placePerk = () => {
    const loot = globalThis.kino?.loot; if (!loot?.spawn) return;
    if (perkItem) { try { loot.remove(perkItem); } catch {} perkItem = null; }
    const perk = loot.freePerk?.(); if (!perk) return;
    // the bottle sits in a rock alcove behind the 3000 door; the rocks round it can be climbed, so it is only taken once
    // that door is bought (an onPick replaces the loot mod's own pickup, so the drink is given here)
    let warned = -1e9;
    perkItem = loot.spawn('perk', FREE_PERK.clone(), { id: perk.id, life: 1e9, onPick: () => {
      if (perkDoor && !world.isOpen(perkDoor, session)) { if (session.time - warned > 4) { warned = session.time; toast('Open the door to take the free perk', 2.5); } return false; }
      if (!loot.givePerk?.(perk.id)) return false;
      perkItem = null; setFlag('free_perk'); return true;
    } });
  };
  const zoneTick = () => {
    const active = world.activeZones?.(session); if (!active) return;
    for (const [from, to] of Object.entries(ZONE_LINKS)) if (active.has?.(from) || (Array.isArray(active) && active.includes(from))) session.flags?.add('zone:' + to);
  };

  // ---- the water spouts (SPOUTS): a phase machine for the local player, `prep` (rumble and spray) -> `up` -> `carry`
  const sound = mapSound(api);
  let spoutAudio = null;
  const stopSpoutAudio = () => { try { spoutAudio?.pause(); } catch {} spoutAudio = null; };
  const spray = (q, y, count = 8) => host.emit?.('effect', { position: V(q.centre.x, y, q.centre.z), color: new THREE.Color(.75, .9, 1), count });
  const place = at => player.reset ? player.reset(at, { eye: false, resolve: false }) : player.setPosition(at);
  const spoutTick = (dt, p) => {
    st.spoutSafe -= dt; st.spoutWait -= dt;
    const fp = globalThis.kino?.fpMotion;
    let sp = st.spout;
    if (!sp) {
      if (st.spoutWait > 0 || session.phase === 'reviving' || session.phase === 'gameover') return;
      const q = SPOUTS.find(q => inBox(p, q.trig, 6, 60)); if (!q) return;
      sp = st.spout = { q, phase: 'prep', t: 0, fx: 0 };
      stopSpoutAudio(); spoutAudio = sound('watershoot_prepare', .9); toast('The water spout is building up: stay on it', 3);
    }
    const q = sp.q; sp.t += dt; sp.fx -= dt;
    if (sp.phase === 'prep') {
      if (fp) fp.shake = .4 * Math.min(1, sp.t);
      if (sp.fx <= 0) { sp.fx = .1; spray(q, q.centre.y + 4, 6 + sp.t * 4); }
      if (!inBox(p, q.trig, 20, 60) || session.phase === 'reviving') { st.spout = null; st.spoutWait = 1; stopSpoutAudio(); if (fp) fp.shake = 0; return; }
      if (sp.t < SPOUT.prepare) return;
      Object.assign(sp, { phase: 'up', t: 0, from: p.clone() });
      stopSpoutAudio(); spoutAudio = sound('watershoot_loop', .9);
    }
    st.spoutSafe = SPOUT.safe;
    if (sp.phase === 'up') {
      // straight up the shaft, drawn toward its middle, at SPOUT.speed
      const rise = (q.top - sp.from.y) / SPOUT.speed, k = Math.min(1, sp.t / rise), c = Math.min(1, sp.t / .25);
      place(V(sp.from.x + (q.centre.x - sp.from.x) * c, sp.from.y + (q.top - sp.from.y) * k, sp.from.z + (q.centre.z - sp.from.z) * c));
      if (fp) fp.shake = .6 * (1 - k);
      if (sp.fx <= 0) { sp.fx = .05; spray(q, sp.from.y + (q.top - sp.from.y) * k - 30, 14); }
      if (k >= 1) Object.assign(sp, { phase: 'carry', t: 0, from: V(q.centre.x, q.top, q.centre.z) });
      return;
    }
    // over the lip along the original's points, SPOUT.step seconds each
    const i = Math.floor(sp.t / SPOUT.step), f = sp.t / SPOUT.step - i;
    if (i < q.path.length) { const a = i ? q.path[i - 1] : sp.from; place(a.clone().lerp(q.path[i], f)); return; }
    player.setPosition(q.path.at(-1).clone().add(V(0, 2, 0)));
    for (const z of q.zones) session.flags?.add('zone:' + z);
    st.spout = null; st.spoutWait = SPOUT.cooldown; if (fp) fp.shake = 0;
    const a = spoutAudio; setTimeout(() => { if (a === spoutAudio) stopSpoutAudio(); }, 1500);
  };

  const reset = () => {
    if (st.spout && globalThis.kino?.fpMotion) globalThis.kino.fpMotion.shake = 0;
    stopSpoutAudio();
    Object.assign(st, { safe: [], safeT: 0, offMap: 0, pocket: false, spout: null, spoutWait: 0, spoutSafe: 0, generators: 0, bunkerT: null, fixed: 0, elevatorT: null, skullT: null, lava: 0, portal: 0, zone: 0 });
    show(generators, true); setBunker(0); for (const l of levers) setLever(l, 0);
    for (const t of tools) show(t.nodes, true);
    setElevator(0); show(nodesOf(root, 'pap_key'), true); show(papSkull, false); for (const n of papSkull) { n.position.set(0, 0, 0); moved(n); }
    show(papDoor, true); papClip.enabled = true; elevatorClip.enabled = true; bunkerClip.enabled = true;
    world.papLocked = true; world.papLockedText = papLockedText;
    armGenerators();
  };
  // ---- out of the map: back to where the player stood a few seconds ago
  const onPlate = p => Math.abs(p.y - PLATE_Y) < 3 && PLATES.some(([x0, x1, z0, z1]) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
  const inPocket = p => {
    if (!POCKETS.some(([x0, x1, z0, z1]) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) || p.y > 1712) return false;
    const from = world.closest(p, { x: 24, y: 24, z: 24 }), to = world.closest(ROAD, { x: 60, y: 30, z: 60 });
    if (!from || Math.abs(from.y - p.y) > 24) return true;
    const end = world.path(from, to)?.at(-1);
    return !end || end.distanceTo(to) > 100;
  };
  const rescueTick = (dt, p) => {
    const off = p.y < VOID_Y || (player.grounded && (st.pocket || onPlate(p)));
    if (!off) {
      st.offMap = 0;
      if (player.grounded && (st.safeT += dt) > .25) { st.safeT = 0; st.safe.push(p.clone()); if (st.safe.length > 16) st.safe.shift(); }
      return;
    }
    if ((st.offMap += dt) < 1) return;
    const back = (st.safe[0] ?? world.spawn?.position ?? V(60, 1720, 70)).clone();
    player.setPosition(back); player.velocity?.set(0, 0, 0);
    Object.assign(st, { safe: [back], offMap: 0, pocket: false });
    toast('Back on solid ground', 3);
  };
  reset();
  host.on('reset', reset);
  host.on('fall', e => { if (st.spoutSafe > 0 || e.position.y < UNDERGROUND) e.amount = 0; });
  host.on('start', () => { placePerk(); });
  host.on('update', dt => {
    const s = session;
    if (st.bunkerT != null) { st.bunkerT += dt / BUNKER.time; setBunker(st.bunkerT); if (st.bunkerT >= 1) st.bunkerT = null; }
    if (st.elevatorT != null) { st.elevatorT += dt / ELEVATOR.time; setElevator(st.elevatorT); if (st.elevatorT >= 1) { st.elevatorT = null; setFlag('elevator'); } }
    if (st.skullT != null) { st.skullT += dt; setSkull(st.skullT); if (st.skullT >= PAP.time) { st.skullT = null; openPap(); } }
    if (!flag('lever2') && s.power) setFlag('lever2');   // a cheat or the engine turned it on: keep the lever in step
    leverTick(dt);
    const p = player?.getFeetPosition?.(); if (!p) return;
    st.zone += dt; if (st.zone > 1) { st.zone = 0; zoneTick(); st.pocket = inPocket(p); }
    rescueTick(dt, p);
    spoutTick(dt, p);
    st.lava += dt;
    if (st.lava > .3) { st.lava = 0; if (LAVA.some(b => inBox(p, b, 0, 90))) { damage?.(50); } }
    st.portal -= dt;
    if (st.portal <= 0) for (const q of PORTALS) {
      if (Math.abs(p.y - q.y) < 100 && (p.x - q.x) ** 2 + (p.z - q.z) ** 2 < 48 * 48) {
        st.portal = 3; burst(q.clone().add(V(0, 40, 0)), 24); sfx('teleport', .8);
        const to = (world.spawn?.position ?? V(60, 1720, 70)).clone().add(V(0, 30, 0));
        player.setPosition(to);
        toast('Back on the surface', 3); break;
      }
    }
  });
  let perks = null;
  try { perks = setupPerkDrops(api, { nodesOf, show }); } catch (e) { console.warn('[nuketown] perks', e); }
  const found = { levers: levers.map(l => l.nodes.length), generators: genGroups.length, bunkerDoor: bunkerDoor.length, tools: tools.map(t => t.nodes.length), elevator: elevator.length, elevatorDoor: elevatorDoor.length, papSkull: papSkull.length, papDoor: papDoor.length, power: !!power, crates: perks?.drops.map(d => d.crateNodes.length) };
  console.log('[nuketown] quest nodes', JSON.stringify(found));
  // the quest's progress for the Tab tiles (tab.js) and the journal (journal/quests.js); `at` fields are marker spots
  const state = () => ({
    lever2: flag('lever2'), power: !!session.power, lever: LEVERS[0].at,
    generators: st.generators, generatorCount: GENERATOR_COUNT, bunker: st.generators >= GENERATOR_COUNT, transformers: genGroups.filter(g => !g.down).map(g => g.centre),
    tools: tools.map(t => ({ name: t.name, at: t.at, panel: t.panel, got: flag('got_' + t.node), fixed: flag('fixed_' + t.node) })),
    elevator: flag('elevator'), skull: flag('skull'), placed: flag('placed'), pap: !world.papLocked, papAt: PAP.trig,
    freePerk: flag('free_perk'), freePerkAt: FREE_PERK,
    perks: perks?.drops.map(d => ({ perk: d.perk, called: d.called, landed: d.landed, at: d.at ?? V((d.box[0][0] + d.box[1][0]) / 2, d.box[0][1], (d.box[0][2] + d.box[1][2]) / 2) })) ?? [],
  });
  globalThis.kino && (globalThis.kino.nuketown = { st, found, state, setBunker, setElevator, setSkull, openPap, placePerk, reset, perks });
  try { setupTab(api, state); } catch (e) { console.warn('[nuketown] tab', e); }
}

// the four round-start lines: at the first round and a few seconds after every round end
function setupSounds(api) {
  const { host } = api;
  const play = mapSound(api);
  let last = -1, timer = 0;
  // through the game's mixer (master volume applies); the lines are mastered to 0 dB peaks, so they sit well below
  // the game's own sounds (a plain Audio at .85 skipped the mixer and was about 12 dB over them)
  const line = () => {
    let i; do { i = Math.floor(Math.random() * ROUND_LINES); } while (i === last && ROUND_LINES > 1);
    last = i; play('round_start_0' + i, ROUND_LINE_GAIN);
  };
  host.on('start', () => { clearTimeout(timer); timer = setTimeout(line, 1500); });
  host.on('roundEnd', () => { clearTimeout(timer); timer = setTimeout(line, 4000); });
  host.on('reset', () => clearTimeout(timer));
  host.on('gameOver', () => clearTimeout(timer));
}
