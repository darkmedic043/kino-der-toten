// The Reaper Collection perks (BO3 workshop mod 3814067303 by Logical Reaper), working but SWITCHED OFF (user,
// 2026-10-18: "add the functions of all of them" -> "working, but switched off"): every effect below runs for a player
// who holds the perk, but nothing sells them yet. No machine, terminal, gobblegum or map gives them; only the cheat
// console does (`reaper <id|all|list|none>`, `reaper up <id|all>` for the upgraded "double buy" version). They are in
// the perk table (offSale) only so the HUD shows their icon while held.
// Switched ON (REAPER_ON, user 2026-10-18): Prismatic Punch and Dam-A-Nade. The terminal's PERKS app sells them once
// their Melon Pass reward is owned (page 6 / page 8), and their double-buy upgrade is replaced by an 8-augment research
// track each (research.json, read here through kino.research.stat).
// Catalogue (names, effects, upgrades, origin): reaper-perks.json; one section per perk with the numbers chosen here:
// docs/fork/reaper-perks.md. The mod's scripts weren't decompiled, so every number here is ours, picked to fit the
// sheet's text and this game's zombie health (zh = zombieHealth(round): 1045 at round 10, 3953 at 24).
import * as THREE from 'three';
import { zombieHealth } from '../../rules.js';

