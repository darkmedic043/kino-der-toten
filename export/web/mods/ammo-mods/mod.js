// Ammo Mods (Cold War / Black Ops 6 / Black Ops 7 style, fork). One per weapon, bought for the gun in hand at a terminal's
// ARSENAL app once the power is on (terminal-booth): apply PRICE.apply (tier I), then upgrade to II and III; swapping to a
// different mod costs the apply price again and starts at tier I. The mod lives on the weapon object (session.weapon
// .ammoMod {id, tier}), so it survives Pack-a-Punch (same object) and goes with the gun if it's swapped out.
//
// Each bullet/projectile hit by the player rolls PROC[tier]; a proc starts the mod's effect on that zombie, then the gun
// waits COOLDOWN[id] before it can proc again. Damage is a share of the zombie's max health, so mods keep up with the
// rounds (cause 'ammo_mod': no weapon XP, no recursion).
//   Cryo Freeze    I: slowed 40% for 4 s; II: 55% for 5 s and takes +15% damage; III: frozen solid 3 s (+25% damage), then slowed
//   Napalm Burst   burns for 3 s for 30/45/60% of max health; III: the fire spreads to a zombie within 120 each second
//   Dead Wire      arcs from the zombie to 2/4/6 more within 250 (line of sight): 20/25/30% damage each and a 1.2/1.6/2 s stun
//   Shatter Blast  an explosion at the zombie: radius 110/150/190, 60/80/100% of a round's zombie health at the centre
//   Brain Rot      the zombie turns for 6/9/12 s: it goes for the nearest zombie and hits it (25% of its max health a second)
//                  and leaves the player alone; II: zombies within 300 go for it; III: it explodes when it expires
// Status effects (slow, stun, Brain Rot) steer zombies through enemies.speed / enemies.lureTarget, which only the host
// simulates in co-op; a guest's procs still deal their damage.
// window.kino.ammoMods: {MODS, PRICE, status(), buy(id), upgrade()}; the terminal app reads it.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';

export const MODS = [
  { id: 'cryo', name: 'Cryo Freeze', color: '#7fd8ff', desc: 'Freezing rounds that slow zombies to a crawl.',
    tiers: ['Slowed 40% for 4 s', 'Slowed 55% for 5 s; takes 15% more damage', 'Frozen solid for 3 s (+25% damage), then slowed'] },
  { id: 'napalm', name: 'Napalm Burst', color: '#ff7a2a', desc: 'Sets zombies on fire, burning away their health.',
    tiers: ['Burns 30% of its health over 3 s', 'Burns 45% of its health', 'Burns 60%, and the fire spreads to a nearby zombie each second'] },
  { id: 'deadwire', name: 'Dead Wire', color: '#5fe8ff', desc: 'Electricity arcs between zombies, shocking and stunning them.',
    tiers: ['Arcs to 2 zombies: 20% damage, 1.2 s stun', 'Arcs to 4: 25% damage, 1.6 s stun', 'Arcs to 6: 30% damage, 2 s stun'] },
  { id: 'shatter', name: 'Shatter Blast', color: '#ffb347', desc: 'Detonates the zombie in an explosion that hurts everything around it.',
    tiers: ['A small blast', 'A bigger, stronger blast', 'A large blast that kills most of a round\'s zombies'] },
  { id: 'brainrot', name: 'Brain Rot', color: '#8cff5a', desc: 'The zombie turns and fights for you, leaving you alone.',
    tiers: ['Turns for 6 s', 'Turns for 9 s; zombies nearby attack it', 'Turns for 12 s, then explodes'] },
];
export const PRICE = { apply: 2500, 2: 4000, 3: 6000 };
const PROC = { 1: .07, 2: .1, 3: .14 };
const COOLDOWN = { cryo: 1, napalm: 1, deadwire: 1.5, shatter: 1.5, brainrot: 6 };
const TIER = ['', 'I', 'II', 'III'];

