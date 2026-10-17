// Der Eisendrache's craftables (zm_castle_craftables.gsc) and the rocket shield. Parts are the builder's
// CASTLE_PART_<craftable>_<part>_<k> models (every candidate spot, hidden); benches CASTLE_BENCH_spike (the undercroft
// table) and CASTLE_BENCH_open_<k> (the three open workbenches); the shield's recharges CASTLE_SHIELDCHARGE_<k>.
//   Ragnarok DG-4 (gravityspike): built at its own table, then taken as the operator weapon (mods/operator-weapons),
//   charged. Its parts come as in BO3:
//     body   - dropped where the first Panzersoldat dies (zm_castle_mechz.gsc notifies its death origin)
//     handle - falls from the Tesla coils when the Death Ray has finished a run (one of its two spots, onto the floor)
//     guards - during a rocket test fire, the wall switch at the rocket pad (spike_quest_wall_switch) arms the
//              console at the landing pad (spike_quest_console_switch, where BO3 lights its lamps one by one) for
//              20 s; its lever drops the guards beside it
//   Rocket shield: three parts, one random spot each (the eagle, the window, the fuel tank); built at any open bench,
//   taken there again for free if it breaks.
// The shield: H raises it (Settings: "Rocket shield"), H again lowers it. Raised it's a ViewWeapon of BO3's
// rocket shield on Dempsey's arms (gun put away like an operator weapon); left mouse bashes (kills what's in front up
// to 2500 health, the rest are knocked back), right mouse fires its rockets (a charge: a 0.55 s dash that kills
// everything in the way, 3 charges, nitrous tanks around the castle give them back). It takes zombie hits from the
// front while raised and from behind while on your back (1500 health; the dmg1/dmg2 looks at 2/3 and 1/3), then breaks.
import * as THREE from 'three';
import { ViewWeapon, loadModel } from '../../animation.js';
import { disposeSkeletons } from '../../runtime-assets.js';
import { binds } from '../../settings.js';

const SHIELD_MAX = 1500, CHARGES = 3;
const CRAFT = {
  spike: { name: 'Ragnarok DG-4', parts: ['body', 'guards', 'handle'], label: { body: 'the spikes', guards: 'the guards', handle: 'the handle' } },
  shield: { name: 'Rocket Shield', parts: ['dolly', 'clamp', 'door'], label: { dolly: 'the eagle', clamp: 'the window', door: 'the fuel tank' } },
};

