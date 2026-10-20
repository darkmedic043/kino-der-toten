// The Siren (siren_zm): BO7's charge energy weapon. "Fires a high damage, slow moving projectile that passes through
// foes. Charging improves projectile velocity." Built by .tools/build-siren.py + .tools/assemble-grimhawk.mjs --gun siren
// on the M16's skeleton (its animations drive it). Hold fire to charge, release to fire: the orb passes through every
// zombie in its path (each takes the full hit once, no falloff) and shatters on the first wall. A tap fires it at
// walking pace; a full charge at about three times that. Everything here is our own: the model, the orb and its sounds
// (synthesised with WebAudio).
//
// Attachments (weapon-levels attachments.json, ids sr_*; the shared grip and laser are plain stat/visual ones):
//   sr_deflect   MFS Deflection Core (BO7's Prestige mag): ricochets off walls, and from each zombie it hits on to the
//                nearest one it can see (straight on through when there's none),
//                +50% velocity, 9 rounds, slower fire, about 48 m of travel
//   sr_overclock Overclock Cell: full charge in half the time, 4 rounds
//   sr_resonance Resonance Chamber (the user's idea): charging makes the orb bigger instead of faster
//   sr_baffle    Hush Baffle: suppressed, the wail muted
//   sr_echo      Echo Rounds: a full-charge shot sends a ghost echo down the same path 0.4 s later, at half damage
//   sr_lancet    Lancet Tear Grip (BO7): charges 15% faster and holds the charge while sprinting
//   sr_soma      Soma-81 Grip (BO7): +6% movement speed with the Siren in hand
// Pack-a-Punched (Gaze of Circe): zombies the orb passes through and doesn't kill are entranced (held still) for 2 s,
// and a fully charged orb that shatters sings: zombies near it walk to the spot for 3 s.
import * as THREE from 'three';

const BASE = new URL('./', import.meta.url).href;
export const SIREN = 'siren_zm';
const ATTACHMENT_TAGS = ['tag_sr_reflex', 'tag_sr_deflect', 'tag_sr_overclock', 'tag_sr_resonance', 'tag_sr_baffle', 'tag_sr_echo',
  'tag_sr_lancet', 'tag_sr_soma', 'tag_foregrip', 'tag_laser_box'];
const SPARE_TAGS = ['tag_ext_clip', 'tag_double_clip'];   // the M16's own spare mag bones (see mod.js)
const VIEW_OFFSET = [.6, -.4, -3.2];   // pushed out from the eye like the Grimhawk's (a long gun read as huge at the M16's hip)
const CHARGE = 2, TAP = .12;                  // seconds to full charge; held less than TAP is a tap
const SLOW = 520, FAST = 1600;                // orb speed (units/s): tap, full charge (BO7: 12.7 m/s -> 38 m/s)
const LIFE = 6, RADIUS = 12, BIG = 44;        // orb life (s), hit radius, Resonance's full-charge radius
const DEFLECT_TRAVEL = 1900, DEFLECT_BOUNCES = 6, MAX = 16, AIM = [40, 58, 24];
const COLOR = 0xd9a2ff, PAP_COLOR = 0xff6fd0;

