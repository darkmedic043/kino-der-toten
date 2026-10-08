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
}