export function setupCraftables(api, { traps }) {
  const { world, session, host, player, camera, enemies, audio, toast, announce, data, viewScene, view, sync } = api;
  const root = world.root, kino = window.kino;
  const at = o => o.getWorldPosition(new THREE.Vector3());
  // a map node moved or shown at runtime (the static map's matrices are frozen: update them by hand)
  const moveTo = (o, p) => { o.parent.updateMatrixWorld(true); o.position.copy(o.parent.worldToLocal(p.clone())); o.updateMatrixWorld(true); };
  const spots = {}; root.traverse(o => { const m = /^CASTLE_PART_(spike|shield)_([a-z]+)_(\d+)$/.exec(o.name); if (m) (spots[m[1] + ':' + m[2]] ??= []).push(o); });
  const places = new Map(), homes = new Map(); for (const list of Object.values(spots)) for (const o of list) homes.set(o, o.position.clone());
  const benchSpike = root.getObjectByName('CASTLE_BENCH_spike'), benches = []; root.traverse(o => { if (/^CASTLE_BENCH_open_\d+$/.test(o.name)) benches.push(o); });
  const charges = []; root.traverse(o => { if (/^CASTLE_SHIELDCHARGE_\d+$/.test(o.name)) charges.push(o); });
  if (!benchSpike && !benches.length) { console.warn('[der-eisendrache] craftables missing (rebuild the map)'); return null; }

  const st = { have: { spike: new Set(), shield: new Set() }, built: { spike: false, shield: null }, shown: new Map(), firstPanzer: false, armed: 0, rayWas: false };
  function show(cr, part, o, p) {   // a part lies at `o` (moved to `p` if given) for the taking
    for (const x of spots[cr + ':' + part] ?? []) x.visible = false;
    if (p) moveTo(o, p); places.get(o)?.copy(at(o)); o.visible = true; o.updateMatrixWorld(true); st.shown.set(cr + ':' + part, o);
  }
  function reset() {
    for (const [o, h] of homes) { o.visible = false; o.position.copy(h); o.updateMatrixWorld(true); places.get(o)?.copy(at(o)); }
    st.have.spike.clear(); st.have.shield.clear(); st.built.spike = false; st.built.shield = null; st.shown.clear(); st.firstPanzer = false; st.armed = 0;
    if (sync.isHost) { const pick = {}; for (const part of CRAFT.shield.parts) { const n = spots['shield:' + part]?.length ?? 0; if (n) pick[part] = Math.floor(Math.random() * n); } sync.act('craftSpots', pick); }   // the host picks the shield parts' spots
    shieldReset();
  }
  // ---- the team's events ---------------------------------------------------------------------------------------------
  sync.on('craftSpots', d => { for (const [part, k] of Object.entries(d)) { const o = spots['shield:' + part]?.[k]; if (o) show('shield', part, o); } });
  sync.on('partPick', (d, ctx) => { const o = st.shown.get(d.key); if (!o) return; const [cr, part] = d.key.split(':'); o.visible = false; st.shown.delete(d.key); st.have[cr].add(part); if (ctx.mine) audio?.play?.('buy', .5); toast?.(`${CRAFT[cr].name} part · ${st.have[cr].size}/${CRAFT[cr].parts.length}`, 2.5); });
  sync.on('partDrop', d => { const o = spots[d.key]?.[d.k]; if (!o || st.shown.has(d.key)) return; const [cr, part] = d.key.split(':'); show(cr, part, o, d.p ? sync.v(d.p) : null); if (d.msg) toast?.(d.msg, 3); });
  sync.on('build', (d, ctx) => {
    if (d.cr === 'spike') { if (st.built.spike) return; st.built.spike = true; announce?.('RAGNAROK DG-4', 'BUILT', 2.5); }
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
      position: pos, hidden: () => !(o.visible && st.shown.get(key) === o),
      text: () => `Pick up ${CRAFT[cr].label[part]}`,
      use() {
        if (!o.visible || st.shown.get(key) !== o) return false;
        sync.act('partPick', { key }); return true;
      },
    });
  }
  if (benchSpike) world.addInteraction({
    position: at(benchSpike),
    text: () => st.built.spike ? (kino.operator?.current === 'ragnarok' ? '' : 'Take the Ragnarok DG-4')
      : st.have.spike.size === 3 ? 'Build the Ragnarok DG-4' : `Ragnarok DG-4 · ${st.have.spike.size}/3 parts`,
    use() {
      if (!st.built.spike) { if (st.have.spike.size < 3) return false; sync.act('build', { cr: 'spike' }); return true; }
      if (kino.operator?.current === 'ragnarok' || !kino.operator) return false;
      kino.operator.give('ragnarok', { full: true }); return true;
    },
  });
  for (const b of benches) world.addInteraction({
    position: at(b),
    text: () => st.built.shield ? (st.built.shield === b && !sh.owned ? 'Take the Rocket Shield' : '')
      : st.have.shield.size === 3 ? 'Build the Rocket Shield' : `Rocket Shield · ${st.have.shield.size}/3 parts`,
    use() {
      if (!st.built.shield) { if (st.have.shield.size < 3) return false; sync.act('build', { cr: 'shield', bench: benches.indexOf(b) }); return true; }
      if (st.built.shield !== b || sh.owned) return false;
      takeShield(); return true;
    },
  });

  // ---- where the Ragnarok's parts come from -----------------------------------------------------------------------
  host.on('kill', ({ enemy }) => {   // body: the first Panzersoldat to die drops it (the host's kills)
    if (!sync.isHost || enemy?.kind !== 'panzer' || st.firstPanzer || st.built.spike || st.have.spike.has('body')) return;
    st.firstPanzer = true; if (!spots['spike:body']?.[0]) return;
    const p = enemy.root.position.clone(); const q = world.closest?.(p, { x: 80, y: 160, z: 80 }) ?? p;
    sync.act('partDrop', { key: 'spike:body', k: 0, p: sync.a(q.clone().add(new THREE.Vector3(0, 6, 0))), msg: 'The Panzersoldat dropped something' });
  });
  const down = new THREE.Vector3(0, -1, 0);
  function handleDrop() {   // handle: falls from one of the coils onto the floor below (the host picks which)
    const list = spots['spike:handle'] ?? []; if (!list.length || !sync.isHost) return;
    const k = Math.floor(Math.random() * list.length), o = list[k], from = homes.get(o).clone(); o.parent.updateMatrixWorld(true); o.parent.localToWorld(from);
    const hit = world.raycast?.(new THREE.Ray(from.clone(), down), 0, 4000);
    sync.act('partDrop', { key: 'spike:handle', k, p: sync.a(hit ? from.clone().addScaledVector(down, hit.distance - 6) : from), msg: 'Something fell from the Tesla coils' });
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

  // ---- the rocket shield -----------------------------------------------------------------------------------------------
  let DEF = null;
  fetch(new URL('../bo3-weapons/weapons.json', import.meta.url)).then(r => r.ok ? r.json() : null).then(j => {
    DEF = j?.operator?.rocketShield ?? null; if (DEF) for (const u of [DEF.model, ...(DEF.worn ?? [])]) loadModel(u).catch(() => {});
  }).catch(() => {});
  const sh = { owned: false, health: SHIELD_MAX, charges: CHARGES, raised: false, vw: null, look: 0, bash: null, dash: null };
  const look = () => sh.health > SHIELD_MAX * 2 / 3 ? 0 : sh.health > SHIELD_MAX / 3 ? 1 : 2;
  const modelFor = k => k ? DEF.worn?.[k - 1] ?? DEF.model : DEF.model;
  function shieldReset() { if (sh.raised) lower(true); sh.owned = false; sh.health = SHIELD_MAX; sh.charges = CHARGES; hud(); for (const c of charges) c.visible = false; }
  function takeShield() {
    sh.owned = true; sh.health = SHIELD_MAX; sh.charges = CHARGES; audio?.play?.('buy', .6);
    toast?.(`Rocket Shield · ${(binds().shield ?? 'KeyH').replace(/^Key/, '')} to raise`, 3); for (const c of charges) c.visible = true; hud();
  }
  function raise() {
    if (!sh.owned) { toast?.('No shield', 1.2); return; }
    if (host.gunBlocked || session.busy || session.phase === 'reviving' || !DEF || !viewScene) return;
    sh.raised = true; host.gunBlocked = true; sh.look = look(); equip();
    padFire = !!view?.input?.fire; padAim = !!view?.input?.ads;
  }
  function equip() {
    const old = sh.vw; sh.vw = new ViewWeapon(viewScene, data, () => {});
    const vw = sh.vw; vw.equip({ ...DEF, id: 'rocket_shield_' + sh.look, model: modelFor(sh.look) }).then(() => {
      if (sh.vw !== vw) { drop(vw); return; } if (old) drop(old);
      // the window: raised, the shield fills the view and you look through it (its glass would draw solid grey)
      vw.root.traverse(o => { for (const m of [o.material].flat()) if (m && /rocket_shield_glass/.test(m.name)) { m.transparent = true; m.opacity = .12; m.depthWrite = false; } });
    }).catch(e => { console.warn('[der-eisendrache] shield model', e); });
  }
  function drop(vw) { if (!vw) return; vw.pivot.removeFromParent(); if (vw.root) disposeSkeletons(vw.root); }
  function lower(now = false) {
    if (!sh.raised) return; sh.raised = false; host.gunBlocked = false; sh.bash = sh.dash = null;
    drop(sh.vw); sh.vw = null;
  }
  const play = (key, mode = 'fire') => { const vw = sh.vw; if (!vw?.ready || !vw.rig.actions[key]) return false; vw.mode = mode; vw.rig.play(key, false, 1, .04); return true; };
  function bash() {
    if (sh.bash || sh.dash) return;
    play('meleeAnim'); sh.bash = { t: 0, hit: false };
  }
  function boost() {
    if (sh.bash || sh.dash) return;
    if (sh.charges < 1) { toast?.('No rocket charges · find nitrous tanks', 1.6); return; }
    sh.charges--; hud(); play('boostInAnim');
    const d = camera.getWorldDirection(new THREE.Vector3()); d.y = 0; d.normalize();
    sh.dash = { t: 0, dir: d, hit: new Set() }; audio?.play?.('explosion', .5);
  }
  const fwd = () => { const d = camera.getWorldDirection(new THREE.Vector3()); d.y = 0; return d.normalize(); };
  function inFront(p, range, cos) {
    const f = player.getFeetPosition(), v = p.clone().sub(f); v.y = 0; const d = v.length();
    return d < range && (d < 1 || v.divideScalar(d).dot(fwd()) > cos) && Math.abs(p.y - f.y) < 100;
  }

  // input: H, and the mouse buttons (or touch/pad fire and aim) while it's up
  addEventListener('keydown', e => { if (e.code !== 'KeyH' || e.repeat || !api.getState().active) return; if (sh.raised) lower(); else raise(); });   // game-menu re-sends a rebound key as KeyH
  const BLOCK = new Set(['KeyR', 'KeyV', 'KeyG', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyX', 'KeyQ', 'KeyY']);
  addEventListener('keydown', e => { if (sh.raised && api.getState().active && BLOCK.has(e.code)) e.stopImmediatePropagation(); }, true);
  addEventListener('mousedown', e => {
    if (!sh.raised || !api.getState().active || (e.button !== 0 && e.button !== 2)) return;
    e.stopImmediatePropagation(); if (e.button === 0) bash(); else boost();
  }, true);
  addEventListener('mouseup', e => { if (sh.raised && (e.button === 0 || e.button === 2)) e.stopImmediatePropagation(); }, true);
  let padFire = false, padAim = false;

  // hits: a zombie in front (raised) or behind (on your back) hits the shield instead
  function attacker() { const f = camera.position; return enemies.list.filter(z => z.state === 'attack' && z.root.position.distanceTo(f) < 150).sort((a, b) => a.root.position.distanceTo(f) - b.root.position.distanceTo(f))[0]; }
  host.on('beforeDamage', e => {
    if (!sh.owned || !(e.amount > 0)) return;
    const z = attacker(); if (!z) return;
    const to = z.root.position.clone().sub(camera.position); to.y = 0; to.normalize(); const dot = to.dot(fwd());
    if (!(sh.raised ? dot > .3 : dot < -.3)) return;
    sh.health -= e.amount; e.amount = 0; audio?.play?.('hit', .4);
    if (sh.health <= 0) { lower(); sh.owned = false; sh.health = 0; announce?.('ROCKET SHIELD', 'DESTROYED', 2); toast?.('Build bench: take another', 2.5); for (const c of charges) c.visible = false; }
    else if (sh.raised && look() !== sh.look) { sh.look = look(); equip(); }
    hud();
  });
  host.on('roundEnd', () => { if (sh.owned) for (const c of charges) c.visible = true; });   // the nitrous tanks are back each round

  host.on('update', dt => {
    if (!dt) return;
    // the Death Ray finishing a run drops the handle (once, while the Ragnarok isn't built)
    const rayOn = !!traps?.state().ray.on;
    if (st.rayWas && !rayOn && !st.built.spike && !st.have.spike.has('handle') && !st.shown.has('spike:handle')) handleDrop();
    st.rayWas = rayOn;
    if (sh.owned && sh.charges < CHARGES) {   // nitrous tanks: walk into one
      const f = player.getFeetPosition();
      for (const c of charges) if (c.visible && at(c).distanceTo(f) < 70) { c.visible = false; sh.charges++; audio?.play?.('buy', .4); toast?.(`Rocket charge · ${sh.charges}/${CHARGES}`, 1.5); hud(); if (sh.charges >= CHARGES) break; }
    }
    if (!sh.raised) return;
    if (session.phase === 'reviving' || session.health <= 0) { lower(); return; }
    if (view?.pivot) view.pivot.visible = false;
    const vw = sh.vw;
    const fire = !!view?.input?.fire, aim = !!view?.input?.ads;
    if (fire !== padFire) { padFire = fire; if (fire) bash(); }
    if (aim !== padAim) { padAim = aim; if (aim) boost(); }
    if (vw?.ready) vw.update(dt, { moving: player.velocity.length() > 20, sprint: !!view?.input?.sprint && !sh.dash, ads: false, time: session.time });
    if (sh.bash) {
      sh.bash.t += dt;
      if (sh.bash.t > .22 && !sh.bash.hit) {
        sh.bash.hit = true; audio?.play?.('hit', .6);
        for (const z of [...enemies.list]) {
          const p = z.root.position; if (!inFront(p, 95, .45)) continue;
          if (z.kind === 'panzer') { enemies.hurt(z, 500, false, true, 'melee'); continue; }
          if (z.health <= 2500) { enemies.hurt(z, 1e9, false, true, 'melee'); continue; }
          enemies.hurt(z, 2500, false, true, 'melee'); const v = p.clone().sub(player.getFeetPosition()); v.y = 0; p.addScaledVector(v.normalize(), 50);
        }
      }
      if (sh.bash.t > (DEF?.durations?.meleeAnim ?? .7)) sh.bash = null;
    }
    if (sh.dash) {
      const d = sh.dash; d.t += dt;
      if (d.t < .55) {
        const sp = 950; player.velocity.x = d.dir.x * sp; player.velocity.z = d.dir.z * sp;
        const f = player.getFeetPosition();
        for (const z of [...enemies.list]) {
          if (d.hit.has(z)) continue; const p = z.root.position; if (Math.hypot(p.x - f.x, p.z - f.z) > 75 || Math.abs(p.y - f.y) > 100) continue;
          d.hit.add(z); enemies.hurt(z, z.kind === 'panzer' ? 2000 : 1e9, false, false, 'explosion');
        }
      } else if (!d.out) { d.out = true; player.velocity.x *= .2; player.velocity.z *= .2; play('boostOutAnim'); }
      if (d.t > .55 + (DEF?.durations?.boostOutAnim ?? .5)) sh.dash = null;
    }
  });
  host.on('reset', reset);

  // ---- HUD: the shield's health and rocket charges (BO7 HUD: the player card's free slot) --------------------------
  const style = document.createElement('style'); style.textContent = `
    #shield-hud{display:none;align-items:center;gap:6px;pointer-events:none;font:700 11px/1 Arial,sans-serif;color:#e8e2d6;text-shadow:0 1px 2px #000}
    #shield-hud.on{display:flex}#shield-hud.free{position:fixed;left:28px;bottom:150px;z-index:3}
    #shield-hud svg{width:24px;height:24px}#shield-hud .hp{width:46px;height:5px;background:#0009;border:1px solid #ffffff40}
    #shield-hud .hp i{display:block;height:100%;background:#d8c9a0}#shield-hud.low .hp i{background:#e0503a}
    #shield-hud .ch{display:flex;gap:2px}#shield-hud .ch b{width:5px;height:11px;background:#ffffff26;border-radius:1px}#shield-hud .ch b.on{background:#ff9a3a;box-shadow:0 0 4px #ff9a3a}
    #shield-hud kbd{font:600 9px/1 Arial,sans-serif;padding:1px 3px;border:1px solid #ffffff80;border-radius:2px;background:#000a}
    #shield-hud.up svg{filter:drop-shadow(0 0 4px #ffd27a)}body.menu-open #shield-hud{visibility:hidden}`;
  document.head.append(style);
  const el = document.createElement('div'); el.id = 'shield-hud'; el.className = 'free';
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/></svg><span class="hp"><i></i></span><span class="ch"></span><kbd></kbd>`;
  document.body.append(el);
  function hud() {
    const slot = document.querySelector('#bo7-left .extra'); if (slot && el.parentNode !== slot) { slot.append(el); el.classList.remove('free'); }
    el.classList.toggle('on', sh.owned); el.classList.toggle('up', sh.raised); el.classList.toggle('low', sh.health < SHIELD_MAX / 3);
    el.querySelector('.hp i').style.width = Math.round(Math.max(0, sh.health) / SHIELD_MAX * 100) + '%';
    el.querySelector('.ch').innerHTML = Array.from({ length: CHARGES }, (_, i) => `<b class="${i < sh.charges ? 'on' : ''}"></b>`).join('');
    el.querySelector('kbd').textContent = (binds().shield ?? 'KeyH').replace(/^Key/, '');
  }
  setTimeout(hud, 800);
  reset();

  return {
    state: () => ({ have: { spike: [...st.have.spike], shield: [...st.have.shield] }, built: { spike: st.built.spike, shield: !!st.built.shield }, shown: [...st.shown.keys()],
      armed: Math.max(0, Math.round(st.armed - session.time)), shield: { owned: sh.owned, health: Math.round(sh.health), charges: sh.charges, raised: sh.raised, ready: !!sh.vw?.ready } }),
    give(cr) { for (const p of CRAFT[cr]?.parts ?? []) st.have[cr].add(p); for (const k of [...st.shown.keys()]) if (k.startsWith(cr + ':')) { st.shown.get(k).visible = false; st.shown.delete(k); } },   // testing: every part of a craftable
    takeShield, raise, lower, handleDrop,
  };
}
