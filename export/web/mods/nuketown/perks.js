// Nuketown's falling perks (BluntStuffy's _blst_nuketown_perks.gsc in the original): six machines start hidden, a crate
// pile (ENT_auto3xx) standing where each will land. Walking into a perk's trigger (Quick Revive's covers the spawn)
// calls it in: 10 s later a siren sounds and the machine falls burning from perk_spawn, high over the ocean, onto its
// spot over 18 s (incoming_perk at 13 s, landing_perk at 18 s), smashing the crates. One falls at a time; the others
// wait their turn. Jugg, Stamin-Up, Electric Cherry and Pack-a-Punch stand from the start, as in the original.
// The machines are the engine's own (custom-world.js placeMachine); this hides and moves them and hides their prompts.
// Game space: x, y up, z (entities.json).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SPAWN = V(896, 18472, -9864);   // perk_spawn
const DELAY = 10, FALL = 18, INCOMING = 13;
// land: the landing struct (the machine's spot); crates: its crate pile; trigger: a trigger_radius ({at, r, h}, origin at
// the bottom) or a trigger_multiple's box
const DROPS = [
  { perk: 'specialty_quickrevive', land: V(-127, 1689, -958), crates: 'auto339', box: [[48, 1672, 8], [168, 1776, 128]] },
  { perk: 'specialty_rof', land: V(662, 1824, -563), crates: 'auto343', at: V(936, 1848, -496), r: 100, h: 128 },
  { perk: 'specialty_fastreload', land: V(-1652, 1703, -1259), crates: 'auto345', at: V(-1286, 1712, -912), r: 200, h: 300 },
  { perk: 'specialty_additionalprimaryweapon', land: V(1594, 1685, -1224), crates: 'auto342', at: V(1126, 1704, -496), r: 50, h: 400 },
  { perk: 'specialty_flakjacket', land: V(436, 1686, 1641), crates: 'auto347', at: V(4, 1706, 1802), r: 500, h: 128 },
  { perk: 'specialty_deadshot', land: V(1102, 1688, 786), crates: 'auto349', at: V(1040, 1704, 1030), r: 50, h: 128 },
];
const PAD = 16;   // the player's own radius: the 50-unit triggers are easy to walk past otherwise
const SHAKE = { radius: 1200, time: .8, strength: .9 };   // Earthquake(0.7, 0.8, origin, 1200)

