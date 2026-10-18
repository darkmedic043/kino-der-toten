// Der Eisendrache's elemental bow upgrades, as BO3 runs them (zm_castle_weap_quest_upgrade.gsc), for the whole team.
// Every quest is the same frame: something shot with Wrath of the Ancients drops a broken arrow; the player who picks it
// up owns that quest (one quest per player: picking up a second arrow drops the first back where it was, and a quest
// whose owner leaves or bleeds out drops the same way; its progress stays). Only the owner's shots, uses and kills count.
// After its steps the arrow is reforged, placed on its pedestal around the undercroft pyramid (a Max Ammo drops), and 20
// of the owner's kills in the undercroft (aq_statue_volume) feed it; then the owner takes the bow (it replaces the bow in
// hand) and afterwards anyone can take one from that pedestal.
//   Storm  shoot the weather vane on the clock tower; shoot the three beacons (the wall, the cliff, the rocket pad);
//          wall-run through the five undercroft triggers without touching the ground (low gravity); fill the three
//          batteries (gatehouse, clock tower, rocket pad) with 5 kills each, then stand on a filled battery and fire a
//          fully drawn arrow at a beacon, once per beacon; reforge on the roof.
//   Fire   shoot the clock on the tower wall; just after a rocket test fire (7.5 s) shoot the obelisk by the rocket
//          pad: a magma ball rises over the roof; shoot each runic circle (road, rampart, roof) while flying off a
//          launch pad, then charge it with 9 kills standing in it (a symbol lights every 3); turn the clock: its wheel
//          shows one fireplace and keeps that fireplace's circle; magma golf: standing in the pool, each arrow's landing
//          makes the next pool, an arrow into the fireplace wins (in under 3 shots: a Max Ammo), 4 misses and it waits
//          for the next round to start over; use the fireplace; reforge on the roof.
//   Wolf   use the four king paintings (dealt at random to four walls) in their order 1-4 holding a bow (a wrong one
//          starts over); the wall in the undercroft breaks; shoot the skull shrine above the rocket pad and pick up the
//          skull where it rolls; place it in the undercroft: Skadi's ghost walks to the courtyard, the road (waiting
//          at its door until the gatehouse is open) and the undercroft; at each spot 10 kills near her and she digs up
//          bones (pick them up); in the burial chamber, wall-running, shoot the symbol: the ledge forms for 10 s; reforge.
//   Void   shoot the symbol in the gatehouse ceiling; melee a zombie on the trophy room's flagstone seal; use the urn;
//          return the six chomper fossils around the castle; the chompers eat 6 crawlers in the demonic circle; the urn
//          shows three crests (shoot it to see them again), the Great Hall's armour shows each crest's rune; kills drop
//          demonic runes (10%), each lights its rune on the circle; shoot the crests' runes in order (wrong: a frenzy,
//          then again); reforge in the trophy room.
// BO3 shows its quest objects through scenes and fx; the map's props stand in (CASTLE_BQ_* from the builder) with soft
// glows where BO3 has fx. Co-op: every step is a sync event (sync.js), Skadi runs on the host (shared state), kills come
// from the host's `kill` events (by: the killer). The arrows' elements are effects (sync.fx): seen by everyone, their
// damage on the host, credited to the shooter.
// Charged shots: hold fire with a bow to draw (1.6 s full), release to fire; a drawn arrow plays its element's charged form.
// Testing: kino.castle.bows.state(), .advance(el) (finish the current step), .give(el).
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CollisionWorld } from '../../collision-world.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);   // BO3 (CoD) coordinates -> the map's
const BASE = 'bo3_wrath_ancients', isBow = id => id === BASE || /^bo3_bow_/.test(id ?? '');
const SOULS = 20, PAINT_SPOTS = ['cannon', 'clock', 'hall', 'living'];
// volumes: BO3's brushes aren't in the dump; cylinders around their origins (r across, h up and down)
const V = (p, r, h = 120) => ({ p, r, h });
const inV = (p, v) => Math.hypot(p.x - v.p.x, p.z - v.p.z) < v.r && Math.abs(p.y - v.p.y) < v.h;
const near = (p, t, r) => p.distanceTo(t) < r;
const Q = {
  storm: { name: 'Storm Bow', color: 0x7fd0ff, arrow: W(-137, 1927, 952), reforge: W(-127, 1941, 952), pedestal: W(-1358.7, 2424.6, 218),
    steps: ['beacons', 'wallrun', 'batteries', 'reforge'],
    start: W(-184, 1879, 1233), startR: 80,
    beacons: [W(-3105, -785, 30), W(3900, 1130, -918), W(4529, -4080, -1103)],
    wallrun: [W(-525, 1812, 457), W(48, 2685, 457), W(-612, 2812, 457), W(387, 2220, 455), W(-1600, 2534, 457)],
    batteries: [{ id: 'gatehouse', vol: V(W(1712, 1536, 544), 220), charged: V(W(1644, 1424, 544), 75, 90), at: W(1616, 1392, 464) },
      { id: 'clocktower', vol: V(W(-1149, 1439, 880), 220), charged: V(W(-1142, 1279, 880), 75, 90), at: W(-1138, 1265, 845) },
      { id: 'a10', vol: V(W(5709, -2776, -2216), 260), charged: V(W(5653, -2863, -2216), 75, 90), at: W(5623, -2882, -2292) }] },
  rune: { name: 'Fire Bow', color: 0xff6a1a, arrow: W(-1087, 1584.5, 1054), reforge: W(208, 1916, 970), pedestal: W(-1023.8, 2423.1, 218),
    steps: ['obelisk', 'circles', 'clock', 'golf', 'fireplace', 'reforge'],
    start: W(-1067, 1640, 1079), startR: 80, obelisk: W(4982, -1805, -2059), ball: W(210, 1920, 1532),
    circles: [{ id: 'road', vol: V(W(1397, 1063, 187), 95, 100), trig: W(1346, 1073, 174), fire: 'road' },
      { id: 'rampart', vol: V(W(-600, 1428, 829), 95, 100), trig: W(-600, 1428, 816) },
      { id: 'roof', vol: V(W(209, 1915, 901), 95, 100), trig: W(209, 1917, 887) }],
    clock: W(-1060, 1662, 1073),
    // aq_rp_fireplace_struct (script_noteworthy = its circle, script_int = the wheel's index) -> its volume, power-up spot
    fireplaces: { road: { n: 1, at: W(1164, 3012, 708), vol: V(W(1160, 3012, 704), 90, 90), drop: W(1124, 3012, 672) },
      roof: { n: 2, at: W(-856, 4008, 708), vol: V(W(-856, 4007, 698), 90, 90), drop: W(-856, 3960, 664) },
      rampart: { n: 3, at: W(1624.4, 3298.4, 562), vol: V(W(1622, 3301, 556), 90, 90), drop: W(1653.7, 3263, 528) } } },
  wolf: { name: 'Wolf Bow', color: 0x9fd8ff, arrow: W(-1225, 2984.5, 328), reforge: W(486, 2327, 400), pedestal: W(-1362.1, 2089.6, 218),
    steps: ['shrine', 'skull', 'escort', 'burial'],
    paintings: { cannon: W(-914, 1197.5, 576.5), clock: W(-899, 1397, 882), hall: W(-504, 3005, 885), living: W(845.8, 4102, 747.5) },
    shrine: W(5374, -1663, -1200), skull: W(4834, -1796, -2246), skadiSkull: W(-1364.4, 2127.6, 190), skadi: W(-1555.8, 1985.7, 200),
    digs: [{ id: 'courtyard', at: W(-1024.2, 2086.9, 616), vol: V(W(-1040, 2041, 699), 300, 200), bones: W(-1023.6, 2086.4, 606.5) },
      { id: 'road', at: W(1164.1, 1244.2, 224), vol: V(W(1413, 1137, 253), 380, 200), bones: W(1164, 1244.1, 213), door: W(904, 520, -40), zone: 'tramtogatehouse' },
      { id: 'undercroft', at: W(-90, 2544, 200), vol: V(W(-90, 2527, 204), 300, 160), bones: W(-85.4, 2545.6, 189.9) }],
    tomb: W(517, 2328, 385), burial: W(471, 2328, 439), ledge: [W(380, 2250, 340), W(530, 2410, 355)] },
  demon: { name: 'Void Bow', color: 0xb06bff, arrow: W(1432, 1710.3, 312.5), reforge: W(-659.3, 1296, 540), pedestal: W(-1025.1, 2088.1, 218),
    steps: ['seal', 'urn', 'fossils', 'crawlers', 'runes', 'reforge'],
    start: W(1431, 1766, 533), startR: 80, seal: V(W(-658, 1294, 509), 55, 70), urn: W(-659.3, 1296, 522), urnTop: W(-658.8, 1293.3, 617.8), urnHit: W(-660, 1295, 632),
    fossils: { bedroom: [W(442.3, 2837, 693.2), '05'], bridge: [W(1775.5, 1411.2, 340.4), '02'], courtyard: [W(-520.1, 2849.2, 861.2), '06'],
      platform: [W(3941.2, -2861.3, -2239.7), '03'], tunnel: [W(-923, 207.2, 368.5), '01'], undercroft: [W(128.2, 3403.3, 187.8), '04'] },
    circle: V(W(-658, 1296, 552), 200, 80), trophy: V(W(-657, 1323, 551), 280, 130),
    armour: { crown: W(380, 4036, 806), door: W(380, 3836, 806), griffon: W(-78, 3740, 806), heart: W(126, 3504, 854), horn: W(-180, 3830, 838), stag: W(-80, 4140, 806) },
    runes: { ulla: W(-578, 1251, 512), zor: W(-668, 1204, 512), oth: W(-741, 1254, 513), mar: W(-739, 1342, 512), uja: W(-647, 1389, 512), lor: W(-576, 1339, 512) } },
};
const STATUE = V(W(-1192, 2256, 248), 520, 160);
const HINT = {
  storm: { beacons: 'Shoot the three beacons far out from the castle', wallrun: 'Wall-run through all five undercroft triggers without landing (low gravity)',
    batteries: 'Fill the three storm batteries with kills, then from each fire a fully drawn arrow at a beacon', reforge: 'Reforge the arrow on the roof' },
  rune: { obelisk: 'Shoot the obelisk by the rocket pad just after a rocket test fire', circles: 'Shoot the runic circles while flying off a launch pad, then charge each with kills standing in it',
    clock: 'Turn the clock in the clock tower', golf: 'Magma golf: from the pool, land arrows toward the fireplace the wheel shows', fireplace: 'Take the magma from the fireplace', reforge: 'Reforge the arrow on the roof' },
  wolf: { shrine: 'Shoot the skull shrine above the rocket pad', skull: 'Pick up the wolf skull below the shrine', escort: 'Place the skull in the undercroft and protect Skadi while she digs',
    burial: 'In the burial chamber, shoot the symbol while wall-running, then reforge on the ledge' },
  demon: { seal: 'Melee a zombie on the flagstone seal in the trophy room', urn: 'Use the urn in the trophy room', fossils: 'Return the six chomper fossils around the castle',
    crawlers: 'Feed the chompers 6 crawlers in the demonic circle', runes: 'Find the urn\'s crests on the Great Hall armour, collect the runes and shoot them in order', reforge: 'Reforge the arrow in the trophy room' },
};
const CREST = { crown: 'Crown', door: 'Door', griffon: 'Griffon', heart: 'Heart', horn: 'Horn', stag: 'Stag' };
const RUNE = { ulla: 'Ulla', zor: 'Zor', oth: 'Oth', mar: 'Mar', uja: 'Uja', lor: 'Lor' };

