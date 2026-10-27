// Der Eisendrache's craftables (zm_castle_craftables.gsc) and the rocket shield. Parts are the builder's
// CASTLE_PART_<craftable>_<part>_<k> models (every candidate spot, hidden); benches CASTLE_BENCH_spike (the undercroft
// table) and CASTLE_BENCH_open_<k> (the three open workbenches); the shield's recharges CASTLE_SHIELDCHARGE_<k>.
//   Ragnarok DG-4 (gravityspike): built at its own table (or an open bench once its shield is built and taken), then
//   taken as the operator weapon (mods/operator-weapons), charged. Its parts come as in BO3:
//     body   - dropped where a Panzersoldat dies (zm_castle_mechz.gsc notifies its death origin), until it's taken
//     handle - when the Death Ray has finished a run it hangs in the air at one of its two spots (BO3's), out of
//              reach on foot: fly past it on the launch pad whose flight comes nearest and it's grabbed in flight
//              (user, 2026-10-18; it used to fall to the floor). Within GRAB of the flight path. Each spot is on one
//              pad's flight only, so the message names that pad, the host prefers a spot whose pad is already on, and
//              the handle (a hand's length) crackles with a blue glow so it's seen from the ground (user, 2026-10-21:
//              "doesn't actually drop", it was there but too small to see and the pad was a guess).
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

