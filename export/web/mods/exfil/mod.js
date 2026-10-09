// Exfil (Cold War style, fork). After round 10, every fifth round (the start of round 11, 16, 21 …) opens an exfil
// window that lasts until that round ends. A terminal (the terminal booth's EXFIL app) calls it in:
//   - a landing zone is picked (zones.json per map: the farthest one the player can reach; else the player spawn)
//   - normal round spawning and round progression stop; a stronger horde rises out of the ground near the player
//     (zombies of round + BOOST: their health and speed) for DURATION seconds
//   - for the last LAND seconds the chopper is landing; at 0 the player must be inside the zone (RADIUS)
//   - in the zone: EXFIL SUCCESSFUL, the game ends and pays account XP (kino.progression.grant) and class XP
//     (kino.classes.grantXp), both growing with the rounds survived (R = round − 1): account 20·R², class 5·R²
//     (R 10: 2000 / 500, R 15: 4500 / 1125, R 20: 8000 / 2000). A game with cheats earns nothing.
//   - outside it: left behind, game over.
// Solo only for now (a co-op room would need the host to run it for everyone).
// window.kino.exfil: {status(), start() -> true | reason, run}; host events 'exfilStart', 'exfilEnd' {success, rounds}.
import * as THREE from 'three';

const FIRST = 11, EVERY = 5, DURATION = 120, LAND = 25, RADIUS = 160, MAX_ALIVE = 28, SPAWN_EVERY = .55, BOOST = 5;
export const exfilRound = r => r >= FIRST && (r - FIRST) % EVERY === 0;
export const exfilRewards = rounds => ({ account: 20 * rounds * rounds, cls: 5 * rounds * rounds });

