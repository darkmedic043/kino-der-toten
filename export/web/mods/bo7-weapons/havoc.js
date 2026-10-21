// The GDL Havoc (havoc_zm): BO7's pump-action grenade launcher. Its 40 mm rounds stick to whatever they hit (walls,
// floors, zombies) and wait: the aim button detonates every round you have out (it has no sights to aim down).
// Built by .tools/build-havoc.py + .tools/assemble-grimhawk.mjs --gun havoc on the China Lake's skeleton (its
// animations drive it; the pump is kicked back procedurally after each shot). The model, the rounds, the blasts and
// the detonator sounds are our own; the shot and the reload are the China Lake's. Launcher class.
//
// Attachments (weapon-levels attachments.json, ids hv_*; the shared laser is a plain stat/visual one):
//   hv_ballistic  Ballistic Computer (optic): draws the predicted arc and where the round will land
//   hv_prox       Proximity Fuse (muzzle): stuck rounds arm after half a second and go off when a zombie walks up
//   hv_daisy      Daisy Chain (muzzle): a detonation ripples through your rounds in the order you fired them,
//                 0.12 s apart, each 15% bigger than the last
//   hv_kinetic    Kinetic Rail (barrel): rounds fly faster and flatter and hit a zombie hard on impact
//   hv_mortar     Mortar Sleeve (barrel): lobbed high, +35% blast radius, +20% damage
//   hv_airstrike  MFS Airstrike Mag (BO7's prestige mag): rounds bounce instead of sticking, fly 40% faster and
//                 airburst next to a zombie (or after 1.2 s)
//   hv_extube     Extended Tube (mag): 8 rounds, slower to reload
//   hv_tripwire   Tripwire Spool (underbarrel): laser wires strung between your stuck rounds; a zombie crossing one
//                 sets off both ends
//   hv_actuator   Actuator (BO7 rear grip): a hydraulic ram racks the pump, faster to fire and reload
//   hv_dash       Redwell Dash (BO7 rear grip): +7% movement speed with the Havoc in hand
//   hv_bandolier  Bandolier (stock): +50% reserve rounds
//   hv_breacher   Breacher Stock: your own blasts don't hurt you, they throw you into the air (rocket jumps)
//   hv_napalm / hv_cryo / hv_arc / hv_cluster / hv_singularity (ammo): a burning pool; a freezing slow (frozen kills
//                 shatter); lightning arcing on to five more zombies; a spray of bomblets; a pull, then a 150% blast
// Pack-a-Punched (Cry Havoc): 6 rounds, harder and wider blasts, and every detonation scatters three bomblets.
import * as THREE from 'three';

const BASE = new URL('./', import.meta.url).href;
export const HAVOC = 'havoc_zm';
const ATTACHMENT_TAGS = ['tag_hv_ballistic', 'tag_hv_prox', 'tag_hv_daisy', 'tag_hv_kinetic', 'tag_hv_mortar', 'tag_hv_airstrike',
  'tag_hv_extube', 'tag_hv_tripwire', 'tag_hv_actuator', 'tag_hv_dash', 'tag_hv_bandolier', 'tag_hv_breacher',
  'tag_hv_napalm', 'tag_hv_cryo', 'tag_hv_arc', 'tag_hv_cluster', 'tag_hv_singularity', 'tag_laser_box'];
const SPEED = 1500, GRAVITY = 800, FUSE = 15, MAX_OUT = 10, SELF = .7;   // units/s, units/s², stuck seconds, rounds out, self-damage reach (of the radius)
const COLOR = 0xff6a3a, PAP_COLOR = 0xff3df0, ICE = 0x8fe8ff, ARC = 0x9fc8ff, FIRE = 0xff8a1f, VOID = 0xb26bff;

