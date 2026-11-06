// The Hive Launcher (hive_launcher_zm): a Melon Zombies original. A brass-and-resin apiary on a launch tube: it fires
// sticky wax nests that cling to walls, floors and zombies, lure the zombies round them (350 units) and hatch glowing
// mechanical drones that home on zombies and sting them three times. Zombies that reach a nest tear it apart.
// Built by .tools/build-hive-launcher.py + .tools/assemble-grimhawk.mjs --gun hive on the M72 LAW's skeleton (its
// animations and shot sound drive it); the comb drum turns a cell each shot. Launcher class. Coming soon (Melon Pass).
//
// Attachments (weapon-levels attachments.json, ids hi_*):
//   hi_waggle     Waggle Scope (optic): aim at a zombie to mark it; every drone goes for the marked zombie first
//   hi_pheromone  Pheromone Laser (laser): nests lure from twice as far; drones go for zombies near the pink dot
//   hi_swarm      Swarm Drum (mag, replaces the comb drum): each shot is a burst of three small nests (3 drones,
//                 6 s each), up to six out, double the magazine
//   hi_keeper     Personal Hive (mag, replaces the comb drum: a straw skep): no nests; drones hatch from the gun and
//                 orbit you (up to 8), sting what comes close, and a shot sends the whole swarm at what you aim at
//   hi_smoker     Smoker (barrel, replaces the brass barrel): each shot pours a cone of smoke (dazes zombies for
//                 1.5 s) and lobs the nest; every nest already out empties all its drones at once
//   hi_killer     Killer Swarm (barrel): drones explode on their last sting
//   hi_honey      Honey Trap (under): zombies near a nest wade through honey, 55% slower
//   hi_queen      Queen Cell (ammo): each nest's first drone is a queen: twice the size and damage, six stings
//   hi_propolis   Propolis Shell (ammo): nests take 2.5 times the beating
//   hi_jelly      Royal Jelly (stock): drones that finish fly back to you and heal you a little
// Pack-a-Punched (Murder Hornet): tougher nests that hatch faster, harder stings, and drones explode on their last one.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = new URL('./', import.meta.url).href;
export const HIVE = 'hive_launcher_zm';
const ATTACHMENT_TAGS = ['tag_hi_waggle', 'tag_hi_pheromone', 'tag_hi_swarm', 'tag_hi_keeper', 'tag_hi_smoker', 'tag_hi_killer',
  'tag_hi_honey', 'tag_hi_queen', 'tag_hi_propolis', 'tag_hi_jelly'];
const SPEED = 1700, GRAVITY = 520, LIFE = 12, LURE = 350, HATCH = .6, PER_NEST = 6, BUDGET = 12, MAX_NESTS = 2, HITS = 5;
const DRONE_SPEED = 560, STINGS = 3, POOL = 56, FX = 90;
const AMBER = 0xffa21a, HORNET = 0xff3a2a, PINK = 0xff4fb0, JELLY = 0xfff2b0, SMOKE = 0xb8b0a0;

export function prepareHive(data) {
  const law = data.weapons?.m72_law_zm;
  if (!law) return;   // Moon's combat data has no LAW: the Hive stays out there
  const model = BASE + 'hive_view.glb?v=2', world = BASE + 'hive_world.glb?v=2';
  const gun = Object.assign(structuredClone(law), {
    id: HIVE, name: 'Hive Launcher', price: 2000, clipSize: 3, startAmmo: 18, maxAmmo: 24, damage: 320, minDamage: 0,
    explosionRadius: 0, explosionInnerDamage: 0, explosionOuterDamage: 0, fireTime: .7, reloadTime: 2.6, reloadEmptyTime: 2.2,
    hideTags: [...ATTACHMENT_TAGS], model, worldModel: world, adsFov: 62, hipSpread: .008,
    hive: true, weaponClass: 'Launcher', gunsmith: true, soon: true, killCauses: ['hive', 'explosion'],
  });
  gun.upgrade = Object.assign(structuredClone(law.upgrade ?? law), {
    name: 'Murder Hornet', clipSize: 5, startAmmo: 30, maxAmmo: 40, damage: 900, minDamage: 0,
    explosionRadius: 0, explosionInnerDamage: 0, explosionOuterDamage: 0, fireTime: .6, reloadTime: 2.3, reloadEmptyTime: 2,
    hideTags: [...ATTACHMENT_TAGS], model, worldModel: world, animations: structuredClone(law.animations), adsFov: 62, hipSpread: .008,
    killCauses: ['hive', 'explosion'],
  });
  for (const o of [gun, gun.upgrade]) for (const k of ['projectileType', 'projectileModel', 'projectileSpeed']) delete o[k];   // our hook fires the nest
  data.weapons[HIVE] = gun;   // not in the box, on a wall or in progression: it waits for the Melon Pass (soon)
}

