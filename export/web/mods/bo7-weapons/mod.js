// Black Ops 7 weapons, rebuilt from scratch for Melon Zombies (own models, nothing ripped): each gun is modelled in
// Blender in a BO1 gun's own gun space and skinned to that gun's skeleton, so the BO1 animations drive it.
//
// Grimhawk (grimhawk_zm): BO7's Special-class rifle. "Full-auto specialized rifle. Fires low-velocity homing rounds
// that lock onto targets." Built by .tools/build-grimhawk.py + .tools/assemble-grimhawk.mjs on the M16's skeleton
// (the M16's animations, timings and handling). Its 25-round flechette magazine fires real projectiles instead of
// the engine's hit-scan (engine `mods.fireHooks`):
//   - slow (SPEED) and dropping fast (DROP), so long shots need holding over
//   - aimed shots home: a round steers (TURN rad/s) toward the zombie nearest its flight line inside a CONE ahead
//     of it; BO7's base Grimhawk only homes when aimed down sights (its Long Barrel moves that to hip fire)
//   - Pack-a-Punched (the Grim Reaper): faster rounds that home from the hip as well, and harder hits
// Shots: the Grimhawk's own (see the sound section); the G11's as a fallback.
import * as THREE from 'three';

const BASE = new URL('./', import.meta.url).href;
const ID = 'grimhawk_zm';
// every attachment part, hidden until fitted (weapon-levels attachments.json: gh_rangefinder, gh_expanse, gh_hawkeye,
// gh_longbarrel, and the shared suppressor, grip and laser)
const ATTACHMENT_TAGS = ['tag_gh_rangefinder', 'tag_gh_hawkeye', 'tag_gh_expanse', 'tag_suppressor', 'tag_gh_longbarrel', 'tag_foregrip', 'tag_laser_box'];
// The M16 skeleton's own extended / dual mag bones (no Grimhawk meshes on them) must be hidden too: weapon-levels' mag
// follow takes a visible one for a built-in mag and drove the Expanse drum from it (a bone the reload never moves).
const SPARE_TAGS = ['tag_ext_clip', 'tag_double_clip'];
// At the hip it sat as close as the BO1 M16 and read as huge (a long, bulky gun): pushed 3 units away from the eye
// along the view camera's axis (-z), nudged right and down (ViewWeapon's def.viewOffset; gone in ADS).
const VIEW_OFFSET = [.6, -.4, -3];
const SPEED = 2600, DROP = 520, LIFE = 2.2, TURN = 3.2, CONE = Math.cos(THREE.MathUtils.degToRad(16)), REACH = 1800, MAX = 60;

export function prepare(data) {
  const m16 = data.weapons.m16_zm;
  if (!m16) { console.warn('[bo7-weapons] no M16 to build the Grimhawk on'); return; }
  const model = BASE + 'grimhawk_view.glb?v=13', world = BASE + 'grimhawk_world.glb?v=13';   // own models (not under models/: Rind installs them)
  const base = structuredClone(m16);
  const gun = Object.assign(base, {
    id: ID, name: 'Grimhawk', price: 1500, clipSize: 25, startAmmo: 125, maxAmmo: 225,
    damage: 190, minDamage: 150, range: 3000, fireTime: .094,   // 0.092-0.096 s between shots in BO7 footage headMultiplier: 3.5, hipSpread: .016,
    automatic: true, fireType: 'Full Auto', pellets: 1, hideTags: [...ATTACHMENT_TAGS, ...SPARE_TAGS], model, worldModel: world, adsFov: 48,
    flechette: true, soundAs: 'g11_lps_zm', weaponClass: 'Special', gunsmith: true, viewOffset: VIEW_OFFSET,   // gunsmith: camos, though it has no attachments yet   // BO7's Specials class (the loadout's SPECIALS tab)
  });
  gun.upgrade = Object.assign(structuredClone(m16.upgrade ?? {}), {
    name: 'Grim Reaper', clipSize: 35, startAmmo: 280, maxAmmo: 280, damage: 340, minDamage: 260, range: 3600, fireTime: .08,
    headMultiplier: 4, hideTags: [...ATTACHMENT_TAGS, ...SPARE_TAGS], model, worldModel: world, viewOffset: VIEW_OFFSET, animations: structuredClone(m16.animations), automatic: true, fireType: 'Full Auto', pellets: 1,
  });
  delete gun.upgrade.attachment;   // the M16's Pack-a-Punch carries an M203 grenade launcher (the Skullcrusher's); not the Grim Reaper's
  for (const k of ['projectileType', 'projectileModel']) delete gun.upgrade[k];
  data.weapons[ID] = gun;
  data.boxPool = [...new Set([...(data.boxPool ?? []), ID])];
}

