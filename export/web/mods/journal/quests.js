// The journal's quest book (mods/journal): every map's Easter eggs, side quests and buildables, step by step.
// Static text (title, how) is shown by JOURNAL.EXE on any map; a step's text unlocks for good once the step has been
// done (kino.mods.journal). The functions only run on the quest's own map, with the live context L (mods/journal/mod.js):
//   L.prompts(re)    positions of the map's interactions shown right now whose prompt matches re
//   L.nodes(re)      positions of visible map nodes whose name matches re (builder markers, quest props)
//   L.ents(name)     positions of the map's entities with that targetname (BO1 maps)
//   L.castle, L.de   Der Eisendrache: window.kino.castle and the quest spots exported by its ee/side/side2 modules
//   L.malibu()       Malibu Drive: window.kino.malibu (its quests' flags() and the map kit)
// A quest is linear (progress(L) -> how many steps are done) or not (step.done(L) per step, in any order).
// step.where(L) -> [Vector3] puts markers on the screen while the quest is tracked (only once the step is recorded);
// spots already dealt with this match are left out, so only what is still to do is marked.

import * as THREE from 'three';

const n = v => [v].flat().filter(Boolean);
const mq = L => L.malibu?.()?.quests?.flags?.();   // Malibu Drive's quest flags (malibu-drive/quests.js)
const nt = L => globalThis.kino?.nuketown?.state?.();   // Nuketown's quest state (nuketown/mod.js)
const ntPart = (craft, part) => {   // a part of a Nuketown buildable, any order: `at` is where it lies this game (buildables.js)
  const of = L => nt(L)?.[craft], item = L => of(L)?.parts.find(q => q.name === part);
  return { title: part, how: `The ${part.toLowerCase()} lies at one of three spots, a different one each game.`,
    done: L => !!of(L)?.built || !!item(L)?.got, where: L => { const q = item(L); return !q || q.got || of(L).built ? [] : [q.at]; } };
};
// Gorod Krovi (2026-11-17): every module puts its state on kino.gorod (ee/eggs/wear: getters; shield, strike, pods,
// challenges: state() functions; gauntlet: .state is the step's name, .S the rest). Spots are BO3 (CoD) coordinates.
const gkr = () => globalThis.kino?.gorod;
const gf = f => !!gkr()?.gk?.hasFlag?.(f);
const cw = (x, y, z) => new THREE.Vector3(x, z, -y);   // CoD -> map (scene-props.js W)
const wv = a => a ? new THREE.Vector3(...a) : null;   // a rounded world position from a debug state
const eeS = () => gkr()?.ee?.state;
const eeSpots = re => (gkr()?.ee?.spots?.() ?? []).filter(s => re.test(s.text)).map(s => wv(s.at));
const GK_KEYS = [[-77, 3575, 346], [1794, 3022, -156], [2664.15, 2624.27, -159], [-2344, 2604, 226], [-4744, 22440, -378], [-614, 3452, -148]];
const GK_SOPHIA = cw(299, 4854, 186), GK_MAPBTN = cw(-398.75, 4764, 182);
const GK_EE = [   // ee.js: one check per step, in order
  () => gf('generator_charged'), () => gf('tube_puzzle_complete'), () => gf('ee_cylinder_acquired'), () => gf('key_placement'),
  () => (eeS()?.keys?.length ?? 0) >= 6, () => gf('keys_placed'), () => gf('scenarios_complete'), () => gf('weapon_cores_delivered'),
  () => gf('sophia_escaped'), () => ['arena', 'done'].includes(eeS()?.stage) || gf('ee_complete'), () => gf('ee_complete') || eeS()?.stage === 'done'];
const linear = checks => () => { let i = 0; while (i < checks.length && checks[i]()) i++; return i; };
const shield = () => gkr()?.shield?.state?.();
const gauntlet = () => gkr()?.gauntlet;
const GAUNTLET_NO = { boards: 0, egg: 1, carry: 2, placed: 2, bathed: 2, cooled: 2, napalm: 3, pierce: 4, melee: 5, incubate: 6, lockdown: 6, hot: 6, collect: 6, done: 7 };
const pods = () => gkr()?.pods?.state?.();
const GK_RADIOS = { red: [-2422, 2892, 517], yellow: [2432, 2370, -140], blue: [-58, 5673, 341] };
const podWhere = L => {   // the network's current part: the cylinder, its radio, the pod, the part, the console
  const s = pods(); if (!s || s.crafted) return [];
  if (s.active) return [wv(s.active.at)];   // the pod, then its part (both there)
  if (s.carried?.length) return [cw(-91, 3237, -132)];
  if (s.held) return [cw(...GK_RADIOS[s.held] ?? GK_RADIOS.red)];
  return s.cylinder ? [wv(s.cylinder.at)] : [];
};
const strike = () => gkr()?.strike?.state?.();
const eggs = () => gkr()?.eggs?.state;
const wear = () => gkr()?.wear?.state;
const GK_LOGS = [[-4530, 3266, 410], [-488, 1135, 55], [3153, 3502, 248], [-3264, 21623, 58], [306, 1748, 53], [-124, 3430, 290], [-738, 1453, 357], [-48, 4653, 637], [-3095, 21612, 705], [-824, 2641, -32]];
const GK_WEAR = { raz: [-1046.15, 1755.65, 240.234], sentinel: [110.271, 1690.54, 242], wings: [-738.994, 1454.91, 385.103] };
const wearQuest = (k, name, steps) => ({ id: 'wear-' + k, name, kind: 'WEARABLE', steps: [...steps,
  { title: 'Wear it', how: `The ${name} waits on its stand on the department store's upper floor once unlocked: press use to put it on.`, done: L => wear()?.worn === k, where: L => wear()?.open?.includes(k) && wear()?.worn !== k ? [cw(...GK_WEAR[k])] : [] }] });

const at = (L, name) => { const k = L.malibu?.()?.kit, e = k?.one(name); return e ? [k.center(e)] : []; };   // a Malibu entity's spot
const bowStage = (L, el) => {   // Der Eisendrache bow quest -> steps done: start, arrow, its own steps, place, souls, take
  const s = L.castle?.bows?.state()?.[el], Q = L.castle?.bows?.sites?.[el]; if (!s || !Q) return 0;
  const k = Q.steps.length;
  return s.stage === 'idle' ? 0 : s.stage === 'steps' ? (s.owner == null ? 1 : 2 + Q.steps.indexOf(s.step)) : s.stage === 'place' ? 2 + k
    : s.stage === 'souls' ? 3 + k : s.stage === 'ready' ? 4 + k : 5 + k;
};
const site = (L, el) => L.castle?.bows?.sites?.[el] ?? {};
const bowD = (L, el) => L.castle?.bows?.state()?.[el]?.d ?? {};   // the bow quest's current step's progress (Sets as arrays)
const BOW_TAIL = el => [
  { title: 'Place the arrow', how: 'Put the reforged arrow on its pedestal around the undercroft pyramid (a Max Ammo drops).', where: L => n(site(L, el).pedestal) },
  { title: 'Feed the pedestal', how: 'Get 20 kills in the undercroft while the arrow is on its pedestal. Only the arrow\'s owner\'s kills count.', where: L => n(site(L, el).pedestal) },
  { title: 'Take the bow', how: 'Take the bow from its pedestal: it replaces the bow in your hand. Afterwards anyone can take one there.', where: L => n(site(L, el).pedestal) },
];
const ARROW = el => ({ title: 'Pick up the broken arrow', how: 'Pick up the broken arrow that fell. Whoever picks it up owns the quest (one bow quest per player); only their shots, uses and kills count.', where: L => n(site(L, el).arrow) });