export function setupHive(api) {
  const { host, session, camera, scene, world, enemies, audio, view, viewCamera } = api;
  if (!api.data?.weapons?.[HIVE]) return;   // Moon: no LAW to build it on
  const isHive = def => (def?.baseId ?? def?.id) === HIVE;
  const attsOf = def => String(def?.attachments ?? '').split('+');
  const inHand = () => isHive(session.def) && !session.weaponUnavailable && !host.gunBlocked;
  const now = () => session.time ?? performance.now() / 1000;
  const alive = z => !(z.dead || z.state === 'dead' || z.health <= 0);
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  const ray = new THREE.Ray(), qtmp = new THREE.Quaternion();

  // ---- sound: the LAW's shot under our own; a wax thunk, a drone buzz, a sting tick, a nest tearing ------------------
  const ctxOut = () => (audio.ctx && audio.master ? [audio.ctx, audio.master] : [null, null]);
  let noise = null;
  function tick(freq, len, gain, delay = 0, q = 4) {
    const [ctx, out] = ctxOut(); if (!ctx || gain < .005) return;
    if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate * .3, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0005, t + len);
    src.connect(f).connect(g).connect(out); src.start(t, Math.random() * .2, len + .02);
  }
  function buzz(freq, len, gain, delay = 0) {   // a sawtooth with a fast wobble: a bee
    const [ctx, out] = ctxOut(); if (!ctx || gain < .005) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq; lfo.frequency.value = 38; lg.gain.value = freq * .06;
    lfo.connect(lg).connect(o.frequency); f.type = 'lowpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(.0005, t); g.gain.exponentialRampToValueAtTime(gain, t + .04); g.gain.exponentialRampToValueAtTime(.0005, t + len);
    o.connect(f).connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + len + .02); lfo.stop(t + len + .02);
  }
  const at3 = p => Math.max(0, 1 - camera.position.distanceTo(p) / 2200);
  let buzzAt = 0;
  const hatchSound = p => { const t = now(); if (t - buzzAt < .18) return; buzzAt = t; buzz(190 + Math.random() * 60, .35, .05 * at3(p)); };
  const stickSound = p => { const v = at3(p); tick(260, .12, .55 * v); tick(900, .05, .2 * v, .02); };
  const stingSound = p => { const v = at3(p); tick(3200, .03, .18 * v, 0, 8); };
  const tearSound = p => { const v = at3(p); tick(420, .1, .4 * v); tick(700, .08, .25 * v, .05); };
  const breakSound = p => { const v = at3(p); tick(300, .25, .6 * v); tick(1200, .12, .3 * v, .04); buzz(240, .6, .06 * v); };
  const weaponSound = audio.weapon.bind(audio), law = def => ({ ...def, id: 'm72_law_zm', baseId: 'm72_law_zm' });
  audio.weapon = (kind, def, ...rest) => isHive(def) ? weaponSound(kind, law(def), ...rest) : weaponSound(kind, def, ...rest);

  // ---- shared textures and materials (built once; the drones and nests are pooled) ------------------------------------
  const canvasTex = (draw, n = 64) => { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glowTex = canvasTex((g, n) => {
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.7)'); gr.addColorStop(.6, 'rgba(255,255,255,.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  });
  const hexTex = canvasTex((g, n) => {   // the Waggle Scope's mark: a hex ring
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 5; g.beginPath();
    for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](n / 2 + Math.cos(a) * n * .4, n / 2 + Math.sin(a) * n * .4); }
    g.stroke();
  });
  const smokeTex = canvasTex((g, n) => {
    for (let k = 0; k < 7; k++) {
      const x = n * (.3 + Math.random() * .4), y = n * (.3 + Math.random() * .4), r = n * (.18 + Math.random() * .14);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
    }
  });
  for (const t of [glowTex, hexTex, smokeTex]) api.renderer?.initTexture?.(t);   // uploaded at load, never disposed

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8922a, roughness: .35, metalness: .85, emissive: 0xff8a10, emissiveIntensity: .55 });
  const hornetMat = new THREE.MeshStandardMaterial({ color: 0x8a1f18, roughness: .35, metalness: .7, emissive: 0xff2a10, emissiveIntensity: .7 });
  const queenMat = new THREE.MeshStandardMaterial({ color: 0x7a3fa0, roughness: .3, metalness: .8, emissive: 0xc070ff, emissiveIntensity: .7 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: .6, metalness: .3 });
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const combMat = new THREE.MeshStandardMaterial({ color: 0xffa21a, roughness: .4, metalness: .1, emissive: 0xff7a00, emissiveIntensity: 1.4 });
  const combPapMat = new THREE.MeshStandardMaterial({ color: 0xff4a2a, roughness: .4, metalness: .1, emissive: 0xff2200, emissiveIntensity: 1.5 });
  const waxMat = new THREE.MeshStandardMaterial({ color: 0x8a5a1c, roughness: .75, metalness: 0 });
  const honeyMat = new THREE.MeshStandardMaterial({ color: 0xffa020, roughness: .15, metalness: 0, emissive: 0x7a3a00, emissiveIntensity: .6, transparent: true, opacity: .75, depthWrite: false });
  const add = (map, color) => ({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

  // a drone, along +z (Object3D.lookAt points +z): striped abdomen, thorax, head with two lamp eyes, two glass wings
  const sph = (r, sx, sy, sz, x, y, z) => { const g = new THREE.SphereGeometry(r, 10, 7); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
  const bodyGeo = mergeGeometries([sph(1.1, 1, 1, 1.55, 0, 0, -1.2), sph(.85, 1, 1, 1, 0, .1, .55), sph(.62, 1, 1, 1, 0, .05, 1.5),
    (() => { const g = new THREE.ConeGeometry(.22, 1.1, 6); g.rotateX(-Math.PI / 2); g.translate(0, 0, -3.2); return g; })()]);
  const stripeGeo = mergeGeometries([-.55, -1.3, -2.0].map((z, k) => { const g = new THREE.TorusGeometry([1.02, 1.08, .8][k], .2, 6, 14); g.translate(0, 0, z); return g; })
    .concat([sph(.22, 1, 1, 1, .42, .18, 1.85), sph(.22, 1, 1, 1, -.42, .18, 1.85)]));
  const wingGeo = mergeGeometries([1, -1].map(s => { const g = new THREE.CircleGeometry(1, 10); g.scale(1.25, .55, 1); g.rotateX(-Math.PI / 2); g.rotateY(s * .35); g.translate(s * 1.35, .9, -.2); return g; }));
  const nestGeo = (() => { const g = new THREE.CylinderGeometry(7, 9, 9, 6); g.translate(0, 5.5, 0); return g; })();
  const capGeo = (() => { const g = new THREE.CylinderGeometry(10, 10.5, 2.2, 6); g.translate(0, 1.1, 0); return g; })();
  const lumpGeo = mergeGeometries([[0, 10.5, 0, 3.2], [3.5, 8, 2, 2.4], [-3, 8.5, -2.5, 2.6], [1.5, 9.5, -3.5, 2]].map(([x, y, z, r]) => sph(r, 1, .8, 1, x, y, z)));
  const puddleGeo = (() => { const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); return g; })();

  function makeDrone() {
    const g = new THREE.Group(), body = new THREE.Mesh(bodyGeo, bodyMat), stripes = new THREE.Mesh(stripeGeo, stripeMat), wings = new THREE.Mesh(wingGeo, wingMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial(add(glowTex, AMBER))); glow.scale.setScalar(9); glow.material.opacity = .55;
    g.add(body, stripes, wings, glow); g.scale.setScalar(1.25);
    return { obj: g, body, wings, glow, on: false, pos: g.position, vel: new THREE.Vector3(), target: null, nest: null, state: 'off' };
  }
  function makeNest() {
    const g = new THREE.Group(), comb = new THREE.Mesh(nestGeo, combMat), cap = new THREE.Mesh(capGeo, waxMat), lump = new THREE.Mesh(lumpGeo, waxMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial(add(glowTex, AMBER))); glow.scale.setScalar(34); glow.position.y = 7; glow.material.opacity = .5;
    const puddle = new THREE.Mesh(puddleGeo, honeyMat); puddle.visible = false;
    g.add(comb, cap, lump, glow);
    return { obj: g, comb, glow, puddle, pos: g.position, vel: new THREE.Vector3(), ground: new THREE.Vector3(), normal: new THREE.Vector3(), on: false };
  }
  const drones = Array.from({ length: POOL }, makeDrone);
  const nests = Array.from({ length: 8 }, makeNest);
  const fx = Array.from({ length: FX }, () => {
    const glow = new THREE.SpriteMaterial(add(glowTex, AMBER)), smoke = new THREE.SpriteMaterial({ map: smokeTex, color: SMOKE, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(glow); s.visible = false;
    return { obj: s, glow, smoke, t: 0, life: 1, size: 1, grow: 0, vel: new THREE.Vector3(), on: false, drag: 0 };
  });
  const marker = new THREE.Sprite(new THREE.SpriteMaterial(add(hexTex, AMBER))); marker.scale.setScalar(26); marker.visible = false;
  const dot = new THREE.Sprite(new THREE.SpriteMaterial(add(glowTex, PINK))); dot.scale.setScalar(10); dot.visible = false;
  // compiled while loading (the first nest otherwise builds these programs mid-game): engine.warmShaders
  {
    const w = [makeDrone(), makeDrone(), makeDrone(), makeNest()];
    w[1].body.material = hornetMat; w[2].body.material = queenMat; w[3].comb.material = combPapMat; w[3].puddle.visible = true; w[3].obj.add(w[3].puddle);
    const sm = new THREE.Sprite(fx[0].smoke);
    host.warmObjects?.push(...w.map(o => o.obj), new THREE.Mesh(nestGeo, combMat), sm, marker.clone(), fx[0].obj.clone());
  }
  let added = false;
  const ensureAdded = () => {   // pooled objects join the scene at the first use, then only their visibility changes
    if (added) return; added = true;
    for (const d of drones) { d.obj.visible = false; scene.add(d.obj); }
    for (const n of nests) { n.obj.visible = false; n.puddle.visible = false; scene.add(n.obj, n.puddle); }
    for (const f of fx) scene.add(f.obj);
    scene.add(marker, dot);
  };

  // ---- effects pool ----------------------------------------------------------------------------------------------------
  let fxNext = 0;
  function spark(p, color, size, life, vx = 0, vy = 0, vz = 0, grow = 0, smoke = false) {
    const f = fx[fxNext]; fxNext = (fxNext + 1) % FX;
    f.obj.material = smoke ? f.smoke : f.glow;
    f.obj.material.color.setHex(color); f.obj.material.opacity = 1;
    f.obj.position.copy(p); f.vel.set(vx, vy, vz); f.t = f.life = life; f.size = size; f.grow = grow; f.on = true; f.obj.visible = true; f.drag = smoke ? 1.6 : 0;
    f.obj.scale.setScalar(size);
  }
  const burst = (p, color, n, size, speed) => { for (let i = 0; i < n; i++) spark(p, color, size * (.6 + Math.random() * .6), .35 + Math.random() * .3, (Math.random() - .5) * speed, Math.random() * speed * .7, (Math.random() - .5) * speed); };

  // ---- aiming helpers --------------------------------------------------------------------------------------------------
  const fwd = new THREE.Vector3();
  function aimedZombie(maxOff = 45, range = 2600) {   // the zombie closest to the crosshair line
    camera.getWorldDirection(fwd);
    let best = null, bestOff = maxOff;
    for (const z of enemies.list) {
      if (!alive(z)) continue;
      tmp.copy(z.root.position); tmp.y += z.kind === 'dog' ? 20 : 45; tmp.sub(camera.position);
      const along = tmp.dot(fwd); if (along < 20 || along > range) continue;
      const off = tmp.addScaledVector(fwd, -along).length() - along * .02;
      if (off < bestOff && world.lineClear(camera.position, tmp2.copy(z.root.position).setY(z.root.position.y + 45))) { best = z; bestOff = off; }
    }
    return best;
  }
  const dotAt = new THREE.Vector3(); let dotOn = false;
  function updateDot() {   // where the Pheromone Laser lands
    camera.getWorldDirection(fwd); ray.origin.copy(camera.position); ray.direction.copy(fwd);
    const hit = world.raycast(ray, 0, 3000);
    if (hit) { dotAt.copy(camera.position).addScaledVector(fwd, Math.max(0, hit.distance - 2)); dotOn = true; }
    else dotOn = false;
  }

  // ---- the nests ---------------------------------------------------------------------------------------------------------
  const live = [];   // nests out (flying or stuck)
  const muzzle = () => {   // the barrel on screen (the gun has its own camera): tag_flash projected into the world, 30 ahead
    const flash = view?.gun?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      flash.updateWorldMatrix(true, false); flash.getWorldPosition(tmp).project(viewCamera);
      tmp.z = .5; tmp.unproject(camera).sub(camera.position).normalize();
      return tmp3.copy(camera.position).addScaledVector(tmp, 30);
    }
    return tmp3.copy(camera.position).addScaledVector(camera.getWorldDirection(tmp), 30);
  };
  function spawnNest(def, dir, { mini = false, lob = false } = {}) {
    const a = attsOf(def), pap = !!def.upgraded;
    const max = a.includes('hi_swarm') ? 6 : MAX_NESTS;
    while (live.length >= max) killNest(live[0], false);   // the oldest makes way
    const n = nests.find(o => !o.on); if (!n) return;
    ensureAdded();
    const speed = lob ? 1000 : mini ? 1500 : SPEED;
    n.on = true; n.def = def; n.a = a; n.pap = pap; n.mini = mini; n.stuck = false; n.z = null; n.life = 0; n.hatchT = .15;
    n.queen = a.includes('hi_queen'); n.flash = 0;
    n.hp = Math.max(2, Math.round(HITS * (pap ? 2 : 1) * (a.includes('hi_propolis') ? 2.5 : 1) * (mini ? .5 : 1)));
    n.budget = mini ? 3 : pap ? 16 : BUDGET; n.out = 0; n.maxOut = mini ? 3 : PER_NEST; n.maxLife = mini ? 6 : LIFE;
    n.grav = lob ? 900 : GRAVITY;
    n.pos.copy(muzzle()); n.vel.copy(dir).multiplyScalar(speed); if (lob) n.vel.y += 380;
    n.obj.scale.setScalar(mini ? .32 : .45); n.obj.visible = true; n.comb.material = pap ? combPapMat : combMat;
    n.glow.material.color.setHex(pap ? HORNET : AMBER);
    n.puddle.visible = false;
    live.push(n);
  }
  function stick(n, at, normal, z) {
    n.stuck = true; n.vel.set(0, 0, 0); n.life = 0; n.pos.copy(at); n.normal.copy(normal);
    n.obj.quaternion.setFromUnitVectors(up, normal); n.obj.scale.setScalar(n.mini ? .6 : 1);
    n.z = z ?? null; if (z) { n.off = (n.off ?? new THREE.Vector3()).copy(at).sub(z.root.position); enemies.hurt(z, 60, false, false, 'hive'); }
    // where zombies stand to tear at it: the floor under it
    ray.origin.copy(at).addScaledVector(normal, 6); ray.direction.set(0, -1, 0);
    const down = z ? null : world.raycast(ray, 0, 500);
    n.ground.copy(down ? ray.origin.addScaledVector(ray.direction, down.distance) : z ? z.root.position : at);
    if (n.a.includes('hi_honey')) { n.puddle.visible = true; n.puddle.position.copy(n.ground).y += 1.2; n.puddle.scale.setScalar(.01); }
    stickSound(at); burst(at, n.pap ? HORNET : AMBER, 6, 8, 160);
  }
  function killNest(n, broken) {
    const i = live.indexOf(n); if (i >= 0) live.splice(i, 1);
    if (!n.on) return;
    n.on = false; n.obj.visible = false; n.puddle.visible = false;
    if (n.stuck) { burst(n.pos, n.pap ? HORNET : AMBER, broken ? 14 : 8, 10, broken ? 260 : 120); if (broken) breakSound(n.pos); }
    for (const d of drones) if (d.nest === n) d.nest = null;
    for (const z of enemies.list) if (z.hiNest === n) z.hiNest = null;
  }
  function touches(z, p, r) {
    const tall = z.kind === 'dog' ? 34 : 72, body = z.kind === 'dog' ? 12 : 15, f = z.root.position;
    const dx = p.x - f.x, dz = p.z - f.z, dy = p.y < f.y ? f.y - p.y : p.y > f.y + tall ? p.y - f.y - tall : 0;
    return dx * dx + dz * dz + dy * dy < (r + body) ** 2;
  }
  const step = new THREE.Vector3(), dirN = new THREE.Vector3(), nrm = new THREE.Vector3();
  function flyNest(n, dt) {
    n.vel.y -= n.grav * dt; n.life += dt;
    step.copy(n.vel).multiplyScalar(dt); const len = step.length() || 1; dirN.copy(step).divideScalar(len);
    ray.origin.copy(n.pos); ray.direction.copy(dirN);
    const wall = world.raycast(ray, 0, len + 2);
    const span = wall ? Math.max(0, wall.distance - 1.5) : len;
    const cuts = Math.max(1, Math.ceil(span / 10));
    for (let s = 1; s <= cuts; s++) {
      tmp2.copy(n.pos).addScaledVector(dirN, span * s / cuts);
      for (const z of enemies.list) if (alive(z) && touches(z, tmp2, 4)) { stick(n, tmp2, up, z); return; }
    }
    if (wall) {
      n.pos.addScaledVector(dirN, span);
      if (wall.triangle?.getNormal) { wall.triangle.getNormal(nrm); if (nrm.dot(dirN) > 0) nrm.negate(); } else nrm.copy(dirN).negate();
      stick(n, n.pos, nrm, null); return;
    }
    n.pos.add(step); n.obj.rotation.x += dt * 9; n.obj.rotation.z += dt * 5;
    if (n.life > 4) killNest(n, false);
  }

  // ---- lure: zombies near a nest go and tear it down -------------------------------------------------------------------
  const lureR = n => LURE * (n.a.includes('hi_pheromone') ? 2 : 1);
  const lure0 = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    const prev = lure0 ? lure0(z) : null;
    if (prev) return prev;
    if (!live.length) return null;
    let n = z.hiNest;
    if (n && (!n.on || !n.stuck)) n = z.hiNest = null;
    if (!n) {
      let best = Infinity;
      for (const o of live) {
        if (!o.stuck || o.z === z) continue;
        const d = z.root.position.distanceTo(o.ground);
        if (d < lureR(o) && d < best) { best = d; n = o; }
      }
      if (!n) return null;
      z.hiNest = n;
    }
    return n.ground;
  };

  // ---- drones ----------------------------------------------------------------------------------------------------------
  const marked = { z: null, until: 0 };
  function pickTarget(d) {
    if (marked.z && alive(marked.z) && now() < marked.until) return marked.z;
    let best = null, bestScore = Infinity;
    const from = d.state === 'orbit' ? camera.position : d.pos;
    for (const z of enemies.list) {
      if (!alive(z) || z.thrall) continue;
      let score = z.root.position.distanceTo(from);
      if (score > (d.state === 'orbit' ? 260 : 1300)) continue;
      if (d.pher && dotOn && z.root.position.distanceTo(dotAt) < 220) score -= 600;
      score += 140 * (z.hiCount ?? 0);
      if (score < bestScore) { bestScore = score; best = z; }
    }
    return best;
  }
  function assign(d, z) {
    if (d.target) d.target.hiCount = Math.max(0, (d.target.hiCount ?? 1) - 1);
    d.target = z; if (z) z.hiCount = (z.hiCount ?? 0) + 1;
  }
  function spawnDrone(at, opts) {
    const d = drones.find(o => !o.on); if (!d) return null;
    ensureAdded();
    const { def, a, pap, queen = false, nest = null, orbit = false } = opts;
    d.on = true; d.state = orbit ? 'orbit' : 'hatch'; d.t = 0; d.age = 0; d.def = def; d.pap = pap; d.queen = queen; d.nest = nest;
    d.stings = queen ? 6 : STINGS; d.dmg = (def.damage ?? 320) * (queen ? 2 : 1); d.cool = 0; d.search = 0; d.idle = 0;
    d.boom = pap || a.includes('hi_killer'); d.jelly = a.includes('hi_jelly'); d.pher = a.includes('hi_pheromone');
    d.keeper = orbit; d.orbitA = Math.random() * Math.PI * 2; d.seed = Math.random() * 10;
    d.pos.copy(at); d.vel.set((Math.random() - .5) * 120, 160 + Math.random() * 80, (Math.random() - .5) * 120);
    if (nest) d.vel.addScaledVector(nest.normal, 120);
    d.body.material = queen ? queenMat : pap ? hornetMat : bodyMat;
    d.glow.material.color.setHex(queen ? 0xc070ff : pap ? HORNET : AMBER);
    d.obj.scale.setScalar(queen ? 2.1 : 1.25); d.obj.visible = true;
    d.target = null;
    hatchSound(at);
    return d;
  }
  function killDrone(d) {
    assign(d, null); d.on = false; d.obj.visible = false; d.state = 'off';
    if (d.nest) d.nest.out = Math.max(0, d.nest.out - 1);
    d.nest = null;
  }
  function explode(at, r, dmg, pap) {
    burst(at, pap ? HORNET : 0xffc040, 10, 18, 380); spark(at, 0xffffff, 30, .25, 0, 0, 0, 60);
    tick(180, .25, .5 * at3(at)); tick(900, .1, .3 * at3(at), .02);
    for (const z of enemies.list) if (alive(z) && touches(z, at, r)) enemies.hurt(z, dmg, false, false, 'explosion');
  }
  const goal = new THREE.Vector3(), steer = new THREE.Vector3();
  function flyTo(d, p, speed, dt, wobble = 1) {
    steer.copy(p).sub(d.pos); const dist = steer.length();
    if (dist > .001) steer.multiplyScalar(speed / dist);
    const t = d.age * 11 + d.seed;   // the bee wiggle
    steer.x += Math.sin(t) * 90 * wobble; steer.y += Math.sin(t * 1.7) * 60 * wobble; steer.z += Math.cos(t * 1.3) * 90 * wobble;
    d.vel.lerp(steer, Math.min(1, dt * 5));
    d.pos.addScaledVector(d.vel, dt);
    return dist;
  }
  function updateDrone(d, dt) {
    d.age += dt; d.cool -= dt;
    d.wings.scale.x = .35 + .65 * Math.abs(Math.sin(d.age * 70 + d.seed));
    if (d.state === 'hatch') {
      d.vel.y -= 300 * dt; d.vel.multiplyScalar(1 - Math.min(1, dt * 2)); d.pos.addScaledVector(d.vel, dt);
      if (d.age > .3) d.state = 'seek';
    } else if (d.state === 'orbit') {   // Personal Hive: round you until something comes close
      if (!keeperHeld) { spark(d.pos, 0xffd070, 6, .2); killDrone(d); return; }
      d.orbitA += dt * 2.2;
      goal.copy(camera.position); goal.x += Math.cos(d.orbitA) * 42; goal.z += Math.sin(d.orbitA) * 42; goal.y += -18 + Math.sin(d.orbitA * 2 + d.seed) * 8;
      flyTo(d, goal, 420, dt, .3);
      if ((d.search -= dt) <= 0) { d.search = .3; const z = pickTarget(d); if (z) { assign(d, z); d.state = 'seek'; } }
    } else if (d.state === 'seek') {
      if (!d.target || !alive(d.target)) {
        if ((d.search -= dt) <= 0) { d.search = .25; assign(d, pickTarget(d)); }
        if (!d.target && d.keeper) { d.state = 'orbit'; return; }
        if (!d.target) {   // nothing to sting: hover round the nest (or you), give up after a while
          goal.copy(d.nest?.on ? d.nest.pos : camera.position); goal.y += 30;
          flyTo(d, goal, 200, dt, 1);
          d.idle += dt;
          if (d.age > 16 || (!d.nest?.on && d.idle > 3)) killDrone(d);
          return;
        }
      }
      const z = d.target; goal.copy(z.root.position); goal.y += z.kind === 'dog' ? 22 : 50;
      const dist = flyTo(d, goal, DRONE_SPEED * (d.queen ? .85 : 1), dt, dist2(d) > 120 ? .5 : 1.2);
      if (dist < 16 && d.cool <= 0) {   // sting, then back off for another run
        d.cool = .38; d.stings--;
        enemies.hurt(z, d.dmg, false, false, 'hive');
        stingSound(d.pos); spark(d.pos, d.pap ? HORNET : 0xffe070, 7, .18);
        d.vel.set((Math.random() - .5) * 400, 220, (Math.random() - .5) * 400);
        if (d.stings <= 0) {
          if (d.boom) { explode(d.pos, d.pap && attsOf(d.def).includes('hi_killer') ? 120 : 90, d.dmg * 1.5, d.pap); killDrone(d); return; }
          if (d.jelly) { d.state = 'home'; assign(d, null); return; }
          spark(d.pos, 0xffd070, 10, .3); killDrone(d); return;
        }
      }
      if (d.age > 16) killDrone(d);
    } else if (d.state === 'home') {   // Royal Jelly: back to you with a drop of healing
      goal.copy(camera.position); goal.y -= 20;
      if (flyTo(d, goal, 700, dt, .2) < 30) {
        if (!session.down && session.maxHealth) session.health = Math.min(session.maxHealth, session.health + 3);
        spark(d.pos, JELLY, 14, .35); killDrone(d); return;
      }
      if (d.age > 20) killDrone(d);
    }
    if (d.vel.lengthSq() > 1) { tmp.copy(d.pos).add(d.vel); d.obj.lookAt(tmp); }
  }
  const dist2 = d => d.target ? d.pos.distanceTo(d.target.root.position) : 0;

  // ---- firing ------------------------------------------------------------------------------------------------------------
  const spin = { t: -1, from: 0 }, sideV = new THREE.Vector3();
  function fire(def, forward, { ads }) {
    if (!isHive(def)) return false;
    const a = attsOf(def), pap = !!def.upgraded;
    const dir = tmp2.copy(forward);
    if (!ads) { const s = def.hipSpread ?? .008; dir.x += (Math.random() - .5) * s; dir.y += (Math.random() - .5) * s; dir.z += (Math.random() - .5) * s; dir.normalize(); }
    spin.t = 0;
    buzz(150, .5, .06);
    const lob = a.includes('hi_smoker');
    if (a.includes('hi_smoker')) {   // a cone of smoke dazes what's in front; every nest out empties at once; the nest is lobbed
      camera.getWorldDirection(fwd);
      for (const z of enemies.list) {
        if (!alive(z)) continue;
        tmp.copy(z.root.position); tmp.y += 40; tmp.sub(camera.position); const d = tmp.length();
        if (d < 450 && tmp.dot(fwd) / d > .82 && world.lineClear(camera.position, tmp.add(camera.position))) z.hiDaze = now() + 1.5;
      }
      const m = muzzle();
      for (let i = 0; i < 14; i++) {
        const s = 140 + Math.random() * 260;
        spark(m, SMOKE, 14 + Math.random() * 8, 1 + Math.random() * .6, fwd.x * s + (Math.random() - .5) * 90, fwd.y * s + 20 + Math.random() * 40, fwd.z * s + (Math.random() - .5) * 90, 70, true);
      }
      for (const n of live) if (n.stuck) while (n.budget > 0 && spawnDrone(tmp.copy(n.pos).addScaledVector(n.normal, 8), { def: n.def, a: n.a, pap: n.pap, nest: n })) { n.budget--; n.out++; }
    }
    if (a.includes('hi_keeper')) {   // Personal Hive: the swarm goes for what you aim at; two more hatch from the skep
      const z = aimedZombie(80) ?? pickTarget({ state: 'orbit', pos: camera.position, pher: a.includes('hi_pheromone') });
      for (let i = 0; i < 2; i++) spawnDrone(muzzle(), { def, a, pap, orbit: true });
      for (const d of drones) if (d.on && d.state === 'orbit' && d.def && isHive(d.def)) { d.stings = Math.max(d.stings, STINGS); if (z) { assign(d, z); d.state = 'seek'; } }
      return true;
    }
    if (a.includes('hi_swarm')) {   // three small nests in a spread
      const side = sideV.crossVectors(dir, up).normalize();
      const base = goal.copy(dir);
      for (const k of [-1, 0, 1]) { steer.copy(base).addScaledVector(side, k * .09); steer.y += Math.abs(k) * .02; spawnNest(def, steer.normalize(), { mini: true, lob }); }
      return true;
    }
    spawnNest(def, dir, { lob });
    return true;
  }
  (host.fireHooks ??= []).push(fire);

  // ---- the comb drum turns a cell (60 degrees) each shot ---------------------------------------------------------------
  const binds = new WeakMap();
  const viewUpdate = view.update.bind(view);
  let adsNow = false;
  view.update = (dt, state, ...rest) => {
    adsNow = !!state?.ads;
    const out = viewUpdate(dt, state, ...rest);
    if (inHand() && view.gun) {
      if (spin.t >= 0) {
        spin.t += dt; const u = Math.min(1, spin.t / .35), k = 1 - (1 - u) ** 3;
        if (u >= 1) { spin.from = (spin.from + Math.PI / 3) % (Math.PI * 2); spin.t = -1; }
        for (const name of ['tag_hi_drum', 'tag_hi_swarm']) {
          const b = view.gun.getObjectByName(name); if (!b) continue;
          if (!binds.has(b)) binds.set(b, b.rotation.x);
          b.rotation.x = binds.get(b) + spin.from + (u >= 1 ? 0 : k * Math.PI / 3);
        }
      }
    }
    return out;
  };

  // ---- slows: Honey Trap and the Smoker's daze -------------------------------------------------------------------------
  const slowed = new Set();
  function slowFactor(z, t) {
    let f = 1;
    if (z.hiDaze > t) f = .15;
    for (const n of live) {
      if (!n.stuck || !n.a.includes('hi_honey')) continue;
      const dx = z.root.position.x - n.ground.x, dz = z.root.position.z - n.ground.z;
      if (dx * dx + dz * dz < 160 * 160 && Math.abs(z.root.position.y - n.ground.y) < 100) { f = Math.min(f, .45); break; }
    }
    return f;
  }
  function applySlow(z, f) {
    if (f < 1) {
      if (z.hiBase == null) { z.hiBase = z.speed; slowed.add(z); }
      z.speed = z.hiBase * f; if (z.rig?.mixer) z.rig.mixer.timeScale = .3 + .7 * f;
    } else if (z.hiBase != null) {
      z.speed = z.hiBase; z.hiBase = null; if (z.rig?.mixer) z.rig.mixer.timeScale = 1; slowed.delete(z);
    }
  }

  // ---- the frame ---------------------------------------------------------------------------------------------------------
  let markT = 0, keeperT = 0, keeperHeld = false;
  host.on('update', dt => {
    if (!dt) return;
    const t = now(), def = session.def, hand = inHand(), a = hand ? attsOf(def) : null;
    // the Pheromone Laser's dot and the Waggle Scope's mark
    if (hand && a.includes('hi_pheromone')) { ensureAdded(); updateDot(); dot.visible = dotOn; if (dotOn) dot.position.copy(dotAt); }
    else { dot.visible = false; if (!live.length) dotOn = false; }
    if (hand && adsNow && a.includes('hi_waggle')) {
      if ((markT -= dt) <= 0) { markT = .2; const z = aimedZombie(40); if (z) { marked.z = z; marked.until = t + 4; } }
    }
    if (marked.z && (!alive(marked.z) || t > marked.until)) marked.z = null;
    marker.visible = !!marked.z;
    if (marked.z) { ensureAdded(); marker.position.copy(marked.z.root.position); marker.position.y += marked.z.kind === 'dog' ? 50 : 92; }
    // Personal Hive: drones hatch from the gun while it's in hand; put it away and the orbiting ones go back in
    keeperHeld = !!(hand && a.includes('hi_keeper'));
    if (keeperHeld) {
      keeperT -= dt;
      let n = 0; for (const d of drones) if (d.on && (d.state === 'orbit' || d.keeper)) n++;
      if (keeperT <= 0 && n < 8) { keeperT = HATCH; spawnDrone(muzzle(), { def, a, pap: !!def.upgraded, orbit: true }); }
    }
    // nests
    for (let i = live.length - 1; i >= 0; i--) {
      const n = live[i]; if (!n) continue;
      if (!n.stuck) { flyNest(n, dt); continue; }
      n.life += dt;
      if (n.z) {
        if (!alive(n.z) || !enemies.list.includes(n.z)) { n.z = null; n.ground.copy(n.pos); }
        else { n.pos.copy(n.z.root.position).add(n.off); n.ground.copy(n.z.root.position); }
      }
      // hatch
      n.hatchT -= dt;
      if (n.hatchT <= 0 && n.budget > 0 && n.out < n.maxOut) {
        n.hatchT = n.pap ? HATCH * .75 : HATCH;
        const queen = n.queen; n.queen = false;
        if (spawnDrone(tmp.copy(n.pos).addScaledVector(n.normal, 8), { def: n.def, a: n.a, pap: n.pap, queen, nest: n })) { n.budget--; n.out++; }
      }
      // pulse, flash when hit, shrink in the last second
      n.flash = Math.max(0, n.flash - dt * 4);
      const s = (n.mini ? .6 : 1) * (1 + Math.sin(t * 6) * .04 + n.flash * .2) * Math.min(1, (n.maxLife - n.life) * 2 + .2);
      n.obj.scale.setScalar(s); n.glow.material.opacity = .4 + .2 * Math.sin(t * 6) + n.flash;
      if (n.puddle.visible) { n.puddle.scale.setScalar(Math.min(160, n.puddle.scale.x + dt * 400)); }
      if (n.life > n.maxLife) killNest(n, false);
    }
    // zombies tearing at nests (the engine never swings at the player while a zombie is lured)
    for (const z of enemies.list) {
      if (!alive(z)) continue;
      const n = z.hiNest;
      if (n?.on && n.stuck) {
        const dx = z.root.position.x - n.ground.x, dz = z.root.position.z - n.ground.z;
        if (z.state === 'chase' && dx * dx + dz * dz < 46 * 46 && Math.abs(z.root.position.y - n.ground.y) < 90) {
          z.state = 'attack'; z.vel = 0; z.attackLeft = 1.15; z.attackDealt = false; z.rig.play('attack', false); z.hiSwing = n; z.hiSwung = false;
        }
        if (z.state === 'attack' && z.hiSwing === n) {
          z.root.rotation.y = Math.atan2(-(n.ground.z - z.root.position.z), n.ground.x - z.root.position.x);
          if (!z.hiSwung && z.attackLeft < .62) {
            z.hiSwung = true; n.hp--; n.flash = 1; tearSound(n.pos); burst(n.pos, n.pap ? HORNET : AMBER, 4, 6, 140);
            if (n.hp <= 0) killNest(n, true);
          }
        }
      }
      if (z.state !== 'attack') z.hiSwing = null;
      applySlow(z, slowFactor(z, t));
    }
    for (const z of slowed) if (!enemies.list.includes(z)) slowed.delete(z);
    // drones
    for (const d of drones) if (d.on) updateDrone(d, dt);
    // effects
    for (const f of fx) {
      if (!f.on) continue;
      f.t -= dt; const u = Math.max(0, f.t / f.life);
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.drag) f.vel.multiplyScalar(1 - Math.min(1, dt * f.drag)); else f.vel.y -= 300 * dt;
      f.obj.scale.setScalar(f.size + f.grow * (1 - u)); f.obj.material.opacity = f.drag ? .55 * u : u;
      if (f.t <= 0) { f.on = false; f.obj.visible = false; }
    }
  });
  host.on('reset', () => {
    for (const n of [...live]) killNest(n, false);
    for (const d of drones) if (d.on) killDrone(d);
    for (const f of fx) { f.on = false; f.obj.visible = false; }
    for (const z of slowed) applySlow(z, 1);
    slowed.clear(); marked.z = null; spin.t = -1;
  });

  window.kino ??= {};
  window.kino.hive = {   // for tests
    live, drones, nests, fire: (ads = false) => fire(session.def, camera.getWorldDirection(new THREE.Vector3()), { ads }),
    get active() { return drones.filter(d => d.on).length; }, get marked() { return marked.z; }, aimedZombie,
  };
}