export function setupCraftables(api, { traps, pads }) {
  const { world, session, host, player, camera, scene, enemies, audio, toast, announce, data, viewScene, view, sync } = api;
  const root = world.root, kino = window.kino;
  const at = o => o.getWorldPosition(new THREE.Vector3());
  // a map node moved or shown at runtime (the static map's matrices are frozen: update them by hand). updateMatrix()
  // too: a frozen node (static-freeze) has matrixAutoUpdate off until the freeze notices the move a frame or two later,
  // so updateMatrixWorld alone left its matrix at home and the pickup spot, read from it at once, stayed at the part's
  // fixed spot: the Panzersoldat's Ragnarok body couldn't be taken where it died (user, 2026-10-27)
  const moveTo = (o, p) => { o.parent.updateMatrixWorld(true); o.position.copy(o.parent.worldToLocal(p.clone())); o.updateMatrix(); o.updateMatrixWorld(true); };
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
    for (const [o, h] of homes) { o.visible = false; o.position.copy(h); o.updateMatrix(); o.updateMatrixWorld(true); places.get(o)?.copy(at(o)); }
    st.have.spike.clear(); st.have.shield.clear(); st.built.spike = false; st.built.shield = null; st.shown.clear(); st.firstPanzer = false; st.armed = 0;
    if (sync.isHost) { const pick = {}; for (const part of CRAFT.shield.parts) { const n = spots['shield:' + part]?.length ?? 0; if (n) pick[part] = Math.floor(Math.random() * n); } sync.act('craftSpots', pick); }   // the host picks the shield parts' spots
  }
  // ---- the team's events ---------------------------------------------------------------------------------------------
  sync.on('craftSpots', d => { for (const [part, k] of Object.entries(d)) { const o = spots['shield:' + part]?.[k]; if (o) show('shield', part, o); } });
  sync.on('partPick', (d, ctx) => { const o = st.shown.get(d.key); if (!o) return; const [cr, part] = d.key.split(':'); o.visible = false; st.shown.delete(d.key); st.have[cr].add(part); if (ctx.mine) audio?.play?.('buy', .5); toast?.(`${CRAFT[cr].name} part · ${st.have[cr].size}/${CRAFT[cr].parts.length}`, 2.5); });
  sync.on('partDrop', d => { const o = spots[d.key]?.[d.k]; if (!o || st.shown.has(d.key)) return; const [cr, part] = d.key.split(':'); show(cr, part, o, d.p ? sync.v(d.p) : null); if (d.msg) toast?.(d.msg, 3); });
  sync.on('build', (d, ctx) => {
    if (d.cr === 'spike') { if (st.built.spike) return; st.built.spike = benches[d.bench] ?? benchSpike ?? true; announce?.('RAGNAROK DG-4', 'BUILT', 2.5); }
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
      position: pos, hidden: () => key === 'spike:handle' || !(o.visible && st.shown.get(key) === o),   // the handle is caught in flight
      text: () => `Pick up ${CRAFT[cr].label[part]}`,
      use() {
        if (!o.visible || st.shown.get(key) !== o) return false;
        sync.act('partPick', { key }); return true;
      },
    });
  }
  // the Ragnarok builds at its table in the undercroft or at any open bench whose shield has nothing left to do there
  // (user, 2026-10-27: with every part in hand the open benches only ever offered the shield), and is taken where it
  // was built. At an open bench the shield comes first: build it, take it, then the Ragnarok.
  const spikeHere = b => st.built.spike ? st.built.spike === b && !!kino.operator && kino.operator.current !== 'ragnarok' : st.have.spike.size === 3;
  const shieldHere = b => st.built.shield ? st.built.shield === b && !shield?.owned : st.have.shield.size === 3;
  const spikeUse = b => {
    if (!st.built.spike) { if (st.have.spike.size < 3) return false; sync.act('build', { cr: 'spike', bench: benches.indexOf(b) }); return true; }
    if (!spikeHere(b)) return false;
    kino.operator.give('ragnarok', { full: true }); kino.armory?.found('ragnarok'); return true;
  };
  if (benchSpike) world.addInteraction({
    position: at(benchSpike),
    hidden: () => st.built.spike && !spikeHere(benchSpike),
    text: () => st.built.spike ? 'Take the Ragnarok DG-4' : st.have.spike.size === 3 ? 'Build the Ragnarok DG-4' : `Ragnarok DG-4 · ${st.have.spike.size}/3 parts`,
    use: () => spikeUse(benchSpike),
  });
  for (const b of benches) world.addInteraction({
    position: at(b),
    hidden: () => !shieldHere(b) && !spikeHere(b) && !!st.built.shield,
    text: () => shieldHere(b) ? (st.built.shield ? 'Take the Rocket Shield' : 'Build the Rocket Shield')
      : spikeHere(b) ? (st.built.spike ? 'Take the Ragnarok DG-4' : 'Build the Ragnarok DG-4') : `Rocket Shield · ${st.have.shield.size}/3 parts`,
    use() {
      if (!shieldHere(b)) return spikeHere(b) && spikeUse(b);
      if (!st.built.shield) { sync.act('build', { cr: 'shield', bench: benches.indexOf(b) }); return true; }
      takeShield(); return true;
    },
  });

  // ---- where the Ragnarok's parts come from -----------------------------------------------------------------------
  host.on('kill', ({ enemy }) => {   // body: a Panzersoldat's death drops it until someone has it (the host's kills; it was the first one only, so a missed drop was gone for good)
    if (!sync.isHost || enemy?.kind !== 'panzer' || st.built.spike || st.have.spike.has('body') || st.shown.has('spike:body')) return;
    st.firstPanzer = true; if (!spots['spike:body']?.[0]) { console.warn('[der-eisendrache] no CASTLE_PART_spike_body spot'); return; }
    const p = enemy.root.position.clone(); const q = world.closest?.(p, { x: 80, y: 160, z: 80 }) ?? p;
    sync.act('partDrop', { key: 'spike:body', k: 0, p: sync.a(q.clone().add(new THREE.Vector3(0, 6, 0))), msg: 'The Panzersoldat dropped something' });
  });
  // handle: hangs at one of its spots (the host picks which) until someone flies past it on a launch pad
  const GRAB = 140;
  const padName = flag => flag.replace(/_pad_flag$/, '').replace(/^v10_/, '').replace(/_/g, ' ');   // upper_courtyard_pad_flag: 'upper courtyard'
  const nearestPad = p => {   // the pad whose flight passes closest to p: { flag, d }
    let best = { flag: null, d: Infinity };
    for (const { flag, curve } of pads?.curves?.() ?? []) for (let i = 0; i <= 200; i++) { const d = curve.getPointAt(i / 200).distanceTo(p); if (d < best.d) best = { flag, d }; }
    return best;
  };
  function handleDrop() {
    const list = spots['spike:handle'] ?? []; if (!list.length || !sync.isHost) return;
    const on = new Set((pads?.pads?.() ?? []).filter(p => p.active).map(p => p.flag)), all = list.map((o, k) => k);
    const live = all.filter(k => on.has(nearestPad(at(list[k])).flag)), pool = live.length ? live : all;
    const k = pool[Math.floor(Math.random() * pool.length)], flag = nearestPad(at(list[k])).flag;
    sync.act('partDrop', { key: 'spike:handle', k, msg: flag ? `The Tesla coils threw something into the air · catch it flying from the ${padName(flag)} launch pad${on.has(flag) ? '' : ' (switch its landing pad on first)'}` : 'The Tesla coils threw something into the air' });
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

  // the hanging handle's crackle: a glow and three arcs re-struck every few frames (no light: each costs every pixel here)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8fd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const arcMat = new THREE.LineBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const ARC = 7, arcs = Array.from({ length: 3 }, () => { const l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC * 3), 3)), arcMat); l.frustumCulled = false; return l; });
  for (const o of [halo, ...arcs]) { o.visible = false; scene?.add(o); }
  let restrike = 0;
  const crackle = (h, dt) => {
    for (const o of [halo, ...arcs]) o.visible = !!h;
    if (!h) return;
    const c = h.userData.at ??= at(h); halo.position.copy(c); halo.scale.setScalar(70 + 25 * Math.random());
    if ((restrike -= dt) > 0) return; restrike = .06;
    const d = new THREE.Vector3(), q = new THREE.Vector3();
    for (const l of arcs) {
      const a = l.geometry.attributes.position; d.randomDirection(); const len = 25 + 30 * Math.random();
      for (let i = 0; i < ARC; i++) { const t = i / (ARC - 1); q.copy(c).addScaledVector(d, 4 + t * len); if (i && i < ARC - 1) q.add(new THREE.Vector3().randomDirection().multiplyScalar(6)); a.setXYZ(i, q.x, q.y, q.z); }
      a.needsUpdate = true;
    }
  };

  host.on('update', dt => {
    if (!dt) return;
    // the Death Ray finishing a run drops the handle (once, while the Ragnarok isn't built)
    const rayOn = !!traps?.state().ray.on;
    if (st.rayWas && !rayOn && !st.built.spike && !st.have.spike.has('handle') && !st.shown.has('spike:handle')) handleDrop();
    st.rayWas = rayOn;
    // the hanging handle: grabbed by whoever flies past it (my own flight; the pick is a team event)
    const h = st.shown.get('spike:handle');
    if (h && pads?.flying?.()) {
      h.userData.at ??= at(h); h.userData.pad ??= nearestPad(h.userData.at);
      const me = player.getFeetPosition(), reach = Math.max(GRAB, h.userData.pad.d + 60);   // a spot no flight passes within GRAB still gets taken by the nearest pad's
      if (pads.flightPad?.() === h.userData.pad.flag && (me.distanceTo(h.userData.at) < reach || me.clone().add(new THREE.Vector3(0, 60, 0)).distanceTo(h.userData.at) < reach)) sync.act('partPick', { key: 'spike:handle' });
    }
    if (h) h.rotation.y += dt * 1.5;   // turning in the air, so it's seen
    crackle(h, dt);
  });
  host.on('reset', reset);

  reset();

  return {
    state: () => ({ have: { spike: [...st.have.spike], shield: [...st.have.shield] }, built: { spike: !!st.built.spike, shield: !!st.built.shield }, shown: [...st.shown.keys()],
      armed: Math.max(0, Math.round(st.armed - session.time)), shield: shield?.state() ?? null }),
    give(cr) { for (const p of CRAFT[cr]?.parts ?? []) st.have[cr].add(p); for (const k of [...st.shown.keys()]) if (k.startsWith(cr + ':')) { st.shown.get(k).visible = false; st.shown.delete(k); } },   // testing: every part of a craftable
    takeShield, raise: () => shield?.raise(), lower: () => shield?.lower(), handleDrop,
  };
}