// a map sound (sounds/<name>.ogg, ripped with the map so git-ignored) through the game's mixer, so the master volume applies
export function mapSound(api) {
  const base = (api.map?.dir ?? '').replace(/\/?$/, '/') + 'sounds/';
  return (name, gain = 1) => {
    const a = new Audio(base + name + '.ogg');
    try {
      const ctx = api.audio?.ctx, master = api.audio?.master;
      if (ctx && master) {
        const g = ctx.createGain(); g.gain.value = gain; ctx.createMediaElementSource(a).connect(g).connect(master);
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } else a.volume = Math.min(1, gain * .42);
    } catch { a.volume = Math.min(1, gain * .42); }
    a.play().catch(() => {});
    return a;
  };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.8)'); r.addColorStop(.6, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function setupPerkDrops(api, { nodesOf, show }) {
  const { world, host, player } = api;
  const root = world.root, scene = world.scene;
  const play = mapSound(api);
  const burst = (position, color, count) => host.emit?.('effect', { position: position.clone(), color, count });
  const st = { playing: false, queue: [], drop: null, shake: 0, shakeAt: null, find: 0 };
  const drops = DROPS.map(d => ({ ...d, crateNodes: nodesOf(root, d.crates), machine: null, it: null, landed: false, called: false }));

  // the engine's machine and prompt for each perk: the PERK interaction nearest the landing spot, and the scene child
  // placed 40 units under it (custom-world.js). The machines load asynchronously, so this retries until all are found.
  const bind = () => {
    let missing = 0;
    for (const d of drops) {
      if (!d.it) {
        d.it = world.interactions.filter(i => i.kind === 'perk' && i.perk === d.perk).sort((a, b) => a.position.distanceToSquared(d.land) - b.position.distanceToSquared(d.land))[0] ?? null;
        if (d.it) { const prev = d.it.hidden; d.it.hidden = () => !d.landed || !!prev?.(); }
      }
      if (d.it && !d.machine) {
        const at = d.it.position.clone().add(V(0, -40, 0));
        d.machine = scene?.children.find(o => !o.isLight && o.position.distanceToSquared(at) < 4) ?? null;
        if (d.machine) { d.home = d.machine.position.clone(); d.machine.matrixAutoUpdate = true; if (!d.landed) d.machine.visible = false; }
      }
      if (!d.it || !d.machine) missing++;
    }
    return missing;
  };

  // the burning trail: additive glow sprites (no fog, no lights), a flickering head and a tail back along the path
  const tex = glowTexture(), TAIL = 12;
  const trail = new THREE.Group(); trail.visible = false; trail.name = 'nuketown_perk_trail';
  const sprites = [...Array(TAIL + 2)].map((_, i) => {
    const m = new THREE.SpriteMaterial({ map: tex, color: i === 0 ? 0xfff0c8 : i === 1 ? 0xff9a3a : 0xff6a1a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m); s.frustumCulled = false; s.renderOrder = 6; trail.add(s); return s;
  });
  scene?.add(trail);   // hidden: the engine's load-time warm-up compiles hidden objects, so the first drop doesn't hitch
  const dir = new THREE.Vector3(), camPos = new THREE.Vector3();
  const drawTrail = (d, head, t) => {
    trail.visible = true; dir.copy(SPAWN).sub(d.land).normalize();
    camPos.copy(player?.position ?? head);   // the eye
    const far = head.distanceTo(camPos), k = THREE.MathUtils.clamp(far / 4000, .12, 1.4);   // about the same size on screen far off, smaller close
    const flick = .85 + .15 * Math.sin(t * 37) * Math.sin(t * 23 + 1);
    sprites[0].position.copy(head).y += 60; sprites[0].scale.setScalar(260 * k * flick);
    sprites[1].position.copy(head).y += 60; sprites[1].scale.setScalar(520 * k * flick); sprites[1].material.opacity = .8;
    for (let i = 0; i < TAIL; i++) {
      const s = sprites[i + 2], f = (i + 1) / TAIL;
      s.position.copy(head).addScaledVector(dir, f * 2600 * Math.min(1.2, k + .2)).y += 60;
      s.scale.setScalar((420 - 260 * f) * k * (.8 + .4 * Math.random()));
      s.material.opacity = (1 - f) * .75;
    }
    for (const s of sprites) s.updateMatrixWorld();
  };

  const land = d => {
    d.landed = true; trail.visible = false;
    const m = d.machine; if (m) { m.position.copy(d.home); m.visible = true; m.updateMatrix(); m.updateMatrixWorld(true); }
    show(d.crateNodes, false);
    const c = d.land.clone().add(V(0, 20, 0));
    burst(c.clone().add(V(0, 30, 0)), new THREE.Color(1, .7, .3), 14);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; burst(c.clone().add(V(Math.cos(a) * 55, 0, Math.sin(a) * 55)), new THREE.Color(.72, .64, .53), 4); }
    const p = player?.getFeetPosition?.(), dist = p ? p.distanceTo(d.land) : Infinity;
    if (dist < SHAKE.radius) { st.shake = SHAKE.strength * (1 - dist / SHAKE.radius); st.shakeAt = 0; }
  };

  const reset = () => {
    bind();
    st.queue.length = 0; st.drop = null; trail.visible = false;
    if (st.shakeAt != null && globalThis.kino?.fpMotion) globalThis.kino.fpMotion.shake = 0;
    st.shakeAt = null; st.playing = false;
    for (const d of drops) {
      d.landed = false; d.called = false; show(d.crateNodes, true);
      if (d.machine) { d.machine.position.copy(d.home); d.machine.visible = false; d.machine.updateMatrix(); d.machine.updateMatrixWorld(true); }
    }
  };
  reset();
  host.on('reset', reset);
  host.on('start', () => { st.playing = true; });
  host.on('gameOver', () => { st.playing = false; });

  const inTrigger = (d, p) => d.box
    ? p.x >= d.box[0][0] && p.x <= d.box[1][0] && p.z >= d.box[0][2] && p.z <= d.box[1][2] && p.y >= d.box[0][1] - 20 && p.y <= d.box[1][1]
    : p.y >= d.at.y - 20 && p.y <= d.at.y + d.h && (p.x - d.at.x) ** 2 + (p.z - d.at.z) ** 2 < (d.r + PAD) ** 2;

  host.on('update', dt => {
    if (st.find < 40 && drops.some(d => !d.machine || !d.it)) { st.find++; if (!bind()) for (const d of drops) if (!d.landed && d.machine) d.machine.visible = false; }
    if (st.shakeAt != null) {
      st.shakeAt += dt; const k = Math.max(0, 1 - st.shakeAt / SHAKE.time);
      if (globalThis.kino?.fpMotion) globalThis.kino.fpMotion.shake = st.shake * k;
      if (k <= 0) st.shakeAt = null;
    }
    if (!st.playing) return;
    const p = player?.getFeetPosition?.();
    if (p) for (const d of drops) if (!d.called && inTrigger(d, p)) { d.called = true; st.queue.push(d); }
    if (!st.drop && st.queue.length) st.drop = { d: st.queue.shift(), t: -DELAY, cues: 0 };
    const q = st.drop; if (!q) return;
    q.t += dt;
    if (q.t < 0) return;
    const d = q.d;
    if (q.cues === 0) { q.cues = 1; play('perk_siren', .6); }
    if (q.cues === 1 && q.t >= INCOMING) { q.cues = 2; play('incoming_perk', .6); }
    if (q.t >= FALL) { play('landing_perk', .7); land(d); st.drop = null; return; }
    const m = d.machine; if (!m) return;
    m.visible = true; m.position.lerpVectors(SPAWN, d.home, q.t / FALL); m.updateMatrix(); m.updateMatrixWorld(true);
    drawTrail(d, m.position, q.t);
  });

  return { drops, st, land: perk => { const d = drops.find(x => x.perk === perk || x.perk.endsWith(perk)); if (d && !d.landed) land(d); }, call: perk => { const d = drops.find(x => x.perk === perk || x.perk.endsWith(perk)); if (d && !d.called) { d.called = true; st.queue.push(d); } }, bind };
}
