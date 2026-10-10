// Ammo Mods (Black Ops 7's six, plus Black Ops 6's Light Mend and Cold War's Shatter Blast; fork). One per weapon, bought for the gun in hand at a
// terminal's ARSENAL app once the power is on (terminal-booth): apply PRICE.apply (tier I), then upgrade to II and III;
// swapping to a different mod costs the apply price again and starts at tier I. BO7's mods have no tiers (they grow through
// augments); the tiers here are the fork's. The mod lives on the weapon object (session.weapon.ammoMod {id, tier}), so it
// survives Pack-a-Punch (same object) and goes with the gun if it's swapped out.
//
// Each bullet/projectile hit by the player rolls PROC[tier] (host event 'ammoModProc' {id, tier, chance, enemy} may change
// `chance`); a proc starts the mod's effect on that zombie, then the gun waits COOLDOWN[id]. Every effect reads its numbers
// from TUNE[id][tier − 1] through tune(): host event 'ammoModTune' {id, tier, params} lets later systems (augments) change
// them before the effect runs. Damage is a share of the zombie's max health (Shatter / Fire Works: of a round's zombie
// health), cause 'ammo_mod' (no weapon XP, no recursion).
//   Cryo Freeze    slowed (40/55/50%) for 4/5/6 s; II+: takes more damage; III: frozen solid for the first 3 s
//   Napalm Burst   burns 30/45/60% of max health over 3 s; III: spreads to a zombie within 120 each second
//   Dead Wire      stunned (1.2/1.6/2 s) and crackling: an electric field (70/90/110) hurts zombies around it while the
//                  stun lasts; arcs to 2/4/6 more zombies within 250 (BO7: "stun ... generate an electric damage field")
//   Fire Works     launches 3/5/7 fireworks that seek the nearest other zombies and burst (radius 70/80/95)
//   Shadow Rift    a black hole on the zombie (radius 120/160/200) pulls in everything nearby; when it closes each caught
//                  zombie is dropped from the sky to its death (50/70/100%) or warped to a far spawn point (BO7: "warping
//                  away those nearby and dropping some from the air at lethal speed")
//   Light Mend     (BO6) the zombie's health becomes light: a normal zombie dies, a dog/special loses half its health, and
//                  a healing glyph rises from it; it drifts to the player whenever they're hurt and within 400/600/800, and
//                  heals 25/35/50% of max health on contact (III: then +10% a second for 3 s); it fades after 8/10/12 s
//   Shatter Blast  (Cold War) an explosion at the zombie: radius 110/150/190, 60/80/100% of a round's zombie health at the centre
//   Brain Rot      the zombie turns for 6/9/12 s: it goes for the nearest zombie and bites it (25% of its max health a
//                  second) and leaves the player alone; II+: zombies within 300 go for it; III: explodes when it ends
// Each proc plays its mod's own sting (BO7 style), synthesized in Web Audio (SFX): Dead Wire zap, Cryo freeze, Napalm
// ignition, Fire Works whistle and crackles, Shadow Rift warp, Shatter crack, Brain Rot gurgle, Light Mend chime.
// Status effects (slow, stun, pulls, Brain Rot) steer zombies (enemies.speed / lureTarget / positions), which only the host
// simulates in co-op; a guest's procs still deal their damage.
// window.kino.ammoMods: {MODS, PRICE, TUNE, status(), buy(id), upgrade(), trigger(id, zombie, tier)}; the terminal reads it.
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';

