// Malibu Drive's quests and side systems (_easter_egg.gsc, _ee_step_4_lock1.gsc, _infinity_stones.gsc, _police_station.gsc,
// _tesserrect_suitcase.gsc, _asgard.gsc's summon pad, _random_easter_eggs.gsc, _zombiemode.gsc's Red Hulk):
//   Parts: one at a time (the original's player.has_part), shown on the right ("Part: Key").
//   Bifrost summon pad (the driveway, `asgard_summon_trig`): from round 2, back up to Asgard (to change hero); three
//     uses a round.
//   The Tesseract: the Mystery Box (BOX markers at the 14 `tesserrect_spawn` spots) wears the Tesseract case and starts at a
//     random one; no rubble where it isn't.
//   Police station jail: one of three keys (random) opens the cell door; it closes again with another use and the key
//     comes back after the round.
//   Infinity Stones (the map's Pack-a-Punch, at `upgrade_trig` in the Ashton furniture store, sealed until all four are in):
//     Time (everyone stands at it while it charges, 100 s), Power (25 Mjolnir hits; only Thor can focus it), Reality
//     (it zaps anyone near it; the Electro-Shock arrow neutralises it), Soul (found by Tony's bed; a zombie killed in the
//     room fills it). Each goes into the pedestal, turning.
//   Batman: the batmobile (shoot it), the batarang scene and four batarangs open his wall; walk up to him and he vanishes,
//     then shows up four more times around the city.
//   The main Easter egg (the 18 steps of _easter_egg.gsc; dialogue as the original): Nick Fury's briefing; the analysis
//     tank (a charged zombie: one hit by the battery Mjolnir charges, held there with Scarlet's telekinesis) and the
//     8000 server bribe; Tony's server break-in at the Best Eastern (Windows updates: come back next round); the hidden
//     Group 935 base (the loose brick) and its three locks (the dials 2-3-9, two consoles hit by the same player within
//     15 s, Mjolnir to charge the third); the Hulk smashes the inner vault, the last one costs 10000; the mainframe
//     consoles (heroes who know computers: Tony, Banner, Vision, Widow, one per player); a Ray Gun, upgraded with the
//     stones; the three parts for Tony's bed machine, charged by 100 upgraded Ray Gun hits; the trip into Tony's dream
//     (the Cheese Cube: three rounds, the code on the wall, the Cheese Gun on its wall); what Tony found (the black suit
//     for Spider-Man); the cell key, the Red Hulk (only hurt by the upgraded Ray Gun while he stands in the salt water),
//     Widow and Banner at his corpse; the four stations (button order, the lit plates, the pop-up targets, Cap's shield
//     on the four dishes); Banner's antidote, and the game is won at the end of the next round.
// Co-op: every change of the quests' state is an ordered event on the map's sync layer (kit.sync, Der Eisendrache's
// sync.js), applied in the same order on every client with the host's random stream (key, valve and button orders,
// Batman's spots); the player who caused it gets the personal part (points, parts, teleports). The host runs what
// touches zombies (the tank, the battery, the Red Hulk, kills in the Soul Stone's room) and the timers (the Time Stone,
// the pop-up targets, the second console); everyone checks their own position (the Reality Stone's zaps, the plates,
// Batman, the corpse, the cell) and reports it.
import * as THREE from 'three';

const W_ = n => 'malibu_' + n;
const RAY = 'ray_gun_zm';

