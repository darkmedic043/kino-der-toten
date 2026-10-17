// Der Eisendrache's craftables (zm_castle_craftables.gsc) and the rocket shield. Parts are the builder's
// CASTLE_PART_<craftable>_<part>_<k> models (every candidate spot, hidden); benches CASTLE_BENCH_spike (the undercroft
// table) and CASTLE_BENCH_open_<k> (the three open workbenches); the shield's recharges CASTLE_SHIELDCHARGE_<k>.
//   Ragnarok DG-4 (gravityspike): built at its own table, then taken as the operator weapon (mods/operator-weapons),
//   charged. Its parts come as in BO3:
//     body   - dropped where the first Panzersoldat dies (zm_castle_mechz.gsc notifies its death origin)
//     handle - falls from the Tesla coils when the Death Ray has finished a run (one of its two spots, onto the floor)
//     guards - during a rocket test fire, the wall switch at the rocket pad (spike_quest_wall_switch) arms the
//              console at the landing pad (spike_quest_console_switch, where BO3 lights its lamps one by one) for
//              20 s; its lever drops the guards beside it
//   Rocket shield: three parts, one random spot each (the eagle, the window, the fuel tank); built at any open bench,
//   taken there again for free if it breaks.
// The shield itself (raise, bash, rocket dash, health, HUD) is mods/operator-weapons/rocket-shield.js
// (window.kino.rocketShield), shared with the Armory, which sells it on other maps; the castle's nitrous tanks give its
// charges back. Taking the Ragnarok or the shield here marks it found for the Armory's unlock (mods/armory).
import * as THREE from 'three';
const CRAFT = {
  spike: { name: 'Ragnarok DG-4', parts: ['body', 'guards', 'handle'], label: { body: 'the spikes', guards: 'the guards', handle: 'the handle' } },
  shield: { name: 'Rocket Shield', parts: ['dolly', 'clamp', 'door'], label: { dolly: 'the eagle', clamp: 'the window', door: 'the fuel tank' } },
};

