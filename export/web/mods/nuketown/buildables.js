// Nuketown's buildables (_nt_rake / _nt_shield in the original), on the co-op layer of der-eisendrache/sync.js:
//   - Every part lies in one of three spots, the same spot index for all parts of a buildable (one roll per game, the
//     original's single rand). All parts are shared by the team, as in Der Eisendrache.
//   - Three stations for each: with all parts press use at any of them, stay close for 3 s, and the finished item shows on
//     all three (ENT_rake_hidings / ENT_hidings_shield).
//   - The rake trap: take a rake from a station (one in hand, five down per player), place it with the claymore key. A zombie
//     stepping on it dies with its head off, the handle swings up and falls back; after 20 uses it breaks. A placed rake can
//     be picked up and moved.
//   - The Zombie Shield (shield.js): the map's car door on a dolly, carried on the Rocket Shield's code and planted as in BO2.
//     A station repairs a damaged one.
//   - The electric water trap: two switches, 1000 points, power needed, 30 s on, 60 s cooling; kills every zombie in the water
//     and shocks players standing in it.
import * as THREE from 'three';
import { binds } from '../../settings.js';
import { makeSparkSheet } from './fx.js';
import { setupShield } from './shield.js';

const RAKE = { perPlayer: 5, pool: 12, uses: 20, reach: 40, swing: .14, fall: .55, angle: 1.15 };
const BUILD = { time: 3, reach: 110 };
const CRAFTS = {
  rake: { label: 'Rake Trap', item: 'Rake', hidings: 'rake_hidings',
    parts: [
      { id: 'axe', name: 'Axe', node: 'rake_part1', spots: [[686, 1707, 701], [127, 1726, 1682], [-79, 1675, 1822]] },
      { id: 'rake', name: 'Rake', node: 'rake_part2', spots: [[-1205, 1724, -388], [-1955, 1738, -933], [-1747, 1720, -1248]] },
      { id: 'rope', name: 'Rope', node: 'rake_part3', spots: [[-1605, 1269, 1464], [-1511, 1269, 1336], [-1341, 1303, 1947]] },
    ],
    stations: [[-1512, 1734, 1353], [644, 1867, -266], [-1096, 1409, 1012]] },
  shield: { label: 'Zombie Shield', item: 'Shield', hidings: 'hidings_shield',
    parts: [
      { id: 'door', name: 'Car door', node: 'shield1', spots: [[-836, 1714, -242], [531, 1724, -813], [41, 1685, 156]] },
      { id: 'dolly', name: 'Dolly', node: 'shield2', spots: [[-422, 1718, -1145], [2008, 1709, -484], [-1152, 1867, -735]] },
    ],
    stations: [[-1445, 1750, -286], [1482, 1736, 481], [-2301, 1436, 301]] },
};
// the rake model as it stands at the first station: entity origin and yaw, to bring its baked geometry back to model space
const RAKE_MODEL = { origin: [-1550, 1729, 1362], yaw: 90 };
const TRAP = { switches: [[-346, 1753, 1436], [-199, 1728, 1861]], lamps: [[-350, 1765, 1437], [-176, 1727, 1876]], box: [[-402, 1692.6, 1462], [-250, 1708.7, 1681.9]],
  cost: 1000, time: 30, cooldown: 60, tick: .25, hurt: 5, hurtEvery: .5 };

const css = `#nt-bar{position:fixed;left:50%;top:62%;width:240px;height:8px;margin-left:-120px;background:#0009;border:1px solid #fff5;z-index:30;pointer-events:none}
#nt-bar i{display:block;height:100%;width:0;background:#ffd98a}
#nt-carry{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);padding:4px 12px;background:#0008;color:#ffe9c0;font:600 14px/1.3 sans-serif;letter-spacing:.04em;border-radius:3px;z-index:30;pointer-events:none}`;