export function setupQuests(kit, heroes, tony, powers) {
  const { api, one, named, center, say, dialog, wait, move, nodes, show, solid, sound, model, figure, remove, now, feet, v3, onImpact, sync } = kit;
  const { world, session, host, player, data, enemies, toast, announce } = api;
  const name = () => heroes.name();
  const is = id => heroes.is(id);
  const hero = () => heroes.hero()?.id ?? null;
  const hulk = () => !!heroes.form()?.hp && is('banner');
  const up = d => new THREE.Vector3(0, d, 0);
  const codXY = (x, y) => new THREE.Vector3(x, 0, -y);
  // an ordered event: ev(type, handler(data, ctx)) -> fire(data)
  const ev = (type, fn) => { sync.on('mq:' + type, fn); return (d = {}) => sync.act('mq:' + type, d); };
  const who = () => ({ who: name(), hero: hero() });
  let talking = false;   // level.dialog_playing
  const talk = async steps => { if (talking) return false; talking = true; try { for (const [d, t] of steps) { if (d) await wait(d); say(t); } } finally { talking = false; } return true; };
  const boxOf = e => e?.bounds ? new THREE.Box3(v3(e.bounds[0]), v3(e.bounds[1])) : e ? new THREE.Box3().setFromCenterAndSize(v3(e.origin), new THREE.Vector3(1, 1, 1).multiplyScalar(2 * (e.radius ?? 40))) : null;
  const inside = (e, p, pad = 0) => { const b = boxOf(e); return !!b && b.clone().expandByScalar(pad).containsPoint(p); };
  // an ENT node of a name that several entities share: the one nearest that entity
  const nodeAt = (n, p) => nodes(n).map(o => ({ o, d: new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).distanceTo(p) })).sort((a, b) => a.d - b.d)[0]?.o ?? null;
  const hasRay = up2 => session.inventory.some(w => w.id === RAY && (!up2 || w.upgraded));
  const upgradedHeld = () => session.def?.id === RAY && !!session.weapon?.upgraded;
  // damage triggers: an impact within the trigger (padded) with the weapon (or any); local, the handler fires an event
  const dmg = [];
  const damageTrigger = (e, fn, pad = 24) => { const d = { e, fn, pad, on: true }; dmg.push(d); return d; };
  onImpact((p, weapon, kind) => { for (const d of [...dmg]) if (d.on && inside(d.e, p, d.pad)) d.fn(weapon, kind, p); });
  // waiting for the next round's end (the host's round; guests hear it from its snapshot)
  const roundWaiters = [];
  host.on('roundEnd', () => { const w = roundWaiters.splice(0); for (const r of w) r(); });
  const nextRound = () => new Promise(r => roundWaiters.push(r));

  // ---------------------------------------------------------------- parts (each player their own)
  let part = null;   // {id, label}
  const partHud = document.createElement('div');
  partHud.style.cssText = 'position:fixed;right:22px;top:52%;z-index:30;font:700 13px Arial,Helvetica,sans-serif;color:#ffe066;text-shadow:0 1px 2px #000;pointer-events:none';
  document.body.append(partHud);
  const setPart = p => { part = p; partHud.textContent = p ? 'Part: ' + p.label : ''; };
  const canTake = () => { if (part) { say('[i] You already have a part'); return false; } return true; };
  const gotPart = (ctx, id, label) => { if (ctx.mine) { setPart({ id, label }); sound('pickup_part', { volume: .6 }); } };

  // ---------------------------------------------------------------- Bifrost summon pad (back to Asgard)
  const pad = one('asgard_summon_trig'), padFx = one('asgard_summon_fx_0');
  let padUses = 0, padRoundOk = false;
  host.on('roundEnd', () => { padRoundOk = true; padUses = 0; });
  const padUse = ev('pad', async () => {
    padUses++;
    for (let i = 0; i < 5; i++) { const f = one('asgard_summon_fx_' + i); if (f) kit.fx(v3(f.origin).add(up(20)), 0xbfe6ff, 30); await wait(.5); }
    // everyone standing at the pad goes up (the original's distance check)
    if (padFx && feet().distanceTo(v3(padFx.origin)) < 500) { const s = one('asgard_bifrost_spawn_' + Math.floor(Math.random() * 4)) ?? one('asgard_bifrost_spawn_0'); player.setPosition(v3(s.origin).add(up(10))); sound('bifrost_tele', { volume: .7 }); kit.flash(.6); }
  });
  if (pad) world.addInteraction({ position: center(pad), text: () => !padRoundOk ? 'The Bifrost is not ready' : padUses >= 3 ? 'The Bifrost is recharging · next round' : 'Summon Bifrost · FREE', use() {
    if (!padRoundOk || padUses >= 3) return false; padUse(); return true;
  } });

  // ---------------------------------------------------------------- the Tesseract (the Mystery Box)
  (async () => {
    const [bottom, top] = await Promise.all([model('malibu_tesserrect_bottom'), model('malibu_tesserrect_top')]);
    for (const loc of world.boxLocations) {
      if (loc.rubble) loc.rubble.visible = false;
      const group = loc.box; if (!group) continue;
      const lid = world.entities.get(loc.prefix + '_lid');
      for (const c of [...group.children]) if (c !== lid) c.visible = false;
      if (bottom) { const b = bottom.clone(); b.rotation.y = -Math.PI / 2; group.add(b); }
      if (lid) { for (const c of lid.children) c.visible = false; if (top) { const t = top.clone(); t.position.set(0, -16, -4); t.rotation.y = -Math.PI / 2; lid.add(t); } }
      const glow = new THREE.PointLight(0x4aa8ff, 1.2, 160); glow.position.set(0, 12, 0); group.add(glow);
    }
    // a random first spot (the host's; the multiplayer mod sends its box spot to the guests)
    if (sync.isHost) { const start = world.boxLocations[Math.floor(Math.random() * world.boxLocations.length)]; if (start) { world.activeBox = start; world.updateBox(); } }
  })();
  const updateBox = world.updateBox.bind(world);
  world.updateBox = () => { updateBox(); for (const loc of world.boxLocations) if (loc.rubble) loc.rubble.visible = false; };

  // ---------------------------------------------------------------- the police station jail
  const keys = named('police_jail_key');
  let keyIdx = -1, cellOpen = false, cellBusy = false, keyAfterRound = false;
  const placeKey = ev('key', (d, ctx) => { keyIdx = Math.floor(ctx.rand() * keys.length); keys.forEach((k, i) => show(k.target, i === keyIdx)); });
  keys.forEach(k => show(k.target, false));
  if (sync.isHost) placeKey();
  const takeKey = ev('keyTake', (d, ctx) => { if (keyIdx !== d.i) return; show(keys[d.i]?.target, false); keyIdx = -1; gotPart(ctx, 'police', 'Key'); if (ctx.mine) say('[i] You have found a key'); });
  keys.forEach((k, i) => world.addInteraction({ position: center(k), hidden: () => i !== keyIdx, text: () => 'Pick up the key', use() { if (!canTake()) return false; takeKey({ i }); return true; } }));
  solid('police_jail_door', true);
  const cell = ev('cell', async d => {
    if (cellBusy || cellOpen === d.open) return;
    cellBusy = true;
    if (d.open) { say('[i] Opening Cell...'); solid('police_jail_door', false); await move('police_jail_door', codXY(-50, 0), 1); cellOpen = true; }
    else { say('[i] Closing Cell...'); await move('police_jail_door', codXY(50, 0), 1); solid('police_jail_door', true); cellOpen = false; keyAfterRound = true; }
    cellBusy = false;
  });
  const jailTrig = one('police_jail_door_trig');
  if (jailTrig) world.addInteraction({ position: center(jailTrig), text: () => cellOpen ? 'Close the cell' : 'Cell door', use() {
    if (cellBusy) return false;
    if (cellOpen) { cell({ open: false }); return true; }
    if (!part) { say('[i] You are missing a part'); return false; }
    if (part.id !== 'police') { say('[i] This is the incorrect part'); return false; }
    setPart(null); cell({ open: true }); return true;
  } });
  host.on('roundEnd', () => { if (!keyAfterRound) return; keyAfterRound = false; if (sync.isHost) placeKey(); });

  // ---------------------------------------------------------------- Infinity Stones and the Pack-a-Punch
  let stones = 0;
  const STONES = ['stone_time_end', 'stone_power_end', 'stone_reality_end', 'stone_soul_end'];
  for (const s of STONES) show(s, false);
  world.papLocked = true; world.papLockedText = 'Missing Elements';
  const spinning = new Set();
  host.on('update', dt => { const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60; for (const n of spinning) for (const o of nodes(n)) { const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); o.position.sub(c); o.position.applyAxisAngle(up(1), step * 6.3); o.position.add(c); o.rotateY(step * 6.3); o.updateMatrix(); o.updateMatrixWorld(true); } });
  async function stoneDone(startName, endName, rise = 100) {
    move(startName, up(rise), 3, { rot: new THREE.Euler(0, 20, 0) });
    for (let i = 0; i < 7; i++) { const b = kit.boxOf(startName); kit.fx(b.getCenter(new THREE.Vector3()), 0xff66ff, 10); await wait(.5); }
    show(startName, false); show(endName, true); spinning.add(endName);
    stones++;
    if (stones === 4) { world.papLocked = false; world.papLockedText = null; announce('THE INFINITY STONES', 'THE UPGRADE PEDESTAL IS AWAKE', 5); }
  }
  // the pedestal: Pack-a-Punch without the machine (it stands for "the Infinity Stone's power")
  host.on('update', () => { if (world.papMachine?.visible) world.papMachine.visible = false; });
  // Time: everyone must stand at it (the host checks every player's position)
  const timeTrig = one('stone_time_start_trig');
  let timeState = 'idle', timeLeft = 100, timeTick = 0, timeWho = null;
  const timeFound = ev('timeFound', async d => {
    if (timeState !== 'idle' && timeState !== 'asked') return; timeState = 'talk'; timeWho = d.who;
    await talk([[0, `${timeWho}: Guys, I found a stone over here.`], [3, `${timeWho}: I believe this is the Time Stone.`], [3, `${timeWho}: We need to spend some time around it and see if anything happens`], [3, `${timeWho}: No pun intended. We need everyone though.`], [3, `${timeWho}: I think the stone will spark if it's working.`]]);
    if (sync.isHost && enemies.list.length < 7) for (const z of [...enemies.list]) sync.hurt(z, 1e6);
    await wait(2); say(`${timeWho}: More zombies inbound. This just got harder.`);
    timeState = 'charging'; timeTick = now() + 2;
  });
  const timeTickEv = ev('timeTick', d => {
    if (timeState !== 'charging') return;
    if (d.reset) { if (timeLeft < 99) say(`${timeWho}: Crud. Someone else, or myself, is not close enough.`); timeLeft = 100; return; }
    timeLeft -= 2; kit.fx(kit.boxOf('stone_time_start').getCenter(new THREE.Vector3()), 0xff7a2e, 8);
    if (timeLeft < 1) { timeState = 'done'; say(`${timeWho}: Yes!!! Got it.`); stoneDone('stone_time_start', 'stone_time_end'); }
  });
  host.on('update', () => {
    if (!timeTrig) return;
    if (timeState === 'idle' && inside(timeTrig, feet().add(up(30)), 10) && session.phase === 'fighting') { timeState = 'asked'; timeFound(who()); }
    if (timeState === 'charging' && sync.isHost && now() >= timeTick) {
      timeTick = now() + 2;
      const all = sync.players().every(p => inside(timeTrig, p.pos.clone().add(up(30)), 10));
      if (!all) { if (timeLeft < 100) timeTickEv({ reset: true }); return; }
      timeTickEv({});
    }
  });
  // Power: 25 Mjolnir hits; only Thor focuses it
  let powerHits = 0, powerDone = false;
  const powerTrig = one('power_stone_start_trig');
  const powerHit = ev('powerHit', d => {
    if (powerDone) return;
    powerHits++; kit.fx(center(powerTrig), 0x7fe0ff, 10);
    if (powerHits > 24) {
      if (d.hero === 'thor') { powerDone = true; say('^3Thor^7: The stone has been powered.'); stoneDone('power_stone_start', 'stone_power_end'); }
      else { say("^3Vision^7: Agh. I can't focus Mjolnir's energy."); powerHits = 0; }
    }
  });
  if (powerTrig) damageTrigger(powerTrig, w => {
    if (powerDone) return;
    if (w !== W_('thor_hammer')) { if (!talking && !hulk()) say(`${name()}: Hmmm...I wonder how we can charge the Power Stone.`); return; }
    powerHit(who());
  }, 40);
  // Reality: it zaps whoever comes within 150 (each player their own zaps); the Electro-Shock arrow neutralises it
  const realityRadius = one('stone_reality_start_trig_radius'), realityTrig = one('stone_reality_start_trig'), realityStone = one('stone_reality_start');
  let realityAwake = false, realityZaps = 0, realityTold = false, realityDone = false, zapAt = 0;
  const realityTalk = ev('realityTalk', () => { if (realityTold) return; realityTold = true; talk([[0, '^1Spider-Man^7: People, I found a stone up here.'], [2, '^4Captain America^7: Perfect. Grab it and bring it down.'], [2, "^1Spider-Man^7: Well, that's the problem, Cap."], [2, "^1Spider-Man^7: It doesn't let me near it."], [3, '^4Captain America^7: Is it a red stone?'], [2, '^1Spider-Man^7: Ya. Ruby redish.'], [3, '^3Thor^7: That is the Reality Stone. The Aether.'], [3, '^3Thor^7: We have to neutralize it with another power.'], [2, "^1Spider-Man^7: It's gonna require a good vantage point, though."]]); });
  let realityAsked = false;
  host.on('update', () => {
    if (realityDone || !realityStone) return;
    const c = v3(realityStone.origin);
    if (!realityAwake && realityRadius && feet().distanceTo(v3(realityRadius.origin)) < (realityRadius.radius ?? 200)) realityAwake = true;
    if (realityAwake && now() > zapAt && feet().distanceTo(c) < 150) {
      zapAt = now() + .5; kit.fx(c, 0xff3355, 14);
      session.effects.invulnerable = 0; session.damage(session.health + 10); realityZaps++;
      if (realityZaps > 2 && !realityTold && !realityAsked) { realityAsked = true; realityTalk(); }
    }
  });
  const realityHit = ev('realityHit', () => { if (realityDone) return; realityDone = true; say('^6Hawkeye^7: There we go. I knew I was good for something.'); move('stone_reality_start', codXY(0, -50), 1).then(() => stoneDone('stone_reality_start', 'stone_reality_end', 50)); });
  if (realityTrig) damageTrigger(realityTrig, w => {
    if (realityDone) return;
    if (w === W_('hawkeye_bow3')) realityHit();
    else if (w === W_('thor_hammer') && !talking) say(`${name()}: This won't work. But this type of power might.`);
    else if ((w === W_('hawkeye_bow1') || w === W_('hawkeye_bow2')) && !talking) say('^6Hawkeye^7: I should use a different type of arrow.');
  }, 40);
  // Soul: found at Tony's bed (look at it), filled by a zombie killed in its room (the host's kills, relayed by sync.js)
  const soulTrig = one('stone_soul_start_trig'), soulRoom = one('stone_soul_start_room');
  let soulState = 'hidden';
  const soulFound = ev('soulFound', d => {
    if (soulState !== 'hidden') return; soulState = 'found';
    const whoNear = d.hero === 'cap' ? 'me' : d.hero === 'tony' ? 'you' : d.who;
    talk([[0, '^4Captain America^7: Are you kidding me, Stark???'], [3, `^4Captain America^7: You left an infinity stone over by ${whoNear}'s bed??`], [3, "^6Tony^7: What's wrong with that?"], [2, '^4Captain America^7: You cause me so much pain.'], [3, '^6Tony^7: Life is pain.'], [3, '^6Tony^7: Anyone who tells you differently is selling something.'], [3, '^3Thor^7: Cease bickering, children. The Soul Stone requires souls.'], [3, '^6Tony^7: Really? Kill zombies near the stone to fill it?'], [3, "^6Tony^7: Couldn't this mapper be more original?"], [3, '^3Thor^7: We fill the stone with Extremis zombie souls'], [4, '^6Tony^7: I think I just wet myself.']]);
  });
  if (soulTrig) world.addInteraction({ position: center(soulTrig), hidden: () => soulState !== 'hidden', text: () => 'A glowing stone', use() { soulFound(who()); return true; } });
  const soulFill = ev('soulFill', () => { if (soulState !== 'found') return; soulState = 'done'; say('^3Thor^7: The Soul Stone has been filled.'); stoneDone('stone_soul_start', 'stone_soul_end', 70); });
  sync.on('kill', d => { if (sync.isHost && soulState === 'found' && soulRoom && d?.p && inside(soulRoom, v3(d.p).add(up(30)), 20)) soulFill(); });

  // ---------------------------------------------------------------- Batman
  let batEggs = 0, batWallGone = false, batmanGone = false, batmanAsked = false, batSightings = 0, batSpot = null, batModel = null, batmobileSeen = false, sceneSeen = false, sceneAsked = false;
  const batTaken = new Set();
  solid('batman_wall', true); solid('batman_clip', true);
  const batEgg = () => { batEggs++; if (batEggs >= 6 && !batWallGone) { batWallGone = true; show('batman_wall', false); solid('batman_wall', false); } };
  const BATMOBILE_LINES = d => [
    [[0, "^6Hawkeye^7: Guys, I've been meaning to ask this, but has anyone else"], [2, `^6Hawkeye^7: noticed the unidentified black vehicle by ${d.hero === 'hawkeye' ? 'me' : d.who}?`], [2, '^4Captain America^7: I have. Still no intel on it. Keep your eyes open, team.']],
    [[0, `^1Spider-Man^7: Wow, look at that sportscar by ${d.hero === 'spiderman' ? 'me' : d.who}!!!`], [2, '^3Thor^7: I have observed it as well. Frost giants, perhaps?'], [2, '^6Tony Stark^7: Nah, not this tech. This is something else.']],
    [[0, `^0Black Widow^7: There's a vehicle over by ${d.hero === 'widow' ? 'me' : d.who} that I don't recognize`], [2, "^4Captain America^7: Copy that, Romanoff. It's raised my eyebrow too."]]];
  const batmobileEv = ev('batmobile', (d, ctx) => {
    if (!batmobileSeen) { batmobileSeen = true; batEgg(); }
    const r = ctx.rand(); if (r < .6) talk(BATMOBILE_LINES(d)[Math.floor(r / .6 * 3)]);
  });
  const batmobile = one('batmobile_trig');
  let batmobileAt = 0;
  if (batmobile) damageTrigger(batmobile, () => { if (now() < batmobileAt) return; batmobileAt = now() + 7; batmobileEv(who()); }, 60);
  const scene2 = one('batarang_scene_trig');
  const sceneEv = ev('batScene', d => { if (sceneSeen) return; sceneSeen = true; batEgg(); talk([[0, `^3James Rhodes^7: Team, look at what ${d.hero === 'rhodes' ? 'I' : d.who} just found...`], [2, '^4Captain America^7: Copy that, Rhodes.'], [3, "^3James Rhodes^7: I don't think we're the only ones here."], [3, "^4Captain America^7: I'm starting to wonder. Examine those corpses for clues."]]); });
  host.on('update', () => { if (!sceneSeen && !sceneAsked && scene2 && feet().distanceTo(v3(scene2.origin)) < (scene2.radius ?? 120) && !talking) { sceneAsked = true; sceneEv(who()); } });
  const batarangEv = ev('batarang', (d, ctx) => {
    if (batTaken.has(d.i)) return; batTaken.add(d.i); batEgg();
    talk([[0, `${d.who}: ${["This doesn't look natural.", 'What on earth is this thing?', 'Looks like some sort of weapon...', 'I wonder how this got here', 'Odd. I wonder how this got here.', 'I should keep an eye out for where this came from.'][Math.floor(ctx.rand() * 6)]}`]]);
  });
  named('batarang').forEach((b, i) => world.addInteraction({ position: center(b), hidden: () => batTaken.has(i), text: () => 'A strange object', use() { if (talking) return false; batarangEv({ ...who(), i }); return true; } }));
  const smoke = one('batman_smoke_trig'), batman = one('batman');
  const batSpawns = named('batman_spawn');
  const batAppear = ev('batAppear', async (d, ctx) => {
    if (batSightings > 3 || !batSpawns.length) return;
    const s = batSpawns[Math.floor(ctx.rand() * batSpawns.length)];
    await wait(3);
    remove(batModel); batModel = await figure('malibu_batman', null, { position: v3(s.origin), yaw: kit.yawOf(s) });
    batSpot = { s, trig: one(s.target), asked: false };
  });
  const batmanEv = ev('batman', async d => {
    if (batmanGone) return; batmanGone = true;
    sound('batman_smoke', { volume: .7 }); kit.fx(v3(batman.origin).add(up(90)), 0x222222, 40);
    await wait(2.5); show('batman', false); solid('batman_clip', false);
    await wait(3.5);
    await talk([[0, `^0Black Widow^7: Guys, there is someone else here. ${d.hero === 'widow' ? 'I' : d.who} just ran into him`], [2, '^3James Rhodes^7: Who? What did he look like?'], [2, '^4Captain America^7: Copy that, Romanoff. He could still be around somewhere.'], [2, '^4Captain America^7: Keep your eyes open, team. Find him. He could be trouble.']]);
    if (sync.isHost) batAppear();
  });
  host.on('update', () => { if (!batmanGone && !batmanAsked && batWallGone && smoke && feet().distanceTo(v3(smoke.origin)) < (smoke.radius ?? 120)) { batmanAsked = true; batmanEv(who()); } });
  const batSeen = ev('batSeen', async (d, ctx) => {
    if (!batSpot) return; const spot = batSpot; batSpot = null;
    await wait(1); kit.fx(v3(spot.s.origin), 0x222222, 40); sound('batman_smoke', { volume: .6 }); await wait(3.5); remove(batModel); batModel = null;
    await wait(5); batSightings++;
    if (batSightings > 3) talk([[0, `${d.hulk ? 'Black Widow' : d.who}: Ok, seriously, there is something up there.`], [2, "^3James Rhodes^7: It's been seen several times now"], [2, '^4Captain America^7: We need to keep an eye out for clues.'], [3, "^6Tony Stark^7: I've already had ^5JARVIS^7 scanning his vehicle's tread mark trail."], [3, "^6Tony Stark^7: Turns out that his vechicle's tracks show up two miles from"], [3, '^6Tony Stark^7: here...out of nowhere.'], [3, '^4Captain America^7: Are you saying he just came from thin air?'], [3, '^6Tony Stark^7: Looks that way. ^5JARVIS^7 has beem running an analysis but'], [3, '^6Tony Stark^7: the results are pretty ridiculous.'], [3, '^4Captain America^7: What are the results, Stark?'], [3, '^6Tony Stark^7: That this guy we keep seeing is from another universe.']]);
    else { talk([[0, `${d.who}: ${['I saw something! Or...someone...', "It's gone! What was that?", 'That was odd...I thought there was something there.', "Where'd it go? I should keep an eye out for it again."][Math.floor(ctx.rand() * 4)]}`]]); await nextRound(); if (sync.isHost) batAppear(); }
  });
  host.on('update', () => {
    if (!batSpot || batSpot.asked) return;
    const t = batSpot.trig, at = t ? v3(t.origin) : v3(batSpot.s.origin);
    if (feet().distanceTo(at) < (t?.radius ?? 200)) { batSpot.asked = true; batSeen({ ...who(), hulk: hulk() }); }
  });

  // ================================================================ the main Easter egg
  let step = 0;
  const setStep = n => { step = n; };
  const stepEv = ev('step', d => setStep(d.n));
  // ---- step 0: Nick Fury's briefing
  const brief = one('malibu_mission_briefing');
  let briefState = 'ready';
  show('malibu_mission_briefing_screen', false);
  const briefEv = ev('brief', async d => {
    if (d.stage === 'open' && briefState === 'ready') { briefState = 'wait'; show('malibu_mission_briefing_screen', true); sound('malibu_console_beep'); await wait(5); briefState = 'read'; return; }
    if (d.stage !== 'done' || briefState !== 'read') return;
    briefState = 'done';
    await talk([[0, '^4Captain America^7: Alright, team. You all get that?'], [3, '^1Spider-Man^7: Group 935, Hydra, Extremis, 115....I think so...?'], [4, '^4Captain America^7: We have to find a way to stop this apocalypse'], [4, 'We should figure out what this Element 115 stuff is first.'], [3, '^6Hawkeye^7: How should we proceed?'], [3, "^6Tony Stark^7: We can do it at my place. I've got an analyzation tank"], [2, 'We just need some live specimen in there.']]);
    setStep(1);
  });
  if (brief) world.addInteraction({ position: center(brief), hidden: () => briefState === 'done' || briefState === 'wait', text: () => briefState === 'ready' ? 'Message from Nick Fury' : 'Press F when finished', use() {
    if (briefState === 'ready') { briefEv({ stage: 'open' }); return true; }
    if (briefState !== 'read' || talking) return false;
    briefEv({ stage: 'done' }); return true;
  } });
  // ---- the battery: Mjolnir charges it, then the next hit shocks what's near (zombies on the host, each player their
  // own); in step 1 a zombie gets "charged"
  const battery = one('charge_battery_trig');
  let batteryCharged = false;
  const batteryEv = ev('battery', async d => {
    if (d.charge) { if (batteryCharged) return; batteryCharged = true; for (let i = 0; i < 3; i++) { kit.fx(center(battery), 0x7fe0ff, 14); await wait(1); } return; }
    if (!batteryCharged) return;
    batteryCharged = false; kit.fx(center(battery), 0x7fe0ff, 30); sound('electrical_surge', { volume: .6 });
    if (sync.isHost) for (const z of [...enemies.list]) if (z.root.position.distanceTo(center(battery)) < 200) { if (step === 1) z.charged = true; else sync.hurt(z, 100); }
    if (feet().distanceTo(center(battery)) < 200) { session.effects.invulnerable = 0; session.damage(100); }
  });
  if (battery) damageTrigger(battery, w => {
    if (w === W_('thor_hammer') && !batteryCharged) { batteryEv({ charge: true }); return; }
    if (batteryCharged) { batteryEv({}); return; }
    if (w !== W_('thor_hammer') && !hulk() && !talking) say(`${name()}: There must be a way to charge this up...`);
  }, 30);
  host.on('update', () => { for (const z of enemies.list) if (z.charged && Math.random() < .15) kit.fx(z.root.position.clone().add(up(65)), 0x7fe0ff, 2); });
  // ---- step 1: the analysis tank (a zombie dropped in Tony's tank from Scarlet's telekinesis); the host watches its zombies
  const tank = one('tony_tank');
  let tankCount = 0, analysing = false, holoZombie = null;
  show('ee_step_1_screen', false);
  const tankEv = ev('tank', async d => {
    if (d.result === 'offline') { say('^6Tony Stark^7: Crud. Systems are offline. We need ^5JARVIS^7 online to do this.'); return; }
    if (d.result === 'died') {
      tankCount++;
      if (tankCount < 3) { say('^6Tony Stark^7: Perfect. We gotta give ^5JARVIS^7 some time to analyze this thing'); await wait(10); say('^6Tony Stark^7: The specimen died. We gotta try another one'); }
      else { say('^6Tony Stark^7: Good. ^5JARVIS^7 try again.'); await wait(10); await talk([[0, '^6Tony Stark^7: He died again. Are you having issues ^5JARVIS^7?'], [3, '^5JARVIS^7: The creature is not able to survive my scanning techniques.'], [3, '^5JARVIS^7: I suggest we find a way to super-charge our next victim']]); }
      return;
    }
    if (d.result === 'charged' && step === 1) {
      await talk([[0, '^6Tony Stark^7: So will this charged one work?'], [3, '^5JARVIS^7: We will know in a few moments.'], [7, '^5JARVIS^7: Bio scan complete. Recreating anatomy on the holo-floor...']]);
      const holo = one('ee_step_1_holo');
      remove(holoZombie); holoZombie = holo ? await figure('malibu_napalm_zombie_body', null, { position: v3(holo.origin) }) : null;
      show('ee_step_1_screen', true);
      await wait(2); await talk([[0, '^5JARVIS^7: Recreation complete.'], [3, "^6Tony Stark^7: Thanks, ^5JARVIS^7. We'll get back to you after we read the results"]]);
      setStep(2);
    }
  });
  host.on('update', () => {
    if (step !== 1 || analysing || !tank || !sync.isHost) return;
    const z = enemies.list.find(z => inside(tank, z.root.position.clone().add(up(40)), 10));
    if (!z) return;
    analysing = true; const ai = z.ai; z.ai = () => {};
    (async () => {
      if (!tony.state().jarvisOn) { tankEv({ result: 'offline' }); z.ai = ai; await wait(3); analysing = false; return; }
      if (!z.charged) { tankEv({ result: 'died' }); await wait(10); sync.hurt(z, 1e6); if (tankCount >= 3) await wait(6); analysing = false; return; }
      tankEv({ result: 'charged' }); await wait(10); sync.hurt(z, 1e6); analysing = false;
    })();
  });
  host.on('update', dt => { if (holoZombie) holoZombie.rotation.y += (typeof dt === 'number' ? dt : 1 / 60) * Math.PI * 2 / 8; });
  // ---- step 2: read the bio, then bribe the server (8000)
  const bio = one('ee_step_1_trig');
  let bioRead = false;
  const bioEv = ev('bio', async d => {
    if (d.read) {
      if (bioRead) return; bioRead = true;
      await talk([[0, "^6Tony Stark^7: ^5JARVIS^7, what's this about more info on a server?"], [3, '^5JARVIS^7: There is a server that holds additional information about Element 115.'], [3, '^5JARVIS^7: The server requires a bribe, however, to access'], [3, "^6Tony Stark^7: Do it. We'll raise the money somehow"], [3, '^5JARVIS^7: I will begin setting up the transaction.'], [3, '^1Spider-Man^7: ^6Tony^7, maybe we should stop and setup a budget'], [2, 'I mean, money is pretty hard to come by. We should have a meeting.'], [3, '^6Tony Stark^7: Nah, money is my life. We got this.'], [4, "^4Captain America^7: Money doesn't mean everything. You can't buy happiness."], [4, "^6Tony Stark^7: That's why I rent it."], [5, '^6Tony Stark^7: Besides, ^1Spidey^7, you literally take selfies for a living. Shut up.']]);
      return;
    }
    if (step !== 2) return;
    sound('malibu_console_beep'); remove(holoZombie); holoZombie = null; setStep(3);
    await wait(1); show('ee_step_1_screen', false);
    await talk([[0, '^5JARVIS^7: Finishing transaction...'], [6, '^5JARVIS^7: Transaction complete.'], [3, '^5JARVIS^7: Server location is 4th floor of Best Eastern in the West']]);
  });
  if (bio) world.addInteraction({ position: center(bio), hidden: () => step !== 2 || talking, text: () => !bioRead ? "Press F when you've read the bio" : 'Bribe the server · 8000', use() {
    if (!bioRead) { bioEv({ read: true }); return true; }
    if (session.points < 8000) { say(`${name()}: Rats. I need some more moolah`); return false; }
    session.spend(8000); bioEv({}); return true;
  } });
  // ---- step 3: Tony breaks into the server (first time: Windows updates; next round it works)
  const server = one('ee_step_3_trig');
  let serverTried = false, serverReady = false, serverBusy = false;
  show('ee_step_3_screen1', false); show('ee_step_3_screen2', false);
  const serverEv = ev('server', async () => {
    if (step !== 3 || serverBusy) return;
    if (!serverTried) {
      serverTried = true; serverBusy = true;
      await talk([[0, '^6Tony Stark^7: Alright...']]); await wait(2); show('ee_step_3_screen1', true);
      await talk([[2, '^6Tony Stark^7: Almost there...and....']]); await wait(3); show('ee_step_3_screen2', true);
      await talk([[1, '^6Tony Stark^7: Oh seriously???'], [3, "^4Captain America^7: What's wrong, ^6Stark^7?"], [3, '^6Tony Stark^7: Windows is updating'], [3, '^0Black Widow^7: I hate it when that happens'], [4, '^5Quicksilver^7: I wonder if that ever happened while this map was being made...'], [4, "^6Tony Stark^7: This won't be done for a while. We'll have to come back next round"]]);
      serverBusy = false;
      await nextRound(); serverReady = true; wait(15).then(() => show('ee_step_3_screen2', false));
      return;
    }
    if (!serverReady) return;
    setStep(4);
    await talk([[0, "^6Tony Stark^7: Let's try this again..."], [3, '^6Tony Stark^7: Almost got it...'], [3, '^6Tony Stark^7: Got it. ']]);
    await wait(3); show('ee_step_3_screen1', false);
    await talk([[0, '^6Tony Stark^7: I sent ^5JARVIS^7 the server intel'], [3, '^5JARVIS^7: The intel transfer is almost complete. Please wait...'], [5, '^5JARVIS^7: Transfer complete. The intel appears to have much to say about Element 115'], [3, '^4Captain America^7: What does it say?'], [4, '^5JARVIS^7: Element 115 was discovered in Northern France during World War I by the Nazi party'], [4, 'Group 935 was constructed to attempt to understand its properties'], [4, '935 was led by Dr. Ludvig Maxis and Dr. Edward Richtofen'], [4, 'The origins of the apocalypse we now face have their roots in this group'], [4, "I've also continued to analyze the charged-specimen and its chemical properties contain"], [4, 'Element 115 as well.'], [4, 'It also seems to share similar qualities as the Infinity Stones'], [4, '^6Tony Stark^7: Are you saying Element 115 and the Infinity Stones are the same energy?'], [4, '^5JARVIS^7: Yes, sir. But there is more.'], [4, 'The server alludes to a small, secret Group 935 base near your location.'], [4, 'I suggest you try to find it while I continue to read the server data.'], [5, "^6Tony Stark^7: I'm getting more intrigued by the minute"]]);
  });
  if (server) world.addInteraction({ position: center(server), hidden: () => step !== 3 || talking || serverBusy || (serverTried && !serverReady), text: () => 'Server', use() {
    if (!is('tony')) { say(`${name()}: We need ^6Tony^7 to break into this server`); return false; }
    serverEv({}); return true;
  } });
  // ---- step 4: the hidden brick, the base and its three locks
  const brick = one('hidden_brick_trig');
  let brickFound = false, locks = 0;
  solid('hidden_brick_door', true);
  const brickEv = ev('brick', async d => {
    if (brickFound) return; brickFound = true; sound('pap_stairs', { volume: .7 });
    move('hidden_brick', codXY(0, -7), 1); solid('hidden_brick_door', false);
    await wait(1); await move('hidden_brick_door', codXY(0, 14), 1); await wait(.5); await move('hidden_brick_door', codXY(70, 0), 3); await wait(1);
    await talk([[0, `^4Captain America^7: Team, I think ${d.hero === 'cap' ? 'I' : d.who} just found the base.`], [6, 'It looks like there are several security locks on this door.'], [4, "We'll have to figure them out one by one."]]);
  });
  if (brick) world.addInteraction({ position: center(brick), hidden: () => step !== 4 || brickFound, text: () => 'A loose brick', use() { if (talking) return false; brickEv(who()); return true; } });
  solid('ee_step_5_vault', true); solid('ee_step_5_vault2', true); solid('ee_step_5_vault3', true);
  async function lockSolved() {
    locks++;
    if (locks === 1) { await move('ee_step_4_bolt1', codXY(0, 60), 3); show('ee_step_4_bolt1', false); }
    if (locks === 2) { await move('ee_step_4_bolt2', codXY(0, -60), 3); show('ee_step_4_bolt2', false); }
    if (locks === 3) {
      await move('ee_step_4_bolt3', codXY(0, 60), 3); show('ee_step_4_bolt3', false);
      say('^4Captain America^7: Yes! We got em all');
      sound('malibu_hall_raise', { volume: .6 }); solid('ee_step_5_vault', false); await move('ee_step_5_vault', up(-120), 5); show('ee_step_5_vault', false);
      setStep(5);
    }
  }
  // lock 1: the three dials (right, middle, left), each from 5 down by one a press (0 wraps to 9): left 2, middle 3, right 9
  const DIALS = [['right', 'piece_right_ric'], ['middle', 'piece_middle_ric'], ['left', 'piece_left_ric']].map(([side, piece]) => ({ side, piece, value: 5, trig: one(side + '_trig_ric'), busy: false }));
  let dialsDone = false;
  const dialEv = ev('dial', async d => {
    const dl = DIALS[d.i]; if (!dl || dialsDone) return;
    dl.busy = true; sound('malibu_console_beep', { volume: .5 });
    move(dl.side + '_button_ric', codXY(0, 1), .2).then(() => wait(.1)).then(() => move(dl.side + '_button_ric', codXY(0, -1), .2));
    const v0 = dl.value; dl.value = v0 === 0 ? 9 : v0 - 1;
    if (v0 === 1) await move(dl.piece, up(9), 3); else { await move(dl.piece, up(-1), .5); await wait(.5); }
    dl.busy = false;
    const v = Object.fromEntries(DIALS.map(x => [x.side, x.value]));
    if (!dialsDone && v.left === 2 && v.middle === 3 && v.right === 9) { dialsDone = true; say('^4Captain America^7: Good work, Avengers. That code worked'); lockSolved(); }
  });
  DIALS.forEach((dl, i) => { if (dl.trig) world.addInteraction({ position: center(dl.trig), hidden: () => step !== 4 || !brickFound || dialsDone, text: () => `${dl.side[0].toUpperCase() + dl.side.slice(1)} dial · ${dl.value}`, use() { if (dl.busy) return false; dl.busy = true; dialEv({ i }); return true; } }); });
  // lock 2: two consoles far apart, hit by the same player within 15 s
  const c2 = one('ee_step_4_trig2'), c3 = one('ee_step_4_trig3');
  let lock2 = null, lock2Done = false;
  const lock2Ev = ev('lock2', (d, ctx) => {
    if (lock2Done) return;
    if (d.timeout) { if (lock2) { lock2 = null; say('^4Captain America^7: We gotta hit both faster next time.'); } return; }
    sound('malibu_console_beep');
    if (d.first) { if (lock2) return; lock2 = { by: ctx.by, until: now() + 15 }; if (ctx.mine) say(`${d.who}: There must be another somewhere. I better hurry`); return; }
    if (!lock2) return;
    if (lock2.by !== ctx.by) { lock2 = null; say('^4Captain America^7: Huh, seems like it has to be the same person for both'); return; }
    lock2 = null; lock2Done = true; say(`${d.who}: Got em both!`); lockSolved();
  });
  if (c2) world.addInteraction({ position: center(c2), hidden: () => step !== 4 || !brickFound || lock2Done || !!lock2, text: () => 'Security console', use() { lock2Ev({ ...who(), first: true }); return true; } });
  if (c3) world.addInteraction({ position: center(c3), hidden: () => step !== 4 || !brickFound || lock2Done || !lock2, text: () => 'Security console', use() { lock2Ev(who()); return true; } });
  host.on('update', () => { if (lock2 && sync.isHost && now() > lock2.until) { lock2.until = Infinity; lock2Ev({ timeout: true }); } });
  // lock 3: a broken charger (a hint), Mjolnir charges the other one
  const hint5 = one('ee_step_4_trig5'), lock3 = one('ee_step_4_lock3_trig');
  let lock3Done = false;
  if (hint5) world.addInteraction({ position: center(hint5), hidden: () => step !== 4 || !brickFound || lock3Done, text: () => 'Charger', use() { if (!talking) say(`${name()}: This is broken. There must be another one somewhere to charge up`); return false; } });
  const lock3Ev = ev('lock3', () => { if (lock3Done || step !== 4) return; lock3Done = true; kit.fx(center(lock3), 0x7fe0ff, 20); lockSolved(); });
  if (lock3) damageTrigger(lock3, w => { if (step === 4 && !lock3Done && brickFound && w === W_('thor_hammer')) lock3Ev(); }, 30);
  // step 5: the Hulk smashes the inner vault; step 6: the last vault costs 10000
  const vault2 = one('ee_step_5_vault2_trig');
  const vault2Ev = ev('vault2', () => { if (step !== 5) return; setStep(6); kit.fx(center(vault2), 0xff9a40, 40); sound('missile_explo', { volume: .8 }); show('ee_step_5_vault2', false); solid('ee_step_5_vault2', false); });
  if (vault2) damageTrigger(vault2, w => {
    if (step !== 5) return;
    if (w === W_('hulk_hands')) vault2Ev(); else if (!talking) say(`${name()}: There must be a way to break this down`);
  }, 40);
  const vault3 = one('ee_step_5_vault3_trig');
  const vault3Ev = ev('vault3', async () => { if (step !== 6) return; sound('malibu_hall_raise', { volume: .6 }); setStep(7); solid('ee_step_5_vault3', false); await move('ee_step_5_vault3', up(-120), 5); show('ee_step_5_vault3', false); });
  if (vault3) world.addInteraction({ position: center(vault3), hidden: () => step !== 6, text: () => 'Open Vault · 10000', use() {
    if (session.points < 10000) { say(`${name()}: Rats. I need some more moolah`); return false; }
    session.spend(10000); vault3Ev(); return true;
  } });
  // step 7: the mainframe; one console per player, used by heroes who know computers
  const mainframe = one('ee_step_7_trig1'), consoles = named('ee_step_7_trig_array');
  let mainframeSeen = false, hacked = 0;
  const playerCount = () => sync.players().length;
  const KNOWS = ['tony', 'banner', 'vision', 'widow'];
  const NOPE = { cap: "^4Captain America^7: I can't do this. I prefer the battlefield", scarlet: '^1Scarlet Witch^7: I can bend the laws of time and space, but this is unrealistic', rhodes: '^3James Rhodes^7: I have no idea how to use this stuff', thor: '^3Thor^7: I cannot. What magic is this?', spiderman: '^1Spider-Man^7: If I do this I will ruin the keyboard', quicksilver: '^5Quicksilver^7: I can only play games', hawkeye: '^6Hawkeye^7: I know a little bit, but not enough for this' };
  const mainframeEv = ev('mainframe', async d => {
    if (d.what === 'look' && !mainframeSeen && step === 7) {
      mainframeSeen = true; const n = d.players;
      await talk([[0, '^6Tony Stark^7: This looks like SHIELD tech'], [3, '^4Captain America^7: If Group 935 was connected with Hydra, that would make sense.'], [5, '^6Tony Stark^7: This setup looks to have a pretty heavy security system.'],
        ...(n > 1 ? [[3, `^6Tony Stark^7: I think we should gather ^1${n}^7 of us that know computers`], [3, 'and use these small consoles to break into the mainframe.']] : [[3, '^6Tony Stark^7: I think we need one of us that is good with computers to'], [3, 'use these small consoles and break into the mainframe.']])]);
    }
    if (d.what === 'hack' && step === 7) {
      hacked++;
      if (hacked >= d.players) { say('^6Tony Stark^7: Got em'); setStep(8); }
      else wait(1).then(() => { if (step === 7 && hacked > 0) { hacked = 0; say('^6Tony Stark^7: We need to try this again'); } });
    }
    if (d.what === 'in' && step === 8) {
      setStep(9);
      await talk([[0, "^6Tony Stark^7: Alright, we're in"], [5, '^4Captain America^7: What are you finding?'], [3, '^6Tony Stark^7: Well, the records go back to the end of the SSR.'], [3, '....when SHIELD was first founded. '], [4, '^6Hawkeye^7: So Hydra was involved?'], [4, '^6Tony Stark^7: Yep. Very clearly invloved with SHIELD.'], [3, 'Which means Group 935 was too. This is crazy.'], [4, '^1Spider-Man^7: Anything about Element 115?'], [3, '^6Tony Stark^7: Ya, it says something about weapons that were designed to'], [3, "utilize 115's energy."]]);
    }
    if (d.what === 'antidote' && step === 18) { say('^2Bruce Banner^7: Antidote added to the computer.'); setStep(19); }
    if (d.what === 'spread' && step === 19) { setStep(20); antidote(); }
  });
  if (mainframe) world.addInteraction({ position: center(mainframe), hidden: () => !((step === 7 && !mainframeSeen) || step === 8 || step === 18 || step === 19) || talking, text: () => step === 18 ? 'Add the 115 antidote' : step === 19 ? 'Spread the 115 antidote over Malibu' : 'SHIELD mainframe', use() {
    if (step === 7) { mainframeEv({ what: 'look', players: playerCount() }); return true; }
    if (step === 8) { if (!is('tony')) { if (!hulk()) say(`${name()}: I better let ^6Tony^7 handle this`); return false; } mainframeEv({ what: 'in' }); return true; }
    if (step === 18) { if (!is('banner') || hulk()) { say(`${name()}: I don't know the antidote. But ^2Bruce Banner^7 does`); return false; } mainframeEv({ what: 'antidote' }); return true; }
    if (step === 19) { mainframeEv({ what: 'spread' }); return true; }
    return false;
  } });
  consoles.forEach(c => world.addInteraction({ position: center(c), hidden: () => step !== 7 || !mainframeSeen, text: () => 'Console', use() {
    sound('malibu_console_beep');
    if (!KNOWS.includes(hero()) || hulk()) { say(hulk() ? '^2Hulk^7: Hulk know nothing' : NOPE[hero()] ?? `${name()}: I can't do this`); return false; }
    mainframeEv({ what: 'hack', players: playerCount() }); return true;
  } }));
  // steps 9-10: a Ray Gun, upgraded at the stones (each player checks their own guns and reports a new stage)
  let rayTold = 0, rayAsked = '', rayAt = 0;
  const rayEv = ev('ray', async d => {
    if (step !== 9) return;
    if (d.stage === 'none') { if (rayTold < 1) { rayTold = 1; say('^6Tony Stark^7: I think we need to get our hands on one of those weapons'); } return; }
    if (d.stage === 'plain') { if (rayTold < 2) { rayTold = 2; dialog(d.hero === 'tony' ? [[2, "^6Tony Stark^7: I better upgrade it. I'll need more power."]] : [[0, `${d.who}: So I have it, but what should I do with it?`], [3, "^6Tony Stark^7: You better upgrade it. It'll need more power."]]); } return; }
    setStep(10);
    await talk(d.hero === 'tony' ? [[2, '^6Tony Stark^7: I already upgraded it. Perfect']] : [[0, `${d.who}: So I have it, and it's upgraded. What should I do with it?`], [3, '^6Tony Stark^7: Just hang on to it for now.'], [3, "I have a plan. We're gonna need some parts though for this tech."], [3, "Look around and see what we can scavange. We'll build it in my bedroom."]]);
    await talk([[0, '^6Tony Stark^7: I need to build something now. Scavenge the city.'], [3, "We'll build it in my room"]]);
  });
  host.on('update', () => {
    if (step !== 9 || now() < rayAt || talking) return; rayAt = now() + 2;
    const stage = hasRay(true) ? 'up' : hasRay() ? 'plain' : 'none';
    if (stage === rayAsked || (stage === 'none' && rayTold >= 1) || (stage === 'plain' && rayTold >= 2)) return;
    if (stage === 'none' && !sync.isHost) return;   // one "we need one" line, from the host
    rayAsked = stage; rayEv({ ...who(), stage });
  });
  // step 10: three parts for Tony's bed machine
  const BED = [['generator', 'Generator', 0], ['wires', 'Lamp', 1], ['fuel', 'Pipe', 2]];
  const built = new Set(), carried = new Set();
  for (let i = 0; i < 3; i++) show(`ee_step_10_part${i}_model1`, false);
  const bedPartEv = ev('bedPart', (d, ctx) => {
    const b = BED.find(x => x[0] === d.id); if (!b || carried.has(d.id) || built.has(d.id)) return;
    carried.add(d.id); show(`ee_step_10_part${b[2]}_model0`, false); gotPart(ctx, b[0], b[1]);
  });
  for (const [id, label, i] of BED) {
    const t = one(`ee_step_10_part${i}_trig`);
    if (t) world.addInteraction({ position: center(t), hidden: () => step !== 10 || built.has(id) || carried.has(id), text: () => `Pick up the ${label.toLowerCase()}`, use() { if (!canTake()) return false; bedPartEv({ id }); return true; } });
  }
  const bedEv = ev('bed', d => {
    const b = BED.find(x => x[0] === d.add); if (!b || built.has(b[0])) return;
    built.add(b[0]); carried.delete(b[0]); show(`ee_step_10_part${b[2]}_model1`, true); sound('pickup_part', { volume: .6 });
    if (built.size === 3) { setStep(11); charge = 0; }
  });
  const bed = one('ee_step_10_trig');
  if (bed) world.addInteraction({ position: center(bed), hidden: () => !(step === 10 || step === 12) || talking, text: () => step === 10 ? 'Add part' : 'Use machine', use() {
    if (step === 10) {
      const b = BED.find(x => x[0] === part?.id);
      if (!b) { say('[i] You have nothing to contribute to this bed'); return false; }
      setPart(null); bedEv({ add: b[0] }); return true;
    }
    if (!is('tony')) { if (!hulk()) say(`${name()}: Only ^6Tony^7 can operate this thing`); return false; }
    if (tony.armor.worn() || tony.state().caseOut) { say("^6Tony Stark^7: I can't have an armor when I use this"); return false; }
    const attach = one('ee_step_10_tony_attach');
    if (attach && !sync.players().every(p => p.pos.distanceTo(v3(attach.origin)) < 200)) { say('^6Tony Stark^7: I need everyone by the machine for this to work'); return false; }
    dreamEv({}); return true;
  } });
  // step 11 (and after each dream): 100 hits on the machine with the upgraded Ray Gun charge it
  let charge = 0, dreamed = false, inDream = false, cheeseWall = false, found13 = false, step13Done = false;
  const chargeTrig = one('ee_step_10_trig_charge');
  const chargeEv = ev('charge', () => {
    if (step !== 11) return;
    charge++; kit.fx(center(chargeTrig), 0xffe28a, 6);
    if (charge === 1) say('^6Tony Stark^7: This is working! But it will take a lot of power');
    if (charge === 50) say("^6Tony Stark^7: I'm making progress. I just gotta keep sending power");
    if (charge >= 100) {
      setStep(12);
      if (!dreamed) { cheeseWall = true; talk([[0, "^6Tony Stark^7: Good work. It's ready to go"], [3, "^4Captain America^7: ^6Stark^7, what's this idiotic thing for?"], [3, "^6Tony Stark^7: This is gonna sound crazy, but I've been having alot of cheese dreams lately"], [4, '^4Captain America^7: Wait, you wanna go into your head...and your dream?'], [3, '^1Spider-Man^7: That sounds crazy. Even for me.'], [3, "^3James Rhodes^7: I wouldn't be surprised if ^6Tony^7 was just going crazy."], [3, 'JK, man. I love you'], [3, '^6Tony Stark^7: Remind me to beat all of you later.'], [3, "Anyway, in my dreams, I've been seeing numbers. Like a code or something."], [4, '^4Captain America^7: And you think those numbers might have something to'], [4, 'do with Group 935? How does that connect?'], [3, "^6Tony Stark^7: I think Loki's staff was tampering with my mind back"], [3, 'when ^2Banner^7 and I were studying the staff.'], [4, "It may be nothing, but it can't hurt to see"], [4, "^4Captain America^7: Alright. Let's go then."], [4, 'We better make sure we have the cypher values written down']]); }
      else say('^6Tony Stark^7: Perfect. Ready to go again.');
    }
  });
  if (chargeTrig) damageTrigger(chargeTrig, w => {
    if (step !== 11) return;
    if (w === RAY && upgradedHeld()) chargeEv();
    else if (w === RAY && !talking) say('^6Tony Stark^7: That may work, but the weapon needs more power');
    else if (!talking) say('^6Tony Stark^7: There must be a way to charge the machine...');
  }, 30);
  // step 12: into Tony's dream (the Cheese Cube) for three rounds; the code shows on the wall in the third
  show('ee_ccube_ending', false);
  const blackout = document.createElement('div'); blackout.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity 1.5s;pointer-events:none;z-index:40'; document.body.append(blackout);
  const black = async (s = 4) => { blackout.style.opacity = 1; await wait(s); blackout.style.opacity = 0; };
  const toCube = (list, k) => { const spots = named(list); const p = spots[k % Math.max(1, spots.length)]; if (p) player.setPosition(v3(p.origin).add(up(10))); };
  const myIndex = () => Math.max(0, sync.players().map(p => p.id).sort().indexOf(sync.me));
  const dreamEv = ev('dream', async () => {
    if (step !== 12 || inDream) return;
    const first = !dreamed; dreamed = true; setStep(-12); inDream = true;
    show('ee_ccube_ending', false);
    black(4); await wait(2);
    say("^6Tony Stark^7: It's working...We're going back into my dream...");
    if (sync.isHost) for (const z of [...enemies.list]) sync.hurt(z, 1e6);
    toCube('ccube_spawn_points', myIndex());
    say(first ? '^6Tony Stark^7: We need to survive a few rounds to jog my crazy mind' : "^6Tony Stark^7: It shouldn't take as long this time");
    const rounds = first ? 3 : 2;
    for (let r = 1; r <= rounds; r++) {
      await nextRound();
      if (first) { for (const w of session.inventory) { const d = data.weapons[w.id]; if (d && !d.malibuHero && !d.suitWeapon) w.reserve = (w.upgraded ? d.upgrade?.maxAmmo : d.maxAmmo) ?? w.reserve; } announce('MAX AMMO OF CHEESE', '', 2); }
      if (r === rounds - 1) { show('ee_ccube_ending', true); say(first ? "^6Tony Stark^7: Yes, the answer is here! I knew I'd remember." : "^6Tony Stark^7: There it is. Let's make sure we get the translation right"); if (first) talk([[3, 'The message is on the wall'], [4, '^4Captain America^7: We need to translate it before this round is over']]); }
    }
    inDream = false; black(4); await wait(2);
    toCube('ccube_spawn_points_return', myIndex());
    await wait(5);
    if (first) found13 = true;
    say('^6Tony Stark^7: If we missed anything we can go back after charging the machine again');
    if (!step13Done) { setStep(11); charge = 0; }
  });
  // the Cheese Gun on its wall in the Cheese Cube (after the first charge); each player buys their own
  const cheeseBuy = one('buy_cheese_gun');
  if (cheeseBuy) world.addInteraction({ position: center(cheeseBuy), hidden: () => !cheeseWall, text: () => session.inventory.some(w => w.id === W_('malibu_cheese_gun')) ? 'Cheese Gun ammo · 500' : 'Cheese Gun · 1000', use() {
    const id = W_('malibu_cheese_gun'), d = data.weapons[id]; if (!d) return false;
    const own = session.inventory.find(w => w.id === id);
    if (own) { if (session.points < 500) { toast('Not enough points', 2); return false; } session.spend(500); own.reserve = d.maxAmmo; return true; }
    if (session.points < 1000) { toast('Not enough points', 2); return false; }
    session.spend(1000); session.giveWeapon(id); api.equipView?.(); return true;
  } });
  // step 13: what Tony's dream pointed at (the black suit; then the key and the cell)
  let blackUsed = false, spidey = null;
  const s13 = one('ee_step_13_trig');
  const s13Ev = ev('s13', d => {
    if (d.found) { if (step13Done) return; step13Done = true; say(`${d.who}: Avengers, I think I found it`); setStep(14); return; }
    if (d.suit && !blackUsed) { blackUsed = true; talk([[0, "^1Spider-Man^7: Ugh, I've had this on before. It takes over your mind."], [3, '^3Thor^7: You had better move quickily'], [3, '^4Captain America^7: ^3Thor^7 is right. There must be a reason this'], [3, "was in ^6Tony^7's dream. You better look for something only you can do"]]); }
  });
  if (s13) world.addInteraction({ position: center(s13), hidden: () => !found13 || talking, text: () => !step13Done ? 'Something is here' : is('spiderman') && spidey ? 'Take off the black suit' : 'The black suit', use() {
    if (!step13Done) { s13Ev({ ...who(), found: true }); return true; }
    if (!is('spiderman')) { if (!hulk()) say(`${name()}: Wow, I should let ^1Spidey^7 see this...`); return false; }
    if (spidey) { blackSpidey(false); return true; }
    blackSpidey(true); s13Ev({ suit: true }); return true;
  } });
  // the black suit (personal): 1.6 speed, 450 health (x1.5), Speed Cola and Double Tap; it takes you over after 150 s
  function blackSpidey(on) {
    if (on) { spidey = { until: now() + 150 }; heroes.setForm({ hp: 450, speed: 1.6, hands: 'spider_man_view_black', hud: 'hud_black_spidey' }); say('^1Spider-Man^7: I feel so much stronger and faster...'); for (const p of ['specialty_fastreload', 'specialty_rof']) session.perks?.add?.(p); }
    else { spidey = null; blackout.style.opacity = 0; heroes.setForm(null); for (const p of ['specialty_fastreload', 'specialty_rof']) session.perks?.delete?.(p); }
  }
  host.on('update', () => {
    if (!spidey) return;
    if (!is('spiderman')) { blackSpidey(false); return; }
    const left = spidey.until - now();
    if (left < 60) blackout.style.opacity = String(Math.max(0, (60 - left) / 60) * .85);
    if (left <= 0) { blackSpidey(false); session.effects.invulnerable = 0; session.damage(session.health + 100); }
  });
  // steps 14-15: the key, the cell door, the Red Hulk
  const key14 = one('ee_step_14_key_trig'), door14 = one('ee_step_14_door_trig'), hulkTrig = one('ee_step_14_spawn_hulk_trig');
  let keyTaken14 = false, cellOpened = false, hulkAsked = false;
  show('ee_step_14_key', true); solid('ee_step_14_door_clip', true); show('ee_step_14_door_clip', false);
  const key14Ev = ev('key14', async (d, ctx) => { if (keyTaken14) return; keyTaken14 = true; show('ee_step_14_key', false); gotPart(ctx, 'hulk_key', 'Key'); await talk([[0, '^1Spider-Man^7: Guys, I found a key!'], [3, '^1Spider-Man^7: Now I just gotta find where this thing goes...']]); });
  if (key14) world.addInteraction({ position: center(key14), hidden: () => step !== 14 || keyTaken14, text: () => 'Pick up the key', use() { if (!canTake()) return false; key14Ev({}); return true; } });
  const door14Ev = ev('door14', async () => { if (cellOpened) return; cellOpened = true; solid('ee_step_14_door_clip', false); sound('malibu_hall_raise', { volume: .6 }); await move('ee_step_14_door', codXY(40, 0), 3); });
  if (door14) world.addInteraction({ position: center(door14), hidden: () => step !== 14 || cellOpened, text: () => 'Cell door', use() {
    if (!part) { say(`${name()}: I need a key for this door`); return false; }
    if (part.id !== 'hulk_key') { say(`${name()}: I need a different part for this`); return false; }
    setPart(null); door14Ev({}); return true;
  } });
  const hulkOutEv = ev('hulkOut', async d => {
    if (step !== 14) return; setStep(15);
    await talk([[0, `^0Black Widow^7: Wow, what happened by ${d.hero === 'widow' ? 'me' : d.who} in the cell?`], [3, `${d.who}: Looks like something really big escaped from here.`], [3, 'The wall was torn down'], [3, '^4Captain America^7: Be ready, team. Whatever was in the cell is out there somewhere']]);
    if (sync.isHost) spawnRedHulk();
  });
  host.on('update', () => {
    if (step !== 14 || !cellOpened || hulkAsked || !hulkTrig || talking || enemies.list.length >= 10) return;
    if (feet().distanceTo(v3(hulkTrig.origin)) < (hulkTrig.radius ?? 120)) { hulkAsked = true; hulkOutEv(who()); }
  });
  // the Red Hulk: a sprinting boss in the hulk_red model on a zombie's skeleton (the host's zombie; every client dresses
  // its own copy of it, found by id); only the upgraded Ray Gun hurts him, and only while he stands in the salt water by
  // the beach (`kill_red_hulk_0/1`): 20 hits, each reported by whoever lands it
  let red = null, redId = null, redHits = 0, redSeen = false, redSeenAsked = false, hulkModel = null;
  const salt = [one('kill_red_hulk_0'), one('kill_red_hulk_1')].filter(Boolean);
  const redIdEv = ev('redId', d => { redId = d.id; redHits = 0; });
  async function spawnRedHulk() {
    const list = world.spawnBarriers(session), spot = list[Math.floor(Math.random() * list.length)] ?? world.barriers.find(b => b.group !== 'ccube');
    if (!spot) return;
    const z = enemies.spawn((spot.inside ?? spot.position).clone(), null, 'zombie'); if (!z) return;
    session.spawned--; z.boss = true; z.health = z.maxHealth = 1e9; z.speed = 210;
    if (enemies.anims?.ai_zombie_sprint_v1) { z.rig.add('walk', enemies.anims.ai_zombie_sprint_v1, true); z.rig.play('walk'); }
    redIdEv({ id: z.id });
  }
  async function dress(z) {
    z.redPairs = [];
    hulkModel ??= model('hulk_red');
    const m = await hulkModel; if (!m || !enemies.list.includes(z)) return;
    const hulkM = m.clone(true);
    z.root.traverse(o => { if (o.isMesh) o.visible = false; });
    const ref = new Map(); z.root.traverse(o => { if (o.isBone && !ref.has(o.name)) ref.set(o.name, o); });
    hulkM.scale.setScalar(1.25); z.root.add(hulkM);
    const pairs = []; hulkM.traverse(o => { if (o.isBone && ref.has(o.name)) pairs.push([o, ref.get(o.name)]); if (o.isMesh) o.frustumCulled = false; });
    z.redPairs = pairs;
  }
  host.on('update', () => {
    if (redId == null) { red = null; return; }
    if (!red || !enemies.list.includes(red)) { red = enemies.list.find(z => z.id === redId) ?? null; if (red && !red.redPairs) dress(red); }
    if (!red) return;
    for (const [h, zb] of red.redPairs ?? []) h.quaternion.copy(zb.quaternion);
  });
  // he takes no normal damage; the hits that count are reported by the shooter through the impact bus
  const redSeenEv = ev('redSeen', d => { if (redSeen) return; redSeen = true; talk([[0, `${d.who}: Wow, what is that thing???`], [3, "^4Captain America^7: I've seen this monster before. It's the ^1Red Hulk"], [3, '^3Thor^7: Let us now vanquish this beast!!!']]); });
  host.on('beforeEnemyDamage', e => {
    if (redId == null || e.enemy?.id !== redId || e.enemy?.boss === false) return;
    if (!redSeen && !redSeenAsked) { redSeenAsked = true; redSeenEv(who()); }
    e.amount = 0;
  });
  const redHitEv = ev('redHit', async d => {
    if (redId == null) return;
    if (redHits === 0 && !talking) say(`${d.who}: It's working! It will take a ton of ammo though`);
    redHits++;
    if (redHits >= 20) {
      const z = enemies.list.find(x => x.id === redId), at = (z?.root.position ?? feet()).clone();
      redId = null; red = null;
      if (sync.isHost && z) { const before = session.killed; z.boss = false; enemies.hurt(z, 1e12, false, false, 'raygun'); session.killed = before; }
      redDown(at);
    }
  });
  onImpact((p, weapon) => {
    if (!red || weapon !== RAY || !upgradedHeld()) return;
    if (p.distanceTo(red.root.position.clone().add(up(50))) > 90) return;
    if (!salt.some(v => inside(v, red.root.position.clone().add(up(40)), 0))) return;
    redHitEv(who());
  });
  // step 16: Widow, then Banner, at the corpse (an antidote in the salt water)
  let corpse = null, glass = null;
  async function redDown(at) {
    setStep(16); corpse = { at, stage: 'widow', asked: false };
    await talk([[0, '^4Captain America^7: ^1Red Hulk^7 is down'], [3, '^1Spider-Man^7: That guy was pretty scary...'], [3, '^6Tony^7: Really? Youth is wasted on the wrong people.'], [4, "^1Spider-Man^7: I'd agree with you but that would make me a liar."], [3, 'Btw, I was thinkning about your selfie comment earlier, and I just realized'], [3, 'that I have a great idea to get rich!'], [3, 'I just need a lot of money...'], [5, 'Man, if I had a million dollars...'], [3, "^6Tony^7: If I had a million dollars I'd wonder where"], [3, 'the rest of my money was.'], [4, "^3James Rhodes^7: Shut up, you two. Can't you act like two adults?"], [4, "^6Tony^7: We could, but we're missing one"], [4, "^4Captain America^7: That's enough you two. Let's concentrate on our task."], [4, '^6Hawkeye^7: I think we should have ^0Black Widow^7 take a look at the corpse location']]);
    glass = await figure('malibu_drinking_glass', null, { position: at.clone().add(up(40)) }) ?? null;
  }
  const corpseEv = ev('corpse', async d => {
    if (!corpse) return;
    if (d.stage === 'widow' && corpse.stage === 'widow') {
      corpse.stage = 'banner'; corpse.asked = false;
      await talk([[2, '^4Captain America^7: What did you find, ^0Natasha^7?'], [3, '^0Black Widow^7: The salt water is reacting to the skin...'], [3, '^6Hawkeye^7: In what way?'], [4, "^0Black Widow^7: I'm not sure...but its almost as if its returning to normal"], [4, '^4Captain America^7: Wait, so salt water is like an antidote the the disease??'], [4, "^0Black Widow^7: It seems that way...although it doesn't have an effect on the normal zombies"], [4, "^4Captain America^7: Let's get ^2Banner^7 over here to get a second opinion"]]);
    }
    if (d.stage === 'banner' && corpse.stage === 'banner') {
      corpse = null; remove(glass); glass = null;
      await talk([[2, '^4Captain America^7: What are you making of it, ^2Banner^7?'], [4, "^2Bruce Banner^7: I'm going to have to agree with ^0Natasha^7. This looks to be an antidote!"], [4, 'It should be able to provide an immunity for those that have not become infected.'], [4, '^4Captain America^7: Incredible!! We have to get this out to the rest of the world!'], [4, '^0Black Widow^7: How are we gonna do that?'], [5, '^2Bruce Banner^7: ^1Spidey^7, remember that machine that Dr Connors'], [3, 'used when he tried to turn everyone into lizards?'], [3, '^1Spider-Man^7: Ya, I sure do!'], [3, "^2Bruce Banner^7: It may be possible to tap into the city's ventilation system"], [3, 'and use that to spread the antidote across the entire Malibu area very quickly'], [4, "^4Captain America^7: It's a start. Let's do it, Avengers"]]);
      startStations();
    }
  });
  host.on('update', () => {
    if (glass) glass.rotation.y += .03;
    if (!corpse || corpse.asked || talking || feet().distanceTo(corpse.at) >= 60) return;
    if (corpse.stage === 'widow' && is('widow')) { corpse.asked = true; corpseEv({ stage: 'widow' }); }
    else if (corpse.stage === 'banner' && is('banner') && !hulk()) { corpse.asked = true; corpseEv({ stage: 'banner' }); }
  });
  // step 17: four stations
  let machines = 0;
  const machineDone = () => { machines++; say(`^4Captain America^7: ${machines < 4 ? 'Great job, team.' : 'Perfect.'} We got ${machines}/4 systems ready to go`); if (machines === 4) talk([[0, '^4Captain America^7: All stations are online.'], [3, 'What do we do now?'], [3, '^2Bruce Banner^7: I think it would be a safe bet to try and use the computer system at the'], [3, 'Group 935 base. That should already be tapped into the city systems']]).then(() => setStep(18)); };
  // A: ten buttons in an order found by trying (as the Mean Juice valves); the bar slides along
  const aTrigs = named('station_a_trig').map(e => ({ e, order: null }));
  let aNext = 1, aAssigned = 0, aCount = 0, aDone = false, aBusy = false;
  const aAssign = rand => { const free = aTrigs.filter(t => t.order == null); if (free.length) free[Math.floor(rand() * free.length)].order = ++aAssigned; };
  // B: walk onto the lit plate, 25 times (the light moves to a random other plate; a wrong plate starts over)
  const plates = named('ee_step_17_b_plate');
  let bLit = -1, bCount = 0, bDone = false, bLast = -1, bWait = 0;
  // C: a target pops up (the host's timing); shoot it within 1.5 s, ten in a row
  const targets = named('ee_step_17_c_target');
  let cUp = -1, cUntil = 0, cCount = 0, cDone = false, cPause = 0;
  // D: Cap's shield thrown at each of the four dishes turns it
  const dishes = named('ee_step_17_d_dish').map(e => ({ e, turned: false }));
  let dDone = false;
  // the targets wait sunk 50 (setup_ee)
  const sinkTargets = () => { for (const t of targets) { const o = nodeAt('ee_step_17_c_target', center(t)); if (o && !o.userData.sunk) { kit.remember(o); o.userData.sunk = true; o.position.y -= 50; o.updateMatrix(); o.updateMatrixWorld(true); } } };
  sinkTargets();
  const litNode = () => nodes('ee_step_17_b_plate_lit')[0];
  const showLit = i => { bLit = i; const o = litNode(), p = plates[i]; if (o && p) { kit.remember(o); const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()), target = center(p); o.position.add(target.clone().sub(c).setY(0)); o.updateMatrix(); o.updateMatrixWorld(true); } };
  const bPick = rand => { const choices = plates.map((_, i) => i).filter(i => i !== bLast); showLit(choices[Math.floor(rand() * choices.length)]); };
  const stationsEv = ev('stations', (d, ctx) => { if (step === 17) return; setStep(17); aAssign(ctx.rand); bPick(ctx.rand); });
  function startStations() { if (sync.isHost) stationsEv({}); }
  const aEv = ev('aButton', async (d, ctx) => {
    if (aDone) return; const t = aTrigs[d.i]; if (!t) return;
    aBusy = true; sound('malibu_console_beep', { volume: .5 }); await wait(.7);
    if (t.order !== aNext) { move('ee_step_17_a_bar', codXY(-10 * aCount, 0), 1); aCount = 0; aNext = 1; if (ctx.rand() < .4) say('^2Bruce Banner^7: Nope. I gotta get these in the right order.'); await wait(1); aBusy = false; return; }
    aNext++; aCount++; move('ee_step_17_a_bar', codXY(10, 0), 1); await wait(1);
    if (aAssigned === aNext - 1) aAssign(ctx.rand);
    if (aCount === 10) { aDone = true; show('ee_step_17_a_bar', false); machineDone(); }
    aBusy = false;
  });
  aTrigs.forEach((t, i) => world.addInteraction({ position: center(t.e), hidden: () => step !== 17 || aDone, text: () => 'Button', use() { if (aBusy) return false; aBusy = true; aEv({ i }); return true; } }));
  const plateEv = ev('plate', (d, ctx) => {
    if (bDone || step !== 17 || d.i === bLast) return;
    if (d.i === bLit) { bLast = d.i; bCount++; sound('malibu_console_beep', { volume: .4 }); if (bCount >= 25) { bDone = true; show('ee_step_17_b_plate_lit', false); machineDone(); } else bPick(ctx.rand); }
    else { bCount = 0; bLast = -1; say(`${d.who}: Wrong plate. Start over.`); bPick(ctx.rand); }
  });
  const cEv = ev('cTarget', d => {
    if (cDone) return;
    const o = i => nodeAt('ee_step_17_c_target', center(targets[i]));
    if (d.pop != null) { cUp = d.pop; cUntil = now() + 2; const t = o(cUp); if (t) move(t, up(50), .5); return; }
    if (d.miss != null) { const t = o(d.miss); if (t) move(t, up(-50), .5); if (cUp === d.miss) cUp = -1; if (cCount > 0) say('^4Captain America^7: Too slow. The targets reset.'); cPause = now() + (cCount > 0 ? 6 : 1); cCount = 0; return; }
    if (d.hit != null && d.hit === cUp) { const t = o(d.hit); if (t) move(t, up(-50), .5); cUp = -1; cCount++; sound('malibu_console_beep', { volume: .5 }); if (cCount >= 10) { cDone = true; machineDone(); } else cPause = now() + .75; }
  });
  host.on('update', () => {
    if (step !== 17) return;
    // B: each player reports the plate they step on
    if (!bDone && now() > bWait) {
      const f = feet(), i = plates.findIndex(p => center(p).setY(f.y).distanceTo(f) < 35 && Math.abs(center(p).y - f.y) < 40);
      if (i >= 0 && i !== bLast) { bWait = now() + (i === bLit ? .5 : 2); plateEv({ ...who(), i }); }
    }
    // C: the host pops the targets and times them out
    if (!sync.isHost || cDone) return;
    if (cUp < 0 && now() > cPause) { cPause = now() + 99; cEv({ pop: Math.floor(Math.random() * targets.length) }); }
    if (cUp >= 0 && now() > cUntil) { cUntil = Infinity; cEv({ miss: cUp }); }
  });
  for (const [i, t] of targets.entries()) damageTrigger(t, () => { if (step === 17 && !cDone && cUp === i) cEv({ hit: i }); }, 20);
  // D: the shield throw asks for a target first (powers.js calls kit.shieldTarget)
  const dishEv = ev('dish', d => {
    const x = dishes[d.i]; if (!x || dDone) return;
    x.turned = !x.turned; const o = nodeAt('ee_step_17_d_dish', v3(x.e.origin)); if (o) move(o, up(0), .25, { rot: new THREE.Euler(0, (x.turned ? -40 : 40) * Math.PI / 180, 0) });
    if (dishes.every(y => y.turned)) { dDone = true; machineDone(); }
  });
  kit.shieldTarget = (eye, dir) => {
    if (step !== 17 || dDone) return null;
    for (const [i, x] of dishes.entries()) {
      const at = v3(x.e.origin), to = at.clone().sub(eye), dist = to.length();
      if (dist < 1500 && to.normalize().dot(dir) > Math.cos(5 * Math.PI / 180)) return { at, hit: () => dishEv({ i }) };
    }
    return null;
  };
  // steps 18-20: the antidote, and the end of the next round wins the game
  async function antidote() {
    talking = true;
    say('^2Bruce Banner^7: The computer is processing the formula...'); await wait(3); sound('malibu_ee_end', { volume: .8 });
    const shake = setInterval(() => { const r = api.camera.rotation; r.x += (Math.random() - .5) * .01; r.y += (Math.random() - .5) * .01; }, 50);
    for (const [d, t] of [[5, "^1Spider-Man^7: What's going on????"], [3, '^4Captain America^7: Hold your positions, team. The antidote is being sent out!!!'], [3, "^1Spider-Man^7: I don't see anything??"], [3, '^6Tony^7: The anitdote is a gas, you ding nut'], [8, '^1Spider-Man^7: Is it over?'], [3, '^4Captain America^7: Ya, I think so. '], [3, 'Did it work?'], [5, "^6Tony^7: Idk, it doesn't work for already-living zombies, right?"], [3, '^4Captain America^7: Right.'], [5, "^6Tony^7: Alright, let's kill every other zombie we can find"], [4, "then we'll know if this worked or not."]]) { await wait(d); say(t); if (d === 8) clearInterval(shake); }
    talking = false;
    await nextRound();
    session.effects.invulnerable = Infinity;
    blackout.style.transition = 'opacity 5s'; blackout.style.opacity = 1;
    host.emit('malibuWon');
    await wait(7);
    for (const [d, t] of [[0, '^1Spider-Man^7: Yes!!! It worked!!!'], [5, '^6Tony^7: Ya, no more zombies. Around here anyway.'], [3, '^4Captain America^7: Great job, Avengers. But our work has just begun']]) { await wait(d); say(t); }
    await wait(3);
    blackout.style.opacity = 0; blackout.style.transition = 'opacity 1.5s';
    session.effects.invulnerable = 0;
    import('../stark/unlocks.js').then(m => m.addWin?.()).catch(() => {});   // a win counts toward STARK.EXE's Mark XVI, as Cheese Cube's do
    session.phase = 'gameover'; session.lastEvent = 'The Avengers saved Malibu'; host.emit('gameOver', { round: session.round, kills: session.kills });
  }

  host.on('reset', () => {
    step = 0; setPart(null); briefState = 'ready'; tankCount = 0; analysing = false; bioRead = false; serverTried = false; serverReady = false; serverBusy = false; brickFound = false; locks = 0;
    for (const d of DIALS) { d.value = 5; d.busy = false; } dialsDone = false; lock2 = null; lock2Done = false; lock3Done = false; mainframeSeen = false; hacked = 0; rayTold = 0; rayAsked = ''; built.clear(); carried.clear(); charge = 0;
    dreamed = false; inDream = false; cheeseWall = false; found13 = false; step13Done = false; blackUsed = false; spidey = null; keyTaken14 = false; cellOpened = false; hulkAsked = false; red = null; redId = null; redHits = 0; redSeen = false; redSeenAsked = false;
    corpse = null; machines = 0; aNext = 1; aAssigned = 0; aCount = 0; aDone = false; aBusy = false; for (const t of aTrigs) t.order = null; bLit = -1; bCount = 0; bDone = false; bLast = -1; cUp = -1; cCount = 0; cDone = false; dDone = false; for (const d of dishes) d.turned = false;
    for (const t of targets) { const o = nodeAt('ee_step_17_c_target', center(t)); if (o) o.userData.sunk = false; } setTimeout(sinkTargets, 0);
    stones = 0; spinning.clear(); timeState = 'idle'; timeLeft = 100; powerHits = 0; powerDone = false; realityAwake = false; realityZaps = 0; realityTold = false; realityAsked = false; realityDone = false; soulState = 'hidden';
    world.papLocked = true; world.papLockedText = 'Missing Elements'; padUses = 0; padRoundOk = false; cellOpen = false; cellBusy = false; keyAfterRound = false; keyIdx = -1;
    setTimeout(() => { if (sync.isHost) placeKey(); }, 300);
    batEggs = 0; batWallGone = false; batmanGone = false; batmanAsked = false; batSightings = 0; batSpot = null; remove(batModel); batModel = null; batmobileSeen = false; sceneSeen = false; sceneAsked = false; batTaken.clear();
    remove(holoZombie); holoZombie = null; remove(glass); glass = null; blackout.style.opacity = 0; roundWaiters.length = 0; talking = false;
  });

  return { state: () => ({ step, part: part?.id ?? null, stones, papLocked: world.papLocked, locks, dials: DIALS.map(d => d.value), charge, machines, a: aCount, b: bCount, c: cCount, d: dishes.filter(x => x.turned).length, red: redId != null, redHits, batEggs, batSightings, keyIdx, cellOpen, padUses, timeState, powerHits, soulState, realityDone, briefState, dreamed, found13, step13Done }),
    setStep: n => stepEv({ n }), take: (id, label) => { setPart({ id, label }); return true; }, setPart, spawnRedHulk, startStations, dream: () => dreamEv({}),
    // the journal reads these (its quests' steps)
    flags: () => ({ step, stones: { time: timeState === 'done', power: powerDone, reality: realityDone, soul: soulState === 'done' }, timeState, soulState, batEggs, batmanGone, batSightings, batSpot: !!batSpot, keyIdx, cellOpen, locks: { dials: dialsDone, consoles: lock2Done, charger: lock3Done }, built: [...built], machines: { a: aDone, b: bDone, c: cDone, d: dDone }, dreamed, found13, step13Done, cheeseWall, red: redId != null }) };
}
