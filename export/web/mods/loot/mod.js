// World loot (BO6/BO7 style, fork 2026-10-26). Things you pick up off the floor are real 3D items instead of glowing
// orbs: an ammo can, a gold zombie-dollar sign, a frag grenade, a perk bottle, or a weapon lying in a beam of its
// rarity colour. Small items (ammo, points, grenades) are collected by walking over them; weapons, perk bottles and
// chests take F. Items pop out with an arc (or drop) onto the floor and lie there, blink for their last 5 s, then go.
//   Used by: Vulture Aid's drops (mods/perks-plus/bo7-perks.js), the T.E.D.D. reward chest (mods/tedd-tasks), and the
//   Mystery Box: melee the box while a weapon is on offer and the weapon is knocked out onto the floor in front of it
//   (picked up later with F, or left for 90 s), instead of taking it straight into your hands.
// Loot is local to the player it drops for (like box rolls and Vulture drops), so in co-op each player sees their own;
// the one exception is a weapon knocked out of the Mystery Box, which everyone sees and anyone can take (`shared`: the
// host hands it to the first player who asks, over the multiplayer mod's relay: lootdrop / lootclaim / loottake).
// window.kino.loot: {
//   spawn(kind, at, opts) -> item       kind: 'ammo' | 'points' | 'grenade' | 'weapon' | 'perk' | 'powerup'
//       opts: {amount, id (weapon / perk / power-up type), life (s), reach, from (Vector3: arc out of here), onPick(item)
//              -> false keeps it, keep() -> false removes it, big (bigger, for Vulture's special drop)}
//   scatter(list, from, opts)           [{kind, ...opts}] thrown out of `from` in a ring (a chest, a box)
//   chest(at, yaw, rarity, list, opts)  a closed chest (rarity id or '#rrggbb'); F opens it and scatters `list`
//   pickWeapon(rarities)                a weapon from the player's own Mystery Box list (kino.boxList) of those rarities
//   freePerk() -> perk | null           a random perk the player doesn't have (unlocked, sold by the terminal)
//   givePerk(id) -> bool                 the free drink itself (for an onPick that adds its own conditions)
//   rarityOf(id), color(rarity), items }
import * as THREE from 'three';
import { rarityOf as rarityIn } from '../../profile.js';
import { PERKS, perkUnlocked } from '../terminal-booth/desktop.js';
import { objectBox } from '../../skinned-bounds.js';

const GRAVITY = 900, BLINK = 5, RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'wonder'];
const LIFE = { ammo: 30, points: 30, grenade: 30, weapon: 90, perk: 120 };

