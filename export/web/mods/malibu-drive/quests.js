// Malibu Drive's quests and side systems (_easter_egg.gsc, _ee_step_4_lock1.gsc, _infinity_stones.gsc, _police_station.gsc,
// _tesserrect_suitcase.gsc, _asgard.gsc's summon pad, _random_easter_eggs.gsc, _zombiemode.gsc's Red Hulk):
//   Parts: one at a time (the original's player.has_part), shown on the right ("Part: Key").
//   Bifrost summon pad (the driveway, `asgard_summon_trig`): from round 2, back up to Asgard (to change hero); three
//     uses a round solo.
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
//     Group 935 base (the loose brick) and its three locks (the dials 2-3-9, two consoles hit by the same hero within
//     15 s, Mjolnir to charge the third); the Hulk smashes the inner vault, the last one costs 10000; the mainframe
//     consoles (hero who knows computers: Tony, Banner, Vision, Widow, one per player); a Ray Gun, upgraded with the
//     stones; the three parts for Tony's bed machine, charged by 100 upgraded Ray Gun hits; the trip into Tony's dream
//     (the Cheese Cube: three rounds, the code on the wall, the Cheese Gun on its wall); what Tony found (the black suit
//     for Spider-Man); the cell key, the Red Hulk (only hurt by the upgraded Ray Gun while he stands in the salt water),
//     Widow and Banner at his corpse; the four stations (button order, the lit plates, the pop-up targets, Cap's shield
//     on the four dishes); Banner's antidote, and the game is won at the end of the next round.
import * as THREE from 'three';

const W_ = n => 'malibu_' + n;
const RAY = 'ray_gun_zm';

