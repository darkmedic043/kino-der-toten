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
// At the hip it sat as close as the BO1 M16 and read as huge (a long, bulky gun): pushed 3 units away from the eye
// along the view camera's axis (-z), nudged right and down (ViewWeapon's def.viewOffset; gone in ADS).
const VIEW_OFFSET = [.6, -.4, -3];
// Optics that make homing lock onto the head (precision); Pack-a-Punched always does.
const HEAD_LOCK = ['gh_rangefinder', 'gh_hawkeye'];
const SPEED = 2600, DROP = 520, LIFE = 2.2, TURN = 3.2, CONE = Math.cos(THREE.MathUtils.degToRad(16)), REACH = 1800, MAX = 60;

export function prepare(data) {
  const m16 = data.weapons.m16_zm;
  if (!m16) { console.warn('[bo7-weapons] no M16 to build the Grimhawk on'); return; }
  const model = BASE + 'grimhawk_view.glb?v=9', world = BASE + 'grimhawk_world.glb?v=9';   // own models (not under models/: Rind installs them)
  const base = structuredClone(m16);
  const gun = Object.assign(base, {
    id: ID, name: 'Grimhawk', price: 1500, clipSize: 25, startAmmo: 125, maxAmmo: 225,
    damage: 190, minDamage: 150, range: 3000, fireTime: .094,   // 0.092-0.096 s between shots in BO7 footage headMultiplier: 3.5, hipSpread: .016,
    automatic: true, fireType: 'Full Auto', pellets: 1, hideTags: [...ATTACHMENT_TAGS], model, worldModel: world, adsFov: 48,
    flechette: true, soundAs: 'g11_lps_zm', weaponClass: 'Special', gunsmith: true, viewOffset: VIEW_OFFSET,   // gunsmith: camos, though it has no attachments yet   // BO7's Specials class (the loadout's SPECIALS tab)
  });
  gun.upgrade = Object.assign(structuredClone(m16.upgrade ?? {}), {
    name: 'Grim Reaper', clipSize: 35, startAmmo: 280, maxAmmo: 280, damage: 340, minDamage: 260, range: 3600, fireTime: .08,
    headMultiplier: 4, hideTags: [...ATTACHMENT_TAGS], model, worldModel: world, viewOffset: VIEW_OFFSET, animations: structuredClone(m16.animations), automatic: true, fireType: 'Full Auto', pellets: 1,
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
    const headLock = pap || HEAD_LOCK.some(a => atts.includes(a));
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

  // where homing steers: the head bone when locked (PaP, or a HEAD_LOCK optic), else the chest so the plain gun doesn't
  // hand out headshots
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
  window.kino.bo7 = { live, stuck };
}