const UP = new THREE.Vector3(0, 40, 0);
// the switched-on perks' perk table entries (perks-plus MORE_PERKS adds them; terminal: mods/terminal-booth/desktop.js PERKS)
export const REAPER_ON = {
  specialty_prismatic_punch: { name: 'Prismatic Punch', price: 3500, color: '#c89bff', icon: 'PP', reaper: 'prismatic' },
  specialty_damnade: { name: 'Dam-A-Nade', price: 3000, color: '#8a9a4a', icon: 'DN', reaper: 'damnade' },
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function setupReaperPerks(api, catalogue, base) {
  const { host, session, player, enemies, scene, camera, audio, world, powerups, announce, toast, data } = api;
  const ids = Object.fromEntries(Object.entries(catalogue).filter(([, e]) => e.new).map(([id, e]) => [id, e.specialty]));
  const S = id => ids[id];
  const upgraded = new Set();
  const has = id => !!session.perks?.has(S(id));
  const up = id => has(id) && upgraded.has(id);
  const now = () => session.time ?? 0;
  const alive = z => enemies.list.includes(z);
  const feet = () => player.getFeetPosition();
  const chest = z => z.root.position.clone().add(UP);
  const zh = () => zombieHealth(session.round ?? 1, data?.rules ?? {});
  const basic = z => !z.kind || z.kind === 'zombie';
  const boss = z => z.kind === 'panzer' || z.boss;
  const heal = n => { session.health = Math.min(session.maxHealth, session.health + n); };
  const pts = n => { session.points += Math.round(n); };   // straight onto the score: Double Points doesn't double perk bonuses
  const near = (at, r, fn) => { for (const z of [...enemies.list]) if (z.root.position.distanceTo(at) < r) fn(z, z.root.position.distanceTo(at)); };
  const nearest = (at, r, skip) => { let b = null, bd = r; for (const z of enemies.list) { if (skip?.has?.(z) || z === skip) continue; const d = z.root.position.distanceTo(at); if (d < bd) { bd = d; b = z; } } return b; };
  const hurt = (z, n, cause = 'perk', head = false) => { if (alive(z)) enemies.hurt(z, n, head, false, cause); };
  const blast = (at, r, n, cause = 'explosion', skip) => { const from = at.clone().add(V(0, 20, 0)); near(at, r, (z, d) => { if (z === skip) return; if (world?.lineClear?.(from, chest(z)) ?? true) hurt(z, n * (1 - .5 * d / r), cause); }); };
  const fx = (at, s, c) => window.kino?.fx?.explosion?.(at.clone(), s, c);
  const fwd = () => camera.getWorldDirection(V()).setY(0).normalize();
  const sound = (id, kind, v = .8) => { const k = 'reaper/' + id + '/' + kind; if (audio?.manifest?.[k]) audio.play(k, v); };
  const sprinting = () => !!(api.view?.input?.sprint ?? player.input?.sprint);
  const stat = k => window.kino?.research?.stat?.(k) ?? 0;   // research augments of the switched-on perks (only counts perks you hold)

  // ---- shared visuals -----------------------------------------------------------------------------------------------
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, '#fff'); r.addColorStop(.35, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const sprite = (color, size, opacity = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); return s; };
  const temp = [];   // {o, until, fade, update?}: short-lived objects removed and disposed when they expire
  const keep = (o, life, update) => { scene.add(o); temp.push({ o, until: now() + life, life, update }); return o; };
  const disc = (at, r, color, opacity = .5) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at).y += 2; return m; };
  const ring = (at, r, color) => { const m = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at).y += 3; keep(m, .45, (o, k) => { o.scale.setScalar(10 + r * k); o.material.opacity = .8 * (1 - k); }); };
  function bolt(a, b, color) {
    const p = [], n = Math.max(3, Math.round(a.distanceTo(b) / 20));
    for (let k = 0; k <= n; k++) { const q = a.clone().lerp(b, k / n); if (k && k < n) q.add(V((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12)); p.push(q); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.frustumCulled = false; keep(l, .22, (o, k) => { o.material.opacity = 1 - k; });
  }

  // ---- zombie status: slow / freeze (pulled back toward last position, as bo7-perks' webs), burn, tint ---------------
  const held = new Map();   // z -> {prev, until, slow, frozenUntil, tint}
  function slow(z, dur, k, frozen = 0, tint = null) {
    if (!alive(z) || boss(z)) return;
    const h = held.get(z) ?? { prev: z.root.position.clone() };
    h.until = Math.max(h.until ?? 0, now() + dur); h.slow = Math.max(h.until > now() && h.slow || 0, k); h.frozenUntil = Math.max(h.frozenUntil ?? 0, now() + frozen);
    if (tint && !h.glow) { h.glow = sprite(tint, 70, .35); h.glow.position.y = 36; z.root.add(h.glow); }
    held.set(z, h);
  }
  const burning = new Map();   // z -> {until, dps, explode}
  function burn(z, dur, dps, explode = 0) {
    if (!alive(z)) return; const b = burning.get(z) ?? {}; b.until = Math.max(b.until ?? 0, now() + dur); b.dps = Math.max(b.dps ?? 0, dps); b.explode = Math.max(b.explode ?? 0, explode);
    if (!b.glow) { b.glow = sprite(0xff6a1a, 46, .6); b.glow.position.y = 40; z.root.add(b.glow); } burning.set(z, b);
  }
  // zombies that should ignore you (a decoy, Zombshell's field): enemies.lureTarget returns a point for them to walk to
  const lures = [];   // {at, r, until}
  let hidden = false;
  const lure = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    for (const l of lures) if (now() < l.until && z.root.position.distanceTo(l.at) < l.r) return l.at;
    if (hidden) return z.root.position;
    return lure ? lure(z) : null;
  };

  // ---- extra movement speed (layered over perks-plus' getters) -------------------------------------------------------
  let speedMul = 1;
  for (const key of ['moveSpeed', 'sprintSpeed']) {
    const d = Object.getOwnPropertyDescriptor(player, key); let base = player[key];
    Object.defineProperty(player, key, { configurable: true, get: () => (d?.get ? d.get() : base) * speedMul, set: v => { if (d?.set) d.set(v); else base = v; } });
  }

  // ---- HUD: one chip per perk that has charges, a cooldown or a meter ------------------------------------------------
  const style = document.createElement('style'); style.textContent = `#reaper-chips{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:none;z-index:3;font:700 10px/1 Arial,sans-serif;color:#eee;text-shadow:0 1px 2px #000}
    #reaper-chips span{padding:3px 6px;border-radius:3px;background:#000a;border:1px solid #ffffff30}#reaper-chips span.on{border-color:#ffd27a;color:#ffd27a}body.menu-open #reaper-chips{visibility:hidden}
    #reaper-veil{position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;transition:opacity .25s}`;
  document.head.append(style);
  const chipsEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'reaper-chips' }));
  const veil = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'reaper-veil' }));
  const chips = [];   // [() => [text, on] | null]
  const chip = fn => chips.push(fn);
  let chipT = 0;

  // =================================================================================================================
  // Death and damage: an outermost session.damage wrapper (installed once every mod has set up, so it wraps the co-op
  // mod's downs) decides lethal hits before anything else: Guardian Angel, Dying Wish, Tombstone, Fighter's Fizz and
  // Who's Who can take the hit; Nuka Cola goes off when nothing did. Inner beforeDamage handlers (the rocket shield)
  // still run for hits that get through.
  // =================================================================================================================
  let stand = null;          // Fighter's Fizz last stand {until}
  let dyingUntil = 0, dyingReady = 0, angelCharge = 1, angelKills = 0;
  const ANGEL_KILLS = 20;
  const ghost = { body: null };   // Who's Who: the downed body {at, perks, inventory, slot, until, turret}
  function saveLethal(n) {
    const t = now();
    if (has('dyingwish') && t >= dyingReady) {   // 9 s on 1 health, invulnerable; 5 min cooldown
      dyingReady = t + 300; dyingUntil = t + 9; session.health = 1; session.effects.invulnerable = t + 9;
      announce?.('DYING WISH', 'DEATH DENIED · 9 SECONDS', 2.5); sound('dyingwish', 'start'); tint('#ff2a2a55', 9); return true;
    }
    if (has('tombstone') && !coop()) {   // solo: every gun but one (random) is sacrificed to get back up
      const keepW = session.inventory[Math.floor(Math.random() * session.inventory.length)];
      session.inventory = [keepW]; session.slot = 0; session.cancelReload?.(); api.equipView?.();
      session.perks.delete(S('tombstone')); session.health = session.maxHealth; session.effects.invulnerable = t + 3;
      announce?.('TOMBSTONE', 'YOUR GUNS PAID FOR YOUR LIFE', 3); return true;
    }
    if (has('ffyl') && !stand) {   // last stand: invulnerable and slowed; a kill brings you back up with every perk
      stand = { until: t + 10 * (has('downers') ? (up('downers') ? 3 : 2) : 1) }; session.health = 1; session.effects.invulnerable = stand.until;
      announce?.("FIGHTER'S FIZZ", 'GET A KILL TO GET BACK UP', 3); tint('#ff3a1a66', 99); return true;
    }
    if (has('whoswho') && !ghost.body) { whosWho(); return true; }
    return false;
  }
  function nukaGoesOff() { if (has('nukacola') && powerups?.onCollect) { powerups.onCollect('nuke', feet()); announce?.('NUKA COLA', 'NUKE!', 2); } }
  let wrapped = false;
  function wrapDamage() {
    if (wrapped) return; wrapped = true;
    const inner = session.damage.bind(session);
    session.damage = n => {
      if (['reviving', 'gameover'].includes(session.phase) || session.effects.invulnerable > now()) return inner(n);
      if (n > 0 && has('guardianangel')) {
        if (angelCharge >= 1) { angelCharge = 0; angelKills = 0; session.effects.invulnerable = now() + 5; tint('#fff2a855', 5); announce?.('GUARDIAN ANGEL', '5 SECONDS', 1.5); return true; }
        if (up('guardianangel')) { const r = inner(n); session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, now() + .6); return r; }
      }
      if (n > 0 && has('stronghold') && armour > 0) { const a = Math.min(armour, n); armour -= a; n -= a; sound('stronghold', 'armour_hit', .5); if (armour <= 0) sound('stronghold', 'armour_broken'); if (n <= 0) return true; }
      if (n >= session.health) {
        if (saveLethal(n)) return true;
        const had = new Set(session.perks); const r = inner(n);
        if (had.has(S('nukacola'))) nukaGoesOff();
        return r;
      }
      return inner(n);
    };
  }
  const coop = () => !!window.kino?.coop?.code;
  function tint(color, secs) { veil.style.background = `radial-gradient(ellipse,transparent 40%,${color})`; veil.style.opacity = 1; veil.dataset.until = now() + secs; }

  // ---- Who's Who: you leave your body and come back as a clone nearby with the gun in your hands -----------------------
  function whosWho() {
    const at = feet(), t = now(), perks = [...session.perks].filter(p => p !== S('whoswho'));
    const body = new THREE.Group(); body.position.copy(at); const s = sprite(0x7fd0ff, 60, .5); s.position.y = 20; body.add(s);
    const lie = new THREE.Mesh(new THREE.CapsuleGeometry(12, 50, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6a90b0, transparent: true, opacity: .6 }));
    lie.rotation.z = Math.PI / 2; lie.position.y = 12; body.add(lie); scene.add(body);
    ghost.body = { at, body, perks, inventory: session.inventory.slice(), slot: session.slot, until: t + 30, fire: 0 };
    // the clone: the gun you were holding (all of them, upgraded), full health, perks stay with the body
    if (!up('whoswho')) { session.inventory = [session.inventory[session.slot] ?? session.inventory[0]]; session.slot = 0; api.equipView?.(); }
    session.perks.clear(); session.health = session.maxHealth; session.effects.invulnerable = t + 2;
    let spot = null; for (const a of [0, 1.6, 3.1, 4.7, .8, 2.4]) { const p = at.clone().add(V(Math.cos(a) * 420, 0, Math.sin(a) * 420)); const c = world?.closest?.(p, { x: 60, y: 80, z: 60 }); if (c && Math.abs(c.y - at.y) < 90) { spot = c; break; } }
    if (spot) player.setPosition(spot);
    announce?.("WHO'S WHO", 'REVIVE YOUR BODY WITHIN 30 S TO KEEP YOUR PERKS', 4); tint('#4fb0ff44', 30);
  }
  host.prompts?.push({
    find(cam) { const b = ghost.body; if (!b) return null; const d = b.at.distanceTo(feet()); return d < 90 ? { text: 'Revive yourself', distance: d } : null; },
    use() { const b = ghost.body; if (!b) return false;
      for (const p of b.perks) session.perks.add(p); session.inventory = b.inventory; session.slot = Math.min(b.slot, b.inventory.length - 1); api.equipView?.();
      b.body.removeFromParent(); ghost.body = null; tint('#0000', 0); announce?.("WHO'S WHO", 'BACK IN YOUR OWN SKIN', 2); return true; },
  });

  // =================================================================================================================
  // Perk by perk. Each block says what it does and the numbers chosen.
  // =================================================================================================================

  // ---- Banana Colada: sliding leaves a slick; zombies crossing it slip (a stagger) and take damage. Upgrade: x2 damage.
  const puddles = [];
  host.on('slide', () => { if (has('banana')) puddleT = 0; });
  let puddleT = 0;
  // ---- Bandolier Bandit: reserve ammo +50% (refills top up to it). Upgrade: stowed guns refill their magazines.
  let bandT = 0;
  // ---- Blaze Phase: hold crouch while standing still to charge (1.5 s, 3 s upgraded), let go to launch forward in flames.
  let blaze = 0, blazeRun = null;
  // ---- Blood Bullets: the gun in hand refills itself from reserve, faster for bigger magazines. Upgrade: stowed and
  //      wonder weapons too.
  let bloodT = 0, bloodStowT = 0;
  const wonder = def => def?.weaponClass === 'Wonder weapon' || /thunder|tesla|wave|zap|bow_|dg2|annihil/.test(def?.baseId ?? def?.id ?? '');
  // ---- Blood Wolf Bite: dealing 3 zh of damage within 3 s summons a spectral wolf for 20 s (60 s cooldown, 40 upgraded)
  const dmgLog = []; let wolf = null, wolfReady = 0; const wolfDrops = [];
  // ---- Bull Ice Blast: a second jump in the air; crouch after it to slam down and freeze everything within 160 (320).
  let jumpHeld = false, airJumped = false, slamming = false;
  // ---- Cashback Cocktail: 20% of every purchase back (30% upgraded).
  const spend = session.spend?.bind(session);
  if (spend) session.spend = n => { const ok = spend(n); if (ok && n > 0 && has('cashback')) { const back = Math.round(n * (up('cashback') ? .3 : .2)); pts(back); toast?.(`Cashback · +${back}`, 1.2); } return ok; };
  // ---- Change Chews: headshots (15%) set off the current element at the zombie; the element changes below 40% health.
  const ELEMENTS = [['fire', 0xff6a1a], ['ice', 0x8fd6ff], ['electric', 0x7f9cff], ['poison', 0x6fff5a]];
  let element = 0, wasLow = false;
  function chew(z) {
    const [el, c] = ELEMENTS[element], at = z.root.position.clone(), R = 110 * (up('changechews') ? 1.5 : 1), k = up('changechews') ? 1.5 : 1;
    fx(at.clone().add(V(0, 30, 0)), .5, c); ring(at, R, c);
    near(at, R, o => {
      if (el === 'fire') burn(o, 4 * k, zh() * .2 * k);
      else if (el === 'ice') slow(o, 2.5 * k, 1, 2.5 * k, 0x8fd6ff);
      else if (el === 'electric') { bolt(chest(z), chest(o), c); hurt(o, zh() * .5 * k, 'electric'); slow(o, 1, .8); }
      else poison.push({ at, r: R, until: now() + 4 * k, dps: zh() * .15 * k });
    });
  }
  const poison = [];
  // ---- Crusader's Ale: melee kills pay double, the knife hits twice as hard, the rocket shield repairs itself at the
  //      end of each round. Upgrade: kills sometimes patch the shield (10%: 100).
  // ---- Dam-A-Nade: explosions x1.5 (x2 upgraded); one more grenade (5) and the lot refilled each round, +1 monkey.
  // ---- Downer's Delight: co-op bleed-out x2 (x3 upgraded; multiplayer mod), Fighter's Fizz's last stand too.
  window.kino.coopBleedMul = () => has('downers') ? (up('downers') ? 3 : 2) : 1;
  // ---- Electric Cherry (BO2): starting a reload sets off a burst, bigger and harder the emptier the magazine.
  let lastReload = 0, cherryReady = 0;
  // ---- Estatic Elixir: sprinting crackles, stunning zombies within 80 every 0.5 s. Upgrade: every 10 stuns store a
  //      charge (max 4); a charge goes off (radius 200 stun) when you're hit.
  let staticT = 0, stuns = 0, staticCharges = 0;
  // ---- Ethereal Razor: melee x3 (x6 upgraded) and it carries to the others in front of you; each melee hit heals 10.
  // ---- Fighter's Fizz: see saveLethal (10 s last stand; a kill gets you up with your perks; the perk is used up unless
  //      upgraded).
  // ---- I.C.U.: health regenerates 25/s on top, +25% speed under 35% health, invulnerable while drinking or buying.
  //      Upgrade: both linger 2 s.
  let icuLinger = 0;
  // ---- Inciner-Brandy: bullet hits (10%) set zombies alight (4 s, 6 upgraded; 15% zh a second); fire kills explode
  //      (25%, radius 100).
  // ---- Madgaz Moonshine: each slide explodes (radius 140, 1 zh), 20 a round (30); bullets ignite 5% (10%).
  let slidesLeft = 20;
  host.on('slide', () => {
    if (!has('moonshine') || slidesLeft <= 0) return; slidesLeft--;
    const at = feet(); blast(at, 140, zh()); fx(at.clone().add(V(0, 10, 0)), .8, 0xff8a2a); ring(at, 140, 0xff8a2a); audio?.play?.('explosion', .5);
  });
  // ---- Magnet Margarita: power-ups drift to you (120/s, 240 upgraded) and stop 90 short. Upgrade: kills drop a bonus
  //      power-up 2% of the time.
  // ---- Miracle Hands Mocha: F at a power-up changes it (3 times each, 4 upgraded); upgraded: never Carpenter or Nuke,
  //      and a Max Ammo you pick up is a free perk too. Faster equipment: grenade/monkey throws aren't timed here.
  const MOCHA_POOL = ['nuke', 'insta_kill', 'double_points', 'full_ammo', 'carpenter', 'fire_sale'];
  // ---- Momentum Mojito: sprinting builds momentum over 4 s (+35% speed at full); at full, with kill mode on, zombies
  //      you run past take 2 zh and use a charge (10, 15 upgraded; kills give them back). Double-tap sprint toggles
  //      kill mode. Upgrade: sliding keeps momentum.
  let momentum = 0, killMode = true, charges = 10, lastShift = 0;
  addEventListener('keydown', e => { if (!/Shift/.test(e.code) || e.repeat || !has('momentum')) return; const t = performance.now(); if (t - lastShift < 300) { killMode = !killMode; toast?.('Momentum · kill mode ' + (killMode ? 'on' : 'off'), 1.2); } lastShift = t; });
  // ---- Muscle Milk: a melee hit chains lightning to 4 more zombies (7 upgraded) within 150; 15 s cooldown (8 s).
  let milkReady = 0;
  // ---- Nitrogen Cooled: zombies within 250 (400) slow to a walk.
  // ---- No Bear Brew: no teddy bear from the box. Upgrade: 25% of spins are free.
  // ---- Nuka Cola: going down (or dying) sets off a Nuke. Upgrade: a power-up you pick up may bring another (25%,
  //      always after a Nuke).
  // ---- PhD Flopper (Cold War): sliding into zombies explodes (radius 160, 1.5 zh; more from a longer slide and after a
  //      drop when upgraded); explosive immunity: it counts as BO1's PhD for self-damage checks.
  let phdSlide = null;
  host.on('slide', () => { if (has('phdslider')) phdSlide = { start: feet(), top: feet().y, done: false }; });
  // ---- Pack-A-Box: box weapons come Pack-a-Punched 15% of the time (30% upgraded).
  // ---- Point Crusher: kills pay 10-50 extra 30% of the time; upgraded, a quarter of those double.
  // ---- Repairman Rum: one press rebuilds the whole window, double points, and boards you put up blow up when torn off.
  //      Upgrade: 4x the round's repair point cap, and a Carpenter does all of it.
  // ---- Spectre Shot: swapping guns with 10+ zombies within 600 summons a ghost of the previous gun for 8 s (12) that
  //      shoots the nearest zombie every 0.35 s; hits slow, kills put ammo back in that gun. 30 s cooldown (20).
  let lastWeapon = null, spectre = null, spectreReady = 0;
  // ---- Stone Cold Stronghold: stand still for 1 s and a ring forms; armour builds 20/s (35) up to 150 and soaks
  //      damage before health. Leaving the ring it drains 30/s (upgraded: holds 10 s first).
  let armour = 0, stillT = 0, ringMesh = null, leftAt = 0;
  // ---- Swarm Scotch: headshot kills (20%) and reloading an empty magazine release a swarm that follows you for 8 s,
  //      biting zombies within 120 every 0.5 s (15% zh, 25% upgraded). Upgrade: zombies that survive a bite set off
  //      another swarm when headshot (40%).
  let swarm = null, lastMag = null;
  // ---- Tactiquilla Sangria: fire while sprinting (engine `mods.sprintFire`), 15% of shots (30%) refund the round,
  //      multi-kills (within 0.5 s) pay 50 per extra kill (100).
  let lastShots = 0; const recentKills = [];
  // ---- Timeslip: box spins and Pack-a-Punch take half as long. Upgrade: box spins are instant, operator weapons and
  //      class skills charge 50% faster.
  // ---- Tombstone: solo, see saveLethal (one random gun kept, the rest pay for your life; used up). Co-op: bleeding out
  //      leaves your perks and guns in a tombstone by where you fell, yours to take for 60 s after you respawn
  //      (upgraded: until the end of that round + 60 s).
  let tomb = null, downSnap = null;
  // ---- Victorious Tortoise: the rocket shield blocks from every side while raised and explodes when it breaks
  //      (radius 200, 3 zh). Upgrade: double shield health.
  // ---- Vigor Rush: bullet hits on zombies burst (radius 60, 30% of the hit, at least 50; x2 upgraded).
  let vigorT = 0;
  // ---- Winter's Wail: getting hurt freezes zombies within 200 for 3 s (5 upgraded); 3 charges (4), one back a round.
  let wails = 3, wailReady = 0;
  // ---- Zombshell: bullet hits (8%) leave a slowing field (radius 120, 6 s): zombies in it are slowed and take +30%.
  //      Upgrade: while you stand in one, zombies ignore you.
  const shells = [];
  // ---- Bubble Blink Blast: melee while sprinting teleports you 300 ahead and leaves an afterimage that lures zombies
  //      for 5 s (8); 15 kills recharge it (2 charges upgraded).
  let blinks = 1, blinkKills = 0, meleeWas = 0;
  // ---- Guardian Angel Ale: see wrapDamage (a hit while charged = 5 s invulnerable; 20 kills recharge; upgraded: hits
  //      while charging give 0.6 s).
  // ---- Point Polosa: kills (3%) leave a point fountain for 8 s (+10 every 0.25 s within 70). Upgrade: 4% of kills drop
  //      a 10 s personal Double Points.
  const fountains = []; let polosaDouble = 0;
  host.on('beforePoints', e => { if (polosaDouble > now() && e.amount > 0) e.amount *= 2; });
  // ---- Prismatic Punch (switched on): bullet kills (15%, 45 s cooldown: PP_COOLDOWN, counted from when the wall goes down) raise an energy wall for 10 s; a bullet through
  //      it ricochets into the nearest zombie within 400; each hit grows it 10% (max x2, then 2 ricochets). Augments
  //      (pp.*): size (starts bigger), cooldown, chance, damage, afterglow (s at max size), scatter (each ricochet jumps on
  //      for that share of its damage), spectrum (chance of the gun's own ammo mod), nova (a maxed wall bursts when it fades).
  const walls = []; let wallReady = 0;
  const PP_COOLDOWN = 45;   // s from a wall going down to the next one (was 10 from it going up; user, 2026-10-18: "much longer", "starts only after the wall goes down")
  // ---- Who's Who: see whosWho (30 s to revive your body; upgraded, the body shoots and the clone keeps every gun).

  // ---- damage dealt -------------------------------------------------------------------------------------------------
  let lastVigor = 0;
  host.on('beforeEnemyDamage', e => {
    const z = e.enemy; if (!z) return; z.rpCause = e.cause;
    const bullet = e.cause === 'bullet' && !e.melee, expl = e.cause === 'explosion' || e.cause === 'grenade';
    if (has('damnade') && expl) {   // Dam-A-Nade: x1.5 (+ Demolition Expert), Concussion freezes and Incendiary burns what lives
      e.amount *= 1.5 + stat('dn.damage');
      if (stat('dn.stun') || stat('dn.burn')) queueMicrotask(() => { if (!alive(z)) return; if (stat('dn.stun')) slow(z, stat('dn.stun'), 1, stat('dn.stun'), 0xffd27a); if (stat('dn.burn')) burn(z, 4, zh() * stat('dn.burn')); });
    }
    if (e.melee) {
      if (has('crusade')) e.amount *= 2;
      if (has('razor')) { e.amount *= up('razor') ? 6 : 3; heal(10); queueMicrotask(() => { const f = fwd(); for (const o of [...enemies.list]) { if (o === z) continue; const v = o.root.position.clone().sub(feet()).setY(0); if (v.length() < 100 && v.normalize().dot(f) > .5) hurt(o, e.amount, 'melee'); } }); }
      if (dyingUntil > now() && basic(z)) e.amount = Math.max(e.amount, z.health + 1);
      if (has('milk') && now() >= milkReady) { milkReady = now() + (up('milk') ? 8 : 15); queueMicrotask(() => { const done = new Set([z]); let from = z; for (let i = 0; i < (up('milk') ? 7 : 4); i++) { const o = nearest(from.root.position, 150, done); if (!o) break; done.add(o); bolt(chest(from), chest(o), 0x8fb6ff); hurt(o, zh() * .8, 'electric'); from = o; } }); }
    }
    if (shells.some(s => s.until > now() && z.root.position.distanceTo(s.at) < s.r)) e.amount *= 1.3;
    if (bullet) {
      if (has('inferno') && Math.random() < .1) burn(z, up('inferno') ? 6 : 4, zh() * .15, .25);
      if (has('moonshine') && Math.random() < (up('moonshine') ? .1 : .05)) burn(z, 4, zh() * .15);
      if (has('changechews') && e.head && Math.random() < .15) queueMicrotask(() => alive(z) && chew(z));
      if (has('zombshell') && Math.random() < .08) { const at = z.root.position.clone(); const m = disc(at, 120, 0x9be36a, .25); shells.push({ at, r: 120, until: now() + 6, m: keep(m, 6) }); sound('zombshell', 'start', .5); }
      if (has('vigor') && now() - lastVigor > .05) { lastVigor = now(); const at = chest(z), n = Math.max(50, e.amount * .3) * (up('vigor') ? 2 : 1); queueMicrotask(() => { blast(at, 60, n, 'explosion', z); fx(at, .25, 0xffc04a); }); }
      if (up('swarmscotch') && z.swarmed && e.head && Math.random() < .4) startSwarm();
    }
    const log = { t: now(), n: Math.min(e.amount, Math.max(0, z.health)) }; dmgLog.push(log);
  });

  // ---- kills --------------------------------------------------------------------------------------------------------
  host.on('kill', e => {
    if (e.remote) return; const z = e.enemy, at = z?.root?.position?.clone(); if (!at) return; const t = now();
    if (stand && !['reviving', 'gameover'].includes(session.phase)) {   // Fighter's Fizz: back up
      stand = null; session.health = session.maxHealth; session.effects.invulnerable = t + 1.5; tint('#0000', 0);
      if (!up('ffyl')) session.perks.delete(S('ffyl')); else upgraded.delete('ffyl');
      announce?.("FIGHTER'S FIZZ", 'BACK ON YOUR FEET', 2);
    }
    if (has('crusade') && e.melee) pts(130);
    if (has('crusade') && up('crusade') && Math.random() < .1) window.kino?.rocketShield?.heal?.(100);
    if (has('pointcrusher') && Math.random() < .3) { let n = 10 + Math.floor(Math.random() * 41); if (up('pointcrusher') && Math.random() < .25) n *= 2; pts(n); }
    if (has('momentum')) charges = Math.min(up('momentum') ? 15 : 10, charges + 1);
    if (has('guardianangel') && angelCharge < 1 && ++angelKills >= ANGEL_KILLS) { angelCharge = 1; toast?.('Guardian Angel ready', 1.5); }
    if (has('bubbleblink') && blinks < (up('bubbleblink') ? 2 : 1) && ++blinkKills >= 15) { blinkKills = 0; blinks++; }
    if (has('swarmscotch') && e.head && Math.random() < .2) startSwarm();
    if (has('pointpolosa')) {
      if (Math.random() < .03) { const s = sprite(0xffd34f, 30); s.position.copy(at).y += 20; fountains.push({ at, until: t + 8, next: 0, s: keep(s, 8, (o, k) => { o.scale.setScalar(26 + Math.sin(now() * 8) * 6); }) }); }
      if (up('pointpolosa') && Math.random() < .04) { polosaDouble = t + 10; toast?.('Point Polosa · Double Points 10 s', 2); }
    }
    if (has('prismatic') && t >= wallReady && Math.random() < .15 + stat('pp.chance') && z.rpCause === 'bullet') { wallReady = Infinity; raiseWall(at); }   // no new wall while one stands; the cooldown starts when it fades
    if (has('damnade') && (z.rpCause === 'explosion' || z.rpCause === 'grenade')) {
      if (stat('dn.shrapnel')) queueMicrotask(() => { blast(at, 110, zh() * stat('dn.shrapnel'), 'shrapnel', z); fx(at.clone().add(V(0, 25, 0)), .35, 0xffb347); });   // 'shrapnel': doesn't chain
      if (stat('dn.scav') && Math.random() < stat('dn.scav') && session.grenades < nadeMax()) { session.grenades++; toast?.('Dam-A-Nade · grenade recovered', 1); }
    }
    if (has('magnet') && up('magnet') && Math.random() < .02) powerups?.spawn?.(MOCHA_POOL[Math.floor(Math.random() * 4)], at);
    if (has('timeslip') && up('timeslip')) { const op = window.kino?.operator; if (op?.current && !op.active && op.defs?.get(op.current)) op.addCharge(.5 / op.defs.get(op.current).kills); window.kino?.classes?.addCharge?.(.5); }
    if (has('tactiquilla')) { recentKills.push(t); while (recentKills.length && t - recentKills[0] > .5) recentKills.shift(); if (recentKills.length >= 2) pts((recentKills.length - 1) * (up('tactiquilla') ? 100 : 50)); }
    const b = burning.get(z); if (b?.explode && Math.random() < b.explode) { blast(at, 100, zh() * .5, 'explosion', z); fx(at.clone().add(V(0, 30, 0)), .5, 0xff6a1a); }
    if (wolf && z.rpWolf && up('bloodwolf') && Math.random() < .2) { const kind = ['points', 'ammo', 'charge'][Math.floor(Math.random() * 3)]; const s = sprite(kind === 'ammo' ? 0x9cff4f : kind === 'charge' ? 0x5fb8ff : 0xffb43d, 20); s.position.copy(at).y += 14; wolfDrops.push({ kind, s: keep(s, 15), until: t + 15 }); }
    if (spectre && z.rpSpectre) { const w = session.inventory.find(x => x === spectre.weapon); if (w) { const def = data.weapons[w.id]; w.reserve = (w.reserve ?? 0) + Math.ceil((def?.clipSize ?? 10) * .2); } }
  });

  // ---- the box, Pack-a-Punch, power-ups, windows, the shield ---------------------------------------------------------
  const box = api.mysteryBox;
  if (box?.start) {
    const start = box.start.bind(box);
    box.start = e => {
      const ok = start(e); if (!ok) return ok;
      const b = box.boxes?.get?.(e.id), r = b?.roll; if (!r) return ok;
      if (has('nobear') && r.teddy) r.teddy = false;
      if (has('nobear') && up('nobear') && !r.sale && Math.random() < .25) { pts(950); toast?.('No Bear Brew · free spin', 1.5); }
      if (has('timeslip')) { const cut = up('timeslip') ? r.time - now() : (r.time - now()) / 2; r.time -= cut; r.expires -= cut; }
      return ok;
    };
    const take = box.take.bind(box);
    box.take = e => {
      const w = take(e);
      if (w && has('packbox') && data.weapons[w]?.upgrade && Math.random() < (up('packbox') ? .3 : .15))
        queueMicrotask(() => { const x = session.inventory.find(i => i.id === w); if (x && !x.upgraded) { x.upgraded = true; const d = session.def; x.mag = d.clipSize; x.reserve = d.maxAmmo; api.equipView?.(); announce?.('PACK-A-BOX', 'IT CAME PACK-A-PUNCHED', 2); } });
      return w;
    };
  }
  if (powerups?.onCollect) {
    const collect = powerups.onCollect;
    powerups.onCollect = (type, at) => {
      carpenter = type === 'carpenter'; try { collect(type, at); } finally { carpenter = false; }   // Repairman Rum tells a Carpenter's boards from yours
      if (has('nukacola') && up('nukacola') && (type === 'nuke' || Math.random() < .25)) { const p = at?.clone?.() ?? feet(); setTimeout(() => powerups.spawn(MOCHA_POOL[Math.floor(Math.random() * MOCHA_POOL.length)], p.add(V(0, -40, 60))), 400); }
      if (type === 'full_ammo' && has('mh_mocha') && up('mh_mocha')) freePerk();
    };
  }
  function freePerk() {
    const base = ['specialty_armorvest', 'specialty_quickrevive', 'specialty_fastreload', 'specialty_rof', 'specialty_longersprint', 'specialty_deadshot', 'specialty_additionalprimaryweapon'];
    const p = base.filter(id => !session.perks.has(id)); if (!p.length) return; const id = p[Math.floor(Math.random() * p.length)];
    session.perks.add(id); toast?.('Miracle Hands Mocha · free perk', 2);
  }
  host.prompts?.push({   // Miracle Hands Mocha: change a power-up
    find() { if (!has('mh_mocha')) return null; const f = feet(); let best = null;
      for (const p of powerups?.items ?? []) { const d = p.root.position.clone().setY(f.y).distanceTo(f); if (d < 140 && (!best || d < best.d)) best = { p, d }; }
      if (!best) return null; const left = (up('mh_mocha') ? 4 : 3) - (best.p.mocha ?? 0); if (left <= 0) return null; mochaTarget = best.p; return { text: `Change power-up (${left} left)`, distance: best.d }; },
    use() { const p = mochaTarget; if (!p || !powerups.items.includes(p)) return false;
      const pool = MOCHA_POOL.filter(t => t !== p.type && !(up('mh_mocha') && ['carpenter', 'nuke'].includes(t)) && powerups.templates?.[t]);
      const t = pool[Math.floor(Math.random() * pool.length)]; if (!t) return false;
      const m = powerups.templates[t].clone(true); m.quaternion.copy(p.model.quaternion); p.root.remove(p.model); p.root.add(m); p.model = m; p.type = t; p.mocha = (p.mocha ?? 0) + 1;
      audio?.play?.('buy', .4); return true; },
  });
  let mochaTarget = null;
  // windows: Repairman Rum
  const setBoards = world?.setBoards?.bind(world);
  let carpenter = false;
  if (setBoards) world.setBoards = (b, count) => {
    const before = b.count, full = api.map?.boardCount?.(b) ?? 6;
    if (count > before && has('repairman') && !carpenter && b.position?.distanceTo?.(feet()) < 220 && count === before + 1) {
      setBoards(b, full); const n = full - before; b.rmBoards = (b.rmBoards ?? 0) + n;
      const cap = 50 * (session.round ?? 1) * (up('repairman') ? 4 : 1), pay = Math.max(0, Math.min(n * 20 - 10, cap - (b.reward ?? 0)));   // the engine already paid 10 for this press
      if (pay > 0) { session.addPoints(pay); b.reward = (b.reward ?? 0) + pay; } return;
    }
    if (count > before && carpenter && has('repairman') && up('repairman')) { b.rmBoards = full; session.addPoints((count - before) * 20); }
    if (count < before && (b.rmBoards ?? 0) > 0) { b.rmBoards--; const at = b.position.clone(); queueMicrotask(() => { blast(at, 120, 2 * zh()); fx(at.clone().add(V(0, 30, 0)), .5, 0xffb44e); }); }
    return setBoards(b, count);
  };
  // the rocket shield (Victorious Tortoise, Crusader's Ale)
  const shieldPerk = { allSides: () => has('victorious'), maxMul: () => up('victorious') ? 2 : 1,
    broke: at => { if (!has('victorious')) return; blast(at, 200, 3 * zh()); fx(at.clone().add(V(0, 30, 0)), 1, 0x6fd06a); ring(at, 200, 0x6fd06a); } };
  const hookShield = () => { const s = window.kino?.rocketShield; if (s && !s.perk) s.perk = shieldPerk; };
  // Tactiquilla: fire while sprinting (engine.js reads mods.sprintFire)
  host.sprintFire = () => has('tactiquilla');

  // ---- per frame ------------------------------------------------------------------------------------------------------
  let started = false, lastPhase = '', lastPerks = new Set();
  host.on('update', dt => {
    if (!dt) return;
    if (!started) { started = true; wrapDamage(); hookShield(); }
    const t = now(), f = feet();
    speedMul = 1;
    // temporaries
    for (let i = temp.length - 1; i >= 0; i--) { const o = temp[i], k = 1 - Math.max(0, o.until - t) / o.life; o.update?.(o.o, Math.min(1, k)); if (t >= o.until) { o.o.removeFromParent(); o.o.geometry?.dispose?.(); o.o.material?.dispose?.(); temp.splice(i, 1); } }
    if (+veil.dataset.until < t) veil.style.opacity = 0;
    // status effects
    for (const [z, h] of held) { if (!alive(z) || t > h.until) { h.glow?.removeFromParent(); held.delete(z); continue; } const k = h.frozenUntil > t ? 1 : h.slow, p = z.root.position; p.x = h.prev.x + (p.x - h.prev.x) * (1 - k); p.z = h.prev.z + (p.z - h.prev.z) * (1 - k); h.prev.copy(p); }
    for (const [z, b] of burning) { if (!alive(z) || t > b.until) { b.glow?.removeFromParent(); burning.delete(z); continue; } hurt(z, b.dps * dt, 'fire'); }
    for (let i = poison.length - 1; i >= 0; i--) { const p = poison[i]; if (t > p.until) { poison.splice(i, 1); continue; } near(p.at, p.r, z => hurt(z, p.dps * dt, 'poison')); }
    for (let i = lures.length - 1; i >= 0; i--) if (t > lures[i].until) lures.splice(i, 1);
    while (dmgLog.length && t - dmgLog[0].t > 3) dmgLog.shift();
    const phase = session.phase;

    // Banana Colada
    if (has('banana') && window.kino?.movement?.state?.sliding && (puddleT -= dt) <= 0) { puddleT = .12; const m = disc(f, 30, 0xffe14a, .45); puddles.push({ at: f.clone(), until: t + 6, m: keep(m, 6, (o, k) => { o.material.opacity = .45 * (1 - k * k); }), hit: new WeakMap() }); }
    for (let i = puddles.length - 1; i >= 0; i--) { const p = puddles[i]; if (t > p.until) { puddles.splice(i, 1); continue; }
      near(p.at, 34, z => { if ((p.hit.get(z) ?? 0) > t) return; p.hit.set(z, t + .5); slow(z, .5, 1, .5); hurt(z, zh() * .35 * (up('banana') ? 2 : 1), 'perk'); }); }
    // Bandolier Bandit
    if (has('bandolier')) {
      for (const w of session.inventory) { const d = data.weapons[w.id]; if (!d) continue; const max = w.upgraded ? d.upgrade?.maxAmmo ?? d.maxAmmo : d.maxAmmo, cap = Math.floor(max * 1.5);
        if (w.reserve >= max && w.reserve < cap && w.bbFull !== w.reserve) { w.reserve = cap; w.bbFull = cap; } }
      if (up('bandolier') && (bandT -= dt) <= 0) { bandT = 3; for (const w of session.inventory) { if (w === session.weapon) continue; const d = data.weapons[w.id], clip = w.upgraded ? d?.upgrade?.clipSize ?? d?.clipSize : d?.clipSize; if (clip && w.mag < clip && w.reserve > 0) { w.mag++; w.reserve--; } } }
    }
    // Blaze Phase
    if (has('blazephase') && !blazeRun) {
      const still = player.velocity ? Math.hypot(player.velocity.x, player.velocity.z) < 40 : true;
      if (player.input?.crouch && player.onFloor !== false && still && !sprinting()) { blaze = Math.min(up('blazephase') ? 3 : 1.5, blaze + dt); }
      else if (blaze > 0) { if (blaze >= .4 && player.velocity) { const k = blaze / 1.5, dir = camera.getWorldDirection(V()).setY(0).normalize(); player.velocity.addScaledVector(dir, 520 * Math.min(2, k)); player.velocity.y = 140; blazeRun = { until: t + .5 + .3 * k, hit: new Set() }; audio?.play?.('explosion', .3); } blaze = 0; }
    }
    if (blazeRun) { const s = sprite(0xff7a1a, 40, .7); s.position.copy(f).y += 20; keep(s, .4, (o, k) => { o.material.opacity = .7 * (1 - k); });
      near(f, 70, z => { if (blazeRun.hit.has(z)) return; blazeRun.hit.add(z); burn(z, 4, zh() * .25); hurt(z, zh() * .3, 'fire'); });
      if (t > blazeRun.until) { if (up('blazephase')) { blast(f, 180, zh() * 1.2); fx(f.clone().add(V(0, 20, 0)), .9, 0xff7a1a); } blazeRun = null; } }
    // Blood Bullets
    if (has('bloodbullets') && session.weapon && session.def) {
      const d = session.def, w = session.weapon, clip = d.clipSize ?? 0;
      if (clip && w.mag < clip && w.reserve > 0 && (!wonder(d) || /ray_gun/.test(d.baseId ?? w.id) || up('bloodbullets')) && (bloodT += dt) >= Math.min(3, Math.max(.3, 12 / clip))) { bloodT = 0; w.mag++; w.reserve--; }
      if (up('bloodbullets') && (bloodStowT += dt) >= 4) { bloodStowT = 0; const o = session.inventory.filter(x => x !== w); const x = o[Math.floor(Math.random() * o.length)], xd = x && data.weapons[x.id]; if (x && xd && x.mag < (x.upgraded ? xd.upgrade?.clipSize ?? xd.clipSize : xd.clipSize) && x.reserve > 0) { x.mag++; x.reserve--; } }
    }
    // Blood Wolf Bite
    if (has('bloodwolf') && !wolf && t >= wolfReady && dmgLog.reduce((a, l) => a + l.n, 0) >= 3 * zh()) {
      const s = sprite(0xff2a3a, 34), core = sprite(0xffd0d0, 10); s.add(core); s.position.copy(f).add(V(40, 20, 0)); scene.add(s);
      wolf = { s, until: t + 20, next: 0 }; wolfReady = t + (up('bloodwolf') ? 40 : 60); announce?.('BLOOD WOLF BITE', 'THE WOLF HUNTS', 2); sound('bloodwolf', 'whistle');
    }
    if (wolf) {
      if (t > wolf.until || !has('bloodwolf')) { wolf.s.removeFromParent(); wolf = null; }
      else { const z = nearest(wolf.s.position, 900);
        if (z) { const to = chest(z).add(V(0, -20, 0)).sub(wolf.s.position); if (to.length() > 30) wolf.s.position.addScaledVector(to.normalize(), Math.min(to.length(), dt * 420)); else if (t > wolf.next) { wolf.next = t + .6; z.rpWolf = true; hurt(z, zh() * 1.2, 'wolf'); bolt(wolf.s.position.clone(), chest(z), 0xff4a5a); } }
        else wolf.s.position.lerp(f.clone().add(V(40, 20, 0)), Math.min(1, dt * 3)); }
    }
    for (let i = wolfDrops.length - 1; i >= 0; i--) { const d = wolfDrops[i]; if (t > d.until) { wolfDrops.splice(i, 1); continue; }
      if (d.s.position.clone().setY(f.y).distanceTo(f) < 60) { d.s.removeFromParent(); wolfDrops.splice(i, 1);
        if (d.kind === 'points') pts(50); else if (d.kind === 'ammo') { const w = session.weapon, dd = session.def; if (w && dd) w.reserve = Math.min(Math.floor((dd.maxAmmo ?? 0) * 1.5), (w.reserve ?? 0) + Math.ceil((dd.maxAmmo ?? 0) * .1)); } else window.kino?.operator?.addCharge?.(.05); } }
    // Bull Ice Blast
    if (has('bull_ice')) {
      const jump = !!player.input?.jump, grounded = player.onFloor ?? player.grounded;
      if (grounded) { airJumped = false; if (slamming) { slamming = false; const R = up('bull_ice') ? 320 : 160; near(f, R, z => { slow(z, 3, 1, 3, 0x8fd6ff); hurt(z, zh(), 'ice'); }); ring(f, R, 0x8fd6ff); fx(f.clone().add(V(0, 10, 0)), .8, 0x9fe6ff); audio?.play?.('explosion', .5); } }
      else if (jump && !jumpHeld && !airJumped && player.velocity) { airJumped = true; player.velocity.y = Math.max(player.velocity.y, player.jumpSpeed ?? 300); }
      else if (airJumped && !slamming && player.input?.crouch && player.velocity) { slamming = true; player.velocity.y = -1400; }
      jumpHeld = jump;
    }
    // Change Chews: the element turns over when you fall below 40%
    if (has('changechews')) { const low = session.health < session.maxHealth * .4; if (low && !wasLow) { element = (element + 1) % 4; toast?.('Change Chews · ' + ELEMENTS[element][0], 1.5); } wasLow = low; }
    // Dam-A-Nade: a full belt of lethals when you drink it (5, 6 with Bandolier)
    if (has('damnade') && !session.rpNade) { session.rpNade = true; session.grenades = Math.max(session.grenades ?? 0, nadeMax()); }
    // Dying Wish: the end
    if (dyingUntil && t >= dyingUntil) { dyingUntil = 0; sound('dyingwish', 'end'); if (up('dyingwish')) session.health = session.maxHealth; }
    // Electric Cherry
    const rl = session.reloadLeft ?? 0;
    if (has('electriccherry') && rl > 0 && lastReload <= 0 && t >= cherryReady && session.def) {
      cherryReady = t + 1.5; const empty = 1 - (session.weapon?.mag ?? 0) / Math.max(1, session.def.clipSize ?? 1), k = up('electriccherry') ? 1.5 : 1, R = (120 + 80 * empty) * k;
      near(f, R, z => { bolt(f.clone().add(V(0, 40, 0)), chest(z), 0x7fd8ff); hurt(z, zh() * (.3 + empty) * (up('electriccherry') ? 1.6 : 1), 'electric'); slow(z, 1.5, 1, 1.5); });
      fx(f.clone().add(V(0, 30, 0)), .4 + .5 * empty, 0x7fd8ff);
    }
    // Swarm Scotch: reloading an empty magazine
    if (has('swarmscotch') && rl > 0 && lastReload <= 0 && session.weapon?.mag === 0) startSwarm();
    lastReload = rl;
    // Estatic Elixir
    if (has('estatic') && sprinting() && (staticT -= dt) <= 0) { staticT = .5; let n = 0; near(f, 80, z => { slow(z, 1.2, .85, .4); hurt(z, zh() * .05, 'electric'); bolt(f.clone().add(V(0, 30, 0)), chest(z), 0x9fdcff); n++; }); if (n) sound('estatic', 'stun', .3);
      if (up('estatic')) { stuns += n; while (stuns >= 10) { stuns -= 10; staticCharges = Math.min(4, staticCharges + 1); } } }
    // I.C.U.
    if (has('icu')) {
      if (t - (session.damageTime ?? -99) > 1 && session.health < session.maxHealth) heal(25 * dt);
      const low = session.health < session.maxHealth * .35; if (low) icuLinger = up('icu') ? t + 2 : t; if (low || t < icuLinger) speedMul *= 1.25;
      if (session.drinking || session.busy) session.effects.invulnerable = Math.max(session.effects.invulnerable ?? 0, t + (up('icu') ? 2 : .15));
    }
    // Magnet Margarita
    if (has('magnet')) for (const p of powerups?.items ?? []) { const to = f.clone().setY(p.root.position.y).sub(p.root.position), d = to.length(); if (d > 90 && d < 1500) p.root.position.addScaledVector(to.normalize(), Math.min(d - 90, dt * (up('magnet') ? 240 : 120))); }
    // Momentum Mojito
    if (has('momentum')) {
      const sliding = window.kino?.movement?.state?.sliding;
      if (sprinting() || (sliding && up('momentum'))) momentum = Math.min(1, momentum + dt / (4 - (up('momentum') ? charges / 15 * 2 : 0))); else momentum = Math.max(0, momentum - dt * 2);
      speedMul *= 1 + .35 * momentum;
      if (momentum >= .95 && killMode && charges > 0) near(f, 50, z => { if ((z.rpMomentum ?? 0) > t) return; z.rpMomentum = t + .5; charges--; hurt(z, zh() * 2, 'perk'); sound('momentum', 'hit', .5); });
    }
    // Nitrogen Cooled
    if (has('nitrogen')) near(f, up('nitrogen') ? 400 : 250, z => slow(z, .2, .55));
    // PhD Flopper (Cold War): explodes on the first zombie the slide reaches
    if (phdSlide && !phdSlide.done) { phdSlide.top = Math.max(phdSlide.top, f.y);
      if (!window.kino?.movement?.state?.sliding) phdSlide = null;
      else if (nearest(f, 50)) { phdSlide.done = true; const k = up('phdslider') ? 1 + Math.min(1, f.distanceTo(phdSlide.start) / 400) + Math.min(1, (phdSlide.top - f.y) / 200) : 1;
        blast(f, 160, zh() * 1.5 * k); fx(f.clone().add(V(0, 10, 0)), 1, 0xb36cff); ring(f, 160, 0xc58cff); sound('phdslider', 'slider_explode'); } }
    // the Cold War PhD counts as PhD for self-explosive checks (throwables, the engine grenade)
    if (session.perks && !session.perks.rpPhd) { const set = session.perks, hasFn = set.has.bind(set); set.has = id => hasFn(id) || (id === 'specialty_flakjacket' && hasFn(S('phdslider'))); set.rpPhd = true; }
    // Spectre Shot
    if (session.weapon !== lastWeapon) {
      if (has('spectorshot') && lastWeapon && session.inventory.includes(lastWeapon) && t >= spectreReady && enemies.list.filter(z => z.root.position.distanceTo(f) < 600).length >= 10) summonSpectre(lastWeapon);
      lastWeapon = session.weapon;
    }
    if (spectre) {
      if (t > spectre.until) { spectre.g.removeFromParent(); spectre = null; }
      else { const r = V(-fwd().z, 0, fwd().x); spectre.g.position.lerp(camera.position.clone().addScaledVector(r, -40).add(V(0, 10, 0)).addScaledVector(fwd(), 30), Math.min(1, dt * 6));
        const z = nearest(spectre.g.position, 900);
        if (z) { spectre.g.lookAt(chest(z)); if (t > spectre.next && (world?.lineClear?.(spectre.g.position, chest(z)) ?? true)) { spectre.next = t + .35; const d = data.weapons[spectre.weapon.id]; z.rpSpectre = true;
          bolt(spectre.g.position.clone(), up('spectorshot') ? enemies.headPosition(z) : chest(z), 0x9fe8ff); hurt(z, (d?.damage ?? 100) * (up('spectorshot') ? 3 : 1.5), 'bullet', up('spectorshot')); slow(z, 1, .5); } } }
    }
    // Stone Cold Stronghold
    if (has('stronghold')) {
      const moving = player.velocity ? Math.hypot(player.velocity.x, player.velocity.z) > 10 : false;
      stillT = moving ? 0 : stillT + dt;
      if (stillT >= 1) { if (!ringMesh) { ringMesh = disc(f, 70, 0x9fb6c8, .22); scene.add(ringMesh); } ringMesh.position.copy(f).y += 2; armour = Math.min(150, armour + dt * (up('stronghold') ? 35 : 20)); leftAt = t; }
      else { if (ringMesh) { ringMesh.removeFromParent(); ringMesh.geometry.dispose(); ringMesh.material.dispose(); ringMesh = null; } if (!(up('stronghold') && t - leftAt < 10)) armour = Math.max(0, armour - dt * 30); }
    } else if (ringMesh) { ringMesh.removeFromParent(); ringMesh = null; armour = 0; }
    // Swarm Scotch
    if (swarm) { if (t > swarm.until) { swarm.g.removeFromParent(); swarm = null; }
      else { swarm.g.position.lerp(f.clone().add(V(0, 50, 0)), Math.min(1, dt * 3)); swarm.g.children.forEach((c, i) => c.position.set(Math.cos(t * 6 + i) * 30, Math.sin(t * 9 + i * 2) * 15, Math.sin(t * 5 + i) * 30));
        if (t > swarm.next) { swarm.next = t + .5; near(f, 120, z => { hurt(z, zh() * (up('swarmscotch') ? .25 : .15), 'swarm'); if (alive(z)) z.swarmed = true; }); } } }
    // Tactiquilla: refunded rounds
    if (has('tactiquilla') && (session.shots ?? 0) > lastShots && session.weapon) { const n = session.shots - lastShots; for (let i = 0; i < n; i++) if (Math.random() < (up('tactiquilla') ? .3 : .15)) session.weapon.mag++; }
    lastShots = session.shots ?? 0;
    // Timeslip: Pack-a-Punch
    if (has('timeslip') && session.pack && !session.pack.rpSlip && session.pack.readyAt > t) { session.pack.rpSlip = true; const cut = (session.pack.readyAt - t) / 2; session.pack.readyAt -= cut; session.pack.expires -= cut; }
    // Zombshell: hidden while in a field (upgraded)
    hidden = up('zombshell') && shells.some(s => s.until > t && f.distanceTo(s.at) < s.r);
    for (let i = shells.length - 1; i >= 0; i--) { const s = shells[i]; if (t > s.until) { shells.splice(i, 1); continue; } near(s.at, s.r, z => slow(z, .2, .6)); }
    // Bubble Blink Blast: melee while sprinting
    const ml = session.meleeLeft ?? 0;
    if (has('bubbleblink') && ml > meleeWas + .05 && sprinting() && blinks > 0) blink();
    meleeWas = ml;
    // Point Polosa fountains
    for (let i = fountains.length - 1; i >= 0; i--) { const q = fountains[i]; if (t > q.until) { fountains.splice(i, 1); continue; } if (t > q.next && q.at.clone().setY(f.y).distanceTo(f) < 70) { q.next = t + .25; pts(10); } }
    // Prismatic Punch walls
    for (let i = walls.length - 1; i >= 0; i--) { const w = walls[i]; if (t > w.until) {
      if (w.maxed && stat('pp.nova')) { blast(w.at, 250, zh() * stat('pp.nova'), 'energy'); fx(w.at, .9, 0xc89bff); ring(w.at.clone().setY(feet().y), 250, 0xd6a8ff); }   // Supernova
      w.m.removeFromParent(); w.m.geometry.dispose(); w.m.material.dispose(); walls.splice(i, 1); if (!walls.length) wallReady = t + PP_COOLDOWN * (1 - stat('pp.cooldown')); continue; } w.m.material.opacity = .25 + Math.sin(t * 4) * .05; }
    // Who's Who: the body's clock (and, upgraded, its gun)
    if (ghost.body) { const b = ghost.body;
      if (up('whoswho') && t > b.fire) { const z = nearest(b.at, 700); if (z) { b.fire = t + .5; bolt(b.at.clone().add(V(0, 20, 0)), chest(z), 0xffe08a); hurt(z, zh() * .3, 'bullet'); } }
      if (t > b.until) { b.body.removeFromParent(); ghost.body = null; tint('#0000', 0); announce?.("WHO'S WHO", 'YOUR PERKS ARE GONE', 3); } }
    // Fighter's Fizz: the last stand runs out
    if (stand) { speedMul *= .35; if (t >= stand.until) { stand = null; tint('#0000', 0); session.effects.invulnerable = 0; session.perks.delete(S('ffyl')); session.damage(session.health + 1); } }
    // Tombstone (co-op): what you had when you went down; left behind if you bleed out
    if (phase === 'reviving' && lastPhase !== 'reviving' && lastPerks.has(S('tombstone'))) downSnap = { at: f.clone(), perks: [...lastPerks].filter(p => p !== S('tombstone')), inventory: session.inventory.slice(), dead: false };
    if (downSnap && window.kino?.coopDown?.dead) downSnap.dead = true;
    if (downSnap && phase !== 'reviving' && lastPhase === 'reviving') {
      if (downSnap.dead) { const s = sprite(0x9fa8b4, 46); s.position.copy(downSnap.at).y += 30; scene.add(s); tomb = { ...downSnap, s, until: t + 60, round: session.round, upgraded: false }; announce?.('TOMBSTONE', 'YOUR THINGS ARE WHERE YOU FELL', 3); }
      downSnap = null;
    }
    if (tomb && (tomb.upgraded ? session.round > tomb.round && t > tomb.until : t > tomb.until)) { tomb.s.removeFromParent(); tomb = null; }
    // Dam-A-Nade: the refill comes when a round starts (its countdown ends), not when the last one ends (user, 2026-10-18)
    if (phase === 'fighting' && lastPhase === 'preparing' && has('damnade')) { session.grenades = Math.max(session.grenades ?? 0, nadeMax()); tacticalBack(stat('dn.resupply') ? Infinity : 1); }
    // Nuka Cola: a co-op down
    if (phase === 'reviving' && lastPhase !== 'reviving' && lastPerks.has(S('nukacola'))) nukaGoesOff();
    // Winter's Wail charges come back with rounds (roundEnd); Moonshine's slides too
    lastPhase = phase; lastPerks = new Set(session.perks ?? []);
    // HUD chips
    if ((chipT -= dt) <= 0) { chipT = .2; chipsEl.innerHTML = chips.map(fn => fn()).filter(Boolean).map(([s, on]) => `<span class="${on ? 'on' : ''}">${s}</span>`).join(''); }
  });
  host.on('roundEnd', () => {
    slidesLeft = up('moonshine') ? 30 : 20; if (has('winterwail')) wails = Math.min(up('winterwail') ? 4 : 3, wails + 1);
    if (has('crusade')) window.kino?.rocketShield?.heal?.(Infinity);
  });
  // Winter's Wail and Estatic Elixir react to being hit (after the shield and other savers)
  host.on('beforeDamage', e => {
    if (!(e.amount > 0)) return; const t = now(), f = feet();
    if (has('winterwail') && wails > 0 && t >= wailReady) { wails--; wailReady = t + 2; const d = up('winterwail') ? 5 : 3; near(f, 200, z => { slow(z, d, 1, d, 0x8fd6ff); }); ring(f, 200, 0x8fd6ff); sound('winterwail', 'cryofreeze'); }
    if (has('estatic') && staticCharges > 0) { staticCharges--; near(f, 200, z => { slow(z, 2, 1, 2); bolt(f.clone().add(V(0, 30, 0)), chest(z), 0x9fdcff); }); }
  });

  function startSwarm() {
    if (swarm) { swarm.until = now() + 8; return; }
    const g = new THREE.Group(); for (let i = 0; i < 14; i++) g.add(sprite(0x2a2a10, 5, .9)); g.position.copy(feet()).y += 50; scene.add(g);
    swarm = { g, until: now() + 8, next: 0 };
  }
  function summonSpectre(w) {
    spectreReady = now() + (up('spectorshot') ? 20 : 30);
    const g = new THREE.Group(), m = api.mysteryBox?.display?.(w.id);
    if (m) { m.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false }); o.frustumCulled = false; } }); g.add(m); }
    else g.add(sprite(0x9fe8ff, 30));
    g.position.copy(camera.position); scene.add(g);
    spectre = { g, weapon: w, until: now() + (up('spectorshot') ? 12 : 8), next: 0 };
    announce?.('SPECTRE SHOT', data.weapons[w.id]?.name ?? '', 1.5);
  }
  function blink() {
    blinks--; const from = feet(), dir = fwd(), eye = from.clone().add(V(0, 40, 0));
    const wall = world?.raycast?.(new THREE.Ray(eye, dir), 0, 330), dist = wall ? Math.max(0, wall.distance - 30) : 300;
    const to = from.clone().addScaledVector(dir, dist), spot = world?.closest?.(to, { x: 40, y: 80, z: 40 }) ?? to;
    const s = sprite(0x9fd8ff, 50, .6); s.position.copy(from).y += 40; const life = up('bubbleblink') ? 8 : 5; keep(s, life, (o, k) => { o.material.opacity = .6 * (1 - k); });
    lures.push({ at: from.clone(), r: 700, until: now() + life }); player.setPosition(spot); ring(from, 80, 0x9fd8ff);
  }
  function raiseWall(at) {
    const size = 1 + stat('pp.size'), m = new THREE.Mesh(new THREE.PlaneGeometry(120, 100), new THREE.MeshBasicMaterial({ color: 0xc89bff, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(at).y += 50; m.lookAt(camera.position.x, m.position.y, camera.position.z); m.scale.setScalar(size); scene.add(m);
    walls.push({ m, at: m.position.clone(), until: now() + 10, size }); sound('prismatic', 'punch_activate', .6);
  }
  // a bullet (the engine's per-pellet 'shot', so every map) that crosses a wall before it stopped ricochets off it
  const plane = new THREE.Plane(), local = V(), hitAt = V();
  host.on('shot', e => {
    if (!walls.length || !has('prismatic') || !e?.origin || !e.direction) return;
    const ray = new THREE.Ray(e.origin, e.direction);
    for (const w of walls) {
      w.m.updateMatrixWorld(); plane.setFromNormalAndCoplanarPoint(V(0, 0, 1).applyQuaternion(w.m.quaternion), w.at);
      if (!ray.intersectPlane(plane, hitAt) || hitAt.distanceTo(e.origin) > e.distance) continue;
      w.m.worldToLocal(local.copy(hitAt)); if (Math.abs(local.x) > 60 || Math.abs(local.y) > 50) continue;
      ricochet(w, hitAt.clone(), e.def?.damage ?? session.def?.damage ?? 100);
      break;
    }
  });
  function ricochet(w, point, dmg) {
    const n = w.size >= 2 ? 2 : 1, done = new Set(), k = 1 + stat('pp.damage');
    for (let i = 0; i < n; i++) {
      const z = nearest(point, 400, done); if (!z) break; done.add(z); bolt(point, chest(z), 0xd6a8ff); hurt(z, dmg * k, 'bullet');
      const own = session.weapon?.ammoMod, A = window.kino?.ammoMods;   // Full Spectrum: the gun's own ammo mod at its tier (user, 2026-10-18: not a random one); none without one
      if (own?.id && A?.trigger && stat('pp.spectrum') && Math.random() < stat('pp.spectrum') && alive(z)) { const tier = own.tier ?? 1; A.trigger(own.id, z, tier); host.emit('ammoModFired', { id: own.id, tier, enemy: z, pop: true }); }
      if (stat('pp.scatter')) { const o = nearest(z.root.position, 220, done); if (o) { done.add(o); bolt(chest(z), chest(o), 0xb98cff); hurt(o, dmg * k * stat('pp.scatter'), 'bullet'); } }
    }
    w.size = Math.min(2, w.size + .1); w.m.scale.setScalar(w.size);
    if (w.size >= 2 && !w.maxed) { w.maxed = true; if (stat('pp.afterglow')) w.until = Math.max(w.until, now() + stat('pp.afterglow')); sound('prismatic', 'punch_max_size', .6); }
  }
  // ---- Dam-A-Nade (switched on): explosives x1.5, one more lethal (5) and tactical, lethals refill and a tactical comes
  //      back when each round starts (Max Ammo fills both). Augments (dn.*): damage, stun (s frozen), burn, shrapnel (explosive
  //      kills explode), lethal / tactical (+n carried), scav (explosive kills give a grenade back), resupply (full tactical).
  const nadeMax = () => 5 + stat('dn.lethal');
  const tacticalMax = () => 4 + stat('dn.tactical');   // 3 Monkey Bombs / Gersh / QED, +1
  function tacticalBack(n) {
    const t = window.kino?.tactical;
    if (t?.id) t.count = Math.min(tacticalMax(), (t.count ?? 0) + n);
    else if (session.monkeysOwned) session.monkeys = Math.min(tacticalMax(), (session.monkeys ?? 0) + n);
  }
  { const next = session.nextRound?.bind(session);   // the round-end +2 grenades caps at 4: keep a Dam-A-Nade belt's 5th and 6th
    if (next) session.nextRound = (...a) => { const before = session.grenades ?? 0, r = next(...a); if (has('damnade')) session.grenades = Math.max(session.grenades ?? 0, Math.min(before, nadeMax())); return r; }; }
  { const powerup = session.powerup?.bind(session);   // Max Ammo: the bigger belt and tactical slot, filled
    if (powerup) session.powerup = (type, ...rest) => { const r = powerup(type, ...rest); if (type === 'full_ammo' && has('damnade')) { session.grenades = Math.max(session.grenades ?? 0, nadeMax()); tacticalBack(Infinity); } return r; }; }

  // ---- chips ------------------------------------------------------------------------------------------------------------
  chip(() => has('dyingwish') ? [dyingUntil > now() ? 'DYING WISH ' + Math.ceil(dyingUntil - now()) : now() < dyingReady ? 'DW ' + Math.ceil(dyingReady - now()) + 's' : 'DYING WISH', dyingUntil > now() || now() >= dyingReady] : null);
  chip(() => has('guardianangel') ? [angelCharge >= 1 ? 'ANGEL READY' : `ANGEL ${angelKills}/${ANGEL_KILLS}`, angelCharge >= 1] : null);
  chip(() => has('momentum') ? [`MOMENTUM ${Math.round(momentum * 100)}% · ${charges}${killMode ? '' : ' (off)'}`, momentum >= .95 && killMode] : null);
  chip(() => has('winterwail') ? [`WAIL ${wails}`, wails > 0] : null);
  chip(() => has('estatic') && up('estatic') ? [`STATIC ${staticCharges}`, staticCharges > 0] : null);
  chip(() => has('moonshine') ? [`SLIDES ${slidesLeft}`, slidesLeft > 0] : null);
  chip(() => has('bubbleblink') ? [`BLINK ${blinks}`, blinks > 0] : null);
  chip(() => has('stronghold') ? [`ARMOUR ${Math.round(armour)}`, armour > 0] : null);
  chip(() => has('blazephase') && blaze > 0 ? [`BLAZE ${Math.round(blaze / (up('blazephase') ? 3 : 1.5) * 100)}%`, blaze >= .4] : null);
  chip(() => has('changechews') ? [ELEMENTS[element][0].toUpperCase(), true] : null);
  chip(() => stand ? [`GET A KILL · ${Math.ceil(stand.until - now())}s`, true] : null);
  chip(() => ghost.body ? [`REVIVE YOUR BODY · ${Math.ceil(ghost.body.until - now())}s`, true] : null);
  chip(() => polosaDouble > now() ? [`2X · ${Math.ceil(polosaDouble - now())}s`, true] : null);

  // ---- Tombstone pick-up --------------------------------------------------------------------------------------------
  host.prompts?.push({
    find() { if (!tomb) return null; const d = tomb.at.distanceTo(feet()); return d < 90 ? { text: 'Take your Tombstone', distance: d } : null; },
    use() { if (!tomb) return false; for (const p of tomb.perks) session.perks.add(p); for (const w of tomb.inventory) if (!session.inventory.some(x => x.id === w.id) && session.inventory.length < (session.weaponSlots ?? 2)) session.inventory.push(w);
      api.equipView?.(); tomb.s.removeFromParent(); tomb = null; announce?.('TOMBSTONE', 'RECOVERED', 2); return true; },
  });

  host.on('reset', () => {
    for (const o of temp) o.o.removeFromParent(); temp.length = 0; for (const [, h] of held) h.glow?.removeFromParent(); held.clear(); for (const [, b] of burning) b.glow?.removeFromParent(); burning.clear();
    puddles.length = poison.length = lures.length = shells.length = fountains.length = wolfDrops.length = 0;
    for (const w of walls) w.m.removeFromParent(); walls.length = 0;
    if (wolf) wolf.s.removeFromParent(); wolf = null; if (spectre) spectre.g.removeFromParent(); spectre = null; if (swarm) swarm.g.removeFromParent(); swarm = null;
    if (ghost.body) ghost.body.body.removeFromParent(); ghost.body = null; if (tomb) tomb.s.removeFromParent(); tomb = null; if (ringMesh) ringMesh.removeFromParent(); ringMesh = null;
    stand = null; dyingUntil = dyingReady = 0; angelCharge = 1; angelKills = 0; armour = 0; momentum = 0; charges = 10; wails = 3; slidesLeft = 20; blinks = 1; staticCharges = stuns = 0;
    element = 0; polosaDouble = 0; session.rpNade = false; wolfReady = spectreReady = milkReady = cherryReady = wallReady = 0; upgraded.clear(); tint('#0000', 0);
  });

  // ---- the perk table (HUD only: offSale, nothing sells them) and the cheat console ---------------------------------------
  const table = api.map?.perkInfo ?? api.world?.perkInfo ?? api.perkInfo;   // what the HUD reads (Moon's own, custom maps', the engine's)
  const COLORS = { banana: '#f2d43a', bandolier: '#8a6a3a', blazephase: '#ff7a1a', bloodbullets: '#a01818', bloodwolf: '#c0202a', bull_ice: '#8fd6ff', cashback: '#3aa860',
    changechews: '#d65fc4', crusade: '#c9a24a', damnade: '#8a9a4a', downers: '#5a4a8a', dyingwish: '#b01a1a', electriccherry: '#4fa8ff', estatic: '#7f9cff', razor: '#9fe8ff',
    ffyl: '#e05a2a', icu: '#e8e8f0', inferno: '#ff5a1a', moonshine: '#8aa83a', magnet: '#e04a6a', mh_mocha: '#7a4a2a', momentum: '#3ad0a0', milk: '#f0f0e0', nitrogen: '#6ad0ff',
    nobear: '#a07a4a', nukacola: '#d02a2a', phdslider: '#b36cff', packbox: '#8a3ad0', pointcrusher: '#d0a02a', repairman: '#5a8a5a', spectorshot: '#7fe8d0', stronghold: '#8a9aa8',
    swarmscotch: '#7a6a2a', tactiquilla: '#c03a5a', timeslip: '#8a5ad0', tombstone: '#6a6a7a', victorious: '#3a8a3a', vigor: '#ffb43d', winterwail: '#9fd8ff', zombshell: '#7ab83a',
    bubbleblink: '#7fc8ff', guardianangel: '#fff2a8', pointpolosa: '#ffd34f', prismatic: '#c89bff', whoswho: '#4a7ab0' };
  if (table) for (const [id, spec] of Object.entries(ids)) table[spec] ??= REAPER_ON[spec] ? { ...REAPER_ON[spec] } : { name: catalogue[id].name, price: 0, color: COLORS[id] ?? '#888', icon: catalogue[id].name.split(/[\s-]+/).map(w => w[0]).join('').slice(0, 3).toUpperCase(), offSale: true, reaper: id };
  // HUD icons from the git-ignored build (reaper/icons/<id>.webp), only for files that exist
  (async () => {
    const rules = [];
    for (const id of Object.keys(ids)) { const url = new URL('reaper/icons/' + id + '.webp', base).href; try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) rules.push([catalogue[id].name, url]); } catch {} }
    if (!rules.length) return;
    const st = document.createElement('style'); st.textContent = rules.map(([n, u]) => `#perks span[title="${n.replace(/"/g, '\\"')}"]{border:0;border-radius:0;width:30px;height:30px;font-size:0;color:transparent;background:transparent url(${u}) center/contain no-repeat!important;filter:drop-shadow(0 1px 2px #000)}`).join('');
    document.head.append(st);
  })();
  // jingles/stings and the mod's effect sounds, where built (reaper/perks.json)
  fetch(new URL('reaper/perks.json', base)).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !audio?.manifest) return;
    for (const [id, e] of Object.entries(j)) {
      for (const k of ['sting', 'jingle']) if (e[k]) audio.manifest['reaper/' + id + '/' + k] ??= { url: new URL('reaper/' + e[k], base).href };
      if (e.sting && REAPER_ON[e.specialty]) audio.manifest[e.specialty] ??= { url: new URL('reaper/' + e.sting, base).href };   // the buy sting (engine: audio.play(<perk id>))
      for (const [k, u] of Object.entries(e.sounds ?? {})) audio.manifest['reaper/' + id + '/' + k] ??= { url: new URL('reaper/' + u, base).href };
    }
  }).catch(() => {});
  const give = id => { const spec = S(id); if (!spec) return false; session.perks.add(spec); if (id === 'damnade') session.rpNade = false; sound(id, 'sting', .7); return true; };
  const addCheat = () => { if (!window.kino.cheats?.addCommand) { setTimeout(addCheat, 500); return; } window.kino.cheats.addCommand('reaper', { usage: 'reaper <id|all|list|none> · reaper up <id|all>', cheat: true,
    text: 'Reaper Collection perks (switched off: cheat only). ids: ' + Object.keys(ids).join(', '),
    run: ([a, b]) => {
      a = (a ?? 'list').toLowerCase();
      if (a === 'list') return Object.entries(ids).map(([id]) => id + (has(id) ? (up(id) ? '**' : '*') : '')).join(' ');
      if (a === 'none') { for (const spec of Object.values(ids)) session.perks.delete(spec); upgraded.clear(); return 'Reaper perks removed'; }
      if (a === 'up') { const list = (b ?? 'all') === 'all' ? Object.keys(ids) : [Object.keys(ids).find(k => k.startsWith(b))].filter(Boolean); for (const id of list) { give(id); upgraded.add(id); } return 'Upgraded: ' + list.map(id => catalogue[id].name).join(', '); }
      const list = a === 'all' ? Object.keys(ids) : [Object.keys(ids).find(k => k.startsWith(a)) ?? Object.keys(ids).find(k => catalogue[k].name.toLowerCase().includes(a))].filter(Boolean);
      if (!list.length) return 'Unknown perk. ' + Object.keys(ids).join(', ');
      for (const id of list) give(id); session.health = session.maxHealth; return 'Perks: ' + list.map(id => catalogue[id].name).join(', ');
    } }); };
  addCheat();
  window.kino.reaperPerks = { ids, has, up, upgraded, give, catalogue, raiseWall, walls, nadeMax, tacticalMax, get armour() { return armour; }, get momentum() { return momentum; }, get wolf() { return !!wolf; } };
}
