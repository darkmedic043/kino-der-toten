// The Giant (a BO3 map ported by .tools/build_bo3_map.py; see docs/fork/waw-ports.md): Der Riese's teleporter linking,
// written against the custom-map hooks (world.addInteraction, locked teleporters, scripted doors, world.papLocked).
// The build leaves empty nodes at each pad's lever (GIANT_LEVER_pad<n>) and at the mainframe's link switch
// (GIANT_CORE), locked TELEPORT_pad<n> markers and a scripted DOOR_pap_0 (the mainframe door). Does nothing elsewhere.
//   with the power on, pull a pad's lever, then use the mainframe switch within 30 s: the pad is linked (its
//   teleporter works from then on). All three linked: the mainframe door rises and Pack-a-Punch opens.
import * as THREE from 'three';

const LINK_TIME = 30, WHERE = { pad0: 'east', pad1: 'south', pad2: 'west' };
export default function setup(api) {
  if (api.map?.id !== 'the-giant') return;
  const { world, session, host, toast, announce, audio } = api;
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
  setupLook(api);
}

// ---- the look: a snowy night. The engine's default lights (an even ambient + hemisphere + key + fill, tuned for Kino's
// interiors) are retuned every frame (the engine sets the ambient on power and reset), and a pool of POOL warm point
// lights follows the lamps nearest the camera (GIANT_LAMP_<n> nodes: BO3's buzzing fixtures and lanterns). The pool
// has a fixed size: changing the number of lights recompiles every shader. Lamps are dim until the power is on.
const POOL = 8, LAMP = { color: 0xffc58a, on: 2200, off: 700, range: 650, decay: 1.4 };
function setupLook({ scene, world, session, host, camera }) {
  const kids = scene.children;
  const ambient = kids.find(o => o.isAmbientLight), hemi = kids.find(o => o.isHemisphereLight);
  const dirs = kids.filter(o => o.isDirectionalLight && !o.castShadow).sort((a, b) => b.intensity - a.intensity);
  const [key, fill] = dirs;
  const lamps = []; world.root?.traverse(o => { if (/^GIANT_LAMP_/.test(o.name)) lamps.push(o.getWorldPosition(new THREE.Vector3())); });
  const pool = Array.from({ length: Math.min(POOL, lamps.length) }, () => {
    const l = new THREE.PointLight(LAMP.color, 0, LAMP.range, LAMP.decay); l.position.set(0, -1e5, 0); scene.add(l); l.userData.want = 0; return l;
  });
  let last = performance.now(), timer = 0;
  host.on('update', () => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    const power = !!session.power;
    if (ambient) { ambient.color.setHex(0x8b97ab); ambient.intensity = power ? .75 : .55; }
    if (hemi) { hemi.color.setHex(0xa3b3c9); hemi.groundColor.setHex(0x3a3129); hemi.intensity = .85; }
    if (key) { key.color.setHex(0xc9d5ff); key.intensity = 1.1; key.position.set(-.35, 1, .45); }
    if (fill) { fill.color.setHex(0x6a82a6); fill.intensity = .25; }
    if ((timer -= dt) <= 0 && pool.length) {
      timer = .5;
      const eye = camera.position, near = lamps.map(p => ({ p, d: p.distanceToSquared(eye) })).sort((a, b) => a.d - b.d).slice(0, pool.length);
      // keep lights on lamps still in the set; move the rest (they fade in where they land)
      const free = pool.filter(l => !near.some(n => n.p.equals(l.position)));
      for (const n of near) if (!pool.some(l => l.position.equals(n.p))) { const l = free.shift(); if (l) { l.position.copy(n.p); l.intensity = 0; } }
    }
    const want = power ? LAMP.on : LAMP.off;
    for (const l of pool) l.intensity += (want - l.intensity) * Math.min(1, dt * 2.5);
  });
}