export default async function setup(api) {
  const { host, session, scene, camera, player, world, data, audio, mysteryBox, powerups } = api;
  const config = await fetch(new URL('../progression/progression.json', import.meta.url)).then(r => r.json()).catch(() => ({ weapons: [], rarities: [] }));
  const rarityColor = Object.fromEntries((config.rarities ?? []).map(r => [r.id, r.color]));
  const rarityOf = id => rarityIn(config, id);
  const color = r => r?.startsWith?.('#') ? r : rarityColor[r] ?? '#c9c9c9';   // a rarity id, or a colour as is
  const feet = () => player.getFeetPosition();
  const nameOf = id => (data.weapons?.[id] ?? data.equipment?.[id])?.name ?? id;

  // ---- shared looks: built once (and warmed at load), cloned per item with shared materials, so no shader builds mid-game
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, metalness: .1, ...o });
  const canvasTex = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const beamTex = canvasTex(4, 128, (g, w, h) => { const r = g.createLinearGradient(0, h, 0, 0); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const discTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.45, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const glow = (map, c, o = {}) => new THREE.MeshBasicMaterial({ map, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, ...o });
  const beamGeo = new THREE.CylinderGeometry(3.2, 3.2, 170, 10, 1, true).translate(0, 85, 0), discGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const beamMats = {}, discMats = {};
  const beamMat = c => beamMats[c] ??= glow(beamTex, c, { opacity: .5 });
  const discMat = c => discMats[c] ??= glow(discTex, c, { opacity: .75 });
  const KIND_GLOW = { ammo: '#b8ff8a', points: '#ffd34f', grenade: '#ffb24f' };

  const olive = std(0x4b5320, { roughness: .75 }), oliveDark = std(0x2f3517, { roughness: .8 }), brass = std(0xc9a243, { metalness: .9, roughness: .3 });
  const gold = std(0xf5c542, { metalness: .9, roughness: .26, emissive: 0x8a5a00, emissiveIntensity: .7 }), steel = std(0x8a8f96, { metalness: .85, roughness: .35 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; return m; };
  const LOOKS = {
    ammo() {   // a military ammo can with a few rounds poking out of the lid
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(12, 8, 6), olive, 0, 4, 0), mesh(new THREE.BoxGeometry(12.6, 1.4, 6.6), oliveDark, 0, 8.4, 0),
        mesh(new THREE.BoxGeometry(5, .8, 1), oliveDark, 0, 9.8, 0), mesh(new THREE.BoxGeometry(.8, 1.4, 1), oliveDark, -2.2, 9.3, 0), mesh(new THREE.BoxGeometry(.8, 1.4, 1), oliveDark, 2.2, 9.3, 0));
      const round = new THREE.CylinderGeometry(.55, .55, 3.6, 8); for (const x of [-4.4, -3.2, -2]) g.add(mesh(round, brass, x, 10.4, 1.6));
      return g;
    },
    points() {   // the zombie dollar sign: an S of gold tube with a bar through it
      const r = 3.2, pts = [];
      for (let a = 20; a <= 270; a += 10) { const t = a * Math.PI / 180; pts.push(new THREE.Vector3(r * Math.cos(t), r + r * Math.sin(t), 0)); }
      for (let a = 80; a >= -160; a -= 10) { const t = a * Math.PI / 180; pts.push(new THREE.Vector3(r * Math.cos(t), -r + r * Math.sin(t), 0)); }
      const g = new THREE.Group(), s = new THREE.Group();
      s.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 1.5, 10), gold), mesh(new THREE.CylinderGeometry(.9, .9, 4 * r + 5, 10), gold));
      s.position.y = 2 * r + 3; s.scale.setScalar(1.45); s.position.y *= 1.45; g.add(s); return g;
    },
    grenade() {   // a frag: ribbed body, fuze and spoon
      const g = new THREE.Group(), body = mesh(new THREE.SphereGeometry(2.6, 12, 10), oliveDark, 0, 3, 0); body.scale.y = 1.25;
      g.add(body, mesh(new THREE.CylinderGeometry(.9, 1.1, 1.6, 8), steel, 0, 6.5, 0), mesh(new THREE.BoxGeometry(.7, 4.6, .9), steel, 1.3, 4.6, 0), mesh(new THREE.TorusGeometry(.8, .15, 6, 12), steel, -1, 7.4, 0));
      g.scale.setScalar(1.6); return g;
    },
    perk(c = '#c0392b') {   // a perk bottle in the perk's colour
      const g = new THREE.Group(), glass = std(new THREE.Color(c), { roughness: .2, metalness: .1, emissive: new THREE.Color(c), emissiveIntensity: .35 });
      g.add(mesh(new THREE.CylinderGeometry(2.2, 2.4, 7, 14), glass, 0, 3.5, 0), mesh(new THREE.CylinderGeometry(1, 2.2, 2.6, 14), glass, 0, 8.3, 0),
        mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.1, 14), gold, 0, 10.1, 0), mesh(new THREE.CylinderGeometry(2.45, 2.45, 2.6, 14, 1, true), std(0xf1e6c8), 0, 3.6, 0));
      g.scale.setScalar(1.5); return g;
    },
  };
  const perkGlass = new Map();   // one bottle look per colour
  const look = (kind, c) => kind === 'perk' ? (perkGlass.get(c) ?? perkGlass.set(c, LOOKS.perk(c)).get(c)).clone(true) : LOOKS[kind]?.().clone(true);
  const templates = { ammo: LOOKS.ammo(), points: LOOKS.points(), grenade: LOOKS.grenade() };
  for (const k in templates) LOOKS[k] = (t => () => t)(templates[k]);

  // the chest T.E.D.D. pays out in: a dark crate with glowing trim in the reward's colour and a hinged lid
  function chestModel(c) {
    const g = new THREE.Group(), dark = std(0x1d2124, { roughness: .55, metalness: .45 }), trim = std(new THREE.Color(c), { emissive: new THREE.Color(c), emissiveIntensity: 1.4, roughness: .4 });
    g.add(mesh(new THREE.BoxGeometry(34, 16, 20), dark, 0, 8, 0), mesh(new THREE.BoxGeometry(35, 1.6, 21), trim, 0, 3, 0), mesh(new THREE.BoxGeometry(35, 1.6, 21), trim, 0, 15, 0));
    const lid = new THREE.Group(); lid.position.set(0, 16, -10); g.add(lid);
    lid.add(mesh(new THREE.BoxGeometry(34, 5, 20), dark, 0, 2.5, 10), mesh(new THREE.BoxGeometry(8, 2.4, 1.2), trim, 0, 2.5, 20.2));
    g.userData.lid = lid; return g;
  }

  // load-time warm-up: one of each look (and every beam colour) joins the engine's warm draw
  const warm = new THREE.Group();
  for (const k of Object.keys(templates)) warm.add(templates[k].clone(true));
  for (const c of [...Object.values(rarityColor), ...Object.values(KIND_GLOW)]) { warm.add(new THREE.Mesh(beamGeo, beamMat(c)), new THREE.Mesh(discGeo, discMat(c))); }
  warm.add(look('perk', '#c0392b'), chestModel('#ff9a2e'));
  (host.warmObjects ??= []).push(warm);

  // ---- placing things on the floor
  const down = new THREE.Vector3(0, -1, 0);
  function floorAt(p) {
    const hit = world.raycast?.(new THREE.Ray(p.clone().add(new THREE.Vector3(0, 50, 0)), down), 0, 650);
    return hit?.position ? hit.position.y : p.y;
  }

  // ---- items
  const items = [];
  function spawn(kind, at, opts = {}) {
    if (kind === 'powerup') { powerups?.spawn?.(opts.id ?? 'full_ammo', at.clone()); return null; }
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    let c = KIND_GLOW[kind] ?? '#ffffff', rarity = opts.rarity;
    if (kind === 'weapon') {
      rarity ??= rarityOf(opts.id); c = color(rarity);
      const shown = mysteryBox?.display?.(opts.id);   // the box's pooled, warmed display copy; goes back to the pool when removed
      if (shown) {   // laid on its side on the floor: turned about its long axis, resting on its own thickness
        shown.position.set(0, 0, 0); const tilt = new THREE.Group(); tilt.add(shown); body.add(tilt); body.userData.shown = shown;
        const s = objectBox(shown).getSize(new THREE.Vector3()), long = s.x >= s.z;
        if (long) tilt.rotation.x = Math.PI / 2; else tilt.rotation.z = Math.PI / 2;
        body.position.y = (long ? s.z : s.x) / 2 + .3;
      }
    } else if (kind === 'perk') {
      const p = PERKS.find(x => x.id === opts.id); c = p?.color ?? '#ffffff'; body.add(look('perk', c));
    } else { body.add(LOOKS[kind]().clone(true)); if (opts.big) body.scale.setScalar(1.5); }
    body.rotation.y = Math.random() * Math.PI * 2;
    const tall = kind === 'weapon' || kind === 'perk';
    const disc = new THREE.Mesh(discGeo, discMat(c)); disc.scale.setScalar(tall ? 60 : 34); disc.position.y = .6; root.add(disc);
    if (tall) root.add(new THREE.Mesh(beamGeo, beamMat(c)));
    root.traverse(o => { if (o.isMesh) o.castShadow = false; });
    // everything rests on the floor under `at` (a zombie's feet can be on a ledge or mid-hop; `opts.exact` keeps at.y)
    const ground = opts.exact ? at.y : floorAt(at);
    const item = { kind, root, body, opts, rarity, born: session.time, life: opts.life ?? LIFE[kind] ?? 30, prompt: tall, vel: null, ground, at: at.clone().setY(ground) };
    if (opts.from) {   // thrown out of a chest or box: arc from there to `at`
      const from = opts.from.clone(), up = 220 + Math.random() * 60, T = (up + Math.sqrt(up * up + 2 * GRAVITY * Math.max(0, from.y - at.y))) / GRAVITY;
      item.vel = new THREE.Vector3((at.x - from.x) / T, up, (at.z - from.z) / T); root.position.copy(from);
    } else { root.position.copy(at); if (at.y > ground + 1) item.vel = new THREE.Vector3(); }   // falls the rest of the way
    scene.add(root); items.push(item); return item;
  }
  function remove(item) {
    const i = items.indexOf(item); if (i >= 0) items.splice(i, 1);
    const shown = item.body.userData.shown; if (shown) item.body.remove(shown);   // back to the box's pool
    item.root.removeFromParent();
  }

  // scatter a list of drops in a ring around `from`, landing on the floor and never through a wall
  function scatter(list, from, { r0 = 40, r1 = 80, face } = {}) {
    const out = [], n = list.length;
    list.forEach((d, i) => {
      const base = face ?? Math.random() * Math.PI * 2, a = face !== undefined ? base + (i / Math.max(1, n - 1) - .5) * 2.2 : base + i / n * Math.PI * 2;
      const r = r0 + Math.random() * (r1 - r0), eye = from.clone().setY(from.y + 30);
      let to = from.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      if (world.lineClear && !world.lineClear(eye, to.clone().setY(eye.y))) to = from.clone().add(new THREE.Vector3(Math.cos(a) * 18, 0, Math.sin(a) * 18));
      to.y = floorAt(to);
      out.push(spawn(d.kind, to, { ...d, from: from.clone().setY(from.y + 20) }));
    });
    return out;
  }

  // ---- what picking something up does
  const toast = (t, s = 1.4) => api.toast?.(t, s);
  function giveAmmo(mags = 1) {
    const w = session.weapon, def = session.def; if (!w || !def) return false;
    const max = w.upgraded ? def.upgrade?.maxAmmo ?? def.maxAmmo : def.maxAmmo;
    const n = Math.ceil((w.upgraded ? def.upgrade?.clipSize ?? def.clipSize : def.clipSize ?? 10) * mags);
    w.reserve = Math.min(max ?? Infinity, (w.reserve ?? 0) + n); toast(`+${n} ammo`); return true;
  }
  function giveWeapon(id) {
    if (session.pack?.weapon === session.weapon || session.busy) { toast('Can\'t take it right now'); return false; }
    if (id === 'zombie_cymbal_monkey') { session.giveMonkeys?.(); toast('Monkey Bombs · X to throw'); return true; }
    session.leaveAttachment?.(); session.giveWeapon(id); if (data.weapons?.[id]) api.equipView?.();
    toast(nameOf(id), 2); return true;
  }
  function givePerk(id) {
    const p = PERKS.find(x => x.id === id); if (!p || session.perks?.has(id)) return false;
    if (session.drinking) { toast('Finish your drink first'); return false; }
    if (api.perkInfo && !api.perkInfo[id]) api.perkInfo[id] = { name: p.name, price: p.price, color: p.color, icon: p.badge };
    const ok = session.buyPerk ? session.buyPerk(id, true) : session.drink(id);   // Moon's session has a free path; elsewhere the drink is the perk
    if (!ok) { toast('Can\'t drink that now'); return false; }
    session.markBought?.(id); api.perkDrink?.start(id, api.view); audio?.play?.(id); toast(p.name + ' · free', 2); return true;
  }
  function pick(item) {
    if (item.opts.onPick) return item.opts.onPick(item) !== false;
    const o = item.opts;
    if (item.kind === 'ammo') { if (!giveAmmo(o.amount ?? 1)) return false; audio?.play?.('buy', .25); return true; }
    if (item.kind === 'points') { const n = o.amount ?? 100; session.addPoints ? session.addPoints(n) : (session.points += n); audio?.play?.('buy', .3); return true; }
    if (item.kind === 'grenade') { const cap = Math.max(4, session.maxGrenades ?? 4); if (session.grenades >= cap) return false; session.grenades = Math.min(cap, session.grenades + (o.amount ?? 1)); toast('+1 grenade'); audio?.play?.('buy', .25); return true; }
    if (item.kind === 'weapon') return giveWeapon(o.id);
    if (item.kind === 'perk') return givePerk(o.id);
    return true;
  }

  // ---- chests
  const chests = [];
  function chest(at, yaw, rarity, list, opts = {}) {
    const root = chestModel(color(rarity)); root.position.copy(at); root.position.y = floorAt(at); root.rotation.y = yaw;
    const disc = new THREE.Mesh(discGeo, discMat(color(rarity))); disc.scale.setScalar(80); disc.position.y = .6; root.add(disc, new THREE.Mesh(beamGeo, beamMat(color(rarity))));
    scene.add(root); const c = { root, rarity, list, opts, open: 0, opened: false, born: session.time, label: opts.label ?? 'Open the chest' };
    chests.push(c); audio?.event?.('powerup/spawn/spawn_00', .7); return c;
  }
  function openChest(c) {
    c.opened = true; audio?.play?.('buy', .5); audio?.event?.('box/open/open_00', .8);
    const face = c.root.rotation.y + Math.PI / 2;   // spill out of the front, toward the player who opened it
    const toPlayer = feet().clone().sub(c.root.position); const a = Math.atan2(toPlayer.z, toPlayer.x);
    c.spill = { at: session.time + .35, face: Number.isFinite(a) ? a : face };
    c.opts.onOpen?.(c);
  }

  // ---- melee the Mystery Box: the weapon on offer drops out in front of it
  let lastMelee = 0, knockAt = 0;
  function knockBox() {
    if (!mysteryBox?.boxes) return;
    const eye = camera.position, look = camera.getWorldDirection(new THREE.Vector3());
    for (const b of mysteryBox.boxes.values()) {
      const r = b.roll; if (!r?.ready || r.teddy || !b.wrapper) continue;
      const at = b.display.getWorldPosition(new THREE.Vector3()), to = at.clone().add(new THREE.Vector3(0, 30, 0)).sub(eye), d = to.length();
      if (d > 120 || look.dot(to.normalize()) < .55) continue;
      const weapon = mysteryBox.take(b.entity); if (!weapon) return;
      const dir = eye.clone().sub(at).setY(0).normalize(), land = at.clone().addScaledVector(dir, 55); land.y = floorAt(land);
      share(spawn('weapon', land, { id: weapon, from: at.clone().setY(at.y + 40) }), at.clone().setY(at.y + 40));
      audio?.knife?.('hit', false); toast(nameOf(weapon) + ' knocked out · F to take', 2.5);
      return;
    }
  }
  const shop = api.shop;
  if (shop?.boxPrompt) {   // the box's prompt mentions it
    const prompt = shop.boxPrompt.bind(shop);
    shop.boxPrompt = e => { const t = prompt(e), r = mysteryBox?.at?.(e); return r?.ready && !r.teddy ? t + ' · melee to knock it out' : t; };
  }

  // ---- F on weapons, bottles and chests
  let current = null;
  (host.prompts ??= []).push({
    find() {
      current = null; let best = Infinity; const eye = camera.position, look = camera.getWorldDirection(new THREE.Vector3());
      const consider = (target, at, text) => { const to = at.clone().sub(eye), d = to.length(); if (d > 110 || look.dot(to.normalize()) < .7 || d >= best) return; best = d; current = { target, text }; };
      for (const it of items) if (it.prompt && !it.vel) consider(it, it.root.position.clone().add(new THREE.Vector3(0, 20, 0)), it.kind === 'weapon' ? 'Take ' + nameOf(it.opts.id) : 'Drink ' + (PERKS.find(p => p.id === it.opts.id)?.name ?? 'the perk'));
      for (const c of chests) if (!c.opened) consider(c, c.root.position.clone().add(new THREE.Vector3(0, 14, 0)), c.label);
      return current && { text: current.text, distance: best };
    },
    use() {
      const t = current?.target; if (!t) return false;
      if (chests.includes(t)) { openChest(t); return true; }
      if (t.nid && online()) return claim(t);
      if (pick(t)) { remove(t); return true; }
      return false;
    },
  });

  // ---- shared drops (co-op): a weapon knocked out of the box is everyone's; the host settles who got it first
  let net = null; const taken = new Set(), online = () => (hook(), !!net?.id);
  let nidN = 0;
  function share(item, from) {
    if (!item || !online()) return;
    item.nid = net.id + ':' + (++nidN);
    net.send('all', { t: 'lootdrop', nid: item.nid, kind: item.kind, id: item.opts.id, at: item.at.toArray(), from: from.toArray() });
  }
  function claim(item) {
    if (item.claimed > session.time - 1) return true;   // asked already; the answer is on its way
    if (item.kind === 'weapon' && (session.pack?.weapon === session.weapon || session.busy)) { toast('Can\'t take it right now'); return false; }
    item.claimed = session.time;
    if (net.isHost) settle(item.nid, net.id); else net.send('host', { t: 'lootclaim', nid: item.nid });
    return true;
  }
  function settle(nid, by) {   // the host: the first claim wins
    if (taken.has(nid)) return; taken.add(nid);
    net.send('all', { t: 'loottake', nid, by }); took(nid, by);
  }
  function took(nid, by) {
    const item = items.find(it => it.nid === nid); if (!item) return;
    if (by === net.id) pick(item); else toast((net.players.get(by)?.name ?? 'A teammate') + ' took the ' + nameOf(item.opts.id), 2);
    remove(item);
  }
  function hook() {   // the multiplayer mod makes kino.coop after this mod's setup
    if (net || !window.kino?.coop) return; net = window.kino.coop;
    net.on('lootdrop', m => { if (!Array.isArray(m.at)) return; const it = spawn(m.kind ?? 'weapon', new THREE.Vector3().fromArray(m.at), { id: m.id, from: Array.isArray(m.from) ? new THREE.Vector3().fromArray(m.from) : undefined }); if (it) it.nid = m.nid; });
    net.on('lootclaim', (m, from) => { if (net.isHost && m.nid) settle(m.nid, from); });
    net.on('loottake', m => took(m.nid, m.by));
  }
  host.on('update', hook);

  // ---- every frame
  host.on('update', dt => {
    const now = session.time, f = feet();
    // a melee swing started (meleeLeft jumps up): check the box shortly after, when the knife lands
    const m = session.meleeLeft ?? 0; if (m > lastMelee + .05) knockAt = now + .15; lastMelee = m;
    if (knockAt && now >= knockAt) { knockAt = 0; knockBox(); }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i], p = it.root.position;
      if (it.vel) {   // still flying
        it.vel.y -= GRAVITY * dt; p.addScaledVector(it.vel, dt);
        if (it.vel.y < 0 && p.y <= it.ground) { p.y = it.ground; it.vel = null; }
      }
      const age = now - it.born, left = it.life - age;
      if (left <= 0 || (it.opts.keep && !it.opts.keep())) { remove(it); continue; }
      it.root.visible = left > BLINK || Math.floor(left * 6) % 2 === 0;
      if (it.vel) it.body.rotation.y += dt * 6;   // tumbles in the air, lies still once down
      else if (it.kind === 'points') it.body.rotation.y += dt * 1.2;   // the $ stands on the floor, turning slowly so it reads from every side
      if (!it.prompt && !it.vel) {
        const reach = it.opts.reach ?? 60, dx = p.x - f.x, dz = p.z - f.z;
        if (dx * dx + dz * dz < reach * reach && Math.abs(p.y - f.y) < 80 && session.phase !== 'reviving' && pick(it)) remove(it);
      }
    }
    for (let i = chests.length - 1; i >= 0; i--) {
      const c = chests[i], lid = c.root.userData.lid;
      if (c.spill && now >= c.spill.at) { scatter(c.list, c.root.position.clone(), { r0: 45, r1: 95, face: c.spill.face }); c.spill = null; }
      if (c.opened) { c.open = Math.min(1, c.open + dt * 2.5); lid.rotation.x = -c.open * 1.9; if ((c.gone = (c.gone ?? 0) + dt) > 12) { c.root.removeFromParent(); chests.splice(i, 1); } }
    }
  });
  host.on('reset', () => { taken.clear(); for (const it of [...items]) remove(it); for (const c of chests) c.root.removeFromParent(); chests.length = 0; });

  // ---- weapons and perks for rewards
  function pickWeapon(rarities) {
    const list = window.kino?.boxList, models = mysteryBox?.models ?? {};
    const owned = id => session.inventory?.some(w => w.id === id && !w.lost) || list?.owned?.(id);
    const pool = [...new Set([...(data.boxPool ?? Object.keys(models)), ...(list?.extra ?? [])])]
      .filter(id => id !== 'teddy' && models[id] && data.weapons?.[id] && (!list || list.allowed(id)) && !owned(id));
    const want = new Set(rarities), tier = id => RARITY_ORDER.indexOf(rarityOf(id));
    let pick = pool.filter(id => want.has(rarityOf(id)));
    if (!pick.length) {   // nothing of those rarities switched on: the closest tier below, then anything
      const top = Math.max(...rarities.map(r => RARITY_ORDER.indexOf(r)));
      const below = pool.filter(id => tier(id) <= top).sort((a, b) => tier(b) - tier(a));
      pick = below.length ? below.filter(id => tier(id) === tier(below[0])) : pool;
    }
    if (!pick.length) return null;
    const w = pick.map(id => list?.weight?.(id) ?? 1); let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pick.length; i++) { r -= w[i]; if (r < 0) return pick[i]; }
    return pick.at(-1);
  }
  function freePerk() {
    const ok = PERKS.filter(p => perkUnlocked(p) && !session.perks?.has(p.id) && data.perkDrinks?.[p.id] && !(p.id === 'specialty_quickrevive' && session.revives >= 3));
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  window.kino.loot = { spawn, scatter, chest, pickWeapon, freePerk, givePerk, rarityOf, color, items, chests, remove };
}