export function setupQuests(kit, heroes, tony, powers) {
  const { api, one, named, center, say, dialog, wait, move, nodes, show, solid, sound, model, figure, remove, now, feet, v3, onImpact } = kit;
  const { world, session, host, player, data, scene, enemies, toast, announce } = api;
  const name = () => heroes.name();
  const is = id => heroes.is(id);
  const up = d => new THREE.Vector3(0, d, 0);
  const codXY = (x, y) => new THREE.Vector3(x, 0, -y);
  let talking = false;   // level.dialog_playing
  const talk = async steps => { if (talking) return false; talking = true; try { for (const [d, t] of steps) { if (d) await wait(d); say(t); } } finally { talking = false; } return true; };
  const boxOf = e => e?.bounds ? new THREE.Box3(v3(e.bounds[0]), v3(e.bounds[1])) : e ? new THREE.Box3().setFromCenterAndSize(v3(e.origin), new THREE.Vector3(1, 1, 1).multiplyScalar(2 * (e.radius ?? 40))) : null;
  const inside = (e, p, pad = 0) => { const b = boxOf(e); return !!b && b.clone().expandByScalar(pad).containsPoint(p); };
  // an ENT node of a name that several entities share: the one nearest that entity
  const nodeAt = (n, p) => nodes(n).map(o => ({ o, d: new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).distanceTo(p) })).sort((a, b) => a.d - b.d)[0]?.o ?? null;
  const hasRay = up2 => session.inventory.some(w => w.id === RAY && (!up2 || w.upgraded));
  const holdingRay = up2 => session.def?.id === RAY && (!up2 || session.weapon?.upgraded);
  // damage triggers: an impact within the trigger (padded) with the weapon (or any)
  const dmg = [];
  const damageTrigger = (e, fn, pad = 24) => { const d = { e, fn, pad, on: true }; dmg.push(d); return d; };
  onImpact((p, weapon, kind) => { for (const d of [...dmg]) if (d.on && inside(d.e, p, d.pad)) d.fn(weapon, kind, p); });
  const upgradedHeld = () => session.def?.id === RAY && !!session.weapon?.upgraded;

  // ---------------------------------------------------------------- parts
  let part = null;   // {id, label}
  const partHud = document.createElement('div');
  partHud.style.cssText = 'position:fixed;right:22px;top:52%;z-index:30;font:700 13px Arial,Helvetica,sans-serif;color:#ffe066;text-shadow:0 1px 2px #000;pointer-events:none';
  document.body.append(partHud);
  const setPart = p => { part = p; partHud.textContent = p ? 'Part: ' + p.label : ''; };
  const take = (id, label) => { if (part) { say('[i] You already have a part'); return false; } setPart({ id, label }); sound('pickup_part', { volume: .6 }); return true; };

  // ---------------------------------------------------------------- Bifrost summon pad (back to Asgard)
  const pad = one('asgard_summon_trig'), padFx = one('asgard_summon_fx_0');
  let padUses = 0, padRoundOk = false;
  host.on('roundEnd', () => { padRoundOk = true; padUses = 0; });
  if (pad) world.addInteraction({ position: center(pad), text: () => !padRoundOk ? 'The Bifrost is not ready' : padUses >= 3 ? 'The Bifrost is recharging · next round' : 'Summon Bifrost · FREE', use() {
    if (!padRoundOk || padUses >= 3) return false;
    padUses++;
    (async () => {
      for (let i = 0; i < 5; i++) { const f = one('asgard_summon_fx_' + i); if (f) kit.fx(v3(f.origin).add(up(20)), 0xbfe6ff, 30); await wait(.5); }
      if (feet().distanceTo(v3(padFx.origin)) < 500) { const s = one('asgard_bifrost_spawn_0'); player.setPosition(v3(s.origin).add(up(10))); sound('bifrost_tele', { volume: .7 }); kit.flash(.6); }
    })();
    return true;
  } });

  // ---------------------------------------------------------------- the Tesseract (the Mystery Box)
  (async () => {
    const [bottom, top] = await Promise.all([model('malibu_tesserrect_bottom'), model('malibu_tesserrect_top')]);
    for (const loc of world.boxLocations) {
      if (loc.rubble) loc.rubble.visible = false;
      const group = loc.box; if (!group) continue;
      for (const c of [...group.children]) if (!world.entities.get(loc.prefix + '_lid') || c !== world.entities.get(loc.prefix + '_lid')) c.visible = false;
      if (bottom) { const b = bottom.clone(); b.rotation.y = -Math.PI / 2; group.add(b); }
      const lid = world.entities.get(loc.prefix + '_lid');
      if (lid) { for (const c of lid.children) c.visible = false; if (top) { const t = top.clone(); t.position.set(0, -16, -4); t.rotation.y = -Math.PI / 2; lid.add(t); } }
      const glow = new THREE.PointLight(0x4aa8ff, 1.2, 160); glow.position.set(0, 12, 0); group.add(glow);
    }
    const start = world.boxLocations[Math.floor(Math.random() * world.boxLocations.length)];
    if (start) { world.activeBox = start; world.updateBox(); }
  })();
  const updateBox = world.updateBox.bind(world);
  world.updateBox = () => { updateBox(); for (const loc of world.boxLocations) if (loc.rubble) loc.rubble.visible = false; };

  // ---------------------------------------------------------------- the police station jail
  const keys = named('police_jail_key');
  let keyIdx = -1, cellOpen = false, cellBusy = false;
  const placeKey = () => { keyIdx = Math.floor(Math.random() * keys.length); keys.forEach((k, i) => show(k.target, i === keyIdx)); };
  placeKey();
  keys.forEach((k, i) => world.addInteraction({ position: center(k), hidden: () => i !== keyIdx, text: () => 'Pick up the key', use() {
    if (!take('police', 'Key')) return false;
    show(k.target, false); keyIdx = -1; say('[i] You have found a key'); return true;
  } }));
  solid('police_jail_door', true);
  const jailTrig = one('police_jail_door_trig');
  if (jailTrig) world.addInteraction({ position: center(jailTrig), text: () => cellOpen ? 'Close the cell' : 'Cell door', async use() {
    if (cellBusy) return false;
    if (cellOpen) { cellBusy = true; say('[i] Closing Cell...'); await move('police_jail_door', codXY(50, 0), 1); solid('police_jail_door', true); cellOpen = false; cellBusy = false; host.once?.('roundEnd', placeKey) ?? (keyAfterRound = true); return true; }
    if (!part) { say('[i] You are missing a part'); return false; }
    if (part.id !== 'police') { say('[i] This is the incorrect part'); return false; }
    cellBusy = true; setPart(null); say('[i] Opening Cell...');
    solid('police_jail_door', false); await move('police_jail_door', codXY(-50, 0), 1); cellOpen = true; cellBusy = false; return true;
  } });
  let keyAfterRound = false;
  host.on('roundEnd', () => { if (keyAfterRound) { keyAfterRound = false; placeKey(); } });

  // ---------------------------------------------------------------- Infinity Stones and the Pack-a-Punch
  let stones = 0;
  const STONES = ['stone_time_end', 'stone_power_end', 'stone_reality_end', 'stone_soul_end'];
  for (const s of STONES) show(s, false);
  world.papLocked = true; world.papLockedText = 'Missing Elements';
  if (world.papMachine) world.papMachine.visible = false;
  const spinning = new Set();
  host.on('update', dt => { const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60; for (const n of spinning) for (const o of nodes(n)) { const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); o.position.sub(c); o.position.applyAxisAngle(up(1), step * 6.3); o.position.add(c); o.rotateY(step * 6.3); o.updateMatrix(); o.updateMatrixWorld(true); } });
  async function stoneDone(startName, endName, rise = 100) {
    move(startName, up(rise), 3, { rot: new THREE.Euler(0, 20, 0) });
    for (let i = 0; i < 7; i++) { const b = kit.boxOf(startName); kit.fx(b.getCenter(new THREE.Vector3()), 0xff66ff, 10); await wait(.5); }
    show(startName, false); show(endName, true); spinning.add(endName);
    stones++;
    if (stones === 4) { world.papLocked = false; world.papLockedText = null; announce('THE INFINITY STONES', "THE UPGRADE PEDESTAL IS AWAKE", 5); }
  }
  // the pedestal: Pack-a-Punch without the machine (it stands for "the Infinity Stone's power")
  host.on('update', () => { if (world.papMachine?.visible) world.papMachine.visible = false; });
  // Time
  const timeTrig = one('stone_time_start_trig');
  let timeState = 'idle', timeLeft = 100, timeTick = 0, timeWho = null;
  host.on('update', () => {
    if (!timeTrig) return;
    const here = inside(timeTrig, feet().add(up(30)), 10);
    if (timeState === 'idle' && here && session.phase === 'fighting') {
      timeState = 'talk'; timeWho = name();
      (async () => {
        await talk([[0, `${timeWho}: Guys, I found a stone over here.`], [3, `${timeWho}: I believe this is the Time Stone.`], [3, `${timeWho}: We need to spend some time around it and see if anything happens`], [3, `${timeWho}: No pun intended. We need everyone though.`], [3, `${timeWho}: I think the stone will spark if it's working.`]]);
        if (enemies.list.length < 7) for (const z of [...enemies.list]) enemies.hurt(z, 1e6);
        await wait(2); say(`${timeWho}: More zombies inbound. This just got harder.`);
        timeState = 'charging'; timeTick = now() + 2;
      })();
    }
    if (timeState === 'charging' && now() >= timeTick) {
      timeTick = now() + 2;
      if (!here) { if (timeLeft < 99) say(`${timeWho}: Crud. Someone else, or myself, is not close enough.`); timeLeft = 100; return; }
      timeLeft -= 2; kit.fx(kit.boxOf('stone_time_start').getCenter(new THREE.Vector3()), 0xff7a2e, 8);
      if (timeLeft < 1) { timeState = 'done'; say(`${timeWho}: Yes!!! Got it.`); stoneDone('stone_time_start', 'stone_time_end'); }
    }
  });
  // Power: 25 Mjolnir hits; only Thor focuses it
  let powerHits = 0, powerDone = false;
  const powerTrig = one('power_stone_start_trig');
  if (powerTrig) damageTrigger(powerTrig, w => {
    if (powerDone) return;
    if (w !== W_('thor_hammer')) { if (!talking && !heroes.form()?.hp) say(`${name()}: Hmmm...I wonder how we can charge the Power Stone.`); return; }
    powerHits++; kit.fx(center(powerTrig), 0x7fe0ff, 10);
    if (powerHits > 24) {
      if (is('thor')) { powerDone = true; say('^3Thor^7: The stone has been powered.'); stoneDone('power_stone_start', 'stone_power_end'); }
      else { say('^3Vision^7: Agh. I can\'t focus Mjolnir\'s energy.'); powerHits = 0; }
    }
  }, 40);
  // Reality: it zaps whoever comes within 150; the Electro-Shock arrow neutralises it
  const realityRadius = one('stone_reality_start_trig_radius'), realityTrig = one('stone_reality_start_trig'), realityStone = one('stone_reality_start');
  let realityAwake = false, realityZaps = 0, realityTold = false, realityDone = false, zapAt = 0;
  host.on('update', () => {
    if (realityDone || !realityStone) return;
    const c = v3(realityStone.origin);
    if (!realityAwake && realityRadius && feet().distanceTo(v3(realityRadius.origin)) < (realityRadius.radius ?? 200)) realityAwake = true;
    if (realityAwake && now() > zapAt && feet().distanceTo(c) < 150) {
      zapAt = now() + .5; kit.fx(c, 0xff3355, 14);
      session.effects.invulnerable = 0; session.damage(session.health + 10); realityZaps++;
      if (realityZaps > 2 && !realityTold) { realityTold = true; talk([[0, '^1Spider-Man^7: People, I found a stone up here.'], [2, '^4Captain America^7: Perfect. Grab it and bring it down.'], [2, "^1Spider-Man^7: Well, that's the problem, Cap."], [2, "^1Spider-Man^7: It doesn't let me near it."], [3, '^4Captain America^7: Is it a red stone?'], [2, '^1Spider-Man^7: Ya. Ruby redish.'], [3, '^3Thor^7: That is the Reality Stone. The Aether.'], [3, '^3Thor^7: We have to neutralize it with another power.'], [2, "^1Spider-Man^7: It's gonna require a good vantage point, though."]]); }
    }
  });
  if (realityTrig) damageTrigger(realityTrig, w => {
    if (realityDone) return;
    if (w === W_('hawkeye_bow3')) { realityDone = true; say('^6Hawkeye^7: There we go. I knew I was good for something.'); move('stone_reality_start', codXY(0, -50), 1).then(() => stoneDone('stone_reality_start', 'stone_reality_end', 50)); }
    else if (w === W_('thor_hammer') && !talking) say(`${name()}: This won't work. But this type of power might.`);
    else if ((w === W_('hawkeye_bow1') || w === W_('hawkeye_bow2')) && !talking) say('^6Hawkeye^7: I should use a different type of arrow.');
  }, 40);
  // Soul: found at Tony's bed (look at it), filled by a zombie killed in its room
  const soulTrig = one('stone_soul_start_trig'), soulRoom = one('stone_soul_start_room');
  let soulState = 'hidden';
  if (soulTrig) world.addInteraction({ position: center(soulTrig), hidden: () => soulState !== 'hidden', text: () => 'A glowing stone', use() {
    soulState = 'found';
    const who = is('cap') ? 'me' : is('tony') ? 'you' : name();
    talk([[0, '^4Captain America^7: Are you kidding me, Stark???'], [3, `^4Captain America^7: You left an infinity stone over by ${who}'s bed??`], [3, "^6Tony^7: What's wrong with that?"], [2, '^4Captain America^7: You cause me so much pain.'], [3, '^6Tony^7: Life is pain.'], [3, '^6Tony^7: Anyone who tells you differently is selling something.'], [3, '^3Thor^7: Cease bickering, children. The Soul Stone requires souls.'], [3, '^6Tony^7: Really? Kill zombies near the stone to fill it?'], [3, "^6Tony^7: Couldn't this mapper be more original?"], [3, '^3Thor^7: We fill the stone with Extremis zombie souls'], [4, '^6Tony^7: I think I just wet myself.']]);
    return true;
  } });
  host.on('kill', e => {
    if (soulState !== 'found' || !soulRoom || !e?.enemy) return;
    if (!inside(soulRoom, e.enemy.root.position.clone().add(up(30)), 20)) return;
    soulState = 'done'; say('^3Thor^7: The Soul Stone has been filled.'); stoneDone('stone_soul_start', 'stone_soul_end', 70);
  });

  // ---------------------------------------------------------------- Batman
  let batEggs = 0, batWallGone = false, batmanGone = false, batSightings = 0, batSpot = null, batModel = null;
  solid('batman_wall', true); solid('batman_clip', true);
  const batEgg = () => { batEggs++; if (batEggs >= 6 && !batWallGone) { batWallGone = true; show('batman_wall', false); solid('batman_wall', false); } };
  const batmobile = one('batmobile_trig');
  let batmobileSeen = false;
  if (batmobile) damageTrigger(batmobile, () => {
    if (!batmobileSeen) { batmobileSeen = true; batEgg(); }
    const who = name(), lines = [
      [[0, '^6Hawkeye^7: Guys, I\'ve been meaning to ask this, but has anyone else'], [2, `^6Hawkeye^7: noticed the unidentified black vehicle by ${is('hawkeye') ? 'me' : who}?`], [2, '^4Captain America^7: I have. Still no intel on it. Keep your eyes open, team.']],
      [[0, `^1Spider-Man^7: Wow, look at that sportscar by ${is('spiderman') ? 'me' : who}!!!`], [2, '^3Thor^7: I have observed it as well. Frost giants, perhaps?'], [2, '^6Tony Stark^7: Nah, not this tech. This is something else.']],
      [[0, `^0Black Widow^7: There's a vehicle over by ${is('widow') ? 'me' : who} that I don't recognize`], [2, "^4Captain America^7: Copy that, Romanoff. It's raised my eyebrow too."]]];
    if (Math.random() < .6) talk(lines[Math.floor(Math.random() * lines.length)]);
  }, 60);
  const scene2 = one('batarang_scene_trig');
  let sceneSeen = false;
  host.on('update', () => {
    if (!sceneSeen && scene2 && feet().distanceTo(v3(scene2.origin)) < (scene2.radius ?? 120) && !talking) {
      sceneSeen = true; batEgg();
      talk([[0, `^3James Rhodes^7: Team, look at what ${is('rhodes') ? 'I' : name()} just found...`], [2, '^4Captain America^7: Copy that, Rhodes.'], [3, "^3James Rhodes^7: I don't think we're the only ones here."], [3, "^4Captain America^7: I'm starting to wonder. Examine those corpses for clues."]]);
    }
  });
  for (const b of named('batarang')) {
    let taken = false;
    world.addInteraction({ position: center(b), hidden: () => taken, text: () => 'A strange object', use() {
      if (talking) return false;
      taken = true; batEgg();
      talk([[0, `${name()}: ${['This doesn\'t look natural.', 'What on earth is this thing?', 'Looks like some sort of weapon...', 'I wonder how this got here', 'Odd. I wonder how this got here.', 'I should keep an eye out for where this came from.'][Math.floor(Math.random() * 6)]}`]]);
      return true;
    } });
  }
  const smoke = one('batman_smoke_trig'), batman = one('batman');
  host.on('update', () => {
    if (batmanGone || !batWallGone || !smoke) return;
    if (feet().distanceTo(v3(smoke.origin)) < (smoke.radius ?? 120)) {
      batmanGone = true; sound('batman_smoke', { volume: .7 }); kit.fx(v3(batman.origin).add(up(90)), 0x222222, 40);
      wait(2.5).then(() => { show('batman', false); solid('batman_clip', false); });
      wait(6).then(() => talk([[0, `^0Black Widow^7: Guys, there is someone else here. ${is('widow') ? 'I' : name()} just ran into him`], [2, '^3James Rhodes^7: Who? What did he look like?'], [2, '^4Captain America^7: Copy that, Romanoff. He could still be around somewhere.'], [2, '^4Captain America^7: Keep your eyes open, team. Find him. He could be trouble.']]).then(nextBatman));
    }
  });
  const batSpawns = named('batman_spawn');
  async function nextBatman() {
    if (batSightings > 3 || !batSpawns.length) return;
    const s = batSpawns[Math.floor(Math.random() * batSpawns.length)];
    await wait(3);
    batModel = await figure('malibu_batman', null, { position: v3(s.origin), yaw: kit.yawOf(s) }) ?? await model('malibu_batman');
    batSpot = { s, trig: one(s.target) };
  }
  host.on('update', () => {
    if (!batSpot) return;
    const t = batSpot.trig, at = t ? v3(t.origin) : v3(batSpot.s.origin);
    if (feet().distanceTo(at) < (t?.radius ?? 200)) {
      const spot = batSpot; batSpot = null;
      (async () => {
        await wait(1); kit.fx(v3(spot.s.origin), 0x222222, 40); sound('batman_smoke', { volume: .6 }); await wait(3.5); remove(batModel); batModel = null;
        await wait(5); batSightings++;
        if (batSightings > 3) talk([[0, `${is('hulk') ? 'Black Widow' : name()}: Ok, seriously, there is something up there.`], [2, "^3James Rhodes^7: It's been seen several times now"], [2, '^4Captain America^7: We need to keep an eye out for clues.'], [3, "^6Tony Stark^7: I've already had ^5JARVIS^7 scanning his vehicle's tread mark trail."], [3, "^6Tony Stark^7: Turns out that his vechicle's tracks show up two miles from"], [3, '^6Tony Stark^7: here...out of nowhere.'], [3, '^4Captain America^7: Are you saying he just came from thin air?'], [3, '^6Tony Stark^7: Looks that way. ^5JARVIS^7 has beem running an analysis but'], [3, '^6Tony Stark^7: the results are pretty ridiculous.'], [3, '^4Captain America^7: What are the results, Stark?'], [3, '^6Tony Stark^7: That this guy we keep seeing is from another universe.']]);
        else { talk([[0, `${name()}: ${['I saw something! Or...someone...', "It's gone! What was that?", 'That was odd...I thought there was something there.', "Where'd it go? I should keep an eye out for it again."][Math.floor(Math.random() * 4)]}`]]); await new Promise(r => roundWaiters.push(r)); nextBatman(); }
      })();
    }
  });

  // ================================================================ the main Easter egg
  let step = 0;
  const setStep = n => { step = n; };
  // ---- step 0: Nick Fury's briefing
  const brief = one('malibu_mission_briefing');
  let briefState = 'ready';
  show('malibu_mission_briefing_screen', false);
  if (brief) world.addInteraction({ position: center(brief), hidden: () => briefState === 'done' || briefState === 'wait', text: () => briefState === 'ready' ? 'Message from Nick Fury' : 'Press F when finished', async use() {
    if (briefState === 'ready') { briefState = 'wait'; show('malibu_mission_briefing_screen', true); sound('malibu_console_beep'); await wait(5); briefState = 'read'; return true; }
    if (briefState !== 'read' || talking) return false;
    briefState = 'done';
    await talk([[0, '^4Captain America^7: Alright, team. You all get that?'], [3, '^1Spider-Man^7: Group 935, Hydra, Extremis, 115....I think so...?'], [4, '^4Captain America^7: We have to find a way to stop this apocalypse'], [4, 'We should figure out what this Element 115 stuff is first.'], [3, '^6Hawkeye^7: How should we proceed?'], [3, "^6Tony Stark^7: We can do it at my place. I've got an analyzation tank"], [2, 'We just need some live specimen in there.']]);
    setStep(1); return true;
  } });
  // ---- the battery: Mjolnir charges it, then anything near it (zombies) is shocked; in step 1 a zombie gets "charged"
  const battery = one('charge_battery_trig');
  let batteryCharged = false;
  if (battery) damageTrigger(battery, w => {
    if (w === W_('thor_hammer') && !batteryCharged) { batteryCharged = true; (async () => { for (let i = 0; i < 3; i++) { kit.fx(center(battery), 0x7fe0ff, 14); await wait(1); } })(); return; }
    if (batteryCharged) {
      batteryCharged = false; kit.fx(center(battery), 0x7fe0ff, 30); sound('electrical_surge', { volume: .6 });
      for (const z of enemies.list) if (z.root.position.distanceTo(center(battery)) < 200) { if (step === 1) z.charged = true; else enemies.hurt(z, 100); }
      if (feet().distanceTo(center(battery)) < 200) { session.effects.invulnerable = 0; session.damage(100); }
      return;
    }
    if (w !== W_('thor_hammer') && !heroes.form()?.hp && !talking) say(`${name()}: There must be a way to charge this up...`);
  }, 30);
  host.on('update', () => { for (const z of enemies.list) if (z.charged && Math.random() < .15) kit.fx(z.root.position.clone().add(up(65)), 0x7fe0ff, 2); });
  // ---- step 1: the analysis tank (a zombie dropped in Tony's tank from Scarlet's telekinesis)
  const tank = one('tony_tank');
  let tankCount = 0, analysing = false;
  host.on('update', () => {
    if (step !== 1 || analysing || !tank) return;
    const z = enemies.list.find(z => inside(tank, z.root.position.clone().add(up(40)), 10));
    if (!z) return;
    analysing = true; const ai = z.ai; z.ai = () => {};
    (async () => {
      if (!tony.state().jarvisOn) { say('^6Tony Stark^7: Crud. Systems are offline. We need ^5JARVIS^7 online to do this.'); z.ai = ai; await wait(3); analysing = false; return; }
      if (!z.charged && tankCount < 2) { tankCount++; say('^6Tony Stark^7: Perfect. We gotta give ^5JARVIS^7 some time to analyze this thing'); await wait(10); enemies.hurt(z, 1e6); say('^6Tony Stark^7: The specimen died. We gotta try another one'); analysing = false; return; }
      if (!z.charged) { tankCount++; say('^6Tony Stark^7: Good. ^5JARVIS^7 try again.'); await wait(10); enemies.hurt(z, 1e6); await talk([[0, '^6Tony Stark^7: He died again. Are you having issues ^5JARVIS^7?'], [3, '^5JARVIS^7: The creature is not able to survive my scanning techniques.'], [3, '^5JARVIS^7: I suggest we find a way to super-charge our next victim']]); analysing = false; return; }
      await talk([[0, '^6Tony Stark^7: So will this charged one work?'], [3, '^5JARVIS^7: We will know in a few moments.'], [7, '^5JARVIS^7: Bio scan complete. Recreating anatomy on the holo-floor...']]);
      enemies.hurt(z, 1e6);
      const holo = one('ee_step_1_holo');
      holoZombie = holo ? await figure('malibu_napalm_zombie_body', null, { position: v3(holo.origin) }) : null;
      show('ee_step_1_screen', true);
      await wait(2); await talk([[0, '^5JARVIS^7: Recreation complete.'], [3, "^6Tony Stark^7: Thanks, ^5JARVIS^7. We'll get back to you after we read the results"]]);
      setStep(2); analysing = false;
    })();
  });
  let holoZombie = null;
  show('ee_step_1_screen', false);
  host.on('update', dt => { if (holoZombie) holoZombie.rotation.y += (typeof dt === 'number' ? dt : 1 / 60) * Math.PI * 2 / 8; });
  // ---- step 2: read the bio, then bribe the server (8000)
  const bio = one('ee_step_1_trig');
  let bioRead = false;
  if (bio) world.addInteraction({ position: center(bio), hidden: () => step !== 2 || talking, text: () => !bioRead ? "Press F when you've read the bio" : 'Bribe the server · 8000', async use() {
    if (!bioRead) {
      bioRead = true;
      await talk([[0, "^6Tony Stark^7: ^5JARVIS^7, what's this about more info on a server?"], [3, '^5JARVIS^7: There is a server that holds additional information about Element 115.'], [3, '^5JARVIS^7: The server requires a bribe, however, to access'], [3, "^6Tony Stark^7: Do it. We'll raise the money somehow"], [3, '^5JARVIS^7: I will begin setting up the transaction.'], [3, '^1Spider-Man^7: ^6Tony^7, maybe we should stop and setup a budget'], [2, 'I mean, money is pretty hard to come by. We should have a meeting.'], [3, '^6Tony Stark^7: Nah, money is my life. We got this.'], [4, "^4Captain America^7: Money doesn't mean everything. You can't buy happiness."], [4, "^6Tony Stark^7: That's why I rent it."], [5, '^6Tony Stark^7: Besides, ^1Spidey^7, you literally take selfies for a living. Shut up.']]);
      return true;
    }
    if (session.points < 8000) { say(`${name()}: Rats. I need some more moolah`); return false; }
    session.spend(8000); sound('malibu_console_beep');
    remove(holoZombie); holoZombie = null; await wait(1); show('ee_step_1_screen', false);
    setStep(3);
    await talk([[0, '^5JARVIS^7: Finishing transaction...'], [6, '^5JARVIS^7: Transaction complete.'], [3, '^5JARVIS^7: Server location is 4th floor of Best Eastern in the West']]);
    return true;
  } });
  // ---- step 3: Tony breaks into the server (first time: Windows updates; next round it works)
  const server = one('ee_step_3_trig');
  let serverTried = false, serverReady = false;
  show('ee_step_3_screen1', false); show('ee_step_3_screen2', false);
  if (server) world.addInteraction({ position: center(server), hidden: () => step !== 3 || talking || (serverTried && !serverReady), text: () => 'Server', async use() {
    if (!is('tony')) { say(`${name()}: We need ^6Tony^7 to break into this server`); return false; }
    if (!serverTried) {
      serverTried = true;
      await talk([[0, '^6Tony Stark^7: Alright...']]); await wait(2); show('ee_step_3_screen1', true);
      await talk([[2, '^6Tony Stark^7: Almost there...and....']]); await wait(3); show('ee_step_3_screen2', true);
      await talk([[1, '^6Tony Stark^7: Oh seriously???'], [3, "^4Captain America^7: What's wrong, ^6Stark^7?"], [3, '^6Tony Stark^7: Windows is updating'], [3, '^0Black Widow^7: I hate it when that happens'], [4, '^5Quicksilver^7: I wonder if that ever happened while this map was being made...'], [4, "^6Tony Stark^7: This won't be done for a while. We'll have to come back next round"]]);
      const off = () => { serverReady = true; wait(15).then(() => show('ee_step_3_screen2', false)); };
      host.once?.('roundEnd', off) ?? (serverWait = off);
      return true;
    }
    await talk([[0, "^6Tony Stark^7: Let's try this again..."], [3, '^6Tony Stark^7: Almost got it...'], [3, '^6Tony Stark^7: Got it. ']]);
    await wait(3); show('ee_step_3_screen1', false);
    setStep(4);
    await talk([[0, '^6Tony Stark^7: I sent ^5JARVIS^7 the server intel'], [3, '^5JARVIS^7: The intel transfer is almost complete. Please wait...'], [5, '^5JARVIS^7: Transfer complete. The intel appears to have much to say about Element 115'], [3, '^4Captain America^7: What does it say?'], [4, '^5JARVIS^7: Element 115 was discovered in Northern France during World War I by the Nazi party'], [4, 'Group 935 was constructed to attempt to understand its properties'], [4, '935 was led by Dr. Ludvig Maxis and Dr. Edward Richtofen'], [4, 'The origins of the apocalypse we now face have their roots in this group'], [4, "I've also continued to analyze the charged-specimen and its chemical properties contain"], [4, 'Element 115 as well.'], [4, 'It also seems to share similar qualities as the Infinity Stones'], [4, '^6Tony Stark^7: Are you saying Element 115 and the Infinity Stones are the same energy?'], [4, '^5JARVIS^7: Yes, sir. But there is more.'], [4, 'The server alludes to a small, secret Group 935 base near your location.'], [4, 'I suggest you try to find it while I continue to read the server data.'], [5, "^6Tony Stark^7: I'm getting more intrigued by the minute"]]);
    return true;
  } });
  let serverWait = null;
  host.on('roundEnd', () => { if (serverWait) { const f = serverWait; serverWait = null; f(); } });
  // ---- step 4: the hidden brick, the base and its three locks
  const brick = one('hidden_brick_trig');
  let brickFound = false, locks = 0;
  solid('hidden_brick_door', true);
  if (brick) world.addInteraction({ position: center(brick), hidden: () => step !== 4 || brickFound, text: () => 'A loose brick', async use() {
    if (talking) return false;
    brickFound = true; sound('pap_stairs', { volume: .7 });
    move('hidden_brick', codXY(0, -7), 1); solid('hidden_brick_door', false);
    await wait(1); await move('hidden_brick_door', codXY(0, 14), 1); await wait(.5); await move('hidden_brick_door', codXY(70, 0), 3); await wait(1);
    await talk([[0, `^4Captain America^7: Team, I think ${is('cap') ? 'I' : name()} just found the base.`], [6, 'It looks like there are several security locks on this door.'], [4, "We'll have to figure them out one by one."]]);
    return true;
  } });
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
  // lock 1: the three dials (the right one, the middle one, the left one), each from 5 down by one a press (0 wraps to 9):
  // left 2, middle 3, right 9
  const DIALS = [['right', 'piece_right_ric'], ['middle', 'piece_middle_ric'], ['left', 'piece_left_ric']].map(([side, piece]) => ({ side, piece, value: 5, trig: one(side + '_trig_ric'), busy: false }));
  let dialsDone = false;
  for (const d of DIALS) if (d.trig) world.addInteraction({ position: center(d.trig), hidden: () => step !== 4 || !brickFound || dialsDone, text: () => `${d.side[0].toUpperCase() + d.side.slice(1)} dial · ${d.value}`, async use() {
    if (d.busy) return false; d.busy = true; sound('malibu_console_beep', { volume: .5 });
    move(d.side + '_button_ric', codXY(0, 1), .2).then(() => wait(.1)).then(() => move(d.side + '_button_ric', codXY(0, -1), .2));
    if (d.value === 1) { await move(d.piece, up(9), 3); d.value = 0; } else { await move(d.piece, up(-1), .5); d.value = d.value === 0 ? 9 : d.value - 1; await wait(.5); }
    d.busy = false;
    const v = Object.fromEntries(DIALS.map(x => [x.side, x.value]));
    if (!dialsDone && v.left === 2 && v.middle === 3 && v.right === 9) { dialsDone = true; say('^4Captain America^7: Good work, Avengers. That code worked'); lockSolved(); }
    return true;
  } });
  // lock 2: two consoles far apart, hit by the same hero within 15 s
  const c2 = one('ee_step_4_trig2'), c3 = one('ee_step_4_trig3');
  let lock2 = null, lock2Done = false;
  if (c2) world.addInteraction({ position: center(c2), hidden: () => step !== 4 || !brickFound || lock2Done || !!lock2, text: () => 'Security console', use() {
    sound('malibu_console_beep'); say(`${name()}: There must be another somewhere. I better hurry`);
    lock2 = { hero: heroes.hero()?.id, until: now() + 15 }; return true;
  } });
  if (c3) world.addInteraction({ position: center(c3), hidden: () => step !== 4 || !brickFound || lock2Done || !lock2, text: () => 'Security console', use() {
    sound('malibu_console_beep');
    if (lock2.hero !== heroes.hero()?.id) { say('^4Captain America^7: Huh, seems like it has to be the same person for both'); lock2 = null; return true; }
    lock2 = null; lock2Done = true; say(`${name()}: Got em both!`); lockSolved(); return true;
  } });
  host.on('update', () => { if (lock2 && now() > lock2.until) { lock2 = null; say('^4Captain America^7: We gotta hit both faster next time.'); } });
  // lock 3: a broken charger (a hint), Mjolnir charges the other one
  const hint5 = one('ee_step_4_trig5'), lock3 = one('ee_step_4_lock3_trig');
  let lock3Done = false;
  if (hint5) world.addInteraction({ position: center(hint5), hidden: () => step !== 4 || !brickFound || lock3Done, text: () => 'Charger', use() { if (!talking) say(`${name()}: This is broken. There must be another one somewhere to charge up`); return false; } });
  if (lock3) damageTrigger(lock3, w => {
    if (step !== 4 || lock3Done || !brickFound) return;
    if (w === W_('thor_hammer')) { lock3Done = true; kit.fx(center(lock3), 0x7fe0ff, 20); lockSolved(); }
  }, 30);
  // step 5: the Hulk smashes the inner vault; step 6: the last vault costs 10000
  const vault2 = one('ee_step_5_vault2_trig');
  if (vault2) damageTrigger(vault2, w => {
    if (step !== 5) return;
    if (w === W_('hulk_hands')) { setStep(6); kit.fx(center(vault2), 0xff9a40, 40); sound('missile_explo', { volume: .8 }); show('ee_step_5_vault2', false); solid('ee_step_5_vault2', false); }
    else if (!talking) say(`${name()}: There must be a way to break this down`);
  }, 40);
  const vault3 = one('ee_step_5_vault3_trig');
  if (vault3) world.addInteraction({ position: center(vault3), hidden: () => step !== 6, text: () => 'Open Vault · 10000', async use() {
    if (session.points < 10000) { say(`${name()}: Rats. I need some more moolah`); return false; }
    session.spend(10000); sound('malibu_hall_raise', { volume: .6 }); setStep(7);
    solid('ee_step_5_vault3', false); await move('ee_step_5_vault3', up(-120), 5); show('ee_step_5_vault3', false);
    return true;
  } });
  // step 7: the mainframe; one console per player, used by heroes who know computers
  const mainframe = one('ee_step_7_trig1'), consoles = named('ee_step_7_trig_array');
  let mainframeSeen = false, hacked = 0;
  const players = () => 1 + (window.kino.coop?.players?.size ?? 0);
  const KNOWS = ['tony', 'banner', 'vision', 'widow'];
  const NOPE = { cap: "^4Captain America^7: I can't do this. I prefer the battlefield", scarlet: '^1Scarlet Witch^7: I can bend the laws of time and space, but this is unrealistic', rhodes: '^3James Rhodes^7: I have no idea how to use this stuff', thor: '^3Thor^7: I cannot. What magic is this?', spiderman: '^1Spider-Man^7: If I do this I will ruin the keyboard', quicksilver: '^5Quicksilver^7: I can only play games', hawkeye: '^6Hawkeye^7: I know a little bit, but not enough for this' };
  if (mainframe) world.addInteraction({ position: center(mainframe), hidden: () => !((step === 7 && !mainframeSeen) || step === 8 || step === 18 || step === 19) || talking, text: () => step === 18 ? 'Add the 115 antidote' : step === 19 ? 'Spread the 115 antidote over Malibu' : 'SHIELD mainframe', async use() {
    if (step === 7) {
      mainframeSeen = true;
      await talk([[0, '^6Tony Stark^7: This looks like SHIELD tech'], [3, '^4Captain America^7: If Group 935 was connected with Hydra, that would make sense.'], [5, '^6Tony Stark^7: This setup looks to have a pretty heavy security system.'],
        ...(players() > 1 ? [[3, `^6Tony Stark^7: I think we should gather ^1${players()}^7 of us that know computers`], [3, 'and use these small consoles to break into the mainframe.']] : [[3, '^6Tony Stark^7: I think we need one of us that is good with computers to'], [3, 'use these small consoles and break into the mainframe.']])]);
      return true;
    }
    if (step === 8) {
      if (!is('tony')) { if (!heroes.form()?.hp) say(`${name()}: I better let ^6Tony^7 handle this`); return false; }
      setStep(9);
      await talk([[0, "^6Tony Stark^7: Alright, we're in"], [5, '^4Captain America^7: What are you finding?'], [3, '^6Tony Stark^7: Well, the records go back to the end of the SSR.'], [3, '....when SHIELD was first founded. '], [4, '^6Hawkeye^7: So Hydra was involved?'], [4, '^6Tony Stark^7: Yep. Very clearly invloved with SHIELD.'], [3, 'Which means Group 935 was too. This is crazy.'], [4, '^1Spider-Man^7: Anything about Element 115?'], [3, '^6Tony Stark^7: Ya, it says something about weapons that were designed to'], [3, "utilize 115's energy."]]);
      rayCheck(); return true;
    }
    if (step === 18) { if (!is('banner')) { say(`${name()}: I don't know the antidote. But ^2Bruce Banner^7 does`); return false; } say('^2Bruce Banner^7: Antidote added to the computer.'); setStep(19); return true; }
    if (step === 19) { setStep(20); antidote(); return true; }
    return false;
  } });
  consoles.forEach(c => world.addInteraction({ position: center(c), hidden: () => step !== 7 || !mainframeSeen, text: () => 'Console', use() {
    sound('malibu_console_beep');
    const h = heroes.hero()?.id;
    if (!KNOWS.includes(h)) { say(heroes.form()?.hp ? '^2Hulk^7: Hulk know nothing' : NOPE[h] ?? `${name()}: I can't do this`); return false; }
    hacked++;
    if (hacked >= players()) { say('^6Tony Stark^7: Got em'); setStep(8); }
    else wait(1).then(() => { if (step === 7) { hacked = 0; say('^6Tony Stark^7: We need to try this again'); } });
    return true;
  } }));
  // steps 8-9: a Ray Gun, upgraded at the stones
  let rayTold = 0;
  function rayCheck() {
    if (step !== 9) return;
    if (!hasRay()) { if (rayTold !== 1) { rayTold = 1; say('^6Tony Stark^7: I think we need to get our hands on one of those weapons'); } return; }
    if (!hasRay(true)) { if (rayTold !== 2) { rayTold = 2; dialog(is('tony') ? [[2, "^6Tony Stark^7: I better upgrade it. I'll need more power."]] : [[0, `${name()}: So I have it, but what should I do with it?`], [3, "^6Tony Stark^7: You better upgrade it. It'll need more power."]]); } return; }
    setStep(10);
    talk(is('tony') ? [[2, '^6Tony Stark^7: I already upgraded it. Perfect']] : [[0, `${name()}: So I have it, and it's upgraded. What should I do with it?`], [3, '^6Tony Stark^7: Just hang on to it for now.'], [3, "I have a plan. We're gonna need some parts though for this tech."], [3, "Look around and see what we can scavange. We'll build it in my bedroom."]])
      .then(() => talk([[0, '^6Tony Stark^7: I need to build something now. Scavenge the city.'], [3, "We'll build it in my room"]]));
  }
  host.on('update', () => { if (step === 9 && Math.floor(now()) % 2 === 0) rayCheck(); });
  // step 10: three parts for Tony's bed machine
  const BED = [['generator', 'Generator', 0], ['wires', 'Lamp', 1], ['fuel', 'Pipe', 2]];
  const built = new Set();
  for (let i = 0; i < 3; i++) show(`ee_step_10_part${i}_model1`, false);
  for (const [id, label, i] of BED) {
    const t = one(`ee_step_10_part${i}_trig`);
    if (t) world.addInteraction({ position: center(t), hidden: () => step !== 10 || built.has(id) || part?.id === id, text: () => `Pick up the ${label.toLowerCase()}`, use() {
      if (!take(id, label)) return false; show(`ee_step_10_part${i}_model0`, false); return true;
    } });
  }
  const bed = one('ee_step_10_trig');
  if (bed) world.addInteraction({ position: center(bed), hidden: () => !(step === 10 || step === 12) || talking, text: () => step === 10 ? 'Add part' : 'Use machine', async use() {
    if (step === 10) {
      const b = BED.find(x => x[0] === part?.id);
      if (!b) { say('[i] You have nothing to contribute to this bed'); return false; }
      setPart(null); built.add(b[0]); show(`ee_step_10_part${b[2]}_model1`, true); sound('pickup_part', { volume: .6 });
      if (built.size === 3) { setStep(11); charge = 0; }
      return true;
    }
    if (!is('tony')) { if (!heroes.form()?.hp) say(`${name()}: Only ^6Tony^7 can operate this thing`); return false; }
    if (tony.armor.worn() || tony.state().caseOut) { say("^6Tony Stark^7: I can't have an armor when I use this"); return false; }
    dream(); return true;
  } });
  // step 11 (and after each dream): 100 hits on the machine with the upgraded Ray Gun charge it
  let charge = 0;
  const chargeTrig = one('ee_step_10_trig_charge');
  if (chargeTrig) damageTrigger(chargeTrig, w => {
    if (step !== 11) return;
    if (w === RAY && upgradedHeld()) {
      charge++; kit.fx(center(chargeTrig), 0xffe28a, 6);
      if (charge === 1) say(`${name()}: This is working! But it will take a lot of power`);
      if (charge === 50) say(`${name()}: I'm making progress. I just gotta keep sending power`);
      if (charge >= 100) {
        setStep(12);
        if (!dreamed) { cheeseWall = true; talk([[0, "^6Tony Stark^7: Good work. It's ready to go"], [3, "^4Captain America^7: ^6Stark^7, what's this idiotic thing for?"], [3, "^6Tony Stark^7: This is gonna sound crazy, but I've been having alot of cheese dreams lately"], [4, '^4Captain America^7: Wait, you wanna go into your head...and your dream?'], [3, '^1Spider-Man^7: That sounds crazy. Even for me.'], [3, "^3James Rhodes^7: I wouldn't be surprised if ^6Tony^7 was just going crazy."], [3, 'JK, man. I love you'], [3, '^6Tony Stark^7: Remind me to beat all of you later.'], [3, "Anyway, in my dreams, I've been seeing numbers. Like a code or something."], [4, '^4Captain America^7: And you think those numbers might have something to'], [4, 'do with Group 935? How does that connect?'], [3, "^6Tony Stark^7: I think Loki's staff was tampering with my mind back"], [3, 'when ^2Banner^7 and I were studying the staff.'], [4, "It may be nothing, but it can't hurt to see"], [4, "^4Captain America^7: Alright. Let's go then."], [4, 'We better make sure we have the cypher values written down']]); }
        else say('^6Tony Stark^7: Perfect. Ready to go again.');
      }
    } else if (w === RAY && !talking) say('^6Tony Stark^7: That may work, but the weapon needs more power');
    else if (!talking) say('^6Tony Stark^7: There must be a way to charge the machine...');
  }, 30);
  // step 12: into Tony's dream (the Cheese Cube) for three rounds; the code shows on the wall in the third
  let dreamed = false, inDream = false, cheeseWall = false;
  show('ee_ccube_ending', false);
  const blackout = document.createElement('div'); blackout.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity 1.5s;pointer-events:none;z-index:40'; document.body.append(blackout);
  const black = async (s = 4) => { blackout.style.opacity = 1; await wait(s); blackout.style.opacity = 0; };
  async function dream() {
    const attach = one('ee_step_10_tony_attach');
    if (attach && feet().distanceTo(v3(attach.origin)) > 200) { say('^6Tony Stark^7: I need everyone by the machine for this to work'); return; }
    const first = !dreamed; dreamed = true; setStep(-12); inDream = true;
    show('ee_ccube_ending', false);
    black(4); await wait(2);
    say("^6Tony Stark^7: It's working...We're going back into my dream...");
    for (const z of [...enemies.list]) enemies.hurt(z, 1e6);
    const spot = named('ccube_spawn_points')[0]; if (spot) player.setPosition(v3(spot.origin).add(up(10)));
    if (first) say('^6Tony Stark^7: We need to survive a few rounds to jog my crazy mind'); else say("^6Tony Stark^7: It shouldn't take as long this time");
    const rounds = first ? 3 : 2;
    for (let r = 1; r <= rounds; r++) {
      await new Promise(res => roundWaiters.push(res));
      if (first) { for (const w of session.inventory) { const d = data.weapons[w.id]; if (d && !d.malibuHero && !d.suitWeapon) w.reserve = (w.upgraded ? d.upgrade?.maxAmmo : d.maxAmmo) ?? w.reserve; } announce('MAX AMMO OF CHEESE', '', 2); }
      if (r === rounds - 1) { show('ee_ccube_ending', true); say(first ? '^6Tony Stark^7: Yes, the answer is here! I knew I\'d remember.' : "^6Tony Stark^7: There it is. Let's make sure we get the translation right"); if (first) talk([[3, 'The message is on the wall'], [4, '^4Captain America^7: We need to translate it before this round is over']]); }
    }
    inDream = false; black(4); await wait(2);
    const back = named('ccube_spawn_points_return')[0]; if (back) player.setPosition(v3(back.origin).add(up(10)));
    await wait(5);
    if (first) found13 = true;
    say('^6Tony Stark^7: If we missed anything we can go back after charging the machine again');
    if (!step13Done) { setStep(11); charge = 0; }
  }
  const roundWaiters = [];
  host.on('roundEnd', () => { const w = roundWaiters.splice(0); for (const r of w) r(); });
  // the Cheese Gun on its wall in the Cheese Cube (after the first charge)
  const cheeseBuy = one('buy_cheese_gun');
  if (cheeseBuy) world.addInteraction({ position: center(cheeseBuy), hidden: () => !cheeseWall, text: () => session.inventory.some(w => w.id === W_('malibu_cheese_gun')) ? 'Cheese Gun ammo · 500' : 'Cheese Gun · 1000', use() {
    const id = W_('malibu_cheese_gun'), d = data.weapons[id]; if (!d) return false;
    const own = session.inventory.find(w => w.id === id);
    if (own) { if (session.points < 500) { toast('Not enough points', 2); return false; } session.spend(500); own.reserve = d.maxAmmo; return true; }
    if (session.points < 1000) { toast('Not enough points', 2); return false; }
    session.spend(1000); session.giveWeapon(id); api.equipView?.(); return true;
  } });
  // step 13: what Tony's dream pointed at (the black suit; then the key and the cell)
  let found13 = false, step13Done = false, blackUsed = false;
  const s13 = one('ee_step_13_trig');
  if (s13) world.addInteraction({ position: center(s13), hidden: () => !found13 || talking, text: () => !step13Done ? 'Something is here' : is('spiderman') ? (spidey ? 'Take off the black suit' : 'The black suit') : 'The black suit', async use() {
    if (!step13Done) { step13Done = true; say(`${name()}: Avengers, I think I found it`); setStep(14); return true; }
    if (!is('spiderman')) { if (!heroes.form()?.hp) say(`${name()}: Wow, I should let ^1Spidey^7 see this...`); return false; }
    if (spidey) { blackSpidey(false); return true; }
    blackSpidey(true);
    if (!blackUsed) { blackUsed = true; talk([[0, "^1Spider-Man^7: Ugh, I've had this on before. It takes over your mind."], [3, '^3Thor^7: You had better move quickily'], [3, '^4Captain America^7: ^3Thor^7 is right. There must be a reason this'], [3, "was in ^6Tony^7's dream. You better look for something only you can do"]]); }
    return true;
  } });
  // the black suit: 1.6 speed, 450 health (x1.5), the perks of the time (Speed Cola, Double Tap, Quick Revive); it takes
  // you over after 150 s
  let spidey = null;
  function blackSpidey(on) {
    if (on) { spidey = { until: now() + 150 }; heroes.setForm({ hp: 450, speed: 1.6, hands: 'spider_man_view_black', hud: 'hud_black_spidey' }); say('^1Spider-Man^7: I feel so much stronger and faster...'); for (const p of ['specialty_fastreload', 'specialty_rof']) session.perks?.add?.(p); }
    else { spidey = null; heroes.setForm(null); for (const p of ['specialty_fastreload', 'specialty_rof']) session.perks?.delete?.(p); }
  }
  host.on('update', () => {
    if (!spidey) return;
    if (!is('spiderman')) { blackSpidey(false); return; }
    const left = spidey.until - now();
    if (left < 60) blackout.style.opacity = String(Math.max(0, (60 - left) / 60) * .85);
    if (left <= 0) { blackout.style.opacity = 0; blackSpidey(false); session.effects.invulnerable = 0; session.damage(session.health + 100); }
  });
  // steps 14-15: the key, the cell door, the Red Hulk
  const key14 = one('ee_step_14_key_trig'), door14 = one('ee_step_14_door_trig'), hulkTrig = one('ee_step_14_spawn_hulk_trig');
  show('ee_step_14_key', true); solid('ee_step_14_door_clip', true); show('ee_step_14_door_clip', false);
  if (key14) world.addInteraction({ position: center(key14), hidden: () => step !== 14 || part?.id === 'hulk_key' || keyTaken14, text: () => 'Pick up the key', async use() {
    if (!take('hulk_key', 'Key')) return false; keyTaken14 = true; show('ee_step_14_key', false);
    await talk([[0, '^1Spider-Man^7: Guys, I found a key!'], [3, '^1Spider-Man^7: Now I just gotta find where this thing goes...']]); return true;
  } });
  let keyTaken14 = false, cellOpened = false;
  if (door14) world.addInteraction({ position: center(door14), hidden: () => step !== 14 || cellOpened, text: () => 'Cell door', async use() {
    if (!part) { say(`${name()}: I need a key for this door`); return false; }
    if (part.id !== 'hulk_key') { say(`${name()}: I need a different part for this`); return false; }
    setPart(null); cellOpened = true; solid('ee_step_14_door_clip', false); sound('malibu_hall_raise', { volume: .6 });
    await move('ee_step_14_door', codXY(40, 0), 3); return true;
  } });
  host.on('update', () => {
    if (step !== 14 || !cellOpened || !hulkTrig || talking || enemies.list.length >= 10) return;
    if (feet().distanceTo(v3(hulkTrig.origin)) < (hulkTrig.radius ?? 120)) {
      setStep(15);
      talk([[0, `^0Black Widow^7: Wow, what happened by ${is('widow') ? 'me' : name()} in the cell?`], [3, `${name()}: Looks like something really big escaped from here.`], [3, 'The wall was torn down'], [3, '^4Captain America^7: Be ready, team. Whatever was in the cell is out there somewhere']]).then(spawnRedHulk);
    }
  });
  // the Red Hulk: a sprinting boss in the hulk_red model; only the upgraded Ray Gun hurts him, and only while he stands in
  // the salt water by the beach (`kill_red_hulk_0/1`): 20 hits
  let red = null, redHits = 0, redSeen = false;
  const salt = [one('kill_red_hulk_0'), one('kill_red_hulk_1')].filter(Boolean);
  async function spawnRedHulk() {
    const list = world.spawnBarriers(session), spot = list[Math.floor(Math.random() * list.length)] ?? world.barriers.find(b => b.group !== 'ccube');
    const z = enemies.spawn((spot.inside ?? spot.position).clone(), null, 'zombie'); if (!z) return;
    session.spawned--; z.boss = true; z.health = z.maxHealth = 1e9; z.speed = 210;
    if (enemies.anims?.ai_zombie_sprint_v1) { z.rig.add('walk', enemies.anims.ai_zombie_sprint_v1, true); z.rig.play('walk'); }
    red = z;
    const hulk = await model('hulk_red');
    if (hulk && enemies.list.includes(z)) {
      // the zombie's own meshes hidden; the Red Hulk's skeleton copies the zombie's joint rotations each frame (both
      // re-posed to the zombie's rest frames by name)
      z.root.traverse(o => { if (o.isMesh) o.visible = false; });
      const ref = new Map(); z.root.traverse(o => { if (o.isBone && !ref.has(o.name)) ref.set(o.name, o); });
      hulk.scale.setScalar(1.25); z.root.add(hulk);
      const pairs = []; hulk.traverse(o => { if (o.isBone && ref.has(o.name)) pairs.push([o, ref.get(o.name)]); });
      hulk.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      z.redPairs = pairs;
    }
  }
  host.on('update', () => {
    if (!red) return;
    if (!enemies.list.includes(red)) { red = null; return; }
    for (const [h, zb] of red.redPairs ?? []) h.quaternion.copy(zb.quaternion);
  });
  host.on('beforeEnemyDamage', e => {
    if (e.enemy !== red) return;
    if (!redSeen) { redSeen = true; talk([[0, `${name()}: Wow, what is that thing???`], [3, "^4Captain America^7: I've seen this monster before. It's the ^1Red Hulk"], [3, '^3Thor^7: Let us now vanquish this beast!!!']]); }
    const inSalt = salt.some(v => inside(v, red.root.position.clone().add(up(40)), 0));
    if (inSalt && upgradedHeld()) {
      if (redHits === 0 && !talking) say(`${name()}: It's working! It will take a ton of ammo though`);
      redHits++;
      if (redHits >= 20) { e.amount = 1e12; const at = red.root.position.clone(); red = null; session.killed--; redDown(at); return; }
    }
    e.amount = 0;
  });
  // step 16: Widow, then Banner, at the corpse (an antidote in the salt water)
  let corpse = null, glass = null;
  async function redDown(at) {
    setStep(16); corpse = { at, stage: 'widow' };
    await talk([[0, '^4Captain America^7: ^1Red Hulk^7 is down'], [3, '^1Spider-Man^7: That guy was pretty scary...'], [3, '^6Tony^7: Really? Youth is wasted on the wrong people.'], [4, "^1Spider-Man^7: I'd agree with you but that would make me a liar."], [3, 'Btw, I was thinkning about your selfie comment earlier, and I just realized'], [3, 'that I have a great idea to get rich!'], [3, 'I just need a lot of money...'], [5, 'Man, if I had a million dollars...'], [3, "^6Tony^7: If I had a million dollars I'd wonder where"], [3, 'the rest of my money was.'], [4, "^3James Rhodes^7: Shut up, you two. Can't you act like two adults?"], [4, "^6Tony^7: We could, but we're missing one"], [4, "^4Captain America^7: That's enough you two. Let's concentrate on our task."], [4, '^6Hawkeye^7: I think we should have ^0Black Widow^7 take a look at the corpse location']]);
    glass = await figure('malibu_drinking_glass', null, { position: at.clone().add(up(40)) }) ?? null;
  }
  host.on('update', () => {
    if (!corpse || talking) return;
    if (glass) glass.rotation.y += .03;
    const near = feet().distanceTo(corpse.at) < 60;
    if (corpse.stage === 'widow' && near && is('widow')) {
      corpse.stage = 'banner';
      talk([[2, '^4Captain America^7: What did you find, ^0Natasha^7?'], [3, '^0Black Widow^7: The salt water is reacting to the skin...'], [3, '^6Hawkeye^7: In what way?'], [4, "^0Black Widow^7: I'm not sure...but its almost as if its returning to normal"], [4, '^4Captain America^7: Wait, so salt water is like an antidote the the disease??'], [4, "^0Black Widow^7: It seems that way...although it doesn't have an effect on the normal zombies"], [4, "^4Captain America^7: Let's get ^2Banner^7 over here to get a second opinion"]]);
    } else if (corpse.stage === 'banner' && near && is('banner') && !heroes.form()?.hp) {
      corpse = null; remove(glass); glass = null;
      talk([[2, "^4Captain America^7: What are you making of it, ^2Banner^7?"], [4, "^2Bruce Banner^7: I'm going to have to agree with ^0Natasha^7. This looks to be an antidote!"], [4, 'It should be able to provide an immunity for those that have not become infected.'], [4, '^4Captain America^7: Incredible!! We have to get this out to the rest of the world!'], [4, "^0Black Widow^7: How are we gonna do that?"], [5, '^2Bruce Banner^7: ^1Spidey^7, remember that machine that Dr Connors'], [3, 'used when he tried to turn everyone into lizards?'], [3, '^1Spider-Man^7: Ya, I sure do!'], [3, "^2Bruce Banner^7: It may be possible to tap into the city's ventilation system"], [3, 'and use that to spread the antidote across the entire Malibu area very quickly'], [4, "^4Captain America^7: It's a start. Let's do it, Avengers"]]).then(startStations);
    }
  });
  // step 17: four stations
  let machines = 0;
  const machineDone = () => { machines++; say(`^4Captain America^7: ${machines < 4 ? 'Great job, team.' : 'Perfect.'} We got ${machines}/4 systems ready to go`); if (machines === 4) talk([[0, '^4Captain America^7: All stations are online.'], [3, 'What do we do now?'], [3, '^2Bruce Banner^7: I think it would be a safe bet to try and use the computer system at the'], [3, 'Group 935 base. That should already be tapped into the city systems']]).then(() => setStep(18)); };
  // A: ten buttons in an order found by trying (as the Mean Juice valves); the bar slides along
  const aTrigs = named('station_a_trig').map(e => ({ e, order: null }));
  let aNext = 1, aAssigned = 0, aCount = 0, aDone = false, aBusy = false;
  const aAssign = () => { const free = aTrigs.filter(t => t.order == null); if (free.length) free[Math.floor(Math.random() * free.length)].order = ++aAssigned; };
  // B: walk onto the lit plate, 25 times (the light moves to a random other plate each time; a wrong plate starts over)
  const plates = named('ee_step_17_b_plate');
  let bLit = -1, bCount = 0, bDone = false, bLast = -1, bWait = 0;
  // C: a target pops up; shoot it within 1.5 s, ten in a row
  const targets = named('ee_step_17_c_target');
  let cUp = -1, cUntil = 0, cCount = 0, cDone = false, cPause = 0;
  // D: Cap's shield thrown at each of the four dishes turns it
  const dishes = named('ee_step_17_d_dish').map(e => ({ e, turned: false }));
  let dDone = false;
  // the targets wait sunk 50 (setup_ee)
  const sinkTargets = () => { for (const t of targets) { const o = nodeAt('ee_step_17_c_target', center(t)); if (o && !o.userData.sunk) { kit.remember(o); o.userData.sunk = true; o.position.y -= 50; o.updateMatrix(); o.updateMatrixWorld(true); } } };
  sinkTargets();
  function startStations() {
    setStep(17); aAssign(); bPick();
  }
  aTrigs.forEach(t => world.addInteraction({ position: center(t.e), hidden: () => step !== 17 || aDone, text: () => 'Button', async use() {
    if (aBusy) return false; aBusy = true; sound('malibu_console_beep', { volume: .5 }); await wait(.7);
    if (t.order !== aNext) { move('ee_step_17_a_bar', codXY(-10 * aCount, 0), 1); aCount = 0; aNext = 1; if (Math.random() < .4) say('^2Bruce Banner^7: Nope. I gotta get these in the right order.'); await wait(1); aBusy = false; return true; }
    aNext++; aCount++; move('ee_step_17_a_bar', codXY(10, 0), 1); await wait(1);
    if (aAssigned === aNext - 1) aAssign();
    if (aCount === 10) { aDone = true; show('ee_step_17_a_bar', false); machineDone(); }
    aBusy = false; return true;
  } }));
  const litNode = () => nodes('ee_step_17_b_plate_lit')[0];
  function bPick() {
    const choices = plates.map((_, i) => i).filter(i => i !== bLast);
    bLit = choices[Math.floor(Math.random() * choices.length)];
    const o = litNode(), p = plates[bLit];
    if (o && p) { kit.remember(o); const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()), target = center(p); o.position.add(target.clone().sub(c).setY(0)); o.updateMatrix(); o.updateMatrixWorld(true); }
  }
  host.on('update', () => {
    if (step !== 17) return;
    // B
    if (!bDone && now() > bWait) {
      const f = feet(), i = plates.findIndex(p => center(p).setY(f.y).distanceTo(f) < 35 && Math.abs(center(p).y - f.y) < 40);
      if (i >= 0 && i !== bLast) {
        bWait = now() + .5;
        if (i === bLit) { bLast = i; bCount++; sound('malibu_console_beep', { volume: .4 }); if (bCount >= 25) { bDone = true; show('ee_step_17_b_plate_lit', false); machineDone(); } else bPick(); }
        else { bCount = 0; bLast = -1; say(`${name()}: Wrong plate. Start over.`); bPick(); bWait = now() + 2; }
      }
    }
    // C
    if (!cDone && cUp < 0 && now() > cPause) {
      cUp = Math.floor(Math.random() * targets.length); cUntil = now() + .5 + 1.5;
      const o = nodeAt('ee_step_17_c_target', center(targets[cUp])); if (o) move(o, up(50), .5);
    }
    if (!cDone && cUp >= 0 && now() > cUntil) {
      const o = nodeAt('ee_step_17_c_target', center(targets[cUp])); if (o) move(o, up(-50), .5);
      cUp = -1; cPause = now() + (cCount > 0 ? 6 : 1); if (cCount > 0) say(`${name()}: Too slow. The targets reset.`); cCount = 0;
    }
  });
  for (const [i, t] of targets.entries()) damageTrigger(t, () => {
    if (step !== 17 || cDone || cUp !== i) return;
    const o = nodeAt('ee_step_17_c_target', center(t)); if (o) move(o, up(-50), .5);
    cUp = -1; cCount++; sound('malibu_console_beep', { volume: .5 });
    if (cCount >= 10) { cDone = true; machineDone(); } else cPause = now() + .75;
  }, 20);
  // D: the shield throw asks for a target first (powers.js calls kit.shieldTarget)
  kit.shieldTarget = (eye, dir) => {
    if (step !== 17 || dDone) return null;
    for (const d of dishes) {
      const at = v3(d.e.origin), to = at.clone().sub(eye), dist = to.length();
      if (dist < 1500 && to.normalize().dot(dir) > Math.cos(5 * Math.PI / 180)) return { at, hit: () => {
        d.turned = !d.turned; const o = nodeAt('ee_step_17_d_dish', at); if (o) move(o, up(0), .25, { rot: new THREE.Euler(0, (d.turned ? -40 : 40) * Math.PI / 180, 0) });
        if (dishes.every(x => x.turned)) { dDone = true; machineDone(); }
      } };
    }
    return null;
  };
  // step 18-20: the antidote, and the end of the next round wins the game
  async function antidote() {
    talking = true;
    say('^2Bruce Banner^7: The computer is processing the formula...'); await wait(3); sound('malibu_ee_end', { volume: .8 });
    const shake = setInterval(() => { const r = api.camera.rotation; r.x += (Math.random() - .5) * .01; r.y += (Math.random() - .5) * .01; }, 50);
    for (const [d, t] of [[5, '^1Spider-Man^7: What\'s going on????'], [3, '^4Captain America^7: Hold your positions, team. The antidote is being sent out!!!'], [3, "^1Spider-Man^7: I don't see anything??"], [3, '^6Tony^7: The anitdote is a gas, you ding nut'], [8, '^1Spider-Man^7: Is it over?'], [3, '^4Captain America^7: Ya, I think so. '], [3, 'Did it work?'], [5, "^6Tony^7: Idk, it doesn't work for already-living zombies, right?"], [3, '^4Captain America^7: Right.'], [5, "^6Tony^7: Alright, let's kill every other zombie we can find"], [4, "then we'll know if this worked or not."]]) { await wait(d); say(t); if (d === 8) clearInterval(shake); }
    talking = false;
    await new Promise(r => roundWaiters.push(r));
    session.effects.invulnerable = Infinity;
    blackout.style.transition = 'opacity 5s'; blackout.style.opacity = 1;
    await wait(7);
    for (const [d, t] of [[0, '^1Spider-Man^7: Yes!!! It worked!!!'], [5, '^6Tony^7: Ya, no more zombies. Around here anyway.'], [3, '^4Captain America^7: Great job, Avengers. But our work has just begun']]) { await wait(d); say(t); }
    await wait(3);
    blackout.style.opacity = 0;
    session.effects.invulnerable = 0;
    session.phase = 'gameover'; session.lastEvent = 'The Avengers saved Malibu'; host.emit('gameOver', { round: session.round, kills: session.kills });
  }
  // the Easter egg holds the next round's spawning only for the dream's arrival (zombies elsewhere are cleared)
  host.on('reset', () => {
    step = 0; part = null; setPart(null); briefState = 'ready'; tankCount = 0; analysing = false; bioRead = false; serverTried = false; serverReady = false; brickFound = false; locks = 0;
    for (const d of DIALS) d.value = 5; dialsDone = false; lock2 = null; lock2Done = false; lock3Done = false; mainframeSeen = false; hacked = 0; rayTold = 0; built.clear(); charge = 0;
    dreamed = false; inDream = false; cheeseWall = false; found13 = false; step13Done = false; blackUsed = false; spidey = null; keyTaken14 = false; cellOpened = false; red = null; redHits = 0; redSeen = false;
    corpse = null; machines = 0; aNext = 1; aAssigned = 0; aCount = 0; aDone = false; for (const t of aTrigs) t.order = null; bLit = -1; bCount = 0; bDone = false; bLast = -1; cUp = -1; cCount = 0; cDone = false; dDone = false; for (const d of dishes) d.turned = false;
    stones = 0; spinning.clear(); timeState = 'idle'; timeLeft = 100; powerHits = 0; powerDone = false; realityAwake = false; realityZaps = 0; realityTold = false; realityDone = false; soulState = 'hidden';
    world.papLocked = true; world.papLockedText = 'Missing Elements'; padUses = 0; padRoundOk = false; cellOpen = false; keyAfterRound = false; placeKey();
    for (const t of targets) { const o = nodeAt('ee_step_17_c_target', center(t)); if (o) o.userData.sunk = false; } setTimeout(sinkTargets, 0);
    batEggs = 0; batWallGone = false; batmanGone = false; batSightings = 0; batSpot = null; remove(batModel); batModel = null; batmobileSeen = false; sceneSeen = false;
    remove(holoZombie); holoZombie = null; remove(glass); glass = null; blackout.style.opacity = 0; roundWaiters.length = 0; talking = false;
  });

  return { state: () => ({ step, part: part?.id ?? null, stones, papLocked: world.papLocked, locks, dials: DIALS.map(d => d.value), charge, machines, a: aCount, b: bCount, c: cCount, d: dishes.filter(x => x.turned).length, red: !!red, redHits, batEggs, batSightings, keyIdx, cellOpen, padUses }),
    setStep, take, setPart, spawnRedHulk, startStations, dream };
}