export function prepareSiren(data) {
  const m16 = data.weapons.m16_zm;
  if (!m16) { console.warn('[bo7-weapons] no M16 to build the Siren on'); return; }
  const model = BASE + 'siren_view.glb?v=1', world = BASE + 'siren_world.glb?v=1';
  const hideTags = [...ATTACHMENT_TAGS, ...SPARE_TAGS];
  const gun = Object.assign(structuredClone(m16), {
    id: SIREN, name: 'Siren', price: 1500, clipSize: 6, startAmmo: 36, maxAmmo: 66, damage: 1400, minDamage: 1400, range: 8000,
    fireTime: .4, reloadTime: 2.8, reloadEmptyTime: 3.03, headMultiplier: 1.5, hipSpread: .004, automatic: false, fireType: 'Charge', pellets: 1,
    hideTags, model, worldModel: world, adsFov: 55, siren: true, soundAs: 'm16_zm', weaponClass: 'Special', gunsmith: true, viewOffset: VIEW_OFFSET,
  });
  gun.upgrade = Object.assign(structuredClone(m16.upgrade ?? {}), {
    name: 'Gaze of Circe', clipSize: 8, startAmmo: 64, maxAmmo: 88, damage: 3500, minDamage: 3500, range: 8000, fireTime: .35,
    reloadTime: 2.4, reloadEmptyTime: 2.6, headMultiplier: 1.5, hideTags, model, worldModel: world, viewOffset: VIEW_OFFSET,
    animations: structuredClone(m16.animations), automatic: false, fireType: 'Charge', pellets: 1,
  });
  delete gun.upgrade.attachment;   // the M16's Pack-a-Punch carries an M203 grenade launcher
  for (const k of ['projectileType', 'projectileModel']) delete gun.upgrade[k];
  data.weapons[SIREN] = gun;
  data.boxPool = [...new Set([...(data.boxPool ?? []), SIREN])];
}

