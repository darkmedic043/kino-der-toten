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
const LEVER2 = { at: V(-2226, 1446, -1471), yaw: 27.8 };
const GENERATOR_COUNT = 3;
// the door swings from its entity origin to bunker_door_moveto (yaw 340 -> 128.3); its clip is a box in entities.json
const BUNKER = { origin: V(-1383, 1706, -1232), to: V(-1280, 1706, -1432), turn: (128.304 - 340 + 360) * DEG, clip: [[-1442, 1695, -1256], [-1369, 1945, -1224]], time: 2.2 };
// the shaft behind the bunker door drops 306 units into the lab tunnel (no ladder in the original): a landing at its
// foot takes no fall damage
const SHAFT = [[-1440, 1370, -1345], [-1340, 1420, -1240]];
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
const ROUND_LINES = 4, ROUND_LINE_GAIN = .5;   // round-start lines: gain into the master (.42 x the volume setting)

export default function setup(api) {
  if (api.map?.id !== 'nuketown') return;
  try { setupAtmosphere(api); } catch (e) { console.warn('[nuketown] atmosphere', e); }
  try { setupQuest(api); } catch (e) { console.warn('[nuketown] quest', e); }
  try { setupSounds(api); } catch (e) { console.warn('[nuketown] sounds', e); }
  try { const z = setupZombies(api); if (globalThis.kino?.nuketown) globalThis.kino.nuketown.zombies = z; } catch (e) { console.warn('[nuketown] zombies', e); }
}

// ---- scene helpers: the builder bakes every ENT_ prop in world space under a node with no transform (several nodes can
// share a name: a prop placed more than once, or a brushmodel's surfaces split by material)
function nodesOf(root, name) {
  const re = new RegExp('^ENT_' + name + '(?:[._]\\d+)?$'), out = [];
  root?.traverse(o => { if (re.test(o.name)) out.push(o); });
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

  // ---- power: lever 2 first, then the engine's POWER marker
  const lever = nodesOf(root, 'pf5006_auto340').map(n => pivot(n, LEVER2.at));
  const leverAxis = V(Math.sin(LEVER2.yaw * DEG), 0, Math.cos(LEVER2.yaw * DEG));
  const setLever = pulled => { for (const n of lever) { n.quaternion.identity(); if (pulled) n.rotateOnWorldAxis(leverAxis, -1.2); moved(n); } };
  world.addInteraction({
    position: LEVER2.at.clone().add(V(0, 10, 0)), nuketown: true,
    hidden: () => flag('lever2'), text: () => 'Pull the lever · 1 of 2',
    use() { setFlag('lever2'); setLever(true); sfx('buy'); toast('One more lever powers the site', 4); return true; },
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
      use() { setFlag('got_' + t.node); show(t.nodes, false); sfx('buy'); toast(`${t.name[0].toUpperCase() + t.name.slice(1)}: something in the lab needs fixing`, 4); return true; },
    });
    world.addInteraction({
      position: t.panel.clone(), nuketown: true,
      hidden: () => flag('fixed_' + t.node), text: () => `Repair the panel with the ${t.name}`,
      locked: () => !session.power || !flag('got_' + t.node), get lockedText() { return session.power ? `Needs the ${t.name} from the lab` : 'The power must be activated'; },
      use() {
        setFlag('fixed_' + t.node); st.fixed++; sfx('buy');
        if (st.fixed < TOOLS.length) { toast(`Panel repaired · ${st.fixed} / ${TOOLS.length}`, 4); return true; }
        st.elevatorT = 0; sfx('teleport', .6); toast('The elevator is coming up', 5); return true;
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
    use() { setFlag('skull'); show(nodesOf(root, 'pap_key'), false); sfx('powerup', .7); toast('The skull key: it belongs somewhere below', 5); return true; },
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
  const placePerk = () => {
    const loot = globalThis.kino?.loot; if (!loot?.spawn) return;
    if (perkItem) { try { loot.remove(perkItem); } catch {} perkItem = null; }
    const perk = loot.freePerk?.(); if (!perk) return;
    perkItem = loot.spawn('perk', FREE_PERK.clone(), { id: perk.id, life: 1e9, onPick: () => { perkItem = null; setFlag('free_perk'); } });
  };
  const zoneTick = () => {
    const active = world.activeZones?.(session); if (!active) return;
    for (const [from, to] of Object.entries(ZONE_LINKS)) if (active.has?.(from) || (Array.isArray(active) && active.includes(from))) session.flags?.add('zone:' + to);
  };

  const reset = () => {
    Object.assign(st, { generators: 0, bunkerT: null, fixed: 0, elevatorT: null, skullT: null, lava: 0, portal: 0, zone: 0 });
    show(generators, true); setBunker(0); setLever(false);
    for (const t of tools) show(t.nodes, true);
    setElevator(0); show(nodesOf(root, 'pap_key'), true); show(papSkull, false); for (const n of papSkull) { n.position.set(0, 0, 0); moved(n); }
    show(papDoor, true); papClip.enabled = true; elevatorClip.enabled = true; bunkerClip.enabled = true;
    world.papLocked = true; world.papLockedText = papLockedText;
    armGenerators();
  };
  reset();
  host.on('reset', reset);
  host.on('fall', e => { const p = e.position; if (SHAFT[0].every((lo, a) => lo <= p.getComponent(a) && p.getComponent(a) <= SHAFT[1][a])) e.amount = 0; });
  host.on('start', () => { placePerk(); });
  host.on('update', dt => {
    const s = session;
    if (st.bunkerT != null) { st.bunkerT += dt / BUNKER.time; setBunker(st.bunkerT); if (st.bunkerT >= 1) st.bunkerT = null; }
    if (st.elevatorT != null) { st.elevatorT += dt / ELEVATOR.time; setElevator(st.elevatorT); if (st.elevatorT >= 1) { st.elevatorT = null; setFlag('elevator'); } }
    if (st.skullT != null) { st.skullT += dt; setSkull(st.skullT); if (st.skullT >= PAP.time) { st.skullT = null; openPap(); } }
    if (!flag('lever2') && s.power) setFlag('lever2');   // a cheat or the engine turned it on: keep the lever in step
    const p = player?.getFeetPosition?.(); if (!p) return;
    st.zone += dt; if (st.zone > 1) { st.zone = 0; zoneTick(); }
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
  const found = { lever: lever.length, generators: genGroups.length, bunkerDoor: bunkerDoor.length, tools: tools.map(t => t.nodes.length), elevator: elevator.length, elevatorDoor: elevatorDoor.length, papSkull: papSkull.length, papDoor: papDoor.length, power: !!power, crates: perks?.drops.map(d => d.crateNodes.length) };
  console.log('[nuketown] quest nodes', JSON.stringify(found));
  // the quest's progress for the Tab tiles (tab.js) and the journal (journal/quests.js); `at` fields are marker spots
  const state = () => ({
    lever2: flag('lever2'), power: !!session.power, lever: LEVER2.at,
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
