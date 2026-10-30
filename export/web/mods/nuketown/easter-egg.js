// Nuketown's Easter egg (_nt_ee.gsc), six steps around the scientist behind the door at the end of the lab (knife_door):
//   1 walk up to the door; 2 knife it; 3 blow up the rocks, take the files behind them, knife the door, go prone and slide the
//   files under it; 4 find the key and the radio, open the vent, hand the radio in; 5 disable the four failsafe nodes and go
//   back to the door; 6 survive 300 s of an endless round of sprinters; the truck falls from the sky under its parachutes, and
//   getting in ends the game as a win (the exfil rewards).
// The rocks are six brushmodels the original lets through only upgraded launchers and C4 once step 3 is on; here any explosion
// near them brings them down at any time. The scientist's lines run one at a time: the next step waits for the end of a line.
// Everything is a sync.js event, so a team shares the steps; the clocks run on each client from the same event.
import * as THREE from 'three';
import { exfilRewards } from '../exfil/mod.js';

const DOOR = [-1821, 1434, -1066];
const ROCKS = [[[-807.9, 1378, 74.1], [-667.5, 1500, 269.2]], [[-758, 1370, 178.1], [-686.9, 1422, 268.9]], [[-748.5, 1422, 179.2], [-714, 1446, 238]],
  [[-777, 1408, 132.9], [-739.2, 1432, 170]], [[-726, 1385, 104.1], [-696.9, 1422, 133.8]], [[-663.8, 1408, 141.9], [-600.3, 1484, 262.3]]];
const ROCKS_AT = [-730, 1424, 200], BLAST_REACH = 260;
const FILES = [-619, 1410, 125], PAPER = { from: [-1820, 1384, -1055], to: [-1773, 1385, -1080], time: 2, use: [-1815, 1398, -1045] };
const KEY = [-346, 1412, 1011], RADIO = [-1311, 1292, 1490], VENT = [-1817, 1503, -1066], VENT_USE = [-1815, 1440, -1050];
const RADIO_MOVE = { from: [-1829, 1495, -1064], to: [-1767, 1498, -1096], time: 3 };
const NODES = [[-792, 1892, -652], [928, 1734, -848], [-992, 1744, 2149], [1092, 1744, 938]];
const LINES = { scientist1: 5.35, scientist2: 50.3, scientist3: 6.83, scientist3_2: 15.9, scientist4: 16.4, scientist5: 5.07, scientist6: 25.6, scientist7: 34.9 };
const MELEE_REACH = 120, TALK_REACH = 250, RETURN_REACH = 200, HOLD = 300, GAIN = 1;
const TRUCK = { drop: 10000, fall: 20, trigger: [-39, 1722, 2298], at: [-38, 1680, 2488],
  seats: [[-10, 1722, 2386], [-66, 1722, 2386], [-14, 1722, 2450], [-64, 1722, 2450]],
  path: [[[-38, 1680, 2488], .0, 1.5], [[-34, 1680, 3640], 2, 0], [[-58, 1680, 6824], 4, 0], [[-204, 1966, 12692], 6, 0]] };
const SPRINT_ROUND = 23;   // the endless round's zombies spawn as this round's: all sprinters (the original adds 1000 health and sprints)
const OBJECTIVES = {
  1: 'Find the door at the end of the lab',
  2: 'Knife the door',
  3: 'Blow up the rocks, take the files, knife the door, then go prone and slide them under it',
  4: 'Find the key and the radio: open the vent, then hand in the radio',
  5: 'Disable the four failsafe nodes',
  6: 'Survive until the truck lands, then get in',
};
const css = `#nt-ee-timer{position:fixed;left:50%;top:44px;transform:translateX(-50%);color:#ffe9c0;font:700 22px/1 sans-serif;letter-spacing:.08em;text-shadow:0 1px 3px #000;z-index:30;pointer-events:none}`;

const near = (c, r, g, b) => { const h = typeof c === 'number' ? c : new THREE.Color(c).getHex(THREE.SRGBColorSpace); return Math.abs((h >> 16 & 255) / 255 - r) + Math.abs((h >> 8 & 255) / 255 - g) + Math.abs((h & 255) / 255 - b) < .25; };

