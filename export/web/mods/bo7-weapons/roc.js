// The ROC 20mm (roc_zm): BO7's semi-auto 20 mm cannon (Season 6, a Special). Its stock round is a solid armour-piercing
// shell (user, 2026-10-21: not explosive by default, "just kind of like a cannon"): it hits very hard, punches through
// the first zombie into the next and shoves what it hits. The HE Shells ammo mod makes it explosive (a direct hit, then
// a small blast where the shell bursts). Five rounds, a heavy kick. Built by .tools/build-roc.py + .tools/assemble-grimhawk.mjs --gun roc on the M16's
// skeleton (its animations drive it); the model, the tracer and the blasts are our own, the shot is the L96's with a
// low thump of our own under it, the reload the M16's. Special class.
//
// Attachments (weapon-levels attachments.json, ids ro_*; the shared grip and laser are plain stat/visual ones):
//   ro_gunner    Gunner's Scope (optic): 4x, harder headshots
//   ro_reflex    Breach Reflex (optic): an open sight; aimed shots kick half as much
//   ro_concuss   Concussion Brake (muzzle): the muzzle blast shoves zombies in front of you back and staggers them
//   ro_hush      Thump Baffle (muzzle): suppressed, less kick, a tighter, harder blast
//   ro_tungsten  Tungsten Rail Barrel: longer range; the shell punches through one more zombie
//   ro_mfs       MFS Warhead Autoloader (BO7's prestige mag): a drum, full auto, 15 rounds, wider hip fire
//   extmag / dualmag  the shared Extended Mag (a longer box, 8 rounds) and Dual Mag (two boxes taped side by side), on
//                the M16's own tag_ext_clip / tag_double_clip
//   ro_damper    Damper Grip (rear grip): less kick, steadier hip fire
//   ro_snap      Snap Grip (rear grip): faster reloads
//   ro_buffer    Hydraulic Buffer Stock: soaks most of the kick
//   ro_kick      Kick Stock: every shot throws you back along your aim; fire at your feet to cannon-jump
//   ro_bipod     Bipod (underbarrel): braced (crouched, prone, or standing still): +40% damage, a
//                bigger blast and no kick
//   ro_he / ro_sabot / ro_thermite / ro_flak / ro_shock / ro_canister / ro_mark (ammo): HE shells that burst on what they
//                hit; a tungsten dart that goes through every zombie in line; incendiary rounds leaving burning ground
//                where they strike; an airburst beside the first zombie the shell passes; lightning arcing on to four
//                more; a flechette spray (a shotgun); everything the round hits is marked to take +50% from everything
// Pack-a-Punched (Ruin of Cities): 8 rounds, much harder shells that punch through one more zombie; its blasts (HE,
// Flak) are wider and each throws three bomblets.
import * as THREE from 'three';

const BASE = new URL('./', import.meta.url).href;
export const ROC = 'roc_zm';
const ATTACHMENT_TAGS = ['tag_ro_gunner', 'tag_ro_reflex', 'tag_ro_concuss', 'tag_ro_hush', 'tag_ro_tungsten', 'tag_ro_mfs',
  'tag_ro_damper', 'tag_ro_snap', 'tag_ro_buffer', 'tag_ro_kick', 'tag_ro_bipod', 'tag_foregrip', 'tag_laser_box',
  'tag_ro_he', 'tag_ro_sabot', 'tag_ro_thermite', 'tag_ro_flak', 'tag_ro_shock', 'tag_ro_canister', 'tag_ro_mark'];
const SPARE_TAGS = ['tag_ext_clip', 'tag_double_clip'];   // the M16's own spare mag bones: the Extended / Dual Mag models
const VIEW_OFFSET = [.8, -.8, -6];   // a long gun: pushed out from the eye like the Siren's
const KICK = .05, REACH = 4000, SELF = .6;   // extra camera pitch per shot (rad), the shell's fuse range (it self-destructs past it), self-damage reach (of the radius)
const COLOR = 0xffa040, PAP_COLOR = 0x5fd8ff, FIRE = 0xff5a1f, ARC = 0x9fc8ff, MARK = 0xff7a1a, RAIL = 0x3ce0ff;

