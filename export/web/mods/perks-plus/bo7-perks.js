// The Black Ops 7 perks this game was missing (2026-10-15, user: "add the rest of the perks from black ops 7", with the
// fandom wiki pages for each): Vulture Aid, Widow's Wine, Wisp Tea, Death Perception, Elemental Pop and Melee Macchiato.
// Base effects follow the wikis; their eight BO7 augments each are research tracks (mods/research/research.json), read
// here through kino.research.stat(key) (it only counts augments of perks you own). BO7 systems this game doesn't have
// are adapted: Essence and Salvage -> points, the Field Upgrade -> your class action skill, armor plates -> health.
// They are sold by the terminal booth's PERKS app on every map (no machine models for them yet).
import * as THREE from 'three';

export const BO7_PERKS = {
  specialty_vultureaid: { name: 'Vulture Aid', price: 3000, color: '#c0392b', icon: 'VA' },
  specialty_widowswine: { name: "Widow's Wine", price: 4000, color: '#7a1830', icon: 'WW' },
  specialty_wisptea: { name: 'Wisp Tea', price: 3500, color: '#62c6e8', icon: 'WT' },
  specialty_deathperception: { name: 'Death Perception', price: 3000, color: '#e07a1f', icon: 'DP' },
  specialty_elementalpop: { name: 'Elemental Pop', price: 3000, color: '#d65fc4', icon: 'EP' },
  specialty_meleemacchiato: { name: 'Melee Macchiato', price: 3000, color: '#8b5a2b', icon: 'MM' },
};
export const BO7_ICONS = { 'Vulture Aid': 'vultureaid.webp', "Widow's Wine": 'widowswine.webp', 'Wisp Tea': 'wisptea.webp',
  'Death Perception': 'deathperception.webp', 'Elemental Pop': 'elementalpop.webp', 'Melee Macchiato': 'meleemacchiato.webp' };

const VA = 'specialty_vultureaid', WW = 'specialty_widowswine', WT = 'specialty_wisptea', DP = 'specialty_deathperception', EP = 'specialty_elementalpop', MM = 'specialty_meleemacchiato';
const UP = new THREE.Vector3(0, 40, 0);

