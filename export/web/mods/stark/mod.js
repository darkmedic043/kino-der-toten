// STARK.EXE (fork): the Iron Man armors on every map that has a terminal (not Cheese Cube, which has its Hall of Armors).
// Account unlocks come from Cheese Cube (unlocks.js): building its six armor parts unlocks STARK.EXE and the Iron Man line,
// its trivia the War Machine, beating it 5 times the Mark XVI. Each game, once the power is on:
//   1. ARMOR UPLINK (started from the terminal): recover CORES armor cores. Zombies drop them (CORE_CHANCE a kill, hellhounds
//      always); they glow blue where they fell, last CORE_LIFE seconds, and are picked up by walking over them.
//   2. Upload them at the terminal: an UPLINK-second holdout; the clock only runs while you stay within UPLINK_RANGE of a
//      terminal booth.
//   3. Online: buy a suit (the Cheese Cube prices; the Mark XVI is 20000 here), then DEPLOY it from a terminal: it lands in a
//      beam where you stand 2.5 s later and you're wearing it. Wearing works as on Cheese Cube (mods/stark/armor.js): health,
//      speed, its weapons, power (it flies back when it runs out), flight (hold Space). RECALL takes it off; it recharges
//      while off and can be deployed again above 98%.
// Solo progress (each player runs their own uplink). The JARVIS HUD art and voices come from the shared mods/stark/jarvis.
// window.kino.stark: {status(), act(action, id)}; the terminal booth's STARK.EXE reads it.
import * as THREE from 'three';
import { SUITS, addSuitWeapons, createArmor, soundPlayer, jarvisBase, MAX_POWER, READY } from './armor.js';
import { rewards, WINS_FOR_MK16 } from './unlocks.js';
import { createSuitHud } from './suit-hud.js';

const CORES = 4, CORE_CHANCE = .1, CORE_LIFE = 30, UPLINK = 60, UPLINK_RANGE = 450, DELIVERY = 2.5;
const PRICE = { mk16: 20000 };
const need = id => id === 'wm' ? 'stark_wm' : id === 'mk16' ? 'stark_mk16' : 'stark';

