// Tony Stark's armors in Malibu Drive (_malibu_hall_of_armors.gsc, _malibu_magnificent_seven.gsc, _unlock_characters.gsc,
// _iron_man_transport.gsc, _iron_man_mk*.gsc, _war_machine.gsc), on the shared Iron Man armor code (mods/stark/armor.js:
// health, speed, the suit's weapons, power, flight with Space in the air, the JARVIS HUD and voices, the cloak):
//   JARVIS: five phone towers around the map (`tony_phone_tower_trig`, anyone can switch one on), then the JARVIS console in
//     the Hall of Armors (`jarvis_console_trig`) brings the servers and its screens online.
//   The Magnificent Seven (`mag_seven_trig`, Tony only, no JARVIS needed): pick Mark I, III, IV, V or VI (II and VII are
//     empty in the original too); its alcove door drops (`mag_mk<n>_door`) and the dock (`mag_mk<n>_trig`) suits you up.
//     Use the dock again to put it back. The Mark V comes as its suitcase: fire it to suit up.
//   The Hall of Armors (`jarvis_console_main_trig`, Tony, JARVIS online): Marks XVI, XXXIII and XLII (the other five on the
//     menu have no suit script in the original). The four hall doors part, the lift (`hall_floor`) drops to the armor's
//     level, the armor steps on and rides up; `armor_trig` suits you up. Use the console again while wearing it to send
//     it back.
//   The phone (Tony's Cellphone; fire it): with JARVIS online, summon a Hall armor to the nearest landing point
//     (`summon_points`, flying in from the ocean: summon_first_spawn -> summon_second_spawn -> above the point -> down,
//     ~45 s). The Mark XLII flies to you in pieces instead (outside; inside a building it waits above). Walk into it.
//     `armor_return_location`s (three landing pads) send a Hall armor home.
//   Transport units (`iron_man_transport_<0|1>_trig`, the house and the city): switch both on (and JARVIS), then 1000 sends
//     a Mark XLIV carrying you to the other one (26 s).
//   War Machine (`give_wm`, the city): anyone buys it (10000), only James Rhodes wears it.
//   Suit weapons are the map's own (models and animations): repulsors, rockets, the Mark I flamethrower, the Mark XVI
//   cloak, the Mark XXXIII's heavy repulsor and blades (a swing kills what is in front), the Mark XLII's flares (zombies go
//   for where one lands for 10 s), War Machine's minigun and handgun.
// Health: the original's x1.5, as for the heroes.
// Co-op (kit.sync): the towers, JARVIS, the transport units and War Machine's purchase are the team's; the stands, the
// Hall's lift, a summoned armor's flight and a transport flight are events every client plays, so everyone sees the
// doors and armors move. Only one player can be Tony (heroes are unique), so the armors' power and who wears one are
// his client's; the flares' lures run on the host, where the zombies are.
// STARK.EXE on this map shows these armors (kino.stark here; the generic STARK uplink in mods/stark stays off).
import * as THREE from 'three';
import { createSuitHud } from '../stark/suit-hud.js';
import { createArmor, jarvisBase, soundPlayer, MAX_POWER, READY } from '../stark/armor.js';
import { createMenu } from './menu.js';

const HP = 1.5;
const W_ = n => 'malibu_' + n;
// [id, name, hp, speed, arms, weapons, extra]
const SUITS = [
  { id: 'mk1', name: 'Mark I', hp: 350, speed: .85, noSprint: true, hands: 'mk1_viewhands', weapons: ['mk1_flamethrower', 'mk1_rocket'], where: 'mag', model: 'iron_man_worldmodel_mk1' },
  { id: 'mk2', name: 'Mark II', where: 'mag', offline: true },
  { id: 'mk3', name: 'Mark III', hp: 285, speed: 1.1, hands: 'mk3_viewhands', weapons: ['mk3_repulsor', 'mk3_rocket'], where: 'mag' },
  { id: 'mk4', name: 'Mark IV', hp: 285, speed: 1.1, hands: 'mk3_viewhands', weapons: ['mk3_repulsor', 'mk3_rocket'], where: 'mag' },
  { id: 'mk5', name: 'Mark V', hp: 200, speed: 1.2, hands: 'mk5_viewhands', weapons: ['mk3_repulsor', 'mk16_cloaking'], where: 'mag', suitcase: true },
  { id: 'mk6', name: 'Mark VI', hp: 285, speed: 1.1, hands: 'mk3_viewhands', weapons: ['mk3_repulsor', 'mk6_rocket'], where: 'mag' },
  { id: 'mk7', name: 'Mark VII', where: 'mag', offline: true },
  { id: 'mk16', name: 'Mark XVI Nightclub', hp: 200, speed: 1.1, hands: 'mk16_viewhands', weapons: ['mk3_repulsor', 'mk16_cloaking'], where: 'hall', level: 3 },
  { id: 'mk17', name: 'Mark XVII Heartbreaker', where: 'hall', offline: true },
  { id: 'mk22', name: 'Mark XXII Hotrod', where: 'hall', offline: true },
  { id: 'mk33', name: 'Mark XXXIII Silver Centurion', hp: 285, speed: 1.1, hands: 'mk5_viewhands', weapons: ['heavy_repulsor', 'mk33_blades'], where: 'hall', level: 5 },
  { id: 'mk37', name: 'Mark XXXVII Hammerhead', where: 'hall', offline: true },
  { id: 'mk39', name: 'Mark XXXIX Gemini', where: 'hall', offline: true },
  { id: 'mk40', name: 'Mark XL Shotgun', where: 'hall', offline: true },
  { id: 'mk42', name: 'Mark XLII', hp: 285, speed: 1.1, hands: 'mk42_viewhands', weapons: ['mk3_repulsor', 'mk6_rocket', 'mk42_flare'], where: 'hall', level: 4 },
  { id: 'wm', name: 'War Machine', hp: 320, speed: 1.1, hands: 'wm_viewhands', weapons: ['wm_minigun', 'wm_handgun', 'mk3_rocket'], where: 'wm', cost: 10000 },
].map(s => ({ ...s, hp: (s.hp ?? 0) * HP, weapons: (s.weapons ?? []).map(W_), power: MAX_POWER, owned: s.where !== 'wm' }));

