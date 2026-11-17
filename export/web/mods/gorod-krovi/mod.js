// Gorod Krovi (BO3 zm_stalingrad port, .tools/build_bo3_map.py). Zones as Der Eisendrache's: BO3's zone manager links
// pairs of zones by a flag (zm_stalingrad_zones.gsc add_adjacent_zone) and some flags set others (add_zone_flags). The
// build gives every door and debris pile its whole flag as its zone (dept_to_yellow -> depttoyellow), every spawner its
// BO3 zone without underscores (yellow_A -> yellowa; the three start zones are "start"); world.activeZones is replaced
// here: an open door sets its flag, the power sets power_on, and both zones of every pair whose flag is set are active.
// Pavlov's House (Pack-a-Punch) is reached by the dragon roosts (500) once the ride is crafted (pods.js: drop pods give
// its three parts) and left by its sewer; Pavlov's three zones turn on together once a player has landed there (the roost
// teleporters' destination sets zone:pavlovsb).
import { setupLook, prepareLook } from './look.js';

// sharper textures: the map's detail.json (map-detail.js), read before the map loads
export async function prepare(data) {
  await prepareLook();
  if (new URLSearchParams(location.search).get('map') === 'gorod-krovi' && data.weapons?.bo3_raygun_mk3) data.boxPool = [...new Set([...(data.boxPool ?? []), 'bo3_raygun_mk3'])];   // the Ray Gun Mk3: this map's box only (built noBox; bo3-weapons loads first)
  return data;
}
const ADJ = [["departmentstore","start","departmentstoreopen"],["departmentstorefloor2a","start","departmentstoreopen"],["departmentstore","departmentstorefloor2a","departmentstoreopen"],["departmentstore","departmentstorefloor2b","departmentstoreopen"],["departmentstorefloor2a","departmentstorefloor2b","departmentstoreopen"],["departmentstorefloor2a","departmentstorefloor3a","departmentstore2fto3f"],["departmentstorefloor2a","departmentstorefloor3b","departmentstore2fto3f"],["alleyb","departmentstorefloor2a","alleytodepartmentstoreopen"],["departmentstorefloor2b","departmentstorefloor3a","departmentstore2fto3f"],["departmentstorefloor2b","departmentstorefloor3b","departmentstore2fto3f"],["alleyb","departmentstorefloor2b","alleytodepartmentstoreopen"],["departmentstorefloor3a","departmentstorefloor3b","departmentstoreupperopen"],["departmentstorefloor3a","departmentstorefloor3c","departmentstoreupperopen"],["departmentstorefloor3a","redbrickc","departmentfloor3toredbrickopen"],["departmentstorefloor3b","departmentstorefloor3c","departmentstoreupperopen"],["departmentstorefloor3b","redbrickc","departmentfloor3toredbrickopen"],["departmentstorefloor2a","departmentstorefloor3c","departmentstore2fto3f"],["departmentstorefloor2b","departmentstorefloor3c","departmentstore2fto3f"],["departmentstorefloor3c","yellowc","depttoyellow"],["redbricka","redbrickb","activateredbrick"],["redbricka","redbrickc","activateredbrick"],["poweredbridgea","redbricka","activateredbrick"],["bunker","redbricka","redbricktobunkeropen"],["factorystreetb","redbricka","redbricktofactorystreetopen"],["judicialstreet","redbricka","redbricktojudicialstreetopen"],["redbrickb","redbrickc","activateredbrick"],["poweredbridgea","redbrickb","activateredbrick"],["factoryarm","redbrickb","poweron"],["factoryb","redbrickb","factoryopen"],["poweredbridgea","redbrickc","activateredbrick"],["yellowa","yellowb","activateyellow"],["librarystreeta","yellowa","librarystreettoyellowopen"],["librarystreetb","yellowa","librarystreettoyellowopen"],["yellowb","yellowc","activateyellow"],["librarystreeta","yellowb","librarystreettoyellowopen"],["judicialstreetb","yellowb","yellowtojudicialstreetopen"],["bunker","yellowb","yellowtobunkeropen"],["yellowc","yellowd","activateyellow"],["librarystreetc","yellowc","poweron"],["poweredbridgeb","yellowd","activateyellow"],["yellowc","yellowd","poweron"],["librarystreetc","yellowd","poweron"],["libraryb","yellowd","libraryopen"],["judiciala","judicialb","activatejudicial"],["judiciala","judicialstreet","activatejudicial"],["judiciala","judicialstreetb","activatejudicial"],["judicialb","judicialstreet","activatejudicial"],["judicialstreet","judicialstreetb","activatejudicial"],["judicialstreet","redbrickb","redbricktojudicialstreetopen"],["judicialstreet","yellowb","yellowtojudicialstreetopen"],["judicialstreetb","redbricka","redbricktojudicialstreetopen"],["alleya","alleyb","activatebunker"],["alleya","bunker","activatebunker"],["alleya","departmentstorefloor2b","alleytodepartmentstoreopen"],["alleyb","bunker","activatebunker"],["poweredbridgea","poweredbridgeb","activatebridge"],["poweredbridge","poweredbridgea","activatebridge"],["poweredbridgeb","yellowc","activateyellow"],["librarystreetc","poweredbridgeb","poweron"],["poweredbridge","poweredbridgeb","activatebridge"],["poweredbridge","yellowd","activatebridge"],["poweredbridge","redbrickc","activatebridge"],["librarystreeta","librarystreetb","activatelibrarystreet"],["librarystreeta","yellowa","activatelibrarystreet"],["librarystreeta","librarystreetc","librarystreetdropdownopen"],["librarya","librarystreeta","libraryopen"],["librarystreetb","librarystreetc","librarystreetdropdownopen"],["librarya","librarystreetb","libraryopen"],["libraryb","librarystreetb","libraryopen"],["libraryb","librarystreetc","libraryopen"],["librarya","libraryb","libraryopen"],["factorya","factorystreeta","factoryopen"],["factorya","factorystreetb","factoryopen"],["factorya","factoryb","factoryopen"],["factorya","factoryc","factoryopen"],["factorya","factoryarm","factoryopen"],["factoryb","factoryc","factoryopen"],["factoryarm","factoryb","factoryopen"],["factoryb","factorystreeta","factoryopen"],["factoryarm","factoryc","factoryopen"],["factoryc","factorystreeta","factoryopen"],["factoryarm","factorystreetb","factorybridgedropdownopen"],["factorystreeta","factorystreetb","redbricktofactorystreetopen"],["factorystreeta","redbricka","redbricktofactorystreetopen"],["factoryarm","factorystreeta","factorybridgedropdownopen"],["pavlovsa","pavlovsb","dragonridecrafted"],["pavlovsb","pavlovsc","dragonridecrafted"]];
const DERIVED = {"departmentstoreupperopen":["departmentstore2fto3f","depttoyellow","departmentfloor3toredbrickopen"],"activateyellow":["yellowtojudicialstreetopen","redbricktojudicialstreetopen","depttoyellow","yellowtobunkeropen","activatebridge"],"activateredbrick":["departmentfloor3toredbrickopen","redbricktojudicialstreetopen","yellowtojudicialstreetopen","redbricktobunkeropen","activatebridge"],"activatejudicial":["redbricktojudicialstreetopen","yellowtojudicialstreetopen"],"activatelibrarystreet":["librarystreettoyellowopen"],"activatebunker":["alleytodepartmentstoreopen","redbricktobunkeropen","yellowtobunkeropen"]};
const ALWAYS = ['alwayson'];

