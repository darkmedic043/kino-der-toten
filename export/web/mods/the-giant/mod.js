// The Giant (a BO3 map ported by .tools/build_bo3_map.py; see docs/fork/waw-ports.md): Der Riese's teleporter linking,
// written against the custom-map hooks (world.addInteraction, locked teleporters, scripted doors, world.papLocked).
// The build leaves empty nodes at each pad's lever (GIANT_LEVER_pad<n>) and at the mainframe's link switch
// (GIANT_CORE), locked TELEPORT_pad<n> markers and a scripted DOOR_pap_0 (the mainframe door). Does nothing elsewhere.
//   with the power on, pull a pad's lever, then use the mainframe switch within 30 s: the pad is linked (its
//   teleporter works from then on). All three linked: the mainframe door rises and Pack-a-Punch opens.
import * as THREE from 'three';
import { CollisionWorld } from '../../collision-world.js';
import { loadModel } from '../../animation.js';
import { binds } from '../../settings.js';
import { fixAnnihilatorMaterials } from '../operator-weapons/annihilator.js';
import { loadMapLight } from '../lighting/map-volume.js';
import { metalLook } from '../lighting/metal-look.js';
import { floatingDebris, debrisDoor } from '../fx/floating-debris.js';
import { giantOverlays } from './overlays.js';