export default function setup(api) {
  const { host, session, player, scene, audio, data } = api;
  if (api.map?.id === 'cheese-cube' || !api.enemies) return;
  addSuitWeapons(data.weapons);
  const base = jarvisBase(), snd = soundPlayer(audio, base + 'sounds/'), sound = snd.play;
  const suits = SUITS.map(s => ({ ...s, cost: PRICE[s.id] ?? s.cost, owned: false, power: MAX_POWER }));
  const suitOf = id => suits.find(s => s.id === id);
  const hud = createSuitHud({ base });
  const beep = () => audio?.play?.('buy', .5);
  const armor = createArmor({ api, host, session, player, sound, toast: api.toast, announce: api.announce, beep, hud, suits });
  const now = () => session.time;
  let phase = 'offline', cores = 0, uplinkLeft = UPLINK, delivery = null;   // offline → cores → upload → uplink → online
  const drops = [];

  // ---- cores -----------------------------------------------------------------------------------------------------
  const coreTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(230,250,255,1)'); gr.addColorStop(.3, 'rgba(90,200,255,.8)'); gr.addColorStop(1, 'rgba(40,120,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const coreGeo = new THREE.OctahedronGeometry(4), coreMat = new THREE.MeshBasicMaterial({ color: 0x9fe6ff });
  function dropCore(at) {
    const g = new THREE.Group(); g.position.copy(at).add(new THREE.Vector3(0, 22, 0));
    g.add(new THREE.Mesh(coreGeo, coreMat));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.scale.setScalar(26); g.add(halo);
    scene.add(g); drops.push({ g, t: 0 });
  }
  host.on('kill', ({ enemy, kind, remote }) => {
    if (remote || phase !== 'cores' || !enemy) return;
    if (cores + drops.length >= CORES) return;
    if (kind === 'dog' || Math.random() < CORE_CHANCE) dropCore(enemy.root.position.clone());
  });

  // ---- the terminals ------------------------------------------------------------------------------------------------
  const booths = () => window.kino.terminalBooth?.booths ?? [];
  const nearBooth = () => { const f = player.getFeetPosition(); return booths().some(b => b.root.position.distanceTo(f) < UPLINK_RANGE); };

  // ---- delivery beam ------------------------------------------------------------------------------------------------
  function beam(at) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(10, 18, 1600, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: .25,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }));
    m.position.copy(at).add(new THREE.Vector3(0, 800, 0)); m.frustumCulled = false; scene.add(m); return m;
  }

  // ---- HUD while the uplink runs ------------------------------------------------------------------------------------
  const tag = document.createElement('div'); tag.id = 'stark-hud'; tag.hidden = true;
  const css = document.createElement('style');
  css.textContent = '#stark-hud{position:fixed;top:34px;left:50%;transform:translateX(-50%);z-index:5;text-align:center;pointer-events:none;color:#ffe2a8;text-shadow:0 2px 6px #000;font:12px/1.6 Arial,Helvetica,sans-serif;letter-spacing:2px}#stark-hud b{display:block;font:normal 26px Georgia,serif;color:#fff}#stark-hud.out{color:#ff8c7a}';
  document.head.append(css); document.body.append(tag);

  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60, f = player.getFeetPosition();
    for (const d of [...drops]) {
      d.t += step; d.g.rotation.y += step * 2; d.g.position.y += Math.sin(d.t * 3) * .05;
      const gone = d.t > CORE_LIFE, got = phase === 'cores' && d.g.position.distanceTo(f.clone().add(new THREE.Vector3(0, 22, 0))) < 45;
      if (got) { cores++; beep(); api.toast?.(cores >= CORES ? 'All armor cores recovered · upload them at a terminal' : `Armor core ${cores} / ${CORES}`, 3); if (cores >= CORES) phase = 'upload'; }
      if (got || gone || phase !== 'cores') { d.g.removeFromParent(); drops.splice(drops.indexOf(d), 1); }
    }
    if (phase !== 'uplink') tag.hidden = true;
    if (phase === 'uplink') {
      const near = nearBooth(); if (near && session.phase === 'fighting') uplinkLeft -= step;
      tag.hidden = false; tag.classList.toggle('out', !near);
      tag.innerHTML = `STARK UPLINK<b>${Math.max(0, Math.ceil(uplinkLeft))}</b>${near ? 'HOLD THE TERMINAL' : 'GET BACK TO THE TERMINAL'}`;
      if (uplinkLeft <= 0) { phase = 'online'; tag.hidden = true; api.announce?.('ARMORS ONLINE', 'STARK.EXE', 5); beep(); armor.voice('suit_up_first'); }
    }
    if (delivery && now() >= delivery.at) {
      const s = delivery.suit; delivery.beam.removeFromParent(); delivery.beam.geometry.dispose(); delivery.beam.material.dispose(); delivery = null;
      if (!armor.worn() && !['reviving', 'gameover'].includes(session.phase)) armor.putOn(s);
    } else if (delivery) delivery.beam.material.opacity = .15 + .2 * Math.abs(Math.sin(now() * 8));
  });
  host.on('reset', () => {
    phase = 'offline'; cores = 0; uplinkLeft = UPLINK; tag.hidden = true;
    for (const d of drops) d.g.removeFromParent(); drops.length = 0;
    if (delivery) { delivery.beam.removeFromParent(); delivery = null; }
    for (const s of suits) s.owned = false;
  });

  // ---- the app's interface --------------------------------------------------------------------------------------------
  function status() {
    const r = rewards(), worn = armor.worn();
    return { unlocked: !!r.stark, power: !!session.power, phase, cores, coresNeeded: CORES, uplinkLeft: Math.ceil(uplinkLeft), uplink: UPLINK, points: session.points,
      wins: r.ccWins ?? 0, winsNeeded: WINS_FOR_MK16, delivering: !!delivery,
      req: { stark: !!r.stark, stark_wm: !!r.stark_wm, stark_mk16: !!r.stark_mk16 },
      // by Mark number (I, III, IV, V, VI, XVI), War Machine last: SUITS lists them in unlock order, which read as random
      suits: [...suits].sort((a, b) => (+a.id.slice(2) || 99) - (+b.id.slice(2) || 99)).map(s => ({ id: s.id, name: s.name, cost: s.cost, hp: s.hp, speed: s.speed, weapons: s.weapons.map(w => data.weapons[w]?.name ?? w),
        unlocked: !!r[need(s.id)], owned: s.owned, worn: worn === s, power: Math.floor(s.power), ready: s.power > READY })) };
  }
  function act(action, id) {
    const r = rewards();
    if (!r.stark) return 'Stark Industries credentials required';
    if (!session.power) return 'Restore the power first';
    if (action === 'start') { if (phase !== 'offline') return 'Already running'; phase = 'cores'; api.toast?.(`Recover ${CORES} armor cores from the undead`, 5); return true; }
    if (action === 'upload') { if (phase !== 'upload') return 'Recover the cores first'; phase = 'uplink'; uplinkLeft = UPLINK; api.announce?.('UPLINK STARTED', 'HOLD THE TERMINAL', 4); return true; }
    const s = suitOf(id); if (!s) return 'Unknown armor';
    if (phase !== 'online') return 'The armors are offline';
    if (!r[need(s.id)]) return 'Locked';
    if (action === 'buy') { if (s.owned) return 'Already owned'; if (!session.spend(s.cost)) return 'Not enough points'; s.owned = true; beep(); return true; }
    if (action === 'deploy') {
      if (!s.owned) return 'Buy it first'; if (armor.worn()) return 'You are already wearing an armor'; if (delivery) return 'An armor is on its way';
      if (s.power <= READY) return `Still charging · ${Math.floor(s.power)}%`;
      const at = player.getFeetPosition(); delivery = { suit: s, at: now() + DELIVERY, beam: beam(at) }; sound?.('suit_up_quick', { volume: .6 }); return true;
    }
    if (action === 'recall') { if (armor.worn() !== s) return 'Not wearing it'; armor.takeOff(s, `${s.name} armor recalled`); return true; }
    return 'Unknown action';
  }
  window.kino.stark = { status, act, get phase() { return phase; }, set phase(v) { phase = v; }, get cores() { return cores; }, set cores(v) { cores = v; } };   // setters: for tests
}