export function prepareRoc(data) {
  const m16 = data.weapons.m16_zm;
  if (!m16) { console.warn('[bo7-weapons] no M16 to build the ROC 20mm on'); return; }
  const model = BASE + 'roc_view.glb?v=2', world = BASE + 'roc_world.glb?v=2';
  const hideTags = [...ATTACHMENT_TAGS, ...SPARE_TAGS];
  const common = { range: REACH, minDamage: 0, automatic: false, fireType: 'Semi-Auto', pellets: 1, hideTags, model, worldModel: world,
    viewOffset: VIEW_OFFSET, weight: 1.5, headMultiplier: 2, hipSpread: .008 };
  const gun = Object.assign(structuredClone(m16), common, {
    id: ROC, name: 'ROC 20mm', price: 1500, clipSize: 5, startAmmo: 40, maxAmmo: 60, damage: 1500, explosionRadius: 120, blastDamage: 450,
    fireTime: .3, reloadTime: 2.9, reloadEmptyTime: 3.3, adsFov: 50, roc: true, soundAs: 'm16_zm', weaponClass: 'Special', gunsmith: true,
  });
  gun.upgrade = Object.assign(structuredClone(m16.upgrade ?? {}), common, {
    name: 'Ruin of Cities', clipSize: 8, startAmmo: 64, maxAmmo: 96, damage: 4000, explosionRadius: 150, blastDamage: 1300,
    fireTime: .26, reloadTime: 2.5, reloadEmptyTime: 2.9, adsFov: 50, animations: structuredClone(m16.animations),
  });
  delete gun.upgrade.attachment;   // the M16's Pack-a-Punch carries an M203 grenade launcher
  for (const o of [gun, gun.upgrade]) for (const k of ['projectileType', 'projectileModel', 'projectileSpeed']) delete o[k];   // our hook fires the shell
  data.weapons[ROC] = gun;
  data.boxPool = [...new Set([...(data.boxPool ?? []), ROC])];
}

