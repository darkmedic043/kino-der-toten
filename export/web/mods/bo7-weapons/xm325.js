// The XM325 (xm325_zm): BO7's belt-fed Rist Rauch LMG (1000 rounds a minute, a 60-round belt in a hard box).
// Built by .tools/build-xm325.py + .tools/assemble-grimhawk.mjs --gun xm325 on the HK21's skeleton (its animations
// drive it; the shot and reload are the HK21's). Its Titan Wield conversion swaps in a pair built on the CZ75 Dual
// Wield's skeletons (--gun xm325_rh / xm325_lh) and the CZ75 DW's animations: the engine's dualWield alternates the
// hands and blocks aiming. Light machine gun class, from the Mystery Box.
//
// Attachments (weapon-levels attachments.json, ids xm_*; muzzles, barrels, the grip and the stock replace the gun's
// own tag_xm_muzzle / _barrel / _grip / _stock; belts replace the box on tag_clip):
//   xm_comp / xm_sup        RL-7.62 Compensator (less kick) / Monolithic Suppressor
//   xm_chief / xm_fractal   R-556 Chief / Fractal-LRB barrels (range, less kick)
//   xm_cryo                 custom Cryo Shroud (barrel): heat builds 35% slower and every hit chills the zombie
//   xm_vas, xm_mfs, xm_reflex, xm_lucius, xm_aegis   foregrip, side laser, reflex optic, rear grip, stock
//   xm_fastbelt / xm_extbelt   50 / 85-round belts
//   xm_overpressured, xm_ars   stat-only ammo (damage and range; 20% faster fire, more kick and heat)
//   xm_thermal              custom Thermal Feedback (ammo): damage climbs with barrel heat, up to +50%
//   xm_leyden               Leyden Spark Belt Fed (BO7's prestige belt, the overheat mag, an early unlock): a 500-round
//                           canister under the handguard fed from the reserve, no reloads, overheats after ~55 rounds of
//                           sustained fire (1.9 s lockout), its heat coils glowing as it heats; custom: the overheat
//                           discharges as lightning chaining through up to six zombies
//   xm_titan                Titan Wield (stock slot; excludes the underbarrel and mag slots): a second gun in the
//                           left hand, hip only, 2 x 500-round belts fed from the reserve, 25% slower and 40% weaker per
//                           gun, overheats after ~50 rounds a gun
// Heat: every shot adds 1/N of the meter (N = the overheat count), it cools after a quarter second off the trigger.
// Only the Leyden and Titan belts lock up when it fills; with Thermal Feedback the meter is shown on any belt.
// Pack-a-Punched: Ephialtes (Ephialtes & Otus with Titan Wield): harder rounds, a 90-round belt, 25% more heat headroom.
import * as THREE from 'three';

const BASE = new URL('./', import.meta.url).href;
export const XM325 = 'xm325_zm';
const ATTACHMENT_TAGS = ['tag_xm_comp', 'tag_xm_sup', 'tag_xm_chief', 'tag_xm_fractal', 'tag_xm_cryo', 'tag_xm_vas', 'tag_xm_mfs',
  'tag_xm_reflex', 'tag_xm_lucius', 'tag_xm_aegis', 'tag_xm_fastbelt', 'tag_xm_extbelt', 'tag_xm_leyden', 'tag_xm_titan'];
const STAT = ['xm_overpressured', 'xm_ars', 'xm_thermal'];   // ammo with no model
const MIRROR = [...ATTACHMENT_TAGS, 'tag_xm_muzzle', 'tag_xm_barrel', 'tag_xm_grip', 'tag_iron_sight'];   // shown/hidden on both Titan guns
const VIEW_OFFSET = [.8, -.9, -5];   // a long gun: pushed out from the eye like the ROC's
const DUAL_OFFSET = [0, -3.4, -8];   // Titan Wield: the CZ75 pair's pistol grips put each LMG's rear at the eye; held forward at the hips instead
const V = 4;   // model version (?v=)
const KICK = .0045, COOL_DELAY = .25, COOL = .65;   // camera pitch per shot (rad); heat cools after COOL_DELAY s at COOL per second
const ARC = 0x8fd0ff, FROST = 0xbfe8ff, PAP_ARC = 0xd88bff;
// the fields Titan Wield swaps for the CZ75 Dual Wield's (models, animations, handling)
// (not the aim fields: dualWield blocks aiming)
const DUAL_KEYS = ['model', 'leftModel', 'animations', 'leftAnimations', 'dualWield', 'sprintOffset', 'sprintRotation', 'raiseTime', 'dropTime', 'sprintInTime', 'sprintLoopTime', 'sprintOutTime', 'viewOffset', 'notetrackSounds'];

