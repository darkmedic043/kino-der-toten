// Der Eisendrache's elemental bow upgrades (zm_castle_weap_quest_upgrade.gsc), shortened to their BO3 locations.
// Each quest: shoot its start with Wrath of the Ancients -> a broken arrow falls (pick it up) -> its steps -> reforge
// the arrow at BO3's reforge spot and feed it 10 kills -> the upgraded bow waits on its pedestal around the undercroft
// pyramid (upgraded_bow_struct_*). Taking it replaces the bow you carry. Steps (BO3's order; the long chains condensed):
//   Storm   weather vane on the clock tower; wall-run past the five undercroft runes (low gravity); fill the batteries
//           (gatehouse, clock tower, rocket pad) with kills; shoot the three distant beacons; reforge on the roof
//   Fire    the clock on the clock-tower wall; shoot the obelisk by the rocket pad and kill around it; charge the three
//           runic circles (road, rampart, roof) with kills; turn the clock; reforge on the roof
//   Wolf    the skull in the undercroft; shoot the four wolf paintings; dig with kills at the three burial spots
//           (courtyard, road, undercroft); shoot the skull shrine at the rocket pad and defend the burial chamber;
//           reforge at the burial chamber
//   Void    the urn above the trophy room; shoot the flagstone seal and fill the demonic circle with kills; the gatehouse
//           symbol; shoot the six chomper fossils around the castle; reforge in the trophy room
// The upgraded bows' arrows (mods/bo3-weapons: bo3_bow_<element>, explosive like the base one) add their element where
// they land: Storm chains lightning strikes for 2.5 s, Fire sets everything near burning (dead in 0.8 s), Wolf sends a
// spirit along the shot that kills everything it passes, Void opens a rift that drags zombies in and eats them.
// Testing: kino.castle.bows.state(), .advance(element), .give(element).
import * as THREE from 'three';
import { loadModel } from '../../animation.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);   // BO3 (CoD) coordinates -> the map's
const BASE = 'bo3_wrath_ancients', isBow = id => id === BASE || /^bo3_bow_/.test(id ?? '');
const SOULS = 10;
const Q = {
  storm: { name: 'Storm Bow', color: 0x7fd0ff, start: W(-184, 1879, 1233), startText: 'the weather vane', arrow: W(-137, 1927, 952), reforge: W(-127, 1941, 952), pedestal: W(-1359, 2425, 218),
    steps: [
      { kind: 'touch', lowgrav: true, r: 110, pts: [W(-525, 1812, 457), W(48, 2685, 457), W(-612, 2812, 457), W(387, 2220, 455), W(-1600, 2534, 457)], hint: 'Wall-run past the five runes in the undercroft while gravity is low' },
      { kind: 'kills', need: 8, r: 260, pts: [W(1712, 1536, 544), W(-1149, 1439, 880), W(5709, -2776, -2216)], hint: 'Fill the storm batteries with kills: gatehouse, clock tower, rocket pad' },
      { kind: 'shoot', r: 400, pts: [W(-3105, -785, 30), W(3900, 1130, -918), W(4529, -4080, -1103)], hint: 'Shoot the three distant beacons with the bow' },
    ] },
  rune: { name: 'Fire Bow', color: 0xff6a1a, start: W(-1067, 1640, 1079), startText: 'the clock on the tower wall', arrow: W(-1087, 1584, 1054), reforge: W(208, 1916, 940), pedestal: W(-1024, 2423, 218),
    steps: [
      { kind: 'shoot', r: 140, pts: [W(4982, -1805, -2059)], hint: 'Shoot the obelisk by the rocket pad' },
      { kind: 'kills', need: 10, r: 350, pts: [W(5006, -1829, -2157)], hint: 'Kill zombies around the obelisk to fill it with magma' },
      { kind: 'kills', need: 8, r: 170, pts: [W(1397, 1063, 187), W(-600, 1428, 829), W(209, 1915, 901)], hint: 'Charge the three runic circles with kills: road, rampart, roof' },
      { kind: 'use', pts: [W(-1060, 1662, 1073)], text: 'Turn the clock', hint: 'Turn the clock in the clock tower' },
      { kind: 'golf', pts: [W(1164, 3012, 708), W(1624, 3298, 562), W(-856, 4008, 708)], hint: 'Shoot the magma ball into each of the three fireplaces' },
    ] },
  wolf: { name: 'Wolf Bow', color: 0x9fd8ff, start: W(-1364, 2128, 190), startText: 'the wolf skull in the undercroft', arrow: W(-1225, 2984, 328), reforge: W(486, 2327, 400), pedestal: W(-1362, 2090, 218),
    steps: [
      { kind: 'shoot', r: 110, pts: [W(-504, 3005, 885), W(846, 4102, 748), W(-899, 1397, 882), W(-914, 1198, 576)], hint: 'Shoot the four wolf paintings' },
      { kind: 'kills', need: 6, r: 200, pts: [W(-1040, 2041, 699), W(1413, 1137, 253), W(-90, 2527, 204)], hint: 'Dig up the bones with kills: courtyard, road, undercroft' },
      { kind: 'shoot', r: 140, pts: [W(5374, -1663, -1200)], hint: 'Shoot the skull shrine by the rocket pad' },
      { kind: 'escort', from: W(-1556, 1986, 200), to: W(471, 2328, 439), pts: [W(471, 2328, 439)], hint: 'Escort the wolf spirit from the undercroft to the burial chamber' },
    ] },
  demon: { name: 'Void Bow', color: 0xb06bff, start: W(-660, 1295, 632), startText: 'the urn above the trophy room', arrow: W(-659, 1296, 540), reforge: W(-659, 1296, 540), pedestal: W(-1025, 2088, 218),
    steps: [
      { kind: 'shoot', r: 120, pts: [W(-658, 1294, 509)], hint: 'Shoot the flagstone seal in the trophy room' },
      { kind: 'kills', need: 10, r: 170, pts: [W(-658, 1296, 552)], hint: 'Fill the demonic circle with kills' },
      { kind: 'shoot', r: 110, pts: [W(1431, 1766, 533)], hint: 'Shoot the symbol in the gatehouse' },
      { kind: 'shoot', r: 110, pts: [W(442, 2837, 693), W(128, 3403, 188), W(-923, 207, 368), W(-520, 2849, 861), W(3941, -2861, -2240), W(1776, 1411, 340)], hint: 'Shoot the six chomper fossils around the castle' },
      { kind: 'sequence', len: 4, pts: [W(-578, 1251, 512), W(-668, 1204, 512), W(-741, 1254, 513), W(-739, 1342, 512), W(-647, 1389, 512), W(-576, 1339, 512)], hint: 'Watch the runes around the trophy room circle light up, then shoot them in that order' },
    ] },
};