export function setupRoc(api) {
  const { host, session, camera, scene, world, enemies, audio, view, viewCamera, player, features } = api;
  const isRoc = def => (def?.baseId ?? def?.id) === ROC;
  const attsOf = def => String(def?.attachments ?? '').split('+');
  const now = () => session.time ?? performance.now() / 1000;
  const alive = z => !(z.dead || z.state === 'dead' || z.health <= 0) && enemies.list.includes(z);
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // ---- sound: the L96's crack with a low cannon thump of our own under it; the M16's reload --------------------------
  const ctxOut = () => (audio.ctx && audio.master ? [audio.ctx, audio.master] : [null, null]);
  let noise = null;
  function thump(gain = 1, delay = 0, freq = 90) {   // low-passed noise and a falling sine: the 20 mm's weight
    const [ctx, out] = ctxOut(); if (!ctx) return;
    if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'lowpass'; f.frequency.value = freq * 4;
    g.gain.setValueAtTime(.9 * gain, t); g.gain.exponentialRampToValueAtTime(.0005, t + .45);
    src.connect(f).connect(g).connect(out); src.start(t, 0, .5);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * .4, t + .3);
    og.gain.setValueAtTime(.7 * gain, t); og.gain.exponentialRampToValueAtTime(.0005, t + .35);
    o.connect(og).connect(out); o.start(t); o.stop(t + .4);
  }
  const weaponSound = audio.weapon.bind(audio);
  audio.weapon = (kind, def, ...rest) => {
    if (!isRoc(def)) return weaponSound(kind, def, ...rest);
    if (kind === 'shot') {
      const hush = attsOf(def).includes('ro_hush');
      thump(hush ? .45 : 1, 0, hush ? 70 : 90);
      if (hush) return;   // suppressed: only the thump
      return weaponSound(kind, { ...def, id: 'l96a1_zm', baseId: 'l96a1_zm' }, ...rest);
    }
    return weaponSound(kind, { ...def, id: 'm16_zm', baseId: 'm16_zm' }, ...rest);
  };

  // ---- shared textures and materials --------------------------------------------------------------------------------
  const canvasTex = draw => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glowTex = canvasTex(g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.75)'); gr.addColorStop(.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const ringTex = canvasTex(g => { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke(); });
  const add = (map, color, opacity = 1) => ({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity });
  const glowMats = new Map(), glowMat = color => { if (!glowMats.has(color)) glowMats.set(color, new THREE.SpriteMaterial(add(glowTex, color))); return glowMats.get(color); };
  const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); tracerGeo.translate(0, .5, 0); tracerGeo.rotateX(Math.PI / 2);   // unit length along +z
  const tracerMat = color => new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const markMat = new THREE.SpriteMaterial(add(glowTex, MARK, .9));
  // built while loading (they only appear on the first shot): engine.warmShaders
  host.warmObjects?.push(new THREE.Mesh(tracerGeo, tracerMat(COLOR)), new THREE.Sprite(markMat), new THREE.Sprite(glowMat(COLOR)));

  const fx = [], pools = [], queue = [], pushes = [];
  const muzzle = () => {   // the barrel on screen (the gun has its own camera): tag_flash projected into the world, 30 ahead
    const flash = view?.gun?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      flash.updateWorldMatrix(true, false); const ndc = flash.localToWorld(new THREE.Vector3()).project(viewCamera);
      const dir = new THREE.Vector3(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(dir, 30);
    }
    return camera.position.clone().addScaledVector(tmp.setFromMatrixColumn(camera.matrixWorld, 1), -2.4);
  };

  // ---- recoil: a heavy camera kick spread over a few frames, scaled by the attachments ----------------------------------
  let kick = 0, still = 0;
  const braced = a => a.includes('ro_bipod') && !!(player?.crouched || window.kino?.movement?.state?.prone || still > .35);   // kneeling, prone or planted
  function kickFor(def, ads) {
    const a = attsOf(def);
    if (braced(a)) return 0;
    let k = KICK * (ads ? .7 : 1);
    if (a.includes('ro_buffer')) k *= .4;
    if (a.includes('ro_damper')) k *= .6;
    if (a.includes('ro_hush')) k *= .8;
    if (a.includes('ro_reflex') && ads) k *= .5;
    if (a.includes('ro_mfs')) k *= .6;   // full auto: smaller kicks, more of them
    if (def.upgraded) k *= .85;
    return k;
  }

  // ---- the shot --------------------------------------------------------------------------------------------------------
  const scan = (ray, far, skip) => enemies.rayHit.call({ list: enemies.list.filter(z => !skip.has(z)), headPosition: z => enemies.headPosition(z) }, ray, far);
  function fire(def, forward, { ads }) {
    if (!isRoc(def)) return false;
    const a = attsOf(def), from = muzzle();
    kick += kickFor(def, ads);
    if (a.includes('ro_kick') && player?.velocity) {   // thrown back along the aim; straight down = a cannon jump
      player.velocity.addScaledVector(tmp.copy(forward).setY(0), -420);
      if (forward.y < -.35) { player.velocity.y = Math.max(player.velocity.y, 300 + 420 * -forward.y); for (const k of ['onGround', 'onFloor', 'grounded']) if (k in player) player[k] = false; }
    }
    if (a.includes('ro_concuss')) concussion(def, forward);
    mote(from, def.upgraded ? PAP_COLOR : 0xffd08a, a.includes('ro_hush') ? 4 : 14, .08);
    if (a.includes('ro_canister')) { for (let i = 0; i < 10; i++) shot(def, a, spread(forward, .07), from, .3, true); return true; }
    const s = ads ? (a.includes('ro_mfs') ? .006 : 0) : (def.hipSpread ?? .008) * (session.perks?.has('specialty_deadshot') ? .5 : 1);
    shot(def, a, spread(forward, s), from, 1, false);
    return true;
  }
  (host.fireHooks ??= []).push(fire);
  const spread = (f, s) => s ? f.clone().add(tmp.set((Math.random() - .5) * s, (Math.random() - .5) * s, (Math.random() - .5) * s)).normalize() : f.clone();

  function shot(def, a, dir, from, share, pellet) {
    const ray = new THREE.Ray(camera.position.clone(), dir), reach = pellet ? 1400 : def.range ?? REACH;
    const wall = world.raycast(ray, 1, reach), far = wall?.distance ?? reach;
    const he = (a.includes('ro_he') || a.includes('ro_flak')) && !pellet,   // Flak shells burst on impact too
      mul = (braced(a) ? 1.4 : 1) * share, direct = def.damage * mul * (he ? .6 : 1);
    const skip = new Set(), struck = [];
    // the solid shell goes through one zombie into the next (HE bursts on the first); tungsten +1, Pack-a-Punch +1
    let pierce = a.includes('ro_sabot') ? Infinity : (he ? 0 : 1) + (a.includes('ro_tungsten') ? 1 : 0) + (def.upgraded ? 1 : 0);
    if (pellet) pierce = 0;
    let end = null, endZ = null;
    // the Flak fuse: the shell bursts beside the first zombie it passes within 45 units of (before anything it hits)
    if (a.includes('ro_flak') && !pellet) {
      let best = null;
      for (const z of enemies.list) {
        if (!alive(z)) continue;
        const c = tmp2.copy(z.root.position).add(tmp.set(0, 40, 0)), t = c.clone().sub(ray.origin).dot(dir);
        if (t < 60 || t > far) continue;
        const d = ray.at(t, new THREE.Vector3()).distanceTo(c);
        if (d < 45 && (!best || t < best.t)) best = { t, z };
      }
      const hit = scan(ray, far, skip);
      if (best && (!hit || best.t < hit.distance)) {
        const at = ray.at(best.t - 10, new THREE.Vector3());
        tracer(from, at, def, a);
        blast(at, def, a, mul, { flak: dir });
        return;
      }
    }
    for (;;) {
      const hit = scan(ray, far, skip);
      if (!hit) break;
      const dmg = direct * (a.includes('ro_sabot') ? 1.5 : 1) * (hit.head ? Math.max(1, def.headMultiplier ?? 2) : 1);
      enemies.hurt(hit.z, dmg, hit.head, false, 'bullet');
      skip.add(hit.z); struck.push(hit.z);
      if (!he && !pellet && alive(hit.z)) pushes.push({ z: hit.z, dir: tmp.copy(dir).setY(0).normalize().clone(), left: 45, t: .15 });   // the 20 mm's shove
      if (pierce > 0) { pierce--; burst(hit.point, a.includes('ro_sabot') ? 0xe8f4ff : RAIL, 4, .4); continue; }
      end = hit.point; endZ = hit.z; break;
    }
    const tail = end ?? (wall ? ray.at(Math.max(1, wall.distance - 2), new THREE.Vector3()) : ray.at(far, new THREE.Vector3()));
    tracer(from, tail, def, a, pellet);
    if (he) { blast(tail, def, a, mul, { struck: endZ }); return; }   // on what it hit, or in the air at the end of its fuse
    if (end || wall) burst(tail, 0xffe0b0, pellet ? 2 : 8, pellet ? .4 : .55);
    if (!pellet && (end || wall)) impact(tail, def, a, mul, struck);
  }
  // what the solid shell's ammo does where it strikes (no blast): incendiary ground, arcs, marks
  function impact(at, def, a, mul, struck) {
    const dmg = (def.blastDamage ?? 450) * mul;
    if (a.includes('ro_thermite')) { pools.push({ at: at.clone(), R: 70, t: 4, dps: dmg * .3, tickT: 0 }); burst(at, FIRE, 10, .7); }
    if (a.includes('ro_shock')) arcs(at, dmg * .5, struck);
    if (a.includes('ro_mark')) for (const z of struck) if (alive(z)) mark(z);
  }

  // ---- the blast ---------------------------------------------------------------------------------------------------------
  function blast(at, def, a, mul, { struck = null, flak = null, bomblet = false } = {}) {
    const pap = !!def.upgraded;
    let R = (def.explosionRadius ?? 120) * (a.includes('ro_bipod') && mul > 1 ? 1.15 : 1) * (a.includes('ro_hush') ? .85 : 1) * (flak ? 1.1 : 1);
    let dmg = (def.blastDamage ?? 450) * mul * (a.includes('ro_hush') ? 1.15 : 1);
    if (bomblet) { R *= .5; dmg *= .35; }
    const color = pap ? PAP_COLOR : COLOR;
    features?.effect?.(at, color, bomblet ? 8 : 20);
    if (!bomblet || Math.random() < .4) audio.play('explosion');
    shock(at, R, color); burst(at, color, bomblet ? 5 : 14, bomblet ? .5 : .9);
    const hitZ = [];
    for (const z of [...enemies.list]) {
      if (!alive(z)) continue;
      const d = z.root.position.distanceTo(at);
      if (d > R + 20) continue;
      if (!world.lineClear(at, tmp2.copy(z.root.position).add(tmp.set(0, 30, 0)))) continue;
      hitZ.push(z);
      if (z !== struck) enemies.hurt(z, Math.max(dmg * .25, dmg * (1 - .75 * Math.max(0, d - 15) / R)), false, false, 'explosion');
      else enemies.hurt(z, dmg * .5, false, false, 'explosion');   // the zombie the shell struck has already taken the hit
    }
    if (flak) {   // the airburst throws shrapnel on ahead along the shell's line
      for (const z of [...enemies.list]) {
        if (!alive(z) || hitZ.includes(z)) continue;
        const c = tmp2.copy(z.root.position).add(tmp.set(0, 40, 0)).sub(at), d = c.length();
        if (d < 320 && c.normalize().dot(flak) > .8) { enemies.hurt(z, dmg * .45, false, false, 'explosion'); hitZ.push(z); }
      }
      for (let i = 0; i < 10; i++) mote(at, 0xffd23a, 4, .25, spread(flak, .9).multiplyScalar(900));
    }
    // you: hurt when it's close, unless you have PhD
    const d = camera.position.distanceTo(at);
    if (d < R * SELF && !session.perks?.has('specialty_flakjacket')) api.damage?.((bomblet ? 25 : 60) * (1 - d / (R * SELF)));
    if (bomblet) return;
    if (pap) for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2, r = 50 + Math.random() * 40;
      queue.push({ t: .18 + i * .1, at: at.clone().add(tmp.set(Math.cos(ang) * r, 0, Math.sin(ang) * r)), def, a, mul });
    }
  }

  // ---- ammo and muzzle effects ------------------------------------------------------------------------------------------
  function arcs(at, dmg, skip) {
    let from = at.clone().add(tmp.set(0, 20, 0)); const done = new Set(skip);
    for (let i = 0; i < 4; i++) {
      const next = enemies.list.filter(z => alive(z) && !done.has(z)).map(z => ({ z, d: z.root.position.distanceTo(from) }))
        .filter(({ d }) => d < 380).sort((x, y) => x.d - y.d).find(({ z }) => world.lineClear(from, tmp2.copy(z.root.position).add(tmp.set(0, 40, 0))));
      if (!next) break;
      const to = next.z.root.position.clone().add(tmp.set(0, 42, 0));
      bolt(from, to); done.add(next.z); enemies.hurt(next.z, dmg, false, false, 'explosion'); from = to;
    }
  }
  // Tracer Mark: marked zombies take +50% from everything (wrapped around the engine's hurt) and wear a glow
  function mark(z) {
    z.roMark = now() + 8;
    if (!z.roMarkSprite) { const s = new THREE.Sprite(markMat); s.scale.setScalar(14); s.position.set(0, 80, 0); z.root.add(s); z.roMarkSprite = s; }
  }
  const hurt = enemies.hurt.bind(enemies);
  enemies.hurt = (z, damage, ...rest) => hurt(z, z?.roMark > now() ? damage * 1.5 : damage, ...rest);
  // Concussion Brake: the muzzle blast shoves the zombies in front of you back and staggers them
  function concussion(def, forward) {
    const flat = tmp.copy(forward).setY(0).normalize().clone();
    for (const z of [...enemies.list]) {
      if (!alive(z)) continue;
      const c = z.root.position.clone().add(new THREE.Vector3(0, 40, 0)).sub(camera.position), d = c.length();
      if (d > 280 || c.normalize().dot(forward) < .7) continue;
      enemies.hurt(z, def.damage * .15, false, false, 'explosion');
      if (!alive(z)) continue;
      pushes.push({ z, dir: flat.clone(), left: 150 * (1 - d / 340), t: .3 });
      stagger(z);
    }
    for (let i = 0; i < 12; i++) mote(camera.position.clone().addScaledVector(forward, 50), 0xd8d0c0, 14, .4, spread(forward, 1.2).multiplyScalar(500));
  }
  function stagger(z) {
    if (z.roStagger) { z.roStagger.until = now() + 1.2; return; }
    z.roStagger = { until: now() + 1.2, scale: z.rig?.mixer?.timeScale };
    if (z.speed) z.speed *= .35;
    if (z.rig?.mixer) z.rig.mixer.timeScale *= .5;
  }
  function unstagger(z) {
    const s = z.roStagger; if (!s) return; z.roStagger = null;
    if (z.speed) z.speed /= .35;
    if (z.rig?.mixer && s.scale !== undefined) z.rig.mixer.timeScale = s.scale;
  }

  // ---- effects ------------------------------------------------------------------------------------------------------------
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
    fx.push({ obj: ring, t: .3, life: .3, ring: R });
    const flash = new THREE.Sprite(glowMat(color).clone()); flash.position.copy(p); scene.add(flash);
    fx.push({ obj: flash, t: .22, life: .22, size: R * .35, grow: R * 1.3 });
  }
  function tracer(a, b, def, atts, pellet = false) {   // a bright streak from the muzzle to the impact, gone in a tenth of a second
    const color = def.upgraded ? PAP_COLOR : atts.includes('ro_tungsten') || atts.includes('ro_sabot') ? RAIL : atts.includes('ro_mark') ? MARK : 0xffc070;
    const m = new THREE.Mesh(tracerGeo, tracerMat(color)), len = a.distanceTo(b);
    m.position.copy(a); m.lookAt(b); m.scale.set(pellet ? .25 : .6, pellet ? .25 : .6, len); m.frustumCulled = false; scene.add(m);
    fx.push({ obj: m, t: .1, life: .1, line: true, shared: true });
  }
  function bolt(a, b) {
    const pts = [a.clone()], n = 7;
    for (let i = 1; i < n; i++) pts.push(a.clone().lerp(b, i / n).add(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(18)));
    pts.push(b.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: ARC, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; scene.add(line); fx.push({ obj: line, t: .22, life: .22, line: true });
    burst(b, ARC, 4, .4);
  }
  const disposeFx = f => { f.obj.removeFromParent(); f.obj.material.dispose(); if ((f.ring || f.line) && !f.shared) f.obj.geometry.dispose(); };

  // ---- the frame ----------------------------------------------------------------------------------------------------------
  host.on('update', dt => {
    if (!dt) return;
    const t = now();
    // the kick lands over ~4 frames (a shove, not a snap)
    if (kick > 1e-4) { const k = Math.min(kick, kick * Math.min(1, dt * 28) + .0005); camera.rotation.x = Math.min(1.48, camera.rotation.x + k); kick -= k; }
    const v = player?.velocity; still = v && Math.hypot(v.x, v.z) < 25 ? still + dt : 0;
    for (const q of [...queue]) if ((q.t -= dt) <= 0) { queue.splice(queue.indexOf(q), 1); blast(q.at, q.def, q.a, q.mul, { bomblet: true }); }
    for (const p of [...pushes]) {
      p.t -= dt;
      if (alive(p.z)) {
        const step = Math.min(p.left, p.left * dt / Math.max(dt, p.t + dt));
        const from = tmp2.copy(p.z.root.position).add(tmp.set(0, 35, 0));
        if (world.lineClear(from, from.clone().addScaledVector(p.dir, step + 12))) p.z.root.position.addScaledVector(p.dir, step);
        p.left -= step;
      }
      if (p.t <= 0 || p.left <= .5) pushes.splice(pushes.indexOf(p), 1);
    }
    for (const p of [...pools]) {   // thermite: burning ground
      p.t -= dt; p.tickT -= dt;
      if (Math.random() < dt * 30) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * p.R; mote(p.at.clone().add(tmp.set(Math.cos(a) * rr, 4, Math.sin(a) * rr)), FIRE, 9 + Math.random() * 9, .5, new THREE.Vector3(0, 60 + Math.random() * 60, 0)); }
      if (p.tickT <= 0) {
        p.tickT = .25;
        for (const z of [...enemies.list]) if (alive(z) && z.root.position.distanceTo(p.at) < p.R && Math.abs(z.root.position.y - p.at.y) < 60) enemies.hurt(z, p.dps * .25, false, false, 'fire');
        if (!session.perks?.has('specialty_flakjacket') && camera.position.distanceTo(p.at) < p.R * .8 && Math.abs((player?.position?.y ?? camera.position.y - 60) - p.at.y) < 40) api.damage?.(5);
      }
      if (p.t <= 0) pools.splice(pools.indexOf(p), 1);
    }
    for (const z of [...enemies.list, ...(enemies.dead ?? [])]) {
      if (z.roStagger && (!alive(z) || z.roStagger.until <= t)) unstagger(z);
      if (z.roMarkSprite && (!alive(z) || !(z.roMark > t))) { z.roMarkSprite.removeFromParent(); z.roMarkSprite = null; }
      else if (z.roMarkSprite) z.roMarkSprite.material.opacity = .6 + .3 * Math.sin(t * 9);
    }
    for (const f of [...fx]) {
      f.t -= dt; const u = Math.max(0, f.t / f.life);
      if (f.vel) { f.obj.position.addScaledVector(f.vel, dt); f.vel.y -= 300 * dt; }
      if (f.ring) { f.obj.scale.setScalar(f.ring * (1 - u * u) + 4); f.obj.material.opacity = .9 * u; }
      else if (f.line) f.obj.material.opacity = u;
      else if (f.grow) { f.obj.scale.setScalar(f.size + f.grow * (1 - u)); f.obj.material.opacity = u; }
      else { f.obj.material.opacity = .6 * u; f.obj.scale.setScalar(f.size * (u * .7 + .3)); }
      if (f.t <= 0) { disposeFx(f); fx.splice(fx.indexOf(f), 1); }
    }
  });
  host.on('reset', () => {
    for (const f of fx) disposeFx(f);
    for (const z of [...enemies.list, ...(enemies.dead ?? [])]) { unstagger(z); if (z.roMarkSprite) { z.roMarkSprite.removeFromParent(); z.roMarkSprite = null; } z.roMark = 0; }
    fx.length = pools.length = queue.length = pushes.length = 0; kick = 0;
  });

  window.kino.roc = { fx, pools, queue, pushes, blast, kickFor, get kick() { return kick; } };   // for tests
}