export function prepareXm325(data) {
  const hk = data.weapons.hk21_zm, cz = data.weapons.cz75dw_zm;
  if (!hk) { console.warn('[bo7-weapons] no HK21 to build the XM325 on'); return; }
  const model = BASE + `xm325_view.glb?v=${V}`, world = BASE + `xm325_world.glb?v=${V}`;
  const common = { hideTags: [...ATTACHMENT_TAGS], model, worldModel: world, viewOffset: VIEW_OFFSET, weight: 1.6, automatic: true,
    fireType: 'Full Auto', pellets: 1, hipSpread: .02, headMultiplier: 2.5, statAttachments: STAT, adsFov: 52, adsInTime: .39, adsOutTime: .3 };
  const gun = Object.assign(structuredClone(hk), common, {
    id: XM325, name: 'XM325', price: 1500, clipSize: 60, startAmmo: 360, maxAmmo: 600, damage: 140, minDamage: 100, range: 1400,
    fireTime: .06, reloadTime: 4.4, reloadEmptyTime: 5.2, soundAs: 'hk21_zm', weaponClass: 'Light machine gun', gunsmith: true, xm325: true,
  });
  gun.upgrade = Object.assign(structuredClone(hk.upgrade ?? {}), common, {
    name: 'Ephialtes', clipSize: 90, startAmmo: 720, maxAmmo: 900, damage: 260, minDamage: 190, range: 1600, fireTime: .055,
    reloadTime: 4, reloadEmptyTime: 4.8, animations: structuredClone(hk.animations),
  });
  for (const o of [gun, gun.upgrade]) for (const k of ['projectileType', 'projectileModel', 'projectileSpeed', 'attachment']) delete o[k];
  // Titan Wield's pair (setupXm325 swaps these in while it's fitted)
  if (cz) {
    const dual = { ...Object.fromEntries(DUAL_KEYS.map(k => [k, structuredClone(cz[k])])), viewOffset: DUAL_OFFSET,
      model: BASE + `xm325_dual_rh.glb?v=${V}`, leftModel: BASE + `xm325_dual_lh.glb?v=${V}`, dualWield: true };
    const single = o => Object.fromEntries(DUAL_KEYS.map(k => [k, structuredClone(o[k])]));
    Object.defineProperty(gun, 'xmLooks', { value: { single: single(gun), singleUp: single(gun.upgrade), dual }, enumerable: false });
  }
  data.weapons[XM325] = gun;
  data.boxPool = [...new Set([...(data.boxPool ?? []), XM325])];
}