export function prepareHavoc(data) {
  const cl = data.weapons.china_lake_zm;
  if (!cl) { console.warn('[bo7-weapons] no China Lake to build the GDL Havoc on'); return; }
  const model = BASE + 'havoc_view.glb?v=1', world = BASE + 'havoc_world.glb?v=1';
  const reload = { segmentedReload: true, reloadStartAdd: 1, reloadAmmoAdd: 1, reloadStartTime: 1.25, reloadTime: .62, reloadEmptyTime: .62, reloadEndTime: .8 };
  const gun = Object.assign(structuredClone(cl), {
    id: HAVOC, name: 'GDL Havoc', price: 2000, clipSize: 4, startAmmo: 24, maxAmmo: 32, damage: 1100, minDamage: 0,
    explosionRadius: 220, fireTime: .75, ...reload, hideTags: [...ATTACHMENT_TAGS], model, worldModel: world,
    adsFov: 78, hipSpread: .006, viewOffset: [1.2, -1.8, -5], havoc: true, soundAs: 'china_lake_zm', weaponClass: 'Launcher', gunsmith: true,
  });
  gun.upgrade = Object.assign(structuredClone(cl.upgrade ?? cl), {
    name: 'Cry Havoc', clipSize: 6, startAmmo: 42, maxAmmo: 48, damage: 2600, minDamage: 0, explosionRadius: 260, fireTime: .65,
    ...reload, reloadStartTime: 1.1, reloadTime: .55, reloadEmptyTime: .55, hideTags: [...ATTACHMENT_TAGS], model, worldModel: world,
    animations: structuredClone(cl.animations), adsFov: 78, hipSpread: .006, viewOffset: [1.2, -1.8, -5],
  });
  for (const o of [gun, gun.upgrade]) for (const k of ['projectileType', 'projectileModel']) delete o[k];   // our hook fires the round
  data.weapons[HAVOC] = gun;
  data.boxPool = [...new Set([...(data.boxPool ?? []), HAVOC])];
}

