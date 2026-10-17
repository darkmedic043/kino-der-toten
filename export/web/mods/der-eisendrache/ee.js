// Der Eisendrache's main Easter egg (zm_castle_ee.gsc) and the boss (zm_castle_ee_bossfight.gsc), on BO3's own spots.
// Solo-sized, in BO3's order:
//   1. Summoning key: once a bow has been upgraded, shoot the six targets around the lab's teleporter with a bow
//      (activate_targets_object) -> the past laboratory opens
//   2. Time travel: one of seven targets around the castle lights up (activate_teleporter_object); hit it with an
//      upgraded bow, then the next, four in a row (anything else hit, or the round ending, resets it). Primed, the lab's
//      teleporter pad takes you to the past lab (zone_past_laboratory) and back for the rest of the round.
//   3. The past: read the safe's combination, take the MPD canister and the lab fuse. In the present, the combination
//      opens the safe: the golden key and the Death Ray's two tesla connectors. In the past again, the key opens the
//      crate: the replacement channeling stone. Put the canister in the MPD (the undercroft pyramid) and the stone on the
//      cracked plinth by the road.
//   4. The Keeper: take the Vril device from the undercroft and set it at the statue (vril_generator_family): the Keeper
//      protector rises and floats to the four channeling stones in turn; kill 12 zombies around each while it charges it.
//   5. Simon says: the consoles at the lower tower and the launch platform (symbols_*): watch the runes, then press use
//      while the monitor shows each rune in the same order (3, 4, then 5 runes).
//   6. Rockets to the moon: the tesla connectors on the roof's two Death Ray bases (tc_*), then its lever.
//   7. The fuse in the fuse box on the roof; then plant the Ragnarok on one of the pyramid's four plates (or, without one,
//      touch the MPD) -> the boss arena.
//   Boss: the Keeper (c_zom_dlc1_keeper_archon_fb) teleports around the arena casting the bows' spells: storm (lightning
//   strikes where you stand), rune prison (a fire pillar under you), wolf howl (spirit wolves charge you), demon gate
//   (chomper skulls chase you). Every third cast it returns to the centre and charges a storm: plant the Ragnarok under it
//   (or hit it with an upgraded bow) to stun it; only stunned does it take damage (headshots double). Unstunned, the
//   storm hits everyone outside the five safe circles. Three phases (8,000 / 10,000 / 12,000); zombies rise all along,
//   Panzersoldats join in phases 2 and 3. Beaten: back to the undercroft, the rockets reach the moon.
// Co-op (sync.js): every step is a team event (anyone's shot, use or kill counts; the items are the team's); the
// random parts (the safe's combination, the lit targets, the runes) come from the host's seeded stream; each player
// takes the pads through time themselves. The boss runs on the host: it hunts every player, its spells are events
// each client draws and checks against its own player; guests get a copy of it from the host's snapshot.
// Testing: kino.castle.ee.state(), .skip(n) (complete steps up to n), .boss().
import * as THREE from 'three';
import { loadModel, loadAnimation, Rig } from '../../animation.js';
import { loadProfile, saveProfile } from '../../profile.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { sfx, music, stopMusic } from './castle-audio.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);   // BO3 coordinates -> the map's
const KDIR = new URL('./keeper/', import.meta.url).href;
const isBow = id => id === 'bo3_wrath_ancients' || /^bo3_bow_/.test(id ?? ''), isUpgraded = id => /^bo3_bow_/.test(id ?? '');
export const SUMMON = [W(-410, 3802, 392), W(-410, 3694, 392), W(-334, 3618, 392), W(-226, 3618, 392), W(-150, 3694, 392), W(-150, 3802, 392)];
export const TRAVEL = [W(-856, 4012, 1016), W(-1760, 1975, 913), W(192, 2844, 950), W(-472, 3220, 768), W(-36, 332, 194), W(1828, 1574, 534), W(620, 3384, 716)];
export const PAD = { present: W(-280, 3748, 156), past: W(-280, 5244, 156) };
export const SPOT = {
  safePast: W(-58, 4833, 172), safePresent: W(-58, 3338, 172), keySlotPast: W(-672, 4889, 200), stonePast: W(-177, 4596, 179),
  canisterPast: W(112, 5108, 160), canisterSlot: W(-1092, 2156, 175), stoneSlot: W(1494, 1184, 230), vril: W(-828, 2334, 620), statue: W(-2117, 3004, 431),
  consoles: [W(-636, 1052, 860), W(3744, -2128, -2172)], tcLower: W(-258, 2196, 953), tcLaunch: W(546, 2172, 953), lever: W(251, 2145, 956), fuseBox: W(170, 2134, 942),
  plates: [W(-1192, 2540, 216), W(-908, 2256, 216), W(-1476, 2256, 216), W(-1192, 1972, 216)], mpd: W(-1193, 2256, 200),
};
export const STONES = [1, 2, 3, 4].map(n => ({ n, keeper: [W(-1312, 2144, 612), W(1472, 1152, 192), W(-48, 3816, 764), W(-897, 416, 356)][n - 1], zone: [W(-928, 2304, 672), W(1428, 896, 160), W(128, 3744, 864), W(-800, 480, 384)][n - 1] }));
const ARENA = { start: W(-2364, 7072, -247), keeper: W(-3008, 6976, -138), center: W(-3008, 6976, -255), back: W(-1192, 1972, 216),
  tele: [[-2560, 7200], [-2496, 6976], [-2800, 7152], [-2784, 6816], [-2704, 6944], [-2538, 6752], [-2762, 6516], [-3250, 6600], [-3450, 6976], [-3250, 7350], [-3008, 7450], [-3008, 6500]].map(([x, y]) => W(x, y, -150)),
  zombies: [[-2368, 7194], [-2496, 6656], [-2800, 6336], [-3328, 6464], [-3648, 6756], [-2680, 7488], [-3224, 7616]].map(([x, y]) => W(x, y, -247)),
  mechz: [[-3561, 6978], [-2989, 7530], [-2510, 6916]].map(([x, y]) => W(x, y, -255)),
  safe: [[-3006, 7490], [-2500, 7132], [-3508, 7131], [-3312, 6549], [-2706, 6550]].map(([x, y]) => W(x, y, -255)) };
const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ'];
const PHASE_HP = [8000, 10000, 12000];

