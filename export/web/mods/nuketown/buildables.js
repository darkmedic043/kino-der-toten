// Nuketown's buildables (_nt_rake / _nt_shield in the original), on the co-op layer of der-eisendrache/sync.js:
//   - Every part lies in one of three spots, the same spot index for all parts of a buildable (one roll per game, the
//     original's single rand). All parts are shared by the team, as in Der Eisendrache.
//   - Three stations for each: with all parts press use at any of them, stay close for 3 s, and the finished item shows on
//     all three (ENT_rake_hidings / ENT_hidings_shield).
//   - The rake trap: take a rake from a station (one in hand), place it with the claymore key. The rakes themselves are
//     mods/bloodstreaks/rake.js (window.kino.rakes, on every map since the Rake Trap became a Bloodstreak, 2026-11-22): five
//     down per player, a zombie stepping on one dies with its head off, it breaks after 20. Taking one marks the Rake Trap
//     found for the Armory's BLOODSTREAKS tab; kills with your rakes unlock it.
//   - The Zombie Shield (shield.js): the map's car door on a dolly, carried on the Rocket Shield's code and planted as in BO2.
//     A station repairs a damaged one.
//   - The electric water trap: two switches, 1000 points, power needed, 30 s on, 60 s cooling; kills every zombie in the water
//     and shocks players standing in it.
import * as THREE from 'three';
import { makeSparkSheet } from './fx.js';
import { setupShield } from './shield.js';

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
const TRAP = { switches: [[-346, 1753, 1436], [-199, 1728, 1861]], lamps: [[-350, 1765, 1437], [-176, 1727, 1876]], box: [[-402, 1692.6, 1462], [-250, 1708.7, 1681.9]],
  cost: 1000, time: 30, cooldown: 60, tick: .25, hurt: 5, hurtEvery: .5 };

const css = `#nt-bar{position:fixed;left:50%;top:62%;width:240px;height:8px;margin-left:-120px;background:#0009;border:1px solid #fff5;z-index:30;pointer-events:none}
#nt-bar i{display:block;height:100%;width:0;background:#ffd98a}`;

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
  const rakes = () => globalThis.kino?.rakes;
  const b = { build: null, trap: { on: 0, cool: 0, tick: 0, hurt: 0, by: null } };
  const pop = (name, at, gain = .8, range = 1100) => { const d = at.distanceTo(player.getFeetPosition()); if (d < range) sound(name, gain * (1 - d / range) ** 2); };

  // ---- HUD
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const bar = document.createElement('div'); bar.id = 'nt-bar'; bar.hidden = true; bar.innerHTML = '<i></i>';
  document.body.append(bar);
  const fill = bar.firstChild;
  host.on('warmHud', on => { bar.hidden = !on; });

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

  for (const [i, at] of rakeCraft.stations.entries()) world.addInteraction({
    position: at.clone().add(V(0, 6, 0)), nuketown: true,
    hidden: () => !rakeCraft.built || !rakes()?.ready || rakes().hand > 0, text: () => rakes().mineOut() >= 5 ? 'Five rakes down: pick one up first' : 'Pick up Rake',
    use() {
      const r = rakes(); if (!r || r.mineOut() >= 5) return false;
      r.give(1); sfx('buy', .4); globalThis.kino?.armory?.found?.('rake_trap'); return true;
    },
  });

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
    b.build = null; bar.hidden = true; rakes()?.reset(); shield.reset();
    for (const cr of crafts) { cr.have.clear(); cr.built = false; for (const n of cr.hidden) show(n, false); for (const q of cr.parts) for (const n of q.nodes) show(n, false); }
    Object.assign(b.trap, { on: 0, cool: 0, tick: 0, hurt: 0, by: null }); sheet.value = 0; paintLamps();
    if (sync.isHost) sync.act('ntCraftPick', Object.fromEntries(crafts.map(cr => [cr.key, Math.floor(Math.random() * 3)])));
  };
  let powered = false;
  const tick = (dt, p) => {
    if (!!session.power !== powered) { powered = !!session.power; paintLamps(); }
    buildTick(dt, p); shield.tick(); trapTick(dt, p);
  };
  // journal and Tab: `at` is where the part lies this game
  const state = () => ({
    rake: craftState(rakeCraft), shield: craftState(shieldCraft),
    shieldOwned: shield.held(), heldRake: (rakes()?.hand ?? 0) > 0, rakesDown: rakes()?.down() ?? 0,
    trap: { switches: TRAP.switches.map(a => V(...a)), on: b.trap.on > 0, cooling: b.trap.on <= 0 && b.trap.cool > 0, ready: !!session.power && b.trap.cool <= 0 },
  });
  const craftState = cr => ({ label: cr.label, built: cr.built, stations: cr.stations, parts: cr.parts.map(q => ({ name: q.name, got: cr.have.has(q.id), at: q.spots[cr.chosen] })) });
  return { b, crafts, shield, reset, tick, state, found: crafts.map(cr => [cr.key, cr.parts.map(q => q.nodes.map(n => n.length).join('/')), cr.hidden.map(n => n.length).join('/')]) };
}
