// BO3's rocket shield, on every map (moved out of Der Eisendrache's craftables, 2026-10-17, so the Armory can sell it
// elsewhere). Der Eisendrache builds it from parts; other maps buy it at a terminal's ARMORY.EXE (mods/armory).
// H raises it (Settings: "Rocket shield"), H again lowers it. Raised it's a ViewWeapon of BO3's rocket shield on
// Dempsey's arms (gun put away like an operator weapon); left mouse bashes (the 2 nearest zombies in front: kills up to 2500 health,
// the rest are knocked back), right mouse fires its rockets (a charge: a 0.55 s dash that kills everything in the way,
// 3 charges). Charges come back from nitrous tanks where the map has them (setTanks: Der Eisendrache), otherwise one a
// round. It takes zombie hits from the front while raised and from behind while on your back (1500 health; the
// dmg1/dmg2 looks at 2/3 and 1/3), then breaks. A Carpenter repairs it.
// window.kino.rocketShield: {give(), raise(), lower(), state(), setTanks(objects, onEmpty), hitting, owned}
//   hitting is true while the shield's own bash/dash damage is applied (the Armory counts its kills with it).
// A map's own shield uses this code through give(alt, health): same raise, bash, blocking, repairs and HUD, one shield at a
// time, but alt.def's model and clips, and right mouse calls alt.plant() instead of the rockets (no charges). See
// mods/nuketown/shield.js. alt: {def, name, label, hint, plant(), broke()}. `owned` is the Rocket Shield itself; state().owned either.
import * as THREE from 'three';
import { ViewWeapon, loadModel } from '../../animation.js';
import { disposeSkeletons } from '../../runtime-assets.js';
import { binds } from '../../settings.js';

const SHIELD_MAX = 1500, CHARGES = 3;