export const MODS = [
  { id: 'cryo', name: 'Cryo Freeze', color: '#7fd8ff', desc: 'Frost rounds: zombies are slowed and take more damage.',
    tiers: ['Slowed 40% for 4 s', 'Slowed 55% for 5 s; takes 15% more damage', 'Frozen solid for 3 s, then slowed; takes 25% more damage'] },
  { id: 'napalm', name: 'Napalm Burst', color: '#ff7a2a', desc: 'Fire rounds: zombies burn, losing health over time.',
    tiers: ['Burns 30% of its health over 3 s', 'Burns 45% of its health', 'Burns 60%, and the fire spreads to a nearby zombie each second'] },
  { id: 'deadwire', name: 'Dead Wire', color: '#5fe8ff', desc: 'Electric rounds: a stunned zombie crackles with a field that hurts those around it, and arcs jump to others.',
    tiers: ['1.2 s stun, small field, arcs to 2', '1.6 s stun, bigger field, arcs to 4', '2 s stun, large field, arcs to 6'] },
  { id: 'fireworks', name: 'Fire Works', color: '#ff5fd7', desc: 'Fireworks launch from the zombie and seek out others nearby.',
    tiers: ['3 fireworks', '5 fireworks with bigger bursts', '7 fireworks with large bursts'] },
  { id: 'shadowrift', name: 'Shadow Rift', color: '#a46bff', desc: 'Shadow rounds: a black hole pulls zombies in, then drops some from the sky and warps the rest away.',
    tiers: ['Small rift: half of those caught are dropped to their death', 'Bigger rift: 70% are dropped', 'Large rift: everything caught is dropped'] },
  { id: 'lightmend', name: 'Light Mend', color: '#fff3b0', desc: 'Light rounds: the zombie\'s health becomes a healing glyph that drifts to you when you\'re hurt. (Black Ops 6)',
    tiers: ['Glyph heals 25%, reaches you from 400, lasts 8 s', 'Heals 35%, from 600, lasts 10 s', 'Heals 50% then regenerates you for 3 s, from 800, lasts 12 s'] },
  { id: 'shatter', name: 'Shatter Blast', color: '#ffb347', desc: 'Detonates the zombie in an explosion that hurts everything around it. (Cold War)',
    tiers: ['A small blast', 'A bigger, stronger blast', 'A large blast that kills most of a round\'s zombies'] },
  { id: 'brainrot', name: 'Brain Rot', color: '#8cff5a', desc: 'Toxic rounds: the zombie turns and fights for you, leaving you alone.',
    tiers: ['Turns for 6 s', 'Turns for 9 s; zombies nearby attack it', 'Turns for 12 s, then explodes'] },
];
export const PRICE = { apply: 2500, 2: 4000, 3: 6000 };
const PROC = { 1: .07, 2: .1, 3: .14 };
const COOLDOWN = { cryo: 1, napalm: 1, deadwire: 1.5, fireworks: 2, shadowrift: 4, lightmend: 2, shatter: 1.5, brainrot: 6 };
// per-tier numbers (index = tier − 1); tune() copies one and lets 'ammoModTune' listeners adjust it
export const TUNE = {
  cryo: [{ slow: .4, dur: 4, brittle: 0, freeze: 0 }, { slow: .55, dur: 5, brittle: .15, freeze: 0 }, { slow: .5, dur: 6, brittle: .25, freeze: 3 }],
  napalm: [{ dmg: .3, dur: 3, spread: false }, { dmg: .45, dur: 3, spread: false }, { dmg: .6, dur: 3, spread: true }],
  deadwire: [{ stun: 1.2, field: 70, fieldDmg: .15, arcs: 2, arcDmg: .2 }, { stun: 1.6, field: 90, fieldDmg: .2, arcs: 4, arcDmg: .25 }, { stun: 2, field: 110, fieldDmg: .25, arcs: 6, arcDmg: .3 }],
  fireworks: [{ rockets: 3, dmg: .45, radius: 70 }, { rockets: 5, dmg: .55, radius: 80 }, { rockets: 7, dmg: .7, radius: 95 }],
  shadowrift: [{ radius: 120, lethal: .5, dur: 1.4 }, { radius: 160, lethal: .7, dur: 1.4 }, { radius: 200, lethal: 1, dur: 1.4 }],
  lightmend: [{ heal: .25, range: 400, life: 8, regen: 0 }, { heal: .35, range: 600, life: 10, regen: 0 }, { heal: .5, range: 800, life: 12, regen: .1 }],
  shatter: [{ radius: 110, dmg: .6 }, { radius: 150, dmg: .8 }, { radius: 190, dmg: 1 }],
  brainrot: [{ dur: 6, lure: 0, explode: false }, { dur: 9, lure: 300, explode: false }, { dur: 12, lure: 300, explode: true }],
};
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
  const fx = { explosion: (...a) => window.kino.fx?.explosion?.(...a), burn: (...a) => window.kino.fx?.burn?.(...a) };   // looked up on use
  function tune(id, tier) {
    const params = { ...TUNE[id][Math.max(1, Math.min(3, tier)) - 1] };
    host.emit('ammoModTune', { id, tier, params });
    return params;
  }
  let ready = 0;   // the gun in hand can proc again at this time

  // ---- visuals ------------------------------------------------------------------------------------------------------
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const holeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.42, 'rgba(6,0,14,1)'); gr.addColorStop(.55, 'rgba(120,60,255,.9)'); gr.addColorStop(.7, 'rgba(60,20,140,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glow = (color, size, opacity = .8) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity })); s.scale.setScalar(size); return s; };
  function mark(z, color, y = 42, size = 26) {
    unmark(z); const s = glow(color, size, .75); s.position.set(0, z.kind === 'dog' ? y * .45 : y, 0); z.root.add(s); z.amodSprite = s;
  }
  function unmark(z) { if (z.amodSprite) { z.amodSprite.removeFromParent(); z.amodSprite.material.dispose(); z.amodSprite = null; } }
  const bolts = [];
  function bolt(points, color = 0x9ff4ff) {   // jagged additive lightning through the points, flickering out
    const pts = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1], n = Math.max(3, Math.round(a.distanceTo(b) / 18));
      for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); if (k && k < n) p.add(new THREE.Vector3((Math.random() - .5) * 10, (Math.random() - .5) * 10, (Math.random() - .5) * 10)); pts.push(p); }
    }
    if (pts.length < 2) return;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; scene.add(line); bolts.push({ line, t: .25 });
  }

  // ---- movement control (slow, stun, Brain Rot) -------------------------------------------------------------------
  const st = z => (z.amod ??= {});
  function setSpeed(z) {
    const a = st(z); a.base ??= z.speed;
    const slow = a.slowUntil > now() ? a.slow : 0;
    z.speed = a.base * (1 - slow);
    const held = a.stunUntil > now() || a.pulled;
    z.rig.mixer.timeScale = held ? (a.frozen ? 0 : .25) : 1 - slow * .7;
  }
  const rotted = new Set();
  const lure = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    const a = z.amod;
    if (a?.stunUntil > now() || a?.pulled) return z.root.position;   // stunned / frozen / in a rift: stays put and can't attack
    if (a?.rotUntil > now()) return a.victim && alive(a.victim) ? a.victim.root.position : z.root.position;
    for (const r of rotted) if (r !== z && r.amod?.rotLure > 0 && alive(r) && r.root.position.distanceTo(z.root.position) < r.amod.rotLure) return r.root.position;
    return lure ? lure(z) : null;
  };
  // Cryo II/III: chilled zombies take more damage
  host.on('beforeEnemyDamage', e => { const a = e.enemy?.amod; if (a?.brittleUntil > now()) e.amount *= 1 + a.brittle; });

  // ---- the effects -------------------------------------------------------------------------------------------------
  const rockets = [], rifts = [], glyphs = [];
  let regenUntil = 0, regenRate = 0;
  const EFFECT = {
    cryo(z, tier) {
      const P = tune('cryo', tier), a = st(z);
      a.slow = P.slow; a.slowUntil = now() + P.dur;
      if (P.freeze) { a.stunUntil = now() + P.freeze; a.frozen = true; }
      if (P.brittle) { a.brittle = P.brittle; a.brittleUntil = a.slowUntil; }
      mark(z, '#7fd8ff', 42, P.freeze ? 44 : 30); a.markUntil = a.slowUntil; setSpeed(z);
    },
    napalm(z, tier) {
      const P = tune('napalm', tier), a = st(z);
      a.burnUntil = now() + P.dur; a.burnTotal = z.maxHealth * P.dmg; a.burnTicks = Math.max(1, Math.round(P.dur / .25)); a.burnTick = 0; a.burnSpread = P.spread; a.spreadAt = now() + 1;
      mark(z, '#ff7a2a', 40, 34); a.markUntil = a.burnUntil;
    },
    deadwire(z, tier) {
      const P = tune('deadwire', tier), chain = [z], links = [chest(z)];
      for (let i = 0; i < P.arcs; i++) {
        const from = chain.at(-1); let best = null, bd = 250;
        for (const o of enemies.list) { if (chain.includes(o) || !alive(o)) continue; const d = o.root.position.distanceTo(from.root.position);
          if (d < bd && world.lineClear(chest(from), chest(o))) { bd = d; best = o; } }
        if (!best) break; chain.push(best); links.push(chest(best));
      }
      for (const [i, o] of chain.entries()) { const a = st(o); a.stunUntil = now() + P.stun; a.frozen = false; mark(o, '#5fe8ff', 42, 30); a.markUntil = a.stunUntil; setSpeed(o);
        if (i) hurt(o, o.maxHealth * P.arcDmg); }
      // the first zombie crackles: a damage field for the length of the stun
      const a = st(z); a.fieldUntil = now() + P.stun; a.field = P.field; a.fieldDmg = P.fieldDmg; a.fieldTick = 0;
      bolt(links); audio?.play?.('explosion', .15);
    },
    fireworks(z, tier) {
      const P = tune('fireworks', tier), from = chest(z), used = new Set([z]);
      for (let i = 0; i < P.rockets; i++) {
        // targets: the nearest other zombies, round-robin, the source itself if it's alone
        let t = null, bd = 900; for (const o of enemies.list) { if (used.has(o) || !alive(o)) continue; const d = o.root.position.distanceTo(z.root.position); if (d < bd) { bd = d; t = o; } }
        if (t) used.add(t); else t = z;
        const color = new THREE.Color().setHSL(Math.random(), .9, .6), s = glow(color, 9, 1); s.position.copy(from); scene.add(s);
        const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 8 }, () => from.clone())),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
        trail.frustumCulled = false; scene.add(trail);
        const ang = (i / P.rockets) * Math.PI * 2, vel = new THREE.Vector3(Math.cos(ang) * 120, 520, Math.sin(ang) * 120);
        rockets.push({ s, trail, pos: from.clone(), vel, t: 0, target: t, P, color, hist: [] });
      }
      audio?.play?.('explosion', .12);
    },
    shadowrift(z, tier) {
      const P = tune('shadowrift', tier), at = chest(z);
      const hole = new THREE.Sprite(new THREE.SpriteMaterial({ map: holeTex, transparent: true, depthWrite: false })); hole.position.copy(at); hole.scale.setScalar(1); scene.add(hole);
      const halo = glow('#a46bff', P.radius * .9, .5); halo.position.copy(at); scene.add(halo);
      rifts.push({ at, P, t: 0, hole, halo, caught: new Set() });
      audio?.play?.('explosion', .2);
    },
    lightmend(z, tier) {
      const P = tune('lightmend', tier), at = chest(z);
      hurt(z, z.kind === 'zombie' ? z.health + 1 : z.maxHealth * .5);   // its health becomes the glyph
      const s = glow('#fff3b0', 22, .95), core = glow('#ffffff', 9, 1); s.add(core); s.position.copy(at); scene.add(s);
      glyphs.push({ s, pos: at.clone(), base: at.y, t: 0, P }); audio?.play?.('buy', .4);
    },
    shatter(z, tier, at = chest(z)) {
      const P = tune('shatter', tier), peak = roundHealth() * P.dmg;
      fx.explosion(at, .55 + tier * .2, 0xff8a3a); audio?.play?.('explosion', .5);
      for (const o of [...enemies.list]) { const d = chest(o).distanceTo(at); if (d < P.radius && world.lineClear(at, chest(o))) hurt(o, THREE.MathUtils.lerp(peak, peak * .35, d / P.radius)); }
    },
    brainrot(z, tier) {
      if (z.kind !== 'zombie') return EFFECT.shatter(z, 1);   // dogs and specials don't turn: a small blast instead
      const P = tune('brainrot', tier), a = st(z); a.rotUntil = now() + P.dur; a.rotLure = P.lure; a.rotExplode = P.explode; a.victim = null; a.biteAt = 0;
      rotted.add(z); mark(z, '#8cff5a', 70, 36); a.markUntil = a.rotUntil;
    },
  };

  // ---- proc sounds (BO7 style: each mod has its own signature sting when it triggers), synthesized in Web Audio so
  // they're the fork's own; quieter with distance from the camera ---------------------------------------------------
  const SFX = (() => {
    const ctx = () => audio?.ctx, out = () => audio?.master;
    let noiseBuf = null;
    const noise = c => { if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const n = c.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n; };
    // an envelope gain: attack a, then exponential decay over d (seconds), peak v
    const env = (c, t, v, a, d) => { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return g; };
    const osc = (c, type, f0, f1, t, dur) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur); return o; };
    const filt = (c, type, f, q = 1, f1 = null, t = 0, dur = 0) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.setValueAtTime(f, t); b.Q.value = q; if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + dur); return b; };
    const play = (src, ...chain) => { let n = src; for (const x of chain) { n.connect(x); n = x; } return n; };
    const voices = {
      deadwire(c, t, o) {   // a sharp electric zap: a falling square chirp, buzzing saw and crackling noise
        const z = osc(c, 'square', 2200, 260, t, .14); play(z, env(c, t, .5, .003, .16), o); z.start(t); z.stop(t + .2);
        const b = osc(c, 'sawtooth', 110, 90, t, .45); play(b, filt(c, 'lowpass', 1800), env(c, t, .25, .01, .45), o); b.start(t); b.stop(t + .5);
        const n = noise(c), gate = c.createGain(); for (let k = 0; k < 14; k++) gate.gain.setValueAtTime(Math.random() < .55 ? 1 : 0, t + k * .03);
        play(n, filt(c, 'bandpass', 3200, 1.2), gate, env(c, t, .8, .002, .45), o); n.start(t); n.stop(t + .5);
      },
      cryo(c, t, o) {   // a crystalline freeze: glassy partials, an icy hiss and a crack
        for (const [f, v] of [[2350, .14], [3140, .1], [4210, .08], [5600, .05]]) { const g = osc(c, 'sine', f, f * .98, t, .9); play(g, env(c, t, v, .005, .9), o); g.start(t); g.stop(t + 1); }
        const n = noise(c); play(n, filt(c, 'highpass', 5000, .7), env(c, t, .3, .01, .6), o); n.start(t); n.stop(t + .7);
        const k = noise(c); play(k, filt(c, 'bandpass', 900, 3), env(c, t, .6, .001, .07), o); k.start(t); k.stop(t + .1);
      },
      napalm(c, t, o) {   // ignition: a rising fiery whoosh over a low thump
        const n = noise(c); play(n, filt(c, 'lowpass', 300, .8, 2600, t, .35), env(c, t, .55, .05, .7), o); n.start(t); n.stop(t + .8);
        const th = osc(c, 'sine', 90, 45, t, .3); play(th, env(c, t, .5, .005, .3), o); th.start(t); th.stop(t + .35);
      },
      fireworks(c, t, o) {   // a whistling launch, then a burst of crackles
        const w = osc(c, 'sine', 800, 2600, t, .4); play(w, env(c, t, .18, .02, .4), o); w.start(t); w.stop(t + .45);
        for (let k = 0; k < 9; k++) { const at = t + .42 + Math.random() * .45, n = noise(c); play(n, filt(c, 'bandpass', 2500 + Math.random() * 3000, 2), env(c, at, .45, .001, .05 + Math.random() * .05), o); n.start(at); n.stop(at + .12); }
        const pop = noise(c); play(pop, filt(c, 'lowpass', 1200), env(c, t + .4, .5, .002, .2), o); pop.start(t + .4); pop.stop(t + .65);
      },
      shadowrift(c, t, o) {   // a deep warp: a falling sub sweep and an inhaling rush that cuts off
        const s1 = osc(c, 'sine', 180, 38, t, .9); play(s1, env(c, t, .6, .02, .9), o); s1.start(t); s1.stop(t + 1);
        const s2 = osc(c, 'triangle', 270, 57, t, .9); play(s2, env(c, t, .2, .02, .8), o); s2.start(t); s2.stop(t + 1);
        const n = noise(c), g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.4, t + .55); g.gain.linearRampToValueAtTime(0, t + .62);
        play(n, filt(c, 'bandpass', 400, 1, 1800, t, .55), g, o); n.start(t); n.stop(t + .7);
      },
      shatter(c, t, o) {   // a hard crack with a glassy ring (the explosion itself plays separately)
        const k = noise(c); play(k, filt(c, 'highpass', 2000), env(c, t, .6, .001, .12), o); k.start(t); k.stop(t + .15);
        for (const f of [1800, 2700]) { const g = osc(c, 'triangle', f, f * .9, t, .3); play(g, env(c, t, .1, .002, .3), o); g.start(t); g.stop(t + .35); }
      },
      brainrot(c, t, o) {   // a sickly gurgle: a wobbling tone and a squelch
        const g = osc(c, 'sine', 260, 120, t, .7), lfo = osc(c, 'square', 18, 11, t, .7), depth = c.createGain(); depth.gain.value = 90;
        lfo.connect(depth).connect(g.frequency); play(g, filt(c, 'lowpass', 900), env(c, t, .45, .01, .7), o); g.start(t); lfo.start(t); g.stop(t + .75); lfo.stop(t + .75);
        const n = noise(c); play(n, filt(c, 'bandpass', 600, 4, 250, t, .25), env(c, t, .35, .005, .25), o); n.start(t); n.stop(t + .3);
      },
      lightmend(c, t, o) {   // a bright chime arpeggio
        [1047, 1319, 1568, 2093].forEach((f, k) => { const at = t + k * .06, g = osc(c, 'sine', f, f, at, .7); play(g, env(c, at, .16, .004, .7), o); g.start(at); g.stop(at + .75); });
      },
    };
    return (id, at) => {
      const c = ctx(), dest = out(); if (!c || !dest || !voices[id]) return;
      const d = at && api.camera ? api.camera.position.distanceTo(at) : 0; if (d > 1600) return;
      const g = c.createGain(); g.gain.value = .9 * (1 - d / 1600) ** 2; g.connect(dest);
      try { voices[id](c, c.currentTime + .005, g); } catch (e) { console.warn('[ammo-mods] sfx', e); }
      setTimeout(() => g.disconnect(), 2000);
    };
  })();

  // ---- procs -------------------------------------------------------------------------------------------------------
  host.on('beforeEnemyDamage', e => {
    if (host.remoteDamage || e.melee || !['bullet', 'projectile'].includes(e.cause)) return;
    const mod = session.weapon?.ammoMod, z = e.enemy;
    if (!mod || !byId[mod.id] || !alive(z) || now() < ready || z.amod?.pulled) return;
    const roll = { id: mod.id, tier: mod.tier, chance: PROC[mod.tier], enemy: z }; host.emit('ammoModProc', roll);
    if (Math.random() > roll.chance) return;
    if (z.amod && (z.amod.rotUntil > now() || (mod.id === 'cryo' && z.amod.slowUntil > now()) || (mod.id === 'napalm' && z.amod.burnUntil > now()))) return;
    ready = now() + COOLDOWN[mod.id];
    queueMicrotask(() => { if (!alive(z)) return; SFX(mod.id, chest(z)); EFFECT[mod.id](z, mod.tier); });   // after the hit itself lands
  });

  // ---- per frame ---------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    const t = now();
    for (const b of [...bolts]) { b.t -= dt; b.line.material.opacity = Math.max(0, b.t / .25) * (.6 + Math.random() * .4); if (b.t <= 0) { b.line.removeFromParent(); b.line.geometry.dispose(); b.line.material.dispose(); bolts.splice(bolts.indexOf(b), 1); } }
    for (const z of enemies.list) {
      const a = z.amod; if (!a) continue;
      if (a.base !== undefined) setSpeed(z);
      if (a.stunUntil && a.stunUntil <= t) { a.stunUntil = 0; a.frozen = false; }
      if (a.markUntil && a.markUntil <= t) { unmark(z); a.markUntil = 0; }
      else if (z.amodSprite) z.amodSprite.material.opacity = .55 + .25 * Math.sin(t * 9 + z.id);
      if (a.burnUntil > t) {   // Napalm: damage in ticks, flames, maybe spreading
        a.burnTick -= dt;
        if (a.burnTick <= 0) { a.burnTick = .25; hurt(z, a.burnTotal / a.burnTicks); fx.burn(chest(z)); }
        if (a.burnSpread && t >= a.spreadAt) { a.spreadAt = t + 1;
          const o = enemies.list.find(o => o !== z && alive(o) && !(o.amod?.burnUntil > t) && o.root.position.distanceTo(z.root.position) < 120);
          if (o) EFFECT.napalm(o, 1); }
      }
      if (a.fieldUntil > t) {   // Dead Wire's field: zombies around the stunned one take shocks twice a second
        a.fieldTick -= dt;
        if (a.fieldTick <= 0) { a.fieldTick = .5;
          for (const o of enemies.list) if (o !== z && alive(o) && o.root.position.distanceTo(z.root.position) < a.field) { hurt(o, o.maxHealth * a.fieldDmg * .5); if (Math.random() < .5) bolt([chest(z), chest(o)]); } }
      }
      if (a.rotUntil > t && alive(z)) {   // Brain Rot: hunt the nearest zombie and bite it
        if (!alive(a.victim)) { let best = null, bd = 800; for (const o of enemies.list) { if (o === z || !alive(o) || o.amod?.rotUntil > t) continue; const d = o.root.position.distanceTo(z.root.position); if (d < bd) { bd = d; best = o; } } a.victim = best; }
        if (a.victim && a.victim.root.position.distanceTo(z.root.position) < 70 && t >= a.biteAt) {
          a.biteAt = t + 1; z.rig.play?.('attack', false); hurt(a.victim, a.victim.maxHealth * .25 + 1);
        }
      }
    }
    for (const z of [...rotted]) {   // Brain Rot ends: back to normal, or it blows up; corpses drop out
      if (!alive(z)) { rotted.delete(z); unmark(z); continue; }
      if (z.amod.rotUntil <= t) { rotted.delete(z); unmark(z); z.amod.rotUntil = 0; z.rig.play?.('walk');
        if (z.amod.rotExplode) { const at = chest(z); hurt(z, z.health + 1); EFFECT.shatter(null, 2, at); } }
    }
    // Fire Works: up, then curving in on the target, a coloured burst on arrival
    for (const r of [...rockets]) {
      r.t += dt;
      if (r.t > .3) {
        const goal = alive(r.target) ? chest(r.target) : r.pos.clone().addScaledVector(r.vel, .05);
        const want = goal.clone().sub(r.pos).normalize().multiplyScalar(900);
        r.vel.lerp(want, Math.min(1, dt * 6));
        if (r.pos.distanceTo(goal) < 22 || r.t > 3) {
          const peak = roundHealth() * r.P.dmg;
          fx.explosion(r.pos, .35 + r.P.radius / 300, r.color.getHex()); audio?.play?.('explosion', .2);
          for (const o of [...enemies.list]) { const d = chest(o).distanceTo(r.pos); if (d < r.P.radius) hurt(o, THREE.MathUtils.lerp(peak, peak * .4, d / r.P.radius)); }
          r.s.removeFromParent(); r.s.material.dispose(); r.trail.removeFromParent(); r.trail.geometry.dispose(); r.trail.material.dispose(); rockets.splice(rockets.indexOf(r), 1); continue;
        }
      } else r.vel.y -= 600 * dt;
      r.pos.addScaledVector(r.vel, dt); r.s.position.copy(r.pos);
      r.hist.unshift(r.pos.clone()); if (r.hist.length > 8) r.hist.pop();
      const at = r.trail.geometry.attributes.position; for (let i = 0; i < 8; i++) { const q = r.hist[Math.min(i, r.hist.length - 1)]; at.setXYZ(i, q.x, q.y, q.z); } at.needsUpdate = true;
    }
    // Light Mend: glyphs bob in place, drift to the player while they're hurt and in range, heal on contact
    const me = api.player?.getFeetPosition?.()?.add(new THREE.Vector3(0, 40, 0));
    for (const g of [...glyphs]) {
      g.t += dt; const hurtP = session.health < session.maxHealth && session.phase !== 'gameover', d = me ? g.pos.distanceTo(me) : Infinity;
      if (me && hurtP && d < g.P.range) g.pos.add(me.clone().sub(g.pos).normalize().multiplyScalar(Math.min(d, dt * 260)));
      g.s.position.copy(g.pos).add(new THREE.Vector3(0, Math.sin(g.t * 3) * 3, 0)); g.s.material.rotation += dt;
      const fade = Math.min(1, (g.P.life - g.t) / 1.5); g.s.material.opacity = .95 * Math.max(0, fade);
      if (me && hurtP && d < 30) {
        session.health = Math.min(session.maxHealth, session.health + session.maxHealth * g.P.heal);
        if (g.P.regen) { regenUntil = t + 3; regenRate = g.P.regen; }
        api.toast?.('Healed', 1); audio?.play?.('buy', .5);
      } else if (g.t < g.P.life) continue;
      g.s.removeFromParent(); g.s.material.dispose(); glyphs.splice(glyphs.indexOf(g), 1);
    }
    if (regenUntil > t && session.phase === 'fighting') session.health = Math.min(session.maxHealth, session.health + session.maxHealth * regenRate * dt);
    // Shadow Rift: pull everything in range toward the hole, then drop or warp what was caught
    for (const r of [...rifts]) {
      r.t += dt; const k = Math.min(1, r.t / r.P.dur), grow = Math.sin(Math.min(1, r.t / .25) * Math.PI / 2) * (k < .85 ? 1 : 1 - (k - .85) / .15);
      r.hole.scale.setScalar(r.P.radius * .55 * grow); r.hole.material.rotation += dt * 4; r.halo.material.opacity = .45 * grow;
      for (const o of enemies.list) {
        if (!alive(o) || o.amod?.rotUntil > t) continue;
        const d = o.root.position.distanceTo(r.at);
        if (d < r.P.radius && !r.caught.has(o)) { r.caught.add(o); st(o).pulled = true; mark(o, '#a46bff', 42, 24); }
        if (r.caught.has(o)) { const toward = r.at.clone().setY(o.root.position.y).sub(o.root.position); o.root.position.addScaledVector(toward, Math.min(1, dt * 3)); o.root.rotation.y += dt * 8; setSpeed(o); }
      }
      if (k >= 1) {
        const far = (world.spawnBarriers?.(session) ?? []).map(b => b.inside).filter(Boolean).sort((a, b) => b.distanceTo(r.at) - a.distanceTo(r.at));
        for (const o of r.caught) {
          if (!alive(o)) continue; const a = st(o); a.pulled = false; unmark(o); setSpeed(o);
          if (Math.random() < r.P.lethal) { fx.explosion(chest(o), .3, 0xa46bff); hurt(o, o.health + 1); }   // dropped from the sky
          else if (far.length) { o.root.position.copy(far[Math.floor(Math.random() * Math.min(4, far.length))]); o.path = []; o.repath = 0; }   // warped away
        }
        r.hole.removeFromParent(); r.hole.material.dispose(); r.halo.removeFromParent(); r.halo.material.dispose(); rifts.splice(rifts.indexOf(r), 1);
      }
    }
  });
  host.on('reset', () => {
    rotted.clear(); ready = 0;
    for (const b of bolts) b.line.removeFromParent(); bolts.length = 0;
    for (const r of rockets) { r.s.removeFromParent(); r.trail.removeFromParent(); } rockets.length = 0;
    for (const r of rifts) { r.hole.removeFromParent(); r.halo.removeFromParent(); } rifts.length = 0;
    for (const g of glyphs) g.s.removeFromParent(); glyphs.length = 0; regenUntil = 0;
  });

  // ---- HUD: the mod under the weapon name ----------------------------------------------------------------------------
  const tag = document.createElement('div'); tag.id = 'ammo-mod-tag';
  const css = document.createElement('style');
  css.textContent = '#ammo-mod-tag{font-size:10px;letter-spacing:2px;margin-top:3px;text-transform:uppercase;text-shadow:0 1px 3px #000}#ammo-mod-tag:empty{display:none}';
  document.head.append(css);
  document.getElementById('weapon-name')?.after(tag);
  let shown = '';
  host.on('update', () => {
    const m = session.weapon?.ammoMod, key = m ? m.id + m.tier : '';
    if (key === shown) return; shown = key;
    tag.textContent = m ? `${byId[m.id]?.name ?? m.id} ${TIER[m.tier]}` : ''; tag.style.color = m ? byId[m.id]?.color ?? '' : '';
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
  window.kino.ammoMods = { MODS, PRICE, TUNE, status, buy, upgrade, trigger: (id, z, tier = 1) => { SFX(id, chest(z)); return EFFECT[id]?.(z, tier); }, sfx: (id, at) => SFX(id, at) };   // trigger: for tests
}
