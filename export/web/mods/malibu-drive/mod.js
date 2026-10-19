// Malibu Drive (ZK's World at War Avengers map, built by .tools/build_waw_map.py with .tools/waw_maps/nazi_zombie_malibu.json;
// see docs/fork/waw-ports.md). Does nothing on other maps.
//   Asgard: players start in the character room beside Asgard (initial_spawn_points) and take the Bifrost (TELEPORT_bifrost
//     at asgard_trig) down to the driveway. No zombies spawn while every player is up there, as _asgard.gsc's
//     all_players_in_asgard() holds the round.
//   Zones: dlc3_zone_init()'s add_adjacent_zone pairs. A bought door sets the enter_ flag of each zone its triggers open
//     (several triggers buy one door: door extras `zones`); a zone is active when its flag is set and a neighbour is active.
//   Station guns (_custom_weapon_spawns.gsc): every get_new_weapon station rolls one of seven guns (M14 twice) at the start
//     and again after each round; shown as a blue hologram of the gun.
//   Heroes (heroes.js) and Tony Stark's armors (tony.js) use the map's own weapons, models, animations and sounds:
//     .tools/waw_maps/malibu_assets.py writes them into the map folder (weapons.json, models/, anims/, sounds/; git-ignored).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';
import { createKit } from './common.js';
import { setupHeroes } from './heroes.js';
import { setupTony } from './tony.js';
import { setupPowers } from './powers.js';
import { setupQuests } from './quests.js';

// [zone, neighbour, flag zone] in the builder's compact ids (zone_ prefix and underscores dropped; zone_driveway1 is 'start')
const ADJ = [
  ['start', 'driveway2'], ['driveway2', 'driveway3'], ['driveway3', 'tonymain'], ['driveway3', 'tonybasement'],
  ['tonybedroom', 'tonybeachstaircase'], ['tonybedroom', 'glass'], ['glass', 'tonymain'], ['tonymain', 'tonybasement'],
  ['tonybeachstaircase', 'tonybeach'], ['start', 'country'], ['country', 'helizone'], ['helizone', 'helizone2'],
  ['country', 'tunnel'], ['tunnel', 'city1'], ...['cargarage', 'city2', 'ashton', 'gasstation', 'theater', 'office', 'hotel', 'chicken', 'office2', 'police'].map(z => ['city1', z]),
];
// door flags whose zone has another name in the adjacency list (door5 sets enter_zone_tony_beach_stairs, which nothing
// reads in the original; here it opens the staircase, or its spawners would never run)
const ALIAS = { tonybeachstairs: 'tonybeachstaircase' };
// zones the original starts with besides the driveway: the helicarrier and the Cheese Cube, reached by their own events
const ALWAYS = ['start', 'helizone', 'ccube'];
// get_new_weapon's roll: Famas, AK, Galil, MP5K, M14 (two of seven), SPAS-12
const STATION = ['famas_zm', 'ak74u_zm', 'galil_zm', 'mp5k_zm', 'm14_zm', 'm14_zm', 'spas_zm'];
const inLobby = p => p.x < -12500 && p.y < 8500;   // Asgard and the character room float below the city's west end

// the map's weapons that are a hero's own gear (taken away when you change hero)
const HERO_GEAR = ['tony_phone', 'widow_pistols', 'widow_pistols_upgraded', 'spiderman', 'thor_hammer', 'cap_shield', 'hawkeye_bow1', 'hawkeye_bow2',
  'hawkeye_bow3', 'hulk_hands', 'mean_juice', 'scarlet_witch'];
// armor weapons: suit power each shot costs (the suits' jarvis_power_shot: a rocket 3, the rest 1; the minigun and handgun
// drain while firing)
const SUIT_POWER = { mk3_repulsor: 1, heavy_repulsor: 2, mk3_rocket: 3, mk1_rocket: 4, mk6_rocket: 3, mk42_flare: 2, mk1_flamethrower: .5, wm_minigun: .2,
  wm_handgun: .2, mk16_cloaking: 0, mk33_blades: 0, mk5_suitcase: 0 };
// weapon fireSound -> the iwd sound (sounds/<name>.ogg)
const FIRE = { repulsor_fire_plr: 'repulsor_fire', missle_fire_plr: 'missile_fire', wm_minigun_fire_plr: 'minigun_fire', wm_handgun_fire_plr: 'handgun_fire',
  thor_hammer_fire_npc: 'thor_hammer_fire', bow_fire_plr: 'bow_fire' };