export function setupEasterEgg(c) {
  const { api, world, session, host, root, sync, nodesOf, moved, live, show, V, sound, sfx, burst, toast, announce, player, boxCollider, place, st } = c;
  const { enemies } = api;
  const v = a => V(...a), door = v(DOOR);
  const e = {};
  const rocks = nodesOf(root, 'rock_blockers'), rockClips = ROCKS.map(b => boxCollider(world, b, true));
  const movers = name => nodesOf(root, name).map(n => (live(n), n));
  const files = nodesOf(root, 'pick_files'), paper = movers('paper_floor'), key = nodesOf(root, 'key'), radio = nodesOf(root, 'pf5006_auto346'), radioVent = movers('radio_vent'), vent = nodesOf(root, 'vent');
  const truck = [...movers('getaway_car'), ...movers('nt_ee_driver')], chutes = movers('getaway_car_parachute');
  const lift = (nodes, a) => { for (const n of nodes) { n.position.copy(a); moved(n); } };
  const slide = (nodes, m, t) => lift(nodes, v(m.to).sub(v(m.from)).multiplyScalar(t));

  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const timer = document.createElement('div'); timer.id = 'nt-ee-timer'; timer.hidden = true; document.body.append(timer);
  host.on('warmHud', on => { timer.hidden = !on; if (on) timer.textContent = '5:00'; });

  // a line from behind the door; `then` runs when it has played out
  let line = null, voice = null;
  const say = (name, then) => { try { voice?.pause(); } catch {} voice = sound(name, GAIN); e.talk = LINES[name] ?? 1; line = then ?? null; };
  const go = to => sync.act('ntEe', { to });
  sync.on('ntEe', d => { if (d.to > e.step) e.step = d.to; });
  sync.on('ntSay', d => say(d.name, d.to ? () => { if (sync.isHost) go(d.to); } : null));
  const talkThen = (name, to) => sync.act('ntSay', { name, to });
  const talking = () => e.talk > 0;

  // ---- the rocks
  const blast = () => { if (!e.rocks) sync.act('ntRocks'); };
  sync.on('ntRocks', () => {
    if (e.rocks) return; e.rocks = true;
    show(rocks, false); for (const k of rockClips) k.enabled = false; world.collision?.invalidateCache?.();
    burst(v(ROCKS_AT), 40); sfx('explosion', .9); toast('The rocks came down', 3);
  });
  host.on('effect', x => {
    if (e.rocks || !x.position || x.count < 12) return;
    if (!near(x.color, 1, .7, .3) && !near(x.color, .58, .93, .38) && !near(x.color, .55, .96, .4)) return;
    if (x.position.distanceTo(v(ROCKS_AT)) < BLAST_REACH) blast();
  });

  // ---- the steps
  const interact = o => world.addInteraction({ nuketown: true, ...o });
  sync.on('ntFiles', (d, ctx) => { e.files = true; show(files, false); if (ctx.mine) { sfx('buy', .5); toast('The files: take them to the door', 4); } });
  interact({ position: v(FILES), hidden: () => e.step !== 3 || !e.rocks || e.files, text: () => 'Pick up the Files', use() { sync.act('ntFiles'); return true; } });
  interact({ position: v(PAPER.use), hidden: () => e.step !== 3 || !e.knifed || e.paperT != null || talking(),
    text: () => 'Slide the paper under the door', locked: () => !globalThis.kino?.movement?.state?.prone, lockedText: 'Go prone to reach under the door',
    use() { sync.act('ntPaper'); return true; } });
  sync.on('ntPaper', () => { if (e.paperT != null) return; e.paperT = 0; show(paper, true); });

  sync.on('ntKey', (d, ctx) => { e.key = true; show(key, false); if (ctx.mine) { sfx('buy', .5); toast('The key: it opens the vent over the door', 4); } });
  sync.on('ntRadio', (d, ctx) => { e.radio = true; show(radio, false); if (ctx.mine) { sfx('buy', .5); toast('The radio: the scientist can use it', 4); } });
  interact({ position: v(KEY), hidden: () => e.step !== 4 || e.key, text: () => 'Pick up the Key', use() { sync.act('ntKey'); return true; } });
  interact({ position: v(RADIO), hidden: () => e.step !== 4 || e.radio, text: () => 'Pick up the Radio', use() { sync.act('ntRadio'); return true; } });
  interact({ position: v(VENT_USE), hidden: () => e.step !== 4 || !e.key || e.vent || talking(), text: () => 'Open the Vent', use() { sync.act('ntVent'); return true; } });
  sync.on('ntVent', () => {
    e.vent = true; show(vent, false); sound('metal_crash', .9);
    const fp = globalThis.kino?.fpMotion; if (fp && player.getFeetPosition().distanceTo(door) < 400) { fp.shake = .5; setTimeout(() => { fp.shake = 0; }, 900); }
    setTimeout(() => { if (sync.isHost && e.vent) sync.act('ntSay', { name: 'scientist5' }); }, 1000);
  });
  interact({ position: v(VENT_USE).add(V(0, 0, 1)), hidden: () => e.step !== 4 || !e.vent || !e.radio || e.radioT != null || talking(), text: () => 'Give the Radio to the Scientist', use() { sync.act('ntRadioGive'); return true; } });
  sync.on('ntRadioGive', () => { if (e.radioT != null) return; e.radioT = 0; show(radioVent, true); });

  e.nodes = [false, false, false, false];
  NODES.forEach((a, i) => interact({ position: v(a), hidden: () => e.step !== 5 || e.nodes[i], text: () => 'Disable the Failsafe Node', use() { sync.act('ntNode', { i }); return true; } }));
  sync.on('ntNode', (d, ctx) => {
    if (e.nodes[d.i]) return; e.nodes[d.i] = true; sound('tactical_buttonpress', .8);
    const n = e.nodes.filter(Boolean).length; if (ctx.mine) toast(`Failsafe node ${n} / 4`, 3);
    if (n === 4) setTimeout(() => { sound('tactical_buttonpress', 1); e.buzzed = true; if (ctx.mine) toast('Back to the door', 4); }, 500);
  });

  // ---- step 6: the endless round, the truck, the way out
  sync.on('ntCounter', () => { if (e.left != null) return; e.left = HOLD; e.infinite = true; timer.hidden = false; announce('HOLD OUT', 'An endless round: the way out is coming', 5); });
  const spawn = enemies.spawn.bind(enemies);
  enemies.spawn = (...args) => {
    if (!e.infinite) return spawn(...args);
    const r = session.round; session.round = Math.max(r, SPRINT_ROUND);
    try { return spawn(...args); } finally { session.round = r; }
  };
  interact({ position: v(TRUCK.trigger), hidden: () => !e.landed || e.ride != null, text: () => 'Enter Pickup Truck', use() { sync.act('ntEscape'); return true; } });
  sync.on('ntEscape', () => {
    if (e.ride != null) return; e.ride = 0; e.done = true; timer.hidden = true;
    const ids = sync.players().map(q => q.id).sort(); e.seat = Math.max(0, ids.indexOf(sync.me)) % TRUCK.seats.length;
    sound('nt_ee_car', .8); sound('nt_ending', .7);
  });
  host.on('beforeDamage', x => { if (e.ride != null) x.amount = 0; });
  const win = () => {
    const rounds = session.round, reward = exfilRewards(rounds), cheat = !!globalThis.kino?.cheats?.used;
    if (!cheat) { globalThis.kino?.progression?.grant?.(reward.account); globalThis.kino?.classes?.grantXp?.(reward.cls); }
    session.phase = 'gameover'; session.lastEvent = 'Escaped Nuketown';
    api.setActive?.(false); document.exitPointerLock?.();
    const $ = id => document.getElementById(id);
    if ($('start')) $('start').innerHTML = 'PLAY AGAIN <span>→</span>'; if ($('restart')) $('restart').hidden = true;
    if ($('menu-status')) $('menu-status').textContent = `Escaped Nuketown · round ${rounds}`;
    if ($('results')) { $('results').hidden = false; $('results').textContent = `${session.kills} kills · ${session.headshots} headshots · ` + (cheat ? 'no bonus (cheats were used)' : `escape bonus +${reward.account.toLocaleString()} XP · +${reward.cls.toLocaleString()} class XP`); }
    host.emit('gameOver', { round: rounds, kills: session.kills });
    announce('YOU ESCAPED', cheat ? 'NO XP · CHEATS WERE USED' : `+${reward.account.toLocaleString()} XP · +${reward.cls.toLocaleString()} CLASS XP`, 6);
  };
  const legs = TRUCK.path.reduce((t, q) => t + q[1] + q[2], 0);
  const truckAt = t => {   // the truck's offset from its landing spot `t` seconds into the ride
    let a = TRUCK.path[0][0]; const start = v(a); t -= TRUCK.path[0][2];
    for (const [b, time] of TRUCK.path.slice(1)) { if (t < time) return v(a).lerp(v(b), Math.max(0, t) / time).sub(start); t -= time; a = b; }
    return v(a).sub(start);
  };

  // melee: session.meleeLeft goes up when a knife swing starts
  let swing = 0;
  const swung = () => { const m = session.meleeLeft > 0, hit = m && !swing; swing = m; return hit; };
  const tick = (dt, p) => {
    if (e.talk > 0 && (e.talk -= dt) <= 0) { const f = line; line = null; f?.(); }
    if (e.paperT != null && e.paperT < PAPER.time) {
      e.paperT += dt; slide(paper, PAPER, Math.min(1, e.paperT / PAPER.time));
      if (e.paperT >= PAPER.time) { show(paper, false); if (sync.isHost) talkThen('scientist4', 4); }
    }
    if (e.radioT != null && e.radioT < RADIO_MOVE.time) {
      e.radioT += dt; slide(radioVent, RADIO_MOVE, Math.min(1, e.radioT / RADIO_MOVE.time));
      if (e.radioT >= RADIO_MOVE.time) { show(radioVent, false); if (sync.isHost) setTimeout(() => talkThen('scientist6', 5), 1000); }
    }
    const hit = swung(), d = p.distanceTo(door);
    if (!talking() && e.ride == null) {
      if (e.step === 1 && d < TALK_REACH) { e.step = 1.5; talkThen('scientist1', 2); }
      else if (e.step === 2 && hit && d < MELEE_REACH) { e.step = 2.5; talkThen('scientist2', 3); }
      else if (e.step === 3 && hit && d < MELEE_REACH) {
        if (e.files && !e.knifed) { e.knifed = true; sync.act('ntKnifed'); }
        else if (!e.rocks && !e.warned) { e.warned = true; sync.act('ntSay', { name: 'scientist3_2' }); }
      } else if (e.step === 5 && e.buzzed && d < RETURN_REACH && !e.said7) { e.said7 = true; sync.act('ntSay', { name: 'scientist7', to: 6 }); }
    }
    if (e.step === 6 && !talking() && e.left == null && sync.isHost) sync.act('ntCounter');
    if (e.left != null && e.left > 0) {
      const was = Math.ceil(e.left); e.left = Math.max(0, e.left - dt); const now = Math.ceil(e.left);
      if (now !== was) timer.textContent = `${Math.floor(now / 60)}:${String(now % 60).padStart(2, '0')}`;
      if (e.left === 0) { timer.textContent = 'ESCAPE CAR INCOMING'; announce('LOOK UP', 'Escape car coming from above!', 6); e.dropT = 0; show(truck, true); show(chutes, true); }
    }
    if (e.dropT != null && e.dropT < TRUCK.fall) {
      e.dropT = Math.min(TRUCK.fall, e.dropT + dt); const k = 1 - e.dropT / TRUCK.fall, y = TRUCK.drop * k * (.35 + .65 * k);
      lift(truck, V(0, y, 0)); lift(chutes, V(0, y, 0));
      if (e.dropT >= TRUCK.fall) { e.landed = true; show(chutes, false); timer.hidden = true; toast('Get in the pickup truck', 6); sfx('explosion', .4); }
    }
    if (e.infinite && sync.isHost && e.ride == null) session.total = session.spawned + 50;
    if (e.ride != null) {
      e.ride += dt; st.spoutSafe = 2;
      const off = truckAt(e.ride); lift(truck, off);
      place(v(TRUCK.seats[e.seat]).add(off));
      if (e.ride >= legs && !e.won) { e.won = true; win(); }
    }
  };
  sync.on('ntKnifed', () => { e.knifed = true; say('scientist3'); });

  const reset = () => {
    Object.assign(e, { step: 1, talk: 0, rocks: false, files: false, knifed: false, warned: false, paperT: null, key: false, radio: false, vent: false, radioT: null, nodes: [false, false, false, false], buzzed: false, said7: false, left: null, infinite: false, dropT: null, landed: false, ride: null, seat: 0, done: false, won: false });
    line = null; try { voice?.pause(); } catch {} voice = null; timer.hidden = true; timer.textContent = '5:00';
    show(rocks, true); for (const k of rockClips) k.enabled = true; world.collision?.invalidateCache?.();
    show(files, true); show(paper, false); show(key, false); show(radio, false); show(radioVent, false); show(vent, true); show(truck, false); show(chutes, false);
    lift(paper, V(0, 0, 0)); lift(radioVent, V(0, 0, 0)); lift(truck, V(0, 0, 0)); lift(chutes, V(0, 0, 0));
  };
  // key and radio appear with step 4
  sync.on('ntEe', d => { if (d.to === 4) { show(key, true); show(radio, true); } });
  const state = () => ({
    step: Math.floor(e.step), objective: OBJECTIVES[Math.floor(e.step)], talking: talking(), door, rocks: e.rocks, rocksAt: v(ROCKS_AT), files: e.files, filesAt: v(FILES), knifed: e.knifed,
    key: e.key, keyAt: v(KEY), radio: e.radio, radioAt: v(RADIO), vent: e.vent, nodes: NODES.map((a, i) => ({ at: v(a), off: e.nodes[i] })), buzzed: e.buzzed,
    left: e.left, truck: e.dropT != null, landed: e.landed, truckAt: v(TRUCK.trigger), escaped: e.done, stepsDone: e.done ? 6 : Math.floor(e.step) - 1,
  });
  return { e, reset, tick, state, found: { rocks: rocks.length, files: files.length, paper: paper.length, key: key.length, radio: radio.length, radioVent: radioVent.length, vent: vent.length, truck: truck.length, chutes: chutes.length }, blast, win };
}