export function setupBuildables(c) {
  const { api, world, session, host, root, sync, nodesOf, moved, show, V, sound, sfx, toast, announce, player, inBox } = c;
  const { enemies, features, scene } = api;
  const near = (a, b, r) => a.distanceToSquared(b) < r * r;
  // the nodes of `name`, split by the spot each stands nearest
  const bySpot = (name, spots) => {
    const out = spots.map(() => []), box = new THREE.Box3(), mid = new THREE.Vector3();
    for (const n of nodesOf(root, name)) {
      box.setFromObject(n); if (box.isEmpty()) continue; box.getCenter(mid);
      let best = 0, bd = Infinity; spots.forEach((s, i) => { const d = s.distanceTo(mid); if (d < bd) { bd = d; best = i; } });
      out[best].push(n);
    }
    return out;
  };
  const crafts = Object.entries(CRAFTS).map(([key, d]) => {
    const stations = d.stations.map(a => V(...a));
    return { key, ...d, stations, hidden: bySpot(d.hidings, stations), have: new Set(), chosen: 0, built: false,
      parts: d.parts.map(q => { const spots = q.spots.map(a => V(...a)); return { ...q, spots, nodes: bySpot(q.node, spots) }; }) };
  });
  const [rakeCraft, shieldCraft] = crafts;
  const b = { build: null, held: false, rakes: [], trap: { on: 0, cool: 0, tick: 0, hurt: 0, by: null } };
  const pop = (name, at, gain = .8, range = 1100) => { const d = at.distanceTo(player.getFeetPosition()); if (d < range) sound(name, gain * (1 - d / range) ** 2); };

  // ---- HUD
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const bar = document.createElement('div'); bar.id = 'nt-bar'; bar.hidden = true; bar.innerHTML = '<i></i>';
  const carry = document.createElement('div'); carry.id = 'nt-carry'; carry.hidden = true;
  document.body.append(bar, carry);
  const fill = bar.firstChild;
  const keyName = () => (binds().claymore ?? 'Digit4').replace(/^(Digit|Key)/, '');
  const paintCarry = () => { carry.hidden = !b.held; if (b.held) carry.textContent = `Rake · press ${keyName()} to place it at your feet`; };
  host.on('warmHud', on => { bar.hidden = !on; carry.hidden = !on; if (on) carry.textContent = 'Rake'; else paintCarry(); });

  // ---- parts and stations
  sync.on('ntCraftPick', d => {
    for (const cr of crafts) {
      cr.chosen = d[cr.key]; cr.parts.forEach(q => q.nodes.forEach((n, i) => show(n, i === cr.chosen)));
    }
  });
  sync.on('ntPart', (d, ctx) => {
    const cr = crafts.find(x => x.key === d.c), q = cr?.parts.find(x => x.id === d.part); if (!q || cr.have.has(q.id)) return;
    cr.have.add(q.id); show(q.nodes[cr.chosen], false);
    if (ctx.mine) { sfx('buy', .5); toast(`${q.name} · ${cr.have.size} / ${cr.parts.length} parts for the ${cr.label}`, 4); }
  });
  sync.on('ntBuilt', (d, ctx) => {
    const cr = crafts.find(x => x.key === d.c); if (!cr || cr.built) return;
    cr.built = true; for (const n of cr.hidden) show(n, true);
    pop('tactical_buttonpress', cr.stations[d.at] ?? player.getFeetPosition(), .9);
    if (ctx.mine) toast(`${cr.label} built: take it from any of its three stations`, 5);
  });
  for (const cr of crafts) {
    cr.parts.forEach(q => q.spots.forEach((at, i) => world.addInteraction({
      position: at.clone().add(V(0, 16, 0)), nuketown: true,
      hidden: () => cr.chosen !== i || cr.have.has(q.id), text: () => `Pick up the ${q.name}`,
      use() { sync.act('ntPart', { c: cr.key, part: q.id }); return true; },
    })));
    cr.stations.forEach((at, i) => world.addInteraction({
      position: at.clone(), nuketown: true,
      hidden: () => cr.built, text: () => `Add Parts (${cr.label})`,
      locked: () => cr.have.size < cr.parts.length, get lockedText() { return `${cr.parts.length - cr.have.size} more part${cr.parts.length - cr.have.size > 1 ? 's' : ''} required (${cr.label})`; },
      use() { if (!b.build) { b.build = { cr, at, i, t: 0 }; bar.hidden = false; fill.style.width = '0'; } return true; },
    }));
  }
  const buildTick = (dt, p) => {
    const x = b.build; if (!x) return;
    if (!near(p, x.at, BUILD.reach) || session.phase === 'reviving') { b.build = null; bar.hidden = true; toast('Stay at the station to build', 2); return; }
    x.t += dt; fill.style.width = Math.min(100, x.t / BUILD.time * 100) + '%';
    if (x.t >= BUILD.time) { b.build = null; bar.hidden = true; sync.act('ntBuilt', { c: x.cr.key, at: x.i }); }
  };

  // ---- the rake: RAKE_MODEL is at the handle's end and the head 72 along +z; the instances pivot on the head, handle along -z
  const { origin: ro, yaw } = RAKE_MODEL, rakeLength = 72;
  const parts = [];
  for (const n of rakeCraft.hidden[0]) n.traverse(m => {
    if (!m.isMesh) return;
    const g = m.geometry.clone().translate(-ro[0], -ro[1], -ro[2]).rotateY(-yaw * Math.PI / 180).translate(0, 0, -rakeLength);
    parts.push({ g, material: m.material });
  });
  const mineOut = () => b.rakes.filter(r => r.on && r.by === sync.me).length;
  for (let i = 0; i < RAKE.pool; i++) {
    const r = { i, id: 0, on: false, by: null, uses: 0, t: -1, wait: 0, group: new THREE.Group(), tilt: new THREE.Group(), head: new THREE.Vector3() };
    for (const q of parts) { const m = new THREE.Mesh(q.g, q.material); m.frustumCulled = false; r.tilt.add(m); }
    r.group.add(r.tilt); r.group.visible = false; scene.add(r.group); b.rakes.push(r);
    world.addInteraction({ position: r.head, nuketown: true, hidden: () => !r.on || b.held, text: () => 'Pick up Rake',
      use() { sync.act('ntRakeTake', { id: r.id }); return true; } });
  }
  host.warmObjects?.push?.(b.rakes[0].group);
  const setTilt = (r, a) => { r.tilt.rotation.x = a; r.tilt.updateMatrix(); r.tilt.updateMatrixWorld(true); };
  const rakeOff = r => { r.on = false; r.group.visible = false; r.t = -1; };
  sync.on('ntRakePlace', (d, ctx) => {
    const r = b.rakes.find(x => !x.on) ?? b.rakes[0];
    Object.assign(r, { on: true, id: d.id, by: ctx.by, uses: RAKE.uses, t: -1, wait: 0 });
    r.group.position.fromArray(d.at); r.group.rotation.y = d.yaw; r.group.visible = true; setTilt(r, 0);
    r.group.updateMatrix(); r.group.updateMatrixWorld(true);
    r.head.copy(r.group.position).add(V(0, 12, 0));
    pop('rake_fall', r.head);
  });
  sync.on('ntRakeTake', (d, ctx) => {
    const r = b.rakes.find(x => x.on && x.id === d.id); if (!r) return;
    rakeOff(r);
    if (ctx.mine) { b.held = true; paintCarry(); sfx('buy', .4); }
  });
  sync.on('ntRakeHit', d => {
    const r = b.rakes.find(x => x.on && x.id === d.id); if (!r) return;
    r.t = 0; r.uses--; pop('rake_hit_0' + (d.n % 3), r.head);
  });
  const placeRake = () => {
    if (!player.grounded) { toast('Stand on the ground to place the rake', 2); return false; }
    const f = player.getFeetPosition(), d = (api.mods?.camera ?? api.camera)?.getWorldDirection?.(V(0, 0, 0)) ?? V(0, 0, -1);
    // the head goes ahead of the player and the handle lies back toward their feet, so a zombie coming at them steps on it
    const yaw = Math.atan2(d.x, d.z), head = f.clone().addScaledVector(d.setY(0).normalize(), rakeLength * .8);
    const ground = world.raycast?.(new THREE.Ray(head.clone().add(V(0, 30, 0)), V(0, -1, 0)), 0, 70);
    if (!ground) { toast('No room for the rake here', 2); return false; }
    head.y += 30 - ground.distance;
    b.held = false; paintCarry();
    sync.act('ntRakePlace', { id: Math.floor(Math.random() * 1e9), at: [head.x, head.y + 1, head.z], yaw });
    return true;
  };
  const rakeTick = dt => {
    for (const r of b.rakes) {
      if (!r.on) continue;
      r.wait -= dt;
      if (r.t >= 0) {
        r.t += dt;
        const k = r.t < RAKE.swing ? r.t / RAKE.swing : Math.max(0, 1 - (r.t - RAKE.swing) / RAKE.fall);
        setTilt(r, RAKE.angle * k * (2 - k));
        if (r.t > RAKE.swing + RAKE.fall) { r.t = -1; setTilt(r, 0); if (r.uses <= 0) { pop('zombie_shield_break', r.head); rakeOff(r); } }
      }
      if (!sync.isHost || r.t >= 0 || r.wait > 0) continue;
      for (const z of enemies.list) {
        if (z.rising || z.dead) continue;
        const q = z.root.position;
        if (Math.abs(q.y - r.head.y) > 50 || (q.x - r.head.x) ** 2 + (q.z - r.head.z) ** 2 > RAKE.reach ** 2) continue;
        r.wait = RAKE.swing + RAKE.fall; sync.act('ntRakeHit', { id: r.id, n: Math.floor(Math.random() * 3) });
        sync.hurt(z, 1e7, { by: r.by }, { head: true, cause: 'trap' });
        break;
      }
    }
  };
  for (const [i, at] of rakeCraft.stations.entries()) world.addInteraction({
    position: at.clone().add(V(0, 6, 0)), nuketown: true,
    hidden: () => !rakeCraft.built || b.held, text: () => mineOut() >= RAKE.perPlayer ? 'Five rakes down: pick one up first' : 'Pick up Rake',
    use() { if (mineOut() >= RAKE.perPlayer) return false; b.held = true; paintCarry(); sfx('buy', .4); toast(`Rake: press ${keyName()} to place it`, 4); return true; },
  });
  if (features) { const orig = features.placeClaymore; features.placeClaymore = (...a) => (b.held && session.phase !== 'reviving' ? placeRake() : orig?.(...a)); }

  // ---- the shield
  const shield = setupShield(c, shieldCraft, pop);
  for (const at of shieldCraft.stations) world.addInteraction({
    position: at.clone().add(V(0, 6, 0)), nuketown: true,
    hidden: () => !shieldCraft.built || shield.planted() || (shield.held() && !shield.damaged()), text: () => shield.held() ? 'Repair the Shield' : 'Pick up Shield',
    use() {
      if (shield.held()) { shield.repair(); sfx('buy', .5); toast('Shield repaired', 2.5); return true; }
      return shield.give();
    },
  });

  // ---- the electric water trap
  const lamps = TRAP.lamps.map(a => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), new THREE.MeshBasicMaterial({ color: 0x401010, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.fromArray(a); scene.add(m); m.updateMatrix(); m.updateMatrixWorld(true); return m;
  });
  const sheet = makeSparkSheet(api, TRAP.box, TRAP.box[1][1] + 2);
  const paintLamps = () => { const t = b.trap, hex = !session.power ? 0x401010 : t.on > 0 || t.cool > 0 ? 0xff2010 : 0x20ff30; for (const m of lamps) m.material.color.setHex(hex); };
  sync.on('ntTrap', (d, ctx) => {
    Object.assign(b.trap, { on: TRAP.time, cool: TRAP.cooldown, tick: 0, hurt: 0, by: ctx.by });
    paintLamps(); pop('tactical_buttonpress', V(...TRAP.switches[d.i ?? 0]), .9, 1600); if (ctx.mine) toast(`Electric water trap · ${TRAP.time} s`, 3);
  });
  TRAP.switches.forEach((a, i) => world.addInteraction({
    position: V(...a), nuketown: true,
    text: () => `Activate the Electric Water Trap · ${TRAP.cost}`,
    locked: () => !session.power || b.trap.on > 0 || b.trap.cool > 0,
    get lockedText() { return !session.power ? 'The power must be activated' : b.trap.on > 0 ? 'Trap active' : 'Trap cooling down'; },
    use() { if (!session.spend(TRAP.cost)) { toast('Not enough points'); return false; } sfx('buy'); sync.act('ntTrap', { i }); return true; },
  }));
  const trapTick = (dt, p) => {
    const t = b.trap;
    sheet.value += ((t.on > 0 ? 1 : 0) - sheet.value) * Math.min(1, dt * 6);
    if (t.on <= 0) { if (t.cool > 0 && (t.cool -= dt) <= 0) paintLamps(); return; }
    t.on -= dt; t.cool -= dt;
    if ((t.hurt -= dt) <= 0 && inBox(p, TRAP.box, 0, 40)) {
      t.hurt = TRAP.hurtEvery; api.damage?.(TRAP.hurt); const fp = globalThis.kino?.fpMotion; if (fp) fp.shake = .5;
    }
    if ((t.tick -= dt) > 0 || !sync.isHost) return;
    t.tick = TRAP.tick;
    for (const z of [...enemies.list]) {
      const q = z.root.position; if (z.rising || !inBox(q, TRAP.box, 0, 40)) continue;
      globalThis.kino?.fx?.strike?.([q.x, q.y + 30, q.z], { scale: .5, color: 0x9fd0ff });
      sync.hurt(z, 1e7, { by: t.by }, { cause: 'electric' });
    }
  };

  const reset = () => {
    b.build = null; b.held = false; bar.hidden = true; paintCarry(); shield.reset();
    for (const cr of crafts) { cr.have.clear(); cr.built = false; for (const n of cr.hidden) show(n, false); for (const q of cr.parts) for (const n of q.nodes) show(n, false); }
    for (const r of b.rakes) rakeOff(r);
    Object.assign(b.trap, { on: 0, cool: 0, tick: 0, hurt: 0, by: null }); sheet.value = 0; paintLamps();
    if (sync.isHost) sync.act('ntCraftPick', Object.fromEntries(crafts.map(cr => [cr.key, Math.floor(Math.random() * 3)])));
  };
  let powered = false;
  const tick = (dt, p) => {
    if (!!session.power !== powered) { powered = !!session.power; paintLamps(); }
    buildTick(dt, p); rakeTick(dt); shield.tick(); trapTick(dt, p);
  };
  // journal and Tab: `at` is where the part lies this game
  const state = () => ({
    rake: craftState(rakeCraft), shield: craftState(shieldCraft),
    shieldOwned: shield.held(), heldRake: b.held, rakesDown: b.rakes.filter(r => r.on).length,
    trap: { switches: TRAP.switches.map(a => V(...a)), on: b.trap.on > 0, cooling: b.trap.on <= 0 && b.trap.cool > 0, ready: !!session.power && b.trap.cool <= 0 },
  });
  const craftState = cr => ({ label: cr.label, built: cr.built, stations: cr.stations, parts: cr.parts.map(q => ({ name: q.name, got: cr.have.has(q.id), at: q.spots[cr.chosen] })) });
  return { b, crafts, shield, reset, tick, state, found: crafts.map(cr => [cr.key, cr.parts.map(q => q.nodes.map(n => n.length).join('/')), cr.hidden.map(n => n.length).join('/')]) };
}
