// Exfil (Cold War style, fork). After round 10, every fifth round (the start of round 11, 16, 21 …) opens an exfil
// window that lasts until that round ends. A terminal (the terminal booth's EXFIL app) calls it in:
//   - a landing zone is picked (zones.json per map: the farthest one the caller can reach; else the player spawn)
//   - normal round spawning and round progression stop; a stronger horde rises out of the ground near the players
//     (zombies of round + BOOST: their health and speed) for DURATION seconds
//   - for the last LAND seconds the chopper is landing; at 0 a player must be standing (not downed or dead) inside
//     the zone (RADIUS)
//   - in the zone: EXFIL SUCCESSFUL, the game ends and pays account XP (kino.progression.grant) and class XP
//     (kino.classes.grantXp), both growing with the rounds survived (R = round − 1): account 20·R², class 10·R²
//     (R 10: 2000 / 1000, R 15: 4500 / 2250, R 20: 8000 / 4000). A game with cheats earns nothing.
//   - outside it: left behind, game over.
// Co-op (mods/multiplayer, host-authoritative): anyone can call it (a guest's call goes to the host as
// {t:'exfil',a:'call'}). The host runs the timer and the horde (spawned zombies mirror to everyone like any other),
// scaled by the players in the room, and sends {a:'state', zone, time, rounds} to the room every second (late joiners and
// guests build their marker/HUD from it; the timer field is `time`, since `t` is the relay's message type). At 0 the host checks every player (its own feet and the teammates' poses) and
// sends {a:'end', escaped:[ids]}; each player then wins (with their own XP) or is left behind. If the host leaves mid-run
// the new host carries on from the last state.
// window.kino.exfil: {status(), start() -> true | reason, run}; host events 'exfilStart', 'exfilEnd' {success, rounds}.
import * as THREE from 'three';

const FIRST = 11, EVERY = 5, DURATION = 120, LAND = 25, RADIUS = 160, MAX_ALIVE = 28, PER_PLAYER = 6, SPAWN_EVERY = .55, BOOST = 5;
export const exfilRound = r => r >= FIRST && (r - FIRST) % EVERY === 0;
export const exfilRewards = rounds => ({ account: 20 * rounds * rounds, cls: 10 * rounds * rounds });   // class XP doubled 2026-10-09