export function setupRocketShield(api) {
  const { session, host, player, camera, enemies, audio, toast, announce, data, viewScene, view } = api;
  const at = o => o.getWorldPosition(new THREE.Vector3());
  let DEF = null, tanks = [], brokeHint = 'Buy another at a terminal\'s ARMORY';
  fetch(new URL('../bo3-weapons/weapons.json', import.meta.url)).then(r => r.ok ? r.json() : null).then(j => {
    DEF = j?.operator?.rocketShield ?? null; if (DEF) for (const u of [DEF.model, ...(DEF.worn ?? [])]) loadModel(u).catch(() => {});
  }).catch(() => {});
  const sh = { owned: false, health: SHIELD_MAX, charges: CHARGES, raised: false, vw: null, look: 0, bash: null, dash: null };
  let hitting = false;
  const hurt = (...a) => { hitting = !sh.alt; try { enemies.hurt(...a); } finally { hitting = false; } };
  // perk hooks (perks-plus reaper-perks.js sets .perk: Victorious Tortoise blocks from every side, doubles the
  // health when upgraded and blows up when the shield breaks; Crusader's Ale repairs it with heal())
  const hooks = { perk: null };
  const MAX = () => SHIELD_MAX * (hooks.perk?.maxMul?.() ?? 1);
  const look = () => sh.health > MAX() * 2 / 3 ? 0 : sh.health > MAX() / 3 ? 1 : 2;
  const def = () => sh.alt?.def ?? DEF;
  const modelFor = k => k ? def().worn?.[k - 1] ?? def().model : def().model;
  const relook = () => { const k = look(); if (!sh.raised || k === sh.look) return; const same = modelFor(k) === modelFor(sh.look); sh.look = k; if (!same) equip(); };
  function reset() { if (sh.raised) lower(); sh.owned = false; sh.alt = null; sh.health = MAX(); sh.charges = CHARGES; hud(); for (const c of tanks) c.visible = false; }
  function give(alt = null, health = null) {
    if (sh.raised) lower();
    sh.owned = true; sh.alt = alt; sh.health = health ?? MAX(); sh.charges = CHARGES; audio?.play?.('buy', .6);
    const key = (binds().shield ?? 'KeyH').replace(/^Key/, '');
    toast?.(alt ? `${alt.name} · ${key} to raise, then right mouse to plant it` : `Rocket Shield · ${key} to raise`, 3); if (!alt) for (const c of tanks) c.visible = true; hud();
  }
  // a planted shield leaves your hands and keeps its health
  function take() { if (sh.raised) lower(); sh.owned = false; const hp = sh.health; sh.alt = null; hud(); return hp; }
  function raise() {
    if (!sh.owned) { if (tanks.length) toast?.('No shield', 1.2); return; }   // only Der Eisendrache hints (H is Moon's hacker key)
    if (host.gunBlocked || session.busy || session.phase === 'reviving' || !def() || !viewScene) return;
    sh.raised = true; host.gunBlocked = true; sh.look = look(); equip();
    padFire = !!view?.input?.fire; padAim = !!view?.input?.ads;
  }
  function equip() {
    const old = sh.vw; sh.vw = new ViewWeapon(viewScene, data, () => {});
    const vw = sh.vw; vw.equip({ ...def(), id: def().id + '_' + sh.look, model: modelFor(sh.look) }).then(() => {
      if (sh.vw !== vw) { drop(vw); return; } if (old) drop(old);
      // the window: raised, the shield fills the view and you look through it (its glass would draw solid grey). The worn
      // looks (dmg1/dmg2) swap the glass for BO3's damage decals: a plain broken pane (no texture: faint like the glass)
      // and the shatter cracks, whose texture carries them in its alpha (user, 2026-10-18: a cracked shield was opaque)
      vw.root.traverse(o => { for (const m of [o.material].flat()) {
        if (m && /rocket_shield_glass|zmb_shield_glass|glass_broken_transparent/.test(m.name)) { m.transparent = true; m.opacity = .12; m.depthWrite = false; }
        else if (m && /glass_shatter/.test(m.name)) { m.transparent = true; m.opacity = .85; m.depthWrite = false; }
      } });
    }).catch(e => { console.warn('[rocket-shield] model', e); });
  }
  function drop(vw) { if (!vw) return; vw.pivot.removeFromParent(); if (vw.root) disposeSkeletons(vw.root); }
  function lower() {
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
    if (sh.alt) { sh.alt.plant(); return; }
    if (sh.charges < 1) { toast?.(tanks.length ? 'No rocket charges · find nitrous tanks' : 'No rocket charges · one returns each round', 1.6); return; }
    sh.charges--; hud(); play('boostInAnim');
    const d = camera.getWorldDirection(new THREE.Vector3()); d.y = 0; d.normalize();
    sh.dash = { t: 0, dir: d, hit: new Set() }; audio?.play?.('explosion', .5);
  }
  const BASH_MAX = 2, BASH_RANGE = 90, BASH_COS = .7;   // the bash: at most 2 zombies, within 90 and ~45 degrees of straight ahead
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
    if (!sh.raised || !api.getState().active || host.keepActive || (e.button !== 0 && e.button !== 2)) return;   // keepActive: the terminal's clicks
    e.stopImmediatePropagation(); if (e.button === 0) bash(); else boost();
  }, true);
  addEventListener('mouseup', e => { if (sh.raised && !host.keepActive && (e.button === 0 || e.button === 2)) e.stopImmediatePropagation(); }, true);
  let padFire = false, padAim = false;

  // hits: a zombie in front (raised) or behind (on your back) hits the shield instead
  function attacker() { const f = camera.position; return enemies.list.filter(z => z.state === 'attack' && z.root.position.distanceTo(f) < 150).sort((a, b) => a.root.position.distanceTo(f) - b.root.position.distanceTo(f))[0]; }
  host.on('beforeDamage', e => {
    if (!sh.owned || !(e.amount > 0)) return;
    const z = attacker(); if (!z) return;
    const to = z.root.position.clone().sub(camera.position); to.y = 0; to.normalize(); const dot = to.dot(fwd());
    if (!(sh.raised ? (dot > .3 || !!hooks.perk?.allSides?.()) : dot < -.3)) return;
    sh.health -= e.amount; e.amount = 0; e.shielded = true;   // the hud mod points a grey damage arc at the attacker and plays a thump
    if (sh.health <= 0) { try { hooks.perk?.broke?.(player.getFeetPosition()); } catch (err) { console.warn('[rocket-shield]', err); } lower(); sh.owned = false; sh.health = 0; const alt = sh.alt; sh.alt = null; alt?.broke?.(); announce?.(alt?.label ?? 'ROCKET SHIELD', 'DESTROYED', 2); toast?.(alt?.hint ?? brokeHint, 2.5); if (!alt) for (const c of tanks) c.visible = false; }
    else relook();
    hud();
  });
  // a Carpenter repairs the shield fully, as it does the boards (user, 2026-10-18)
  const powerups = api.powerups;
  if (powerups?.onCollect) {
    const collect = powerups.onCollect;
    powerups.onCollect = (type, at) => {
      const r = collect(type, at);
      if (type === 'carpenter' && sh.owned && sh.health < MAX()) { sh.health = MAX(); relook(); hud(); toast?.(`${sh.alt?.name ?? 'Rocket shield'} repaired`, 1.6); }
      return r;
    };
  }
  // nitrous tanks are back each round; maps without them give a charge back instead
  host.on('roundEnd', () => {
    if (!sh.owned || sh.alt) return;
    if (tanks.length) for (const c of tanks) c.visible = true;
    else if (sh.charges < CHARGES) { sh.charges++; hud(); }
  });

  host.on('update', dt => {
    if (!dt) return;
    if (sh.owned && !sh.alt && sh.charges < CHARGES && tanks.length) {   // nitrous tanks: walk into one
      const f = player.getFeetPosition();
      for (const c of tanks) if (c.visible && at(c).distanceTo(f) < 70) { c.visible = false; sh.charges++; audio?.play?.('buy', .4); toast?.(`Rocket charge · ${sh.charges}/${CHARGES}`, 1.5); hud(); if (sh.charges >= CHARGES) break; }
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
        // the two nearest zombies in a narrower cone (user, 2026-10-18: it hit too many; was every zombie within 95 and ~63 degrees)
        const f = player.getFeetPosition(), struck = enemies.list.filter(z => inFront(z.root.position, BASH_RANGE, BASH_COS))
          .sort((a, b) => a.root.position.distanceTo(f) - b.root.position.distanceTo(f)).slice(0, BASH_MAX);
        for (const z of struck) {
          const p = z.root.position;
          if (z.kind === 'panzer') { hurt(z, 500, false, true, 'melee'); continue; }
          if (z.health <= 2500) { hurt(z, 1e9, false, true, 'melee'); continue; }
          hurt(z, 2500, false, true, 'melee'); const v = p.clone().sub(player.getFeetPosition()); v.y = 0; p.addScaledVector(v.normalize(), 50);
        }
      }
      if (sh.bash.t > (def()?.durations?.meleeAnim ?? .7)) sh.bash = null;
    }
    if (sh.dash) {
      const d = sh.dash; d.t += dt;
      if (d.t < .55) {
        const sp = 950; player.velocity.x = d.dir.x * sp; player.velocity.z = d.dir.z * sp;
        const f = player.getFeetPosition();
        for (const z of [...enemies.list]) {
          if (d.hit.has(z)) continue; const p = z.root.position; if (Math.hypot(p.x - f.x, p.z - f.z) > 75 || Math.abs(p.y - f.y) > 100) continue;
          d.hit.add(z); hurt(z, z.kind === 'panzer' ? 2000 : 1e9, false, false, 'explosion');
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
    el.classList.toggle('on', sh.owned); el.classList.toggle('up', sh.raised); el.classList.toggle('low', sh.health < MAX() / 3);
    el.querySelector('.hp i').style.width = Math.round(Math.max(0, sh.health) / MAX() * 100) + '%';
    el.querySelector('.ch').innerHTML = Array.from({ length: sh.alt ? 0 : CHARGES }, (_, i) => `<b class="${i < sh.charges ? 'on' : ''}"></b>`).join('');
    el.querySelector('kbd').textContent = (binds().shield ?? 'KeyH').replace(/^Key/, '');
  }
  setTimeout(hud, 800);

  return {
    give, take, raise, lower, reset,
    heal(n) { if (!sh.owned) return; sh.health = Math.min(MAX(), sh.health + n); relook(); hud(); },
    get perk() { return hooks.perk; }, set perk(p) { hooks.perk = p; },
    state: () => ({ owned: sh.owned, alt: sh.alt, max: MAX(), health: Math.round(sh.health), charges: sh.charges, raised: sh.raised, ready: !!sh.vw?.ready }),
    // a map's nitrous tanks (hidden map objects, shown while the shield is owned) and what to say when it breaks
    setTanks(list, hint) { tanks = list ?? []; if (hint) brokeHint = hint; for (const c of tanks) c.visible = sh.owned; },
    get owned() { return sh.owned && !sh.alt; }, get hitting() { return hitting; },
  };
}