export function setupCraftables(api, { traps }) {
  const { world, session, host, player, camera, enemies, audio, toast, announce, data, viewScene, view, sync } = api;
  const root = world.root, kino = window.kino;
  const at = o => o.getWorldPosition(new THREE.Vector3());
  // a map node moved or shown at runtime (the static map's matrices are frozen: update them by hand)
  const moveTo = (o, p) => { o.parent.updateMatrixWorld(true); o.position.copy(o.parent.worldToLocal(p.clone())); o.updateMatrixWorld(true); };
  const spots = {}; root.traverse(o => { const m = /^CASTLE_PART_(spike|shield)_([a-z]+)_(\d+)$/.exec(o.name); if (m) (spots[m[1] + ':' + m[2]] ??= []).push(o); });
  const places = new Map(), homes = new Map(); for (const list of Object.values(spots)) for (const o of list) homes.set(o, o.position.clone());
  const benchSpike = root.getObjectByName('CASTLE_BENCH_spike'), benches = []; root.traverse(o => { if (/^CASTLE_BENCH_open_\d+$/.test(o.name)) benches.push(o); });
  const charges = []; root.traverse(o => { if (/^CASTLE_SHIELDCHARGE_\d+$/.test(o.name)) charges.push(o); });
  if (!benchSpike && !benches.length) { console.warn('[der-eisendrache] craftables missing (rebuild the map)'); return null; }
  const shield = kino.rocketShield; shield?.setTanks(charges, 'Build bench: take another');
  const takeShield = () => { shield?.give(); kino.armory?.found('rocket_shield'); };

  const st = { have: { spike: new Set(), shield: new Set() }, built: { spike: false, shield: null }, shown: new Map(), firstPanzer: false, armed: 0, rayWas: false };
  function show(cr, part, o, p) {   // a part lies at `o` (moved to `p` if given) for the taking
    for (const x of spots[cr + ':' + part] ?? []) x.visible = false;
    if (p) moveTo(o, p); places.get(o)?.copy(at(o)); o.visible = true; o.updateMatrixWorld(true); st.shown.set(cr + ':' + part, o);
  }
  function reset() {
    for (const [o, h] of homes) { o.visible = false; o.position.copy(h); o.updateMatrixWorld(true); places.get(o)?.copy(at(o)); }
    st.have.spike.clear(); st.have.shield.clear(); st.built.spike = false; st.built.shield = null; st.shown.clear(); st.firstPanzer = false; st.armed = 0;
    if (sync.isHost) { const pick = {}; for (const part of CRAFT.shield.parts) { const n = spots['shield:' + part]?.length ?? 0; if (n) pick[part] = Math.floor(Math.random() * n); } sync.act('craftSpots', pick); }   // the host picks the shield parts' spots
  }
  // ---- the team's events ---------------------------------------------------------------------------------------------
  sync.on('craftSpots', d => { for (const [part, k] of Object.entries(d)) { const o = spots['shield:' + part]?.[k]; if (o) show('shield', part, o); } });
  sync.on('partPick', (d, ctx) => { const o = st.shown.get(d.key); if (!o) return; const [cr, part] = d.key.split(':'); o.visible = false; st.shown.delete(d.key); st.have[cr].add(part); if (ctx.mine) audio?.play?.('buy', .5); toast?.(`${CRAFT[cr].name} part · ${st.have[cr].size}/${CRAFT[cr].parts.length}`, 2.5); });
  sync.on('partDrop', d => { const o = spots[d.key]?.[d.k]; if (!o || st.shown.has(d.key)) return; const [cr, part] = d.key.split(':'); show(cr, part, o, d.p ? sync.v(d.p) : null); if (d.msg) toast?.(d.msg, 3); });
  sync.on('build', (d, ctx) => {
    if (d.cr === 'spike') { if (st.built.spike) return; st.built.spike = true; announce?.('RAGNAROK DG-4', 'BUILT', 2.5); }
    else { if (st.built.shield) return; st.built.shield = benches[d.bench] ?? null; announce?.('ROCKET SHIELD', 'BUILT', 2.5); }
    if (ctx.mine) audio?.play?.('buy', .7);
  });
  sync.on('guardsArm', () => { st.armed = session.time + 20; lever(wallSwitch, true); lever(consoleSwitch, false); toast?.('The console by the landing pad lit up · 20 s', 3); });
  sync.on('guardsOpen', () => { if (!(st.armed > session.time)) return; st.armed = 0; lever(consoleSwitch, true); lever(wallSwitch, false); const o = spots['spike:guards']?.[0]; if (o) show('spike', 'guards', o); toast?.('A panel opened beside the console', 3); });

  // ---- picking parts up and building -----------------------------------------------------------------------------
  for (const [key, list] of Object.entries(spots)) for (const o of list) {
    const [cr, part] = key.split(':');
    const pos = at(o); places.set(o, pos);   // moved with the part (show)
    world.addInteraction({
      position: pos, hidden: () => !(o.visible && st.shown.get(key) === o),
      text: () => `Pick up ${CRAFT[cr].label[part]}`,
      use() {
        if (!o.visible || st.shown.get(key) !== o) return false;
        sync.act('partPick', { key }); return true;
      },
    });
  }
  if (benchSpike) world.addInteraction({
    position: at(benchSpike),
    text: () => st.built.spike ? (kino.operator?.current === 'ragnarok' ? '' : 'Take the Ragnarok DG-4')
      : st.have.spike.size === 3 ? 'Build the Ragnarok DG-4' : `Ragnarok DG-4 · ${st.have.spike.size}/3 parts`,
    use() {
      if (!st.built.spike) { if (st.have.spike.size < 3) return false; sync.act('build', { cr: 'spike' }); return true; }
      if (kino.operator?.current === 'ragnarok' || !kino.operator) return false;
      kino.operator.give('ragnarok', { full: true }); kino.armory?.found('ragnarok'); return true;
    },
  });
  for (const b of benches) world.addInteraction({
    position: at(b),
    text: () => st.built.shield ? (st.built.shield === b && !shield?.owned ? 'Take the Rocket Shield' : '')
      : st.have.shield.size === 3 ? 'Build the Rocket Shield' : `Rocket Shield · ${st.have.shield.size}/3 parts`,
    use() {
      if (!st.built.shield) { if (st.have.shield.size < 3) return false; sync.act('build', { cr: 'shield', bench: benches.indexOf(b) }); return true; }
      if (st.built.shield !== b || shield?.owned) return false;
      takeShield(); return true;
    },
  });

  // ---- where the Ragnarok's parts come from -----------------------------------------------------------------------
  host.on('kill', ({ enemy }) => {   // body: the first Panzersoldat to die drops it (the host's kills)
    if (!sync.isHost || enemy?.kind !== 'panzer' || st.firstPanzer || st.built.spike || st.have.spike.has('body')) return;
    st.firstPanzer = true; if (!spots['spike:body']?.[0]) return;
    const p = enemy.root.position.clone(); const q = world.closest?.(p, { x: 80, y: 160, z: 80 }) ?? p;
    sync.act('partDrop', { key: 'spike:body', k: 0, p: sync.a(q.clone().add(new THREE.Vector3(0, 6, 0))), msg: 'The Panzersoldat dropped something' });
  });
  const down = new THREE.Vector3(0, -1, 0);
  function handleDrop() {   // handle: falls from one of the coils onto the floor below (the host picks which)
    const list = spots['spike:handle'] ?? []; if (!list.length || !sync.isHost) return;
    const k = Math.floor(Math.random() * list.length), o = list[k], from = homes.get(o).clone(); o.parent.updateMatrixWorld(true); o.parent.localToWorld(from);
    const hit = world.raycast?.(new THREE.Ray(from.clone(), down), 0, 4000);
    sync.act('partDrop', { key: 'spike:handle', k, p: sync.a(hit ? from.clone().addScaledVector(down, hit.distance - 6) : from), msg: 'Something fell from the Tesla coils' });
  }
  // guards: the A10 wall switch during a rocket test fire, then the console's lever within 20 s
  const wallSwitch = root.getObjectByName('CASTLE_SM_spike_quest_wall_switch'), consoleSwitch = root.getObjectByName('CASTLE_SM_spike_quest_console_switch');
  const lever = (o, on) => { if (!o) return; o.userData.rest ??= o.rotation.z; o.rotation.z = o.userData.rest + (on ? -2.09 : 0); o.updateMatrixWorld(true); };
  if (wallSwitch) world.addInteraction({
    position: at(wallSwitch),
    text: () => st.built.spike || st.have.spike.has('guards') || st.shown.has('spike:guards') ? '' : traps?.state().rocket.phase === 'fire' ? 'Pull the switch' : st.armed > session.time ? '' : 'The switch is locked',
    use() {
      if (traps?.state().rocket.phase !== 'fire' || st.built.spike || st.have.spike.has('guards')) return false;
      sync.act('guardsArm'); audio?.play?.('buy', .5); return true;
    },
  });
  if (consoleSwitch) world.addInteraction({
    position: at(consoleSwitch),
    text: () => st.armed > session.time && !st.shown.has('spike:guards') ? 'Pull the lever' : '',
    use() {
      if (!(st.armed > session.time)) return false;
      sync.act('guardsOpen'); audio?.play?.('buy', .7); return true;
    },
  });

  host.on('update', dt => {
    if (!dt) return;
    // the Death Ray finishing a run drops the handle (once, while the Ragnarok isn't built)
    const rayOn = !!traps?.state().ray.on;
    if (st.rayWas && !rayOn && !st.built.spike && !st.have.spike.has('handle') && !st.shown.has('spike:handle')) handleDrop();
    st.rayWas = rayOn;
  });
  host.on('reset', reset);

  reset();

  return {
    state: () => ({ have: { spike: [...st.have.spike], shield: [...st.have.shield] }, built: { spike: st.built.spike, shield: !!st.built.shield }, shown: [...st.shown.keys()],
      armed: Math.max(0, Math.round(st.armed - session.time)), shield: shield?.state() ?? null }),
    give(cr) { for (const p of CRAFT[cr]?.parts ?? []) st.have[cr].add(p); for (const k of [...st.shown.keys()]) if (k.startsWith(cr + ':')) { st.shown.get(k).visible = false; st.shown.delete(k); } },   // testing: every part of a craftable
    takeShield, raise: () => shield?.raise(), lower: () => shield?.lower(), handleDrop,
  };
}