export function setupSiren(api) {
  const { host, session, camera, scene, world, enemies, audio, view, viewCamera, player } = api;
  const isSiren = def => (def?.baseId ?? def?.id) === SIREN;
  const atts = () => String(session.def?.attachments ?? '').split('+');
  const has = a => atts().includes(a);
  const inHand = () => isSiren(session.def) && !session.weaponUnavailable && !host.gunBlocked;
  const now = () => session.time ?? performance.now() / 1000;

  // ---- sound (synthesised): a rising wail while charging, a whoomp on release, a glassy shatter ------------------------
  const ctxOut = () => (audio.ctx && audio.master ? [audio.ctx, audio.master] : [null, null]);
  let wail = null, noiseBuf = null;
  const noise = ctx => {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noiseBuf;
  };
  function wailStart(dur, quiet) {
    const [ctx, out] = ctxOut(); if (!ctx) return; wailStop();
    const t = ctx.currentTime, g = ctx.createGain(), lp = ctx.createBiquadFilter(), a = ctx.createOscillator(), b = ctx.createOscillator();
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    a.type = 'sawtooth'; b.type = 'sine'; lp.type = 'lowpass'; lp.Q.value = 6;
    a.frequency.setValueAtTime(190, t); a.frequency.exponentialRampToValueAtTime(760, t + dur);
    b.frequency.setValueAtTime(380, t); b.frequency.exponentialRampToValueAtTime(1520, t + dur);
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + dur);
    lfo.frequency.setValueAtTime(5, t); lfo.frequency.linearRampToValueAtTime(11, t + dur); lfoG.gain.value = 14;   // the siren's warble
    lfo.connect(lfoG); lfoG.connect(a.frequency); lfoG.connect(b.frequency);
    const v = quiet ? .025 : .07;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .15); g.gain.linearRampToValueAtTime(v * 1.6, t + dur);
    a.connect(lp); b.connect(lp); lp.connect(g).connect(out);
    for (const o of [a, b, lfo]) o.start(t);
    wail = { g, oscs: [a, b, lfo], ctx };
  }
  function wailStop() {
    if (!wail) return; const { g, oscs, ctx } = wail, t = ctx.currentTime; wail = null;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + .06);
    for (const o of oscs) o.stop(t + .08);
  }
  function fullPing(quiet) {   // the charge has peaked
    const [ctx, out] = ctxOut(); if (!ctx) return; const t = ctx.currentTime;
    for (const f of [1320, 1980]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(quiet ? .03 : .08, t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
      o.connect(g).connect(out); o.start(t); o.stop(t + .4);
    }
  }
  function whoomp(k, quiet, pap) {
    const [ctx, out] = ctxOut(); if (!ctx) return; const t = ctx.currentTime, v = quiet ? .3 : 1;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(260 + 260 * k, t); o.frequency.exponentialRampToValueAtTime(48, t + .3);
    g.gain.setValueAtTime(.45 * v, t); g.gain.exponentialRampToValueAtTime(.001, t + .38); o.connect(g).connect(out); o.start(t); o.stop(t + .4);
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noise(ctx);
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(900 + 1800 * k, t); bp.frequency.exponentialRampToValueAtTime(300, t + .25); bp.Q.value = 1.2;
    ng.gain.setValueAtTime(.35 * v, t); ng.gain.exponentialRampToValueAtTime(.001, t + .25); n.connect(bp).connect(ng).connect(out); n.start(t); n.stop(t + .3);
    const s = ctx.createOscillator(), sg = ctx.createGain(); s.type = 'triangle';   // the voice in it
    s.frequency.setValueAtTime((pap ? 660 : 880) * (1 + k * .5), t); s.frequency.exponentialRampToValueAtTime(pap ? 330 : 440, t + .5);
    sg.gain.setValueAtTime(.09 * v, t); sg.gain.exponentialRampToValueAtTime(.001, t + .55); s.connect(sg).connect(out); s.start(t); s.stop(t + .6);
  }
  function shatterSound(at, big) {
    const [ctx, out] = ctxOut(); if (!ctx) return; const d = at.distanceTo(camera.position); if (d > 4000) return;
    const t = ctx.currentTime, v = Math.max(.08, 1 - d / 4000) * (big ? 1.2 : .8);
    const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noise(ctx);
    hp.type = 'highpass'; hp.frequency.value = 2400; g.gain.setValueAtTime(.3 * v, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
    n.connect(hp).connect(g).connect(out); n.start(t); n.stop(t + .35);
    for (let i = 0; i < 4; i++) {   // glassy pings
      const o = ctx.createOscillator(), og = ctx.createGain(), t0 = t + i * .025; o.frequency.value = 2200 + Math.random() * 2600;
      og.gain.setValueAtTime(.05 * v, t0); og.gain.exponentialRampToValueAtTime(.001, t0 + .25); o.connect(og).connect(out); o.start(t0); o.stop(t0 + .3);
    }
  }
  function songSound(at) {   // Gaze of Circe's lure: a falling three-note call
    const [ctx, out] = ctxOut(); if (!ctx) return; const t = ctx.currentTime, v = Math.max(.1, 1 - at.distanceTo(camera.position) / 5000);
    [784, 659, 523].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + i * .32; o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.09 * v, t0 + .05); g.gain.exponentialRampToValueAtTime(.001, t0 + .5);
      o.connect(g).connect(out); o.start(t0); o.stop(t0 + .55);
    });
  }
  let shotK = 0;   // the charge of the shot the engine is firing (its sound and the orb read it)
  const weaponSound = audio.weapon.bind(audio), m16 = def => ({ ...def, id: 'm16_zm', baseId: 'm16_zm' });
  audio.weapon = (kind, def, ...rest) => !isSiren(def) ? weaponSound(kind, def, ...rest)
    : kind === 'shot' ? whoomp(shotK, String(def.attachments ?? '').includes('sr_baffle'), !!def.upgraded) : weaponSound(kind, m16(def), ...rest);

  // ---- charging: hold fire, release to shoot --------------------------------------------------------------------
  // The engine leaves the fire button alone with the Siren in hand (host.holdFire); its edges are read from
  // view.input.fire (mouse, touch and pad alike) and the release fires through kino.debug.shoot (the engine's own shot:
  // ammo, fire clip, sound, then our fire hook launches the orb).
  const ring = document.createElement('div'); ring.id = 'siren-charge';
  ring.style.cssText = 'position:fixed;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;z-index:3;pointer-events:none;display:none';
  document.body.append(ring);
  let charge = null, was = false;
  const chargeTime = () => CHARGE * (has('sr_overclock') ? .5 : 1) * (has('sr_lancet') ? .85 : 1);
  const canCharge = () => inHand() && view?.ready && session.weapon.mag > 0 && session.phase !== 'reviving' && !(session.reloadLeft > 0) && !session.busy
    && !(session.fireLeft > 0) && !session.drinking && !(session.meleeLeft > 0) && (!view.input?.sprint || has('sr_lancet')) && !host.keepActive;
  function claimFire() {   // chained so the bows' own hold (set by a later mod, which replaces ours) still works
    if (host.holdFire?.siren) return; const prev = host.holdFire;
    const f = () => inHand() || !!prev?.(); f.siren = true; host.holdFire = f;
  }
  claimFire(); host.on('start', claimFire);
  function startCharge() { charge = { t: 0, full: false, id: session.weapon.id }; wailStart(chargeTime(), has('sr_baffle')); }
  function cancel() { charge = null; wailStop(); ring.style.display = 'none'; }
  function release() {
    const c = charge; cancel(); if (!c) return;
    shotK = c.t < TAP ? 0 : Math.min(1, c.t / chargeTime());
    if (!window.kino.debug?.shoot?.()) shotK = 0;
  }
  host.on('update', dt => {
    if (host.holdFire && !host.holdFire.siren) claimFire();
    const fire = inHand() && !!view?.input?.fire && api.getState?.().active !== false;
    if (fire && !was && inHand() && session.weapon.mag === 0 && !(session.reloadLeft > 0)) { weaponSound('empty', m16(session.def)); window.kino.debug?.reload?.(); }
    if (fire && !charge && canCharge()) startCharge();
    if (!fire && was && charge) release();
    was = fire;
    if (!charge) return;
    if (!inHand() || session.weapon.id !== charge.id || session.phase === 'reviving' || session.reloadLeft > 0 || (view.input?.sprint && !has('sr_lancet'))) { cancel(); return; }
    charge.t += dt; const k = Math.min(1, charge.t / chargeTime()), col = has('sr_resonance') ? '#5ef0ff' : session.def.upgraded ? '#ff6fd0' : '#d9a2ff';
    ring.style.display = charge.t > TAP ? 'block' : 'none';
    ring.style.background = `conic-gradient(${col} ${k * 360}deg, #ffffff22 0)`; ring.style.webkitMask = ring.style.mask = 'radial-gradient(circle, transparent 18px, #000 19px)';
    ring.style.filter = k >= 1 ? `drop-shadow(0 0 6px ${col})` : '';
    if (k >= 1 && !charge.full) { charge.full = true; fullPing(has('sr_baffle')); }
  });
  host.on('reset', () => { cancel(); was = false; for (const o of [...live]) remove(o); for (const f of fx) f.obj.removeFromParent(); fx.length = echoes.length = songs.length = 0; });

  // ---- Soma-81: a little faster on your feet with the Siren in hand (layered over the other speed getters) ---------
  for (const key of ['moveSpeed', 'sprintSpeed']) {
    if (!player) break;
    const d = Object.getOwnPropertyDescriptor(player, key); let base = player[key];
    Object.defineProperty(player, key, { configurable: true, get: () => (d?.get ? d.get() : base) * (inHand() && has('sr_soma') ? 1.06 : 1), set: v => { if (d?.set) d.set(v); else base = v; } });
  }

  // ---- the orb ---------------------------------------------------------------------------------------------------
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.75)'); gr.addColorStop(.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 18, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const coreGeo = new THREE.IcosahedronGeometry(1, 2);
  const mats = new Map();   // color -> materials (shared between orbs)
  const matsFor = color => {
    if (!mats.has(color)) mats.set(color, {
      core: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }),
      glow: new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      ring: new THREE.SpriteMaterial({ map: ringTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .8 }),
      trail: new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .5 }),
    });
    return mats.get(color);
  };
  const live = [], fx = [], tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  // the barrel on screen (the gun has its own camera): tag_flash projected out into the world, 30 ahead of the eye
  const muzzle = () => {
    const flash = view?.gun?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      flash.updateWorldMatrix(true, false); const ndc = flash.localToWorld(new THREE.Vector3()).project(viewCamera);
      const dir = new THREE.Vector3(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(dir, 30);
    }
    const right = tmp.setFromMatrixColumn(camera.matrixWorld, 0).clone(), down = tmp2.setFromMatrixColumn(camera.matrixWorld, 1).clone().negate();
    return camera.position.clone().addScaledVector(right, 3).addScaledVector(down, 2.4);
  };

  function spawnOrb({ def, from, dir, drawFrom, k, ghost = false }) {
    const a = String(def.attachments ?? '').split('+'), pap = !!def.upgraded;
    const resonance = a.includes('sr_resonance'), deflect = a.includes('sr_deflect');
    const speed = (resonance ? SLOW : SLOW + (FAST - SLOW) * k) * (deflect ? 1.5 : 1);
    const radius = resonance ? RADIUS + (BIG - RADIUS) * k : RADIUS;
    const color = resonance ? 0x5ef0ff : deflect ? 0x6cb8ff : pap ? PAP_COLOR : COLOR, m = matsFor(color);
    const obj = new THREE.Group(); obj.frustumCulled = false;
    const core = new THREE.Mesh(coreGeo, m.core); core.scale.setScalar(radius * .32); core.frustumCulled = false;
    const glow = new THREE.Sprite(m.glow); glow.scale.setScalar(radius * 3.2);
    const halo = new THREE.Sprite(m.ring.clone()); halo.scale.setScalar(radius * 2);   // its own material: each orb's ring turns on its own
    obj.add(core, glow, halo); scene.add(obj);
    if (ghost) { core.visible = false; glow.material = m.trail; }
    const o = { obj, core, glow, halo, def, pap, k, ghost, deflect, resonance, radius, color, pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(speed),
      life: LIFE, travel: 0, bounces: 0, hit: new Set(), drawFrom: (drawFrom ?? from).clone(), blend: drawFrom ? 0 : 1, trailT: 0, spin: Math.random() * 6,
      damage: def.damage * (ghost ? .5 : 1) };
    if (live.length >= MAX) remove(live[0]);
    live.push(o); return o;
  }
  function remove(o) { o.obj.removeFromParent(); o.halo.material.dispose(); const i = live.indexOf(o); if (i >= 0) live.splice(i, 1); }

  const echoes = [];
  function launch(def, forward, { ads }) {
    if (!isSiren(def)) return false;
    const dir = forward.clone();
    if (!ads) { const s = def.hipSpread ?? .004; dir.x += (Math.random() - .5) * s; dir.y += (Math.random() - .5) * s; dir.z += (Math.random() - .5) * s; dir.normalize(); }
    const k = shotK; shotK = 0;
    spawnOrb({ def, from: camera.position.clone(), dir, drawFrom: muzzle(), k });
    if (k >= 1 && String(def.attachments ?? '').split('+').includes('sr_echo')) echoes.push({ t: .4, def, from: camera.position.clone(), dir, k });
    return true;
  }
  (host.fireHooks ??= []).push(launch);

  // ---- hits: a swept sphere against each zombie's upright body ----------------------------------------------------
  const alive = z => !(z.dead || z.state === 'dead' || z.health <= 0);
  function touches(z, p, r) {
    const tall = z.kind === 'dog' ? 34 : 72, body = z.kind === 'dog' ? 12 : 15, f = z.root.position;
    const dx = p.x - f.x, dz = p.z - f.z, dy = p.y < f.y ? f.y - p.y : p.y > f.y + tall ? p.y - f.y - tall : 0;
    return dx * dx + dz * dz + dy * dy < (r + body) ** 2;
  }
  function headOf(z, p, r) {
    const h = enemies.headPosition?.(z) ?? tmp2.copy(z.root.position).add(new THREE.Vector3(0, z.kind === 'dog' ? 28 : 63, 0));
    return h.distanceTo(p) < Math.max(9, r * .55);
  }
  // entrance (Gaze of Circe): the zombie holds still, swaying, for a moment; the song: zombies walk to the shatter
  const songs = [];
  const lure = enemies.lureTarget?.bind(enemies);
  enemies.lureTarget = z => {
    if (z.siren?.until > now()) return z.root.position;   // entranced: stays put and can't attack
    if (z.kind !== 'dog') for (const s of songs) if (s.until > now() && z.root.position.distanceTo(s.at) < 700) return s.at;
    return lure ? lure(z) : null;
  };
  function entrance(z) {
    const s = (z.siren ??= {}); s.until = now() + 2;
    if (z.rig?.mixer) { s.scale ??= z.rig.mixer.timeScale; z.rig.mixer.timeScale = .15; }
  }
  function strike(o, z, p) {
    o.hit.add(z);
    const head = headOf(z, p, o.radius), before = z.health;
    enemies.hurt(z, o.damage * (head ? Math.max(1, o.def.headMultiplier ?? 1) : 1), head, false, 'bullet');
    if (o.pap && alive(z) && z.health > 0 && z.health <= before) entrance(z);
    burst(p, o.color, 5, .5);
  }

  // ---- effects: a trail of fading motes, the shatter burst --------------------------------------------------------
  function mote(p, color, size, t, vel) {
    const s = new THREE.Sprite(matsFor(color).trail.clone()); s.position.copy(p); s.scale.setScalar(size); scene.add(s);
    fx.push({ obj: s, t, life: t, size, vel: vel ?? null, grow: 0 }); if (fx.length > 260) { const f = fx.shift(); f.obj.removeFromParent(); f.obj.material.dispose(); }
  }
  function burst(p, color, n, scale = 1) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - .5, Math.random() - .2, Math.random() - .5).normalize().multiplyScalar((120 + Math.random() * 260) * scale);
      mote(p, color, (4 + Math.random() * 5) * scale, .45 + Math.random() * .3, v);
    }
  }
  function shatter(o, p) {
    burst(p, o.color, o.ghost ? 6 : 16, Math.max(.8, o.radius / RADIUS * .7));
    const flash = new THREE.Sprite(matsFor(o.color).glow.clone()); flash.position.copy(p); flash.scale.setScalar(o.radius * 3); scene.add(flash);
    fx.push({ obj: flash, t: .3, life: .3, size: o.radius * 3, grow: o.radius * 18 });
    if (!o.ghost) shatterSound(p, o.k >= 1 || o.resonance);
    if (o.pap && o.k >= 1 && !o.ghost) { songs.push({ at: p.clone(), until: now() + 3 }); songSound(p); burst(p, PAP_COLOR, 10, 1.4); }
    remove(o);
  }

  host.on('update', dt => {
    if (!dt) return;
    for (const e of [...echoes]) if ((e.t -= dt) <= 0) {
      echoes.splice(echoes.indexOf(e), 1);
      if (session.weapon && isSiren(session.def)) spawnOrb({ def: e.def, from: e.from, dir: e.dir, k: e.k, ghost: true });
    }
    for (let i = songs.length - 1; i >= 0; i--) if (songs[i].until <= now()) songs.splice(i, 1);
    // entranced zombies wake
    for (const z of enemies.list) if (z.siren?.until && z.siren.until <= now()) {
      if (z.rig?.mixer && z.siren.scale !== undefined && z.rig.mixer.timeScale === .15) z.rig.mixer.timeScale = z.siren.scale;
      z.siren = null;
    }
    for (const o of [...live]) {
      o.life -= dt;
      const step = o.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().divideScalar(len || 1);
      const wall = world.raycast(new THREE.Ray(o.pos.clone(), dir), 0, len + o.radius * .25);
      const span = wall ? Math.max(0, wall.distance - o.radius * .25) : len;
      // sweep the path to the wall (or the whole step) for zombies
      const n = Math.max(1, Math.ceil(span / Math.max(4, o.radius * .5)));
      let bounced = false;
      for (let s = 1; s <= n && !bounced; s++) {
        const p = tmp.copy(o.pos).addScaledVector(dir, span * s / n);
        for (const z of enemies.list) {
          if (o.hit.has(z) || !alive(z) || !touches(z, p, o.radius)) continue;
          strike(o, z, p);
          if (o.deflect) {   // ricochet off toward the nearest zombie it can see (chest, head or waist), else carry on
            const pick = enemies.list.filter(q => q !== z && !o.hit.has(q) && alive(q)).map(q => ({ q, d: q.root.position.distanceTo(p) }))
              .filter(({ d }) => d < 900).sort((a, b) => a.d - b.d)
              .map(({ q }) => AIM.map(h => q.root.position.clone().setY(q.root.position.y + (q.kind === 'dog' ? h * .45 : h))).find(t => world.lineClear(p, t))).find(Boolean);
            if (!pick) continue;
            const sp = o.vel.length(); o.vel.copy(pick).sub(p).normalize().multiplyScalar(sp);
            o.pos.copy(p); o.travel += span * s / n; o.bounces++; bounced = true; break;
          }
        }
      }
      if (bounced) { if (o.bounces > DEFLECT_BOUNCES) shatter(o, o.pos); continue; }
      if (wall) {
        const at = o.pos.clone().addScaledVector(dir, span);
        if (o.deflect && o.bounces < DEFLECT_BOUNCES) {   // off the wall
          const nrm = wall.triangle?.getNormal?.(new THREE.Vector3()) ?? dir.clone().negate();
          if (nrm.dot(dir) > 0) nrm.negate();
          o.vel.reflect(nrm); o.pos.copy(at).addScaledVector(nrm, 1.5); o.travel += span; o.bounces++; burst(at, o.color, 4, .5);
          continue;
        }
        shatter(o, at); continue;
      }
      o.pos.add(step); o.travel += len;
      if (o.life <= 0 || (o.deflect && o.travel > DEFLECT_TRAVEL)) { shatter(o, o.pos); continue; }
      // drawn: eased from the muzzle onto the real path over the first metre or so
      o.blend = Math.min(1, o.blend + dt * 5);
      o.drawFrom.add(step); o.obj.position.copy(o.drawFrom).lerp(o.pos, o.blend);
      o.spin += dt * (3 + o.k * 6); o.halo.material.rotation = o.spin;
      const pulse = 1 + .12 * Math.sin(o.spin * 3); o.glow.scale.setScalar(o.radius * 3.2 * pulse);
      // kept to about a quarter of the view while it's still near the eye (a big Resonance orb whited out the screen)
      const near = Math.min(1, camera.position.distanceTo(o.obj.position) * .45 / (o.radius * 1.6)); o.obj.scale.setScalar(near);
      if ((o.trailT -= dt) <= 0) { o.trailT = .025; mote(o.obj.position, o.color, o.radius * (o.ghost ? 1.2 : 1.6) * near, .35); }
    }
    for (const f of [...fx]) {
      f.t -= dt; const u = Math.max(0, f.t / f.life);
      if (f.vel) { f.obj.position.addScaledVector(f.vel, dt); f.vel.y -= 300 * dt; }
      f.obj.material.opacity = (f.grow ? 1 : .5) * u; f.obj.scale.setScalar(f.size * (f.grow ? 1 : u * .7 + .3) + (f.grow ? f.grow * (1 - u) * .1 : 0));
      if (f.t <= 0) { f.obj.removeFromParent(); f.obj.material.dispose(); fx.splice(fx.indexOf(f), 1); }
    }
  });

  window.kino.siren = { live, fx, songs, get charge() { return charge; }, chargeTime, spawn: spawnOrb };   // for tests
}
