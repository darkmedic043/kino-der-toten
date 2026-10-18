// Malibu Drive (ZK's World at War Avengers map, built by .tools/build_waw_map.py with .tools/waw_maps/nazi_zombie_malibu.json;
// see docs/fork/waw-ports.md). Does nothing on other maps.
//   Asgard: players start in the character room beside Asgard (initial_spawn_points) and take the Bifrost (TELEPORT_bifrost
//     at asgard_trig) down to the driveway. No zombies spawn while every player is up there, as _asgard.gsc's
//     all_players_in_asgard() holds the round.
//   Zones: dlc3_zone_init()'s add_adjacent_zone pairs. A bought door sets the enter_ flag of each zone its triggers open
//     (several triggers buy one door: door extras `zones`); a zone is active when its flag is set and a neighbour is active.
//   Station guns (_custom_weapon_spawns.gsc): every get_new_weapon station rolls one of seven guns (M14 twice) at the start
//     and again after each round; shown as a blue hologram of the gun.
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

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

export default function setup(api) {
  if (api.map?.id !== 'malibu-drive') return;
  const { world, session, host, player, scene, data } = api;

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
  window.kino.malibu = { zones: () => [...world.activeZones(session)], flags: () => [...opened()], inLobby: () => lobby(), stations: () => stations.map(s => s.weapon), roll };
}