export function setupTony(kit, heroes) {
  const { api, one, named, center, say, dialog, wait, move, nodes, show, solid, sound, figure, remove, now, feet, v3, sync } = kit;
  const { world, session, host, player, data, announce, toast } = api;
  const W = data.weapons;
  const menu = createMenu(api);
  const suitOf = id => SUITS.find(s => s.id === id);
  const tony = () => heroes.is('tony');
  const J = t => say('^5JARVIS^7: ' + t);
  const ev = (type, fn) => { sync.on('mt:' + type, fn); return (d = {}) => sync.act('mt:' + type, d); };

  // ---- the shared armor (stark/armor.js): a suit coming off goes back to where it lives (an event: everyone sees it)
  const hud = createSuitHud({ base: jarvisBase() });
  const jarvis = soundPlayer(api.audio, jarvisBase() + 'sounds/').play;
  const armor = createArmor({ api, host, session, player, sound: jarvis, toast, announce, beep: () => sound('malibu_console_beep', { volume: .5 }), hud, suits: SUITS.filter(s => !s.offline),
    onOff: s => backEv({ id: s.id }) });
  const worn = () => armor.worn();
  host.on('suitChange', ({ suit, on }) => { const s = suitOf(suit); heroes.setArms(on ? s?.hands ?? null : null); });
  heroes.block(() => worn() ? 'You cannot change characters while wearing an armor' : summoned?.mine ? 'There is an armor summoned. Use it.' : null);
  // the Mark I's flamethrower burns (weapon-levels' flamer, for weapons flagged `flamethrower`)
  if (W[W_('mk1_flamethrower')]) Object.assign(W[W_('mk1_flamethrower')], { flamethrower: true, range: 40, damage: 1, minDamage: 1 });
  if (W[W_('mk16_cloaking')]) Object.assign(W[W_('mk16_cloaking')], { cloakToggle: true, damage: 0, minDamage: 0 });
  if (W[W_('mk5_suitcase')]) Object.assign(W[W_('mk5_suitcase')], { suitcase: true, damage: 0, minDamage: 0 });
  for (const id of ['mk33_blades', 'tony_phone', 'mk42_flare']) if (W[W_(id)]) Object.assign(W[W_(id)], { damage: 0, minDamage: 0, range: 1 });

  // ---- moving map pieces by their entity origin (GSC's moveTo): a running origin per ENT name
  const origin = new Map();
  const at = n => origin.get(n) ?? (one(n) ? v3(one(n).origin) : null);
  const moveTo = (n, p, dur) => { const o = at(n); if (!o) return Promise.resolve(); origin.set(n, p.clone()); return move(n, p.clone().sub(o), dur); };
  const moveBy = (n, d, dur) => { const o = at(n); if (o) origin.set(n, o.clone().add(d)); return move(n, d, dur); };
  const up = d => new THREE.Vector3(0, d, 0);
  const codXY = (x, y) => new THREE.Vector3(x, 0, -y);   // CoD moveX/moveY in game axes

  // ---- JARVIS: five towers, then the console
  let towers = 0, jarvisOn = false;
  const towerUsed = new Set();
  show('jarvis_console_main', false); show('jarvis_console', false);
  const towerEv = ev('tower', d => {
    if (towerUsed.has(d.i)) return; towerUsed.add(d.i); towers++; sound('malibu_console_beep', { volume: .6 });
    if (towers < 5) say(d.hero === 'tony' ? `^6Tony^7: Got one. We got ${towers}/5 so far.` : `^6Tony^7: Thanks, ${d.who}. We got ${towers}/5 so far.`);
    else say('^6Tony^7: Got em all. Now I just gotta intiate ^5JARVIS^7.');
  });
  named('tony_phone_tower_trig').forEach((e, i) => world.addInteraction({ position: center(e), hidden: () => towerUsed.has(i), text: () => 'Switch on the JARVIS server', use() { towerEv({ i, who: heroes.hero()?.name ?? 'pal', hero: heroes.hero()?.id }); return true; } }));
  const jarvisEv = ev('jarvis', async () => {
    if (jarvisOn) return; jarvisOn = true; J('Hall of Armors systems are now online.'); sound('malibu_console_beep', { volume: .6 });
    show('jarvis_console_main', true);
    if (transportsOn === 2) wait(2).then(() => J('Transport Units are online.'));
    for (const o of nodes('jarvis_console')) { o.visible = true; await wait(.15); }
  });
  const consoleTrig = one('jarvis_console_trig');
  if (consoleTrig) world.addInteraction({ position: center(consoleTrig), hidden: () => jarvisOn, text: () => 'JARVIS console', use() {
    if (towers < 5) { J('It appears that my servers are offline. Please find and activate them.'); return false; }
    jarvisEv(); return true;
  } });

  // ---- the Magnificent Seven
  let deploying = false, summoned = null, hallOut = null, wmBought = false, caseOut = null;
  const magOut = new Set();   // suits whose door is open and waiting at the dock
  for (const s of SUITS.filter(x => x.where === 'mag' && !x.offline)) solid(`mag_${s.id}_door`, true);
  const canSuit = () => !worn() && !summoned && !caseOut;
  const notTony = () => { J('Only ^6Mr. Stark^7 can access the Iron Man armors'); return false; };
  const magTrig = one('mag_seven_trig');
  if (magTrig) world.addInteraction({ position: center(magTrig), text: () => 'JARVIS console · Magnificent Seven armors', use() {
    if (worn()?.where === 'mag') { J('Please return the armor to its charging dock'); return false; }
    if (worn()) { J('This armor does not belong here'); return false; }
    if (caseOut) { J('Please return the suitcase to its charging dock'); return false; }
    if (!tony()) return notTony();
    if (summoned) { J('Please use the armor you have summoned'); return false; }
    if (deploying || magOut.size) { J('Please wait while armor is being deployed'); return false; }
    menu.show({ title: 'MAGNIFICENT SEVEN', sub: 'JARVIS ARMOR DEPLOYMENT', items: SUITS.filter(x => x.where === 'mag').map(x => ({ id: x.id, label: x.name, disabled: x.offline || x.power < READY,
      note: x.offline ? 'not available' : x.power < READY ? `charging · ${Math.floor(x.power)}%` : 'ready' })), onPick: it => magDeployEv({ id: it.id }) });
    return true;
  } });
  const magDeployEv = ev('magDeploy', async d => {
    const s = suitOf(d.id); if (!s || magOut.has(s)) return;
    deploying = true; magOut.add(s);
    sound('malibu_hall_door_open', { at: at(`mag_${s.id}_door`) });
    solid(`mag_${s.id}_door`, false); await moveBy(`mag_${s.id}_door`, up(-100), 2);
    deploying = false;
  });
  // the dock: the armor leaves its stand (everyone), the door closes; the one who took it wears it (or carries the case)
  const magTakeEv = ev('magTake', async (d, ctx) => {
    const s = suitOf(d.id); if (!s || !magOut.has(s)) return;
    magOut.delete(s); show(`mag_${s.id}`, false);
    if (ctx.mine) { if (s.suitcase) takeCase(s); else armor.putOn(s); }
    await wait(1); sound('malibu_hall_door_close', { at: at(`mag_${s.id}_door`) });
    await moveBy(`mag_${s.id}_door`, up(100), 2); solid(`mag_${s.id}_door`, true);
  });
  for (const s of SUITS.filter(x => x.where === 'mag' && !x.offline)) {
    const trig = one(`mag_${s.id}_trig`); if (!trig) continue;
    world.addInteraction({ position: center(trig), hidden: () => !magOut.has(s) && worn() !== s && !(s.suitcase && caseOut), text: () => worn() === s ? `Return the ${s.name} armor` : s.suitcase && caseOut ? 'Return the suitcase' : s.suitcase ? `Take the ${s.name} suitcase` : `Suit up: ${s.name}`, use() {
      if (worn() === s) { armor.takeOff(s, `${s.name} armor is recharging`); return true; }
      if (s.suitcase && caseOut) { returnCase(); return true; }
      if (!tony()) return notTony();
      if (!canSuit()) { J('You seem to already be wearing an armor'); return false; }
      magTakeEv({ id: s.id }); return true;
    } });
  }
  // charge_armor: the door drops, the armor is back on its stand, the door closes (any armor coming off: its home)
  const backEv = ev('back', async d => {
    const s = suitOf(d.id); if (!s) return;
    if (s.where === 'wm') { show('wm_model', true); return; }
    if (s.where === 'hall') { hallBack(s); return; }
    solid(`mag_${s.id}_door`, false); await moveBy(`mag_${s.id}_door`, up(-100), 2); await wait(1.5); show(`mag_${s.id}`, true); await wait(1); await moveBy(`mag_${s.id}_door`, up(100), 2); solid(`mag_${s.id}_door`, true);
  });
  // the Mark V suitcase: the dock hands it over (it takes a slot), firing it suits you up on the spot
  function takeCase(s) {
    session.cancelReload?.();
    session.inventory.push({ id: W_('mk5_suitcase'), mag: 1, reserve: 0, upgraded: false }); session.slot = session.inventory.length - 1;
    caseOut = s; api.equipView?.(); toast('Fire the suitcase to suit up', 3);
  }
  function dropCase() { const i = session.inventory.findIndex(w => w.id === W_('mk5_suitcase')); if (i >= 0) { session.inventory.splice(i, 1); session.slot = Math.min(session.slot, session.inventory.length - 1); } caseOut = null; api.equipView?.(); }
  const caseBackEv = ev('caseBack', d => show(`mag_${d.id}`, true));
  function returnCase() { const s = caseOut; dropCase(); caseBackEv({ id: s.id }); J('Suitcase returned'); }

  // ---- the Hall of Armors
  const hallSuits = SUITS.filter(x => x.where === 'hall');
  kit.prop('hall_mk42', 'iron_man_mk42', 'full_body_mk42');   // skinned: left out of the build
  const hallDoors = ['hall_door1', 'hall_door2', 'hall_door3', 'hall_door4'];
  for (const d of hallDoors) solid(d, true);
  const floorAt = n => one('hall_floor' + n) ? v3(one('hall_floor' + n).origin) : null;
  let hallReady = null;   // the suit standing on the lift at the top, waiting
  const hallMain = named('jarvis_console_main_trig')[0];
  if (hallMain) world.addInteraction({ position: center(hallMain), hidden: () => !jarvisOn, text: () => worn()?.where === 'hall' ? `Return the ${worn().name} armor` : hallOut ? 'Please wait while armor is being deployed' : 'JARVIS console · Hall of Armors', use() {
    const w = worn();
    if (w?.where === 'hall') { armor.takeOff(w, `${w.name} armor is recharging`); return true; }
    if (w) { J('This armor does not belong here'); return false; }
    if (caseOut) { J('Please return the suitcase to its charging dock'); return false; }
    if (!tony()) return notTony();
    if (summoned) { J('Please use the armor you have phone summoned'); return false; }
    if (hallOut) return false;
    menu.show({ title: 'HALL OF ARMORS', sub: 'JARVIS ARMOR DEPLOYMENT', items: hallItems(), onPick: it => hallDeployEv({ id: it.id }) });
    return true;
  } });
  const hallItems = () => hallSuits.map(x => ({ id: x.id, label: x.name, disabled: x.offline || x.power < READY || x.away,
    note: x.offline ? 'not available' : x.away ? 'deployed' : x.power < READY ? `charging · ${Math.floor(x.power)}%` : 'ready' }));
  const hallDeployEv = ev('hallDeploy', async d => {
    const s = suitOf(d.id); if (!s || hallOut) return;
    hallOut = s; s.away = true;
    sound('malibu_hall_moving', { at: at('hall_door1') });
    for (const dd of hallDoors) solid(dd, false);
    await Promise.all([moveBy('hall_door1', codXY(0, -40), 1.5), moveBy('hall_door2', codXY(0, -40), 1.5), moveBy('hall_door3', codXY(0, 40), 1.5), moveBy('hall_door4', codXY(0, 40), 1.5)]);
    await Promise.all([moveBy('hall_door1', codXY(40, 0), 1.5), moveBy('hall_door2', codXY(-40, 0), 1.5), moveBy('hall_door3', codXY(40, 0), 1.5), moveBy('hall_door4', codXY(-40, 0), 1.5)]);
    const floor = floorAt(s.level), top = floorAt(6);
    sound('malibu_hall_raise', { at: at('hall_floor') });
    moveBy(`hall_${s.id}_door`, up(-100), 2);
    await moveTo('hall_floor', floor, s.level);
    await moveTo(`hall_${s.id}`, floor, 2);
    sound('malibu_hall_raise', { at: top });
    await Promise.all([moveTo(`hall_${s.id}`, top, 3), moveTo('hall_floor', top, 3)]);
    solid('hall_floor', true);
    await moveBy(`hall_${s.id}`, up(5), .5);
    hallReady = s;
  });
  const hallTakeEv = ev('hallTake', async (d, ctx) => {
    const s = suitOf(d.id); if (!s || hallReady !== s) return;
    hallReady = null; hallOut = null; show(`hall_${s.id}`, false);
    if (ctx.mine) armor.putOn(s);
    solid('hall_floor', false);
    moveTo('hall_floor', floorAt(1), 4);
    sound('malibu_hall_raise', { at: at('hall_door1') });
    await Promise.all([moveBy('hall_door1', codXY(-40, 0), 1.5), moveBy('hall_door2', codXY(40, 0), 1.5), moveBy('hall_door3', codXY(-40, 0), 1.5), moveBy('hall_door4', codXY(40, 0), 1.5)]);
    await Promise.all([moveBy('hall_door1', codXY(0, 40), 1.5), moveBy('hall_door2', codXY(0, 40), 1.5), moveBy('hall_door3', codXY(0, -40), 1.5), moveBy('hall_door4', codXY(0, -40), 1.5)]);
    for (const dd of hallDoors) solid(dd, true);
  });
  const armorTrig = one('armor_trig');
  if (armorTrig) world.addInteraction({ position: center(armorTrig), hidden: () => !hallReady, text: () => `Engage armor deployment: ${hallReady?.name}`, use() {
    if (caseOut) { J('Please return the suitcase to its charging dock'); return false; }
    if (!tony()) return notTony();
    if (worn()) { J('You seem to already be wearing an armor'); return false; }
    hallTakeEv({ id: hallReady.id }); return true;
  } });
  // charge_armor_now: the armor is back in its alcove (snapped there, its door up again), recharging
  function hallBack(s) {
    s.away = false; if (summoned?.suit === s) clearSummon();
    const home = one(`hall_${s.id}_origin`) ?? one(`hall_${s.id}`);
    if (home) moveTo(`hall_${s.id}`, v3(home.origin), .1);
    show(`hall_${s.id}`, true);
    if (at(`hall_${s.id}_door`)) moveTo(`hall_${s.id}_door`, v3(one(`hall_${s.id}_door`).origin), .1);
  }

  // ---- the phone: summon a Hall armor (or the Mark XLII in pieces); its flight is an event, the pickup the caller's
  const points = named('summon_points').map(e => ({ at: v3(e.origin), above: one(e.target) ? v3(one(e.target).origin) : v3(e.origin).add(up(600)) }));
  const first = one('summon_first_spawn'), second = one('summon_second_spawn');
  let phoneShots = 0, phoneBusyUntil = 0;
  host.on('update', () => {
    const shots = session.shots ?? 0, fired = shots > phoneShots; phoneShots = shots;
    if (!fired || session.def?.id !== W_('tony_phone') || now() < phoneBusyUntil) return;
    phoneBusyUntil = now() + 5;
    (async () => {
      await wait(1.5); sound('malibu_console_beep', { volume: .5 }); await wait(1.5);
      if (towers < 5) { say('^6Tony^7: ^5JARVIS^7 servers must be offline.'); await wait(2); say('^6Tony^7: I should find a way to get them working'); return; }
      if (!jarvisOn) { say("^6Tony^7: All servers are online, but I haven't activated ^5JARVIS^7 yet."); return; }
      if (window.kino.malibu?.inLobby?.()) { say('^6Tony^7: Huh, no signal here'); return; }
      if (summoned) { J('You have already summoned an armor'); return; }
      if (hallOut) { J('There is already an armor open at the Hall of Armors'); return; }
      if (worn() || caseOut) { J('You seem to already be wearing an armor'); return; }
      menu.show({ title: "TONY'S PHONE", sub: 'SUMMON AN ARMOR', items: hallItems(), onPick: it => summonArmor(it.id) });
    })();
  });
  const summonArmor = id => { const p = feet(); summonEv({ id, point: points.indexOf(points.slice().sort((a, b) => a.at.distanceTo(p) - b.at.distanceTo(p))[0]) }); };
  let flyer = null, flyToken = 0;
  function clearSummon() { flyToken++; if (flyer) remove(flyer); flyer = null; summoned = null; }
  // a model flying along points (game space), each leg `dur` seconds, smoothstep, facing where it goes
  async function fly(o, legs, token, current = () => flyToken) {
    for (const [to, dur] of legs) {
      if (token !== current()) return false;
      const from = o.position.clone(), t0 = now();
      const dir = to.clone().sub(from); if (dir.lengthSq() > 1) o.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2;
      await new Promise(done => { const tick = () => { if (token !== current()) return done(); const k = Math.min(1, (now() - t0) / dur), e = k * k * (3 - 2 * k); o.position.lerpVectors(from, to, e); if (k >= 1) done(); else requestAnimationFrame(tick); }; tick(); });
    }
    return token === current();
  }
  const summonEv = ev('summon', async (d, ctx) => {
    const s = suitOf(d.id), point = points[d.point] ?? points[0]; if (!s || summoned) return;
    s.away = true; summoned = { suit: s, landed: false, mine: ctx.mine, by: ctx.by };
    const token = ++flyToken;
    show(`hall_${s.id}`, false);
    if (ctx.mine) J('Preparing armor deployment - Checking your location');
    if (s.id === 'mk42') {
      flyer = await figure('iron_man_worldmodel_mk42_pieces', null, { position: v3(first.origin) });
      await wait(1); if (ctx.mine) J('The Mark XLII is in route');
      if (!await fly(flyer, [[v3(second.origin), 6], [point.above, 10]], token)) return;
      if (summoned) summoned.homing = true;   // follows its caller (outside) until it reaches him
      return;
    }
    flyer = await figure('iron_man_worldmodel_' + s.id, 'iron_man_flight_animation', { position: v3(first.origin) });
    const loop = sound('iron_man_flight_idle', { loop: true, volume: .4 });
    await wait(15); if (token !== flyToken) { loop?.pause(); return; }
    if (ctx.mine) J('Your armor has been deployed');
    if (!await fly(flyer, [[v3(second.origin), 10], [point.above, 10]], token)) { loop?.pause(); return; }
    if (ctx.mine) J('Your armor is inbound');
    if (!await fly(flyer, [[point.at.clone().add(up(10)), 10]], token)) { loop?.pause(); return; }
    loop?.pause(); if (summoned) summoned.landed = true;
  });
  // the armor reaches its caller: gone for everyone, worn by him
  const summonTakenEv = ev('summonTaken', (d, ctx) => { const s = suitOf(d.id); clearSummon(); if (s) { s.away = true; if (ctx.mine) armor.putOn(s); } });
  const summonHomeEv = ev('summonHome', d => { const s = suitOf(d.id); clearSummon(); if (s) hallBack(s); });
  const buildings = named('building_zone').filter(e => e.bounds).map(e => new THREE.Box3(v3(e.bounds[0]), v3(e.bounds[1])));
  host.on('update', dt => {
    if (!summoned || !flyer) return;
    const s = summoned.suit;
    if (summoned.mine && !tony() && !summoned.leaving) { summoned.leaving = true; J('The armor is returning to the Hall of Armors'); summonHomeEv({ id: s.id }); return; }
    // the caller's feet (a teammate's from their pose)
    const caller = summoned.mine ? feet() : sync.players().find(p => p.id === summoned.by)?.pos;
    if (!caller) return;
    if (summoned.homing) {   // the Mark XLII: to its caller, or to the hover point while he is inside
      const inside = buildings.some(b => b.containsPoint(caller));
      if (inside && !summoned.told && summoned.mine) { summoned.told = true; J('Please move outside for Mark XLII armor bonding'); }
      const goal = inside ? flyer.position.clone() : caller.clone().add(up(40));
      const step = Math.min(1, (typeof dt === 'number' ? dt : 1 / 60) * 600 / Math.max(1, goal.distanceTo(flyer.position)));
      flyer.position.lerp(goal, step);
      if (summoned.mine && !summoned.taking && !inside && flyer.position.distanceTo(caller.clone().add(up(40))) < 100 && !worn() && !caseOut) { summoned.taking = true; summonTakenEv({ id: s.id }); }
      return;
    }
    if (summoned.landed) {
      flyer.position.y = flyer.userData.baseY ??= flyer.position.y; flyer.position.y += Math.sin(now() * 1.5) * 4;
      if (summoned.mine && !summoned.taking && flyer.position.distanceTo(caller) < 110) {
        if (worn() || caseOut) { if (!summoned.warned) { summoned.warned = true; J('You seem to already be wearing an armor'); } return; }
        summoned.taking = true; summonTakenEv({ id: s.id });
      }
    }
  });
  // landing pads that send a Hall armor home
  for (const e of named('armor_return_location')) world.addInteraction({ position: center(e), text: () => 'Return armor to Hall of Armors', use() {
    const w = worn();
    if (caseOut) { J('Please return the suitcase to its charging dock'); return false; }
    if (!w) { dialog([[0, '^5JARVIS^7: You are not wearing an armor'], [2, '^5JARVIS^7: Shall I scan your vitals for intoxication? [Drugs]']]); return false; }
    if (w.where === 'wm') { J('This armor cannot be returned here'); return false; }
    if (w.where === 'mag') { dialog([[0, '^5JARVIS^7: Magnificent Seven armors cannot be returned here because'], [2, '^5JARVIS^7: they cannot be remotely controlled by me. (Marks I-VII)']]); return false; }
    armor.takeOff(w, `${w.name} armor is flying back to the Hall of Armors`); return true;
  } });

  // ---- War Machine (the city): bought by anyone (the team's), worn by James Rhodes
  const wmTrig = one('give_wm'), wm = suitOf('wm');
  const wmBuyEv = ev('wmBuy', d => { if (wmBought) return; wmBought = true; sound('malibu_console_beep'); say(d.hero === 'rhodes' ? '^3James Rhodes^7: War Machine inbound, baby!!!' : `${d.who}: I hope you're happy, ^3Rhodes^7. That was expensive.`); });
  const wmTakeEv = ev('wmTake', (d, ctx) => { show('wm_model', false); if (ctx.mine) armor.putOn(wm); });
  if (wmTrig) world.addInteraction({ position: center(wmTrig), text: () => !wmBought ? 'Buy War Machine · 10000' : worn() === wm ? 'Return the War Machine armor' : wm.power < READY ? `War Machine is charging · ${Math.floor(wm.power)}%` : 'War Machine armor', use() {
    if (!wmBought) {
      if (session.points < wm.cost) { toast('Not enough points', 2); return false; }
      session.spend(wm.cost); wmBuyEv({ who: heroes.name(), hero: heroes.hero()?.id }); return true;
    }
    if (worn() === wm) { armor.takeOff(wm, 'War Machine is recharging'); return true; }
    if (heroes.is('tony')) { say("^6Tony^7: I totally own this armor. But I'll leave it for ^3Rhodes."); return false; }
    if (!heroes.is('rhodes')) { say(`${heroes.name()}: I should leave this for ^3Rhodes.`); return false; }
    if (worn()) return false;
    if (wm.power < READY) { J('The armor is still charging'); return false; }
    wmTakeEv(); return true;
  } });

  // ---- transport units: switch both on, then 1000 to fly to the other one carried by a Mark XLIV
  let transportsOn = 0, riding = null, rideToken = 0;
  const pods = [0, 1].map(i => ({ i, trig: one(`iron_man_transport_${i}_trig`), spawn: one(`iron_man_transport_${i}_spawn`), on: false }));
  const flyto = one('iron_man_transport_flyto');
  const podEv = ev('pod', d => {
    const pod = pods[d.i]; if (!pod || pod.on) return;
    pod.on = true; transportsOn++; sound('malibu_console_beep');
    say(`${d.who}: Got one. This Transport Unit online`);
    if (transportsOn === 2) wait(2).then(() => jarvisOn ? J('Transport Units are online.') : dialog([[0, '^5JARVIS^7: Transport Units are online, but my servers are not.'], [2, '^5JARVIS^7: Please activate my servers']]));
  });
  for (const pod of pods) if (pod.trig) world.addInteraction({ position: center(pod.trig), hidden: () => !!riding || busyPods.has(pod.i), text: () => !pod.on ? 'Activate transport unit' : transportsOn < 2 || !jarvisOn ? 'Transport unit offline' : 'Transport unit · 1000', use() {
    if (!pod.on) { podEv({ i: pod.i, who: heroes.name() }); return true; }
    if (transportsOn < 2 || !jarvisOn) { J(transportsOn < 2 ? 'The other Transport Unit is offline' : 'Please activate my servers'); return false; }
    if (session.points < 1000) { toast('Not enough points', 2); return false; }
    session.spend(1000); rideEv({ from: pod.i }); return true;
  } });
  const busyPods = new Set();
  // the carrier's flight is everyone's to see; only its passenger rides it
  const rideEv = ev('ride', async (d, ctx) => {
    const from = pods[d.from], to = pods[1 - d.from]; if (!from || busyPods.has(d.from)) return;
    busyPods.add(d.from);
    show(`iron_man_transport_${from.i}_screen`, false);
    sound('malibu_hall_door_open', { at: v3(from.spawn.origin) });
    moveBy(`iron_man_transport_${from.i}_door_1`, codXY(0, 25), 2); moveBy(`iron_man_transport_${from.i}_door_2`, codXY(0, -25), 2);
    const carrier = await figure('iron_man_worldmodel_mk44', 'iron_man_transport_flight', { position: v3(from.spawn.origin).add(up(312)) });
    await wait(1);
    const token = ++rideToken;
    if (ctx.mine) riding = { carrier, token };
    const loop = sound('iron_man_flight_idle', { loop: true, volume: .4, at: v3(from.spawn.origin), range: 3000 });
    const path = [[v3(flyto.origin).add(new THREE.Vector3(0, 0, 1600)), 10], [v3(to.spawn.origin).add(up(500)), 15]];
    await fly(carrier, path, token, () => rideToken);
    loop?.pause();
    if (ctx.mine && riding?.carrier === carrier) { riding = null; player.setPosition(v3(to.spawn.origin).add(up(20))); }
    moveBy(`iron_man_transport_${from.i}_door_1`, codXY(0, -25), 2); moveBy(`iron_man_transport_${from.i}_door_2`, codXY(0, 25), 2); show(`iron_man_transport_${from.i}_screen`, true);
    await fly(carrier, [[v3(to.spawn.origin).add(up(600)), 4]], token, () => rideToken);
    remove(carrier); busyPods.delete(d.from);
  });
  host.on('update', () => {   // carried: hanging under the Mark XLIV
    if (!riding) return;
    player.setPosition(riding.carrier.position.clone().add(up(-70)));
    if (player.velocity) player.velocity.set(0, 0, 0);
  });

  // ---- suit weapons: the Mark XXXIII's blades (a swing kills what is close in front), the Mark XLII's flares (a lure)
  let wpnShots = 0;
  const lures = [];
  const flareEv = ev('flare', d => {
    const c = v3(d.at), glow = new THREE.PointLight(0xff4020, 3, 300); glow.position.copy(c).add(up(10)); api.scene.add(glow);
    lures.push({ at: c, until: now() + 10, glow });
  });
  host.on('update', () => {
    const shots = session.shots ?? 0, fired = shots > wpnShots; wpnShots = shots;
    const id = session.def?.id;
    if (fired && id === W_('mk33_blades')) {
      sound('iron_punch_whoosh', { volume: .6 });
      const eye = api.camera.getWorldPosition(new THREE.Vector3()), fwd = api.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      for (const z of [...api.enemies.list]) { const d = z.root.position.clone().sub(eye).setY(0); const dist = d.length(); if (dist < 110 && d.normalize().dot(fwd) > .35) api.enemies.hurt(z, 1e6, false, true, 'melee'); }
    }
    if (fired && id === W_('mk42_flare')) {
      const ray = new THREE.Ray(api.camera.getWorldPosition(new THREE.Vector3()), api.camera.getWorldDirection(new THREE.Vector3()));
      const hit = world.raycast(ray, 1, 2000), point = hit ? hit.point.clone() : ray.at(2000, new THREE.Vector3());
      const c = world.closest?.(point, { x: 80, y: 200, z: 80 }) ?? point;
      flareEv({ at: [c.x, c.y, c.z].map(x => Math.round(x)) });
    }
    for (let i = lures.length - 1; i >= 0; i--) { const l = lures[i]; l.glow.intensity = 2 + Math.random() * 2; if (now() > l.until) { l.glow.removeFromParent(); lures.splice(i, 1); } }
  });
  // create_zombie_point_of_interest(2000): zombies within 2000 go for the newest flare (the host's zombies)
  const en = api.enemies, prevTarget = en.targetFor;
  en.targetFor = function (z, local) {
    const l = lures[lures.length - 1];
    if (l && z.root.position.distanceTo(l.at) < 2000) return { id: 'malibu-flare', down: true, position: l.at };
    return prevTarget ? prevTarget.call(this, z, local) : { position: local };
  };

  // the suitcase: firing it suits you up there
  let caseShots = 0;
  host.on('update', () => {
    const shots = session.shots ?? 0;
    if (caseOut && shots > caseShots && session.def?.suitcase && !worn()) { const s = caseOut; dropCase(); sound('suitup_quick', { volume: .6 }); armor.putOn(s, { quick: true }); }
    caseShots = shots;
    if (caseOut && ['reviving', 'gameover'].includes(session.phase)) returnCase();
  });
  // losing Tony takes the armor off (changing hero is blocked meanwhile; this covers going down)
  heroes.onChange(h => { if (h?.id !== 'tony' && h?.id !== 'rhodes' && worn()) armor.takeOff(worn()); if (h?.id !== 'tony' && caseOut) returnCase(); });

  host.on('reset', () => {
    rideToken++; towers = 0; jarvisOn = false; deploying = false; hallOut = null; hallReady = null; wmBought = false; transportsOn = 0; riding = null; caseOut = null;
    clearSummon(); magOut.clear(); origin.clear(); lures.length = 0; towerUsed.clear(); busyPods.clear();
    for (const p of pods) p.on = false;
    for (const s of SUITS) { s.away = false; s.power = MAX_POWER; }
    show('jarvis_console_main', false); show('jarvis_console', false);
    for (const d of hallDoors) solid(d, true); solid('hall_floor', false);
    for (const s of SUITS.filter(x => x.where === 'mag' && !x.offline)) solid(`mag_${s.id}_door`, true);
  });

  // ---- STARK.EXE on this map (the terminal's app reads kino.stark): these armors. The Hall's three deploy from the
  // terminal as a phone summon; the Magnificent Seven and War Machine are at their stands. Malibu's progress also counts
  // for STARK.EXE on other maps: JARVIS online unlocks the Iron Man armors there, War Machine bought unlocks War Machine,
  // and a win (the antidote ending) counts toward the Mark XVI.
  import('../stark/unlocks.js').then(({ grant }) => {
    host.on('update', () => { if (jarvisOn && !granted.stark) { granted.stark = true; if (grant({ stark: true }).length) toast('STARK.EXE unlocked: Iron Man armors at terminals on other maps', 6); } if (wmBought && !granted.wm) { granted.wm = true; grant({ stark_wm: true }); } });
  }).catch(() => {});
  const granted = {};
  const ROMAN = { mk1: 'I', mk3: 'III', mk4: 'IV', mk5: 'V', mk6: 'VI', mk16: 'XVI', mk33: 'XXXIII', mk42: 'XLII', wm: 'WM' };
  window.kino ??= {};
  window.kino.stark = {
    status() {
      const w = worn();
      const offline = !heroes.is('tony') && !heroes.is('rhodes') ? { title: 'STARK INDUSTRIES', lines: ['ONLY MR. STARK CAN ACCESS THE IRON MAN ARMORS.', 'JAMES RHODES WEARS WAR MACHINE (THE GAS STATION, 10,000).'] }
        : heroes.is('tony') && !jarvisOn ? { title: 'JARVIS OFFLINE', lines: [`JARVIS SERVERS ONLINE: ${towers} / 5.`, 'SWITCH ON THE PHONE TOWERS AROUND MALIBU, THEN START JARVIS AT THE CONSOLE IN THE HALL OF ARMORS.', 'THE MAGNIFICENT SEVEN STANDS WORK WITHOUT HIM.'] } : null;
      return { unlocked: true, power: true, phase: offline ? 'local' : 'online', offline, footnote: '* The Hall of Armors flies it to the landing point nearest you, as Tony\'s phone does. The Magnificent Seven and War Machine suit up at their stands. When its power runs out it goes home and recharges.', cores: 0, coresNeeded: 0, uplinkLeft: 0, uplink: 0, points: session.points, wins: 0, winsNeeded: 0, delivering: !!summoned, req: { stark: true, stark_wm: true, stark_mk16: true },
        suits: SUITS.filter(s => !s.offline && (heroes.is('rhodes') ? s.where === 'wm' : true)).map(s => {
          const here = s.where === 'hall';
          const note = s.where === 'mag' ? 'AT THE MAGNIFICENT SEVEN' : s.where === 'wm' ? (heroes.is('rhodes') ? (wmBought ? 'AT THE GAS STATION' : 'BUY IT AT THE GAS STATION') : 'FOR JAMES RHODES') : s.away && w !== s ? 'DEPLOYED' : null;
          return { id: s.id, mark: ROMAN[s.id], name: s.name, cost: 0, hp: s.hp, speed: s.speed, weapons: s.weapons.map(x => W[x]?.name ?? x),
            unlocked: true, owned: true, worn: w === s, power: Math.floor(s.power), ready: s.power > READY && !s.away, note, blocked: !here && w !== s };
        }) };
    },
    act(action, id) {
      const s = suitOf(id); if (!s) return 'Unknown armor';
      if (action === 'recall') { if (worn() !== s) return 'Not wearing it'; armor.takeOff(s, `${s.name} armor recalled`); return true; }
      if (action !== 'deploy') return 'Unknown action';
      if (!heroes.is('tony')) return 'Only Mr. Stark can access the Iron Man armors';
      if (s.where !== 'hall') return 'That armor deploys at its stand';
      if (!jarvisOn) return 'JARVIS is offline';
      if (window.kino.malibu?.inLobby?.()) return 'No signal in Asgard';
      if (worn() || caseOut) return 'You are already wearing an armor';
      if (summoned) return 'An armor is on its way';
      if (hallOut) return 'An armor is open at the Hall of Armors';
      if (s.away) return 'Deployed';
      if (s.power <= READY) return `Still charging · ${Math.floor(s.power)}%`;
      summonArmor(s.id); return true;
    },
  };

  return { state: () => ({ towers, jarvisOn, worn: worn()?.id ?? null, summoned: summoned?.suit.id ?? null, landed: !!summoned?.landed, hallReady: hallReady?.id ?? null, magOut: [...magOut].map(s => s.id), wmBought, transportsOn, riding: !!riding, caseOut: !!caseOut, power: Object.fromEntries(SUITS.filter(s => !s.offline).map(s => [s.id, Math.round(s.power)])) }),
    SUITS, armor, setTowers: n => { towers = n; }, summon: id => summonArmor(id), magDeploy: id => magDeployEv({ id }), hallDeploy: id => hallDeployEv({ id }), jarvis: () => { towers = 5; jarvisEv(); } };
}