export const JOURNAL = [
  { map: 'der-eisendrache', title: 'Der Eisendrache', quests: [
    { id: 'main', name: 'Main Easter egg', kind: 'MAIN QUEST', progress: L => Math.min(9, L.castle?.ee?.state().step ?? 0), steps: [
      { title: 'Upgrade a bow', how: 'The quest starts once any elemental bow has been upgraded (see the four bow quests).' },
      { title: 'The summoning key', how: 'Shoot the six summoning targets around the lab teleporter with a bow. The past laboratory opens.', where: L => { const hit = L.castle?.ee?.state().summoned ?? []; return (L.de?.SUMMON ?? []).filter((p, k) => !hit.includes(k)); } },
      { title: 'Into the past', how: 'One of seven targets around the castle lights up: hit it with an upgraded bow, then the next, four in a row (anything else hit, or the round ending, resets it). Primed, the lab teleporter takes you to the past for the rest of the round. In the past: read the safe\'s combination, take the MPD canister and the lab fuse. In the present, the combination opens the safe (the golden key and two tesla connectors). In the past again the key opens the crate: the channeling stone. Put the canister in the MPD and the stone on the cracked plinth by the road.',
        where: L => { const s = L.castle?.ee?.state(), d = L.de; if (!s || !d) return []; const items = L.prompts(/combination|canister|golden key|channeling stone|safe/i);
          if (items.length) return items; return s.travel.ready ? [d.PAD.present] : s.travel.lit != null ? n(d.TRAVEL[s.travel.lit]) : d.TRAVEL; } },
      { title: 'The Keeper', how: 'Take the Vril device from the undercroft to the statue. The Keeper rises and floats to the four channeling stones in turn: kill 12 zombies around each while it charges it.',
        where: L => { const s = L.castle?.ee?.state(), v = L.prompts(/Vril device/); if (v.length) return v; const st = L.de?.STONES?.[s?.protector?.stone ?? 0]; return n(st?.zone); } },
      { title: 'Simon says', how: 'At the consoles on the lower tower and the launch platform: watch the runes, then press use while the monitor shows each rune in the same order (3, 4, then 5 runes).',
        where: L => (L.de?.SPOT.consoles ?? []).filter((p, k) => L.castle?.ee?.state().simon?.[k]?.phase !== 'done') },
      { title: 'Rockets to the moon', how: 'Put the two tesla connectors on the Death Ray bases on the roof, then pull its lever.',
        where: L => { const p = L.prompts(/tesla connector|Death Ray lever/); if (p.length || !L.de) return p; const done = L.castle?.ee?.state().done ?? [];
          return [['tcLower', L.de.SPOT.tcLower], ['tcLaunch', L.de.SPOT.tcLaunch], ['rockets', L.de.SPOT.lever]].filter(([f]) => !done.includes(f)).map(([, q]) => q); } },
      { title: 'The lab fuse', how: 'Put the lab fuse (from the past) in the fuse box on the roof.', where: L => n(L.de?.SPOT.fuseBox) },
      { title: 'To the boss', how: 'Plant the Ragnarok DG-4 on one of the four plates around the MPD in the undercroft (or, without one, touch the MPD).', where: L => [...(L.de?.SPOT.plates ?? []), ...n(L.de?.SPOT.mpd)] },
      { title: 'Defeat the Keeper', how: 'It teleports around the arena casting the bows\' spells. Every third cast it charges a storm at the centre: plant the Ragnarok under it (or hit it with an upgraded bow) to stun it. Only stunned does it take damage (headshots double). Unstunned, the storm hits everyone outside the five safe circles. Three phases.' },
    ] },
    { id: 'storm', name: 'Storm Bow', kind: 'BOW UPGRADE', progress: L => bowStage(L, 'storm'), steps: [
      { title: 'Start the quest', how: 'Shoot the weather vane on top of the clock tower with Wrath of the Ancients.', where: L => n(site(L, 'storm').start) },
      ARROW('storm'),
      { title: 'The beacons', how: 'Shoot the three beacon pyres (stacks of logs) far out from the castle: the wall, the cliff, the rocket pad. Each one catches fire when hit; any draw reaches them.', where: L => (site(L, 'storm').beacons ?? []).filter((b, k) => !bowD(L, 'storm').lit?.includes(k)) },
      { title: 'Wall-run', how: 'While the undercroft\'s gravity is low, wall-run through its five triggers without landing.', where: L => site(L, 'storm').wallrun ?? [] },
      { title: 'The batteries', how: 'Fill the three storm batteries (gatehouse, clock tower, rocket pad) with 5 kills each; then stand on a filled battery and fire a fully drawn arrow at a beacon, once per beacon.', where: L => (site(L, 'storm').batteries ?? []).filter(b => !bowD(L, 'storm').used?.includes(b.id)).map(b => b.at) },
      { title: 'Reforge', how: 'Reforge the arrow on the roof.', where: L => n(site(L, 'storm').reforge) },
      ...BOW_TAIL('storm'),
    ] },
    { id: 'rune', name: 'Fire Bow', kind: 'BOW UPGRADE', progress: L => bowStage(L, 'rune'), steps: [
      { title: 'Start the quest', how: 'Shoot the clock on the clock tower wall with Wrath of the Ancients.', where: L => n(site(L, 'rune').start) },
      ARROW('rune'),
      { title: 'The obelisk', how: 'Just after a rocket test fire (within 7.5 s), shoot the obelisk by the rocket pad: a magma ball rises over the roof.', where: L => n(site(L, 'rune').obelisk) },
      { title: 'The runic circles', how: 'Shoot each runic circle (road, rampart, roof) while flying off a launch pad, then charge each with 9 kills standing in it (a symbol lights every 3).', where: L => (site(L, 'rune').circles ?? []).filter(c => !(bowD(L, 'rune').kills?.[c.id] >= 9)).map(c => c.trig) },
      { title: 'The clock', how: 'Turn the clock in the clock tower: its wheel shows one fireplace and keeps that fireplace\'s circle.', where: L => n(site(L, 'rune').clock) },
      { title: 'Magma golf', how: 'Standing in the circle\'s pool, each arrow\'s landing makes the next pool; get an arrow into the fireplace the wheel shows (under 3 shots: a Max Ammo). 4 misses and it waits for the next round.', where: L => n(L.castle?.bows?.golfPool?.()) },
      { title: 'The fireplace', how: 'Use the fireplace to take the magma.', where: L => L.prompts(/Take the magma/) },
      { title: 'Reforge', how: 'Reforge the arrow on the roof.', where: L => n(site(L, 'rune').reforge) },
      ...BOW_TAIL('rune'),
    ] },
    { id: 'wolf', name: 'Wolf Bow', kind: 'BOW UPGRADE', progress: L => bowStage(L, 'wolf'), steps: [
      { title: 'The paintings', how: 'Holding a bow, use the four king paintings in their order 1-4 (they are dealt to four walls at random; a wrong one starts over). A wall in the undercroft breaks.', where: L => { const P = site(L, 'wolf').paintings ?? {}, t = L.castle?.bows?.team?.(), next = t?.deal?.[t.paint]; return next && P[next] ? [P[next]] : Object.values(P); } },
      ARROW('wolf'),
      { title: 'The skull shrine', how: 'Shoot the skull shrine above the rocket pad.', where: L => n(site(L, 'wolf').shrine) },
      { title: 'The wolf skull', how: 'Pick up the wolf skull where it rolls, below the shrine.', where: L => n(site(L, 'wolf').skull) },
      { title: 'Skadi', how: 'Place the skull in the undercroft: Skadi\'s ghost walks to the courtyard, the road (she waits at its door until the gatehouse is open) and the undercroft. At each, get 10 kills near her; she digs up bones: pick them up.', where: L => { const p = L.prompts(/wolf skull|bones/); return p.length ? p : n(L.castle?.bows?.skadi?.()); } },
      { title: 'The burial chamber', how: 'In the burial chamber, shoot the symbol while wall-running: the ledge forms for 10 s; reforge the arrow on it.', where: L => n(site(L, 'wolf').burial) },
      ...BOW_TAIL('wolf'),
    ] },
    { id: 'demon', name: 'Void Bow', kind: 'BOW UPGRADE', progress: L => bowStage(L, 'demon'), steps: [
      { title: 'Start the quest', how: 'Shoot the symbol in the gatehouse ceiling with Wrath of the Ancients.', where: L => n(site(L, 'demon').start) },
      ARROW('demon'),
      { title: 'The seal', how: 'Melee a zombie standing on the flagstone seal in the trophy room.', where: L => n(site(L, 'demon').seal?.p) },
      { title: 'The urn', how: 'Use the urn in the trophy room.', where: L => n(site(L, 'demon').urn) },
      { title: 'The fossils', how: 'Return the six chomper fossils around the castle.', where: L => L.prompts(/Return the fossil/) },
      { title: 'The crawlers', how: 'Make crawlers and lead them into the demonic circle: the chompers eat 6.', where: L => n(site(L, 'demon').circle?.p) },
      { title: 'The runes', how: 'The urn shows three crests (shoot it to see them again); the Great Hall\'s armour shows each crest\'s rune. Kills drop demonic runes (10%), each lights its rune on the circle; shoot the crests\' runes in order (wrong: a frenzy, then try again).', where: L => [...Object.values(site(L, 'demon').armour ?? {}), ...n(site(L, 'demon').urnHit)] },
      { title: 'Reforge', how: 'Reforge the arrow in the trophy room.', where: L => n(site(L, 'demon').reforge) },
      ...BOW_TAIL('demon'),
    ] },
    { id: 'wrath', name: 'Wrath of the Ancients', kind: 'WONDER WEAPON',
      progress: L => { const s = L.castle?.bow?.state(); return !s ? 0 : s.taken ? 2 : s.charged ? 1 : 0; }, steps: [
      { title: 'Feed the dragons', how: 'Kill zombies near each of the three dragon heads until it is full (they eat the souls).',
        where: L => { const full = new Set((L.castle?.bow?.state().souls ?? []).filter(([, k]) => k >= 8).map(([id]) => id)); return L.nodes(/^CASTLE_DRAGONZONE_(.+)$/, m => !full.has(m[1])); } },
      { title: 'Take the bow', how: 'Take Wrath of the Ancients from its pedestal in the courtyard.', where: L => L.nodes(/^CASTLE_BOWPICKUP$/) },
    ] },
    { id: 'pap', name: 'Pack-a-Punch', kind: 'MAP QUEST',
      progress: L => { const s = L.castle?.pap?.state(); return !s ? 0 : s.reformed ? 2 : s.active.length >= 2 ? 1 : 0; }, steps: [
      { title: 'Send it away', how: 'Activate two of the three Pack-a-Punch spots (the undercroft, the rocket pad, the rooftop).', where: L => L.prompts(/Activate the Pack-a-Punch/) },
      { title: 'Watch it re-form', how: 'Go to the third spot and look at it: the machine re-forms there. After its first use it moves every few rounds.', where: L => { const s = L.castle?.pap?.state(); return s?.reformAt ? L.nodes(new RegExp('^CASTLE_PAPLOC_' + s.reformAt + '$')) : []; } },
    ] },
    { id: 'ragnarok', name: 'Ragnarok DG-4', kind: 'BUILDABLE', steps: [
      { title: 'The spikes', how: 'The first Panzersoldat to die drops them.', done: L => { const s = L.castle?.craft?.state(); return !!s && (s.built.spike || s.have.spike.includes('body')); }, where: L => L.prompts(/Pick up the spikes/) },
      { title: 'The handle', how: 'Run the Death Ray: when it finishes, the handle falls from one of the Tesla coils.', done: L => { const s = L.castle?.craft?.state(); return !!s && (s.built.spike || s.have.spike.includes('handle')); }, where: L => L.prompts(/Pick up the handle|Activate the Death Ray/) },
      { title: 'The guards', how: 'During a rocket test (from 6 s after the alarm starts until the burn ends), pull the wall switch at the rocket pad and get out through the blast doors before they shut, then within 20 s pull the lever on the landing pad\'s console. The guards drop beside it.', done: L => { const s = L.castle?.craft?.state(); return !!s && (s.built.spike || s.have.spike.includes('guards')); }, where: L => L.prompts(/Pull the switch|Pull the lever|Pick up the guards/) },
      { title: 'Build it', how: 'Build it at its table in the undercroft, or at any workbench once the shield there is built and taken.', done: L => !!L.castle?.craft?.state().built.spike, where: L => L.nodes(/^CASTLE_BENCH_(spike|open_\d+)$/) },
      { title: 'Take it', how: 'Take it from the table: it fills your operator weapon slot (Y).', done: L => window.kino?.operator?.current === 'ragnarok', where: L => L.nodes(/^CASTLE_BENCH_spike$/) },
    ] },
    { id: 'shield', name: 'Rocket Shield', kind: 'BUILDABLE', steps: [
      ...[['dolly', 'the eagle'], ['clamp', 'the window'], ['door', 'the fuel tank']].map(([id, label]) => ({ title: label[0].toUpperCase() + label.slice(1),
        how: `Its part lies at one of a few spots each game: look for ${label}.`, done: L => { const s = L.castle?.craft?.state(); return !!s && (s.built.shield || s.have.shield.includes(id)); }, where: L => L.prompts(new RegExp('Pick up ' + label)) })),
      { title: 'Build it', how: 'Build it at any of the three open workbenches.', done: L => !!L.castle?.craft?.state().built.shield, where: L => L.nodes(/^CASTLE_BENCH_open_\d+$/) },
      { title: 'Take it', how: 'Take it from the bench it was built at (again for free if it breaks). H raises it.', done: L => !!window.kino?.rocketShield?.owned, where: L => L.prompts(/Take the Rocket Shield/) },
    ] },
    { id: 'plates', name: 'Pressure plates', kind: 'SIDE EGG', progress: L => (L.castle?.side?.state().plates ?? 0) > 0 ? 1 : 0, steps: [
      { title: 'The four plates', how: 'Stand on each of the undercroft pyramid\'s four pressure plates for 3 seconds: it sinks, its symbol lights and it locks down (step off early and it comes back up). A few seconds after the fourth the gravity goes low for 50 s and a power-up appears high in the room. From then on the low gravity comes back by itself: 50 s on, 60 s off.', where: L => (L.de?.PADS ?? []).filter((p, k) => !L.castle?.side?.state().pads.includes(k)) },
    ] },
    { id: 'plunger', name: 'Clock tower and the plunger', kind: 'SIDE EGG',
      progress: L => { const a = L.castle?.side?.state(), b = L.castle?.side2?.state(); return !a || !b ? 0 : a.plunger ? 3 : b.clock.wallrun ? 2 : b.clock.powered ? 1 : 0; }, steps: [
      { title: 'Power the clock tower', how: 'With the Fire Bow quest begun, plant the Ragnarok at the top of the clock tower: the clock starts at 1:15.', where: L => n(L.de?.SPOT2?.towerTop) },
      { title: 'Lightning at 9:35', how: 'The lever runs the clock (a minute every 0.4 s). Stopped, lightning hits the rod every 5-15 s and moves it a minute. A strike at 9:35 powers the undercroft\'s wall-run runes.', where: L => [L.de?.SPOT2?.lever, L.de?.SPOT2?.rod].filter(Boolean) },
      { title: 'The plunger', how: 'While the gravity is low, wall-run past the undercroft\'s runes in a row, two laps, without landing: 10 s in the past lab\'s corner to take the plunger. It replaces your knife (3,000 a hit; a plunger kill blows up the zombies around it, once).', where: L => [...(L.de?.RUNS ?? []), ...L.prompts(/Take the plunger/)] },
    ] },
    { id: 'plant', name: 'The plant', kind: 'SIDE EGG',
      progress: L => { const s = L.castle?.side?.state().sprout; return s === 'done' ? 3 : s === 'grown' ? 2 : s === 'held' ? 1 : 0; }, steps: [
      { title: 'Take the sprout', how: 'Take the sprout from the pot in the lab.', where: L => n(L.de?.SIDE?.potPresent) },
      { title: 'Plant it in the past', how: 'Plant it in the same pot in the past lab.', where: L => n(L.de?.SIDE?.potPast) },
      { title: 'The gumball', how: 'Back in the present, the pot has grown a gumball: take it for a random gobblegum from your pack.', where: L => n(L.de?.SIDE?.potPresent) },
    ] },
    { id: 'disco', name: 'Disco Inferno', kind: 'SIDE EGG', progress: L => (L.castle?.side?.state().disco ?? 0) > 0 ? 1 : 0, steps: [
      { title: 'Turn the moon', how: 'Use the astroglobe to turn its moon arm 45° at a time until it lines up: 30 s of disco lights, and the zombies nearby dance.', where: L => n(L.de?.SIDE?.globe) },
    ] },
    { id: 'requiem', name: 'Requiem (music egg)', kind: 'SIDE EGG', progress: L => (L.castle?.side2?.state().gram ?? 0) >= 3 ? 1 : 0, steps: [
      { title: 'The gramophones', how: 'Play the three gramophones around the castle.', where: L => L.prompts(/Play the gramophone/) },
    ] },
    { id: 'deadagain', name: 'Dead Again (music egg)', kind: 'SIDE EGG', progress: L => (L.castle?.side2?.state().bears ?? 0) >= 3 ? 1 : 0, steps: [
      { title: 'The teddy bears', how: 'Squeeze the three teddy bears hidden around the castle.', where: L => L.prompts(/Squeeze the teddy bear/) },
    ] },
    { id: 'skulls', name: 'In Plain Sight skulls', kind: 'SIDE EGG', progress: L => (L.castle?.side2?.state().skulls.length ?? 0) >= 3 ? 1 : 0, steps: [
      { title: 'Break the skulls', how: 'Chew In Plain Sight: three floating skulls show. Break each with an upgraded-bow arrow; a pile grows in the lab, and with three it gives a power-up.', where: L => { const broke = L.castle?.side2?.state().skulls ?? []; return [...(L.de?.SKULLS ?? []).filter((p, k) => !broke.includes(k)), ...L.prompts(/Take the skulls/)]; } },
    ] },
    { id: 'claw', name: 'The claw hat', kind: 'SIDE EGG',
      progress: L => { const s = L.castle?.side2?.state(); return !s ? 0 : s.hat ? 2 : s.claws.every(c => c >= 1) ? 1 : 0; }, steps: [
      { title: 'Drop the claws', how: 'Shoot the three Panzer claws hanging around the castle: each drops a level.', where: L => (L.de?.CLAWS ?? []).filter((c, k) => !(L.castle?.side2?.state().claws[k] >= 1)).map(c => c.start) },
      { title: 'Three Panzer kills', how: 'Shoot a dropped claw again when a Panzersoldat is under it: it fires and kills it. Three Panzer kills give you the claw hat (Panzer melee and flame damage halved).', where: L => (L.de?.CLAWS ?? []).filter((c, k) => L.castle?.side2?.state().claws[k] === 1).map(c => c.fell) },
    ] },
  ] },

  { map: 'moon', title: 'Moon', quests: [
    { id: 'main', name: 'Big Bang Theory', kind: 'MAIN QUEST',
      progress: L => { const q = L.moon?.quest; if (!q) return 0; const order = MOON_STAGES.map(s => s.stage), i = order.indexOf(q.stage); return q.completed ? MOON_STAGES.length : Math.max(0, i); },
      steps: null },   // filled below from MOON_STAGES
    { id: 'music', name: 'Musical Easter egg', kind: 'SIDE EGG', progress: L => { const q = L.moon?.quest; return q && q.musicEggs.size >= L.ents('8bitsongs').length && q.musicEggs.size ? 1 : 0; }, steps: [
      { title: 'The radios', how: 'Find and use every hidden music trigger around the map.', where: L => L.ents('8bitsongs', e => !L.moon?.quest?.musicEggs.has(e.id)) },
    ] },
  ] },

  { map: 'kino', title: 'Kino der Toten', quests: [
    { id: 'reels', name: 'Film reels', kind: 'MAP QUEST',
      progress: L => { const r = L.reels(); if (!r) return 0; const i = r.installed.length; return i >= 3 ? 5 : i ? 4 : r.carried ? 3 : r.room || r.reels.some(x => x.collected) ? 2 : L.session.teleporter === 'linked' || L.session.teleporter === 'cooldown' ? 1 : 0; },
      steps: [
        { title: 'Link the teleporter', how: 'With the power on, use the teleporter pad on the stage, then link it at the mainframe pad in the lobby within 30 s.', where: L => L.session.teleporter === 'linking' ? L.ents('pf16_auto1') : L.ents('trigger_teleport_pad_0') },
        { title: 'A room outside time', how: 'Teleport to the projection room. On the way back you may land in a room outside time for a few seconds.', where: L => L.ents('trigger_teleport_pad_0') },
        { title: 'Take a film reel', how: 'In the room outside time, take the film reel before it pulls you back.', where: L => (L.reels()?.reels ?? []).filter(r => !r.collected).map(r => L.v(r.position)) },
        { title: 'Load the projector', how: 'Carry the reel to the projector in the projection room and load it.', where: L => L.ents('trigger_change_projector_reels') },
        { title: 'All three films', how: 'Find and project all three film reels.', where: L => L.ents('trigger_change_projector_reels') },
      ] },
    { id: 'meteors', name: '115 (music egg)', kind: 'SIDE EGG', progress: L => (L.meteors() ?? 0) >= 3 ? 1 : 0, steps: [
      { title: 'The meteor fragments', how: 'Find the three glowing meteor fragments around the theater and listen to each.', where: L => { const got = L.meteorIds(); return L.ents('meteor_egg_trigger', e => !got.includes(e.id)); } },
    ] },
  ] },

  { map: 'cheese-cube', title: 'Cheese Cube', quests: [
    { id: 'power', name: 'The power switch', kind: 'MAP QUEST', steps: [
      ...['panel', 'handle', 'wire'].map(id => ({ title: 'The ' + id, how: `Find the ${id} and add it to the power switch.`, done: L => !!L.cc()?.placed.includes(id), where: L => L.prompts(new RegExp(`(Take|Add) the ${id}$`)) })),
      { title: 'Turn it on', how: 'With all three parts added, turn on the power.', done: L => !!L.session.power, where: L => L.power() },
    ] },
    { id: 'brothers', name: 'The Cheese Brothers', kind: 'SIDE EGG', progress: L => { const c = L.cc()?.captured ?? 0; return c >= 5 ? 2 : c >= 1 || L.session.weapons?.some?.(w => (w?.id ?? w) === 'cheese_gun') ? 1 : 0; }, steps: [
      { title: 'The Cheese Gun', how: 'Buy the Cheese Gun off the wall: only it can capture a Cheese Brother.', where: L => L.prompts(/Cheese Gun/i) },
      { title: 'Capture all five', how: 'Shoot the five Cheese Brothers hidden around the map with the Cheese Gun: 2,000 each, 4,000 more for all five.', where: L => (L.world.shootTargets ?? []).filter(t => t.weapons?.includes('cheese_gun')).map(t => t.position) },
    ] },
    { id: 'trivia', name: 'The trivia', kind: 'MAP QUEST', progress: L => L.cc()?.triviaDone ? 7 : L.cc()?.step ?? 0,
      steps: ['B', 'B', 'C', 'D', 'B', 'D', 'A'].map((a, i) => ({ title: `Question ${i + 1}: ${a}`, how: `Answer ${a} with the keys on the desk in front of the monitor (look at a key, press F). A wrong answer locks the trivia for two minutes.${i === 6 ? ' Done, it unlocks the War Machine.' : ''}`, where: L => L.nodes(/^ENT_trivia1$/) })) },
    { id: 'ending', name: 'The ending', kind: 'MAIN QUEST', progress: L => { const s = L.cc(); return !s ? 0 : s.won ? 2 : s.solved ? 1 : 0; }, steps: [
      { title: 'The dial puzzle', how: 'The three dials start at 5 and each press steps one down: set the right one to 8, the middle to 1 and the left to 2. The door upstairs opens.', where: L => L.prompts(/button · \d/) },
      { title: 'Worthy', how: 'At the top, press F if thou art worthy (25,000): the game is won.', where: L => L.prompts(/worthy/) },
    ] },
    { id: 'ironman', name: 'Iron Man armor', kind: 'BUILDABLE', steps: [
      ...[['head', 'helmet'], ['body', 'body armor'], ['arml', 'left arm'], ['armr', 'right arm'], ['legl', 'left leg'], ['legr', 'right leg']].map(([id, label]) => ({ title: 'The ' + label,
        how: `Find the ${label} and carry it to the Hall of Armors.`, done: L => !!L.ccSuits()?.placed.includes(id), where: L => L.prompts(new RegExp(`(Take|Add) the ${label}$`)) })),
    ] },
  ] },

  { map: 'the-giant', title: 'The Giant', quests: [
    { id: 'flytrap', name: 'The Fly Trap', kind: 'SIDE EGG', progress: L => { const f = L.flyTrap(); return !f || f.stage === 'panel' ? 0 : f.done ? 2 : 1; }, steps: [
      { title: 'Shoot the fly trap', how: 'Shoot the fly trap with a Pack-a-Punched gun.', where: L => L.nodes(/^GIANT_FLYTRAP$/) },
      { title: 'Hide and seek', how: 'Three things appear around the map (a monkey bomb, a Bowie knife teddy bear, a perk bottle teddy bear): shoot all three. The prize spins in the fly trap room: take it.', where: L => { const f = L.flyTrap(); return f?.prize ? [f.prize] : f?.targets ?? []; } },
    ] },
    { id: 'song', name: 'Beauty of Annihilation', kind: 'SIDE EGG', progress: L => L.tile('giant-song')?.done() ? 1 : 0, steps: [
      { title: 'The spine beakers', how: 'Find and use the three beakers with a brain and spine in them.', where: L => L.prompts(/specimen jar/) },
    ] },
  ] },

  { map: 'malibu-drive', title: 'Malibu Drive', quests: [
    { id: 'main', name: 'Save Malibu', kind: 'MAIN QUEST', progress: L => { const f = mq(L); if (!f) return 0; return f.step < 0 ? 12 : f.step >= 14 ? f.step : f.dreamed ? 13 : f.step; }, steps: [
      { title: 'Message from Nick Fury', how: 'Read Nick Fury\'s briefing on the screen, then press F when finished.', where: L => L.prompts(/Nick Fury|when finished/) },
      { title: 'The analysis tank', how: 'Get zombies into Tony\'s analysis tank. They die under JARVIS\'s scan: super-charge one first, a zombie near the battery when Mjolnir hits it.', where: L => [...at(L, 'charge_battery_trig'), ...at(L, 'tony_tank')] },
      { title: 'The bribe', how: 'Read the bio by the holo-floor, then bribe the server (8,000).', where: L => L.prompts(/the bio|Bribe the server/) },
      { title: 'The server', how: 'Tony breaks into the server on the 4th floor of the Best Eastern. Windows updates the first time: try again next round.', where: L => L.prompts(/^Server$/) },
      { title: 'The hidden base', how: 'Find the loose brick, then open the base\'s three locks: the dials (left 2, middle 3, right 9; a press steps one down), the two consoles used by the same hero within 15 s, and Mjolnir thrown at the charger.',
        where: L => L.prompts(/loose brick| dial · |Security console|^Charger$/) },
      { title: 'The Hulk\'s vault', how: 'The Hulk smashes the second vault door.', where: L => at(L, 'ee_step_5_vault2_trig') },
      { title: 'The last vault', how: 'Open the third vault (10,000).', where: L => L.prompts(/Open Vault/) },
      { title: 'The mainframe', how: 'Look at the SHIELD mainframe, then everyone hacks a console at once: heroes who know computers only (Tony, Banner, Vision, Black Widow).', where: L => L.prompts(/SHIELD mainframe|^Console$/) },
      { title: 'Tony gets in', how: 'Tony uses the mainframe.', where: L => L.prompts(/SHIELD mainframe/) },
      { title: 'The Ray Gun', how: 'Get a Ray Gun from the Tesseract and upgrade it at the Infinity Stones.' },
      { title: 'The machine\'s parts', how: 'Bring the three parts to the machine by Tony\'s bed (one part carried at a time).', where: L => L.prompts(/Pick up the (?!key)|Add part/) },
      { title: 'Charge the machine', how: 'Shoot the machine with the upgraded Ray Gun 100 times.', where: L => at(L, 'ee_step_10_trig') },
      { title: 'Tony\'s dream', how: 'Everyone stands by the machine and Tony, without an armor, uses it: three rounds in his dream, the Cheese Cube. Read the code on the wall; the Cheese Gun is on its wall there.', where: L => L.prompts(/Use machine/) },
      { title: 'Find it', how: 'Find what the dream pointed at. Spider-Man can wear the black suit there (faster and tougher, but it takes him over after 150 s).', where: L => L.prompts(/Something is here|black suit/) },
      { title: 'The cell', how: 'Take the key and open the cell.', where: L => L.prompts(/Pick up the key|Cell door/).slice(0, 2) },
      { title: 'The Red Hulk', how: 'Hit the Red Hulk 20 times with the upgraded Ray Gun while he stands in the beach\'s salt water.', where: L => [...at(L, 'kill_red_hulk_0'), ...at(L, 'kill_red_hulk_1')] },
      { title: 'The corpse', how: 'Black Widow, then Bruce Banner (not the Hulk), go to the Red Hulk\'s corpse.' },
      { title: 'The four stations', how: 'Press the buttons in order, light the 25 plates, shoot the ten pop-up targets (1.5 s each), and bounce Cap\'s shield off the four dishes.', where: L => { const f = mq(L)?.machines, k = L.malibu?.()?.kit; if (!f || !k) return []; const all = name => k.named(name).map(e => k.center(e));
          return [...(f.a ? [] : L.prompts(/^Button$/)), ...(f.b ? [] : all('ee_step_17_b_plate').slice(0, 1)), ...(f.c ? [] : all('ee_step_17_c_target').slice(0, 1)), ...(f.d ? [] : all('ee_step_17_d_dish'))]; } },
      { title: 'The antidote', how: 'Bruce Banner (not the Hulk) adds the 115 antidote at the mainframe.', where: L => L.prompts(/Add the 115 antidote/) },
      { title: 'Spread it', how: 'Spread the antidote over Malibu: the Avengers save Malibu at the end of the round.', where: L => L.prompts(/Spread the 115 antidote/) },
    ] },
    { id: 'stones', name: 'The Infinity Stones', kind: 'MAP QUEST', steps: [
      { title: 'The Time Stone', how: 'Everyone stands at the Time Stone for 100 s during a round.', done: L => !!mq(L)?.stones.time, where: L => at(L, 'stone_time_start_trig') },
      { title: 'The Power Stone', how: 'Hit the Power Stone 25 times with Mjolnir: only Thor can focus it.', done: L => !!mq(L)?.stones.power, where: L => at(L, 'power_stone_start_trig') },
      { title: 'The Reality Stone', how: 'It zaps anyone within reach: neutralise it with Hawkeye\'s Electro-Shock arrow.', done: L => !!mq(L)?.stones.reality, where: L => at(L, 'stone_reality_start_trig') },
      { title: 'The Soul Stone', how: 'Find the glowing stone by Tony\'s bed, then kill zombies in its room. All four wake the upgrade pedestal (Pack-a-Punch).', done: L => !!mq(L)?.stones.soul, where: L => [...L.prompts(/glowing stone/), ...at(L, 'stone_soul_start_room')].slice(0, 1) },
    ] },
    { id: 'batman', name: 'The Dark Knight', kind: 'SIDE EGG', progress: L => { const f = mq(L); if (!f) return 0; return f.batSightings > 3 ? 3 : f.batmanGone ? 2 : f.batEggs >= 6 ? 1 : 0; }, steps: [
      { title: 'Something odd', how: 'Shoot the black car, find the scene with the batarang, and pick up the four strange objects around Malibu. A wall comes down.', where: L => L.prompts(/strange object/) },
      { title: 'Someone else', how: 'Walk up to the figure behind the wall.' },
      { title: 'Sightings', how: 'He shows up four more times around the map: get close before he vanishes.' },
    ] },
    { id: 'jail', name: 'The police jail', kind: 'MAP QUEST', progress: L => mq(L)?.cellOpen ? 1 : 0, steps: [
      { title: 'The key', how: 'One of three keys around the station opens the cell (it closes with another use, and the key comes back after a round).', where: L => L.prompts(/Pick up the key|Cell door/).slice(0, 2) },
    ] },
  ] },
  { map: 'nuketown', title: 'Nuketown', quests: [
    { id: 'nt-pap', name: 'Into the lab', kind: 'MAIN QUEST', progress: L => { const s = nt(L); if (!s) return 0;
      return s.pap ? 6 : s.placed || s.skull ? 5 : s.elevator ? 4 : s.tools.every(t => t.got) && s.power ? 3 : s.power ? 2 : s.bunker ? 1 : 0; }, steps: [
      { title: 'The transformers', how: 'Shoot the three transformers out in the streets: with all three blown, the bunker door swings open onto the lab.', where: L => nt(L)?.transformers ?? [] },
      { title: 'The power', how: 'Down in the lab, pull the second lever first, then the power switch.', where: L => nt(L)?.lever2 ? L.power() : L.prompts(/Pull the lever/) },
      { title: 'The tools', how: 'Pick up the screwdriver, the wire cutters and the hammer lying around the lab.', where: L => L.prompts(/^Take the (screwdriver|wire cutters|hammer)/) },
      { title: 'The panels', how: 'With the power on, repair the three panels of the key elevator, each with its own tool: the elevator lifts the skull key out of the pit.', where: L => L.prompts(/^Repair the panel/) },
      { title: 'The skull key', how: 'Take the skull from the elevator.', where: L => L.prompts(/Take the skull/) },
      { title: 'Hell', how: 'Place the skull at the sealed alcove in hell: a skull rises for 20 s, then the books and wall in front of Pack-a-Punch fall.', where: L => { const s = nt(L); return s?.placed ? [s.papAt] : L.prompts(/Place the skull/); } },
    ] },
    { id: 'nt-ee', name: 'The scientist', kind: 'MAIN QUEST', progress: L => nt(L)?.egg?.stepsDone ?? 0, steps: [
      { title: 'The door', how: 'Walk up to the door at the very end of the lab: someone is alive behind it.', where: L => { const s = nt(L)?.egg; return s && s.step === 1 ? [s.door] : []; } },
      { title: 'Knock', how: 'Knife the door and listen to the whole message.', where: L => { const s = nt(L)?.egg; return s && s.step === 2 ? [s.door] : []; } },
      { title: 'The files', how: 'Bring down the rocks in the lab with any explosive (a grenade, a launcher, the Ray Gun) and take the files behind them. Knife the door, then go prone at it and slide the files under.', where: L => { const s = nt(L)?.egg; return !s || s.step !== 3 ? [] : !s.rocks ? [s.rocksAt] : !s.files ? [s.filesAt] : [s.door]; } },
      { title: 'Key and radio', how: 'A key lies in the lab and a radio on the way down to hell: with the key open the vent above the door, then hand the radio through it.', where: L => { const s = nt(L)?.egg; return !s || s.step !== 4 ? [] : [...(s.key ? [] : [s.keyAt]), ...(s.radio ? [] : [s.radioAt]), ...(s.key && s.radio ? [s.door] : [])]; } },
      { title: 'Failsafe nodes', how: 'Disable the four failsafe nodes around the town, then go back to the door.', where: L => { const s = nt(L)?.egg; return !s || s.step !== 5 ? [] : s.buzzed ? [s.door] : s.nodes.filter(n => !n.off).map(n => n.at); } },
      { title: 'The way out', how: 'Hold out for 300 s of an endless round of sprinters. A truck comes down under parachutes at the end of the road: get in to escape, which ends the game as a win.', where: L => { const s = nt(L)?.egg; return s && s.landed ? [s.truckAt] : []; } },
    ] },
    { id: 'nt-rake', name: 'Rake Trap', kind: 'BUILDABLE', steps: [
      ...['Axe', 'Rake', 'Rope'].map(part => ntPart('rake', part)),
      { title: 'Build it', how: 'With all three parts press use at any of the three rake stations and stay close for 3 seconds.', done: L => !!nt(L)?.rake?.built, where: L => { const s = nt(L)?.rake; return s?.built ? [] : s?.stations ?? []; } },
      { title: 'Take it', how: 'Take a rake from any of the stations. You carry one at a time, and the stations never run out.', done: L => { const s = nt(L); return !!s?.heldRake || s?.rakesDown > 0; }, where: L => L.prompts(/^Pick up Rake/) },
      { title: 'Place it', how: 'The claymore key sets it down at your feet. A zombie that steps on it dies; it lasts 20 hits, you can have five down, and a placed rake can be picked up and moved.', done: L => nt(L)?.rakesDown > 0 },
    ] },
    { id: 'nt-shield', name: 'Zombie Shield', kind: 'BUILDABLE', steps: [
      ...['Car door', 'Dolly'].map(part => ntPart('shield', part)),
      { title: 'Build it', how: 'With both parts press use at any of the three shield stations and stay close for 3 seconds.', done: L => !!nt(L)?.shield?.built, where: L => { const s = nt(L)?.shield; return s?.built ? [] : s?.stations ?? []; } },
      { title: 'Take it', how: 'Take it from any of the stations, and again if it breaks. A station also repairs a damaged one.', done: L => !!nt(L)?.shield?.built && !L.prompts(/^Pick up Shield/).length, where: L => L.prompts(/^Pick up Shield/) },
    ] },
    { id: 'nt-perks', name: 'Falling perks', kind: 'MAP QUEST', steps: [
      ...[['specialty_quickrevive', 'Quick Revive', 'Its trigger covers the spawn.'], ['specialty_rof', 'Double Tap', 'Walk into its trigger.'],
        ['specialty_fastreload', 'Speed Cola', 'Walk into its trigger.'], ['specialty_additionalprimaryweapon', 'Mule Kick', 'Walk into its trigger (a small one).'],
        ['specialty_flakjacket', 'PhD Flopper', 'Walk into its trigger.'], ['specialty_deadshot', 'Deadshot', 'Walk into its trigger (a small one).']]
        .map(([perk, name, how]) => ({ title: name, how: `${how} The machine is called in: 10 s later it falls burning from the sky onto its crate pile (one at a time; the others wait their turn).`,
          done: L => !!nt(L)?.perks.find(d => d.perk === perk)?.landed,
          where: L => { const d = nt(L)?.perks.find(d => d.perk === perk); return d && !d.called ? [d.at] : []; } })),
    ] },
    { id: 'nt-free-perk', name: 'The closet', kind: 'SIDE EGG', steps: [
      { title: 'A free perk', how: 'A perk bottle waits in the closet beside the yellow house\'s back: drink it.', done: L => !!nt(L)?.freePerk, where: L => { const s = nt(L); return s && !s.freePerk ? [s.freePerkAt] : []; } },
    ] },
  ] },
  { map: 'gorod-krovi', title: 'Gorod Krovi', quests: [
    { id: 'gk-main', name: 'Love and War', kind: 'MAIN QUEST', progress: linear(GK_EE), steps: [
      { title: 'The generator', how: 'Kill a Valkyrie drone in Pavlov\'s basement, next to the generator: its power charges it.', where: L => [cw(-2724, 21764, -116)] },
      { title: 'The tubes', how: 'Start the generator (it runs for six minutes), then pull the levers at the six pneumatic tube terminals (Dragon Command, library, department store, barracks, factory, armory) so the air runs from the green source through every tube to the jammed one.', where: L => eeSpots(/Pull the lever|Start the generator/) },
      { title: 'The master cylinder', how: 'Take the master cylinder out of the jammed tube.', where: L => eeSpots(/master cylinder/) },
      { title: 'The password', how: 'Insert the master cylinder at S.O.P.H.I.A. in Dragon Command, shoot or knife the six rings to 0 6 0 7 6 4, then confirm. A wrong code locks it until the next round.', where: L => [GK_SOPHIA] },
      { title: 'Six figures', how: 'Find the six figures for the war map, in any order: shoot the anomaly over the alley; call a Dragon Strike on the puddle in the library street; run the library\'s eye trap; breathe the Guard of Fafnir\'s fire into the factory pipe; shoot the sewer switch behind Pavlov\'s; punch the safe in the red brick basement with the Gauntlet.', where: L => { const k = eeS()?.keys ?? []; return GK_KEYS.filter((_, i) => !k.includes(i)).map(p => cw(...p)); } },
      { title: 'Place the figures', how: 'Press the button by the war map in Dragon Command.', where: L => [GK_MAPBTN] },
      { title: 'Six tasks', how: 'Press "Start the next task" at the war map button, six times: defend a pod, escort a drone, kill a Mangler, timed buttons, a pursuit and the terminal last. Not during a Valkyrie round or a lockdown; a failed task can be retried after the next round.', where: L => { const s = eeSpots(/./); return s.length ? s : [GK_MAPBTN]; } },
      { title: 'The weapon core', how: 'Take the weapon core from S.O.P.H.I.A., then release the whelp in the start-area square: it flies off with it.', where: L => { const s = eeSpots(/weapon core/); return s.length ? s : [cw(-95, -241, 52)]; } },
      { title: 'Sophia leaves', how: 'Go to S.O.P.H.I.A. and watch her leave.', where: L => [GK_SOPHIA] },
      { title: 'The hatch', how: 'Everyone stands on the hatch in Dragon Command.', where: L => [cw(355, 4853, 149)] },
      { title: 'Nikolai', how: 'Wake the machine in the arena and win the fight.', where: L => [cw(54, -1440, 54)] },
    ] },
    { id: 'gk-pods', name: 'The dragon network', kind: 'MAP QUEST', steps: [
      { title: 'The power', how: 'Turn on the power in the department store.', done: L => !!L.session?.power, where: L => L.power() },
      ...[['Transmitter', 0], ['Code book', 1], ['Map', 2]].map(([t, i]) => ({ title: t, how: 'A risen zombie drops a code cylinder: insert it at the radio of its colour (red factory, yellow library, blue judicial), defend the pod that lands until it opens (15 kills around it), take its part and place it at the network console in the bunker under Dragon Command. Parts come in order: transmitter, code book, map.',
        done: L => !!pods()?.crafted || !!pods()?.placed?.includes(i), where: L => (pods()?.placed?.length ?? 0) === i ? podWhere(L) : [] })),
      { title: 'Ride the dragon', how: 'Call the dragon at a roost (500) and ride it to Pavlov\'s.', done: L => gf('dragonpavlovfirsttime'), where: L => gf('dragonridecrafted') ? L.prompts(/^Call the dragon|^Ride the dragon/) : [] },
    ] },
    { id: 'gk-shield', name: 'Guard of Fafnir', kind: 'BUILDABLE', steps: [
      ...[['dolly', 'head'], ['door', 'pelvis'], ['clamp', 'window']].map(([k, w]) => ({ title: `The dragon ${w}`, how: `The dragon ${w} lies at one of three spots, a different one each game.`,
        done: L => !!shield()?.built || !!shield()?.have?.includes(k), where: L => L.prompts(new RegExp(`^Pick up the dragon ${w}`)) })),
      { title: 'Build it', how: 'With all three parts, build it at the table in the bunker.', done: L => !!shield()?.built, where: L => shield()?.built ? [] : [cw(-431.25, 3541.5, -132)] },
      { title: 'Take it', how: 'Take the Guard of Fafnir from the table.', done: L => !!shield()?.quest?.used || gf('dragon_shield_used'), where: L => L.prompts(/^Take the Guard of Fafnir/) },
    ] },
    { id: 'gk-shield-up', name: 'Guard of Fafnir upgrade', kind: 'WEAPON UPGRADE', progress: linear([() => gf('drshup_step_1_done') || (shield()?.quest?.kills ?? 0) >= 50, () => (shield()?.quest?.runes ?? 0) >= 3, () => !!shield()?.quest?.bathed || gf('drshup_bathed_in_flame'), () => !!shield()?.quest?.done || gf('drshup_quest_done')]), steps: [
      { title: '50 kills', how: 'Kill 50 zombies with the shield, bashing or breathing fire.' },
      { title: 'The runes', how: 'Breathe fire on the three runes (judicial, factory, library) from close enough, looking at them.', where: L => (gkr()?.shield?.runes ?? []).filter(r => !r.hit).map(r => r.p.clone()) },
      { title: 'Bathe in flame', how: 'Stand in the dragon\'s fire pass with the shield raised, and take no hit.' },
      { title: 'Quench it', how: 'Quench the shield in the start-area fountain.', where: L => [cw(606, 503, 101)] },
    ] },
    { id: 'gk-gauntlet', name: 'Gauntlet of Siegfried', kind: 'WONDER WEAPON', progress: L => { const g = gauntlet(); return !g ? 0 : g.state === 'done' && g.S?.given ? 8 : GAUNTLET_NO[g.state] ?? 0; }, steps: [
      { title: 'The boards', how: 'Shoot or knife the boards in the sewer room under Pavlov\'s.', where: L => n(gauntlet()?.positions?.BOARDS) },
      { title: 'The dragon egg', how: 'Take the egg that rolls out.', where: L => n(gauntlet()?.positions?.EGG_PICK) },
      { title: 'Cook it', how: 'Lay the egg on one of the four cook spots (fountain, opera street, red brick, yellow house) and let the dragon\'s fire burn over it. It cools for a full round: then take it back.', where: L => { const g = gauntlet(); if (!g) return []; return g.state === 'carry' ? Object.values(g.spots ?? {}) : n(g.spots?.[g.S?.spot]); } },
      { title: 'Napalm kills', how: 'Kill napalm zombies (5 solo, 2 more per player).' },
      { title: 'Piercing kills', how: 'Kill zombies with bullets that went through another zombie first (two kills on one shot).' },
      { title: 'Melee kills', how: 'Kill zombies with melee; the Guard of Fafnir\'s breath counts.' },
      { title: 'The incubator', how: 'Place the egg in the incubator in Pavlov\'s sewer and defend it until it\'s full, wait a round, then take the egg.', where: L => n(gauntlet()?.positions?.INC_PROMPT) },
      { title: 'The grave', how: 'Dig at the grave by the fountain and take the Gauntlet of Siegfried before it sinks back.', where: L => n(gauntlet()?.positions?.GRAVE) },
    ] },
    { id: 'gk-strike', name: 'Dragon Strike', kind: 'MAP QUEST', progress: linear([() => gf('dragonpavlovfirsttime'), () => gf('dragonstrikeunlocked'), () => gf('dragonstrikequestcomplete'), () => gf('dragonstrikeacquired') || !!strike()?.owned]), steps: [
      { title: 'Reach Pavlov\'s', how: 'Ride the dragon to Pavlov\'s.' },
      { title: 'The console', how: 'Every player activates the Dragon Strike console on Pavlov\'s second floor (a press only holds while that player stays on the floor).', where: L => [cw(-3218.23, 21374.2, 160)] },
      { title: 'The lockdown', how: 'Survive the lockdown that follows.' },
      { title: 'Take it', how: 'Take the Dragon Strike from the console.', where: L => [cw(-3218.23, 21374.2, 160)] },
    ] },
    { id: 'gk-strike-up', name: 'Dragon Strike upgrade', kind: 'WEAPON UPGRADE', progress: linear([() => (strike()?.stage ?? 0) >= 2, () => gf('dragonstage3started'), () => gf('dragonstage4started') || gf('draconiteavailable'), () => gf('draconiteavailable'), () => strike()?.owned === 'upgraded']), steps: [
      { title: 'Strike kills', how: 'Kill zombies with the Dragon Strike (30 solo, 10 more per player).' },
      { title: 'The banners', how: 'Hit each banner left in the library with a Dragon Strike fireball.', where: L => (strike()?.banners ?? []).filter(b => b.live && !b.hit).map(b => cw(...b.at)) },
      { title: 'The console again', how: 'Activate the Dragon Strike upgrade at the console on Pavlov\'s second floor: a lockdown starts.', where: L => [cw(-3218.23, 21374.2, 160)] },
      { title: 'The lockdown', how: 'Kill zombies with the Dragon Strike during the lockdown (20 solo, 5 more per player; it refills after each use). Too few, and you press the console again.' },
      { title: 'Take it', how: 'Take the upgraded Dragon Strike from the console.', where: L => [cw(-3218.23, 21374.2, 160)] },
    ] },
    wearQuest('raz', 'Mangler Helmet', [
      { title: 'Arm cannons', how: 'Shoot the arm cannon off five Manglers.', done: L => (wear()?.raz?.arms ?? 0) >= 5 || !!wear()?.open?.includes('raz') },
      { title: 'Face masks', how: 'Shoot the face mask off five Manglers.', done: L => (wear()?.raz?.masks ?? 0) >= 5 || !!wear()?.open?.includes('raz') }]),
    wearQuest('sentinel', 'Valkyrie Hat', [
      { title: 'Drone arms', how: 'Shoot all three arms off five Valkyrie drones.', done: L => (wear()?.sentinel?.arms ?? 0) >= 5 || !!wear()?.open?.includes('sentinel') },
      { title: 'Drone cameras', how: 'Shoot the camera off five Valkyrie drones.', done: L => (wear()?.sentinel?.cams ?? 0) >= 5 || !!wear()?.open?.includes('sentinel') }]),
    wearQuest('wings', 'Dragon Wings', [
      { title: 'The shield', how: 'Use the Guard of Fafnir.', done: L => !!wear()?.wings?.shield || !!wear()?.open?.includes('wings') },
      { title: 'The Gauntlet', how: 'Take the Gauntlet of Siegfried.', done: L => !!wear()?.wings?.gauntlet || !!wear()?.open?.includes('wings') },
      { title: 'The Dragon Strike', how: 'Take the Dragon Strike.', done: L => !!wear()?.wings?.strike || !!wear()?.open?.includes('wings') },
      { title: 'Every roost', how: 'Ride the dragon from each roost: library, factory and judicial.', done: L => (wear()?.wings?.roosts?.length ?? 0) >= 3 || !!wear()?.open?.includes('wings') }]),
    { id: 'gk-dead-ended', name: 'Dead Ended (music egg)', kind: 'SIDE EGG', progress: L => eggs()?.songs?.includes('dead_ended') ? 1 : 0, steps: [
      { title: 'Three bottles', how: 'Find and use the three vodka bottles.', where: L => (eggs()?.bottles ?? 3) < 3 ? [[2302, 2202.5, -121], [-85.5, 1357, 56.5], [35.5, 2542.5, -119]].map(p => cw(...p)) : [] },
    ] },
    { id: 'gk-ace', name: 'Ace of Spades (music egg)', kind: 'SIDE EGG', progress: L => eggs()?.songs?.includes('ace_of_spades') ? 1 : 0, steps: [
      { title: 'Three cards', how: 'Find and use the three playing cards.', where: L => (eggs()?.cards ?? 3) < 3 ? [[-501.5, 5647, 342], [-2481.5, 3040.5, 348], [-2861.5, 21796, 41]].map(p => cw(...p)) : [] },
    ] },
    { id: 'gk-sam', name: 'Samantha\'s Sorrows', kind: 'SIDE EGG', progress: L => { const t = eggs()?.sam?.step ?? 0; return t >= 8 ? 4 : t >= 6 ? 3 : t >= 4 ? 2 : t >= 1 ? 1 : 0; }, steps: [
      { title: 'Into the fire', how: 'Throw a monkey bomb into three different areas while the dragon\'s fire burns there.', where: L => { const s = eggs()?.sam; if (!s || s.step) return []; const a = gauntlet()?.areas ?? {}, b = gkr()?.gk?.hazard?.active?.()?.area; const left = Object.keys(a).filter(k => !s.areas.includes(k)); return (left.includes(b) ? [b] : left).map(k => a[k].clone()); } },
      { title: 'The figure', how: 'Use the figure that rises behind the fountain.', where: L => [3, 5].includes(eggs()?.sam?.step) ? [cw(342.843, -226.074, -3.056)] : [] },
      { title: 'Five figures', how: 'Shoot five figures around the map, one at a time, each within 90 s. A miss sends you back to the fountain figure.', where: L => { const s = eggs()?.sam; if (s?.step === 5) return [cw(342.843, -226.074, -3.056)]; const p = s?.step === 4 && s.timed?.[s.i]; return p ? [cw(p[0], p[1], p[2])] : []; } },
      { title: 'The last figure', how: 'Use the figure that appears by the fountain.', where: L => eggs()?.sam?.step === 6 ? [cw(335.553, -235.839, 0.341)] : [] },
    ] },
    { id: 'gk-logs', name: 'Ethereal 935 logs', kind: 'SIDE EGG', progress: L => { const s = eggs()?.logs?.stage ?? 0; return s >= 4 ? 2 : s >= 2 ? 1 : 0; }, steps: [
      { title: 'First contact', how: 'From round 14, two round ends bring the voices.' },
      { title: 'Ten logs', how: 'Shoot the glowing logs one after another.', where: L => { const s = eggs()?.logs; return s?.stage === 2 && GK_LOGS[s.i] ? [cw(...GK_LOGS[s.i])] : []; } },
    ] },
    { id: 'gk-time', name: 'Time attack', kind: 'SIDE EGG', steps: [
      ...[[5, 'Wrench'], [10, 'Ritual Dagger'], [15, 'Fire Axe'], [20, 'Sword']].map(([r, w], i) => ({ title: `Round ${r}`, how: `Finish round ${r} under the time limit: the ${w} goes up on the alley tunnel wall.`,
        done: L => ((eggs()?.timeAttack ?? eggs()?.ta)?.reward ?? 0) > i, where: L => ((eggs()?.timeAttack ?? eggs()?.ta)?.reward ?? 0) > i ? L.prompts(new RegExp(`^Buy ${w}`)) : [] })),
    ] },
  ] },
];