export default function setup(api) {
  const { host, session, enemies, world, scene, audio, data } = api;
  if (!enemies) return;
  const byId = Object.fromEntries(MODS.map(m => [m.id, m]));
  const up = new THREE.Vector3(0, 1, 0);
  const now = () => session.time;
  const alive = z => z && z.health > 0 && enemies.list.includes(z);
  const chest = z => z.root.position.clone().addScaledVector(up, z.kind === 'dog' ? 20 : 42);
  const roundHealth = () => zombieHealth(session.round, data.rules);
  const hurt = (z, amount) => { if (alive(z) && amount > 0) enemies.hurt(z, amount, false, false, 'ammo_mod'); };
  let ready = 0;   // the gun in hand can proc again at this time
  const fx = { explosion: (...a) => window.kino.fx?.explosion?.(...a), burn: (...a) => window.kino.fx?.burn?.(...a) };   // looked up on use

  // ---- status sprites -------------------------------------------------------------------------------------------
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  function mark(z, color, y = 42, size = 26) {
    unmark(z);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .75 }));
    s.position.set(0, z.kind === 'dog' ? y * .45 : y, 0); s.scale.setScalar(size); z.root.add(s); z.amodSprite = s;
  }
  function unmark(z) { if (z.amodSprite) { z.amodSprite.removeFromParent(); z.amodSprite.material.dispose(); z.amodSprite = null; } }

  // ---- movement control (slow, stun, Brain Rot) -------------------------------------------------------------------
  const st = z => (z.amod ??= {});
  function setSpeed(z) {
    const a = st(z); a.base ??= z.speed;
    const slow = a.slowUntil > now() ? a.slow : 0;
    z.speed = a.base * (1 - slow);
    const frozen = a.stunUntil > now();
    z.rig.mixer.timeScale = frozen ? (a.frozen ? 0 : .25) : 1 - slow * .7;
  }
  const rotted = new Set();
  const lure = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    const a = z.amod;
    if (a?.stunUntil > now()) return z.root.position;   // stunned / frozen: stays put and can't attack
    if (a?.rotUntil > now()) return a.victim && alive(a.victim) ? a.victim.root.position : z.root.position;
    for (const r of rotted) if (r !== z && r.amod?.rotTier >= 2 && alive(r) && r.root.position.distanceTo(z.root.position) < 300) return r.root.position;
    return lure ? lure(z) : null;
  };
  // Cryo II/III: frozen zombies take more damage
  host.on('beforeEnemyDamage', e => { const a = e.enemy?.amod; if (a?.brittleUntil > now()) e.amount *= 1 + a.brittle; });

  // ---- the effects -----------------------------------------------------------------------------------------------
  const EFFECT = {
    cryo(z, tier) {
      const a = st(z);
      if (tier >= 3) { a.stunUntil = now() + 3; a.frozen = true; a.slow = .5; a.slowUntil = now() + 6; }
      else { a.slow = tier >= 2 ? .55 : .4; a.slowUntil = now() + (tier >= 2 ? 5 : 4); }
      if (tier >= 2) { a.brittle = tier >= 3 ? .25 : .15; a.brittleUntil = a.slowUntil; }
      mark(z, '#7fd8ff', 42, tier >= 3 ? 44 : 30); a.markUntil = a.slowUntil; setSpeed(z);
    },
    napalm(z, tier) {
      const a = st(z); a.burnUntil = now() + 3; a.burnTotal = z.maxHealth * [0, .3, .45, .6][tier]; a.burnTier = tier; a.burnTick = 0; a.spreadAt = now() + 1;
      mark(z, '#ff7a2a', 40, 34); a.markUntil = a.burnUntil;
    },
    deadwire(z, tier) {
      const chain = [z], links = [chest(z)], n = [0, 2, 4, 6][tier];
      for (let i = 0; i < n; i++) {
        const from = chain.at(-1); let best = null, bd = 250;
        for (const o of enemies.list) { if (chain.includes(o) || !alive(o)) continue; const d = o.root.position.distanceTo(from.root.position);
          if (d < bd && world.lineClear(chest(from), chest(o))) { bd = d; best = o; } }
        if (!best) break; chain.push(best); links.push(chest(best));
      }
      for (const o of chain) { const a = st(o); a.stunUntil = now() + [0, 1.2, 1.6, 2][tier]; a.frozen = false; mark(o, '#5fe8ff', 42, 30); a.markUntil = a.stunUntil; setSpeed(o);
        hurt(o, o.maxHealth * [0, .2, .25, .3][tier]); }
      bolt(links); audio?.play?.('explosion', .15);
    },
    shatter(z, tier, at = chest(z)) {
      const r = [0, 110, 150, 190][tier], peak = roundHealth() * [0, .6, .8, 1][tier];
      fx.explosion(at, .55 + tier * .2, 0xff8a3a); audio?.play?.('explosion', .5);
      for (const o of [...enemies.list]) { const d = chest(o).distanceTo(at); if (d < r && world.lineClear(at, chest(o))) hurt(o, THREE.MathUtils.lerp(peak, peak * .35, d / r)); }
    },
    brainrot(z, tier) {
      if (z.kind !== 'zombie') return EFFECT.shatter(z, 1);   // dogs and specials don't turn: a small blast instead
      const a = st(z); a.rotUntil = now() + [0, 6, 9, 12][tier]; a.rotTier = tier; a.victim = null; a.biteAt = 0;
      rotted.add(z); mark(z, '#8cff5a', 70, 36); a.markUntil = a.rotUntil;
    },
  };
  // lightning between the chain's links: jagged additive lines that flicker out
  const bolts = [];
  function bolt(points) {
    const pts = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1], n = Math.max(3, Math.round(a.distanceTo(b) / 18));
      for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); if (k && k < n) p.add(new THREE.Vector3((Math.random() - .5) * 10, (Math.random() - .5) * 10, (Math.random() - .5) * 10)); pts.push(p); }
    }
    if (pts.length < 2) return;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9ff4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; scene.add(line); bolts.push({ line, t: .25 });
  }

  // ---- procs -----------------------------------------------------------------------------------------------------
  host.on('beforeEnemyDamage', e => {
    if (host.remoteDamage || e.melee || !['bullet', 'projectile'].includes(e.cause)) return;
    const mod = session.weapon?.ammoMod, z = e.enemy;
    if (!mod || !byId[mod.id] || !alive(z) || now() < ready || Math.random() > PROC[mod.tier]) return;
    if (z.amod && (z.amod.rotUntil > now() || (mod.id === 'cryo' && z.amod.slowUntil > now()) || (mod.id === 'napalm' && z.amod.burnUntil > now()))) return;
    ready = now() + COOLDOWN[mod.id];
    queueMicrotask(() => alive(z) && EFFECT[mod.id](z, mod.tier));   // after the hit itself lands
  });

  // ---- per frame: timers, burning, Brain Rot ------------------------------------------------------------------------
  host.on('update', dt => {
    const t = now();
    for (const b of [...bolts]) { b.t -= dt; b.line.material.opacity = Math.max(0, b.t / .25) * (.6 + Math.random() * .4); if (b.t <= 0) { b.line.removeFromParent(); b.line.geometry.dispose(); b.line.material.dispose(); bolts.splice(bolts.indexOf(b), 1); } }
    for (const z of enemies.list) {
      const a = z.amod; if (!a) continue;
      if (a.base !== undefined) setSpeed(z);
      if (a.stunUntil && a.stunUntil <= t) { a.stunUntil = 0; a.frozen = false; }
      if (a.markUntil && a.markUntil <= t) { unmark(z); a.markUntil = 0; }
      else if (z.amodSprite) z.amodSprite.material.opacity = .55 + .25 * Math.sin(t * 9 + z.id);
      if (a.burnUntil > t) {   // napalm: damage in ticks, flames, tier III spreads
        a.burnTick -= dt;
        if (a.burnTick <= 0) { a.burnTick = .25; hurt(z, a.burnTotal / 12); fx.burn(chest(z)); }
        if (a.burnTier >= 3 && t >= a.spreadAt) { a.spreadAt = t + 1;
          const o = enemies.list.find(o => o !== z && alive(o) && !(o.amod?.burnUntil > t) && o.root.position.distanceTo(z.root.position) < 120);
          if (o) EFFECT.napalm(o, 1); }
      }
      if (a.rotUntil > t && alive(z)) {   // Brain Rot: hunt the nearest zombie and bite it
        if (!alive(a.victim)) { let best = null, bd = 800; for (const o of enemies.list) { if (o === z || !alive(o) || o.amod?.rotUntil > t) continue; const d = o.root.position.distanceTo(z.root.position); if (d < bd) { bd = d; best = o; } } a.victim = best; }
        if (a.victim && a.victim.root.position.distanceTo(z.root.position) < 70 && t >= a.biteAt) {
          a.biteAt = t + 1; z.rig.play?.('attack', false); hurt(a.victim, a.victim.maxHealth * .25 + 1);
        }
      }
    }
    for (const z of [...rotted]) {   // Brain Rot ends: back to normal, or (III) it blows up; corpses drop out
      if (!alive(z)) { rotted.delete(z); unmark(z); continue; }
      if (z.amod.rotUntil <= t) { rotted.delete(z); unmark(z); const tier = z.amod.rotTier; z.amod.rotUntil = 0; z.rig.play?.('walk');
        if (tier >= 3) { const at = chest(z); hurt(z, z.health + 1); EFFECT.shatter(null, 2, at); } }
    }
  });
  host.on('reset', () => { rotted.clear(); for (const b of bolts) b.line.removeFromParent(); bolts.length = 0; ready = 0; });

  // ---- HUD: the mod under the weapon name ----------------------------------------------------------------------------
  const tag = document.createElement('div'); tag.id = 'ammo-mod-tag';
  const css = document.createElement('style');
  css.textContent = '#ammo-mod-tag{font-size:10px;letter-spacing:2px;margin-top:3px;text-transform:uppercase;text-shadow:0 1px 3px #000}#ammo-mod-tag:empty{display:none}';
  document.head.append(css);
  const name = document.getElementById('weapon-name'); name?.after(tag);
  let shown = '';
  host.on('update', () => {
    const m = session.weapon?.ammoMod, key = m ? m.id + m.tier : '';
    if (key === shown) return; shown = key;
    tag.textContent = m ? `${byId[m.id].name} ${TIER[m.tier]}` : ''; tag.style.color = m ? byId[m.id].color : '';
  });

  // ---- the shop (the terminal's ARSENAL app) -------------------------------------------------------------------------
  function status() {
    const w = session.weapon, def = session.def;
    return { power: !!session.power, points: session.points, weapon: w && !session.weaponUnavailable ? { id: w.id, name: def?.name ?? w.id } : null,
      mod: w?.ammoMod ? { ...w.ammoMod } : null, mods: MODS, price: PRICE };
  }
  function buy(id) {
    const w = session.weapon;
    if (!session.power) return 'Restore the power first';
    if (!w || session.weaponUnavailable) return 'No weapon in hand';
    if (!byId[id]) return 'Unknown mod';
    if (w.ammoMod?.id === id) return 'Already fitted';
    if (!session.spend(PRICE.apply)) return 'Not enough points';
    w.ammoMod = { id, tier: 1 }; audio?.play?.('buy'); return true;
  }
  function upgrade() {
    const w = session.weapon, m = w?.ammoMod;
    if (!session.power) return 'Restore the power first';
    if (!m) return 'No ammo mod fitted';
    if (m.tier >= 3) return 'Already at tier III';
    if (!session.spend(PRICE[m.tier + 1])) return 'Not enough points';
    m.tier++; audio?.play?.('buy'); return true;
  }
  window.kino.ammoMods = { MODS, PRICE, status, buy, upgrade, trigger: (id, z, tier = 1) => EFFECT[id]?.(z, tier) };   // trigger: for tests
}