export default function setup(api) {
  const { host, session, camera, scene, world, enemies, audio, data, view, viewCamera } = api;
  if (!data.weapons[ID]) return;
  const isGrim = def => (def?.baseId ?? def?.id) === ID;

  // ---- sound: the Grimhawk's own shot (three takes cut from BO7 gameplay footage into audio/, git-ignored: not
  // ours to redistribute), one at random with a little pitch spread, each fading the last one's tail; without them,
  // and for the dry fire, the G11's.
  const weaponSound = audio.weapon.bind(audio), g11 = def => ({ ...def, id: def.soundAs ?? 'g11_lps_zm', baseId: def.soundAs ?? 'g11_lps_zm' });
  const SHOTS = [1, 2, 3].map(i => BASE + `audio/grimhawk_shot_${i}.ogg`), buffers = new Map();
  const load = url => { if (!audio.ctx) return Promise.resolve(null); if (!buffers.has(url)) buffers.set(url, fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && audio.ctx?.decodeAudioData(b)).catch(() => null)); return buffers.get(url); };
  let prev = null;
  async function shot(def) {
    const ctx = audio.ctx, out = audio.master; if (!ctx || !out) return weaponSound('shot', g11(def));
    const b = await load(SHOTS[Math.floor(Math.random() * SHOTS.length)]); if (!b) return weaponSound('shot', g11(def));
    if (prev) { const g = prev.g.gain; g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(g.value, ctx.currentTime); g.linearRampToValueAtTime(0, ctx.currentTime + .06); }
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; src.playbackRate.value = (def.upgraded ? .92 : 1) * (.97 + Math.random() * .06);
    g.gain.value = .5 * (.9 + Math.random() * .15); src.connect(g).connect(out); src.start(); prev = { src, g };
  }
  audio.weapon = (kind, def, ...rest) => !isGrim(def) ? weaponSound(kind, def, ...rest) : kind === 'shot' ? shot(def) : weaponSound(kind, g11(def), ...rest);
  host.on('start', () => { for (const url of SHOTS) load(url); });   // decode before the first shot (the audio context exists once the game starts)

  // ---- the P.T. Expanse drum's own reload --------------------------------------------------------------------------
  // The M16 reload's left hand grips a straight mag and goes through the fan drum, so with the Expanse fitted the reload
  // is procedural: the viewmodel plays idle, the gun cants, the left hand (movement mod's arm IK, grip kept) reaches under
  // and takes the drum's rim, the drum (tag_clip; weapon-levels drives the fitted drum from it) swings down out of view
  // with the hand, a fresh one comes back up and is seated with a slap, and the hand returns to the handguard. Timed to
  // the reload's duration; the M16's mag out / in (and chamber, on an empty reload) sounds play at their beats.
  const drumFitted = () => session.weapon?.id === ID && String(session.def?.attachments ?? '').split('+').includes('gh_expanse');
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const seg = (u, a, b) => ease((u - a) / (b - a));
  let drum = null;
  if (view) {
    const reloadView = view.reload.bind(view);
    view.reload = (empty, duration, stage = 'magazine') => {
      if (!drumFitted() || stage !== 'magazine' || !view.ready) { drum = null; return reloadView(empty, duration, stage); }
      view.mode = 'reload'; view.aim = 0; view.rig.play('idleAnim', true, 1, .12);
      const clip = view.gun?.getObjectByName('tag_clip');
      // the arm's idle pose: the mixer doesn't rewrite these bones every frame, so the IK starts from it each frame and
      // it's put back at the end (otherwise the hand stays where the IK left it)
      const arm = ['j_shoulder_le', 'j_elbow_le'].map(n => view.root.getObjectByName(n)).filter(Boolean).map(b => ({ b, q: b.quaternion.clone() }));
      drum = { t: 0, dur: Math.max(.6, duration), empty, clip, arm, rest: clip ? { p: clip.position.clone(), q: clip.quaternion.clone() } : null, played: new Set() };
    };
  }
  // the gun lifts muzzle-up and rolls right so the swap is in view (view-space pivot), with a little overshoot going in
  const CANT = { 'rotation.x': .4, 'rotation.z': -.25 };
  const GRIP = new THREE.Vector3(3.2, 2.6, -6.4);   // where the left wrist goes, in tag_clip space (CoD: x fwd, y left, z up): under the drum, on its left
  // the drum's path as offsets from its seat (gun space, CoD axes; r = x/y/z rotation): ripped out, flicked away, a fresh
  // one fetched from below, brought up and slammed in. The hand holds `hand` poses; the drum flies free while thrown.
  const POSE = { seat: [0, 0, 0, 0, 0, 0], rip: [1.5, 2.5, -8, .35, -.55, 0], release: [0, 6, -10, .6, -.7, 0], flick: [-.5, 9, -11, .7, -.8, 0],
    pick: [0, 4, -17, .5, -.5, 0], ready: [.5, .8, -1.6, .1, -.15, 0] };
  const T = { reach: [.08, .22], rip: [.22, .34], fly: [.34, .52], flick: [.34, .4], fetch: [.4, .54], up: [.54, .72], seat: [.72, .78], back: [.82, .95] };
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const easeOut = x => 1 - (1 - x) ** 3, backOut = x => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
  const span = (u, [a, b]) => Math.max(0, Math.min(1, (u - a) / (b - a)));
  const bump = (u, [a, b]) => { const k = span(u, [a, b]); return k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0; };
  function handPose(u) {   // where the hand carries the drum (or would)
    if (u < T.rip[0]) return POSE.seat;
    if (u < T.rip[1]) return mix(POSE.seat, POSE.rip, ease(span(u, T.rip)));
    if (u < T.flick[1]) return mix(POSE.rip, POSE.flick, easeOut(span(u, T.flick)));
    if (u < T.fetch[1]) return mix(POSE.flick, POSE.pick, ease(span(u, T.fetch)));
    if (u < T.up[1]) return mix(POSE.pick, POSE.ready, easeOut(span(u, T.up)));
    return mix(POSE.ready, POSE.seat, ease(span(u, T.seat)));
  }
  function drumPose(u) {   // the drum itself: with the hand, except while the old one is thrown
    if (u < T.fly[0] + .04 || u >= T.fly[1]) return handPose(u);
    const k = (u - T.fly[0] - .04) / (T.fly[1] - T.fly[0] - .04), r = POSE.release.concat();   // let go just after the rip
    return [r[0] - 2 * k, r[1] + 18 * k, r[2] + 10 * k - 34 * k * k, r[3] + 7 * k, r[4] - 2 * k, r[5] + 3 * k];   // tossed up and out, tumbling, then it drops
  }
  const tmpE = new THREE.Euler();
  function setClip(d, pose) {
    d.clip.position.copy(d.rest.p).add(new THREE.Vector3(pose[0], pose[1], pose[2]));
    d.clip.quaternion.copy(d.rest.q).multiply(new THREE.Quaternion().setFromEuler(tmpE.set(pose[3], pose[4], pose[5])));
  }
  function endDrum() { if (drum?.clip && drum.rest) { drum.clip.position.copy(drum.rest.p); drum.clip.quaternion.copy(drum.rest.q); } for (const a of drum?.arm ?? []) a.b.quaternion.copy(a.q); drum = null; }
  host.on('update', dt => {
    if (!drum) return;
    if (!view?.ready || !drumFitted() || (session.reloadLeft <= 0 && drum.t > .2) || session.weapon?.id !== ID) { endDrum(); return; }
    drum.t += dt; const u = Math.min(1, drum.t / drum.dur), d = drum;
    if (u >= 1) { endDrum(); return; }
    // the gun: cants in (overshooting a touch) and out; kicks when the drum is ripped out, leans as it's thrown, jolts
    // down when the new one is slammed home
    const cant = backOut(span(u, [0, .16])) * (1 - ease(span(u, [.84, 1])));
    for (const [k, v] of Object.entries(CANT)) { const [o, ax] = k.split('.'); view.pivot[o][ax] += v * cant; }
    view.pivot.rotation.x += .1 * bump(u, [.22, .36]) - .14 * bump(u, [.73, .84]);
    view.pivot.rotation.z -= .08 * bump(u, [.34, .5]); view.pivot.position.y -= .7 * bump(u, [.73, .84]);
    // sounds at the beats
    const beat = (k, at, name) => { if (u >= at && !d.played.has(k)) { d.played.add(k); view.onSound?.(name, session.def); } };
    beat('out', .28, 'sndnt#wpn_m16_mag_out'); beat('in', .75, 'sndnt#wpn_m16_mag_in');
    if (d.empty) beat('ch', .9, 'sndnt#wpn_m16_button');
    for (const a of d.arm) a.b.quaternion.copy(a.q);
    if (!d.clip || !d.rest) return;
    // the left hand: reaches the drum, rips and flicks it, fetches the new one, lets go after the seat
    const w = ease(span(u, T.reach)) * (1 - ease(span(u, T.back))), reach = window.kino.fpMotion?.reachLeft;
    setClip(d, handPose(u)); view.root.updateMatrixWorld(true);
    const target = d.clip.localToWorld(GRIP.clone());
    setClip(d, drumPose(u)); view.root.updateMatrixWorld(true);
    if (reach && w > 0) reach(target, w, false);
  });
  host.on('reset', endDrum);

  // ---- flechettes ----------------------------------------------------------------------------------------------
  const needleGeo = new THREE.CylinderGeometry(.16, .05, 7, 6).rotateX(Math.PI / 2);   // along +z
  const needleMat = new THREE.MeshBasicMaterial({ color: 0xffc46a });
  const trailMat = new THREE.LineBasicMaterial({ color: 0xffa83a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(.35, 'rgba(255,170,60,.7)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const live = [], stuck = [], tmp = new THREE.Vector3(), aimAt = new THREE.Vector3();
  // Where the barrel is on screen: the gun is drawn by its own camera (the view scene), so its muzzle (tag_flash, pushed
  // out past a fitted Long Barrel or suppressor) is projected to the screen and back out into the world, 30 ahead.
  const MUZZLE_EXTRA = { gh_longbarrel: 4, suppressor: 5.4 };
  const muzzle = def => {
    const flash = view?.gun?.getObjectByName('tag_flash');
    if (flash && viewCamera) {
      const extra = Math.max(0, ...String(def?.attachments ?? '').split('+').map(a => MUZZLE_EXTRA[a] ?? 0));
      flash.updateWorldMatrix(true, false); const ndc = flash.localToWorld(new THREE.Vector3(extra, 0, 0)).project(viewCamera);
      const dir = new THREE.Vector3(ndc.x, ndc.y, .5).unproject(camera).sub(camera.position).normalize();
      return camera.position.clone().addScaledVector(dir, 30);
    }
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), down = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).negate();
    return camera.position.clone().addScaledVector(right, 3.2).addScaledVector(down, 2.6);
  };
  function launch(def, forward, { ads }) {
    if (!isGrim(def)) return false;
    // homing: aimed shots; the Long Barrel moves it to the hip (BO7's prestige barrel); Pack-a-Punched: both
    const atts = String(def.attachments ?? '').split('+'), pap = !!def.upgraded, dir = forward.clone(), longBarrel = atts.includes('gh_longbarrel');
    const headLock = pap && ads;   // homing goes for the head only when Pack-a-Punched and aimed (user decision); else the chest
    if (!ads) { const s = (def.hipSpread ?? .016) * (session.perks.has('specialty_deadshot') ? .5 : 1); dir.x += (Math.random() - .5) * s; dir.y += (Math.random() - .5) * s; dir.z += (Math.random() - .5) * s; dir.normalize(); }
    // start at the eye so close shots still land where the crosshair is; drawn from the muzzle
    const mesh = new THREE.Mesh(needleGeo, needleMat); mesh.frustumCulled = false;
    const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(5); glow.position.z = 3.5; mesh.add(glow);   // a hot tip, so rounds read in flight
    const from = muzzle(def), trailGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, () => from.clone()));
    const trail = new THREE.Line(trailGeo, trailMat); trail.frustumCulled = false;
    scene.add(mesh, trail);
    const p = { pos: camera.position.clone(), vel: dir.multiplyScalar(pap ? SPEED * 1.35 : SPEED), life: LIFE, mesh, trail, homes: pap || (longBarrel ? !ads : ads), headLock, pap, def,
      drawFrom: from.clone(), blend: 0, target: null, scan: 0, hist: [] };
    if (live.length >= MAX) kill(live.shift());
    live.push(p); return true;
  }
  (host.fireHooks ??= []).push(launch);

  // where homing steers: the head bone when locked (Pack-a-Punched and aimed), else the chest so it doesn't hand out headshots
  function aimPoint(z, head, out) {
    if (head) return out.copy(enemies.headPosition?.(z) ?? z.root.position.clone().add(new THREE.Vector3(0, z.kind === 'dog' ? 28 : 63, 0)));
    out.copy(z.root.position); out.y += z.kind === 'dog' ? 18 : 40; return out;
  }
  function pickTarget(p) {
    const dir = tmp.copy(p.vel).normalize(); let best = null, bestScore = -Infinity;
    for (const z of enemies.list) {
      if (z.dead || z.state === 'dead' || z.health <= 0) continue;
      aimPoint(z, p.headLock, aimAt);
      const to = aimAt.clone().sub(p.pos), d = to.length(); if (d > REACH || d < 1) continue;
      const c = to.divideScalar(d).dot(dir); if (c < CONE) continue;
      const score = c * 2 - d / REACH; if (score > bestScore && world.lineClear(p.pos, aimAt)) { bestScore = score; best = z; }
    }
    return best;
  }
  function kill(p) { p.mesh.removeFromParent(); p.trail.removeFromParent(); p.trail.geometry.dispose(); }
  function hit(p, ray, dist) {
    const t = enemies.rayHit(ray, dist);
    if (!t) return false;
    const def = p.def, dmg = (t.distance > def.range ? def.minDamage : def.damage) * (t.head ? Math.max(1, def.headMultiplier) : 1);
    enemies.hurt(t.z, dmg, t.head, false, 'bullet');
    return true;
  }
  host.on('update', dt => {
    if (!dt) return;
    for (const p of [...live]) {
      p.life -= dt;
      // homing: re-pick the target a few times a second, then turn the velocity toward it
      if (p.homes && (p.scan -= dt) <= 0) { p.scan = .12; p.target = pickTarget(p); }
      const speed = p.vel.length();
      if (p.target && !(p.target.dead || p.target.health <= 0)) {
        aimPoint(p.target, p.headLock, aimAt);
        const want = aimAt.sub(p.pos).normalize(), now = p.vel.clone().normalize(), ang = now.angleTo(want);
        if (ang > 1e-4) { const k = Math.min(1, (TURN * (p.pap ? 1.4 : 1) * dt) / ang); now.lerp(want, k).normalize(); p.vel.copy(now.multiplyScalar(speed)); }
      } else p.vel.y -= DROP * (p.pap ? .5 : 1) * dt;   // unguided rounds drop fast (Pack-a-Punched: half as much)
      const step = p.vel.clone().multiplyScalar(dt), len = step.length(), ray = new THREE.Ray(p.pos.clone(), step.clone().divideScalar(len || 1));
      const wall = world.raycast(ray, 0, len);
      if (hit(p, ray, wall?.distance ?? len)) { kill(p); live.splice(live.indexOf(p), 1); continue; }
      if (wall) {   // the needle sticks in the wall for a moment
        p.pos.copy(wall.position ?? ray.at(wall.distance, new THREE.Vector3())); p.trail.removeFromParent(); p.trail.geometry.dispose();
        p.mesh.position.copy(p.pos); stuck.push({ mesh: p.mesh, t: 4 }); live.splice(live.indexOf(p), 1); continue;
      }
      p.pos.add(step);
      if (p.life <= 0) { kill(p); live.splice(live.indexOf(p), 1); continue; }
      // drawn: eased from the muzzle onto the real path over the first few metres
      p.blend = Math.min(1, p.blend + dt * 4);
      const drawn = p.drawFrom.clone().lerp(p.pos, p.blend); p.drawFrom.addScaledVector(p.vel, dt);
      p.mesh.position.copy(drawn); p.mesh.lookAt(drawn.clone().add(p.vel));
      p.hist.unshift(drawn.clone()); if (p.hist.length > 6) p.hist.pop();
      const a = p.trail.geometry.attributes.position; for (let i = 0; i < 6; i++) { const q = p.hist[Math.min(i, p.hist.length - 1)]; a.setXYZ(i, q.x, q.y, q.z); } a.needsUpdate = true;
    }
    for (const s of [...stuck]) { s.t -= dt; if (s.t <= 0) { s.mesh.removeFromParent(); stuck.splice(stuck.indexOf(s), 1); } }
  });
  host.on('reset', () => { for (const p of live) kill(p); live.length = 0; for (const s of stuck) s.mesh.removeFromParent(); stuck.length = 0; });
  window.kino.bo7 = { live, stuck, get drum() { return drum; }, CANT, GRIP };   // drum / CANT / GRIP: for tuning tests
}