const LINK_TIME = 30, WHERE = { pad0: 'east', pad1: 'south', pad2: 'west' };
export default async function setup(api) {
  if (api.map?.id !== 'the-giant') return;
  const { world, session, host, toast, announce, audio } = api;
  if (world.root && !/[?&]noOverlays/.test(location.search)) console.info('[the-giant] overlay layers:', JSON.stringify(giantOverlays(world.root)));   // chalk, gratings, glass and the black backdrop planes the map drew solid (overlays.js); before the engine's static merge
  const at = name => { const o = world.root?.getObjectByName(name); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
  const pads = Object.keys(WHERE).map(id => ({ id, tp: world.teleporters.find(t => t.name === id), lever: at('GIANT_LEVER_' + id) })).filter(p => p.tp && p.lever);
  const core = at('GIANT_CORE'), papDoor = [...world.doors.values()].find(d => d.name.startsWith('DOOR_pap_0'));
  if (!pads.length || !core) { console.warn('[the-giant] linking markers missing (rebuild the map)'); return; }
  const linked = p => session.flags.has('giant:linked:' + p.id), count = () => pads.filter(linked).length;
  const lock = () => { for (const p of pads) p.tp.locked = !linked(p); world.papLocked = count() < pads.length; };
  world.papLockedText = 'The mainframe is sealed · link all three teleporters';
  let pending = null;   // {pad, until}
  lock();

  for (const p of pads) world.addInteraction({
    position: p.lever,
    hidden: () => linked(p),
    text: () => !session.power ? 'The power must be activated' : pending ? (pending.pad === p ? 'Run to the mainframe!' : 'Another teleporter is linking') : `Activate the ${WHERE[p.id]} teleporter link`,
    use() {
      if (!session.power || pending) return false;
      pending = { pad: p, until: session.time + LINK_TIME };
      audio?.play?.('buy'); announce?.('REACH THE MAINFRAME', `${LINK_TIME} SECONDS TO LINK THE ${WHERE[p.id].toUpperCase()} TELEPORTER`, 3);
      return true;
    },
  });
  world.addInteraction({
    position: core,
    hidden: () => !pending,
    text: () => `Link the ${WHERE[pending.pad.id]} teleporter · ${Math.max(0, Math.ceil(pending.until - session.time))}s`,
    use() {
      if (!pending) return false;
      const p = pending.pad; pending = null;
      session.flags.add('giant:linked:' + p.id); lock(); audio?.play?.('buy');
      if (count() < pads.length) { toast(`Teleporter linked · ${count()} of ${pads.length}`, 4); return true; }
      if (papDoor) { session.openDoors.add(papDoor.name); world.setDoors(session); }
      announce?.('PACK-A-PUNCH', 'THE MAINFRAME DOOR OPENS', 5);
      return true;
    },
  });
  host.on('update', () => {
    if (pending && session.time > pending.until) { pending = null; toast('The link failed · pull the lever again', 4); }
  });
  host.on('reset', () => { pending = null; lock(); });
  const look = setupLook(api);
  setupDebris(api);
  setupEggs(api);
  setupBridges(api);
  await look;   // the bake and its lights, before the engine batches the map and compiles its shaders (see setupLook)
}

// ---- the drawbridges: BO3's fxanim rigs (GIANT_BRIDGE_<side>, see build_bo3_map.py) lower when the power comes on, as in
// zm_factory.gsc bridge_init. Bone nodes carry their keys in userData (rot: absolute local quaternions, loc: offsets
// added to the bind position, both [frame, ...] runs); the deck's lowered-pose collision (GIANT_BRIDGECOL_<side>) is
// switched on at the rig's bridge_connect frame. window: true keeps setDoors from cutting the navmesh under it.
function setupBridges({ world, session, host, audio }) {
  const root = world.root; if (!root) return;
  const bridges = ['lft', 'rt'].map(side => {
    const rig = root.getObjectByName('GIANT_BRIDGE_' + side), col = root.getObjectByName('GIANT_BRIDGECOL_' + side);
    if (!rig) return null;
    const bones = []; rig.traverse(o => { if (o.userData?.rot || o.userData?.loc) bones.push({ o, rot: o.userData.rot ?? [], loc: o.userData.loc ?? [], base: o.position.clone(), q0: o.quaternion.clone() }); });
    let dyn = null;
    if (col) {
      col.visible = false; col.updateWorldMatrix(true, false);
      const geo = col.geometry.clone().applyMatrix4(col.matrixWorld);
      dyn = { collider: new CollisionWorld(geo), box: new THREE.Box3().setFromBufferAttribute(geo.attributes.position), enabled: false, window: true };
      world.dynamic.push(dyn);
    }
    return { rig, bones, dyn, fps: rig.userData.fps ?? 30, frames: rig.userData.frames ?? 145, connect: rig.userData.connect ?? 100 };
  }).filter(Boolean);
  if (!bridges.length) { console.warn('[the-giant] bridges missing (rebuild the map)'); return; }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const sample = (run, n, f, out) => {   // run: [frame, c0..c(n-1), frame, ...]; linear between keys (quaternions slerped)
    const stride = n + 1, count = run.length / stride; if (!count) return false;
    let i = 0; while (i < count - 1 && run[(i + 1) * stride] <= f) i++;
    const f0 = run[i * stride], j = Math.min(count - 1, i + 1), f1 = run[j * stride], t = f1 > f0 ? Math.min(1, Math.max(0, (f - f0) / (f1 - f0))) : 0;
    if (n === 4) { qa.fromArray(run, i * stride + 1); qb.fromArray(run, j * stride + 1); out.slerpQuaternions(qa, qb, t); }
    else out.set(...[0, 1, 2].map(k => run[i * stride + 1 + k] * (1 - t) + run[j * stride + 1 + k] * t));
    return true;
  };
  const off = new THREE.Vector3();
  const pose = (b, f) => {
    for (const k of b.bones) {
      if (!sample(k.rot, 4, f, k.o.quaternion)) k.o.quaternion.copy(k.q0);
      k.o.position.copy(k.base); if (sample(k.loc, 3, f, off)) k.o.position.add(off);
    }
    b.rig.updateMatrix(); b.rig.traverse(o => o.updateMatrix()); b.rig.updateMatrixWorld(true);   // the map's matrices are frozen
    if (b.dyn) b.dyn.enabled = f >= b.connect;
  };
  let startAt = null, frame = -1, hit = false;
  const reset = () => { startAt = null; hit = false; frame = 0; for (const b of bridges) pose(b, 0); };
  reset();
  host.on('update', () => {
    if (session.power && startAt == null) { startAt = session.time; audio?.play?.('round', .5); }
    if (startAt == null) return;
    const f = Math.min(bridges[0].frames, (session.time - startAt) * bridges[0].fps);
    if (f === frame) return;
    frame = f; for (const b of bridges) pose(b, f);
    if (!hit && f >= bridges[0].connect) { hit = true; audio?.play?.('explosion', .35); }   // evt_bridge_hit
  });
  host.on('reset', reset);
}

// ---- Easter eggs, after zm_factory.gsc (BO3 source):
//   Fly Trap: shoot the control panel (GIANT_FLYTRAP) with a Pack-a-Punched gun; 9 s later three targets appear around
//   the map (GIANT_EE_*: a monkey bomber, a teddy bear with a Bowie knife, a teddy bear with Juggernog and an M1911);
//   shoot all three and the Annihilator spins at GIANT_PRIZE, free to each player who takes it. It's BO3's Annihilator
//   (2026-10-18): an operator weapon (mods/operator-weapons/annihilator.js), given fully charged and shown spinning
//   in the furnace as BO3's world model. Without the BO3 files (mods/bo3-weapons/weapons.json `operator.annihilator`)
//   the prize falls back to a Pack-a-Punched Python (BO1's magnum, the nearest thing).
//   Music: use the three spine jars (GIANT_JAR_<n>) for Beauty of Annihilation (Giant Remix), git-ignored
//   sounds/beauty-of-annihilation.ogg extracted from BO3's zm_factory sound bank.
// Models Greyhound didn't export (GIANT_EESUB_<model> slots) get BO1 stand-ins from the Mystery Box's display copies.
const STAND_IN = { zombie_monkey_bomber: 'zombie_cymbal_monkey', viewmodel_zombie_cymbal_monkey: 'zombie_cymbal_monkey', t6_wpn_pistol_m1911_world: 'm1911_zm' };
const PRIZE = 'python_zm', OPERATOR = 'annihilator', SONG = 'giant_beauty_of_annihilation';
// the Annihilator operator weapon, when its BO3 files are built (the operator mod fetches them at startup)
let ANNIHILATOR = null;
fetch(new URL('../bo3-weapons/weapons.json', import.meta.url)).then(r => r.ok ? r.json() : null).then(j => { ANNIHILATOR = j?.operator?.annihilator ?? null; }).catch(() => {});
function setupEggs(api) {
  const { world, session, host, toast, announce, audio, data } = api, box = () => api.mysteryBox ?? globalThis.kino?.mods?.api?.mysteryBox;
  const op = () => globalThis.kino?.operator, annihilator = () => op()?.defs?.has(OPERATOR) && ANNIHILATOR ? ANNIHILATOR : null;
  const root = world.root; if (!root) return;
  const node = name => root.getObjectByName(name), at = o => o.getWorldPosition(new THREE.Vector3());
  const flytrap = node('GIANT_FLYTRAP'), prizeAt = node('GIANT_PRIZE'), prizeUse = node('GIANT_PRIZE_USE');
  const targets = ['exp_monkey', 'bowie_bear', 'perk_bear'].map(id => ({ id, group: node('GIANT_EE_' + id) })).filter(t => t.group);
  const jars = [0, 1, 2].map(k => node('GIANT_JAR_' + k)).filter(Boolean);
  if (!flytrap || !prizeAt || targets.length < 3 || jars.length < 3) { console.warn('[the-giant] Easter egg markers missing (rebuild the map)'); return; }
  if (audio?.manifest) audio.manifest[SONG] ??= { url: 'mods/the-giant/sounds/beauty-of-annihilation.ogg' };

  // stand-ins for the unexported models (the box's models are loaded before mods run; retried once a frame until then)
  const juggBottle = node('wpn_t7_zmb_perk_bottle_jugg_world');
  let filled = false;
  const fill = () => {
    const mysteryBox = box(); if (filled || !mysteryBox?.models?.m1911_zm) return; filled = true;
    root.traverse(o => {
      const m = /^GIANT_EESUB_(.+?)(_\d+)?$/.exec(o.name); /* the glTF loader suffixes repeated names (_1) */ if (!m || o.children.length) return;
      let model = null;
      if (STAND_IN[m[1]]) model = mysteryBox.display(STAND_IN[m[1]]);
      else if (/perk_bottle_jugg/.test(m[1]) && juggBottle) model = juggBottle.clone();
      if (!model) return;
      model.traverse(c => { c.frustumCulled = true; });
      o.add(model); model.updateMatrixWorld(true); globalThis.kino?.lighting?.tag?.(model);   // the map root's matrices are frozen
    });
  };
  fill();
  const floaty = node('GIANT_FLOATY'), floatyHome = floaty ? floaty.children.map(c => c.position.clone()) : [];

  // ---- Fly Trap
  let stage = 'panel', showAt = 0, prize = null, taken = false;   // panel -> seek -> prize
  const shot = new Set();
  const mine = t => { t.giant = true; return t; };
  const disarm = () => { if (world.shootTargets) world.shootTargets = world.shootTargets.filter(t => !t.giant); };
  const armPanel = () => world.addShootTarget(mine({
    position: at(flytrap), radius: 30,
    hit() {
      if (stage !== 'panel') return;
      if (!session.weapon?.upgraded) { armPanel(); return; }   // only a Pack-a-Punched gun sets it off
      stage = 'seek'; showAt = session.time + 9;
      audio?.play?.('explosion', .4);
      announce?.('THE FLY TRAP', 'SOMETHING HAS BEEN SET LOOSE', 5);
    },
  }));
  const armTargets = () => {
    for (const t of targets) {
      t.group.visible = true;
      const box = new THREE.Box3().setFromObject(t.group), centre = box.getCenter(new THREE.Vector3());
      t.spot = centre;   // the group node itself sits at the map origin (only its children are placed)
      world.addShootTarget(mine({
        position: centre, radius: Math.max(12, box.getSize(new THREE.Vector3()).length() / 2),
        hit() {
          if (shot.has(t.id)) return;
          shot.add(t.id); t.group.visible = false; audio?.play?.('buy');
          if (shot.size < targets.length) { toast(`Fly Trap · ${shot.size} / ${targets.length}`, 4); return; }
          givePrize();
        },
      }));
    }
  };
  const givePrize = () => {
    stage = 'prize';
    const place = m => { prize = m; prize.position.copy(at(prizeAt)); scene().add(prize); globalThis.kino?.lighting?.tag?.(prize); };
    if (annihilator()) {   // BO3's world model (in centimetres), turned on its side like the prize in the furnace
      const url = annihilator().worldModel;
      loadModel(url).then(m => {
        if (stage !== 'prize' || !m) return;
        m.scale.setScalar(1 / 2.54); const g = new THREE.Group(); g.add(m);
        const b = new THREE.Box3().setFromObject(m); m.position.sub(b.getCenter(new THREE.Vector3()));
        m.traverse(o => { o.frustumCulled = false; }); fixAnnihilatorMaterials(m, THREE); place(g);
      }).catch(() => { const m = box()?.display?.(PRIZE); if (m && stage === 'prize') place(m); });
    } else { const m = box()?.display?.(PRIZE); if (m) place(m); }
    announce?.('THE FLY TRAP', 'A GIFT WAITS BY THE MULE KICK MACHINE', 6);
    host.emit?.('easterEgg', { name: 'fly trap' });
  };
  const scene = () => api.scene;
  const hasPrize = () => annihilator() ? op()?.current === OPERATOR && op().charge >= 1 && !op().active
    : session.inventory.some(w => w.id === PRIZE && w.upgraded && !w.lost);
  world.addInteraction({
    position: at(prizeUse ?? prizeAt),
    hidden: () => stage !== 'prize' || hasPrize(),
    text: () => annihilator() ? 'Take the Annihilator (operator weapon)' : 'Take the Annihilator (Pack-a-Punched Python)',
    use() {
      if (stage !== 'prize') return false;
      if (annihilator()) {   // into the operator slot, charged (a held Annihilator is refilled)
        if (op().active) op().putAway(); op().give(OPERATOR, { full: true }); globalThis.kino?.armory?.found?.(OPERATOR); audio?.play?.('buy');   // found: the Armory's unlock (mods/armory)
        toast('Reward: Annihilator · ' + (binds().operator ?? 'KeyY').replace(/^Key/, '') + ' to use', 5);
        taken = true; return true;
      }
      if (!data.weapons[PRIZE]) return false;
      session.giveWeapon(PRIZE);
      const w = session.inventory.find(x => x.id === PRIZE);
      if (w) { w.upgraded = true; w.mag = session.def.clipSize; w.reserve = session.def.maxAmmo; }
      api.equipView?.(); audio?.play?.('buy'); toast('Reward: ' + session.def.name, 5);
      taken = true; return true;
    },
  });

  // ---- music: the three spine jars
  const heard = new Set();
  jars.forEach((jar, k) => world.addInteraction({
    position: at(jar),
    hidden: () => heard.has(k),
    text: () => 'Listen to the specimen jar',
    use() {
      if (heard.has(k)) return false;
      heard.add(k); audio?.play?.('buy');
      if (heard.size < jars.length) { toast(`Specimen jar ${heard.size} / ${jars.length}`, 3); return true; }
      audio?.playMusic?.(SONG); announce?.('BEAUTY OF ANNIHILATION', 'MUSICAL EASTER EGG', 5);
      host.emit?.('easterEgg', { name: 'song' });
      return true;
    },
  }));

  // for the journal's markers: the targets still to shoot, then the prize until it's taken
  if (globalThis.kino) globalThis.kino.giantFlyTrap = () => {
    const done = stage === 'prize' && (taken || hasPrize());
    return { stage, done, targets: stage === 'seek' ? targets.filter(t => t.spot && !shot.has(t.id)).map(t => t.spot.clone()) : [],
      prize: stage === 'prize' && !done ? at(prizeUse ?? prizeAt) : null };
  };
  globalThis.kino?.scoreboard?.addCollectible?.({ id: 'giant-flytrap', label: 'Easter egg · Fly Trap',
    value: () => stage === 'panel' ? 'not started' : stage === 'seek' ? `${shot.size} / ${targets.length}` : 'done', done: () => stage === 'prize' });
  globalThis.kino?.scoreboard?.addCollectible?.({ id: 'giant-song', label: 'Easter egg · Song',
    value: () => `${heard.size} / ${jars.length}`, done: () => heard.size === jars.length });

  const reset = () => {
    disarm(); stage = 'panel'; showAt = 0; taken = false; shot.clear(); heard.clear();
    for (const t of targets) t.group.visible = false;
    prize?.removeFromParent(); prize = null;
    armPanel();
  };
  reset();
  let spin = 0;
  host.on('update', () => {
    fill();
    if (stage === 'seek' && showAt && session.time >= showAt) { showAt = 0; armTargets(); toast('Find what the Fly Trap set loose', 5); }
    spin = (spin + 1 / 60) % 1e4;
    if (prize) prize.rotation.y = spin * Math.PI / 2 % (Math.PI * 2);
    if (floaty) floaty.children.forEach((c, i) => { c.position.copy(floatyHome[i]); c.position.y += Math.sin(spin * 1.3 + i * 1.7) * 3; c.updateMatrix(); c.updateMatrixWorld(true); });
  });
  host.on('reset', reset);
}

// ---- the look: a snowy night. The engine's default lights (an even ambient + hemisphere + key + fill, tuned for Kino's
// interiors) are retuned every frame (the engine sets the ambient on power and reset). The lamps (GIANT_LAMP_<n> nodes:
// BO3's buzzing fixtures and lanterns) are baked into the map's light volume (mods/lighting/map-volume.js, made by
// .tools/bake-map-light.mjs: LAMP must match its table), which also darkens the ambient indoors and shadows the
// moonlight (2026-11-11, user: "lighting popping in and out", "proper and really nice looking lighting"): every lamp
// lights its room from any distance. ACCENTS point lights ride the nearest lamps on top for the highlights, faded out
// by distance before they move, so nothing pops. Without a bake (?noBake) the old pool of POOL lights follows the
// camera. The pool has a fixed size: changing the number of lights recompiles every shader. Lamps are dim until the
// power is on.
const POOL = 8, ACCENTS = 3, ACCENT = .3, LAMP = { color: 0xffc58a, on: 2200, off: 700, range: 650, decay: 1.4 };
// zm_factory's two debris piles (the Wnuen loading dock and the top of the warehouse stairs, 1000 each). The map file has
// nothing there and both passages stood open, so the doors are made here: a collision box each (measured through
// COL_world) and floating debris built from the map's own crates and rubble (fx/floating-debris.js). `from` is the
// building the pile is in: its spawn points and windows on the far side of the pile only wake once the pile is bought.
const DEBRIS = [
  { name: 'DEBRIS_wnuen_loading_dock', cost: 1000, zone: 'loadingdock', from: 'wnuenbuilding', min: [1043, 160, 935], max: [1067, 330, 1062], show: [[1043, 160, 938], [1067, 284, 1060]] },
  { name: 'DEBRIS_warehouse_second_floor', cost: 1000, zone: 'warehouseupper', from: 'warehousebuilding', min: [-496, 199, 1034], max: [-388, 415, 1058], show: [[-490, 199, 1034], [-390, 322, 1058]] },
];
const DEBRIS_PROPS = ['p7_crate_wood_01_short', 'p7_crate_wood_01', 'p7_debris_concrete_rubble_lg_03_no_metal', 'p7_debris_concrete_rubble_sm_10', 'p7_brick_dirty_breakout_06_wet', 'p7_sandbag_01', 'p7_box_wood_01_long',
  'p7_zm_der_plank_wood_2x12x96_dmg', 'p7_wood_plank_rustic01_2x16x48'];
function setupDebris(api) {
  const { world, session } = api;
  if (!world.doors || !world.root || /[?&]noDebris/.test(location.search)) return;
  const debris = floatingDebris(api, { models: DEBRIS_PROPS }), fronts = [...world.doors.values()];
  for (const d of DEBRIS) {
    const door = debrisDoor(api, d); if (!door) continue;
    debris.block(door, [new THREE.Box3(new THREE.Vector3(...d.show[0]), new THREE.Vector3(...d.show[1]))]);
    // a spawn point of the building that walks to the building's front door only once the pile is gone is past the pile:
    // it joins the pile's zone (points on their own navmesh island stay as they were)
    const front = fronts.find(x => x.zone === d.from)?.box?.getCenter(new THREE.Vector3()), mine = (world.barriers ?? []).filter(b => b.group === d.from);
    if (!front || !world.path || !session?.openDoors) continue;
    const walks = b => { const path = world.path(b.inside, front), last = path[path.length - 1]; return !!last && last.distanceTo(front) < 130; };
    const shut = mine.map(walks); session.openDoors.add(door.name); world.setDoors(session);
    const past = mine.filter((b, i) => !shut[i] && walks(b)); session.openDoors.delete(door.name); world.setDoors(session);
    if (past.length < mine.length) for (const b of past) b.group = d.zone;
    console.info('[the-giant] debris', d.name, '· spawn points past it:', past.length, 'of', mine.length);
  }
}

function setupLook(api) {
  const { scene, world, session, host, camera } = api;
  // the vats' water (one of them hides the Fly Trap's Bowie-knife bear) came out of the export as an opaque grey sheet:
  // see-through, tinted, and drawn after what's under it (user, 2026-10-18)
  world.root?.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) if (/t7_water_zm_der_vats/.test(m?.name ?? '')) {
    Object.assign(m, { transparent: true, opacity: .32, depthWrite: false, roughness: .12, metalness: 0 }); m.color?.setHex(0x7fb0aa); m.needsUpdate = true; o.renderOrder = 2; } });
  metalLook(world.root);
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const dirs = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  const [key, fill] = dirs;
  const lamps = []; world.root?.traverse(o => { if (/^GIANT_LAMP_/.test(o.name)) lamps.push(o.getWorldPosition(new THREE.Vector3())); });
  const pool = []; let baked = null;
  // The lights are made once the bake has (or hasn't) loaded, and setup() waits for that (2026-11-12): left on
  // host.pending it landed after the engine's "Optimizing the map" compile, so every map program was built there without
  // the bake and the lights, thrown away, and built again in the warm-up.
  const ready = loadMapLight(api, { skyFloor: .3, sunFloor: .1, strength: 1, powerOff: .3 }).catch(() => null).then(light => {
    baked = light;
    for (let i = 0; i < Math.min(light ? ACCENTS : POOL, lamps.length); i++) {
      const l = new THREE.PointLight(LAMP.color, 0, LAMP.range, LAMP.decay); l.position.set(0, -1e5, 0); scene.add(l); Object.assign(l.userData, { lamp: null, level: 0 }); pool.push(l);
    }
  });
  let last = performance.now(), timer = 0;
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    const power = !!session.power;
    if (ambient) { ambient.color.setHex(0x8b97ab); ambient.intensity = power ? .75 : .55; }
    if (hemi) { hemi.color.setHex(0xa3b3c9); hemi.groundColor.setHex(0x3a3129); hemi.intensity = .85; }
    if (key) { key.color.setHex(0xc9d5ff); key.intensity = baked ? 1.35 : 1.1; key.position.set(-.35, 1, .45); }   // (baked: the moon only lands where it reaches, so it can be stronger)
    if (fill) { fill.color.setHex(0x6a82a6); fill.intensity = .25; }
    const eye = camera.position;
    if ((timer -= dt) <= 0 && pool.length) {
      timer = .5;
      const near = new Set(lamps.map(p => ({ p, d: p.distanceToSquared(eye) })).sort((a, b) => a.d - b.d).slice(0, pool.length).map(n => n.p));
      // a light stays on its lamp while that is one of the nearest; a free one (or one that has faded out) takes the next
      const open = [...near].filter(p => !pool.some(l => l.userData.lamp === p));
      for (const l of pool) if (open.length && (!l.userData.lamp || (!near.has(l.userData.lamp) && l.userData.level < .02))) { l.userData.lamp = open.shift(); l.userData.level = 0; l.position.copy(l.userData.lamp); }
      for (const l of pool) l.userData.leaving = !!l.userData.lamp && !near.has(l.userData.lamp);
    }
    const want = power ? LAMP.on : LAMP.off;
    for (const l of pool) {
      // level 0..1: with the bake an accent also fades with its distance from the camera (gone by 900 units)
      const goal = !l.userData.lamp || l.userData.leaving ? 0 : baked ? Math.min(1, Math.max(0, 1.5 - l.position.distanceTo(eye) / 600)) : 1;
      l.userData.level += (goal - l.userData.level) * Math.min(1, dt * (goal < l.userData.level ? 5 : 2.5));
      l.intensity = want * (baked ? ACCENT : 1) * l.userData.level;
    }
  });
  return ready;
}