export function setupBows(api, { lowgrav, pads, traps } = {}) {
  const { world, session, host, player, camera, enemies, scene, audio, toast, announce, data, sync } = api;
  const kino = window.kino, root = world.root;
  // cached: getObjectByName walks the whole castle, and the per-frame update looked names up every frame (15% of the
  // CPU on Der Eisendrache, 2026-10-17). A miss is retried after 5 s; a node that left the scene is looked up again.
  const nodes = new Map(), node = n => { const c = nodes.get(n), now = performance.now(); if (c && (c.o ? c.o.parent : now < c.retry)) return c.o; const o = root.getObjectByName(n) ?? null; nodes.set(n, { o, retry: now + 5000 }); return o; };
  const showNode = (n, on = true) => { const o = typeof n === 'string' ? node(n) : n; if (o && o.visible !== on) { o.visible = on; o.updateMatrixWorld(true); } };
  const moveNode = (o, p) => { if (!o) return; o.parent.updateMatrixWorld(true); o.position.copy(o.parent.worldToLocal(p.clone())); o.updateMatrixWorld(true); };
  const me = () => sync.me, feet = () => player.getFeetPosition();
  const fresh = () => ({ stage: 'idle', owner: null, step: 0, souls: 0, d: {} });
  const st = {}; for (const el of Object.keys(Q)) st[el] = fresh();
  const team = { paint: 0, deal: null, owners: () => Object.values(st).map(s => s.owner) };
  const stepOf = el => st[el].stage === 'steps' ? Q[el].steps[st[el].step] : null;
  const mine = el => st[el].owner != null && st[el].owner === me();
  const tell = (el, text, t = 4) => { if (mine(el)) toast?.(`${Q[el].name} · ${text}`, t); };

  // ---- markers (soft glows where BO3 has fx), recomputed every frame from the state ------------------------------------
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  function glow(p, color, size = 40) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(p); m.scale.setScalar(size); scene.add(m); return m; }
  function unglow(m) { if (!m) return; m.removeFromParent(); m.material.map !== glowTex && m.material.map?.dispose(); m.material.dispose(); }
  function label(text, color = '#e8d8ff') {   // a word floating over a thing (crests and runes: BO3 shows their symbols)
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = 'bold 40px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#000'; x.shadowBlur = 8; x.fillStyle = color; x.fillText(text.toUpperCase(), 128, 34);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); m.scale.set(64, 16, 1); scene.add(m); return m;
  }
  const marks = new Map();
  // made on demand later: the engine compiles one of each while loading (host.warmObjects)
  { const g = glow(new THREE.Vector3(), 0xffffff), l = label('·'); g.removeFromParent(); l.removeFromParent(); host.warmObjects?.push(g, l); }
  function marksUpdate(want) {   // want: Map id -> {p, color, size, text}
    for (const [id, m] of marks) if (!want.has(id)) { unglow(m); marks.delete(id); }
    for (const [id, w] of want) {
      let m = marks.get(id); if (!m) { m = w.text ? label(w.text) : glow(w.p, w.color, w.size); marks.set(id, m); }
      m.position.copy(w.p); if (!w.text) { m.scale.setScalar(w.size * (w.pulse ? 1 + .25 * Math.sin(performance.now() / 160) : 1)); m.material.opacity = w.opacity ?? 1; }
    }
  }

  // ---- props: the broken arrow (the bow's projectile model) and the waiting bows (world models) ------------------------
  const def = el => data.weapons['bo3_bow_' + el], models = {};
  async function model(key, url) { if (!url) return null; if (models[key] !== undefined) return models[key]; models[key] = null; const m = await loadModel(url).catch(() => null); if (m) { m.visible = false; scene.add(m); } models[key] = m; return m; }
  for (const el of Object.keys(Q)) { model('arrow:' + el, def(el)?.projectileModel); model('bow:' + el, def(el)?.worldModel); }
  const looseAt = el => { const s = st[el]; return s.stage === 'steps' ? Q[el].arrow : s.stage === 'place' ? Q[el].reforge : Q[el].pedestal; };
  // the burial chamber's ledge: solid while it stands
  const ledgeBox = (() => { const [a, b] = Q.wolf.ledge, bx = new THREE.Box3().setFromPoints([a, b]), size = bx.getSize(new THREE.Vector3()), geo = new THREE.BoxGeometry(size.x, size.y, size.z); geo.translate(...bx.getCenter(new THREE.Vector3()).toArray()); const d = { collider: new CollisionWorld(geo), box: bx, enabled: false, window: true }; world.dynamic.push(d); return d; })();
  const skadiNode = node('CASTLE_BQ_skadi_0'), wheel = node('CASTLE_SM_aq_rp_clock_wheel'), wheelQ = wheel?.quaternion.clone();
  // fxanim rigs whose bind pose is their pieces scattered (the platform, the urn): left hidden; the ledge is a stone slab
  // in the floor's material, the urn a glow
  showNode('CASTLE_BQ_urn_0', false); showNode('CASTLE_BQ_ledge_0', false);
  const ledgeMesh = (() => { const bx = ledgeBox.box, size = bx.getSize(new THREE.Vector3()); let mat = null; node('CASTLE_FLAGSTONES_REAL')?.traverse(o => { if (o.isMesh && !mat) mat = o.material; });
    const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat ?? new THREE.MeshStandardMaterial({ color: 0x6d675e, roughness: 1 })); m.position.copy(bx.getCenter(new THREE.Vector3())); m.visible = false; scene.add(m); return m; })();
  // the runic circles: BO3's emissive cards came without their textures; a ring of runes is drawn in their place (on
  // the circle model's plane), its three symbols brightening as the circle charges
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.translate(128, 128); x.strokeStyle = '#fff'; x.lineWidth = 6;
    x.beginPath(); x.arc(0, 0, 118, 0, Math.PI * 2); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 96, 0, Math.PI * 2); x.stroke();
    x.font = 'bold 18px serif'; x.fillStyle = '#fff'; x.textAlign = 'center'; for (let k = 0; k < 24; k++) { x.save(); x.rotate(k / 24 * Math.PI * 2); x.fillText('ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ'[k % 12], 0, -102); x.restore(); }
    return new THREE.CanvasTexture(c); })();
  const symTex = ['ᛉ', 'ᛟ', 'ᛞ'].map(ch => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = 'bold 54px serif'; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 32, 34); return new THREE.CanvasTexture(c); });
  root.traverse(o => { const m = /^CASTLE_BQ_r(circle|symbol)_(\w+?)(?:_(\d))?$/.exec(o.name); if (!m) return; o.traverse(c => { if (c.isMesh) { c.material = c.material.clone(); c.material.visible = false; } });   // the node is the mesh: its material goes, its children stay
    const big = m[1] === 'circle', size = big ? 232 : 30, card = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(0, 5, 0), new THREE.MeshBasicMaterial({ map: big ? ringTex : symTex[(+m[3] || 1) - 1], color: 0xff6a1a, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    o.add(card); });
  // the four kings' portraits (i_mtl_p7_zm_ctl_kingspainting_0N_c) weren't exported with the frames: painted stand-ins,
  // a king at four ages (BO3's order runs youngest to oldest)
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 192; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#3a1d12'); g.addColorStop(1, '#120806'); x.fillStyle = g; x.fillRect(0, 0, 128, 192);
    x.fillStyle = '#2b3a4a'; x.beginPath(); x.ellipse(64, 150, 44, 50, 0, Math.PI, 0); x.fill();                       // shoulders
    const skin = ['#e7c3a0', '#d8b08a', '#c49a78', '#b08a70'][i]; x.fillStyle = skin; x.beginPath(); x.ellipse(64, 84, 22, 28, 0, 0, Math.PI * 2); x.fill();
    if (i) { x.fillStyle = ['', '#6b4a2a', '#8a8378', '#e8e4dc'][i]; x.beginPath(); x.ellipse(64, 104, 18 + i * 3, 8 + i * 7, 0, 0, Math.PI); x.fill(); }   // a beard that greys
    x.fillStyle = '#d4a82a'; x.beginPath(); x.moveTo(42, 60); for (let k = 0; k <= 4; k++) { x.lineTo(42 + k * 11, k % 2 ? 50 : 36); } x.lineTo(86, 60); x.closePath(); x.fill();   // crown
    x.strokeStyle = 'rgba(0,0,0,.35)'; for (let k = 0; k < 40; k++) { x.beginPath(); const y = Math.random() * 192; x.moveTo(0, y); x.lineTo(128, y + 3); x.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;   // glTF UVs
    // its meshes: the canvas, the frame, an emissive card (untextured: the builder shares one material between them)
    for (const sp of PAINT_SPOTS) { const meshes = []; node(`CASTLE_BQ_painting_${i}_${sp}`)?.traverse(o => { if (o.isMesh) meshes.push(o); });
      if (meshes[0]) { meshes[0].material = new THREE.MeshStandardMaterial({ map: tex, roughness: .8, side: THREE.DoubleSide }); } if (meshes[2]) meshes[2].visible = false; }
  }
  showNode('CASTLE_SM_aq_wh_skadi_skull', false);

  // ---- ownership -------------------------------------------------------------------------------------------------------
  function drop(el) { const s = st[el]; if (s.owner == null) return; if (s.owner === me()) toast?.(`${Q[el].name} · your arrow went back`, 3); s.owner = null; }
  sync.on('bqTake', (d, ctx) => {   // pick up a loose arrow (or claim a placed one)
    const s = st[d.el]; if (!s || s.owner != null || !['steps', 'place', 'souls', 'ready'].includes(s.stage)) return;
    for (const [el, o] of Object.entries(st)) if (el !== d.el && o.owner === ctx.by) drop(el);   // one quest each (quest_swap)
    s.owner = ctx.by; if (ctx.mine) { audio?.play?.('buy', .5); const step = stepOf(d.el); tell(d.el, step ? HINT[d.el][step] : s.stage === 'place' ? 'Place the arrow on its pedestal in the undercroft' : 'Feed the pedestal kills in the undercroft', 5); }
  });
  sync.on('bqDrop', d => drop(d.el));
  let ownT = 0;
  host.on('update', dt => {   // the host drops the quests of players who left the room or bled out (room membership, not
    // poses: a teammate still loading has sent none)
    if (!sync.online || !sync.isHost || (ownT -= dt) > 0) return; ownT = 2;
    const net = sync.net, ids = new Set([sync.me, ...net.players.keys()].filter(id => !net.remotes?.get(id)?.dead));
    for (const [el, s] of Object.entries(st)) if (s.owner != null && !ids.has(s.owner)) sync.act('bqDrop', { el });
  });

  // ---- steps ------------------------------------------------------------------------------------------------------------
  function enter(el, ctx) {   // a step begins (on every client, in event order)
    const s = st[el], step = stepOf(el); s.d = {};
    if (step === 'batteries') { s.d.kills = {}; s.d.charged = new Set(); s.d.used = new Set(); }
    if (step === 'circles') { s.d.active = new Set(); s.d.kills = {}; }
    if (step === 'escort') s.d.phase = 'skull';
    if (step === 'runes') {   // BO3 function_8700782f: armour crests and circle runes shuffled together; slots 1-3 are the sequence
      const crests = shuffle(Object.keys(Q.demon.armour), ctx.rand), runes = shuffle(Object.keys(Q.demon.runes), ctx.rand);
      s.d.armour = Object.fromEntries(crests.map((c, i) => [c, runes[i]])); s.d.seq = [1, 2, 3].map(i => crests[i]); s.d.need = [1, 2, 3].map(i => runes[i]);
      s.d.drops = shuffle(Object.keys(Q.demon.runes), ctx.rand); s.d.lit = new Set(); s.d.slot = 0; s.d.rune = null; s.d.failUntil = 0; s.d.shown = false;
    }
    if (step) tell(el, HINT[el][step], 5);
  }
  function next(el, ctx) {
    const s = st[el]; audio?.play?.('buy', .5); s.step++;
    if (s.step >= Q[el].steps.length) { s.stage = 'place'; tell(el, 'Place the arrow on its pedestal in the undercroft', 5); return; }
    enter(el, ctx);
  }
  function shuffle(a, rand) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // the starts: anyone's arrow (the wolf's: the paintings)
  sync.on('bqStart', (d, ctx) => { const s = st[d.el]; if (!s || s.stage !== 'idle') return; s.stage = 'steps'; s.step = 0; s.owner = null; enter(d.el, ctx);
    audio?.play?.('box', .6); toast?.(`Something broke loose · ${Q[d.el].name.replace(' Bow', '')}`, 3); });
  sync.on('bqDeal', (d, ctx) => { team.deal = shuffle(PAINT_SPOTS, ctx.rand); team.paint = 0; });
  sync.on('bqPaint', d => {   // BO3 function_2601ae75: in order; the one just used again is harmless, anything else starts over
    if (st.wolf.stage !== 'idle' || !team.deal) return;
    if (d.i === team.paint) { team.paint++; audio?.play?.('buy', .35); if (team.paint === 4) { st.wolf.stage = 'steps'; st.wolf.step = 0; enter('wolf', {}); audio?.play?.('box', .6); toast?.('A wall gave way in the undercroft', 3); } }
    else if (d.i !== team.paint - 1) { team.paint = 0; audio?.play?.('hit', .4); }
  });
  // the owner's shots at quest targets
  sync.on('bqHit', (d, ctx) => {
    const el = d.el, s = st[el], step = stepOf(el); if (!s || s.owner !== ctx.by) return;
    if (el === 'storm' && step === 'beacons' && !s.d.lit?.has(d.k)) { (s.d.lit ??= new Set()).add(d.k); audio?.play?.('buy', .35); if (s.d.lit.size === 3) next(el, ctx); }
    if (el === 'storm' && step === 'wallrun' && d.what === 'wallrun') next(el, ctx);
    if (el === 'storm' && step === 'batteries' && d.what === 'beacon' && !s.d.charged.has(d.k) && s.d.kills[d.battery] >= 5 && !s.d.used.has(d.battery)) {
      s.d.charged.add(d.k); s.d.used.add(d.battery); audio?.play?.('buy', .5); if (s.d.charged.size === 3) next(el, ctx); }
    if (el === 'rune' && step === 'obelisk') { s.d.ball = true; next(el, ctx); }
    if (el === 'rune' && step === 'circles' && !s.d.active.has(d.k)) { s.d.active.add(d.k); s.d.kills[d.k] = 0; audio?.play?.('buy', .4); tell(el, `The ${d.k} circle is lit · charge it with kills standing in it`, 3); }
    if (el === 'rune' && step === 'golf' && d.what === 'golf') golfShot(el, sync.v(d.p), ctx);
    if (el === 'wolf' && step === 'shrine') { audio?.play?.('box', .5); tell(el, 'The skull rolled down below the shrine', 3); next(el, ctx); }
    if (el === 'wolf' && step === 'burial' && d.what === 'burial') { s.d.ledgeUntil = session.time + 10; audio?.play?.('box', .5); tell(el, 'The ledge formed · reforge the arrow on it', 3); }
    if (el === 'demon' && step === 'runes') runeShot(el, d, ctx);
  });
  // the owner's uses
  sync.on('bqUse', (d, ctx) => {
    const el = d.el, s = st[el], step = stepOf(el);
    if (d.what === 'place' && s.stage === 'place' && s.owner === ctx.by) { s.stage = 'souls'; s.souls = 0; audio?.play?.('box', .6); if (sync.isHost) api.powerups?.spawn?.('full_ammo', Q[el].pedestal.clone()); tell(el, `Feed it ${SOULS} kills in the undercroft`, 4); return; }
    if (d.what === 'take' && (s.stage === 'ready' && s.owner === ctx.by || s.stage === 'spawned')) { if (s.stage === 'ready') { s.stage = 'spawned'; s.owner = null; } if (ctx.mine) give(el); return; }
    if (s.owner !== ctx.by) return;
    if (step === 'reforge' && d.what === 'reforge') { announce?.(Q[el].name.toUpperCase(), 'ARROW REFORGED', 2.5); return next(el, ctx); }
    if (el === 'rune' && step === 'clock' && d.what === 'clock') {   // BO3 function_88082ccd: a random fireplace; the wheel turns to it
      const ids = Object.keys(Q.rune.fireplaces), fp = ids[Math.floor(ctx.rand() * ids.length)]; s.fire = fp; s.wheel = { t: 0, to: (Q.rune.fireplaces[fp].n * 120 + 240) * Math.PI / 180 };
      audio?.play?.('box', .5); return next(el, ctx);
    }
    if (el === 'rune' && step === 'fireplace' && d.what === 'fireplace') return next(el, ctx);
    if (el === 'wolf' && step === 'skull' && d.what === 'skull') return next(el, ctx);
    if (el === 'wolf' && step === 'escort' && d.what === 'skadi' && s.d.phase === 'skull') { s.d.phase = 'walk'; s.d.k = 0; s.d.p = Q.wolf.skadi.clone(); s.d.kills = 0; audio?.play?.('box', .5); tell(el, 'Skadi rises · follow her and protect her', 4); return; }
    if (el === 'wolf' && step === 'escort' && d.what === 'bones' && s.d.phase === 'dug' && d.k === s.d.k) { s.d.k++; s.d.kills = 0; audio?.play?.('buy', .5); s.d.phase = s.d.k >= 3 ? 'tomb' : 'walk'; return; }
    if (el === 'wolf' && step === 'burial' && d.what === 'reforge' && session.time < (s.d.ledgeUntil ?? 0)) { announce?.(Q[el].name.toUpperCase(), 'ARROW REFORGED', 2.5); return next(el, ctx); }
    if (el === 'demon' && step === 'urn' && d.what === 'urn') { s.d.urn = 0; return next(el, ctx); }
    if (el === 'demon' && step === 'fossils' && d.what === 'fossil') { (s.fossils ??= new Set()).add(d.k); audio?.play?.('buy', .4); if (s.fossils.size === 6) next(el, ctx); return; }
    if (el === 'demon' && step === 'runes' && d.what === 'armour') { s.d.show = { crest: d.k, until: session.time + 2 }; return; }
    if (el === 'demon' && step === 'runes' && d.what === 'grab' && s.d.rune) { const r = s.d.rune.label; s.d.rune = null; s.d.lit.add(r); s.d.drops = s.d.drops.filter(x => x !== r); audio?.play?.('box', .5); tell(el, `The rune ${RUNE[r]} lit on the circle`, 3); }
  });
  // the Skadi escort's waypoints (the host walks her: shared state)
  sync.on('bqSkadi', (d, ctx) => { const s = st.wolf; if (stepOf('wolf') !== 'escort') return; if (d.what === 'at') { s.d.phase = 'dig'; s.d.kills = 0; s.d.k = d.k; tell('wolf', `Kill zombies near Skadi (10)`, 3); } if (d.what === 'tomb') next('wolf', ctx); });
  sync.shared('skadi', () => st.wolf.d.p ? { p: sync.a(st.wolf.d.p), wait: !!st.wolf.d.wait } : null, v => { if (v && st.wolf.d) { st.wolf.d.to = sync.v(v.p); st.wolf.d.p ??= st.wolf.d.to.clone(); st.wolf.d.wait = v.wait; } });
  // golf (BO3 rune_prison_golf): the pool is the circle, then each landing; 4 shots without the fireplace, then after the round
  function golfShot(el, p, ctx) {
    const s = st[el], fp = Q.rune.fireplaces[s.fire]; if (s.d.wait) return;
    const hops = s.d.hops ?? 0;
    if (inV(p, fp.vol)) { if (hops < 3 && sync.isHost) api.powerups?.spawn?.('full_ammo', fp.drop.clone()); audio?.play?.('box', .6); tell(el, 'The magma reached the fireplace · take it', 3); s.d.pool = null; return next(el, ctx); }
    s.d.hops = hops + 1; audio?.play?.('hit', .5);
    if (s.d.hops >= 4) { s.d.pool = null; s.d.hops = 0; s.d.wait = session.round; tell(el, 'The magma cooled · try again next round', 3); return; }
    s.d.pool = p.clone();
  }
  host.on('update', () => { const s = st.rune; if (stepOf('rune') === 'golf' && s.d.wait && session.round > s.d.wait) s.d.wait = 0; });
  const golfPool = () => { const s = st.rune; if (stepOf('rune') !== 'golf' || s.d.wait) return null; return s.d.pool ? V(s.d.pool, 100, 150) : Q.rune.circles.find(c => c.id === s.fire)?.vol; };
  // the void runes: in the crests' order; a wrong one (BO3 rune_sequence_failed) sets off a frenzy, then it starts over
  function runeShot(el, d, ctx) {
    const s = st[el]; if (d.what === 'urn') { s.d.replay = session.time; return; }
    if (d.what !== 'rune' || !s.d.lit.has(d.k) || session.time < s.d.failUntil) return;
    if (d.k === s.d.need[s.d.slot]) { s.d.slot++; audio?.play?.('buy', .5); if (s.d.slot >= 3) { announce?.('THE URN SHATTERS', '', 2); return next(el, ctx); } return; }
    s.d.slot = 0; s.d.failUntil = session.time + 30; audio?.play?.('hit', .7); toast?.('The demon gate is angered', 3);
    if (sync.isHost) frenzy(24);
  }
  let frenzyT = 0, frenzyN = 0;
  function frenzy(t) { frenzyT = t; frenzyN = 0; }
  host.on('update', dt => {
    if (!dt || frenzyT <= 0 || !sync.isHost) return; frenzyT -= dt;
    if (frenzyN < frenzyT * 2 && enemies.list.length < 24) { frenzyN++; const a = Math.random() * Math.PI * 2, p = Q.demon.circle.p.clone().add(new THREE.Vector3(Math.cos(a) * 260, 0, Math.sin(a) * 260)); const q = world.closest?.(p, { x: 120, y: 160, z: 120 }) ?? p; const z = enemies.spawn(q, null, 'zombie'); if (z) { session.total++; session.spawned++; } }
  });
  // the void rune power-up (zm_powerup_demonic_rune): times out after 25 s; the host re-deals what's left
  sync.on('bqRuneLost', (d, ctx) => { const s = st.demon; if (stepOf('demon') !== 'runes' || !s.d.rune) return; s.d.rune = null; s.d.drops = shuffle(s.d.drops, ctx.rand); });
  host.on('update', () => { const s = st.demon; if (sync.isHost && stepOf('demon') === 'runes' && s.d.rune && session.time - s.d.rune.t > 25 && !s.d.rune.lost) { s.d.rune.lost = true; sync.act('bqRuneLost', {}); } });
  sync.on('bqCrawler', (d, ctx) => { const s = st.demon; if (stepOf('demon') !== 'crawlers') return; s.d.eaten = (s.d.eaten ?? 0) + 1; soul(sync.v(d.p), Q.demon.urnTop, Q.demon.color); if (s.d.eaten >= 6) next('demon', ctx); });
  sync.on('bqDebug', (d, ctx) => {   // testing: finish the current step
    const el = d.el, s = st[el]; if (!s) return;
    if (s.stage === 'idle') { if (el === 'wolf') team.paint = 4; s.stage = 'steps'; s.step = 0; s.owner = null; return enter(el, ctx); }
    if (s.owner == null && s.stage !== 'spawned') s.owner = ctx.by;
    if (s.stage === 'steps') { if (el === 'rune' && stepOf(el) === 'clock') s.fire ??= 'roof'; return next(el, ctx); }
    if (s.stage === 'place') { s.stage = 'souls'; s.souls = SOULS - 1; }
  });

  // ---- kills (the host's, in order on every client) --------------------------------------------------------------------
  sync.on('kill', (d, ctx) => {
    const p = sync.v(d.p), bp = d.bp ? sync.v(d.bp) : null;
    for (const [el, s] of Object.entries(st)) {
      if (s.owner == null || d.by !== s.owner || d.kind === 'dog' || d.kind === 'panzer') continue;
      const step = stepOf(el);
      if (s.stage === 'souls' && inV(p, STATUE)) { s.souls++; soul(p, Q[el].pedestal, Q[el].color); if (s.souls >= SOULS) { s.stage = 'ready'; announce?.(Q[el].name.toUpperCase(), 'READY ON ITS PEDESTAL', 3); audio?.play?.('box'); } }
      if (el === 'storm' && step === 'batteries') for (const b of Q.storm.batteries) if (inV(p, b.vol) && (s.d.kills[b.id] ?? 0) < 5) { s.d.kills[b.id] = (s.d.kills[b.id] ?? 0) + 1; soul(p, b.at, Q.storm.color); if (s.d.kills[b.id] === 5) { audio?.play?.('buy', .4); tell(el, `The ${b.id === 'a10' ? 'rocket pad' : b.id} battery is full`, 3); } }
      if (el === 'rune' && step === 'circles' && bp) for (const c of Q.rune.circles) if (s.d.active.has(c.id) && s.d.kills[c.id] < 9 && inV(bp, c.vol)) {
        s.d.kills[c.id]++; soul(p, c.vol.p, Q.rune.color); if (s.d.kills[c.id] % 3 === 0) audio?.play?.('buy', .35);
        if (Q.rune.circles.every(x => s.d.kills[x.id] >= 9)) next(el, ctx);
      }
      if (el === 'wolf' && step === 'escort' && s.d.phase === 'dig' && inV(p, Q.wolf.digs[s.d.k].vol)) { s.d.kills++; soul(p, Q.wolf.digs[s.d.k].at, Q.wolf.color); if (s.d.kills >= 10) { s.d.phase = 'dug'; audio?.play?.('box', .4); tell(el, 'Skadi dug up bones · pick them up', 3); } }
      if (el === 'demon' && step === 'seal' && d.melee && inV(p, Q.demon.seal)) { audio?.play?.('box', .5); next(el, ctx); }
      if (el === 'demon' && step === 'runes' && !s.d.rune && s.d.drops.length && ctx.rand() <= .1) { s.d.rune = { label: s.d.drops[0], p: p.clone().add(new THREE.Vector3(0, 30, 0)), t: session.time }; tell(el, 'A demonic rune dropped', 2); }
    }
    // without the dismemberment mod no zombie can crawl: the owner's kills in the circle stand in
    if (stepOf('demon') === 'crawlers' && !kino.dismemberment && d.by === st.demon.owner && inV(p, Q.demon.circle) && sync.isHost) sync.act('bqCrawler', { p: d.p });
  });
  // the chompers eat crawlers in the demonic circle (any player's; BO3 function_f836dce1), on the host
  let chompT = 0;
  host.on('update', dt => {
    if (!dt || !sync.isHost || stepOf('demon') !== 'crawlers' || (chompT -= dt) > 0) return; chompT = .5 + Math.random() * 2;
    for (const z of [...enemies.list]) if (z.crawler && !z.chomped && inV(z.root.position, Q.demon.circle)) { z.chomped = true; const p = sync.a(z.root.position); enemies.hurt(z, 1e9, false, false, 'explosion'); sync.act('bqCrawler', { p }); }
  });

  // ---- interactions (the uses) -----------------------------------------------------------------------------------------
  const I = (p, text, use, hidden) => world.addInteraction({ position: p.clone(), text, hidden, use() { if (hidden()) return false; use(); return true; } });
  const owner = el => st[el].owner === me(), holding = () => isBow(session.weapon?.id), hasBow = () => session.inventory.some(w => isBow(w.id));
  for (const el of Object.keys(Q)) {
    const s = st[el], q = Q[el];
    for (const at of new Set([q.arrow, q.reforge, q.pedestal])) I(at, () => s.stage === 'steps' ? 'Pick up the broken arrow' : s.stage === 'place' ? 'Take the reforged arrow' : `Claim the ${q.name}`, () => sync.act('bqTake', { el }),
      () => s.owner != null || !['steps', 'place', 'souls', 'ready'].includes(s.stage) || !looseAt(el).equals(at));
    I(q.pedestal.clone().add(new THREE.Vector3(0, 30, 0)), () => s.stage === 'place' ? 'Place the arrow' : `Take the ${q.name}`, () => sync.act('bqUse', { el, what: s.stage === 'place' ? 'place' : 'take' }),
      () => !(s.stage === 'place' && owner(el) || s.stage === 'ready' && owner(el) && holding() || s.stage === 'spawned' && holding() && session.weapon?.id !== 'bo3_bow_' + el));
    I(q.reforge.clone().add(new THREE.Vector3(0, 20, 0)), () => 'Reforge the arrow', () => sync.act('bqUse', { el, what: 'reforge' }),
      () => !owner(el) || !(stepOf(el) === 'reforge' || el === 'wolf' && stepOf(el) === 'burial' && session.time < (s.d.ledgeUntil ?? 0)));
  }
  I(Q.rune.clock, () => 'Turn the clock', () => sync.act('bqUse', { el: 'rune', what: 'clock' }), () => !owner('rune') || stepOf('rune') !== 'clock');
  for (const [id, f] of Object.entries(Q.rune.fireplaces)) I(f.at, () => 'Take the magma', () => sync.act('bqUse', { el: 'rune', what: 'fireplace' }), () => !owner('rune') || stepOf('rune') !== 'fireplace' || st.rune.fire !== id);
  for (const [spot, p] of Object.entries(Q.wolf.paintings)) I(p, () => 'Touch the painting', () => sync.act('bqPaint', { i: team.deal.indexOf(spot) }), () => st.wolf.stage !== 'idle' || !team.deal || !hasBow());
  I(Q.wolf.skull, () => 'Pick up the wolf skull', () => sync.act('bqUse', { el: 'wolf', what: 'skull' }), () => !owner('wolf') || stepOf('wolf') !== 'skull');
  I(Q.wolf.skadiSkull, () => 'Place the wolf skull', () => sync.act('bqUse', { el: 'wolf', what: 'skadi' }), () => !owner('wolf') || stepOf('wolf') !== 'escort' || st.wolf.d.phase !== 'skull');
  Q.wolf.digs.forEach((g, k) => I(g.bones, () => 'Pick up the bones', () => sync.act('bqUse', { el: 'wolf', what: 'bones', k }), () => !owner('wolf') || stepOf('wolf') !== 'escort' || st.wolf.d.phase !== 'dug' || st.wolf.d.k !== k));
  I(Q.demon.urn, () => 'Use the urn', () => sync.act('bqUse', { el: 'demon', what: 'urn' }), () => !owner('demon') || stepOf('demon') !== 'urn');
  for (const [k, [p]] of Object.entries(Q.demon.fossils)) I(p, () => 'Return the fossil', () => sync.act('bqUse', { el: 'demon', what: 'fossil', k }), () => !owner('demon') || stepOf('demon') !== 'fossils' || st.demon.fossils?.has(k));
  for (const [k, p] of Object.entries(Q.demon.armour)) I(p, () => 'Inspect the armour', () => sync.act('bqUse', { el: 'demon', what: 'armour', k }), () => !owner('demon') || stepOf('demon') !== 'runes');

  // ---- the bow in hand: draw, hold, loose (BO3's vm_bow_launcher_draw / draw_loop / draw_cancel / fire) -------------------
  // With a bow in hand the left mouse button (and the touch fire button: host.holdFire) is the bow's: pressing pulls the
  // string (chargeAnim, then chargeLoopAnim held at full draw), releasing looses the arrow through the engine
  // (kino.debug.shoot: its fire clip, sound and projectile). Held past 0.3 s the arrow is charged (a ring round the
  // crosshair fills over 1.6 s; full is BO3's chargeshotlevel 4, what the storm batteries need) and takes more arrows:
  // 2, or 3 drawn fully (fewer if the quiver runs short, which also caps the draw). There's no reload: the next arrow
  // is nocked from the quiver as the fire clip ends. Sprinting, swapping or going down lets the string go.
  const CHARGE = 1.6, view = api.view, ring = document.createElement('div'); ring.id = 'bow-charge';
  ring.style.cssText = 'position:fixed;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;z-index:3;pointer-events:none;display:none';
  document.body.append(ring);
  let drawing = null, shot = null, lastImpact = null, nockAt = 0;
  const bowInHand = () => isBow(session.weapon?.id) && !session.weaponUnavailable && !api.host?.gunBlocked;
  const elOf = id => /^bo3_bow_(\w+)$/.exec(id ?? '')?.[1] ?? 'base';
  const cost = k => (k >= 1 ? 3 : k > 0 ? 2 : 1);
  const canDraw = () => bowInHand() && session.weapon.mag > 0 && session.phase !== 'reviving' && view?.ready && ['idle', 'fire', 'bowdraw'].includes(view.mode) && !view.input?.sprint;
  function startDraw(touch) {
    if (drawing || !canDraw()) return;
    drawing = { t: 0, touch, id: session.weapon.id };
    if (view.rig?.actions.chargeAnim) { view.mode = 'bowdraw'; view.rig.play('chargeAnim', false, 1, .06); drawing.clip = 'chargeAnim'; }
  }
  function letGo() {   // the string goes slack without a shot
    if (!drawing) return; ring.style.display = 'none';
    if (view?.mode === 'bowdraw') { view.mode = 'fire'; if (!view.rig?.play('chargeCancelAnim', false, 1, .06)) view.mode = 'idle'; }
    drawing = null;
  }
  function release() {
    const d = drawing; if (!d) return; drawing = null; ring.style.display = 'none';
    if (view?.mode === 'bowdraw') view.mode = 'idle';   // the engine's shot plays the fire clip from here
    const quiver = session.weapon.reserve ?? 0;
    let k = d.t > .3 ? Math.min(1, d.t / CHARGE) : 0; while (k > 0 && cost(k) - 1 > quiver) k = cost(k) === 3 ? .99 : 0;   // a short quiver caps the draw
    const f = feet();
    shot = { el: elOf(session.weapon?.id), k, full: k >= 1, at: performance.now(), from: f, eye: camera.position.clone(), flung: !!pads?.flying?.(), run: !!lowgrav?.state?.().running,
      battery: Q.storm.batteries.find(b => inV(f, b.charged))?.id ?? null };
    if (window.kino.debug?.shoot?.()) { session.weapon.reserve = Math.max(0, quiver - (cost(k) - 1)); nockAt = session.time + Math.max(.25, (session.def.fireTime ?? .32)); }
    else shot = null;
  }
  addEventListener('mousedown', e => { if (e.button !== 0 || !api.getState().active || host.keepActive || !bowInHand() || window.kino.operator?.active) return;   // keepActive: a UI is up (the terminal), its clicks aren't shots
  e.stopImmediatePropagation(); startDraw(false); }, true);
  addEventListener('mouseup', e => { if (e.button !== 0 || !bowInHand() || (host.keepActive && !drawing)) return; e.stopImmediatePropagation(); if (drawing && !drawing.touch) release(); }, true);
  // touch: the fire button reaches the engine, not mouse events; while a bow is in hand the engine leaves it to us
  host.holdFire = () => bowInHand() && touchHeld();
  const touchHeld = () => !!view?.input?.fire && !mouseDown;
  let mouseDown = false, touchWas = false;
  addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; }, true); addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; }, true);
  host.on('update', dt => {
    // nock the next arrow (no reload); a reload started anyway (R) is replaced by the nock
    if (bowInHand()) {
      const w = session.weapon;
      if (session.reloadLeft > 0) { session.cancelReload?.(); if (w.mag === 0) nockAt = Math.min(nockAt || session.time, session.time); }
      if (w.mag === 0 && (w.reserve ?? 0) > 0 && session.time >= nockAt) { w.mag = 1; w.reserve--; }
    }
    const t = bowInHand() && touchHeld();
    if (t && !touchWas) startDraw(true);
    if (!t && touchWas && drawing?.touch) release();
    touchWas = t;
    if (!drawing) return;
    if (!bowInHand() || session.weapon.id !== drawing.id || view?.input?.sprint || session.phase === 'reviving') { letGo(); return; }
    drawing.t += dt; const k = Math.min(1, drawing.t / CHARGE), col = '#' + (Q[elOf(session.weapon.id)]?.color ?? 0xffa040).toString(16).padStart(6, '0');
    if (drawing.clip === 'chargeAnim' && view.mode === 'bowdraw' && !view.rig.actions.chargeAnim.isRunning()) { drawing.clip = 'chargeLoopAnim'; view.rig.play('chargeLoopAnim', true, 1, .08); }
    ring.style.display = drawing.t > .15 ? 'block' : 'none'; ring.style.background = `conic-gradient(${col} ${k * 360}deg, #ffffff22 0)`; ring.style.webkitMask = ring.style.mask = 'radial-gradient(circle, transparent 17px, #000 18px)';
    if (k >= 1 && !drawing.full) { drawing.full = true; audio?.play?.('buy', .3); }
  });
  host.on('reset', () => { drawing = null; shot = null; nockAt = 0; ring.style.display = 'none'; });

  // ---- arrow impacts (the shooter's client): quest shots and the element effects ---------------------------------------
  // the bows' arrows explode through kino-features blast() -> effect(position, 0xffb347, 25)
  host.on('effect', e => {
    if (e.count !== 25 || !isBow(session.weapon?.id) || session.weaponUnavailable) return;
    const p = e.position.clone(); if (p.distanceTo(camera.position) > 12000) return;
    const sh = shot && performance.now() - shot.at < 6000 ? shot : null; shot = null;
    const flung = sh?.flung || !!pads?.flying?.(), run = sh?.run || !!lowgrav?.state?.().running, from = sh?.from ?? feet();
    // starts (anyone)
    for (const el of ['storm', 'rune', 'demon']) if (st[el].stage === 'idle' && near(p, Q[el].start, Q[el].startR)) sync.act('bqStart', { el });
    // the owner's quest targets
    const step = el => owner(el) ? stepOf(el) : null;
    if (step('storm') === 'beacons') Q.storm.beacons.forEach((b, k) => { if (near(p, b, 150) && !st.storm.d.lit?.has(k)) sync.act('bqHit', { el: 'storm', k }); });
    if (step('storm') === 'batteries' && sh?.full && sh.battery) Q.storm.beacons.forEach((b, k) => { if (near(p, b, 150)) sync.act('bqHit', { el: 'storm', what: 'beacon', k, battery: sh.battery }); });
    if (step('rune') === 'obelisk' && near(p, Q.rune.obelisk, 130) && session.time < magmaUntil) sync.act('bqHit', { el: 'rune', what: 'obelisk' });
    if (step('rune') === 'circles' && flung) for (const c of Q.rune.circles) if (near(p, c.trig, 110)) sync.act('bqHit', { el: 'rune', what: 'circle', k: c.id });
    if (step('rune') === 'golf') { const pool = golfPool(); if (pool && inV(from, pool)) { const g = world.closest?.(p, { x: 40, y: 140, z: 40 }); sync.act('bqHit', { el: 'rune', what: 'golf', p: sync.a(g ?? p) }); } }
    if (step('wolf') === 'shrine' && near(p, Q.wolf.shrine, 150)) sync.act('bqHit', { el: 'wolf', what: 'shrine' });
    if (step('wolf') === 'burial' && run && near(p, Q.wolf.burial, 90)) sync.act('bqHit', { el: 'wolf', what: 'burial' });
    if (step('demon') === 'runes') { if (near(p, Q.demon.urnHit, 70)) sync.act('bqHit', { el: 'demon', what: 'urn' }); for (const [k, r] of Object.entries(Q.demon.runes)) if (near(p, r, 45) && st.demon.d.lit.has(k)) sync.act('bqHit', { el: 'demon', what: 'rune', k }); }
    // the element (everyone sees it; the host's zombies take it)
    const el = elOf(session.weapon.id), ch = sh?.k ? { el: sh.el, k: +sh.k.toFixed(2) } : null;
    lastImpact = { p: p.toArray().map(Math.round), charged: ch, flung, run };
    if (ch || ELEMENT[el]) sync.fx('bowFx', { p: sync.a(p), el, ch, eye: sync.a(sh?.eye ?? camera.position) });
  });
  // the obelisk takes magma for 7.5 s after a rocket test fire (zm_castle_rocket_trap.gsc)
  let magmaUntil = 0, rocketWas = null;
  host.on('update', () => { const ph = traps?.state?.().rocket?.phase ?? null; if (rocketWas === 'fire' && !ph) magmaUntil = session.time + 7.5; rocketWas = ph; });
  // the storm wall-run (the owner's client): five triggers, touching ground for 0.2 s (at once below the undercroft's
  // upper floors) starts over (BO3 function_ba8e8ad8)
  const run = { hit: new Set(), ground: 0 };
  host.on('update', dt => {
    if (!dt || !owner('storm') || stepOf('storm') !== 'wallrun') { run.hit.clear(); return; }
    const f = feet(), running = !!lowgrav?.state?.().running;
    Q.storm.wallrun.forEach((t, k) => { if (!run.hit.has(k) && Math.hypot(f.x - t.x, f.z - t.z) < 130 && Math.abs(f.y - t.y) < 170) { run.hit.add(k); audio?.play?.('buy', .3); if (run.hit.size === 5) { run.hit.clear(); sync.act('bqHit', { el: 'storm', what: 'wallrun' }); } } });
    if (run.hit.size && player.grounded && !running) { run.ground += dt; if (run.ground >= .2 || f.y < 320) { run.hit.clear(); run.ground = 0; } } else run.ground = 0;
  });
  // the void rune power-up: the owner walks into it
  host.on('update', () => { const r = st.demon.d.rune; if (r && owner('demon') && !r.asked && feet().distanceTo(r.p) < 70) { r.asked = true; sync.act('bqUse', { el: 'demon', what: 'grab' }); } });

  // ---- Skadi (the host walks her) ---------------------------------------------------------------------------------------
  host.on('update', dt => {
    const s = st.wolf; if (!dt || stepOf('wolf') !== 'escort' || !s.d.p) return;
    if (!sync.isHost) { if (s.d.to) s.d.p.lerp(s.d.to, Math.min(1, dt * 5)); return; }
    if (s.d.phase !== 'walk' && s.d.phase !== 'tomb') return;
    const g = s.d.phase === 'tomb' ? { at: Q.wolf.tomb } : Q.wolf.digs[s.d.k];
    let target = g.at; s.d.wait = false;
    if (g.zone && !world.activeZones(session).has(g.zone)) { target = g.door; s.d.wait = s.d.p.distanceTo(g.door) < 60; }
    if (!s.d.path || s.d.pathTo !== target) { const path = world.path?.(s.d.p, target) ?? []; s.d.path = path.length > 1 ? path.map(x => x.clone()) : [target.clone()]; s.d.pathTo = target; s.d.i = 0; }
    const t = s.d.path[s.d.i]; if (t) { const dv = t.clone().sub(s.d.p), len = dv.length(); if (len < 12) s.d.i++; else s.d.p.addScaledVector(dv.normalize(), Math.min(len, 150 * dt)); }
    if (s.d.p.distanceTo(g.at) < 50 && !s.d.asked) { s.d.asked = true; sync.act('bqSkadi', s.d.phase === 'tomb' ? { what: 'tomb' } : { what: 'at', k: s.d.k }); }
    if (s.d.p.distanceTo(g.at) > 80) s.d.asked = false;
  });

  // ---- visuals from the state (every frame) -----------------------------------------------------------------------------
  const souls = [];
  function soul(from, to, color) { const m = glow(from.clone().add(new THREE.Vector3(0, 40, 0)), color, 22); souls.push({ m, from: m.position.clone(), to: to.clone().add(new THREE.Vector3(0, 25, 0)), t: 0 }); }
  const want = new Map(), add = (id, p, color, size = 40, extra) => want.set(id, { p, color, size, ...extra });
  let skadi = null;
  host.on('update', dt => {
    if (!dt) return;
    want.clear(); const t = performance.now() / 1000;
    for (const [el, s] of Object.entries(st)) {
      const q = Q[el], step = stepOf(el), my = owner(el);
      // the loose arrow / the bow on its pedestal
      const arrow = models['arrow:' + el], bow = models['bow:' + el], loose = s.owner == null && ['steps', 'place'].includes(s.stage);
      if (arrow) { arrow.visible = loose || (s.stage === 'souls'); if (arrow.visible) { arrow.position.copy(s.stage === 'souls' ? q.pedestal.clone().add(new THREE.Vector3(0, 45, 0)) : looseAt(el).clone().add(new THREE.Vector3(0, 8, 0))); arrow.rotation.set(0, t, Math.PI / 2); } }
      if (bow) { bow.visible = s.stage === 'ready' || s.stage === 'spawned'; if (bow.visible) { bow.position.copy(q.pedestal).add(new THREE.Vector3(0, 48 + Math.sin(t * 2) * 3, 0)); bow.rotation.set(0, t * .6, Math.PI / 2); } }
      if (loose) add('loose:' + el, looseAt(el).clone().add(new THREE.Vector3(0, 12, 0)), q.color, 45, { pulse: true });
      if (s.stage === 'souls' || s.stage === 'ready') add('ped:' + el, q.pedestal.clone().add(new THREE.Vector3(0, 40, 0)), q.color, 30 + 40 * (s.stage === 'ready' ? 1 : s.souls / SOULS));
      if (!step) continue;
      if (el === 'storm') {
        if (step === 'beacons' || step === 'batteries') q.beacons.forEach((b, k) => { const lit = s.d.lit?.has(k) || step === 'batteries', ch = s.d.charged?.has(k); if (lit) add(`beacon:${k}`, b, ch ? 0xffffff : q.color, ch ? 140 : 70, { pulse: ch }); });
        if (step === 'wallrun' && my) q.wallrun.forEach((w, k) => add(`wr:${k}`, w, run.hit.has(k) ? 0xffffff : q.color, run.hit.has(k) ? 60 : 30, { opacity: run.hit.has(k) ? 1 : .35 }));
        if (step === 'batteries') for (const b of q.batteries) { const n = s.d.kills[b.id] ?? 0; if (n) add(`bat:${b.id}`, b.at.clone().add(new THREE.Vector3(0, 30, 0)), q.color, 20 + n * 10, { pulse: n >= 5 && !s.d.used.has(b.id) }); }
      }
      if (el === 'rune') {
        if (step === 'obelisk' && session.time < magmaUntil) add('obelisk', q.obelisk, 0xff5a10, 90, { pulse: true });
        if (s.d.ball || ['circles', 'clock', 'golf', 'fireplace'].includes(step)) add('ball', q.ball.clone().add(new THREE.Vector3(0, -120 * (s.d.hops ?? 0), 0)), 0xff5a10, 120, { pulse: true });
        if (step === 'golf') { const pool = golfPool(); if (pool && s.d.pool) add('pool', pool.p.clone().add(new THREE.Vector3(0, 6, 0)), 0xff5a10, 140, { pulse: true }); add('fire', q.fireplaces[s.fire].at, 0xff7a2a, 50); }
        if (step === 'fireplace') add('fire', q.fireplaces[s.fire].at, 0xff5a10, 90, { pulse: true });
      }
      if (el === 'wolf') {
        if (step === 'skull') add('skull', q.skull.clone().add(new THREE.Vector3(0, 12, 0)), q.color, 35, { pulse: true });
        if (step === 'escort' && s.d.p) { if (s.d.phase === 'dug') add('bones', q.digs[s.d.k].bones.clone().add(new THREE.Vector3(0, 15, 0)), q.color, 40, { pulse: true }); if (!skadi) add('skadi', s.d.p.clone().add(new THREE.Vector3(0, 40, 0)), 0xbfe6ff, 70, { opacity: .5 }); }
        if (step === 'burial' && my && lowgrav?.state?.().running) add('symbol', q.burial, q.color, 60, { pulse: true });
      }
      if (el === 'demon' && step === 'runes') {
        const d = s.d, inRoom = my && inV(feet(), q.trophy);
        if (inRoom && !d.shown) { d.shown = true; d.replay = session.time; }
        if (my && d.replay != null && session.time - d.replay < 6) { const k = Math.floor((session.time - d.replay) / 2); want.set('crest', { p: q.urnTop.clone().add(new THREE.Vector3(0, 50, 0)), text: CREST[d.seq[k]] }); }
        if (my && d.show && session.time < d.show.until) want.set('armour', { p: q.armour[d.show.crest].clone().add(new THREE.Vector3(0, 40, 0)), text: RUNE[d.armour[d.show.crest]] });
        for (const r of d.lit) { add('dr:' + r, q.runes[r].clone().add(new THREE.Vector3(0, 6, 0)), session.time < d.failUntil ? 0xff3030 : q.color, 40); want.set('drl:' + r, { p: q.runes[r].clone().add(new THREE.Vector3(0, 34, 0)), text: RUNE[r] }); }
        if (d.rune) { add('rune', d.rune.p, q.color, 50, { pulse: true }); want.set('runel', { p: d.rune.p.clone().add(new THREE.Vector3(0, 30, 0)), text: RUNE[d.rune.label] }); }
      }
    }
    // props that follow the state
    team.deal?.forEach((spot, i) => { for (const sp of PAINT_SPOTS) showNode(`CASTLE_BQ_painting_${i}_${sp}`, sp === spot); });
    const rs = stepOf('rune'), rd = st.rune.d;   // the runic circles: shown to the owner while flung, lit once shot; after the clock only the golf's
    for (const c of Q.rune.circles) {
      const on = rs === 'circles' ? rd.active.has(c.id) || owner('rune') && !!pads?.flying?.() : rs === 'clock' || (rs === 'golf' && st.rune.fire === c.id), n = rs === 'circles' ? rd.kills[c.id] ?? 0 : on ? 9 : 0;
      showNode('CASTLE_BQ_rcircle_' + c.id, on); for (let i = 1; i <= 3; i++) showNode(`CASTLE_BQ_rsymbol_${c.id}_${i}`, n >= i * 3);
    }
    const w = st.wolf, ws = stepOf('wolf'), wi = Q.wolf.steps.indexOf(ws);
    showNode('CASTLE_BQ_skull_0', ws === 'skull');
    showNode('CASTLE_SM_aq_wh_skadi_skull', ws === 'escort' && w.d.phase !== 'skull');
    Q.wolf.digs.forEach((g, k) => showNode('CASTLE_BQ_bones_' + g.id, ws === 'escort' && w.d.phase === 'dug' && w.d.k === k));
    const skadiOn = ws === 'escort' && !!w.d.p && w.d.phase !== 'skull';
    if (!skadi && wolves.length) { skadi = wolfActor(wolves[0].root.children[0], wolves[0].index); skadi.busy = true; }
    if (skadi) {
      skadi.root.visible = skadiOn; showNode(skadiNode, false);
      if (skadiOn) { const to = w.d.path?.[w.d.i] ?? w.d.p, moving = w.d.phase === 'walk' || w.d.phase === 'tomb', clip = moving && !w.d.wait ? 'trot' : w.d.phase === 'dug' ? 'dig' : 'howl';
        skadi.root.position.copy(w.d.p); if (moving && to.distanceTo(w.d.p) > 2) skadi.root.rotation.y = Math.atan2(-(to.z - w.d.p.z), to.x - w.d.p.x);
        if (skadi.clip !== clip) { skadi.clip = clip; skadi.rig.play(clip, true, clip === 'trot' ? 150 / (skadi.index.trot?.speed || 150) : 1, .2); } skadi.rig.update(dt); }
    } else if (skadiNode) { const on = skadiOn; showNode(skadiNode, on); if (on) { const to = w.d.path?.[w.d.i] ?? w.d.p; moveNode(skadiNode, w.d.p); const yaw = Math.atan2(-(to.z - w.d.p.z), to.x - w.d.p.x); if (Number.isFinite(yaw) && to.distanceTo(w.d.p) > 2) { skadiNode.rotation.y = yaw; skadiNode.updateMatrixWorld(true); } } }
    const ledge = ws === 'burial' && session.time < (w.d.ledgeUntil ?? 0); ledgeMesh.visible = ledge; ledgeBox.enabled = ledge;
    showNode('CASTLE_BQ_king_0', w.stage !== 'idle' && (wi < 0 || wi > 3));
    const ds = stepOf('demon'), di = Q.demon.steps.indexOf(ds), dDone = st.demon.stage !== 'steps' && st.demon.stage !== 'idle';
    for (const [k, [, home]] of Object.entries(Q.demon.fossils)) { const back = st.demon.fossils?.has(k) && (di === 2 || di === 3 || di === 4); showNode('CASTLE_BQ_fossil_' + k, !st.demon.fossils?.has(k) && !dDone); showNode('CASTLE_BQ_fossilhome_' + home, !!back); }
    for (const r of Object.keys(Q.demon.runes)) showNode('CASTLE_BQ_drune_' + r, ds === 'runes' && st.demon.d.lit.has(r));
    // the urn (BO3 raises it to aq_dg_urn_position once used): a glow while it stands
    if (di >= 2 && di <= 4) add('urn', Q.demon.urnTop, Q.demon.color, 55, { pulse: ds === 'runes' && session.time - (st.demon.d.replay ?? -99) < 6 });
    if (wheel && st.rune.wheel) { const wh = st.rune.wheel; if (wh.t < 1) { wh.t = Math.min(1, wh.t + dt / 4); wheel.quaternion.copy(wheelQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), wh.to * (1 - Math.cos(wh.t * Math.PI)) / 2)); wheel.updateMatrixWorld(true); } }
    marksUpdate(want);
    // souls in flight
    for (let i = souls.length - 1; i >= 0; i--) { const s = souls[i]; s.t += dt / .7; s.m.position.lerpVectors(s.from, s.to, Math.min(1, s.t)).y += Math.sin(Math.min(1, s.t) * Math.PI) * 40; if (s.t >= 1) { unglow(s.m); souls.splice(i, 1); } }
  });

  function give(el) {
    const q = Q[el], id = 'bo3_bow_' + el; if (!data.weapons[id]) return;
    const i = session.inventory.findIndex(w => isBow(w.id)); if (i >= 0) { session.slot = i; session.inventory.splice(i, 1); session.slot = Math.min(session.slot, Math.max(0, session.inventory.length - 1)); }
    session.giveWeapon(id); api.equipView?.();
    announce?.(q.name.toUpperCase(), 'WRATH OF THE ANCIENTS', 3); audio?.play?.('box');
  }

  // ---- element effects (upgraded bows): shown everywhere, damage on the host credited to the shooter -------------------
  const fx = [];
  const lineMat = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .95, blending: THREE.AdditiveBlending });
  function bolt(a, b, color) { const pts = [a.clone()]; for (let i = 1; i < 8; i++) pts.push(a.clone().lerp(b, i / 8).add(new THREE.Vector3((Math.random() - .5) * 30, (Math.random() - .5) * 30, (Math.random() - .5) * 30))); pts.push(b.clone());
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color)); scene.add(l); fx.push({ o: l, life: .12 }); }
  function flash(p, color, intensity = 4, radius = 500, life = .5) { const pool = kino.lighting?.sources; if (!pool) return; const src = { position: p.clone(), color: new THREE.Color(color), intensity, radius, kind: 'solid', dynamic: true, cap: 2000, weight: 1 }; pool.push(src); fx.push({ light: src, life, max: life }); }
  host.warmObjects?.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), lineMat(0xffffff)));
  // the spirit wolves (BO3's c_gen_direwolf_ghost running ai_direwolf_base_run; .tools/build_castle_panzer.py wolf ->
  // wolf/): a pool made while loading (hidden in the scene, so its shaders compile then)
  const WDIR = new URL('./wolf/', import.meta.url).href, WOLF_SPEED = 650, wolves = [], WA = {};
  const wolfReady = (async () => {
    const [m, index] = await Promise.all([loadModel(WDIR + 'wolf.glb').catch(() => null), fetch(WDIR + 'anims.json').then(r => r.json()).catch(() => null)]);
    if (!m || !index) return false;
    await Promise.all(Object.keys(index).map(async k => { WA[k] = await loadAnimation(WDIR + 'anims/' + k + '.json').catch(() => null); }));
    for (let i = 0; i < 7; i++) wolves.push(wolfActor(m, index));
    return true;
  })();
  function wolfActor(m, index) {
    const root = new THREE.Group(), body = cloneSkinned(m); root.add(body);
    body.traverse(o => { if (o.isBone) o.userData.bindPosition = o.position.clone(); if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    const rig = new Rig(root); for (const [k, d] of Object.entries(WA)) if (d) rig.add(k, d);
    root.visible = false; scene.add(root); return { root, rig, index, busy: false };
  }
  function spiritWolf(p, d, time, c) {
    const a = wolves.find(w => !w.busy), at = p.clone();
    if (a) { a.busy = true; a.root.visible = true; a.root.position.copy(at); a.rig.play('run', true, WOLF_SPEED / (a.index.run?.speed || WOLF_SPEED), 0); }
    zones.push({ kind: 'wolf', at, d, t: time, life: time, actor: a ?? null, sprite: a ? null : glow(at.clone().add(new THREE.Vector3(0, 30, 0)), 0xbfe6ff, 70), hit: new Set(), c });
  }
  const zones = [];
  const ELEMENT = {
    storm(p, c) { flash(p, 0x9fd8ff, 5, 600, 2.5); zones.push({ kind: 'storm', p, t: 2.5, tick: 0, c }); },
    rune(p, c) { flash(p, 0xff7a2a, 5, 500, 1); for (const z of [...enemies.list]) if (z.root.position.distanceTo(p) < 190) { kino.fx?.burn?.(z.root.position.clone().add(new THREE.Vector3(0, 40, 0))); zones.push({ kind: 'burn', z, t: .8, c }); } },
    wolf(p, c, eye) {   // a spirit wolf leaps out where the arrow lands and runs on down the line of the shot
      const d = p.clone().sub(eye).setY(0).normalize(); flash(p, 0xbfe6ff, 3, 400, .8); spiritWolf(p, d, 1, c);
    },
    demon(p, c) { flash(p, 0xb06bff, 5, 500, 1.5); zones.push({ kind: 'void', p, t: 1.5, held: new Set(), c }); const m = glow(p.clone().add(new THREE.Vector3(0, 30, 0)), 0xb06bff, 120); fx.push({ sprite: m, life: 1.5 }); },
  };
  const CHARGED = {   // k: how far the bow was drawn, 0.2..1
    base(p, k, c) { flash(p, 0xff8a3a, 5, 600, .6); for (const z of [...enemies.list]) if (!z.boss && z.root.position.distanceTo(p) < 220 + 120 * k) kill(z, 1500 * k, c); },
    storm(p, k, c) { flash(p, 0x9fd8ff, 6, 800, 6); zones.push({ kind: 'storm', p, t: 3 + 3 * k, tick: 0, r: 300 + 100 * k, rate: .2, c }); },
    rune(p, k, c) { flash(p, 0xff7a2a, 6, 600, 2); for (const z of [...enemies.list]) { if (z.boss || z.root.position.distanceTo(p) > 220 + 80 * k) continue; zones.push({ kind: 'prison', z, at: z.root.position.clone(), t: 2, c }); for (let i = 0; i < 3; i++) { const m = glow(z.root.position.clone().add(new THREE.Vector3(0, 25 + i * 30, 0)), 0xff7a2a, 55); fx.push({ sprite: m, life: 2 }); } } },
    wolf(p, k, c, eye) {
      const d0 = p.clone().sub(eye).setY(0).normalize(), n = k >= 1 ? 3 : 2; flash(p, 0xbfe6ff, 5, 600, 1.5);   // a pack: 2, 3 drawn fully
      for (let i = 0; i < n; i++) spiritWolf(p, d0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (n - 1) / 2) * .45), 1.4 + k, c);
    },
    demon(p, k, c) { flash(p, 0xb06bff, 6, 700, 5); zones.push({ kind: 'void', p, t: 3 + 2 * k, held: new Set(), r: 400, c }); const m = glow(p.clone().add(new THREE.Vector3(0, 40, 0)), 0xb06bff, 200); fx.push({ sprite: m, life: 3 + 2 * k }); zones.push({ kind: 'chompers', p, t: 3 + 2 * k, tick: 0, c }); },
  };
  // the element's damage: the host's zombies only (a guest's copies are snapshots); a non-panzer dies outright
  const kill = (z, panzer, c) => sync.hurt(z, z.kind === 'panzer' ? panzer : 1e9, c, { cause: 'explosion' });
  sync.onFx('bowFx', (d, c) => {
    const p = sync.v(d.p), eye = sync.v(d.eye ?? d.p);
    if (d.ch) CHARGED[d.ch.el]?.(p, d.ch.k, c, eye); else ELEMENT[d.el]?.(p, c, eye);
  });
  host.on('update', dt => {
    if (!dt) return;
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt;
      if (f.light) f.light.weight = Math.max(0, f.life / f.max);
      if (f.sprite) f.sprite.material.opacity = Math.max(0, Math.min(1, f.life * 3));
      if (f.life <= 0) { if (f.o) { f.o.removeFromParent(); f.o.geometry.dispose(); f.o.material.dispose(); } if (f.sprite) unglow(f.sprite); if (f.light) { const pool = kino.lighting?.sources, j = pool?.indexOf(f.light) ?? -1; if (j >= 0) pool.splice(j, 1); } fx.splice(i, 1); } }
    const hostSide = sync.isHost;
    for (let i = zones.length - 1; i >= 0; i--) { const z = zones[i]; z.t -= dt;
      if (z.kind === 'prison') { if (enemies.list.includes(z.z)) { if (hostSide) { z.z.root.position.x = z.at.x; z.z.root.position.z = z.at.z; z.z.stuck = 0; } if (z.t <= 0) kill(z.z, 2500, z.c); } }
      if (z.kind === 'wolf') {
        z.at.addScaledVector(z.d, WOLF_SPEED * dt); const g = world.closest?.(z.at, { x: 40, y: 120, z: 40 }); if (g) z.at.y = THREE.MathUtils.lerp(z.at.y, g.y, Math.min(1, dt * 12));
        if (z.actor) { const r = z.actor.root; r.position.copy(z.at); r.rotation.y = Math.atan2(-z.d.z, z.d.x); r.scale.setScalar(Math.min(1, z.t * 3, (z.life - z.t) * 6 + .2)); z.actor.rig.update(dt); }
        else if (z.sprite) z.sprite.position.copy(z.at).y += 30;
        for (const e of [...enemies.list]) if (!e.boss && !z.hit.has(e) && e.root.position.distanceTo(z.at) < 90) { z.hit.add(e); kill(e, 1500, z.c); }
        if (z.t <= 0) { if (z.actor) { z.actor.root.visible = false; z.actor.busy = false; } if (z.sprite) unglow(z.sprite); }
      }
      if (z.kind === 'chompers' && (z.tick -= dt) <= 0) { z.tick = .3; const t = enemies.list.filter(e => !e.boss && e.root.position.distanceTo(z.p) < 650).sort((a, b) => a.root.position.distanceTo(z.p) - b.root.position.distanceTo(z.p))[0]; if (t) { const m = glow(t.root.position.clone().add(new THREE.Vector3(0, 40, 0)), 0xb06bff, 40); fx.push({ sprite: m, life: .4 }); kill(t, 600, z.c); } }
      if (z.kind === 'storm' && (z.tick -= dt) <= 0) { z.tick = z.rate ?? .3; const top = z.p.clone().add(new THREE.Vector3(0, 60, 0)); const n = enemies.list.filter(e => !e.boss && e.root.position.distanceTo(z.p) < (z.r ?? 240)).sort((a, b) => a.root.position.distanceTo(z.p) - b.root.position.distanceTo(z.p))[0];
        if (n) { bolt(top, n.root.position.clone().add(new THREE.Vector3(0, 45, 0)), 0xbfe6ff); kill(n, 800, z.c); } else bolt(top, z.p.clone().add(new THREE.Vector3((Math.random() - .5) * 120, 0, (Math.random() - .5) * 120)), 0xbfe6ff); }
      if (z.kind === 'burn' && z.t <= 0 && enemies.list.includes(z.z)) kill(z.z, 600, z.c);
      if (z.kind === 'void' && hostSide) for (const e of [...enemies.list]) { const d = e.root.position.distanceTo(z.p); if (d > (z.r ?? 220) || e.boss) continue; if (e.kind === 'panzer') { if (!z.held.has(e)) { z.held.add(e); sync.hurt(e, 1200, z.c, { cause: 'explosion' }); } continue; } e.root.position.lerp(z.p, Math.min(1, dt * 2.5)); e.stuck = 0; if (d < 40) kill(e, 0, z.c); }
      if (z.t <= 0) zones.splice(i, 1); }
  });

  // ---- a new game ---------------------------------------------------------------------------------------------------------
  function reset() {
    for (const el of Object.keys(Q)) { for (const k of Object.keys(st[el])) delete st[el][k]; Object.assign(st[el], fresh()); }   // in place: the prompts hold these objects
    team.paint = 0; team.deal = null; frenzyT = 0; magmaUntil = 0; run.hit.clear();
    if (wheel && wheelQ) { wheel.quaternion.copy(wheelQ); wheel.updateMatrixWorld(true); }
    for (const z of zones.splice(0)) if (z.sprite) unglow(z.sprite);
    if (sync.isHost) sync.act('bqDeal', {});   // the host deals the paintings
  }
  host.on('reset', reset);
  reset();

  return {
    state: () => Object.fromEntries(Object.entries(st).map(([el, s]) => [el, { stage: s.stage === 'spawned' ? 'taken' : s.stage, owner: s.owner, step: stepOf(el), souls: s.souls,
      d: JSON.parse(JSON.stringify(s.d, (k, v) => v instanceof Set ? [...v] : v instanceof THREE.Vector3 ? v.toArray().map(Math.round) : v)), fire: s.fire }])),
    team: () => ({ paint: team.paint, deal: team.deal }),
    advance(el) { sync.act('bqDebug', { el }); },
    ready: wolfReady, wolves: () => wolves.map(w => w.busy), give, sites: Q, last: () => lastImpact, testShot: o => { shot = { el: elOf(session.weapon?.id), k: 0, at: performance.now(), from: feet(), eye: camera.position.clone(), ...o }; }, golfPool: () => golfPool()?.p.clone() ?? null, skadi: () => st.wolf.d.p?.clone() ?? null, magma: () => magmaUntil - session.time,
  };
}