export function setupBows(api, { lowgrav }) {
  const { world, session, host, player, camera, enemies, scene, audio, toast, announce, data } = api;
  const kino = window.kino;
  const st = {}; for (const el of Object.keys(Q)) st[el] = { stage: 'idle', step: 0, done: new Set(), kills: new Map(), souls: 0 };
  // markers: a soft glow at the arrow / pedestal / current targets (BO3 shows its quest objects; these stand in)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glows = [];
  function glow(p, color, size = 40) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(p); m.scale.setScalar(size); scene.add(m); glows.push(m); return m; }
  function unglow(m) { if (!m) return; m.removeFromParent(); m.material.dispose(); glows.splice(glows.indexOf(m), 1); }
  // the broken arrow and the waiting bow: the bow's own projectile / world model
  const arrows = {}, bows = {};
  async function prop(el, url, p, rotZ = 0) { if (!url) return null; const m = await loadModel(url).catch(() => null); if (!m) return null; m.position.copy(p); m.rotation.z = rotZ; scene.add(m); return m; }
  const def = el => data.weapons['bo3_bow_' + el];

  // ---- interactions -------------------------------------------------------------------------------------------------
  for (const [el, q] of Object.entries(Q)) {
    const s = st[el];
    world.addInteraction({ position: q.arrow.clone(), hidden: () => s.stage !== 'arrow', text: () => 'Pick up the broken arrow',
      use() { if (s.stage !== 'arrow') return false; s.stage = 'steps'; s.step = 0; clearArrow(el); audio?.play?.('buy', .5); stepStart(el); return true; } });
    world.addInteraction({ position: q.reforge.clone(), hidden: () => s.stage !== 'reforge', text: () => `Reforge the ${q.name.toLowerCase()} arrow`,
      use() { if (s.stage !== 'reforge') return false; s.stage = 'souls'; s.souls = 0; s.mark = glow(q.reforge.clone().add(new THREE.Vector3(0, 30, 0)), q.color, 70); toast?.(`Feed it ${SOULS} kills nearby`, 3); audio?.play?.('buy', .6); return true; } });
    world.addInteraction({ position: q.pedestal.clone().add(new THREE.Vector3(0, 30, 0)), hidden: () => s.stage !== 'ready', text: () => `Take the ${q.name}`,
      use() { if (s.stage !== 'ready') return false; give(el); return true; } });
    for (const step of q.steps) if (step.kind === 'use') for (const p of step.pts) world.addInteraction({ position: p.clone(), hidden: () => !(s.stage === 'steps' && q.steps[s.step] === step), text: () => step.text,
      use() { if (!(s.stage === 'steps' && q.steps[s.step] === step)) return false; s.done.add(0); stepCheck(el); return true; } });
  }
  function give(el) {
    const s = st[el], q = Q[el], id = 'bo3_bow_' + el; if (!data.weapons[id]) return;
    const i = session.inventory.findIndex(w => isBow(w.id)); if (i >= 0) { session.slot = i; session.inventory.splice(i, 1); session.slot = Math.min(session.slot, Math.max(0, session.inventory.length - 1)); }
    session.giveWeapon(id); api.equipView?.(); s.stage = 'taken'; bows[el]?.removeFromParent(); unglow(s.mark); s.mark = null;
    announce?.(q.name.toUpperCase(), 'WRATH OF THE ANCIENTS', 3); audio?.play?.('box');
  }
  function clearArrow(el) { arrows[el]?.removeFromParent(); arrows[el] = null; unglow(st[el].mark); st[el].mark = null; }
  function stepStart(el) {
    const s = st[el], q = Q[el], step = q.steps[s.step]; s.done = new Set(); s.kills = new Map();
    for (const m of s.targets ?? []) unglow(m); s.targets = ['kills', 'touch', 'shoot', 'golf', 'sequence'].includes(step.kind) ? step.pts.map(p => glow(p.clone().add(new THREE.Vector3(0, step.kind === 'kills' ? 20 : 0, 0)), q.color, step.kind === 'shoot' ? 60 : step.kind === 'sequence' ? 30 : 45)) : [];
    if (step.kind === 'golf') golfBall(el, 0);
    if (step.kind === 'escort') escortStart(el);
    if (step.kind === 'sequence') { s.seq = Array.from({ length: step.len }, () => Math.floor(Math.random() * step.pts.length)); s.at = 0; s.showT = 0; }
    toast?.(`${q.name} · ${step.hint}`, 5);
  }
  function stepCheck(el) {
    const s = st[el], q = Q[el], step = q.steps[s.step];
    const need = ['use', 'escort', 'sequence'].includes(step.kind) ? 1 : step.pts.length;
    if (s.done.size < need) return;
    for (const m of s.targets ?? []) unglow(m); s.targets = [];
    if (s.ball) { unglow(s.ball.m); s.ball = null; } if (s.wolf) { unglow(s.wolf.m); s.wolf = null; }
    audio?.play?.('buy', .5); s.step++;
    if (s.step >= q.steps.length) { s.stage = 'reforge'; toast?.(`${q.name} · take the arrow to be reforged`, 4); s.mark = glow(q.reforge.clone().add(new THREE.Vector3(0, 20, 0)), q.color, 55); return; }
    stepStart(el);
  }
  function markDone(el, k) { const s = st[el]; if (s.done.has(k)) return; s.done.add(k); const m = s.targets?.[k]; if (m) { m.material.opacity = .25; m.scale.multiplyScalar(.5); } audio?.play?.('buy', .35); stepCheck(el); }

  // ---- charged shots (BO3: hold fire to draw further) -------------------------------------------------------------
  // With a bow in hand the left mouse button is taken over: holding it charges (up to 1.6 s, a ring round the
  // crosshair), releasing fires through the engine (kino.debug.shoot: ammo, reload and the arrow as usual). Released
  // past 0.3 s the arrow is charged: the next impact plays the element's charged form (`charged`) instead of the tap's.
  const CHARGE = 1.6, ring = document.createElement('div'); ring.id = 'bow-charge';
  ring.style.cssText = 'position:fixed;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;z-index:3;pointer-events:none;display:none';
  document.body.append(ring);
  let drawing = null, charged = null, lastImpact = null;
  const bowInHand = () => isBow(session.weapon?.id) && !session.weaponUnavailable && !api.host?.gunBlocked;
  addEventListener('mousedown', e => {
    if (e.button !== 0 || !api.getState().active || !bowInHand() || window.kino.operator?.active) return;
    e.stopImmediatePropagation(); if (session.weapon.mag > 0) drawing = { t: 0 };
  }, true);
  addEventListener('mouseup', e => {
    if (e.button !== 0 || !drawing) return; e.stopImmediatePropagation();
    const t = drawing.t; drawing = null; ring.style.display = 'none';
    const el = /^bo3_bow_(\w+)$/.exec(session.weapon?.id ?? '')?.[1] ?? 'base';
    charged = t > .3 ? { el, k: Math.min(1, t / CHARGE), at: performance.now() } : null;
    window.kino.debug?.shoot?.();
  }, true);
  host.on('update', dt => {
    if (!drawing) return; if (!bowInHand()) { drawing = null; ring.style.display = 'none'; return; }
    drawing.t += dt; const k = Math.min(1, drawing.t / CHARGE), col = '#' + (Q[/^bo3_bow_(\w+)$/.exec(session.weapon.id)?.[1]]?.color ?? 0xffa040).toString(16).padStart(6, '0');
    ring.style.display = drawing.t > .15 ? 'block' : 'none'; ring.style.background = `conic-gradient(${col} ${k * 360}deg, #ffffff22 0)`; ring.style.webkitMask = ring.style.mask = 'radial-gradient(circle, transparent 17px, #000 18px)';
    if (k >= 1 && !drawing.full) { drawing.full = true; audio?.play?.('buy', .3); }
  });

  // ---- the longer steps: magma golf (Fire), the wolf's escort (Wolf), the rune sequence (Void) ---------------------
  const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
  function golfStart(fp) {   // a spot ~620 from the fireplace with a clear line to it and floor under it
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, c = world.closest?.(fp.clone().add(new THREE.Vector3(Math.cos(a) * 620, 0, Math.sin(a) * 620)), { x: 90, y: 160, z: 90 });
      if (c && Math.abs(c.y - fp.y) < 140 && world.lineClear(c.clone().add(new THREE.Vector3(0, 25, 0)), fp.clone().add(new THREE.Vector3(0, 25, 0)))) return c.clone().add(new THREE.Vector3(0, 12, 0)); }
    return fp.clone().add(new THREE.Vector3(200, 12, 0));
  }
  function golfBall(el, i) {
    const s = st[el], step = Q[el].steps[s.step]; while (i < step.pts.length && s.done.has(i)) i++; if (i >= step.pts.length) return;
    if (s.ball) unglow(s.ball.m); const p = golfStart(step.pts[i]); s.ball = { i, p, m: glow(p, 0xff5a10, 50), v: null };
  }
  function golfHit(el, step) {
    const s = st[el], b = s.ball, d = b.p.clone().sub(camera.position).setY(0).normalize();
    let to = b.p.clone().addScaledVector(d, 280); if (!world.lineClear(b.p.clone().add(new THREE.Vector3(0, 10, 0)), to.clone().add(new THREE.Vector3(0, 10, 0)))) to = b.p.clone().addScaledVector(d, 120);
    const hit = world.raycast(new THREE.Ray(to.clone().add(new THREE.Vector3(0, 80, 0)), DOWN), 0, 600); if (hit) to.y = hit.position.y + 12;
    b.from = b.p.clone(); b.to = to; b.t = 0; audio?.play?.('hit', .5);
  }
  function escortStart(el) {
    const s = st[el], step = Q[el].steps[s.step], path = world.path?.(step.from, step.to) ?? [];
    s.wolf = { path: path.length > 1 ? path.map(p => p.clone()) : [step.from.clone(), step.to.clone()], i: 0, p: step.from.clone(), hp: 100, m: glow(step.from.clone().add(new THREE.Vector3(0, 35, 0)), 0xbfe6ff, 70) };
  }
  function pulse(m) { if (!m) return; m.scale.multiplyScalar(1.8); m.material.opacity = 1; setTimeout(() => { m.scale.multiplyScalar(1 / 1.8); }, 300); }
  function longTick(dt) {
    const f = player.getFeetPosition();
    for (const [el, q] of Object.entries(Q)) {
      const s = st[el]; if (s.stage !== 'steps') continue; const step = q.steps[s.step];
      if (step.kind === 'golf' && s.ball) {
        const b = s.ball; if (b.to) { b.t += dt / .5; b.p.lerpVectors(b.from, b.to, Math.min(1, b.t)); b.p.y += Math.sin(Math.min(1, b.t) * Math.PI) * 40; if (b.t >= 1) { b.p.copy(b.to); b.to = null; if (b.p.distanceTo(step.pts[b.i]) < 140) { const done = b.i; markDone(el, done); if (st[el].stage === 'steps' && q.steps[st[el].step] === step) golfBall(el, done + 1); } } }
        if (s.ball) s.ball.m.position.copy(s.ball.p);
      }
      if (step.kind === 'escort' && s.wolf) {
        const w = s.wolf, near = enemies.list.filter(e => e.root.position.distanceTo(w.p) < 90).length;
        if (near) w.hp -= near * 7 * dt; else if (f.distanceTo(w.p) < 700 && w.i < w.path.length) { const t = w.path[w.i], d = t.clone().sub(w.p); if (d.length() < 12) w.i++; else w.p.addScaledVector(d.normalize(), Math.min(d.length(), 115 * dt)); }
        w.m.position.copy(w.p).y += 35 + Math.sin(performance.now() / 200) * 4; w.m.material.opacity = .4 + .6 * Math.max(0, w.hp) / 100;
        if (w.hp <= 0) { unglow(w.m); s.wolf = null; toast?.('The wolf spirit fell · it returns to the undercroft', 3); escortStart(el); }
        else if (w.i >= w.path.length || w.p.distanceTo(step.to) < 60) markDone(el, 0);
      }
      if (step.kind === 'sequence') {   // the runes light up in order, then a pause, over and over
        s.showT += dt; const cyc = s.seq.length * .8 + 2, t = s.showT % cyc, k = Math.floor(t / .8);
        s.targets.forEach((m, j) => { const lit = k < s.seq.length && s.seq[k] === j && t % .8 < .6; m.material.opacity = lit ? 1 : .2; m.scale.setScalar(lit ? 55 : 30); });
      }
    }
  }

  // ---- arrow impacts: quest shots, element effects ---------------------------------------------------------------
  // the bows' arrows explode through kino-features blast() -> effect(position, 0xffb347, 25)
  host.on('effect', e => {
    if (e.count !== 25 || !isBow(session.weapon?.id) || session.weaponUnavailable) return;
    const p = e.position, d = p.distanceTo(camera.position); if (d > 9000) return;
    for (const [el, q] of Object.entries(Q)) {
      const s = st[el];
      if (s.stage === 'idle' && p.distanceTo(q.start) < 140) { s.stage = 'arrow'; dropArrow(el); }
      if (s.stage === 'steps') { const step = q.steps[s.step]; if (step.kind === 'shoot') step.pts.forEach((t, k) => { if (p.distanceTo(t) < step.r) markDone(el, k); });
        if (step.kind === 'golf' && s.ball && p.distanceTo(s.ball.p) < 110) golfHit(el, step);
        if (step.kind === 'sequence') { const k = step.pts.findIndex(t => p.distanceTo(t) < 55); if (k >= 0) { if (k === s.seq[s.at]) { s.at++; pulse(s.targets[k]); audio?.play?.('buy', .35); if (s.at >= s.seq.length) markDone(el, 0); } else { s.at = 0; s.showT = 0; toast?.('Wrong rune · watch again', 2); audio?.play?.('hit', .5); } } } }
    }
    const el = /^bo3_bow_(\w+)$/.exec(session.weapon.id)?.[1];
    const ch = charged && performance.now() - charged.at < 6000 ? charged : null; charged = null;
    lastImpact = { p: p.toArray().map(Math.round), charged: ch ? { el: ch.el, k: +ch.k.toFixed(2) } : null };
    if (ch) CHARGED[ch.el]?.(p.clone(), ch.k);
    else if (el && ELEMENT[el]) ELEMENT[el](p.clone());
  });
  async function dropArrow(el) {
    const q = Q[el]; toast?.(`Something fell near ${q.startText}`, 3); audio?.play?.('buy', .5);
    st[el].mark = glow(q.arrow.clone().add(new THREE.Vector3(0, 12, 0)), q.color, 45);
    arrows[el] = await prop(el, def(el)?.projectileModel, q.arrow.clone().add(new THREE.Vector3(0, 6, 0)), Math.PI / 2);
  }
  host.on('kill', ({ enemy }) => {
    const p = enemy?.root?.position; if (!p) return;
    for (const [el, q] of Object.entries(Q)) {
      const s = st[el];
      if (s.stage === 'steps') {
        const step = q.steps[s.step]; if (step.kind !== 'kills') continue;
        step.pts.forEach((t, k) => { if (s.done.has(k) || p.distanceTo(t) > step.r) return; const n = (s.kills.get(k) ?? 0) + 1; s.kills.set(k, n); soul(p, t, q.color); if (n >= step.need) markDone(el, k); });
      } else if (s.stage === 'souls' && p.distanceTo(q.reforge) < 420) {
        s.souls++; soul(p, q.reforge, q.color);
        if (s.souls >= SOULS) { s.stage = 'ready'; unglow(s.mark); s.mark = glow(q.pedestal.clone().add(new THREE.Vector3(0, 40, 0)), q.color, 60); prop(el, def(el)?.worldModel, q.pedestal.clone().add(new THREE.Vector3(0, 45, 0)), Math.PI / 2).then(m => { bows[el] = m; }); announce?.(q.name.toUpperCase(), 'REFORGED · ON ITS PEDESTAL IN THE UNDERCROFT', 3.5); audio?.play?.('box'); }
      }
    }
  });
  // a soul streaking from a kill to where it charges
  const souls = [];
  function soul(from, to, color) { const m = glow(from.clone().add(new THREE.Vector3(0, 40, 0)), color, 22); souls.push({ m, from: m.position.clone(), to: to.clone().add(new THREE.Vector3(0, 25, 0)), t: 0 }); }

  // ---- element effects (upgraded bows) ---------------------------------------------------------------------------------
  const fx = [];
  const lineMat = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .95, blending: THREE.AdditiveBlending });
  function bolt(a, b, color) { const pts = [a.clone()]; for (let i = 1; i < 8; i++) pts.push(a.clone().lerp(b, i / 8).add(new THREE.Vector3((Math.random() - .5) * 30, (Math.random() - .5) * 30, (Math.random() - .5) * 30))); pts.push(b.clone());
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color)); scene.add(l); fx.push({ o: l, life: .12 }); }
  function flash(p, color, intensity = 4, radius = 500, life = .5) { const pool = kino.lighting?.sources; if (!pool) return; const src = { position: p.clone(), color: new THREE.Color(color), intensity, radius, kind: 'solid', dynamic: true, cap: 2000, weight: 1 }; pool.push(src); fx.push({ light: src, life, max: life }); }
  const kill = (z, panzer) => enemies.hurt(z, z.kind === 'panzer' ? panzer : 1e9, false, false, 'explosion');
  const zones = [];
  const ELEMENT = {
    storm(p) { flash(p, 0x9fd8ff, 5, 600, 2.5); zones.push({ kind: 'storm', p, t: 2.5, tick: 0 }); },
    rune(p) { flash(p, 0xff7a2a, 5, 500, 1); for (const z of [...enemies.list]) if (z.root.position.distanceTo(p) < 190) { kino.fx?.burn?.(z.root.position.clone().add(new THREE.Vector3(0, 40, 0))); zones.push({ kind: 'burn', z, t: .8 }); } },
    wolf(p) {
      const a = camera.position.clone().add(new THREE.Vector3(0, -30, 0)), dir = p.clone().sub(a), len = dir.length(); dir.normalize(); flash(p, 0xbfe6ff, 3, 400, .8);
      for (const z of [...enemies.list]) { const c = z.root.position.clone().add(new THREE.Vector3(0, 35, 0)), t = c.clone().sub(a).dot(dir); if (t < 0 || t > len + 60) continue; if (a.clone().addScaledVector(dir, t).distanceTo(c) < 70) kill(z, 1500); }
      for (let i = 0; i < 14; i++) { const m = glow(a.clone().addScaledVector(dir, len * i / 14), 0xbfe6ff, 50); fx.push({ sprite: m, life: .25 + i * .03 }); }
    },
    demon(p) { flash(p, 0xb06bff, 5, 500, 1.5); zones.push({ kind: 'void', p, t: 1.5, held: new Set() }); const m = glow(p.clone().add(new THREE.Vector3(0, 30, 0)), 0xb06bff, 120); fx.push({ sprite: m, life: 1.5 }); },
  };
  // charged forms (k: how far the bow was drawn, 0.2..1)
  const CHARGED = {
    base(p, k) { flash(p, 0xff8a3a, 5, 600, .6); for (const z of [...enemies.list]) if (!z.boss && z.root.position.distanceTo(p) < 220 + 120 * k) enemies.hurt(z, z.kind === 'panzer' ? 1500 * k : 1e9, false, false, 'explosion'); },
    storm(p, k) { flash(p, 0x9fd8ff, 6, 800, 6); zones.push({ kind: 'storm', p, t: 3 + 3 * k, tick: 0, r: 300 + 100 * k, rate: .2 }); },
    rune(p, k) { flash(p, 0xff7a2a, 6, 600, 2); for (const z of [...enemies.list]) { if (z.boss || z.root.position.distanceTo(p) > 220 + 80 * k) continue; zones.push({ kind: 'prison', z, at: z.root.position.clone(), t: 2 }); for (let i = 0; i < 3; i++) { const m = glow(z.root.position.clone().add(new THREE.Vector3(0, 25 + i * 30, 0)), 0xff7a2a, 55); fx.push({ sprite: m, life: 2 }); } } },
    wolf(p, k) {
      const a = camera.position.clone(), d0 = p.clone().sub(a).setY(0).normalize(); flash(p, 0xbfe6ff, 5, 600, 1.5);
      for (const ang of [-.4, 0, .4]) { const d = d0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); zones.push({ kind: 'wolf', at: p.clone(), d, t: 1.2 + k, sprite: glow(p.clone().add(new THREE.Vector3(0, 30, 0)), 0xbfe6ff, 70), hit: new Set() }); }
    },
    demon(p, k) { flash(p, 0xb06bff, 6, 700, 5); zones.push({ kind: 'void', p, t: 3 + 2 * k, held: new Set(), r: 400 }); const m = glow(p.clone().add(new THREE.Vector3(0, 40, 0)), 0xb06bff, 200); fx.push({ sprite: m, life: 3 + 2 * k }); zones.push({ kind: 'chompers', p, t: 3 + 2 * k, tick: 0 }); },
  };
  host.on('update', dt => {
    if (!dt) return;
    longTick(dt);
    // touch steps (the storm runes: reached by wall-running while gravity is low)
    const feet = player.getFeetPosition().add(new THREE.Vector3(0, 35, 0));
    for (const [el, q] of Object.entries(Q)) { const s = st[el]; if (s.stage !== 'steps') continue; const step = q.steps[s.step];
      if (step.kind === 'touch' && (!step.lowgrav || lowgrav?.state().on)) step.pts.forEach((t, k) => { if (feet.distanceTo(t) < step.r) markDone(el, k); }); }
    for (let i = souls.length - 1; i >= 0; i--) { const s = souls[i]; s.t += dt / .6; s.m.position.lerpVectors(s.from, s.to, Math.min(1, s.t)).y += Math.sin(Math.min(1, s.t) * Math.PI) * 40; if (s.t >= 1) { unglow(s.m); souls.splice(i, 1); } }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt;
      if (f.light) f.light.weight = Math.max(0, f.life / f.max);
      if (f.sprite) f.sprite.material.opacity = Math.max(0, Math.min(1, f.life * 3));
      if (f.life <= 0) { if (f.o) { f.o.removeFromParent(); f.o.geometry.dispose(); f.o.material.dispose(); } if (f.sprite) unglow(f.sprite); if (f.light) { const pool = kino.lighting?.sources, j = pool?.indexOf(f.light) ?? -1; if (j >= 0) pool.splice(j, 1); } fx.splice(i, 1); } }
    for (let i = zones.length - 1; i >= 0; i--) { const z = zones[i]; z.t -= dt;
      if (z.kind === 'prison') { if (enemies.list.includes(z.z)) { z.z.root.position.x = z.at.x; z.z.root.position.z = z.at.z; z.z.stuck = 0; if (z.t <= 0) kill(z.z, 2500); } }
      if (z.kind === 'wolf') { z.at.addScaledVector(z.d, 650 * dt); const g = world.closest?.(z.at, { x: 40, y: 120, z: 40 }); if (g) z.at.y = g.y; z.sprite.position.copy(z.at).y += 30; for (const e of [...enemies.list]) if (!e.boss && !z.hit.has(e) && e.root.position.distanceTo(z.at) < 90) { z.hit.add(e); kill(e, 1500); } if (z.t <= 0) unglow(z.sprite); }
      if (z.kind === 'chompers' && (z.tick -= dt) <= 0) { z.tick = .3; const t = enemies.list.filter(e => !e.boss && e.root.position.distanceTo(z.p) < 650).sort((a, b) => a.root.position.distanceTo(z.p) - b.root.position.distanceTo(z.p))[0]; if (t) { const m = glow(t.root.position.clone().add(new THREE.Vector3(0, 40, 0)), 0xb06bff, 40); fx.push({ sprite: m, life: .4 }); kill(t, 600); } }
      if (z.kind === 'storm' && (z.tick -= dt) <= 0) { z.tick = z.rate ?? .3; const top = z.p.clone().add(new THREE.Vector3(0, 60, 0)); const near = enemies.list.filter(e => !e.boss && e.root.position.distanceTo(z.p) < (z.r ?? 240)).sort((a, b) => a.root.position.distanceTo(z.p) - b.root.position.distanceTo(z.p))[0];
        if (near) { bolt(top, near.root.position.clone().add(new THREE.Vector3(0, 45, 0)), 0xbfe6ff); kill(near, 800); } else bolt(top, z.p.clone().add(new THREE.Vector3((Math.random() - .5) * 120, 0, (Math.random() - .5) * 120)), 0xbfe6ff); }
      if (z.kind === 'burn' && z.t <= 0 && enemies.list.includes(z.z)) kill(z.z, 600);
      if (z.kind === 'void') for (const e of [...enemies.list]) { const d = e.root.position.distanceTo(z.p); if (d > (z.r ?? 220) || e.boss) continue; if (e.kind === 'panzer') { if (!z.held.has(e)) { z.held.add(e); enemies.hurt(e, 1200, false, false, 'explosion'); } continue; } e.root.position.lerp(z.p, Math.min(1, dt * 2.5)); e.stuck = 0; if (d < 40) kill(e, 0); }
      if (z.t <= 0) zones.splice(i, 1); }
  });
  host.on('reset', () => {
    for (const el of Object.keys(Q)) { clearArrow(el); bows[el]?.removeFromParent(); bows[el] = null; for (const m of st[el].targets ?? []) unglow(m); st[el] = { stage: 'idle', step: 0, done: new Set(), kills: new Map(), souls: 0 }; }
  });

  return {
    state: () => Object.fromEntries(Object.entries(st).map(([el, s]) => [el, { stage: s.stage, step: s.step, done: [...s.done], kills: Object.fromEntries(s.kills), souls: s.souls }])),
    advance(el) { const s = st[el], q = Q[el]; if (s.stage === 'idle') { s.stage = 'arrow'; dropArrow(el); } else if (s.stage === 'arrow') { s.stage = 'steps'; s.step = 0; clearArrow(el); stepStart(el); } else if (s.stage === 'steps') { q.steps[s.step].pts.forEach((_, k) => s.done.add(k)); stepCheck(el); } else if (s.stage === 'reforge') { s.stage = 'souls'; s.souls = SOULS - 1; } },
    give, sites: Q, last: () => lastImpact,
    ball: el => st[el].ball ? { i: st[el].ball.i, p: st[el].ball.p.clone() } : null, seq: el => st[el].seq ?? null, wolf: el => st[el].wolf?.p.clone() ?? null,   // testing
  };
}