export default async function setup(api) {
  const { host, session, world, enemies, player, scene, audio } = api;
  const cfg = await fetch(new URL('zones.json', import.meta.url)).then(r => r.json()).catch(() => ({}));
  const mapId = api.map?.id ?? 'kino';
  const net = () => window.kino.coop?.id ? window.kino.coop : null;   // a co-op room
  const isHost = () => !net() || net().isHost;
  const feet = () => player.getFeetPosition();
  const meUp = () => session.phase !== 'reviving' && session.phase !== 'gameover';
  let run = null, saved = null, announced = 0, zoneCache = null, subscribed = false, sendIn = 0, verdict = null;   // verdict: the run awaiting the host's 'end'

  // ---- landing zones -------------------------------------------------------------------------------------------
  const zones = (() => {
    const list = (cfg[mapId] ?? []).map(z => ({ name: z.name, at: new THREE.Vector3(...z.position) }));
    if (!list.length) { const s = world.spawn?.position ?? feet(); list.push({ name: 'Landing Zone', at: s.clone() }); }
    for (const z of list) { const n = world.closest?.(z.at); if (n) z.at.copy(n); }
    return list;
  })();
  const reachable = (z, from) => { const p = world.path?.(from, z.at); return !p || (p.length > 0 && p.at(-1).distanceTo(z.at) < 90); };
  function pickZone(from = feet()) {
    if (zoneCache && performance.now() - zoneCache.t < 2000 && zoneCache.from.distanceTo(from) < 50) return zoneCache.z;
    const ok = zones.filter(z => reachable(z, from)).sort((a, b) => b.at.distanceTo(from) - a.at.distanceTo(from));
    const z = ok.find(z => z.at.distanceTo(from) > RADIUS * 1.5) ?? ok[0] ?? zones[0];
    zoneCache = { t: performance.now(), z, from: from.clone() }; return z;
  }

  // ---- players (co-op: the host's own feet plus the teammates' poses) ------------------------------------------
  function players() {
    const n = net(), list = [{ id: n?.id ?? 'me', at: feet(), up: meUp() }];
    for (const r of n?.remotes?.values() ?? []) if (r.target && performance.now() - r.lastSeen < 5000) list.push({ id: r.id, at: r.target.clone(), up: !r.down && !r.dead });
    return list;
  }
  const inZone = (at, zone) => Math.hypot(at.x - zone.at.x, at.z - zone.at.z) < RADIUS && Math.abs(at.y - zone.at.y) < 120;

  // ---- status (the terminal app reads this) --------------------------------------------------------------------
  function nextWindow(r) { let n = Math.max(FIRST, r); while (!exfilRound(n)) n++; return n; }
  function status() {
    const r = session.round, rounds = r - 1;
    if (run) return { available: false, active: true, reason: 'Exfil in progress', round: r, zone: run.zone.name, reward: exfilRewards(run.rounds) };
    const base = { round: r, every: EVERY, first: FIRST, duration: DURATION };
    if (!world.spawnBarriers || !enemies) return { ...base, available: false, reason: 'No exfil on this map' };
    if (session.phase === 'gameover') return { ...base, available: false, reason: 'Game over' };
    if (exfilRound(r)) return { ...base, available: true, zone: pickZone().name, reward: exfilRewards(rounds), closes: r, coop: !!net() };
    const next = nextWindow(r + 1);
    return { ...base, available: false, next, reward: exfilRewards(next - 1),
      reason: r < FIRST ? `Exfil opens at the start of round ${FIRST}` : `Window closed · next at the start of round ${next}` };
  }

  // ---- co-op messages ------------------------------------------------------------------------------------------
  const send = (to, m) => net()?.send(to, { ...m, t: 'exfil' });
  // Net handlers can be added before the room is joined; the multiplayer mod loads after this one, so subscribe once
  // every mod is up (and again from update, in case). A paused guest still hears the host.
  function subscribe() {
    const n = window.kino.coop; if (!n || subscribed) return; subscribed = true;
    n.on('exfil', (m, from) => {
      if (m.a === 'call' && isHost()) { const r = begin(m.at ? new THREE.Vector3(...m.at) : null); if (r !== true) send(from, { a: 'deny', reason: r }); }
      else if (m.a === 'deny') api.toast?.(m.reason || 'Exfil unavailable', 4);
      else if (m.a === 'state' && !isHost()) follow(m);
      else if (m.a === 'end' && (run || verdict)) finish(m.escaped.includes(net()?.id), m.rounds);   // even if a game over got here first
    });
  }
  const stateMsg = () => ({ a: 'state', zone: { name: run.zone.name, at: run.zone.at.toArray() }, time: run.t, rounds: run.rounds });   // not `t`: that's the message type

  // ---- the run -------------------------------------------------------------------------------------------------
  // start(): what the terminal calls. The host (or a solo player) begins it; a guest asks the host.
  function start() {
    const st = status();
    if (!st.available) return st.reason;
    if (!isHost()) { send('host', { a: 'call', at: feet().toArray() }); return true; }
    return begin();
  }
  function begin(callerAt = null) {
    const st = status();
    if (!st.available) return st.reason;
    zoneCache = null;
    open(pickZone(callerAt ?? feet()), DURATION, session.round - 1);
    takeOver();
    if (session.phase === 'preparing') session.phase = 'fighting';
    send('all', stateMsg()); sendIn = 1;
    return true;
  }
  // the host owns spawning: no normal spawns, and the round can't end under the run
  function takeOver() {
    if (saved || !isHost()) return;
    saved = { autoSpawn: enemies.autoSpawn, autoRounds: enemies.autoRounds };
    enemies.autoSpawn = false; enemies.autoRounds = false;
  }
  function open(zone, t, rounds) {
    verdict = null;
    run = { zone, t, rounds, spawnIn: 1.5, landing: t <= LAND, inZone: false, marker: marker(zone.at) };
    api.announce?.('EXFIL INBOUND', 'REACH THE ' + zone.name.toUpperCase(), 5); audio?.play?.('round');
    hud.hidden = false; host.emit('exfilStart', { zone: zone.name });
  }
  // a guest follows the host's clock
  function follow(m) {
    if (!run) open({ name: m.zone.name, at: new THREE.Vector3(...m.zone.at) }, m.time, m.rounds);
    else run.t = m.time;
  }
  function stop() {
    if (!run) return;
    run.marker.removeFromParent(); run.marker.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    if (saved) { enemies.autoSpawn = saved.autoSpawn; enemies.autoRounds = saved.autoRounds; }
    run = null; saved = null; hud.hidden = true;
  }
  // the horde: zombies of round + BOOST rising out of the ground at spawn points near a random standing player
  function spawnOne(list) {
    const up = list.filter(p => p.up), f = (up.length ? up : list)[Math.floor(Math.random() * (up.length || list.length))].at;
    const bars = world.spawnBarriers(session).map(b => ({ b, d: b.inside.distanceTo(f) })).filter(x => x.d > 220).sort((a, b) => a.d - b.d).slice(0, 6);
    if (!bars.length) return;
    const b = bars[Math.floor(Math.random() * bars.length)].b, at = b.inside.clone(), r = session.round;
    session.round = r + BOOST;
    try { const z = enemies.spawn(at, null, 'zombie'); if (z) { enemies.riseAt?.(z, at); z.exfil = true; } } finally { session.round = r; }
  }
  // host: who made it
  function judge() {
    const escaped = players().filter(p => p.up && inZone(p.at, run.zone)).map(p => p.id), rounds = run.rounds;
    send('all', { a: 'end', escaped, rounds });
    finish(escaped.includes(net()?.id ?? 'me'), rounds);
  }
  function finish(success, rounds) {
    stop(); verdict = null;
    const reward = exfilRewards(rounds), cheat = !!window.kino.cheats?.used;
    if (success && !cheat) { window.kino.progression?.grant?.(reward.account); window.kino.classes?.grantXp?.(reward.cls); }
    session.phase = 'gameover'; session.lastEvent = success ? 'Exfil successful' : 'Left behind';
    api.setActive?.(false); document.exitPointerLock?.();
    const $ = id => document.getElementById(id);
    if ($('start')) $('start').innerHTML = 'PLAY AGAIN <span>→</span>'; if ($('restart')) $('restart').hidden = true;
    if ($('menu-status')) $('menu-status').textContent = success ? `Exfil successful · ${rounds} rounds survived` : `Left behind · exfil failed on round ${session.round}`;
    if ($('results')) { $('results').hidden = false;
      $('results').textContent = `${session.kills} kills · ${session.headshots} headshots` + (success ? ' · ' + (cheat ? 'no exfil bonus (cheats were used)' : `exfil bonus +${reward.account.toLocaleString()} XP · +${reward.cls.toLocaleString()} class XP`) : ''); }
    host.emit('exfilEnd', { success, rounds, reward: success ? reward : null });
    host.emit('gameOver', { round: session.round, kills: session.kills });
    if (success) api.announce?.('EXFIL SUCCESSFUL', cheat ? 'NO XP · CHEATS WERE USED' : `+${reward.account.toLocaleString()} XP · +${reward.cls.toLocaleString()} CLASS XP`, 6);
    else api.announce?.('LEFT BEHIND', 'THE CHOPPER LEFT WITHOUT YOU', 6);
  }

  // ---- marker and HUD ------------------------------------------------------------------------------------------
  function marker(at) {
    const g = new THREE.Group(); g.position.copy(at);
    // the beam is one-sided, so standing inside it doesn't white out the view
    const add = (geo, opacity, color, side = THREE.DoubleSide) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side })); m.renderOrder = 4; g.add(m); return m; };
    const beam = add(new THREE.CylinderGeometry(10, 16, 1400, 16, 1, true), .22, 0x52ff8a, THREE.FrontSide); beam.position.y = 700;
    const core = add(new THREE.CylinderGeometry(3, 5, 1400, 8, 1, true), .5, 0xc8ffd8, THREE.FrontSide); core.position.y = 700;
    const ring = add(new THREE.RingGeometry(RADIUS - 6, RADIUS, 64), .7, 0x52ff8a); ring.rotation.x = -Math.PI / 2; ring.position.y = 3;
    const fill = add(new THREE.CircleGeometry(RADIUS - 6, 64), .07, 0x52ff8a); fill.rotation.x = -Math.PI / 2; fill.position.y = 2;
    g.userData = { beam, ring, fill }; scene.add(g); return g;
  }
  const hud = document.createElement('div'); hud.id = 'exfil-hud'; hud.hidden = true;
  hud.innerHTML = '<small>EXFIL</small><b></b><span></span><i></i>';
  const css = document.createElement('style');
  css.textContent = `#exfil-hud{position:fixed;top:34px;left:50%;transform:translateX(-50%);z-index:5;text-align:center;pointer-events:none;color:#e8f5ea;text-shadow:0 2px 6px #000;font-family:Arial,Helvetica,sans-serif}
    #exfil-hud small{display:block;font-size:10px;letter-spacing:5px;color:#7dffa6}#exfil-hud b{display:block;font:normal 34px Georgia,serif;letter-spacing:2px}
    #exfil-hud span{display:block;font-size:12px;letter-spacing:2px;margin-top:4px}#exfil-hud i{display:block;font-style:normal;font-size:11px;letter-spacing:2px;color:#b9c9bb;margin-top:3px}
    #exfil-hud.landing b{color:#ffd36b}#exfil-hud.out span{color:#ff8c7a}`;
  document.head.append(css); document.body.append(hud);
  function drawHud(list) {
    const t = Math.max(0, Math.ceil(run.t)), d = Math.round(Math.hypot(feet().x - run.zone.at.x, feet().z - run.zone.at.z) / 39.37);
    hud.querySelector('b').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    hud.querySelector('span').textContent = run.landing ? (run.inZone ? 'THE CHOPPER IS LANDING · STAY IN THE ZONE' : 'THE CHOPPER IS LANDING · GET TO THE ZONE') : run.inZone ? 'HOLD THE LANDING ZONE' : 'REACH THE ' + run.zone.name.toUpperCase();
    const mates = list.length > 1 ? ` · SQUAD ${list.filter(p => p.up && inZone(p.at, run.zone)).length}/${list.length} IN` : '';
    hud.querySelector('i').textContent = (run.inZone ? 'IN THE ZONE' : d + ' M AWAY') + mates;
    hud.classList.toggle('landing', run.landing); hud.classList.toggle('out', run.landing && !run.inZone);
  }

  // ---- per frame -----------------------------------------------------------------------------------------------
  host.on('update', dt => {
    subscribe();
    if (!run) {
      // tell the players when a window opens (only where a terminal can call it)
      if (exfilRound(session.round) && announced !== session.round && window.kino.terminalBooth?.booths?.length && status().available) {
        announced = session.round; api.toast?.('Exfil available this round · call it from a terminal', 6);
      }
      return;
    }
    if (session.phase === 'gameover') { if (net() && !isHost()) verdict = run.rounds; stop(); return; }   // died solo, or everyone went down / the host ended it in co-op
    run.t = Math.max(0, run.t - dt);
    run.inZone = meUp() && inZone(feet(), run.zone);
    const list = players();
    if (isHost()) {
      takeOver();   // also when this player just became the host mid-run
      run.spawnIn -= dt;
      if (run.spawnIn <= 0) { run.spawnIn = SPAWN_EVERY / Math.sqrt(list.length); if (enemies.list.length < MAX_ALIVE + PER_PLAYER * (list.length - 1)) spawnOne(list); }
      if (net() && (sendIn -= dt) <= 0) { sendIn = 1; send('all', stateMsg()); }
    }
    if (!run.landing && run.t <= LAND) { run.landing = true; api.announce?.('THE CHOPPER IS LANDING', 'GET TO THE LANDING ZONE', 4); audio?.play?.('round'); }
    const u = run.marker.userData, pulse = .5 + .5 * Math.sin(session.time * (run.landing ? 9 : 3));
    u.beam.material.opacity = .14 + .14 * pulse; u.ring.material.opacity = .45 + .4 * pulse; u.fill.material.opacity = run.inZone ? .12 : .05;
    drawHud(list);
    if (run.t <= 0 && isHost()) judge();   // guests wait for the host's verdict
  });
  host.on('reset', () => { stop(); announced = 0; verdict = null; });
  host.on('ready', subscribe);
  window.kino.exfil = { status, start, get run() { return run; }, zones };
}