// Moon's Big Bang Theory, one step per stage of moon-progression.js (in its order)
const MOON_STAGES = [
  { stage: 'power', title: 'Power', how: 'Turn on the power in the MPD room.' },
  { stage: 'simon', title: 'Samantha says', how: 'Repeat the flashing six-colour sequence at the four computers outside Receiving Bay.', where: L => L.targets('sq_ss_button') },
  { stage: 'security_start', title: 'The Hacker', how: 'Find the Hacker in the laboratories, then hack a laboratory button (500 points).', where: L => [...L.targets('hacker', t => t.e.id === L.moon.quest.hackerId), ...L.targets('struct_osc_button')] },
  { stage: 'security', title: 'Green terminals', how: 'Hack the four green terminals that light up within 70 s.', where: L => L.targets('struct_osc_st', t => L.moon.quest.securityTargets?.includes(t.e.id) && !L.moon.quest.security.has(t.e.id)) },
  { stage: 'buttons', title: 'The laboratory buttons', how: 'Press all four laboratory buttons within 3.5 s (a team effort, or be quick).', where: L => L.targets('struct_osc_button') },
  { stage: 'excavator', title: 'Pi breaches', how: 'Let the excavator Pi breach Tunnel 6, then hack its console in Receiving Bay.', where: L => L.targets('digger', t => t.id === 'hangar') },
  { stage: 'sphere', title: 'The Vril Sphere', how: 'Follow the Vril Sphere through the tunnels to the MPD; when it stops above Receiving Bay, shoot it with the Wave Gun.', where: L => n(L.moon.quest.spherePosition && L.v(L.moon.quest.spherePosition)) },
  { stage: 'tank', title: 'The first collector', how: 'Kill zombies near the MPD\'s first collector until it holds 25 souls.', where: L => L.ents('sq_first_tank') },
  { stage: 'switch', title: 'The MPD switch', how: 'Use the switch beside the MPD.', where: L => L.targets('sq_knife_switch') },
  { stage: 'plates', title: 'The Area 51 plates', how: 'Grenade the plates on the shelf in Area 51, throw a Gersh Device beside them, then a QED beside the plates in Receiving Bay.', where: L => L.moon.quest.plates === 'receiving' ? L.ents('sq_ctvg_tp2') : L.ents('sq_cassimir_plates') },
  { stage: 'wire', title: 'The wire', how: 'Find the wire in the laboratories and connect it at the Receiving Bay terminal.', where: L => L.moon.quest.wire ? L.targets('sq_charge_terminal') : L.targets('sq_wire_pos', t => t.e.id === L.moon.quest.wireId) },
  { stage: 'charge', title: 'Charge the Vril Device', how: 'Hold F at the Receiving Bay terminal for 60 s.', where: L => L.targets('sq_charge_terminal') },
  { stage: 'tanks', title: 'All four collectors', how: 'Fill all four MPD collectors with 25 souls each.', where: L => [...L.ents('sq_first_tank'), ...L.ents('sq_second_tank')].filter((p, i) => !(L.moon.quest.tanks?.[i] >= 25)) },
  { stage: 'swap', title: 'The charged device', how: 'Insert the charged Vril Device into the MPD.', where: L => L.targets('sq_pyramid_console') },
  { stage: 'final_simon', title: 'The final sequences', how: 'Repeat the final colour sequences, three games of them.', where: L => L.targets('sq_ss_button') },
  { stage: 'final_qed', title: 'QED at the MPD', how: 'Throw a QED beside the sphere at the MPD.', where: L => L.targets('sq_pyramid_console') },
  { stage: 'final_gersh', title: 'Gersh at the computers', how: 'Throw a Gersh Device beside the sphere at the colour computers.', where: L => L.ents('be2_pos') },
  { stage: 'launch', title: 'Launch', how: 'The missiles launch: watch the Earth.' },
];
JOURNAL.find(m => m.map === 'moon').quests[0].steps = MOON_STAGES;

export const questsFor = map => JOURNAL.find(m => m.map === map)?.quests ?? [];