export default async function setup(api) {
  const { host, session, world, enemies, player, scene, audio } = api;
  const cfg = await fetch(new URL('zones.json', import.meta.url)).then(r => r.json()).catch(() => ({}));
  const mapId = api.map?.id ?? 'kino';
  const coop = () => !!window.kino.coop?.id;
  const feet = () => player.getFeetPosition();
  let run = null, saved = null, announced = 0, zoneCache = null;

  // ---- landing zones -------------------------------------------------------------------------------------------
  const zones = (() => {
    const list = (cfg[mapId] ?? []).map(z => ({ name: z.name, at: new THREE.Vector3(...z.position) }));
    if (!list.length) { const s = world.spawn?.position ?? feet(); list.push({ name: 'Landing Zone', at: s.clone() }); }
    for (const z of list) { const n = world.closest?.(z.at); if (n) z.at.copy(n); }
    return list;
  })();
  const reachable = z => { const p = world.path?.(feet(), z.at); return !p || (p.length > 0 && p.at(-1).distanceTo(z.at) < 90); };
  function pickZone() {
    if (zoneCache && performance.now() - zoneCache.t < 2000) return zoneCache.z;
    const f = feet(), ok = zones.filter(reachable).sort((a, b) => b.at.distanceTo(f) - a.at.distanceTo(f));
    const z = ok.find(z => z.at.distanceTo(f) > RADIUS * 1.5) ?? ok[0] ?? zones[0];
    zoneCache = { t: performance.now(), z }; return z;
  }

  // ---- status (the terminal app reads this) --------------------------------------------------------------------
  function nextWindow(r) { let n = Math.max(FIRST, r); while (!exfilRound(n)) n++; return n; }
  function status() {
    const r = session.round, rounds = r - 1;
    if (run) return { available: false, active: true, reason: 'Exfil in progress', round: r, zone: run.zone.name, reward: exfilRewards(run.rounds) };
    const base = { round: r, every: EVERY, first: FIRST, duration: DURATION };
    if (!world.spawnBarriers || !enemies) return { ...base, available: false, reason: 'No exfil on this map' };
    if (coop()) return { ...base, available: false, reason: 'Solo only for now' };
    if (session.phase === 'gameover') return { ...base, available: false, reason: 'Game over' };
    if (exfilRound(r)) return { ...base, available: true, zone: pickZone().name, reward: exfilRewards(rounds), closes: r };
    const next = nextWindow(r + 1);
    return { ...base, available: false, next, reward: exfilRewards(next - 1),
      reason: r < FIRST ? `Exfil opens at the start of round ${FIRST}` : `Window closed · next at the start of round ${next}` };
  }

  // ---- the run -------------------------------------------------------------------------------------------------
  function start() {
    const st = status();
    if (!st.available) return st.reason;
    const zone = pickZone();
    saved = { autoSpawn: enemies.autoSpawn, autoRounds: enemies.autoRounds };
    enemies.autoSpawn = false; enemies.autoRounds = false;   // no normal spawns, and the round can't end under us
    if (session.phase === 'preparing') session.phase = 'fighting';
    run = { zone, t: DURATION, spawnIn: 1.5, landing: false, inZone: false, rounds: session.round - 1, marker: marker(zone.at) };
    api.announce?.('EXFIL INBOUND', 'REACH THE ' + zone.name.toUpperCase(), 5); audio?.play?.('round');
    hud.hidden = false; host.emit('exfilStart', { zone: zone.name });
    return true;
  }
  function stop() {
    if (!run) return;
    run.marker.removeFromParent(); run.marker.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    if (saved) { enemies.autoSpawn = saved.autoSpawn; enemies.autoRounds = saved.autoRounds; }
    run = null; saved = null; hud.hidden = true;
  }
  // the horde: zombies of round + BOOST rising out of the ground at spawn points near the player
  function spawnOne() {
    const f = feet(), bars = world.spawnBarriers(session).map(b => ({ b, d: b.inside.distanceTo(f) }))
      .filter(x => x.d > 220).sort((a, b) => a.d - b.d).slice(0, 6);
    if (!bars.length) return;
    const b = bars[Math.floor(Math.random() * bars.length)].b, at = b.inside.clone(), r = session.round;
    session.round = r + BOOST;
    try { const z = enemies.spawn(at, null, 'zombie'); if (z) { enemies.riseAt?.(z, at); z.exfil = true; } } finally { session.round = r; }
  }
  function succeed() {
    const rounds = run.rounds, reward = exfilRewards(rounds), cheat = !!window.kino.cheats?.used;
    stop();
    if (!cheat) { window.kino.progression?.grant?.(reward.account); window.kino.classes?.grantXp?.(reward.cls); }
    session.phase = 'gameover'; session.lastEvent = 'Exfil successful';
    api.setActive?.(false); document.exitPointerLock?.();
    const $ = id => document.getElementById(id);
    if ($('start')) $('start').innerHTML = 'PLAY AGAIN <span>→</span>'; if ($('restart')) $('restart').hidden = true;
    if ($('menu-status')) $('menu-status').textContent = `Exfil successful · ${rounds} rounds survived`;
    if ($('results')) { $('results').hidden = false;
      $('results').textContent = `${session.kills} kills · ${session.headshots} headshots · ` + (cheat ? 'no exfil bonus (cheats were used)' : `exfil bonus +${reward.account.toLocaleString()} XP · +${reward.cls.toLocaleString()} class XP`); }
    host.emit('exfilEnd', { success: true, rounds, reward });
    host.emit('gameOver', { round: session.round, kills: session.kills });
    api.announce?.('EXFIL SUCCESSFUL', cheat ? 'NO XP · CHEATS WERE USED' : `+${reward.account.toLocaleString()} XP · +${reward.cls.toLocaleString()} CLASS XP`, 6);
  }
  function fail() {
    const rounds = run.rounds; stop();
    host.emit('exfilEnd', { success: false, rounds });
    session.lastEvent = 'Left behind'; session.effects.invulnerable = 0;
    api.toast?.('You were left behind', 5); api.damage?.(1e6);
    const m = document.getElementById('menu-status'); if (m && session.phase === 'gameover') m.textContent = `Left behind · exfil failed on round ${session.round}`;
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
  function drawHud() {
    const t = Math.max(0, Math.ceil(run.t)), d = Math.round(Math.hypot(feet().x - run.zone.at.x, feet().z - run.zone.at.z) / 39.37);
    hud.querySelector('b').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    hud.querySelector('span').textContent = run.landing ? (run.inZone ? 'THE CHOPPER IS LANDING · STAY IN THE ZONE' : 'THE CHOPPER IS LANDING · GET TO THE ZONE') : run.inZone ? 'HOLD THE LANDING ZONE' : 'REACH THE ' + run.zone.name.toUpperCase();
    hud.querySelector('i').textContent = run.inZone ? 'IN THE ZONE' : d + ' M AWAY';
    hud.classList.toggle('landing', run.landing); hud.classList.toggle('out', run.landing && !run.inZone);
  }

  // ---- per frame -----------------------------------------------------------------------------------------------
  host.on('update', dt => {
    if (!run) {
      // tell the player when a window opens (only where a terminal can call it)
      if (exfilRound(session.round) && announced !== session.round && window.kino.terminalBooth?.booths?.length && status().available) {
        announced = session.round; api.toast?.('Exfil available this round · call it from a terminal', 6);
      }
      return;
    }
    if (session.phase === 'gameover') { stop(); return; }
    run.t -= dt;
    const f = feet(), z = run.zone.at;
    run.inZone = Math.hypot(f.x - z.x, f.z - z.z) < RADIUS && Math.abs(f.y - z.y) < 120;
    run.spawnIn -= dt;
    if (run.spawnIn <= 0) { run.spawnIn = SPAWN_EVERY; if (enemies.list.length < MAX_ALIVE) spawnOne(); }
    if (!run.landing && run.t <= LAND) { run.landing = true; api.announce?.('THE CHOPPER IS LANDING', 'GET TO THE LANDING ZONE', 4); audio?.play?.('round'); }
    const u = run.marker.userData, pulse = .5 + .5 * Math.sin(session.time * (run.landing ? 9 : 3));
    u.beam.material.opacity = .14 + .14 * pulse; u.ring.material.opacity = .45 + .4 * pulse; u.fill.material.opacity = run.inZone ? .12 : .05;
    drawHud();
    if (run.t <= 0) { if (run.inZone) succeed(); else fail(); }
  });
  host.on('reset', () => { stop(); announced = 0; });
  window.kino.exfil = { status, start, get run() { return run; }, zones };
}