export default async function setup(api) {
  if (api.map?.id !== 'malibu-drive') return;
  const { world, session, host, player, scene, data } = api;
  const kit = await createKit(api);

  // ---- the map's weapons (weapons.json from the asset build), as malibu_<name>
  const defs = await fetch(kit.dir + 'weapons.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  if (!Object.keys(defs).length) console.warn('[malibu-drive] weapons.json missing: run .tools/waw_maps/malibu_assets.py');
  const arms = data.characters?.viewmodel_usa_pow_arms ?? data.characters?.viewhands_usmc;
  for (const [id, d] of Object.entries(defs)) {
    if (HERO_GEAR.includes(d.mapWeapon)) d.malibuHero = true;
    if (d.mapWeapon in SUIT_POWER) { d.suitWeapon = true; d.suitPower = SUIT_POWER[d.mapWeapon]; }
    // the arms: WaW's SetViewmodel overrides a weapon's own (isHandModelOverridable), so the hero's or armor's arms show;
    // without one, the placeholders ("no model", cloth) fall back to this game's arms
    const placeholder = /viewmodel_hands_(no_model|cloth)\.glb$/.test(d.handsModel ?? '') || !d.handsModel;
    d.malibuArms = placeholder ? arms : d.handsModel; d.handsModel = d.malibuArms;
    if (FIRE[d.fireSound]) d.malibuSound = FIRE[d.fireSound];
    d.camo = null;
    // the map's plain guns fire with this game's sounds for the nearest gun
    d.soundsFrom = { malibu_cheese_gun: 'mp5k_zm', widow_pistols: 'cz75_zm', widow_pistols_upgraded: 'cz75_zm', colt: 'cz75_zm' }[d.mapWeapon];
    data.weapons[id] = d;
  }
  // their fire sounds (the map's), in place of the engine's lookup by weapon id
  if (api.audio?.weapon) { const play = api.audio.weapon.bind(api.audio); api.audio.weapon = (kind, def, ...rest) => { if (def?.mapWeapon) { if (def.soundsFrom && data.weapons[def.soundsFrom]) return play(kind, data.weapons[def.soundsFrom], ...rest); if (kind === 'shot' && def.malibuSound) kit.sound(def.malibuSound, { volume: .6 }); return; } return play(kind, def, ...rest); }; }

  const heroes = setupHeroes(kit);
  const tony = setupTony(kit, heroes);
  const powers = setupPowers(kit, heroes, tony);
  const quests = setupQuests(kit, heroes, tony, powers);
  // powers, not guns: the phone, the serum, the Hulk's fists, Scarlet's hex, the blades and the cloak never run dry or reload
  const NO_AMMO = ['tony_phone', 'mean_juice', 'hulk_hands', 'scarlet_witch', 'mk33_blades', 'mk16_cloaking'].map(n => 'malibu_' + n);
  host.on('update', () => { const w = session.weapon, d = session.def; if (w && d && NO_AMMO.includes(d.id) && w.mag < d.clipSize) { w.mag = d.clipSize; session.cancelReload?.(); } });

  // ---- zones ----
  const opened = () => {
    const flags = new Set();
    for (const d of world.doors.values()) {
      if (!world.isOpen(d, session)) continue;
      for (const z of d.parts[0]?.object?.userData?.zones ?? [d.zone]) flags.add(ALIAS[z] ?? z);
    }
    for (const f of session.flags) if (f.startsWith('zone:')) flags.add(f.slice(5));
    return flags;
  };
  world.activeZones = s => {
    const flags = opened(), zones = new Set(ALWAYS);
    for (let grew = true; grew;) {
      grew = false;
      for (const [a, b] of ADJ) for (const [x, y] of [[a, b], [b, a]]) if (zones.has(x) && !zones.has(y) && flags.has(y)) { zones.add(y); grew = true; }
    }
    return zones;
  };

  // ---- Asgard: no spawns while everyone is up there ----
  const spawnBarriers = world.spawnBarriers.bind(world);
  const lobby = () => inLobby(player.getFeetPosition()) && !(api.coop?.peers?.() ?? []).some(p => p.position && !inLobby(p.position));
  world.spawnBarriers = s => lobby() ? [] : spawnBarriers(s);

  // ---- Asgard's sky: the lobby floats below the city, whose underside filled its sky; a starry ceiling under the city
  // (facing down only, so from the city it isn't there)
  {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    const grd = g.createRadialGradient(256, 256, 20, 256, 256, 360); grd.addColorStop(0, '#2a2f6b'); grd.addColorStop(1, '#05060f'); g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .9})`; g.fillRect(Math.random() * 512, Math.random() * 512, Math.random() < .1 ? 2 : 1, Math.random() < .1 ? 2 : 1); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    sky.rotation.x = Math.PI / 2; sky.position.set(-16500, 9600, -4400); sky.name = 'malibu_asgard_sky'; scene.add(sky);
  }
  // the Bifrost: its sound and a flash when you arrive on Earth
  let wasLobby = true;
  host.on('update', () => { const l = inLobby(player.getFeetPosition()); if (wasLobby && !l && session.phase !== 'gameover') { kit.sound('bifrost_tele', { volume: .7 }); kit.flash(.8); } wasLobby = l; });
  // the map's round change sound
  host.on('roundEnd', () => kit.sound('round_change', { volume: .5 }));

  // ---- station guns ----
  const stations = world.interactions.filter(e => e.kind === 'wallbuy' && e.position && STATION.includes(e.weapon));
  const holo = new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending });
  // the wall model CustomWorld placed at each station (same position), replaced by the rolled gun's hologram
  for (const st of stations) {
    st.model = scene.children.find(o => o.position.distanceTo(st.position) < .5 && o !== world.root) ?? null;
    st.yaw = st.model?.rotation.y ?? 0;
  }
  let rollId = 0;
  const roll = async () => {
    const id = ++rollId;
    await Promise.all(stations.map(async st => {
      const weapon = STATION[Math.floor(session.random() * STATION.length)];
      st.weapon = weapon;
      const o = await loadModel(data.weapons[weapon]?.worldModel).catch(() => null);
      if (id !== rollId || !o) return;
      if (st.model) scene.remove(st.model);
      o.position.copy(st.position); o.rotation.y = st.yaw;
      for (const tag of data.weapons[weapon].hideTags ?? []) { const bone = o.getObjectByName(tag); if (bone) bone.scale.setScalar(1e-6); }
      o.traverse(c => { if (c.isMesh) { c.material = holo; c.frustumCulled = false; } });
      o.name = 'malibu_station_gun'; scene.add(o); st.model = o;
    }));
  };
  roll();
  host.on('roundEnd', () => roll());
  host.on('reset', () => roll());

  window.kino ??= {};
  window.kino.malibu = { zones: () => [...world.activeZones(session)], flags: () => [...opened()], inLobby: () => lobby(), stations: () => stations.map(s => s.weapon), roll, kit, heroes, tony, powers, quests };
}