export function setupBo7Perks({ host, session, player, enemies, scene, camera, audio, world, powerups, announce, toast }) {
  const has = id => !!session.perks?.has(id);
  const stat = k => window.kino?.research?.stat?.(k) ?? 0;
  const now = () => session.time;
  const alive = z => enemies.list.includes(z);
  const feet = () => player.getFeetPosition();
  const chest = z => z.root.position.clone().add(UP);
  const special = z => z.kind && z.kind !== 'zombie';
  const heal = n => { session.health = Math.min(session.maxHealth, session.health + n); };
  const points = n => session.addPoints ? session.addPoints(n) : (session.points += n);
  const nearest = (from, r, skip) => { let best = null, bd = r; for (const z of enemies.list) { if (z === skip) continue; const d = z.root.position.distanceTo(from); if (d < bd) { bd = d; best = z; } } return best; };
  const fx = (at, scale, color) => window.kino?.fx?.explosion?.(at, scale, color);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, '#fff'); r.addColorStop(.35, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const sprite = (color, size, opacity = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); return s; };
  // a spider web drawn on a canvas (radial strands + rings), used by Widow's Wine for the blast and the webbing
  const webTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), C = 128, N = 14;
    g.strokeStyle = 'rgba(245,242,255,.95)'; g.lineCap = 'round';
    const ang = [...Array(N)].map((_, i) => i / N * Math.PI * 2 + (Math.random() - .5) * .25);
    g.lineWidth = 2.2; for (const a of ang) { g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * 124, C + Math.sin(a) * 124); g.stroke(); }
    g.lineWidth = 1.4; for (let r = 14; r < 124; r += 11 + r * .06) { g.beginPath(); ang.forEach((a, i) => { const rr = r * (.92 + Math.random() * .12), x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr; i ? g.quadraticCurveTo(C + Math.cos(a - Math.PI / N) * rr * .9, C + Math.sin(a - Math.PI / N) * rr * .9, x, y) : g.moveTo(x, y); });
      g.closePath(); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const webSprite = (size, opacity) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: webTex, transparent: true, opacity, depthWrite: false })); s.scale.setScalar(size); s.material.rotation = Math.random() * Math.PI * 2; return s; };
  const webs = [];   // blast visuals: {mesh, t, life, from, to}
  function webBurst(at, R) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: webTex, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.rotation.z = Math.random() * 6; floor.position.copy(at).y += 3; scene.add(floor); webs.push({ mesh: floor, t: 0, life: 1.6, from: 10, to: R });
    // silk strands flung outward
    const pos = []; for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2 + Math.random() * .2, r = R * (.6 + Math.random() * .4), h = 10 + Math.random() * 60;
      pos.push(at.x, at.y + 40, at.z, at.x + Math.cos(a) * r, at.y + h, at.z + Math.sin(a) * r); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf2eeff, transparent: true, opacity: .8, depthWrite: false })); lines.frustumCulled = false; lines.scale.setScalar(.05);
    lines.position.copy(at); g.translate(-at.x, -at.y, -at.z); scene.add(lines); webs.push({ mesh: lines, t: 0, life: 1, from: .05, to: 1, lines: true });
  }
  const bolts = [];
  function bolt(a, b, color) {
    const pts = [], n = Math.max(3, Math.round(a.distanceTo(b) / 20));
    for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); if (k && k < n) p.add(new THREE.Vector3((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12)); pts.push(p); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; scene.add(line); bolts.push({ line, t: .22 });
  }

  // ---- holding zombies (webs, stuns): every frame a held zombie is pulled back toward where it stood by its slow
  // fraction (1 = frozen), so it works with whatever else sets its speed; frozen ones can't attack (lureTarget)
  const held = new Map();   // z -> {until, slow, frozenUntil, prev, cocoon}
  function hold(z, dur, slow, frozen = 0, cocoon = false, web = true) {   // web false: a stun (Electric Cherry), no silk
    const h = held.get(z) ?? { prev: z.root.position.clone() };
    h.until = Math.max(h.until ?? 0, now() + dur); h.slow = Math.max(h.slow ?? 0, slow); h.frozenUntil = Math.max(h.frozenUntil ?? 0, now() + frozen);
    if (web && !h.web) {   // webbing on the body: a few web sheets at legs, chest and head (more of them when cocooned)
      h.web = new THREE.Group(); for (const [y, size] of [[16, 24], [40, 28]]) { const w = webSprite(size, .45); w.position.y = y; h.web.add(w); } z.root.add(h.web);
    }
    if (cocoon && !h.cocoon) { h.cocoon = new THREE.Group(); for (const [y, size] of [[12, 28], [32, 34], [52, 32], [66, 22]]) { const w = webSprite(size, .6); w.position.set((Math.random() - .5) * 6, y, (Math.random() - .5) * 6); h.cocoon.add(w); } z.root.add(h.cocoon); }
    held.set(z, h);
  }
  const lure = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    const h = held.get(z); if (h && h.frozenUntil > now()) return z.root.position;
    if (gasConcealed()) return z.root.position;   // Smell of Death: you can't be found in the gas
    const w = wispLure(z); if (w) return w;
    return lure ? lure(z) : null;
  };

  // ======================================== Vulture Aid ========================================
  // Kills sometimes leave a vulture drop (ammo or points, BO2 style; BO6/7's Essence is points here) that only you
  // pick up, automatically when you walk near it. Drawn as 3D loot by mods/loot when it's loaded (the glow sprites otherwise).
  const drops = [], clouds = [];
  function drop(at, kind, amount = 0) {
    const loot = window.kino?.loot;   // 3D drops (mods/loot): an ammo can, a gold $ sign, a grenade
    if (loot) { const d = { kind, amount }; loot.spawn(kind === 'big' ? 'points' : kind, at.clone(), { big: kind === 'big', life: 20, reach: 60 + stat('va.reach'), keep: () => has(VA), onPick: () => pickup(d) }); return; }
    const color = kind === 'ammo' ? 0x9cff4f : kind === 'grenade' ? 0xffd34f : kind === 'big' ? 0xff4fd0 : 0xff9a3d;
    const s = sprite(color, kind === 'big' ? 34 : 22); s.position.copy(at).y += 14; scene.add(s);
    drops.push({ s, kind, amount, until: now() + 20, base: s.position.y });
  }
  function pickup(d) {
    const w = session.weapon, def = session.def;
    if (d.kind === 'ammo' && w && def) {
      const wonder = def.class === 'special' || def.wonder || /ray_?gun|thunder|tesla|wave|zap/.test(def.baseId ?? def.id ?? '');
      const max = w.upgraded ? def.upgrade?.maxAmmo ?? def.maxAmmo : def.maxAmmo;
      const n = Math.ceil((def.clipSize ?? 10) * .3 * (wonder ? 1 + stat('va.gift') : 1));
      w.reserve = Math.min(max ?? Infinity, (w.reserve ?? 0) + n); toast?.(`Vulture · +${n} ammo`, 1.2);
    } else if (d.kind === 'grenade') { session.grenades = Math.min(4, session.grenades + 1); toast?.('Vulture · +1 grenade', 1.2); }
    else { const n = d.amount || 10 + Math.round(Math.random() * 20); points(n); }
    if (stat('va.plates')) heal(stat('va.plates'));   // Armor-matic: no armor plates here, so drops patch you up
    audio?.play?.('buy', .25);
  }
  function gasConcealed() { return has(VA) && stat('va.smell') && clouds.some(c => c.smell && c.at.distanceTo(feet()) < c.r); }

  // ======================================== Widow's Wine ========================================
  // BO7: getting hit sets off a web explosion (cooldown); webbed zombies close in are cocooned, the rest slowed.
  let widowReady = 0, spinner = null;
  const hatchlings = [];
  function webBlast(at, free = false) {
    if (!free) { if (now() < widowReady) return false; widowReady = now() + 40 * (1 - stat('ww.haste')); }
    const R = 170 * (1 + stat('ww.wide')), dur = 8 * (1 + stat('ww.silk')), tangled = stat('ww.tangled');
    for (const z of enemies.list) {
      const d = z.root.position.distanceTo(at); if (d > R) continue;
      const close = d < R * .45 || (tangled && !special(z));
      hold(z, dur, close ? 1 : .6, close ? dur * .5 : 0, close);
    }
    webBurst(at, R); audio?.play?.('melee', .4);   // a web blast, not a fireball (user, 2026-10-15)
    if (stat('ww.spinner')) spinner = { until: now() + 10, r: 130 };
    if (stat('ww.hatchling')) { const s = sprite(0x2a0a12, 26); s.position.copy(at).y += 12; scene.add(s); const eye = sprite(0xff2a3a, 8); s.add(eye); hatchlings.push({ s, until: now() + 12, next: 0 }); }
    return true;
  }
  host.on('beforeDamage', e => {
    if (!(e.amount > 0)) return;
    const attacker = nearest(feet(), 110);
    if (has(WW) && attacker) webBlast(feet());
    if (has(EP) && attacker && stat('ep.peach') && Math.random() < stat('ep.peach')) popOn(attacker, true);
    if (has(DP) && attacker && stat('dp.sixth')) {   // Sixth Sense: hits from behind hurt less
      const to = attacker.root.position.clone().sub(feet()).setY(0).normalize(), fwd = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      if (to.dot(fwd) < -.2) e.amount *= 1 - stat('dp.sixth');
    }
    if (has(WT) && wisp && stat('wt.salvation') && salvations > 0 && e.amount >= session.health) {   // Mask of Salvation
      e.amount = Math.max(0, session.health - 1); salvations--; heal(60); announce?.('THE FOX', `SAVED YOU · ${salvations} LEFT`, 2.5);
    }
  });

  // ======================================== Wisp Tea ========================================
  // Kills summon a Wisp that hunts zombies near you for 30 s; then it rests 2 minutes and needs more kills. It spares
  // the round's last zombie so you can keep the round going. The masks (Major augments) change what it does.
  // BO7-like: a small blue wisp that helps rather than clears the room (user, 2026-10-15: was far too strong and big)
  const WISP_KILLS = 40, WISP_LIFE = 20, WISP_RANGE = 320, WISP_EVERY = 1.8;
  let wisp = null, wispCharge = 0, wispRest = 0, salvations = 3;
  function summonWisp() {
    const s = sprite(0x1f6bff, 5, .85), core = sprite(0x9fd4ff, 1.8); s.add(core);
    const mask = stat('wt.wrath') ? 'wrath' : stat('wt.salvation') ? 'salvation' : stat('wt.distraction') ? 'distraction' : stat('wt.benevolence') ? 'benevolence' : null;
    scene.add(s); s.position.copy(feet()).add(new THREE.Vector3(0, 70, 0));
    wisp = { s, mask, until: now() + WISP_LIFE * (1 + stat('wt.extension')), next: 0, a: 0 };
    announce?.('WISP TEA', mask ? `THE ${{ wrath: 'DEMON', salvation: 'FOX', distraction: 'MONKEY', benevolence: 'MAIDEN' }[mask]} IS WITH YOU` : 'THE WISP IS WITH YOU', 2.5);
  }
  const lastZombie = () => (session.total ?? 0) - (session.killed ?? 0) <= 1 && enemies.list.length <= 1;
  function wispLure(z) {
    if (!wisp) return null;
    if (wisp.mask === 'distraction' && z.root.position.distanceTo(wisp.s.position) < 600) return wisp.s.position.clone().setY(feet().y);
    if (stat('wt.sitter') && lastZombie()) return wisp.s.position.clone().setY(feet().y);
    return null;
  }

  // ======================================== Death Perception ========================================
  // Zombies near you are keylined orange through walls: each zombie mesh gets a twin sharing its skeleton, drawn only
  // where something is in front of it (depthFunc GreaterDepth).
  // An outline, not a fill (user, 2026-10-15): the twin draws only its silhouette rim (where the surface turns away from
  // the camera), and only where something hides it (GreaterDepth). polygonOffset pulls the twin a hair toward the camera,
  // so a zombie in plain sight never passes against its own depth (it had orange specks).
  const outline = color => new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false,
    depthFunc: THREE.GreaterDepth, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, fog: false,
    vertexShader: `#include <common>
#include <skinning_pars_vertex>
varying vec3 vN; varying vec3 vV;
void main(){
#include <beginnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <begin_vertex>
#include <skinning_vertex>
#include <project_vertex>
vN = normalize(transformedNormal); vV = normalize(-mvPosition.xyz);
}`,
    fragmentShader: `uniform vec3 color; varying vec3 vN; varying vec3 vV;
void main(){ float rim = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = smoothstep(.42, .7, rim); if (a < .03) discard; gl_FragColor = vec4(color * 1.25, min(1.0, a * 1.3)); }` });
  const keyMat = outline(0xff7a1a), gemMat = outline(0xffd34f);
  function keyline(root, mat) {
    const out = [];
    root.traverse(m => {
      if (!m.isMesh || m.userData.keyline || m.userData.isKeyline) return;
      const o = m.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, mat) : new THREE.Mesh(m.geometry, mat);
      if (m.isSkinnedMesh) { o.bind(m.skeleton, m.bindMatrix); o.bindMode = m.bindMode; }
      o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale); o.renderOrder = 990; o.frustumCulled = false; o.userData.isKeyline = true; o.userData.of = m;
      m.parent.add(o); m.userData.keyline = o; out.push(o);
    });
    return out;
  }
  const keyed = new WeakMap();
  let arrows = null;
  function drawArrows() {   // Bird's Eye View: off-screen zombies close by get an edge arrow
    arrows ??= document.body.appendChild(Object.assign(document.createElement('canvas'), { id: 'dp-arrows' }));
    const c = arrows, W = innerWidth, H = innerHeight; if (c.width !== W) { c.width = W; c.height = H; c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3'; }
    const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    const fwd = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    for (const z of enemies.list) {
      const v = z.root.position.clone().sub(feet()), d = v.length(); if (d > 450) continue;
      const p = chest(z).project(camera); if (p.z < 1 && Math.abs(p.x) < .95 && Math.abs(p.y) < .95) continue;
      const a = Math.atan2(v.dot(right), v.dot(fwd)), cx = W / 2 + Math.sin(a) * 120, cy = H / 2 - Math.cos(a) * 120;
      g.save(); g.translate(cx, cy); g.rotate(a); g.globalAlpha = .45 + .5 * (1 - d / 450); g.fillStyle = '#ff7a1a';
      g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 6); g.lineTo(-8, 6); g.closePath(); g.fill(); g.restore();
    }
  }

  // ======================================== Elemental Pop ========================================
  // Bullets (and with augments, equipment and enemy hits) sometimes set off a random ammo mod, then a cooldown.
  let popReady = 0, popping = false;
  function popOn(z, ignoreCooldown = false) {
    const A = window.kino?.ammoMods; if (!A || !alive(z)) return;
    if (!ignoreCooldown && now() < popReady) return; popReady = now() + 5 * (1 - stat('ep.chill'));
    const own = session.weapon?.ammoMod?.id, id = stat('ep.citrus') && own ? own : A.MODS[Math.floor(Math.random() * A.MODS.length)].id;
    popping = true; try { A.trigger(id, z, 1); host.emit('ammoModFired', { id, tier: 1, enemy: z, pop: true }); } finally { popping = false; }   // the event: research augments react as to a gun's own proc
  }
  let lastReload = 0, cherryReady = 0;

  // ======================================== Melee Macchiato ========================================
  // The melee becomes a punch that one-shots zombies through round 20 (30 with Strength Training) and throws them back.
  const pushes = [];
  function knock(z, from, dist) { const dir = z.root.position.clone().sub(from).setY(0); if (dir.lengthSq() < 1) return; pushes.push({ z, v: dir.normalize().multiplyScalar(dist / .2), t: .2 }); }
  let boostUntil = 0, meleeWas = 0;
  (window.kino ??= {}).bo7Perks = { speedMul: () => (has(MM) && now() < boostUntil ? 1 + stat('mm.stick') : 1), webBlast, summonWisp, popOn, get wisp() { return wisp; } };

  // ---- damage hooks ------------------------------------------------------------------------------------------------
  host.on('beforeEnemyDamage', e => {
    const z = e.enemy; if (!z) return;
    if (has(MM) && e.melee) {
      const cap = 20 + stat('mm.strength');
      e.amount = (session.round ?? 1) <= cap ? Math.max(e.amount, (z.health ?? 0) + 1) : Math.max(e.amount, 2700);
    }
    if (has(DP) && e.cause === 'bullet' && !e.head && stat('dp.crit') && Math.random() < stat('dp.crit')) e.amount *= session.def?.headMultiplier ?? 2;   // Critical Eye
    if (has(EP) && stat('ep.bean') && z.amod && Math.max(z.amod.markUntil ?? 0, z.amod.slowUntil ?? 0, z.amod.stunUntil ?? 0) > now()) e.amount *= 1 + stat('ep.bean');   // Vulnera Bean
    if (has(EP) && !popping) {
      const gun = e.cause === 'bullet' && !e.melee, kit = (e.cause === 'explosion' || e.cause === 'grenade') && stat('ep.pineapple');
      if ((gun && Math.random() < .06) || (kit && Math.random() < .15)) queueMicrotask(() => popOn(z));
    }
    if (has(WW) && e.melee) {   // the knife (and the punch) can web what it hits; Widow's Bite: free web explosions
      if (Math.random() < .2) hold(z, 6, 1, 3, true);
      if (stat('ww.bite') && Math.random() < stat('ww.bite')) queueMicrotask(() => webBlast(z.root.position.clone(), true));
    }
    if (has(WW) && stat('ww.sticky') && (e.cause === 'explosion' || e.cause === 'grenade')) queueMicrotask(() => { if (alive(z)) hold(z, 6, .7, 2, true); });   // Sticky Grenade
    if (has(MM) && e.melee) queueMicrotask(() => {
      if (stat('mm.vampire')) heal(stat('mm.vampire'));
      if (alive(z)) knock(z, feet(), 110);
      boostUntil = now() + 2;
      if (stat('mm.triple')) {   // Triple Shot: the punch carries into two more in front
        const fwd = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(); let n = 0;
        for (const o of [...enemies.list]) { if (o === z || n >= 2) continue; const v = o.root.position.clone().sub(feet()).setY(0); if (v.length() < 110 && v.normalize().dot(fwd) > .5) { n++; enemies.hurt(o, (session.round ?? 1) <= 20 + stat('mm.strength') ? o.health + 1 : 2700, false, true, 'melee'); } }
      }
    });
  });
  host.on('ammoModFired', ({ enemy }) => {
    if (has(DP) && stat('dp.stare') && enemy && alive(enemy) && enemy.health < (enemy.maxHealth ?? enemy.health * 4) * .25 && Math.random() < stat('dp.stare'))   // Death Stare
      enemies.hurt(enemy, enemy.health + 1, false, false, 'elemental');
    if (has(EP) && stat('ep.rainbow') && !popping && enemy && Math.random() < stat('ep.rainbow')) queueMicrotask(() => popOn(enemy, true));   // Rainbow Pop
  });
  host.on('kill', e => {
    for (const o of keyed.get(e.enemy?.root) ?? []) o.visible = false;   // corpses lose their outline
    if (e.remote) return; const z = e.enemy, at = z?.root?.position?.clone(); if (!at) return;
    if (has(VA)) {
      const r = Math.random();
      if (r < .1) drop(at, Math.random() < .5 ? 'ammo' : 'points');
      if (e.head && stat('va.luggage') && Math.random() < stat('va.luggage')) drop(at, 'points', 50);
      if (stat('va.picky') && Math.random() < stat('va.picky')) drop(at, 'grenade');
      if (special(z) && stat('va.serving') && Math.random() < stat('va.serving')) drop(at, 'big', 250);
      const cloudChance = Math.max(stat('va.fetid'), stat('va.smell'));
      if (cloudChance && Math.random() < cloudChance) { const s = sprite(0x6fff5a, 190, .35); s.position.copy(at).y += 30; scene.add(s); clouds.push({ s, at, r: 95, until: now() + 8, smell: !!stat('va.smell'), fetid: !!stat('va.fetid') }); }
    }
    if (has(WT) && !wisp && now() >= wispRest) { wispCharge++; if (wispCharge >= WISP_KILLS) { wispCharge = 0; summonWisp(); } }
    if (has(EP) && stat('ep.mint') && z.amod && Math.max(z.amod.markUntil ?? 0, z.amod.slowUntil ?? 0) > now()) popReady = 0;   // Refresh Mint
    if (has(DP)) {
      if (stat('dp.change')) points(stat('dp.change'));   // Extra Change
      if (special(z) && stat('dp.treasure') && Math.random() < stat('dp.treasure')) { const t = ['double_points', 'insta_kill', 'full_ammo', 'nuke'][Math.floor(Math.random() * 4)]; powerups?.spawn?.(t, at); }   // Treasure Hunter
    }
    if (has(MM) && e.melee) {
      if (stat('mm.mugging') && session.weapon && session.def) { const w = session.weapon, n = Math.min(w.reserve ?? 0, Math.ceil((session.def.clipSize ?? 0) * stat('mm.mugging')), (session.def.clipSize ?? 0) - w.mag); if (n > 0) { w.mag += n; w.reserve -= n; } }
      if (stat('mm.barista')) points(stat('mm.barista'));
      if (stat('mm.maul')) { for (const o of [...enemies.list]) if (o.root.position.distanceTo(at) < 130) { enemies.hurt(o, Math.max(500, o.health * .5), false, false, 'melee'); if (alive(o)) knock(o, at, 90); } fx(at.clone().add(new THREE.Vector3(0, 20, 0)), .6, 0xc58a4a); }   // Mocha Maul
    }
  });

  // ---- every frame -------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    const t = now(), f = feet();
    for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t -= dt; b.line.material.opacity = Math.max(0, b.t / .22); if (b.t <= 0) { b.line.removeFromParent(); b.line.geometry.dispose(); b.line.material.dispose(); bolts.splice(i, 1); } }
    for (let i = webs.length - 1; i >= 0; i--) { const w = webs[i]; w.t += dt; const k = Math.min(1, w.t / .3), e = 1 - (1 - k) ** 3;
      if (w.lines) w.mesh.scale.setScalar(w.from + (w.to - w.from) * e); else w.mesh.scale.setScalar(w.from + (w.to - w.from) * e);
      w.mesh.material.opacity = (w.lines ? .8 : .9) * Math.min(1, (w.life - w.t) / .5);
      if (w.t >= w.life) { w.mesh.removeFromParent(); w.mesh.geometry.dispose(); w.mesh.material.dispose(); webs.splice(i, 1); } }
    // held zombies
    for (const [z, h] of held) {
      if (!alive(z) || t > h.until) { h.cocoon?.removeFromParent(); h.web?.removeFromParent(); held.delete(z); continue; }
      const k = h.frozenUntil > t ? 1 : h.slow, p = z.root.position;
      p.x = h.prev.x + (p.x - h.prev.x) * (1 - k); p.z = h.prev.z + (p.z - h.prev.z) * (1 - k); h.prev.copy(p);
      if (h.cocoon && h.frozenUntil <= t) { h.cocoon.removeFromParent(); h.cocoon = null; }
    }
    for (let i = pushes.length - 1; i >= 0; i--) { const q = pushes[i]; q.t -= dt; if (!alive(q.z) || q.t <= 0) { pushes.splice(i, 1); continue; }
      const step = q.v.clone().multiplyScalar(dt), from = q.z.root.position.clone().add(UP), to = from.clone().add(step);
      if (world?.lineClear?.(from, to) ?? true) q.z.root.position.add(step); else pushes.splice(i, 1); }
    // Vulture Aid drops and gas clouds
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.s.position.y = d.base + Math.sin(t * 4 + i) * 3;
      if (t > d.until || !has(VA)) { d.s.removeFromParent(); drops.splice(i, 1); continue; }
      if (d.s.position.clone().setY(f.y).distanceTo(f) < 60 + stat('va.reach')) { pickup(d); d.s.removeFromParent(); drops.splice(i, 1); }
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i]; c.s.material.opacity = .35 * Math.min(1, (c.until - t) / 2);
      if (t > c.until) { c.s.removeFromParent(); clouds.splice(i, 1); continue; }
      if (c.fetid && has(VA) && c.at.distanceTo(f) < c.r) window.kino?.classes?.addCharge?.(dt * 2);   // Fetid Upgr-aid: standing in the gas charges your class skill
    }
    // Widow's Wine: Web Spinner field, Hatchlings
    if (spinner) { if (t > spinner.until || !has(WW)) spinner = null; else for (const z of enemies.list) if (z.root.position.distanceTo(f) < spinner.r) hold(z, .3, .45); }
    for (let i = hatchlings.length - 1; i >= 0; i--) {
      const h = hatchlings[i]; if (t > h.until) { h.s.removeFromParent(); hatchlings.splice(i, 1); continue; }
      const z = nearest(h.s.position, 500);
      if (z) { const to = chest(z).sub(h.s.position); if (to.length() > 30) h.s.position.addScaledVector(to.normalize(), dt * 260); else if (t > h.next) { h.next = t + .8; enemies.hurt(z, 250 + (session.round ?? 1) * 40, false, false, 'spider'); hold(z, 2, .7); } }
      else h.s.position.lerp(f.clone().add(new THREE.Vector3(30, 20, 0)), dt * 2);
    }
    // Wisp Tea
    if (wisp) {
      if (t > wisp.until || !has(WT)) { wisp.s.removeFromParent(); wisp = null; wispRest = t + 120 * (1 - stat('wt.haste')); }
      else {
        // floats off your right shoulder, in view, with a slow lazy loop (BO7's wisp keeps near you)
        wisp.a += dt * 1.2; const cam = camera.getWorldPosition(new THREE.Vector3()), fw = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), rt = new THREE.Vector3(-fw.z, 0, fw.x);
        const home = cam.clone().addScaledVector(fw, 70).addScaledVector(rt, 30 + Math.cos(wisp.a) * 6).add(new THREE.Vector3(0, 6 + Math.sin(wisp.a * 1.7) * 4, 0));
        if (wisp.mask === 'distraction') { wisp.s.position.lerp(f.clone().add(camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().multiplyScalar(260)).setY(f.y + 60), dt * 1.5); }
        else wisp.s.position.lerp(home, Math.min(1, dt * 4));
        if (t > wisp.next) {
          if (wisp.mask === 'benevolence') { wisp.next = t + 2; heal(10); }
          else if (wisp.mask === 'distraction') { wisp.next = t + 1.5; for (const z of [...enemies.list]) if (z.root.position.distanceTo(wisp.s.position) < 140 && !lastZombie()) enemies.hurt(z, (z.maxHealth ?? 300) * .12, false, false, 'wisp'); }
          else {
            const z = nearest(f, WISP_RANGE);
            // a third of a zombie's health a strike (half with Mask of Wrath): it softens what reaches you, it doesn't clear rounds
            if (z && !lastZombie()) { wisp.next = t + WISP_EVERY * (wisp.mask === 'wrath' ? .8 : 1); bolt(wisp.s.position.clone(), chest(z), 0x5fb0ff);
              enemies.hurt(z, (z.maxHealth ?? 300) * (.34 + .16 * stat('wt.wrath')), false, false, 'wisp'); }
            else wisp.next = t + .3;
          }
        }
        if (stat('wt.fetcher')) for (const p of powerups?.items ?? []) if (p.root.position.distanceTo(f) < 900) p.root.position.lerp(f.clone().setY(p.root.position.y), Math.min(1, dt * 3));
      }
    }
    // Death Perception keylines
    const range = 750 + stat('dp.insight');
    for (const z of enemies.list) {
      let k = keyed.get(z.root); if (!k && has(DP)) { k = keyline(z.root, keyMat); keyed.set(z.root, k); }
      if (k) {
        // only zombies the map hides from you: a clear line from your eye to the chest or head means no outline (its own
        // arm in front of its body counted as "hidden" and drew orange on zombies in plain sight); checked 6x a second
        if (has(DP) && (t >= (z.dpNext ?? 0))) { z.dpNext = t + .16; const eye = camera.getWorldPosition(new THREE.Vector3()), c = chest(z), hd = c.clone().add(new THREE.Vector3(0, 22, 0));
          z.dpHidden = !(world?.lineClear?.(eye, c) ?? false) && !(world?.lineClear?.(eye, hd) ?? false); }
        const on = has(DP) && z.dpHidden && z.root.position.distanceTo(f) < range; for (const o of k) o.visible = on && o.userData.of.visible; }
    }
    if (has(DP) && stat('dp.gems')) for (const p of powerups?.items ?? []) if (!keyed.has(p.root)) keyed.set(p.root, keyline(p.model, gemMat));
    if (has(DP) && stat('dp.birds')) drawArrows(); else if (arrows) arrows.getContext('2d').clearRect(0, 0, arrows.width, arrows.height);
    // Elemental Pop: Electric Cherry on starting a reload, stronger the emptier the magazine
    const rl = session.reloadLeft ?? 0;
    if (has(EP) && stat('ep.cherry') && rl > 0 && lastReload <= 0 && t >= cherryReady && session.def) {
      cherryReady = t + 1.5; const empty = 1 - (session.weapon?.mag ?? 0) / Math.max(1, session.def.clipSize ?? 1), R = 120 + 80 * empty;
      for (const z of [...enemies.list]) if (z.root.position.distanceTo(f) < R) { bolt(f.clone().add(new THREE.Vector3(0, 40, 0)), chest(z), 0x7fd8ff); enemies.hurt(z, (150 + (session.round ?? 1) * 60) * (.3 + empty), false, false, 'electric'); if (alive(z) && !special(z)) hold(z, 1.5, 1, 1.5, false, false); }
      fx(f.clone().add(new THREE.Vector3(0, 30, 0)), .4 + .5 * empty, 0x7fd8ff);
    }
    lastReload = rl;
    // Melee Macchiato: Expresso shortens each melee
    const ml = session.meleeLeft ?? 0; if (has(MM) && stat('mm.expresso') && ml > meleeWas + .05) session.meleeLeft = ml * (1 - stat('mm.expresso')); meleeWas = session.meleeLeft ?? 0;
  });
  host.on('reset', () => {
    for (const d of drops) d.s.removeFromParent(); drops.length = 0; for (const c of clouds) c.s.removeFromParent(); clouds.length = 0;
    for (const [, h] of held) { h.cocoon?.removeFromParent(); h.web?.removeFromParent(); } held.clear(); for (const w of webs) w.mesh.removeFromParent(); webs.length = 0; for (const h of hatchlings) h.s.removeFromParent(); hatchlings.length = 0;
    if (wisp) wisp.s.removeFromParent(); wisp = null; wispCharge = 0; wispRest = 0; salvations = 3; widowReady = 0; popReady = 0; spinner = null;
  });
}
