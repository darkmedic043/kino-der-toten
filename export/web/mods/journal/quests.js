// The journal's quest book (mods/journal): every map's Easter eggs, side quests and buildables, step by step.
// Static text (title, how) is shown by JOURNAL.EXE on any map; a step's text unlocks for good once the step has been
// done (kino.mods.journal). The functions only run on the quest's own map, with the live context L (mods/journal/mod.js):
//   L.prompts(re)    positions of the map's interactions shown right now whose prompt matches re
//   L.nodes(re)      positions of visible map nodes whose name matches re (builder markers, quest props)
//   L.ents(name)     positions of the map's entities with that targetname (BO1 maps)
//   L.castle, L.de   Der Eisendrache: window.kino.castle and the quest spots exported by its ee/side/side2 modules
// A quest is linear (progress(L) -> how many steps are done) or not (step.done(L) per step, in any order).
// step.where(L) -> [Vector3] puts markers on the screen while the quest is tracked (only once the step is recorded).

const n = v => [v].flat().filter(Boolean);
const bowStage = (L, el) => {   // Der Eisendrache bow quest -> steps done: start, arrow, its own steps, place, souls, take
  const s = L.castle?.bows?.state()?.[el], Q = L.castle?.bows?.sites?.[el]; if (!s || !Q) return 0;
  const k = Q.steps.length;
  return s.stage === 'idle' ? 0 : s.stage === 'steps' ? (s.owner == null ? 1 : 2 + Q.steps.indexOf(s.step)) : s.stage === 'place' ? 2 + k
    : s.stage === 'souls' ? 3 + k : s.stage === 'ready' ? 4 + k : 5 + k;
};
const site = (L, el) => L.castle?.bows?.sites?.[el] ?? {};
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
      { title: 'The summoning key', how: 'Shoot the six summoning targets around the lab teleporter with a bow. The past laboratory opens.', where: L => L.de?.SUMMON ?? [] },
      { title: 'Into the past', how: 'One of seven targets around the castle lights up: hit it with an upgraded bow, then the next, four in a row (anything else hit, or the round ending, resets it). Primed, the lab teleporter takes you to the past for the rest of the round. In the past: read the safe\'s combination, take the MPD canister and the lab fuse. In the present, the combination opens the safe (the golden key and two tesla connectors). In the past again the key opens the crate: the channeling stone. Put the canister in the MPD and the stone on the cracked plinth by the road.',
        where: L => { const s = L.castle?.ee?.state(), d = L.de; if (!s || !d) return []; const items = L.prompts(/combination|canister|golden key|channeling stone|safe/i);
          if (items.length) return items; return s.travel.ready ? [d.PAD.present] : s.travel.lit != null ? n(d.TRAVEL[s.travel.lit]) : d.TRAVEL; } },
      { title: 'The Keeper', how: 'Take the Vril device from the undercroft to the statue. The Keeper rises and floats to the four channeling stones in turn: kill 12 zombies around each while it charges it.',
        where: L => { const s = L.castle?.ee?.state(), v = L.prompts(/Vril device/); if (v.length) return v; const st = L.de?.STONES?.[s?.protector?.stone ?? 0]; return n(st?.zone); } },
      { title: 'Simon says', how: 'At the consoles on the lower tower and the launch platform: watch the runes, then press use while the monitor shows each rune in the same order (3, 4, then 5 runes).',
        where: L => (L.de?.SPOT.consoles ?? []).filter((p, k) => L.castle?.ee?.state().simon?.[k]?.phase !== 'done') },
      { title: 'Rockets to the moon', how: 'Put the two tesla connectors on the Death Ray bases on the roof, then pull its lever.',
        where: L => { const p = L.prompts(/tesla connector|Death Ray lever/); return p.length ? p : n(L.de && [L.de.SPOT.tcLower, L.de.SPOT.tcLaunch, L.de.SPOT.lever]).flat(); } },
      { title: 'The lab fuse', how: 'Put the lab fuse (from the past) in the fuse box on the roof.', where: L => n(L.de?.SPOT.fuseBox) },
      { title: 'To the boss', how: 'Plant the Ragnarok DG-4 on one of the four plates around the MPD in the undercroft (or, without one, touch the MPD).', where: L => [...(L.de?.SPOT.plates ?? []), ...n(L.de?.SPOT.mpd)] },
      { title: 'Defeat the Keeper', how: 'It teleports around the arena casting the bows\' spells. Every third cast it charges a storm at the centre: plant the Ragnarok under it (or hit it with an upgraded bow) to stun it. Only stunned does it take damage (headshots double). Unstunned, the storm hits everyone outside the five safe circles. Three phases.' },
    ] },
    { id: 'storm', name: 'Storm Bow', kind: 'BOW UPGRADE', progress: L => bowStage(L, 'storm'), steps: [
      { title: 'Start the quest', how: 'Shoot the weather vane on top of the clock tower with Wrath of the Ancients.', where: L => n(site(L, 'storm').start) },
      ARROW('storm'),
      { title: 'The beacons', how: 'Shoot the three beacons far out from the castle (the wall, the cliff, the rocket pad).', where: L => site(L, 'storm').beacons ?? [] },
      { title: 'Wall-run', how: 'While the undercroft\'s gravity is low, wall-run through its five triggers without landing.', where: L => site(L, 'storm').wallrun ?? [] },
      { title: 'The batteries', how: 'Fill the three storm batteries (gatehouse, clock tower, rocket pad) with 5 kills each; then stand on a filled battery and fire a fully drawn arrow at a beacon, once per beacon.', where: L => (site(L, 'storm').batteries ?? []).map(b => b.at) },
      { title: 'Reforge', how: 'Reforge the arrow on the roof.', where: L => n(site(L, 'storm').reforge) },
      ...BOW_TAIL('storm'),
    ] },
    { id: 'rune', name: 'Fire Bow', kind: 'BOW UPGRADE', progress: L => bowStage(L, 'rune'), steps: [
      { title: 'Start the quest', how: 'Shoot the clock on the clock tower wall with Wrath of the Ancients.', where: L => n(site(L, 'rune').start) },
      ARROW('rune'),
      { title: 'The obelisk', how: 'Just after a rocket test fire (within 7.5 s), shoot the obelisk by the rocket pad: a magma ball rises over the roof.', where: L => n(site(L, 'rune').obelisk) },
      { title: 'The runic circles', how: 'Shoot each runic circle (road, rampart, roof) while flying off a launch pad, then charge each with 9 kills standing in it (a symbol lights every 3).', where: L => (site(L, 'rune').circles ?? []).map(c => c.trig) },
      { title: 'The clock', how: 'Turn the clock in the clock tower: its wheel shows one fireplace and keeps that fireplace\'s circle.', where: L => n(site(L, 'rune').clock) },
      { title: 'Magma golf', how: 'Standing in the circle\'s pool, each arrow\'s landing makes the next pool; get an arrow into the fireplace the wheel shows (under 3 shots: a Max Ammo). 4 misses and it waits for the next round.', where: L => n(L.castle?.bows?.golfPool?.()) },
      { title: 'The fireplace', how: 'Use the fireplace to take the magma.', where: L => L.prompts(/Take the magma/) },
      { title: 'Reforge', how: 'Reforge the arrow on the roof.', where: L => n(site(L, 'rune').reforge) },
      ...BOW_TAIL('rune'),
    ] },
    { id: 'wolf', name: 'Wolf Bow', kind: 'BOW UPGRADE', progress: L => bowStage(L, 'wolf'), steps: [
      { title: 'The paintings', how: 'Holding a bow, use the four king paintings in their order 1-4 (they are dealt to four walls at random; a wrong one starts over). A wall in the undercroft breaks.', where: L => { const p = L.prompts(/Touch the painting/); return p.length ? p : Object.values(site(L, 'wolf').paintings ?? {}); } },
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
      { title: 'The guards', how: 'During a rocket test fire, pull the wall switch at the rocket pad, then within 20 s the lever on the landing pad\'s console. The guards drop beside it.', done: L => { const s = L.castle?.craft?.state(); return !!s && (s.built.spike || s.have.spike.includes('guards')); }, where: L => L.prompts(/Pull the switch|Pull the lever|Pick up the guards/) },
      { title: 'Build it', how: 'Build it at its table in the undercroft.', done: L => !!L.castle?.craft?.state().built.spike, where: L => L.nodes(/^CASTLE_BENCH_spike$/) },
      { title: 'Take it', how: 'Take it from the table: it fills your operator weapon slot (Y).', done: L => window.kino?.operator?.current === 'ragnarok', where: L => L.nodes(/^CASTLE_BENCH_spike$/) },
    ] },
    { id: 'shield', name: 'Rocket Shield', kind: 'BUILDABLE', steps: [
      ...[['dolly', 'the eagle'], ['clamp', 'the window'], ['door', 'the fuel tank']].map(([id, label]) => ({ title: label[0].toUpperCase() + label.slice(1),
        how: `Its part lies at one of a few spots each game: look for ${label}.`, done: L => { const s = L.castle?.craft?.state(); return !!s && (s.built.shield || s.have.shield.includes(id)); }, where: L => L.prompts(new RegExp('Pick up ' + label)) })),
      { title: 'Build it', how: 'Build it at any of the three open workbenches.', done: L => !!L.castle?.craft?.state().built.shield, where: L => L.nodes(/^CASTLE_BENCH_open_\d+$/) },
      { title: 'Take it', how: 'Take it from the bench it was built at (again for free if it breaks). H raises it.', done: L => !!window.kino?.rocketShield?.owned, where: L => L.prompts(/Take the Rocket Shield/) },
    ] },
    { id: 'plates', name: 'Pressure plates', kind: 'SIDE EGG', progress: L => (L.castle?.side?.state().pads.length ?? 0) >= 4 ? 1 : 0, steps: [
      { title: 'The four plates', how: 'Stand on each of the undercroft pyramid\'s four pressure plates for 3 s. From then on a power-up drops every time the gravity goes low.', where: L => (L.de?.PADS ?? []).filter((p, k) => !L.castle?.side?.state().pads.includes(k)) },
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
      { title: 'The gramophones', how: 'Play the three gramophones around the castle.', where: L => { const p = L.prompts(/Play the gramophone/); return p.length ? p : L.de?.GRAMOPHONES ?? []; } },
    ] },
    { id: 'deadagain', name: 'Dead Again (music egg)', kind: 'SIDE EGG', progress: L => (L.castle?.side2?.state().bears ?? 0) >= 3 ? 1 : 0, steps: [
      { title: 'The teddy bears', how: 'Squeeze the three teddy bears hidden around the castle.', where: L => L.prompts(/Squeeze the teddy bear/) },
    ] },
    { id: 'skulls', name: 'In Plain Sight skulls', kind: 'SIDE EGG', progress: L => (L.castle?.side2?.state().skulls.length ?? 0) >= 3 ? 1 : 0, steps: [
      { title: 'Break the skulls', how: 'Chew In Plain Sight: three floating skulls show. Break each with an upgraded-bow arrow; a pile grows in the lab, and with three it gives a power-up.', where: L => [...(L.de?.SKULLS ?? []), ...L.prompts(/Take the skulls/)] },
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
      { title: 'The radios', how: 'Find and use every hidden music trigger around the map.', where: L => L.ents('8bitsongs') },
    ] },
  ] },

  { map: 'kino', title: 'Kino der Toten', quests: [
    { id: 'reels', name: 'Film reels', kind: 'MAP QUEST',
      progress: L => { const r = L.reels(); if (!r) return 0; const i = r.installed.length; return i >= 3 ? 5 : i ? 4 : r.carried ? 3 : r.room || r.reels.some(x => x.collected) ? 2 : L.session.teleporter === 'linked' || L.session.teleporter === 'cooldown' ? 1 : 0; },
      steps: [
        { title: 'Link the teleporter', how: 'With the power on, use the teleporter pad on the stage, then link it at the mainframe pad in the lobby within 30 s.', where: L => [...L.ents('trigger_teleport_pad_0'), ...L.ents('pf16_auto1')] },
        { title: 'A room outside time', how: 'Teleport to the projection room. On the way back you may land in a room outside time for a few seconds.', where: L => L.ents('trigger_teleport_pad_0') },
        { title: 'Take a film reel', how: 'In the room outside time, take the film reel before it pulls you back.', where: L => (L.reels()?.reels ?? []).filter(r => !r.collected).map(r => L.v(r.position)) },
        { title: 'Load the projector', how: 'Carry the reel to the projector in the projection room and load it.', where: L => L.ents('trigger_change_projector_reels') },
        { title: 'All three films', how: 'Find and project all three film reels.', where: L => L.ents('trigger_change_projector_reels') },
      ] },
    { id: 'meteors', name: '115 (music egg)', kind: 'SIDE EGG', progress: L => (L.meteors() ?? 0) >= 3 ? 1 : 0, steps: [
      { title: 'The meteor fragments', how: 'Find the three glowing meteor fragments around the theater and listen to each.', where: L => L.ents('meteor_egg_trigger') },
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
    { id: 'flytrap', name: 'The Fly Trap', kind: 'SIDE EGG', progress: L => { const v = String(L.tile('giant-flytrap')?.value() ?? ''); return v === 'done' ? 2 : v && v !== 'not started' ? 1 : 0; }, steps: [
      { title: 'Shoot the fly trap', how: 'Shoot the fly trap with a Pack-a-Punched gun.', where: L => L.nodes(/^GIANT_FLYTRAP$/) },
      { title: 'Hide and seek', how: 'Three things appear around the map (a monkey bomb, a Bowie knife teddy bear, a perk bottle teddy bear): shoot all three. The prize spins in the fly trap room: take it.', where: L => [...L.nodes(/^GIANT_EE_/), ...L.nodes(/^GIANT_PRIZE/)] },
    ] },
    { id: 'song', name: 'Beauty of Annihilation', kind: 'SIDE EGG', progress: L => L.tile('giant-song')?.done() ? 1 : 0, steps: [
      { title: 'The spine beakers', how: 'Find and use the three beakers with a brain and spine in them.', where: L => L.nodes(/^GIANT_JAR_/) },
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
  { stage: 'tanks', title: 'All four collectors', how: 'Fill all four MPD collectors with 25 souls each.', where: L => [...L.ents('sq_first_tank'), ...L.ents('sq_second_tank')] },
  { stage: 'swap', title: 'The charged device', how: 'Insert the charged Vril Device into the MPD.', where: L => L.targets('sq_pyramid_console') },
  { stage: 'final_simon', title: 'The final sequences', how: 'Repeat the final colour sequences, three games of them.', where: L => L.targets('sq_ss_button') },
  { stage: 'final_qed', title: 'QED at the MPD', how: 'Throw a QED beside the sphere at the MPD.', where: L => L.targets('sq_pyramid_console') },
  { stage: 'final_gersh', title: 'Gersh at the computers', how: 'Throw a Gersh Device beside the sphere at the colour computers.', where: L => L.ents('be2_pos') },
  { stage: 'launch', title: 'Launch', how: 'The missiles launch: watch the Earth.' },
];
JOURNAL.find(m => m.map === 'moon').quests[0].steps = MOON_STAGES;

export const questsFor = map => JOURNAL.find(m => m.map === map)?.quests ?? [];