export default async function setup(api) {
  if (api.map?.id !== 'gorod-krovi') return;
  const { world, session } = api;
  const flags = s => {
    const f = new Set(ALWAYS);
    for (const d of world.doors.values()) if (d.zone && world.isOpen(d, s)) f.add(d.zone);
    if (s.power) f.add('poweron');
    for (const x of s.flags) if (x.startsWith('gorod:flag:')) f.add(x.slice(11));   // set by later scripts (activate_bridge)
    for (let k = 0; k < 2; k++) for (const [g, from] of Object.entries(DERIVED)) if (from.some(x => f.has(x))) f.add(g);   // twice: activate_bridge feeds two others
    return f;
  };
  world.activeZones = s => {
    const f = flags(s), zones = new Set(['start']);
    for (const [a, b, flag] of ADJ) if (f.has(flag)) { zones.add(a); zones.add(b); }
    for (const x of s.flags) if (x.startsWith('zone:')) zones.add(x.slice(5));
    if (zones.has('pavlovsb')) { zones.add('pavlovsa'); zones.add('pavlovsc'); }
    return zones;
  };
  const look = setupLook(api);   // sky, lights, bake, detail, metals, overlays (look.js): awaited before the engine batches the map and compiles
  // The map's systems (2026-11-15), one module each in this folder, each `export default async function (api, gk)`,
  // awaited here so their models and materials are in place before the engine's warm-up. A module that isn't there
  // yet is skipped. gk: the zone flags (a script flag is session.flags 'gorod:flag:<name>'; clearFlag takes one back,
  // e.g. activate_bridge once the bridge lifts), the look, and a small event hub between the systems.
  const hub = new Map();
  const gk = {
    flags: () => flags(session), setFlag: f => session.flags.add('gorod:flag:' + f), clearFlag: f => session.flags.delete('gorod:flag:' + f),
    hasFlag: f => flags(session).has(f), look,
    on: (e, fn) => { if (!hub.has(e)) hub.set(e, new Set()); hub.get(e).add(fn); return () => hub.get(e).delete(fn); },
    emit: (e, ...a) => { for (const fn of hub.get(e) ?? []) try { fn(...a); } catch (err) { console.error('[gorod-krovi] ' + e, err); } },
  };
  window.kino ??= {}; window.kino.gorod = { flags: () => [...flags(session)], zones: () => [...world.activeZones(session)], gk };
  await look.ready;
  await Promise.all(PARTS.map(async n => {
    let m; try { m = await import(`./${n}.js`); } catch (e) { if (!/dynamically imported|Failed to fetch|404/.test(e.message)) console.error(`[gorod-krovi] ${n}.js`, e); return; }
    const t = performance.now();
    try { await m.default?.(api, gk); } catch (e) { console.error(`[gorod-krovi] ${n}.js setup`, e); }
    if (performance.now() - t > 250) console.info(`[gorod-krovi] ${n} setup ${Math.round(performance.now() - t)} ms`);
  }));
  gk.emit('parts:ready');   // every part is set up (challenges.js redraws then: its draw needs gk.pods etc.)
}
// zombies (models, anims, spawns), sounds (ambience, emitters), bridge (powered drawbridge), dragon (roosts, the ride,
// the map dragon), pap (Pavlov's lockdown), bosses (Mangler, Valkyrie drones, the mech), gauntlet, shield, widows,
// sophia (the S.O.P.H.I.A. computer, her eye, the tape reels), scenes (BO3's scene-bundle props and the dragon hazards),
// dogfight (the planes overhead), sewer (the ride out of Pavlov's)
const PARTS = ['zombies', 'sounds', 'bridge', 'dragon', 'pap', 'bosses', 'gauntlet', 'shield', 'widows', 'sophia', 'scenes', 'dogfight', 'sewer', 'traps', 'debris', 'pods', 'strike', 'mg', 'challenges', 'eggs', 'wearables', 'ee'];