export function setupXm325(api) {
  const { host, session, camera, scene, world, enemies, audio, view, viewCamera, data, features } = api;
  const gun = data.weapons[XM325];
  const isXm = def => (def?.baseId ?? def?.id) === XM325;
  const attsOf = def => String(def?.attachments ?? '').split('+');
  const now = () => session.time ?? performance.now() / 1000;
  const alive = z => !(z.dead || z.state === 'dead' || z.health <= 0) && enemies.list.includes(z);
  const inHand = () => isXm(session.def) && !session.weaponUnavailable && !host.gunBlocked;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // ---- sound: the HK21's ----------------------------------------------------------------------------------------------
  const weaponSound = audio.weapon.bind(audio);
  audio.weapon = (kind, def, ...rest) => isXm(def) ? weaponSound(kind, { ...def, id: 'hk21_zm', baseId: 'hk21_zm' }, ...rest) : weaponSound(kind, def, ...rest);
  const ctxOut = () => (audio.ctx && audio.master ? [audio.ctx, audio.master] : [null, null]);
  let noise = null;
  function hiss(gain = .5, len = 1.2, freq = 2500) {   // the overheat: a vent of high-passed noise
    const [ctx, out] = ctxOut(); if (!ctx) return;
    if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'highpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0005, t + len);
    src.connect(f).connect(g).connect(out); src.start(t, 0, len);
  }
  function zap(gain = .3) {   // the Leyden discharge: a falling sawtooth crackle
    const [ctx, out] = ctxOut(); if (!ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(60, t + .35);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0005, t + .4);
    o.connect(g).connect(out); o.start(t); o.stop(t + .45);
    hiss(.35, .25, 4000);
  }

  // ---- Titan Wield: the CZ75 Dual Wield pair in place of the single gun -------------------------------------------------
  const titanOf = def => attsOf(def).includes('xm_titan');
  let titanOn = false, reequipAt = -1;
  function syncTitan() {
    const looks = gun.xmLooks, want = !!looks && titanOf(gun);
    if (want !== titanOn) {
      titanOn = want;
      Object.assign(gun, want ? looks.dual : looks.single);
      if (gun.upgrade) Object.assign(gun.upgrade, want ? looks.dual : looks.singleUp, { name: want ? 'Ephialtes & Otus' : 'Ephialtes' });
      for (const o of [gun, gun.upgrade]) for (const k of DUAL_KEYS) if (o && o[k] === undefined) delete o[k];
    }
    // the held gun's view still the other look: load it again (once a second at most, after it finished loading;
    // wall clock, since the session clock restarts with a new game)
    if (inHand() && view?.ready && !!view.leftGun !== titanOn && performance.now() > reequipAt) { reequipAt = performance.now() + 1000; view.currentId = null; api.equipView?.(); }
  }
  syncTitan();
  // the left gun gets no hideTags of its own: copy the right gun's shown/hidden tags onto it (same bone names)
  let pairs = null, pairsFor = null;
  function mirrorLeft() {
    const r = view?.gun, l = view?.leftGun;
    if (!r || !l || !titanOn) return;
    if (pairsFor !== l) { pairsFor = l; pairs = MIRROR.map(n => [r.getObjectByName(n), l.getObjectByName(n)]).filter(([a, b]) => a && b); }
    for (const [a, b] of pairs) if (!b.scale.equals(a.scale)) { b.scale.copy(a.scale); b.updateMatrix(); }
  }

  // ---- heat -------------------------------------------------------------------------------------------------------------
  let heat = 0, lastShot = -9, lockUntil = 0, lockLen = 1, kick = 0;
  const beltFed = def => { const a = attsOf(def); return a.includes('xm_leyden') || a.includes('xm_titan'); };
  const showHeat = def => beltFed(def) || attsOf(def).includes('xm_thermal');
  function heatPerShot(def) {
    const a = attsOf(def);
    let n = a.includes('xm_titan') ? 100 : 55;   // Titan: two guns firing in turn, ~50 rounds each
    if (a.includes('xm_cryo')) n /= .65;
    if (a.includes('xm_ars')) n *= .85;
    if (def.upgraded) n /= 1.25;   // Pack-a-Punched runs hotter
    return 1 / n;
  }
  const locked = () => lockUntil > now();
  const claimFire = () => {
    if (host.holdFire?.xm) return; const prev = host.holdFire;
    // keep the earlier claimers' flags (the Siren's .siren), or each would wrap the other again every frame
    const f = () => (inHand() && locked()) || !!prev?.(); Object.assign(f, prev, { xm: true }); host.holdFire = f;
  };
  claimFire();
  function kickFor(def, ads) {
    const a = attsOf(def);
    let k = KICK * (ads ? .6 : 1);
    if (a.includes('xm_comp')) k *= .75;
    if (a.includes('xm_sup')) k *= .9;
    if (a.includes('xm_vas')) k *= .75;
    if (a.includes('xm_fractal')) k *= .85;
    if (a.includes('xm_aegis')) k *= .6;
    if (a.includes('xm_ars')) k *= 1.2;
    if (a.includes('xm_titan')) k *= .8;   // two guns' kick, in turn, each lighter
    return k;
  }
  host.on('shot', e => {
    if (!isXm(e.def)) return;
    const t = now();
    lastShot = t;
    kick += kickFor(e.def, !!view?.aim && !e.def.dualWield && view.aim > .5);
    heat = Math.min(1, heat + heatPerShot(e.def));
    if (heat >= 1 && beltFed(e.def) && !locked()) overheat(e.def);
  });
  function overheat(def) {
    const a = attsOf(def);
    lockLen = a.includes('xm_titan') ? 1.6 : 1.9;
    lockUntil = now() + lockLen;
    hiss(.45, lockLen * .8);
    if (a.includes('xm_leyden')) discharge(def);
  }

  // ---- Leyden discharge: lightning from the muzzle through up to six zombies ------------------------------------------
  const muzzle = () => {
    const flash = view?.gun?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      flash.updateWorldMatrix(true, false); const ndc = flash.localToWorld(new THREE.Vector3()).project(viewCamera);
      const dir = new THREE.Vector3(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(dir, 30);
    }
    return camera.position.clone().addScaledVector(camera.getWorldDirection(tmp), 30);
  };
  function discharge(def) {
    const color = def.upgraded ? PAP_ARC : ARC, dmg = def.damage * (def.upgraded ? 10 : 8);
    let from = muzzle(); const done = new Set();
    for (let i = 0; i < 6; i++) {
      const next = enemies.list.filter(z => alive(z) && !done.has(z)).map(z => ({ z, d: z.root.position.distanceTo(from) }))
        .filter(({ d }) => d < (i ? 320 : 520)).sort((x, y) => x.d - y.d).find(({ z }) => world.lineClear(from, tmp2.copy(z.root.position).add(tmp.set(0, 40, 0))));
      if (!next) break;
      const to = next.z.root.position.clone().add(tmp.set(0, 42, 0));
      bolt(from, to, color); done.add(next.z); enemies.hurt(next.z, dmg, false, false, 'explosion'); from = to;
    }
    if (!done.size) for (let i = 0; i < 3; i++) bolt(from, from.clone().add(tmp.set(Math.random() - .5, Math.random() - .2, Math.random() - .5).normalize().multiplyScalar(60)), color);
    features?.effect?.(muzzle(), color, 10);
    zap(.3);
  }

  // ---- damage: Thermal Feedback, and the Cryo Shroud's chill -----------------------------------------------------------
  const hurt = enemies.hurt.bind(enemies);
  enemies.hurt = (z, damage, head, ...rest) => {
    if (rest[1] === 'bullet' && inHand()) {
      const a = attsOf(session.def);
      if (a.includes('xm_thermal')) damage *= 1 + .5 * heat;
      if (a.includes('xm_cryo') && z && alive(z)) chill(z);
    }
    return hurt(z, damage, head, ...rest);
  };
  const frosted = new Set();
  function chill(z) {   // every hit slows a little more (to 25% speed), wearing off 2 s after the last
    const c = z.xmChill ??= { k: 1, until: 0, scale: z.rig?.mixer?.timeScale };
    setChill(z, Math.max(.25, c.k - .1));
    c.until = now() + 2;
    frosted.add(z);
  }
  function setChill(z, k) {
    const c = z.xmChill; if (!c || k === c.k) return;
    if (z.speed) z.speed *= k / c.k;
    if (z.rig?.mixer && c.scale !== undefined) z.rig.mixer.timeScale = c.scale * k;
    c.k = k;
  }
  function thaw(z) { setChill(z, 1); z.xmChill = null; frosted.delete(z); }

  // ---- HUD: the heat bar under the crosshair ----------------------------------------------------------------------------
  const bar = document.createElement('div'); bar.id = 'xm325-heat';
  bar.style.cssText = 'position:fixed;left:50%;top:calc(50% + 46px);width:110px;height:6px;margin-left:-55px;z-index:3;pointer-events:none;display:none;background:#0008;border:1px solid #ffffff30';
  const fill = document.createElement('i'); fill.style.cssText = 'display:block;height:100%;width:0';
  const label = document.createElement('b'); label.textContent = 'OVERHEAT';
  label.style.cssText = 'position:absolute;left:0;right:0;top:9px;text-align:center;font:700 10px/1 system-ui,sans-serif;letter-spacing:3px;color:#ff5a3a;display:none;text-shadow:0 0 6px #ff3a1a';
  bar.append(fill, label); document.body.append(bar);
  function hud() {
    const def = session.def, on = inHand() && showHeat(def) && session.phase !== 'gameover' && (heat > .01 || locked());
    bar.style.display = on ? 'block' : 'none'; if (!on) return;
    const lock = locked(), u = lock ? (lockUntil - now()) / lockLen : heat;
    const hot = Math.min(1, u / .85);
    fill.style.width = (u * 100).toFixed(1) + '%';
    fill.style.background = lock ? (Math.floor(now() * 8) % 2 ? '#ff3a1a' : '#ff8a3a') : `hsl(${(45 - 45 * hot).toFixed(0)},100%,${(55 + 10 * hot).toFixed(0)}%)`;
    fill.style.boxShadow = hot > .7 || lock ? '0 0 8px #ff5a1a' : '';
    label.style.display = lock ? 'block' : 'none';
  }

  // ---- fx ------------------------------------------------------------------------------------------------------------
  const fx = [];
  function bolt(a, b, color) {
    const pts = [a.clone()], n = 8;
    for (let i = 1; i < n; i++) pts.push(a.clone().lerp(b, i / n).add(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(20)));
    pts.push(b.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; scene.add(line); fx.push({ obj: line, t: .3, life: .3 });
  }
  const disposeFx = f => { f.obj.removeFromParent(); f.obj.material.dispose(); if (!f.vel) f.obj.geometry.dispose(); };   // sprites (motes) share three's geometry
  host.warmObjects?.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]),
    new THREE.LineBasicMaterial({ color: ARC, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));

  // belt feeds (Leyden, Titan): the mag is kept full from the reserve, so it never needs a reload
  function feed() {
    for (const w of session.inventory ?? []) {
      if (w.id !== XM325) continue;
      const d = w.upgraded ? { ...gun, ...gun.upgrade } : gun;
      if (!beltFed(d) || (w === session.weapon && session.reloadLeft > 0)) continue;
      const n = Math.min(d.clipSize - w.mag, w.reserve);
      if (n > 0) { w.mag += n; w.reserve -= n; }
    }
  }

  host.on('update', dt => {
    if (!dt) return;
    const t = now();
    syncTitan(); mirrorLeft(); feed();
    if (host.holdFire && !host.holdFire.xm) claimFire();
    if (locked()) heat = Math.max(0, (lockUntil - t) / lockLen);
    else if (t - lastShot > COOL_DELAY) heat = Math.max(0, heat - COOL * dt * (attsOf(session.def).includes('xm_cryo') ? 1.3 : 1));
    if (kick > 1e-5) { const k = Math.min(kick, kick * Math.min(1, dt * 30) + .0002); camera.rotation.x = Math.min(1.48, camera.rotation.x + k); kick -= k; }
    for (const z of [...frosted]) {
      if (!alive(z) || z.xmChill?.until <= t) thaw(z);
      else if (Math.random() < dt * 4) mote(z.root.position.clone().add(tmp.set((Math.random() - .5) * 30, 20 + Math.random() * 50, (Math.random() - .5) * 30)));
    }
    for (const f of [...fx]) {
      f.t -= dt; const u = Math.max(0, f.t / f.life);
      if (f.vel) { f.obj.position.addScaledVector(f.vel, dt); f.obj.material.opacity = .7 * u; }
      else f.obj.material.opacity = u;
      if (f.t <= 0) { disposeFx(f); fx.splice(fx.indexOf(f), 1); }
    }
    hud(); glow();
  });
  // the Leyden and Titan canisters' heat coils (material xm_heat_glow) glow with the meter and flicker while locked
  let glowGun = null, glowLeft = null, glowMats = [];
  function glow() {
    const g = view?.gun, l = view?.leftGun;
    if (g !== glowGun || l !== glowLeft) {
      glowGun = g; glowLeft = l; glowMats = [];
      for (const root of [g, l]) root?.traverse(o => { for (const m of [o.material].flat()) if (m?.name?.startsWith('xm_heat_glow') && !glowMats.includes(m)) glowMats.push(m); });
    }
    if (!glowMats.length) return;
    const v = !isXm(session.def) ? 0 : locked() ? .7 + .3 * Math.random() : heat;
    for (const m of glowMats) m.emissiveIntensity = .15 + 7 * v * v;
  }
  // frost motes rising off chilled zombies
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, '#fff'); gr.addColorStop(.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const frostMat = new THREE.SpriteMaterial({ map: glowTex, color: FROST, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  host.warmObjects?.push(new THREE.Sprite(frostMat));
  function mote(p) {
    const s = new THREE.Sprite(frostMat.clone()); s.position.copy(p); s.scale.setScalar(5 + Math.random() * 4); scene.add(s);
    fx.push({ obj: s, t: .7, life: .7, vel: new THREE.Vector3(0, 40, 0) });
  }
  host.on('reset', () => {
    for (const f of fx) disposeFx(f);
    fx.length = 0;
    for (const z of [...frosted]) thaw(z);
    heat = 0; lockUntil = 0; kick = 0;
    bar.style.display = 'none';
  });

  window.kino.xm325 = { get heat() { return heat; }, get locked() { return locked(); }, get titan() { return titanOn; }, heatPerShot, kickFor, discharge, syncTitan };   // for tests
}