export function setupEE(api, { bows, traps }) {
  const { world, session, host, player, camera, enemies, scene, audio, toast, announce, damage, data, sync } = api;
  // events: R is the event's seeded random while its handler runs (the same on every client)
  let R = Math.random;
  const ev = (type, fn) => sync.on(type, (d, ctx) => { R = ctx.rand; try { fn(d, ctx); } finally { R = Math.random; } });
  const root = world.root, kino = window.kino;
  const node = n => root.getObjectByName(n);
  const showNode = (n, on = true) => { const o = node(n); if (o) { o.visible = on; o.updateMatrixWorld(true); } return o; };
  const st = { step: 0, summon: new Set(), travel: { lit: null, hits: 0, ready: false, round: -1 }, have: new Set(), done: new Set(), stone: 0, simon: [null, null], boss: null };
  const feet = () => player.getFeetPosition();

  // ---- glows (BO3's fx cards stand-ins) -----------------------------------------------------------------------------
  const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = (p, color, size = 40) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(p); m.scale.setScalar(size); scene.add(m); return m; };
  const drop = m => { if (!m) return; m.removeFromParent(); m.material.dispose(); };
  const flashes = [];
  function flash(p, color, intensity = 4, radius = 600, life = .6) { const pool = kino.lighting?.sources; if (!pool) return; const src = { position: p.clone(), color: new THREE.Color(color), intensity, radius, kind: 'solid', dynamic: true, cap: 2000, weight: 1 }; pool.push(src); flashes.push({ src, life, max: life }); }

  // ---- 1. summoning key ------------------------------------------------------------------------------------------
  const summonGlows = SUMMON.map(p => { const g = glow(p, 0xffa040, 30); g.visible = false; return g; });
  const anyBowUpgraded = () => Object.values(bows?.state() ?? {}).some(s => s.stage === 'taken');
  // ---- 2. time travel ------------------------------------------------------------------------------------------------
  const travelGlow = glow(new THREE.Vector3(), 0x9fd8ff, 70); travelGlow.visible = false;
  function lightNext() { const t = st.travel, options = TRAVEL.map((_, k) => k).filter(k => k !== t.lit); t.lit = options[Math.floor(R() * options.length)]; travelGlow.position.copy(TRAVEL[t.lit]); travelGlow.visible = true; }
  function travelReset(msg) { const t = st.travel; t.hits = 0; t.ready = false; if (st.step >= 2) lightNext(); if (msg) toast?.(msg, 2); }
  const padGlows = { present: glow(PAD.present.clone().add(new THREE.Vector3(0, 10, 0)), 0x9fd8ff, 120), past: glow(PAD.past.clone().add(new THREE.Vector3(0, 10, 0)), 0x9fd8ff, 120) };
  padGlows.present.visible = padGlows.past.visible = false;

  // shots: bow arrows land through blast() -> effect(p, 0xffb347, 25)
  host.on('effect', e => { if (e.count === 25 && isBow(session.weapon?.id)) sync.act('eeShot', { p: sync.a(e.position), up: isUpgraded(session.weapon.id) }); });
  ev('eeShot', d => {
    const p = sync.v(d.p), up = d.up;
    if (st.step === 1) SUMMON.forEach((t, k) => { if (!st.summon.has(k) && p.distanceTo(t) < 80) { st.summon.add(k); summonGlows[k].visible = true; audio?.play?.('buy', .4); if (st.summon.size === 6) advance(2); } });
    if (st.step >= 2 && !st.travel.ready && st.travel.lit != null) {
      const k = TRAVEL.findIndex(t => p.distanceTo(t) < 110);
      if (k >= 0) { if (k === st.travel.lit && up) { st.travel.hits++; audio?.play?.('buy', .4); if (st.travel.hits >= 4) { st.travel.ready = true; st.travel.round = session.round; travelGlow.visible = false; padGlows.present.visible = padGlows.past.visible = true; announce?.('THE TELEPORTER', 'PRIMED UNTIL THE ROUND ENDS', 3); } else lightNext(); } else travelReset('The targets went dark'); }
    }
    if (sync.isHost && st.boss?.z && st.boss.state === 'center' && up && p.distanceTo(st.boss.z.root.position) < 220) stunBoss();
  });
  host.on('roundEnd', () => { if (sync.isHost && st.step >= 2 && (st.travel.ready || st.travel.hits)) sync.act('eeTravelReset', { ready: st.travel.ready }); });
  ev('eeTravelReset', d => { padGlows.present.visible = padGlows.past.visible = false; travelReset(d.ready ? 'The teleporter powered down' : null); });
  let padHold = 0;
  function padTick(dt) {
    if (!st.travel.ready) { padHold = 0; return; }
    const f = feet(), on = f.distanceTo(PAD.present) < 70 ? 'present' : f.distanceTo(PAD.past) < 70 ? 'past' : null;
    padHold = on ? padHold + dt : 0;
    if (padHold > 1.2) { padHold = -2; const to = on === 'present' ? PAD.past : PAD.present; kino.debug.teleportPlayer([to.x + 50, to.y + 2, to.z]); flash(to, 0x9fd8ff, 6, 500, .8); audio?.play?.('dog_round', .4); toast?.(on === 'present' ? 'The past' : 'The present', 2); }
  }

  // ---- 3. the past and the present: items ---------------------------------------------------------------------------
  const take = (item, msg) => { st.have.add(item); audio?.play?.('buy', .5); toast?.(msg, 2.5); hud(); };
  const place = (item, flag, msg) => { st.have.delete(item); st.done.add(flag); audio?.play?.('buy', .7); toast?.(msg, 2.5); hud(); check(); };
  // every interaction is a team event: its effect runs on every client, in the host's order (ids follow creation order,
  // the same everywhere); `data` sends what only the user's client knows (Simon's shown rune)
  const uses = new Map();
  const I = (position, text, use, hidden, data) => { const id = uses.size + 1; uses.set(id, use);
    world.addInteraction({ position, text, hidden, use() { if (hidden?.()) return false; sync.act('eeUse', { id, d: data?.() }); return true; } }); };
  ev('eeUse', (d, ctx) => uses.get(d.id)?.(d.d ?? {}, ctx));
  I(SPOT.safePast, () => 'Read the combination', () => { st.done.add('code'); toast?.(`The combination: ${CODE.join(' ')}`, 4); audio?.play?.('buy', .4); return true; }, () => st.step < 2 || st.done.has('code'));
  I(SPOT.canisterPast, () => 'Take the MPD canister', () => { showNode('CASTLE_EE_canister_past_0', false); take('canister', 'MPD canister'); return true; }, () => st.step < 2 || st.have.has('canister') || st.done.has('canister'));
  I(W(-704, 5058, 174), () => 'Take the fuse', () => { showNode('CASTLE_EE_fuse_0', false); take('fuse', 'Lab fuse'); return true; }, () => st.step < 2 || st.have.has('fuse') || st.done.has('fuse'));
  I(SPOT.safePresent, () => st.done.has('code') ? 'Enter the combination' : 'A locked safe', () => {
    if (!st.done.has('code')) { toast?.('The combination... it must have been written down long ago', 2.5); return false; }
    st.done.add('safe'); showNode('CASTLE_SM_safe_uc_dmg_door', false); showNode('CASTLE_EE_key_safe_0'); showNode('CASTLE_EE_tc_lab_0'); audio?.play?.('box'); toast?.('The safe opened', 2); return true;
  }, () => st.step < 2 || st.done.has('safe'));
  I(W(-60, 3344, 194), () => 'Take the golden key', () => { showNode('CASTLE_EE_key_safe_0', false); take('key', 'Golden key'); return true; }, () => !st.done.has('safe') || st.have.has('key') || st.done.has('keyUsed'));
  I(W(-46, 3344, 194), () => 'Take the tesla connectors', () => { showNode('CASTLE_EE_tc_lab_0', false); take('tc', 'Tesla connectors (2)'); st.tcLeft = 2; return true; }, () => !st.done.has('safe') || st.have.has('tc') || st.done.has('tcTaken'));
  I(SPOT.keySlotPast, () => 'Insert the golden key', () => { st.have.delete('key'); st.done.add('keyUsed'); showNode('CASTLE_EE_key_past_0'); lid(); showNode('CASTLE_EE_stone_past_0'); audio?.play?.('box'); hud(); return true; }, () => !st.have.has('key'));
  I(SPOT.stonePast, () => 'Take the channeling stone', () => { showNode('CASTLE_EE_stone_past_0', false); take('stone', 'Channeling stone'); return true; }, () => !st.done.has('keyUsed') || st.have.has('stone') || st.done.has('stonePlaced'));
  I(SPOT.canisterSlot, () => 'Place the MPD canister', () => { showNode('CASTLE_EE_canister_slot_0'); place('canister', 'canisterPlaced', 'The MPD is whole again'); return true; }, () => !st.have.has('canister'));
  I(SPOT.stoneSlot, () => 'Replace the cracked channeling stone', () => { showNode('CASTLE_SM_cs_stone_2', false); showNode('CASTLE_EE_csglow_2', false); place('stone', 'stonePlaced', 'The channeling stone is in place'); stoneMesh(); return true; }, () => !st.have.has('stone'));
  function lid() { const o = node('CASTLE_SM_lid_crate_stone'); if (o) { o.rotation.x -= Math.PI / 2; o.updateMatrixWorld(true); } }
  function stoneMesh() { const s = node('CASTLE_EE_stone_past_0'); if (!s) return; s.parent.updateMatrixWorld(true); s.position.copy(s.parent.worldToLocal(SPOT.stoneSlot.clone().add(new THREE.Vector3(0, -6, 0)))); s.visible = true; s.updateMatrixWorld(true); }
  let CODE = ['?', '?', '?'];   // the host's (an event: the same safe for everyone)
  ev('eeCode', d => { CODE = d.code; });
  const newCode = () => { if (sync.isHost) sync.act('eeCode', { code: Array.from({ length: 3 }, () => RUNES[Math.floor(Math.random() * 4)]) }); };
  newCode();

  // ---- 4. the Keeper protector and the channeling stones -------------------------------------------------------------------
  let K = null;   // {body, rig}
  const KA = {};
  const keeperReady = (async () => {
    const [m, index] = await Promise.all([loadModel(KDIR + 'keeper.glb').catch(() => null), fetch(KDIR + 'anims.json').then(r => r.json()).catch(() => null)]);
    if (!m || !index) return false;
    await Promise.all(Object.keys(index).map(async k => { KA[k] = await loadAnimation(KDIR + 'anims/' + k + '.json').catch(() => null); }));
    K = { model: m, index }; return true;
  })();
  function keeperActor(at) {
    if (!K) return null;
    const rootG = new THREE.Group(), body = cloneSkinned(K.model); rootG.add(body);
    body.traverse(o => { if (o.isBone) o.userData.bindPosition = o.position.clone(); if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    const rig = new Rig(rootG); for (const [k, d] of Object.entries(KA)) if (d) rig.add(k, d);
    rootG.position.copy(at); scene.add(rootG); return { root: rootG, rig };
  }
  // CoD models face +X: turn one toward a point
  const face = (r, to) => { r.rotation.y = Math.atan2(-(to.z - r.position.z), to.x - r.position.x); };
  I(SPOT.vril, () => 'Take the Vril device', () => { showNode('CASTLE_EE_vril_0', false); take('vril', 'Vril device'); return true; }, () => st.step !== 3 || st.have.has('vril') || st.done.has('vrilPlaced'));
  I(SPOT.statue, () => 'Place the Vril device', () => { showNode('CASTLE_EE_vril_family_0'); place('vril', 'vrilPlaced', 'Something stirs...'); protectorRise(); return true; }, () => !st.have.has('vril'));
  let P = null;   // the protector: {a, stone, kills, t, from, to}
  function protectorRise() {
    const a = keeperActor(SPOT.statue.clone().add(new THREE.Vector3(0, 10, 0))); if (!a) { st.done.add('stones'); check(); return; }
    face(a.root, feet()); a.rig.play(KA.emerge ? 'emerge' : 'keeperIdle', !KA.emerge); announce?.('THE KEEPER', 'PROTECT IT AT THE CHANNELING STONES', 3.5);
    P = { a, stone: 0, kills: 0, t: 0, move: { from: a.root.position.clone(), to: STONES[0].keeper.clone(), t: -((K.index.emerge?.duration) ?? 2) } };
  }
  function protectorTick(dt) {
    if (!P) return; P.a.rig.update(dt); P.t += dt;
    if (P.move) {
      const m = P.move; m.t += dt; if (m.t < 0) return;
      if (P.a.rig.current !== 'keeperIdle') P.a.rig.play('keeperIdle', true);
      const k = Math.min(1, m.t / 3); P.a.root.position.lerpVectors(m.from, m.to, k * k * (3 - 2 * k)); P.a.root.position.y += Math.sin(k * Math.PI) * 120; face(P.a.root, m.to.clone().add(new THREE.Vector3(1, 0, 0)));
      if (k >= 1) { P.move = null; if (P.stone >= STONES.length) { P.a.root.removeFromParent(); P = null; st.done.add('stones'); announce?.('THE KEEPER', 'SEEN AT THE MPD', 3); check(); return; } P.a.rig.play(KA.stoneIn ? 'stoneIn' : 'keeperIdle', false); P.loopAt = P.t + (K.index.stoneIn?.duration ?? 1); P.kills = 0; toast?.(`Channeling stone ${P.stone + 1} of 4 · kill zombies around it`, 3); }
    } else if (P.loopAt && P.t > P.loopAt) { P.loopAt = 0; P.a.rig.play(KA.stoneLoop ? 'stoneLoop' : 'keeperIdle', true); }
  }
  sync.on('kill', d => {
    const p = sync.v(d.p); if (!P || P.move) return; const s = STONES[P.stone];
    if (p.distanceTo(s.zone) > 420) return; P.kills++; const g = glow(p.clone().add(new THREE.Vector3(0, 40, 0)), 0x9fd8ff, 20); souls.push({ m: g, from: g.position.clone(), to: P.a.root.position.clone().add(new THREE.Vector3(0, 80, 0)), t: 0 });
    if (P.kills >= 12) { showNode('CASTLE_EE_csglow_' + s.n); audio?.play?.('buy', .7); P.a.rig.play(KA.stoneOut ? 'stoneOut' : 'keeperIdle', false); P.stone++; const to = P.stone < STONES.length ? STONES[P.stone].keeper.clone() : W(-1192, 2256, 164); P.move = { from: P.a.root.position.clone(), to, t: -((K.index.stoneOut?.duration) ?? 1) }; }
  });
  const souls = [];

  // ---- 5. Simon says ----------------------------------------------------------------------------------------------------------------
  const overlay = document.createElement('div'); overlay.id = 'ee-simon'; overlay.hidden = true;
  overlay.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:4;pointer-events:none;font:700 64px/1 serif;color:#ffd27a;text-shadow:0 0 18px #ff9a3a,0 2px 4px #000;text-align:center';
  document.body.append(overlay);
  SPOT.consoles.forEach((p, ci) => I(p, () => { const s = st.simon[ci]; return !s ? 'Use the console' : s.phase === 'input' ? `Press use on ${s.seq[s.at]} · showing ${RUNES[s.cycle]}` : s.phase === 'done' ? '' : 'Watch the runes'; }, (d) => {
    const s = st.simon[ci];
    if (!s) { st.simon[ci] = { round: 0, phase: 'show', seq: [], at: 0, t: 0, cycle: 0 }; simonRound(ci); return true; }
    if (s.phase !== 'input') return false;
    if ((d.rune ?? RUNES[s.cycle]) === s.seq[s.at]) { s.at++; audio?.play?.('buy', .3); if (s.at >= s.seq.length) { s.round++; if (s.round >= 3) { s.phase = 'done'; overlay.hidden = true; toast?.('The console accepts the sequence', 2.5); audio?.play?.('box'); if (st.simon.every(x => x?.phase === 'done')) { st.done.add('simon'); check(); } } else simonRound(ci); } }
    else { st.simon[ci] = null; overlay.hidden = true; toast?.('Wrong rune · the console resets', 2); audio?.play?.('hit', .5); }
    return true;
  }, () => st.step < 4 || st.simon[ci]?.phase === 'done', () => ({ rune: RUNES[st.simon[ci]?.cycle ?? 0] })));
  function simonRound(ci) { const s = st.simon[ci]; s.seq = Array.from({ length: 3 + s.round }, () => RUNES[Math.floor(R() * 4)]); s.phase = 'show'; s.at = 0; s.t = 0; }
  function simonTick(dt) {
    for (const [ci, s] of st.simon.entries()) {
      if (!s || s.phase === 'done') continue;
      s.t += dt;   // the timing runs everywhere (the same phase on every client); only nearby players see it
      const near = feet().distanceTo(SPOT.consoles[ci]) < 260; overlay.hidden = !near;
      if (s.phase === 'show') { const k = Math.floor(s.t / .9); if (near) overlay.textContent = k < s.seq.length ? (s.t % .9 < .7 ? s.seq[k] : '') : ''; if (k >= s.seq.length + 1) { s.phase = 'input'; s.t = 0; } }
      else { s.cycle = Math.floor(s.t / .75) % 4; if (near) { overlay.textContent = RUNES[s.cycle]; overlay.style.opacity = .55 + .45 * Math.abs(Math.sin(s.t * 4)); } }
    }
  }

  // ---- 6. rockets to the moon -------------------------------------------------------------------------------------------------
  for (const [p, n, flag] of [[SPOT.tcLower, 'CASTLE_EE_tc_lower_0', 'tcLower'], [SPOT.tcLaunch, 'CASTLE_EE_tc_launch_0', 'tcLaunch']])
    I(p, () => 'Place a tesla connector', () => { showNode(n); st.done.add(flag); st.tcLeft--; if (st.tcLeft <= 0) { st.have.delete('tc'); st.done.add('tcTaken'); } audio?.play?.('buy', .6); hud(); return true; }, () => !st.have.has('tc') || st.done.has(flag));
  I(SPOT.lever, () => 'Pull the Death Ray lever', () => {
    st.done.add('rockets'); const o = node('CASTLE_SM_ee_death_ray_switch'); if (o) { o.rotation.z -= 1.2; o.updateMatrixWorld(true); }
    flash(W(4236, -2261, -1400), 0xffd6a0, 10, 4000, 4); flash(SPOT.lever, 0x9fd8ff, 6, 900, 1.2); audio?.play?.('explosion', .9);
    announce?.('THE ROCKETS', 'LAUNCHED · TO THE MOON', 4); sfx('evt_moon_rocket_group', .9); check(); return true;
  }, () => !(st.done.has('tcLower') && st.done.has('tcLaunch')) || st.done.has('rockets'));
  // ---- 7. the fuse and the way to the boss ----------------------------------------------------------------------------
  I(SPOT.fuseBox, () => 'Place the fuse', () => { showNode('CASTLE_EE_fuse_slot_0'); place('fuse', 'fusePlaced', 'The MPD has power'); return true; }, () => !st.have.has('fuse'));
  I(SPOT.mpd, () => 'Touch the MPD', () => { startBoss(); return true; }, () => st.step !== 7 || kino.operator?.current === 'ragnarok');

  function check() {
    const d = st.done;
    if (st.step === 2 && d.has('canisterPlaced') && d.has('stonePlaced')) advance(3);
    if (st.step === 3 && d.has('stones')) advance(4);
    if (st.step === 4 && d.has('simon')) advance(5);
    if (st.step === 5 && d.has('rockets')) advance(6);
    if (st.step === 6 && d.has('fusePlaced')) advance(7);
  }
  const HINT = ['', 'Shoot the six summoning targets around the lab teleporter with a bow',
    'Hit the lit targets around the castle with an upgraded bow (four in a row), then take the lab teleporter to the past',
    'Take the Vril device in the undercroft to the statue', 'Repeat the runes at both consoles: the lower tower and the launch platform',
    'Put the tesla connectors on the roof\'s Death Ray bases, then pull its lever', 'Put the lab fuse in the roof\'s fuse box',
    'Plant the Ragnarok on a plate around the MPD (or touch the MPD)', '', ''];
  function advance(n) {
    st.step = n; audio?.play?.('box');
    if (n === 2) { announce?.('THE PAST', 'IS WITHIN REACH', 3); lightNext(); showNode('CASTLE_EE_canister_past_0'); showNode('CASTLE_EE_fuse_0'); }
    if (n === 3) { showNode('CASTLE_EE_vril_0'); }
    if (HINT[n]) toast?.(HINT[n], 5);
    hud(); check();
  }

  // ---- the boss ------------------------------------------------------------------------------------------------------------
  const restore = { auto: true };
  const startBoss = () => { if (!st.boss && st.step === 7 && !st.bossAsked) { st.bossAsked = true; sync.act('bossGo'); } };
  // every client: into the arena (each player at their own start point); the host raises the Keeper
  ev('bossGo', () => {
    if (st.boss || st.step !== 7) return;
    st.step = 8; const ids = [sync.me, ...sync.players().filter(q => !q.me).map(q => q.id)].sort(), slot = Math.max(0, ids.indexOf(sync.me));
    const start = [ARENA.start, W(-2368, 6976, -251), W(-2460, 6816, -249), W(-2460, 6912, -255)][slot % 4];
    kino.debug.teleportPlayer([start.x, start.y + 4, start.z]); flash(start, 0x9fd8ff, 8, 700, 1);
    st.boss = { z: null, phase: 0, hp: PHASE_HP[0], state: 'intro', t: 0, casts: 0, spawnT: 2, spell: null, bar: bossBar() };
    announce?.('THE KEEPER', 'DESTROY IT', 3.5); music('boss_fight', { loop: true, vol: .7 });
    if (!sync.isHost) { st.boss.z = enemies.list.find(z => z.boss) ?? null; return; }
    if (!K) return;
    restore.auto = enemies.autoSpawn !== false; enemies.autoSpawn = false;
    for (const z of [...enemies.list]) enemies.hurt(z, 1e9, false, false, 'explosion', false);
    const a = keeperActor(ARENA.keeper.clone()); face(a.root, ARENA.start);
    const z = { id: ++enemies.serial, kind: 'keeper', boss: true, root: a.root, rig: a.rig, speed: 0, health: 1e9, maxHealth: 1e9, state: 'boss', path: [], pathIndex: 0, repath: 0, hit: { r: 60, h: 300, head: 45 }, stuck: 0 };
    z.ai = dt => bossTick(dt);
    enemies.list.push(z); session.total = (session.total ?? 0) + 1; session.spawned = (session.spawned ?? 0) + 1;
    st.boss.z = z; a.rig.play(KA.roar ? 'roar' : 'idle', false);
  });
  // guests: the host's Keeper as a copy (the snapshot names a 'keeper'), its clips standing in for walk / attack / death
  const spawnOther = enemies.spawn.bind(enemies);
  enemies.spawn = (p, b, kind, ...rest) => {
    if (kind !== 'keeper' || sync.isHost) return spawnOther(p, b, kind, ...rest);
    const a = keeperActor(p.clone()); if (!a) return spawnOther(p, b, 'zombie', ...rest);
    for (const [k, src] of [['walk', 'idle'], ['attack', 'idle'], ['death', 'ending']]) if (KA[src]) a.rig.add(k, KA[src]);
    const z = { id: 0, kind: 'keeper', boss: true, root: a.root, rig: a.rig, speed: 0, health: 1e9, maxHealth: 1e9, state: 'chase', path: [], pathIndex: 0, repath: 0, hit: { r: 60, h: 300, head: 45 }, stuck: 0 };
    a.rig.play('walk'); enemies.list.push(z); if (st.boss) st.boss.z = z; return z;
  };
  // the host's fight for everyone's bar
  sync.shared('boss', () => st.boss ? { phase: st.boss.phase, hp: st.boss.hp, state: st.boss.state } : null, s => {
    if (!s || !st.boss) return; const b = st.boss, was = b.state; Object.assign(b, s); if (b.state !== was) { b.t = 0; if (b.state === 'stunned') announce?.('THE KEEPER', 'STUNNED', 1.5); } b.bar.update();
  });
  // only the stunned Keeper takes damage; insta-kill and the Nuke don't touch it (on the host; a guest's hits go there)
  const hurt = enemies.hurt.bind(enemies);
  enemies.hurt = (z, amount, head = false, melee = false, cause = 'bullet', score = true) => {
    if (!z?.boss || !sync.isHost) return hurt(z, amount, head, melee, cause, score);
    const b = st.boss; if (!b || b.state === 'dying') return;
    if (b.state !== 'stunned') { if (Math.random() < .2) audio?.play?.('hit', .2); return; }
    b.hp -= Math.min(2000, amount) * (head ? 2 : 1); b.bar.update(); if (b.hp <= 0) nextPhase();
  };
  const nuke = enemies.nuke.bind(enemies);
  enemies.nuke = onDeath => { const b = st.boss?.z, i = b ? enemies.list.indexOf(b) : -1; if (i >= 0) enemies.list.splice(i, 1); const r = nuke(onDeath); if (i >= 0) enemies.list.push(b); return r; };
  function bossBar() {
    const el = document.createElement('div'); el.id = 'ee-boss';
    el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);width:min(520px,70vw);z-index:4;pointer-events:none;font:700 12px/1 Arial,sans-serif;letter-spacing:3px;color:#e8e2d6;text-align:center;text-shadow:0 1px 3px #000';
    el.innerHTML = '<div class="n">THE KEEPER</div><div style="margin-top:6px;height:8px;background:#0009;border:1px solid #ffffff40"><i style="display:block;height:100%;background:linear-gradient(90deg,#7f5cff,#d38bff);width:100%;transition:width .15s"></i></div><div class="s" style="margin-top:5px;font-size:10px;color:#b9b2a4"></div>';
    document.body.append(el);
    return { el, update() { const b = st.boss; if (!b) return; el.querySelector('i').style.width = Math.max(0, b.hp / PHASE_HP[b.phase] * 100) + '%'; el.querySelector('.n').textContent = `THE KEEPER · ${b.phase + 1}/3`; el.querySelector('.s').textContent = b.state === 'stunned' ? 'STUNNED · SHOOT IT' : b.state === 'center' ? 'CHARGING · PLANT THE RAGNAROK BENEATH IT' : 'SHIELDED'; }, remove() { el.remove(); } };
  }
  function stunBoss() { const b = st.boss; if (!b || b.state !== 'center') return; b.state = 'stunned'; b.t = 0; b.z.rig.play(KA.stun ? 'stun' : 'idle', false); b.stunLoop = (K.index.stun?.duration ?? 1); flash(b.z.root.position, 0x9fd8ff, 6, 600, 1); announce?.('THE KEEPER', 'STUNNED', 1.5); b.bar.update(); }
  function nextPhase() {
    const b = st.boss; b.phase++;
    if (b.phase >= PHASE_HP.length) { b.state = 'dying'; b.t = 0; b.z.rig.play(KA.ending ? 'ending' : 'roar', false); b.bar.update(); audio?.play?.('box'); return; }
    b.hp = PHASE_HP[b.phase]; b.state = 'cast'; b.t = 0; b.casts = 0; b.z.rig.play(KA.roar ? 'roar' : 'idle', false); b.bar.update(); announce?.('THE KEEPER', `PHASE ${b.phase + 1}`, 2.5);
    for (let i = 0; i < b.phase; i++) kino.castle.panzer?.spawn?.(ARENA.mechz[i % ARENA.mechz.length].clone());
  }
  const bossFx = [];
  function bossTick(dt) {   // the host
    const b = st.boss; if (!b?.z) return; const z = b.z, pos = z.root.position; b.t += dt; z.stuck = 0;
    // it faces and hunts the nearest player; each spell picks one of them
    const me = (sync.nearest(pos) ?? { pos: feet() }).pos;
    if (b.state !== 'dying') face(z.root, me);
    // adds: zombies rising around the arena
    if ((b.spawnT -= dt) <= 0 && b.state !== 'dying') { b.spawnT = 3 - b.phase * .6; if (enemies.list.filter(e => e.kind === 'zombie').length < 8 + b.phase * 3) { const p = ARENA.zombies[Math.floor(Math.random() * ARENA.zombies.length)]; const q = world.closest(p, { x: 80, y: 120, z: 80 }) ?? p; const nz = enemies.spawn(q, null, 'zombie'); if (nz) { session.total++; session.spawned++; } } }
    if (b.state === 'intro' && b.t > (K.index.roar?.duration ?? 2.5)) { b.state = 'cast'; b.t = 0; z.rig.play('idle', true); b.bar.update(); }
    else if (b.state === 'cast') {
      if (!b.spell && b.t > 1.2) {   // teleport, then a spell
        const far = ARENA.tele.filter(p => p.distanceTo(me) > 260), to = far[Math.floor(Math.random() * far.length)] ?? ARENA.tele[0];
        flash(pos, 0xb06bff, 4, 500, .5); pos.copy(to); flash(pos, 0xb06bff, 4, 500, .5);
        const kind = ['storm', 'rune', 'wolf', 'demon'][Math.floor(Math.random() * 4)];
        const key = { storm: 'elemental', rune: 'runeprison', wolf: 'wolfhowl', demon: 'demongate' }[kind];
        const pl = sync.players().filter(q => !q.down), tg = pl[Math.floor(Math.random() * pl.length)] ?? { id: sync.me, pos: feet() };
        b.spell = { kind, key, t: 0, fired: false, target: tg.id }; z.rig.play(KA[key + 'In'] ? key + 'In' : 'idle', false);
      }
      if (b.spell) {
        const s = b.spell; s.t += dt; const charge = Math.min(3, K.index[s.key + 'In']?.duration ?? 1);   // the storm's charge clip runs 10 s
        if (!s.fired && s.t > charge) { s.fired = true; z.rig.play(KA[s.key + 'Deploy'] ? s.key + 'Deploy' : 'idle', false);
          const tp = sync.players().find(q => q.id === s.target)?.pos ?? me;
          sync.act('bossCast', { kind: s.kind, target: s.target, at: sync.a(tp), from: sync.a(pos), offs: Array.from({ length: 8 }, () => [(Math.random() - .5) * 260, (Math.random() - .5) * 260]) }); }
        if (s.t > charge + 2.5) { b.spell = null; b.t = 0; b.casts++; z.rig.play('idle', true); if (b.casts >= 3) { b.state = 'center'; b.t = 0; flash(pos, 0xb06bff, 4, 500, .5); pos.copy(ARENA.keeper); z.rig.play(KA.elementalLoop ? 'elementalLoop' : 'idle', true); b.bar.update(); toast?.('The Keeper is charging · plant the Ragnarok beneath it', 3); } }
      }
    } else if (b.state === 'center') {
      if (b.t > 10) {   // the storm: everyone outside the safe circles (each client checks its own player)
        sync.act('bossStorm'); b.state = 'cast'; b.t = 0; b.casts = 0; z.rig.play('idle', true); b.bar.update();
      }
    } else if (b.state === 'stunned') {
      pos.y = THREE.MathUtils.damp(pos.y, ARENA.keeper.y - 60, 3, dt);
      if (b.stunLoop && b.t > b.stunLoop) { b.stunLoop = 0; z.rig.play(KA.stunIdle ? 'stunIdle' : 'idle', true); }
      if (b.t > 9) { b.state = 'cast'; b.t = 0; b.casts = 0; z.rig.play(KA.stunOut ? 'stunOut' : 'idle', false); b.bar.update(); }
    } else if (b.state === 'dying') {
      if (b.t > Math.min(6, K.index.ending?.duration ?? 4)) winBoss();
    }
    if (b.state !== 'stunned' && b.state !== 'dying') pos.y = THREE.MathUtils.damp(pos.y, ARENA.keeper.y + Math.sin(b.t * 1.3) * 12, 2, dt);
  }
  // the spells
  const lineMat = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .95, blending: THREE.AdditiveBlending });
  function bolt(a, c, color) { const pts = [a.clone()]; for (let i = 1; i < 8; i++) pts.push(a.clone().lerp(c, i / 8).add(new THREE.Vector3((Math.random() - .5) * 40, (Math.random() - .5) * 40, (Math.random() - .5) * 40))); pts.push(c.clone()); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color)); scene.add(l); bossFx.push({ line: l, life: .15 }); }
  // a spell aimed at one player (`target`, standing at `at` when cast), drawn on every client; each client's own player
  // takes the hits that reach it (the chomper skulls chase the target)
  ev('bossCast', d => {
    const me = sync.v(d.at), pos = sync.v(d.from), kind = d.kind, o = d.offs ?? [];
    if (kind === 'storm') for (let i = 0; i < 8; i++) bossFx.push({ strike: me.clone().add(new THREE.Vector3(o[i]?.[0] ?? 0, 0, o[i]?.[1] ?? 0)), at: .4 + i * .35, life: .6 + i * .35, warn: null });
    if (kind === 'rune') bossFx.push({ pillar: me.clone(), at: 1.3, life: 2.2, warn: null });
    if (kind === 'wolf') for (let i = 0; i < 3; i++) { const v = me.clone().sub(pos).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - 1) * .35); bossFx.push({ wolf: glow(pos.clone().setY(me.y + 40), 0xbfe6ff, 60), v: v.multiplyScalar(520), life: 2.5, hit: false }); }
    if (kind === 'demon') for (let i = 0; i < 4; i++) bossFx.push({ chomper: glow(pos.clone().add(new THREE.Vector3((o[i]?.[0] ?? 0) * .3, 60, (o[i]?.[1] ?? 0) * .3)), 0xb06bff, 45), life: 6, hit: 0, target: d.target });
  });
  ev('bossStorm', () => {
    const me = feet(), pos = ARENA.keeper, safe = ARENA.safe.some(p => Math.hypot(me.x - p.x, me.z - p.z) < 150);
    flash(ARENA.keeper, 0xbfe6ff, 10, 2500, 1.2); audio?.play?.('explosion', .9);
    for (let i = 0; i < 10; i++) bolt(pos.clone().add(new THREE.Vector3(0, 200, 0)), ARENA.center.clone().add(new THREE.Vector3((R() - .5) * 1200, 0, (R() - .5) * 1200)), 0xbfe6ff);
    if (!safe && st.step === 8) damage(80);
  });
  ev('bossPlant', () => { if (sync.isHost) stunBoss(); });
  function fxTick(dt) {
    const me = feet(), chest = me.clone().add(new THREE.Vector3(0, 40, 0));
    for (let i = bossFx.length - 1; i >= 0; i--) {
      const f = bossFx[i]; f.life -= dt; f.age = (f.age ?? 0) + dt;
      if (f.line) { f.line.material.opacity = Math.max(0, f.life / .15); }
      if (f.strike) { if (!f.warn && f.age > f.at - .5) f.warn = glow(f.strike.clone().add(new THREE.Vector3(0, 4, 0)), 0x9fd8ff, 90); if (!f.done && f.age > f.at) { f.done = true; bolt(f.strike.clone().add(new THREE.Vector3(0, 500, 0)), f.strike, 0xbfe6ff); flash(f.strike, 0xbfe6ff, 4, 400, .3); if (me.distanceTo(f.strike) < 85) damage(35); } }
      if (f.pillar) { if (!f.warn) f.warn = glow(f.pillar.clone().add(new THREE.Vector3(0, 4, 0)), 0xff6a1a, 160); if (!f.done && f.age > f.at) { f.done = true; flash(f.pillar, 0xff7a2a, 6, 500, .8); for (let k = 0; k < 6; k++) bossFx.push({ ember: glow(f.pillar.clone().add(new THREE.Vector3(0, k * 40, 0)), 0xff7a2a, 90), life: .8 }); if (Math.hypot(me.x - f.pillar.x, me.z - f.pillar.z) < 95) damage(70); } }
      if (f.wolf) { f.wolf.position.addScaledVector(f.v, dt); if (!f.hit && f.wolf.position.distanceTo(chest) < 70) { f.hit = true; damage(50); } }
      if (f.chomper) { const tq = f.target && f.target !== sync.me ? sync.players().find(q => q.id === f.target)?.pos : null, aim = tq ? tq.clone().add(new THREE.Vector3(0, 40, 0)) : chest, d = aim.clone().sub(f.chomper.position); if (d.length() > 1) f.chomper.position.addScaledVector(d.normalize(), Math.min(d.length(), 230 * dt)); if (f.chomper.position.distanceTo(chest) < 45 && (f.hit -= dt) <= 0) { f.hit = .8; damage(25); } }
      if (f.life <= 0) { if (f.line) { f.line.removeFromParent(); f.line.geometry.dispose(); f.line.material.dispose(); } for (const k of ['warn', 'wolf', 'chomper', 'ember']) drop(f[k]); bossFx.splice(i, 1); }
    }
  }
  const winBoss = () => { if (!st.bossWon) { st.bossWon = true; sync.act('bossWin'); } };
  ev('bossWin', () => {
    const b = st.boss; if (!b) return; st.boss = null; b.bar.remove();
    if (sync.isHost && b.z) { const i = enemies.list.indexOf(b.z); if (i >= 0) { enemies.list.splice(i, 1); session.kills++; session.killed++; } b.z.root.removeFromParent();
      // the arena's zombies go after this frame: the win can land inside enemies.update's loop, which would still play a dead one
      setTimeout(() => { for (const z of [...enemies.list]) hurt(z, 1e9, false, false, 'explosion', false); }, 0);
      enemies.autoSpawn = restore.auto; }
    for (const f of bossFx.splice(0)) { if (f.line) f.line.removeFromParent(); for (const k of ['warn', 'wolf', 'chomper', 'ember']) drop(f[k]); }
    const ids = [sync.me, ...sync.players().filter(q => !q.me).map(q => q.id)].sort(), slot = Math.max(0, ids.indexOf(sync.me)), back = [ARENA.back, W(-1476, 2256, 216), W(-1192, 2540, 216), W(-909, 2256, 216)][slot % 4];
    kino.debug.teleportPlayer([back.x, back.y + 4, back.z]); flash(back, 0x9fd8ff, 8, 800, 1.2);
    st.step = 9; session.flags.add('castle:ee:done'); session.addPoints?.(10000);
    try { const prof = loadProfile(); prof.rewards = { ...prof.rewards, castle: true }; saveProfile(prof); const wl = kino.weaponLevels; if (wl?.profile) { wl.profile.rewards = { ...wl.profile.rewards, castle: true }; wl.apply?.(); } } catch {}
    stopMusic(1); sfx('moon_shockwave', 1); setTimeout(() => { const parts = ['castle_outro_part_1_mas', 'castle_outro_part_2_mas', 'castle_outro_part_3_mas']; let i = 0; const next = () => { if (i < parts.length) { const a = music(parts[i++], { vol: .8 }); a.onended = next; } }; next(); }, 1500);
    announce?.('BAD MOON RISING', 'THE ROCKETS STRIKE THE MOON', 6); flash(W(4236, -2261, -1000), 0xffe0b0, 12, 6000, 5); audio?.play?.('box'); hud();
  });

  // ---- the step that starts the boss: the Ragnarok planted on a plate --------------------------------------------------
  host.on('update', dt => {
    if (!dt) return;
    if (st.step === 0 && anyBowUpgraded()) advance(1);
    padTick(dt); protectorTick(dt); simonTick(dt); fxTick(dt);
    const planted = kino.operator?.handle?.plantedAt;   // my Ragnarok: on a plate (the way in), under the charging Keeper (its stun)
    if (st.step === 7 && planted && SPOT.plates.some(p => Math.hypot(planted.x - p.x, planted.z - p.z) < 130)) startBoss();
    if (st.boss?.state === 'center' && planted && Math.hypot(planted.x - ARENA.center.x, planted.z - ARENA.center.z) < 280) { if (!st.plantAsked) { st.plantAsked = true; sync.act('bossPlant'); } } else st.plantAsked = false;
    for (let i = souls.length - 1; i >= 0; i--) { const s = souls[i]; s.t += dt / .6; s.m.position.lerpVectors(s.from, s.to, Math.min(1, s.t)); if (s.t >= 1) { drop(s.m); souls.splice(i, 1); } }
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.life -= dt; f.src.weight = Math.max(0, f.life / f.max); if (f.life <= 0) { const pool = kino.lighting?.sources, j = pool?.indexOf(f.src) ?? -1; if (j >= 0) pool.splice(j, 1); flashes.splice(i, 1); } }
    const ev = travelGlow.visible ? 1 + Math.sin(performance.now() / 150) * .25 : 1; travelGlow.scale.setScalar(70 * ev);
  });

  // ---- HUD: the step and what you carry (BO7 HUD: the player card's free slot) ------------------------------------
  const el = document.createElement('div'); el.id = 'ee-hud';
  el.style.cssText = 'display:none;pointer-events:none;font:600 10px/1.3 Arial,sans-serif;letter-spacing:1px;color:#d8c9a0;text-shadow:0 1px 2px #000;max-width:240px';
  document.body.append(el);
  const NAMES = { canister: 'MPD CANISTER', fuse: 'LAB FUSE', key: 'GOLDEN KEY', tc: 'TESLA CONNECTORS', stone: 'CHANNELING STONE', vril: 'VRIL DEVICE' };
  function hud() {
    const slot = document.querySelector('#bo7-left .extra'); if (slot && el.parentNode !== slot) slot.append(el); else if (!slot) el.style.cssText += ';position:fixed;left:28px;bottom:170px;z-index:3';
    el.style.display = st.step >= 2 && st.step < 9 && st.have.size ? 'block' : 'none';
    el.textContent = [...st.have].map(k => NAMES[k] ?? k).join(' · ');
  }
  // a new game: everything back as the map started
  const lidRest = node('CASTLE_SM_lid_crate_stone')?.rotation.x, leverRest = node('CASTLE_SM_ee_death_ray_switch')?.rotation.z;
  host.on('reset', () => {
    if (st.boss) { st.boss.bar.remove(); st.boss.z?.root.removeFromParent(); if (sync.isHost) enemies.autoSpawn = restore.auto; stopMusic(.5); }
    st.bossAsked = st.bossWon = st.plantAsked = false;
    if (P) { P.a.root.removeFromParent(); P = null; }
    for (const f of bossFx.splice(0)) { if (f.line) f.line.removeFromParent(); for (const k of ['warn', 'wolf', 'chomper', 'ember']) drop(f[k]); }
    root.traverse(o => { if (/^CASTLE_EE_/.test(o.name)) { o.visible = false; o.updateMatrixWorld(true); } });
    showNode('CASTLE_SM_safe_uc_dmg_door'); showNode('CASTLE_SM_cs_stone_2');
    const l = node('CASTLE_SM_lid_crate_stone'); if (l && lidRest != null) { l.rotation.x = lidRest; l.updateMatrixWorld(true); }
    const v = node('CASTLE_SM_ee_death_ray_switch'); if (v && leverRest != null) { v.rotation.z = leverRest; v.updateMatrixWorld(true); }
    Object.assign(st, { step: 0, summon: new Set(), travel: { lit: null, hits: 0, ready: false, round: -1 }, have: new Set(), done: new Set(), stone: 0, simon: [null, null], boss: null, tcLeft: 0 });
    newCode();
    for (const g of summonGlows) g.visible = false; travelGlow.visible = padGlows.present.visible = padGlows.past.visible = false; overlay.hidden = true; hud();
  });

  const out = {
    state: () => ({ step: st.step, hint: HINT[st.step] ?? '', summon: st.summon.size, travel: { lit: st.travel.lit, hits: st.travel.hits, ready: st.travel.ready }, have: [...st.have], done: [...st.done],
      protector: P ? { stone: P.stone, kills: P.kills, moving: !!P.move } : null, simon: st.simon.map(s => s && { round: s.round, phase: s.phase, at: s.at }),
      boss: st.boss ? { phase: st.boss.phase, hp: Math.round(st.boss.hp), state: st.boss.state, casts: st.boss.casts } : null, keeper: !!K, code: CODE.join('') }),
    skip(n) {   // testing: complete the steps before n
      if (n >= 1 && st.step < 1) advance(1);
      if (n >= 2 && st.step < 2) advance(2);
      if (n >= 3 && st.step < 3) { st.done.add('canisterPlaced'); st.done.add('stonePlaced'); showNode('CASTLE_EE_canister_slot_0'); check(); }
      if (n >= 4 && st.step < 4) { if (P) { P.a.root.removeFromParent(); P = null; } st.done.add('stones'); check(); }
      if (n >= 5 && st.step < 5) { st.done.add('simon'); check(); }
      if (n >= 6 && st.step < 6) { st.done.add('rockets'); check(); }
      if (n >= 7 && st.step < 7) { st.done.add('fusePlaced'); check(); }
    },
    boss() { if (st.step < 7) out.skip(7); startBoss(); }, primeTravel() { st.travel.ready = true; padGlows.present.visible = padGlows.past.visible = true; },
    giveItem(k) { st.have.add(k); if (k === 'tc') st.tcLeft = 2; hud(); }, stun: stunBoss, keeperReady,
  };
  return out;
}