export function setupHavoc(api) {
  const { host, session, camera, scene, world, enemies, audio, view, viewCamera, player, features } = api;
  const isHavoc = def => (def?.baseId ?? def?.id) === HAVOC;
  const attsOf = def => String(def?.attachments ?? '').split('+');
  const has = a => attsOf(session.def).includes(a);
  const inHand = () => isHavoc(session.def) && !session.weaponUnavailable && !host.gunBlocked;
  const now = () => session.time ?? performance.now() / 1000;
  const alive = z => !(z.dead || z.state === 'dead' || z.health <= 0);
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // ---- sound: the China Lake's shot and reload; our own pump clack, sticky thunk, detonator chirp --------------------
  const ctxOut = () => (audio.ctx && audio.master ? [audio.ctx, audio.master] : [null, null]);
  const noiseBuf = ctx => {
    const b = ctx.createBuffer(1, ctx.sampleRate * .3, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  let noise = null;
  function tick(freq, len, gain, delay = 0, q = 4) {   // a filtered noise click
    const [ctx, out] = ctxOut(); if (!ctx) return;
    noise ??= noiseBuf(ctx);
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0005, t + len);
    src.connect(f).connect(g).connect(out); src.start(t, Math.random() * .2, len + .02);
  }
  function beep(freq, len, gain, delay = 0, type = 'square') {
    const [ctx, out] = ctxOut(); if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0005, t + len);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + .02);
  }
  const at3 = p => { const d = camera.position.distanceTo(p); return Math.max(0, 1 - d / 2400); };   // crude distance fade
  const pumpSound = () => { tick(1800, .05, .35, .2); tick(900, .07, .4, .34); tick(2400, .04, .3, .46); };
  const stickSound = p => { const v = at3(p); if (v > .02) { tick(320, .09, .5 * v); beep(2200, .05, .05 * v, .03, 'sine'); } };
  const detSound = () => { beep(1760, .05, .08); beep(2640, .07, .08, .06); };
  const weaponSound = audio.weapon.bind(audio), china = def => ({ ...def, id: 'china_lake_zm', baseId: 'china_lake_zm' });
  audio.weapon = (kind, def, ...rest) => {
    if (!isHavoc(def)) return weaponSound(kind, def, ...rest);
    if (kind === 'shot') pumpSound();
    return weaponSound(kind, china(def), ...rest);
  };

  // ---- Redwell Dash: a little faster on your feet (layered over the other speed getters) ---------------------------
  for (const key of ['moveSpeed', 'sprintSpeed']) {
    if (!player) break;
    const d = Object.getOwnPropertyDescriptor(player, key); let base = player[key];
    Object.defineProperty(player, key, { configurable: true, get: () => (d?.get ? d.get() : base) * (inHand() && has('hv_dash') ? 1.07 : 1), set: v => { if (d?.set) d.set(v); else base = v; } });
  }

  // ---- textures and shared materials ---------------------------------------------------------------------------------
  const canvasTex = draw => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glowTex = canvasTex(g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.75)'); gr.addColorStop(.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const ringTex = canvasTex(g => { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke(); });
  const add = (map, color, opacity = 1) => ({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity });
  const glowMats = new Map(), glowMat = color => { if (!glowMats.has(color)) glowMats.set(color, new THREE.SpriteMaterial(add(glowTex, color))); return glowMats.get(color); };
  const bodyGeo = new THREE.CylinderGeometry(1.15, 1.15, 2.4, 14), noseGeo = new THREE.SphereGeometry(1.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), caseGeo = new THREE.CylinderGeometry(1.2, 1.2, 1.3, 14);
  bodyGeo.rotateX(Math.PI / 2); noseGeo.rotateX(Math.PI / 2); noseGeo.translate(0, 0, 1.2); caseGeo.rotateX(Math.PI / 2); caseGeo.translate(0, 0, -1.8);
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x1f6f6a, roughness: .55, metalness: .2 }), brassMat = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: .4, metalness: .8 });
  const papMat = new THREE.MeshStandardMaterial({ color: 0x5a1f63, roughness: .45, metalness: .3, emissive: 0x3a0a40 });
  // built while loading (they only appear on the first shot): engine.warmShaders
  host.warmObjects?.push(...[tealMat, brassMat, papMat].map(m => new THREE.Mesh(bodyGeo, m)));

  // ---- the rounds --------------------------------------------------------------------------------------------------
  const live = [], fx = [], pools = [], pulls = [], queue = [];
  let seq = 0;
  const muzzle = () => {   // the barrel on screen (the gun has its own camera): tag_flash projected into the world, 30 ahead
    const flash = view?.gun?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      flash.updateWorldMatrix(true, false); const ndc = flash.localToWorld(new THREE.Vector3()).project(viewCamera);
      const dir = new THREE.Vector3(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(dir, 30);
    }
    return camera.position.clone().addScaledVector(tmp.setFromMatrixColumn(camera.matrixWorld, 1), -2.4);
  };
  // launch velocity for a def's attachments
  function launchVel(def, forward) {
    const a = attsOf(def), dir = forward.clone();
    let speed = SPEED, grav = GRAVITY;
    if (a.includes('hv_kinetic')) { speed = 2600; grav = 380; }
    if (a.includes('hv_mortar')) { dir.y += .42; dir.normalize(); speed = 1250; grav = 950; }
    if (a.includes('hv_airstrike')) speed *= 1.4;
    if (def.upgraded) speed *= 1.1;
    return { vel: dir.multiplyScalar(speed), grav };
  }
  function spawnRound({ def, from, vel, grav, drawFrom, bomblet = 0 }) {
    const a = attsOf(def), pap = !!def.upgraded;
    const obj = new THREE.Group();
    const s = bomblet ? .55 : 1;
    if (!bomblet) obj.add(new THREE.Mesh(caseGeo, brassMat));
    obj.add(new THREE.Mesh(bodyGeo, pap ? papMat : tealMat), new THREE.Mesh(noseGeo, pap ? papMat : tealMat));
    const led = new THREE.Sprite(glowMat(pap ? PAP_COLOR : COLOR)); led.scale.setScalar(5); led.position.z = .4; obj.add(led);
    obj.scale.setScalar(s); obj.position.copy(drawFrom ?? from); scene.add(obj);
    for (const m of obj.children) m.frustumCulled = false;
    const r = { obj, led, def, a, pap, bomblet, seq: seq++, pos: from.clone(), vel: vel.clone(), grav, life: 0, stuck: null, stuckAt: 0,
      drawFrom: (drawFrom ?? from).clone(), blend: drawFrom ? 0 : 1, airstrike: !bomblet && a.includes('hv_airstrike'), trailT: 0, fuse: bomblet ? .45 + Math.random() * .4 : null };
    live.push(r);
    if (!bomblet && live.filter(o => !o.bomblet && !o.airstrike).length > MAX_OUT) detonate(live.find(o => !o.bomblet && !o.airstrike));
    return r;
  }
  function remove(r) { r.obj.removeFromParent(); const i = live.indexOf(r); if (i >= 0) live.splice(i, 1); }

  function launch(def, forward, { ads }) {
    if (!isHavoc(def)) return false;
    const dir = forward.clone();
    if (!ads) { const s = def.hipSpread ?? .006; dir.x += (Math.random() - .5) * s; dir.y += (Math.random() - .5) * s; dir.z += (Math.random() - .5) * s; dir.normalize(); }
    const { vel, grav } = launchVel(def, dir);
    spawnRound({ def, from: camera.position.clone(), vel, grav, drawFrom: muzzle() });
    pump = 0;
    return true;
  }
  (host.fireHooks ??= []).push(launch);

  // ---- hits ---------------------------------------------------------------------------------------------------------
  function touches(z, p, r) {
    const tall = z.kind === 'dog' ? 34 : 72, body = z.kind === 'dog' ? 12 : 15, f = z.root.position;
    const dx = p.x - f.x, dz = p.z - f.z, dy = p.y < f.y ? f.y - p.y : p.y > f.y + tall ? p.y - f.y - tall : 0;
    return dx * dx + dz * dz + dy * dy < (r + body) ** 2;
  }
  function stickTo(r, at, normal, z) {
    r.pos.copy(at); r.vel.set(0, 0, 0); r.stuckAt = now(); r.blend = 1;
    r.stuck = z ? { z, off: at.clone().sub(z.root.position) } : { normal: normal.clone() };
    r.obj.position.copy(at);
    r.obj.lookAt(tmp.copy(at).add(z ? at.clone().sub(z.root.position).setY(0).normalize() : normal));
    stickSound(at);
    if (z) {
      const impact = r.a.includes('hv_kinetic') ? r.def.damage * .35 : 60;
      enemies.hurt(z, impact, false, false, 'bullet');
      if (!alive(z)) r.stuck = { normal: up.clone() };   // the impact killed it: the round stays where it was
    }
    if (r.a.includes('hv_tripwire') || r.a.includes('hv_prox')) burst(at, r.a.includes('hv_prox') ? 0xff3030 : 0xff2a2a, 3, .3);
  }

  // ---- detonation ---------------------------------------------------------------------------------------------------
  function detonate(r, scale = 1) {
    if (!live.includes(r)) return;
    remove(r);
    const a = r.a, def = r.def, at = r.pos.clone(), pap = r.pap;
    if (r.stuck?.normal) at.addScaledVector(r.stuck.normal, 4);
    let R = (def.explosionRadius ?? 220) * (a.includes('hv_mortar') ? 1.35 : 1) * scale, dmg = def.damage * (a.includes('hv_mortar') ? 1.2 : 1) * scale;
    if (r.bomblet) { R *= .55; dmg *= .45; }
    if (!r.bomblet && a.includes('hv_singularity')) { pulls.push({ at, t: .85, life: .85, R: R * 1.15, dmg: dmg * 1.5, r }); burst(at, VOID, 10, .6); beep(110, .8, .12, 0, 'sawtooth'); return; }
    if (!r.bomblet && a.includes('hv_cryo')) dmg *= .85;
    explode(at, R, dmg, r);
  }
  function explode(at, R, dmg, r) {
    const a = r.a, pap = r.pap, color = pap ? PAP_COLOR : a.includes('hv_cryo') ? ICE : a.includes('hv_arc') ? ARC : a.includes('hv_napalm') ? FIRE : a.includes('hv_singularity') ? VOID : COLOR;
    features?.effect?.(at, color, r.bomblet ? 12 : 30);
    if (!r.bomblet || Math.random() < .5) audio.play('explosion');
    shock(at, R, color); burst(at, color, r.bomblet ? 6 : 18, r.bomblet ? .6 : 1.2);
    const cryo = !r.bomblet && a.includes('hv_cryo'), hitZ = [];
    for (const z of [...enemies.list]) {
      if (!alive(z)) continue;
      const d = z.root.position.distanceTo(at);
      if (d > R * 1.3) continue;
      const clear = world.lineClear(at, tmp2.copy(z.root.position).add(tmp.set(0, 30, 0)));
      if (cryo && clear) freeze(z);
      if (d < R && clear) { enemies.hurt(z, Math.max(dmg * .2, dmg * (1 - .8 * d / R)), false, false, 'explosion'); hitZ.push(z); }
    }
    // you: hurt unless PhD or the Breacher stock; the Breacher throws you up instead
    const d = camera.position.distanceTo(at), feet = player?.position ?? camera.position;
    if (a.includes('hv_breacher') && !r.bomblet && d < R * 1.1 && player?.velocity) {
      const k = 1 - d / (R * 1.1), push = tmp.copy(feet).sub(at).setY(0);
      if (push.lengthSq() > 1) player.velocity.addScaledVector(push.normalize(), 380 * k);
      player.velocity.y = Math.max(player.velocity.y, 380 + 520 * k);
      if (player.onGround !== undefined) player.onGround = false;
    } else if (d < R * SELF && !session.perks?.has('specialty_flakjacket') && !a.includes('hv_breacher')) api.damage?.((r.bomblet ? 60 : 150) * (1 - d / (R * SELF)));
    if (r.bomblet) return;
    if (a.includes('hv_napalm')) pools.push({ at: at.clone(), R: R * .6, t: 5, dps: dmg * .22, tickT: 0, def: r.def });
    if (a.includes('hv_arc')) arcs(at, R, dmg * .45, hitZ);
    const bomblets = (a.includes('hv_cluster') ? 5 : 0) + (pap ? 3 : 0);
    for (let i = 0; i < bomblets; i++) {
      const v = new THREE.Vector3(Math.random() - .5, .9 + Math.random() * .6, Math.random() - .5).normalize().multiplyScalar(260 + Math.random() * 260);
      spawnRound({ def: r.def, from: at.clone().add(tmp.set(0, 6, 0)), vel: v, grav: GRAVITY, bomblet: 1 });
    }
  }
  function detonateAll() {
    const mine = live.filter(o => !o.bomblet && !o.airstrike && !queue.includes(o));
    if (!mine.length) return false;
    detSound();
    if (mine.some(o => o.a.includes('hv_daisy'))) { mine.sort((x, y) => x.seq - y.seq).forEach((o, i) => queue.push({ r: o, t: i * .12, scale: 1 + .15 * i })); return true; }
    for (const o of mine) detonate(o);
    return true;
  }

  // ---- ammo effects -------------------------------------------------------------------------------------------------
  function freeze(z) {
    const f = z.hvCryo;
    if (f) { f.until = now() + 4; return; }
    z.hvCryo = { until: now() + 4, k: .4, scale: z.rig?.mixer?.timeScale };
    if (z.speed) z.speed *= .4;
    if (z.rig?.mixer) z.rig.mixer.timeScale *= .4;
  }
  function thaw(z, shatter) {
    const f = z.hvCryo; if (!f) return; z.hvCryo = null;
    if (z.speed) z.speed /= f.k;
    if (z.rig?.mixer && f.scale !== undefined) z.rig.mixer.timeScale = f.scale;
    if (shatter) { const p = z.root.position.clone().add(tmp.set(0, 40, 0)); burst(p, ICE, 14, .9); tick(4200, .12, .25 * at3(p), 0, 1.5); }
  }
  function arcs(at, R, dmg, skip) {
    let from = at.clone().add(tmp.set(0, 20, 0)); const done = new Set(skip);
    for (let i = 0; i < 5; i++) {
      const next = enemies.list.filter(z => alive(z) && !done.has(z)).map(z => ({ z, d: z.root.position.distanceTo(from) }))
        .filter(({ d }) => d < 450).sort((x, y) => x.d - y.d).find(({ z }) => world.lineClear(from, tmp2.copy(z.root.position).add(tmp.set(0, 40, 0))));
      if (!next) break;
      const to = next.z.root.position.clone().add(tmp.set(0, 42, 0));
      bolt(from, to); done.add(next.z); enemies.hurt(next.z, dmg, false, false, 'explosion'); from = to;
    }
    beep(70, .25, .08, 0, 'sawtooth'); tick(6000, .2, .2, 0, .7);
  }
  function bolt(a, b) {
    const pts = [a.clone()], n = 7;
    for (let i = 1; i < n; i++) pts.push(a.clone().lerp(b, i / n).add(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(18)));
    pts.push(b.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: ARC, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; scene.add(line); fx.push({ obj: line, t: .22, life: .22, line: true });
    burst(b, ARC, 4, .4);
  }

  // ---- effects ------------------------------------------------------------------------------------------------------
  function mote(p, color, size, t, vel) {
    const s = new THREE.Sprite(glowMat(color).clone()); s.position.copy(p); s.scale.setScalar(size); scene.add(s);
    fx.push({ obj: s, t, life: t, size, vel: vel ?? null });
    if (fx.length > 300) { const f = fx.shift(); f.obj.removeFromParent(); f.obj.material.dispose(); if (f.ring || f.line) f.obj.geometry.dispose(); }
  }
  function burst(p, color, n, scale = 1) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - .5, Math.random() - .1, Math.random() - .5).normalize().multiplyScalar((140 + Math.random() * 300) * scale);
      mote(p, color, (5 + Math.random() * 7) * scale, .4 + Math.random() * .35, v);
    }
  }
  function shock(p, R, color) {   // a flat ring racing out to the blast radius, and a flash
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial(add(ringTex, color, .9)));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(p).add(tmp.set(0, 2, 0)); ring.frustumCulled = false; scene.add(ring);
    fx.push({ obj: ring, t: .35, life: .35, ring: R });
    const flash = new THREE.Sprite(glowMat(color).clone()); flash.position.copy(p); scene.add(flash);
    fx.push({ obj: flash, t: .25, life: .25, size: R * .3, grow: R * 1.4 });
  }

  // ---- Ballistic Computer: the predicted arc and a landing ring -----------------------------------------------------
  const ARC_N = 48;
  const arcLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3)),
    new THREE.LineDashedMaterial({ color: 0x6dff9a, dashSize: 10, gapSize: 7, transparent: true, opacity: .85, depthWrite: false }));
  const landRing = new THREE.Mesh(new THREE.RingGeometry(15, 18, 32), new THREE.MeshBasicMaterial({ color: 0x6dff9a, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
  arcLine.frustumCulled = landRing.frustumCulled = false; arcLine.visible = landRing.visible = false; scene.add(arcLine, landRing);
  function predict() {
    const show = inHand() && has('hv_ballistic') && session.weapon.mag > 0 && !(session.reloadLeft > 0) && view?.ready && view.mode !== 'sprint';
    arcLine.visible = landRing.visible = !!show; if (!show) return;
    const fwd = camera.getWorldDirection(new THREE.Vector3()), { vel, grav } = launchVel(session.def, fwd), p = camera.position.clone(), m0 = muzzle();
    const off = m0.sub(p), pos = arcLine.geometry.attributes.position; let n = 0, landed = null;
    const bounce = has('hv_airstrike');
    for (let i = 0; i < ARC_N; i++) {
      const t = i * .045, k = Math.max(0, 1 - t / .3);
      pos.setXYZ(i, p.x + off.x * k, p.y + off.y * k, p.z + off.z * k); n = i + 1;
      const step = vel.clone().multiplyScalar(.045), len = step.length(), hit = world.raycast(new THREE.Ray(p.clone(), step.clone().divideScalar(len)), 0, len);
      if (hit) { p.addScaledVector(step, hit.distance / len); pos.setXYZ(i, p.x, p.y, p.z); landed = hit; break; }
      p.add(step); vel.y -= grav * .045;
      if (bounce && t > 1.2) break;
    }
    for (let i = n; i < ARC_N; i++) pos.setXYZ(i, p.x, p.y, p.z);
    pos.needsUpdate = true; arcLine.geometry.setDrawRange(0, n); arcLine.computeLineDistances();
    landRing.visible = !!landed && !bounce;
    if (landed) {
      const nrm = landed.triangle?.getNormal?.(new THREE.Vector3()) ?? up;
      landRing.position.copy(p).addScaledVector(nrm, 1.5); landRing.lookAt(tmp.copy(landRing.position).add(nrm));
      const s = attsOf(session.def).includes('hv_mortar') ? 1.35 : 1; landRing.scale.setScalar(s * (session.def.explosionRadius ?? 220) / 17 * .45);
    }
  }

  // ---- Tripwire: red wires between consecutive stuck rounds ---------------------------------------------------------
  const WIRES = 12;
  const wireGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(WIRES * 6), 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
  wires.frustumCulled = false; scene.add(wires); wireGeo.setDrawRange(0, 0);
  let links = [];
  function updateWires() {
    const rounds = live.filter(o => o.stuck && o.a.includes('hv_tripwire') && !queue.some(q => q.r === o)).sort((x, y) => x.seq - y.seq);
    links = [];
    for (let i = 1; i < rounds.length && links.length < WIRES; i++) {
      const a = rounds[i - 1], b = rounds[i];
      if (a.pos.distanceTo(b.pos) < 650 && world.lineClear(a.pos, b.pos)) links.push([a, b]);
    }
    const pos = wireGeo.attributes.position;
    links.forEach(([a, b], i) => { pos.setXYZ(i * 2, a.pos.x, a.pos.y, a.pos.z); pos.setXYZ(i * 2 + 1, b.pos.x, b.pos.y, b.pos.z); });
    pos.needsUpdate = true; wireGeo.setDrawRange(0, links.length * 2);
    wires.material.opacity = .55 + .25 * Math.sin(now() * 9);
    for (const [a, b] of links) for (const z of enemies.list) {
      if (!alive(z)) continue;
      const f = z.root.position, ab = tmp.copy(b.pos).sub(a.pos), t = THREE.MathUtils.clamp(((f.x - a.pos.x) * ab.x + (f.z - a.pos.z) * ab.z) / Math.max(1, ab.x * ab.x + ab.z * ab.z), 0, 1);
      const cx = a.pos.x + ab.x * t, cz = a.pos.z + ab.z * t, cy = a.pos.y + ab.y * t;
      if ((f.x - cx) ** 2 + (f.z - cz) ** 2 < 18 * 18 && cy > f.y - 8 && cy < f.y + 76) { detonate(a); detonate(b); beep(880, .1, .06); return; }
    }
  }

  // ---- the pump: kicked back and forward after each shot (the China Lake's fire animation leaves it still) ----------
  let pump = -1;
  const binds = new WeakMap();
  const viewUpdate = view.update.bind(view);
  let aimWas = false;
  view.update = (dt, state, ...rest) => {
    let s = state;
    if (s && inHand()) {   // the aim button is the detonator: no sights to aim down
      if (s.ads && !aimWas) detonateAll();
      aimWas = !!s.ads; s = { ...s, ads: false };
    } else aimWas = !!s?.ads;
    const out = viewUpdate(dt, s, ...rest);
    const bone = inHand() ? view.gun?.getObjectByName('j_pump') : null;
    if (bone) {
      if (!binds.has(bone)) binds.set(bone, bone.position.x);
      if (pump >= 0) {
        pump += dt;
        const u = (pump - .1) / Math.min(.55, (session.def.fireTime ?? .75) * .75);
        const k = u <= 0 ? 0 : u >= 1 ? 0 : u < .45 ? Math.sin(u / .45 * Math.PI / 2) : Math.cos((u - .45) / .55 * Math.PI / 2);
        bone.position.x = binds.get(bone) - 3.4 * k;
        if (u >= 1) { pump = -1; bone.position.x = binds.get(bone); }
      }
    }
    return out;
  };

  // ---- the frame ----------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    if (!dt) return;
    const t = now();
    // Daisy Chain queue
    for (const q of [...queue]) if ((q.t -= dt) <= 0) { queue.splice(queue.indexOf(q), 1); detonate(q.r, q.scale); }
    for (const r of [...live]) {
      if (!live.includes(r)) continue;
      r.life += dt;
      if (r.stuck) {
        if (r.stuck.z) {
          const z = r.stuck.z;
          if (!alive(z) || !enemies.list.includes(z)) r.stuck = { normal: up.clone() };
          else { r.pos.copy(z.root.position).add(r.stuck.off); r.obj.position.copy(r.pos); }
        }
        const age = t - r.stuckAt;
        r.led.material = glowMat((Math.floor(age * (age > FUSE - 3 ? 8 : 2.5)) % 2) ? 0x220000 : (r.pap ? PAP_COLOR : COLOR));
        if (age > FUSE) { detonate(r); continue; }
        if (r.a.includes('hv_prox') && age > .5 && enemies.list.some(z => alive(z) && z.root.position.distanceTo(r.pos) < 80)) { detonate(r); continue; }
        continue;
      }
      // in flight
      if (r.fuse !== null && r.life > r.fuse) { detonate(r); continue; }
      if (r.airstrike && r.life > 1.2) { detonate(r); continue; }
      r.vel.y -= r.grav * dt;
      const step = r.vel.clone().multiplyScalar(dt), len = step.length() || 1, dir = step.clone().divideScalar(len);
      const wall = world.raycast(new THREE.Ray(r.pos.clone(), dir), 0, len + 1.5);
      const span = wall ? Math.max(0, wall.distance - 1.5) : len;
      let done = false;
      if (!r.bomblet) {   // zombies along the step
        const n = Math.max(1, Math.ceil(span / 8));
        for (let s = 1; s <= n && !done; s++) {
          const p = tmp2.copy(r.pos).addScaledVector(dir, span * s / n);
          for (const z of enemies.list) {
            if (!alive(z)) continue;
            if (r.airstrike) { if (touches(z, p, 70)) { r.pos.copy(p); detonate(r); done = true; break; } continue; }
            if (touches(z, p, 3)) { stickTo(r, p.clone(), up, z); done = true; break; }
          }
        }
      }
      if (done) continue;
      if (wall) {
        const at = r.pos.clone().addScaledVector(dir, span);
        const nrm = wall.triangle?.getNormal?.(new THREE.Vector3()) ?? dir.clone().negate();
        if (nrm.dot(dir) > 0) nrm.negate();
        if (r.bomblet || r.airstrike) {   // bounce
          r.vel.reflect(nrm).multiplyScalar(.5); r.pos.copy(at).addScaledVector(nrm, 1.5);
          if (r.airstrike) tick(500, .05, .3 * at3(at));
          continue;
        }
        stickTo(r, at.addScaledVector(nrm, 1.2), nrm); continue;
      }
      r.pos.add(step);
      if (r.life > 12) { detonate(r); continue; }
      r.blend = Math.min(1, r.blend + dt * 5); r.drawFrom.add(step);
      r.obj.position.copy(r.drawFrom).lerp(r.pos, r.blend);
      r.obj.lookAt(tmp.copy(r.obj.position).add(r.vel));
      if (!r.bomblet && (r.trailT -= dt) <= 0) { r.trailT = .03; mote(r.obj.position, r.pap ? PAP_COLOR : 0xffc89a, 3.5, .3); }
    }
    // Singularity pulls
    for (const g of [...pulls]) {
      g.t -= dt;
      for (const z of enemies.list) {
        if (!alive(z)) continue;
        const d = z.root.position.distanceTo(g.at);
        if (d < 30 || d > 420) continue;
        const step = tmp.copy(g.at).sub(z.root.position).setY(0).normalize().multiplyScalar(Math.min(d - 25, 300 * dt));
        const from = tmp2.copy(z.root.position).add(up.clone().multiplyScalar(35));
        if (world.lineClear(from, from.clone().add(step).addScaledVector(step.clone().normalize(), 12))) z.root.position.add(step);
      }
      if (Math.random() < dt * 40) { const a = Math.random() * Math.PI * 2, rr = 120 + Math.random() * 200; mote(g.at.clone().add(tmp.set(Math.cos(a) * rr, 10 + Math.random() * 60, Math.sin(a) * rr)), VOID, 8, .5, new THREE.Vector3(-Math.cos(a) * rr * 2, 150, -Math.sin(a) * rr * 2)); }
      if (g.t <= 0) { pulls.splice(pulls.indexOf(g), 1); explode(g.at, g.R, g.dmg, g.r); }
    }
    // napalm pools
    for (const p of [...pools]) {
      p.t -= dt; p.tickT -= dt;
      if (Math.random() < dt * 30) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * p.R; mote(p.at.clone().add(tmp.set(Math.cos(a) * rr, 4, Math.sin(a) * rr)), FIRE, 10 + Math.random() * 10, .5, new THREE.Vector3(0, 60 + Math.random() * 60, 0)); }
      if (p.tickT <= 0) {
        p.tickT = .25;
        for (const z of [...enemies.list]) if (alive(z) && z.root.position.distanceTo(p.at) < p.R && Math.abs(z.root.position.y - p.at.y) < 60) enemies.hurt(z, p.dps * .25, false, false, 'fire');
        if (!session.perks?.has('specialty_flakjacket') && camera.position.distanceTo(p.at) < p.R * .8 && Math.abs((player?.position?.y ?? camera.position.y - 60) - p.at.y) < 40) api.damage?.(6);
      }
      if (p.t <= 0) pools.splice(pools.indexOf(p), 1);
    }
    // frozen zombies thaw, or shatter when they die frozen
    for (const z of enemies.list) if (z.hvCryo && (!alive(z) || z.hvCryo.until <= t)) thaw(z, !alive(z));
    if (live.some(o => o.stuck && o.a.includes('hv_tripwire'))) updateWires(); else wireGeo.setDrawRange(0, 0);
    predict();
    for (const f of [...fx]) {
      f.t -= dt; const u = Math.max(0, f.t / f.life);
      if (f.vel) { f.obj.position.addScaledVector(f.vel, dt); f.vel.y -= 300 * dt; }
      if (f.ring) { f.obj.scale.setScalar(f.ring * (1 - u * u) + 4); f.obj.material.opacity = .9 * u; }
      else if (f.line) f.obj.material.opacity = u;
      else if (f.grow) { f.obj.scale.setScalar(f.size + f.grow * (1 - u)); f.obj.material.opacity = u; }
      else { f.obj.material.opacity = .6 * u; f.obj.scale.setScalar(f.size * (u * .7 + .3)); }
      if (f.t <= 0) { f.obj.removeFromParent(); f.obj.material.dispose(); if (f.ring || f.line) f.obj.geometry.dispose(); fx.splice(fx.indexOf(f), 1); }
    }
  });
  host.on('reset', () => {
    for (const r of [...live]) remove(r);
    for (const f of fx) f.obj.removeFromParent();
    for (const z of enemies.list) if (z.hvCryo) thaw(z, false);
    fx.length = pools.length = pulls.length = queue.length = 0; pump = -1;
  });

  window.kino.havoc = { live, fx, pools, pulls, queue, detonateAll, spawn: spawnRound, launchVel, get links() { return links; } };   // for tests
}
