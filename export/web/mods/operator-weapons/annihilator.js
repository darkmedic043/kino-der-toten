// The Annihilator (BO3's hero_annihilator: Seraph's revolver, The Giant's Fly Trap prize), as an operator weapon. In
// first person it's BO3's own view model on Dempsey's arms with its vm_annihilator_* clips (pullout, first raise, fire,
// rechamber, ADS, sprint, gun-butt swipe) in a ViewWeapon of its own, built by .tools/build_bo3_weapons.py into
// mods/bo3-weapons (git-ignored), with BO3's sounds from zm_factory's bank. Without those files: a plain stand-in.
// Behaviour after BO3's zombies version (Call of Duty wiki: 18 shots, ~2000 damage, a one-shot headshot kill up to
// round 24, kills disintegrate the zombie, 67 RPM single action, pistol-whip 100):
//   - left mouse fires: a hitscan round that goes through every zombie in its path up to a wall (PIERCE of them);
//     Every hit kills a zombie (user, 2026-10-24; BO3's was 2000 body, 4000 head); a boss takes 12% of its health a
//     shot (operator.damage: about 8 body shots for a Panzersoldat, under half the meter).
//     After each shot the hammer is cocked again (the rechamber clip), about 0.95 s a shot.
//   - right mouse aims down the sight (BO3's ads_base_up pose, the camera zooms like a gun's ADS); aimed in, the sight's
//     see-through reticle replaces the HUD crosshair (fixAnnihilatorMaterials).
//   - melee (V) pistol-whips: a kill, 2% of a boss's health.
//   - the meter is its ammo: 18 shots to empty (no drain over time). 50 kills charge it.
//   - a kill disintegrates the zombie (gone in a burst of gore, BO3's gib sound), except under Insta-Kill as in BO3.
// Kills are the player's (points as usual), cause 'operator'.
import { ViewWeapon, loadModel } from '../../animation.js';
import { disposeSkeletons } from '../../runtime-assets.js';

const SHOTS = 18, BOSS_SHOT = .12, BOSS_WHIP = .02, PIERCE = 8, RANGE = 8000, ADS_FOV = 56 / 78;
// notetrack aliases (BO3's alias table isn't exportable) -> the bank's files
const NOTE = { fly_annihilator_rechamber: 'fly_anni_rechamber_02', fly_annihilator_rechamber_ads: 'fly_anni_rechamber_ads_01',
  fly_annihilator_first_raise: 'annihilator_first_raise' };

// The export marks every material opaque, so the sight's reticle (trifocal: yellow brackets and a ring on a transparent
// sheet) drew as a black box over the sight and the decal sheet as black patches (user, 2026-10-18: "the annihilators
// sights seem a bit buggy"). The reticle becomes a see-through glowing sheet, the decals are cut out by their alpha.
export function fixAnnihilatorMaterials(root, THREE) {
  root?.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) {
    if (!m || m.userData.anniFixed) continue; m.userData.anniFixed = true;
    if (/annihilator_trifocal/.test(m.name)) {
      Object.assign(m, { transparent: true, alphaTest: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      if (m.emissive && m.map) { m.emissiveMap = m.map; m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 1.4; }
      o.renderOrder = 3; m.needsUpdate = true;
    } else if (/annihilator_decals/.test(m.name)) { Object.assign(m, { transparent: false, alphaTest: .5 }); m.needsUpdate = true; }
  } });
}

export function setupAnnihilator(api, operator) {
  const { scene, viewScene, enemies, player, camera, audio, session, world, data } = api;
  let REAL = null;
  const key = n => 'annihilator/' + n;
  fetch(new URL('../bo3-weapons/weapons.json', import.meta.url)).then(r => r.ok ? r.json() : null).then(j => {
    REAL = j?.operator?.annihilator ?? null; if (!REAL) return;
    for (const u of [REAL.model, REAL.handsModel]) loadModel(u).catch(() => {});
    if (audio?.manifest) for (const [n, url] of Object.entries(REAL.sounds ?? {})) audio.manifest[key(n)] ??= { url };
  }).catch(() => {});
  const sound = (n, v = 1) => { if (REAL?.sounds?.[n]) audio.play(key(n), v); };
  const warm = () => { if (audio?.ctx) for (const n of Object.keys(REAL?.sounds ?? {})) audio.buffer?.(key(n)).catch(() => {}); };
  let fresh = false;   // the first pull after it's given plays BO3's first raise (the cylinder flip)
  operator.register({ id: 'annihilator', name: 'Annihilator', short: 'ANNIHILATOR', color: '#f2c14e', kills: 50, drain: 0,
    icon: 'M3 8h14l1-2h3v4h-2l-1 2H9l-1 7H4.5l1-7H3zM11 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', activate,
    given() { fresh = true; warm(); } });

  function activate(ctx) {
    const THREE = ctx.THREE;
    const def = REAL; let vw = null, ended = false, stand = null;
    if (def && viewScene) {
      vw = new ViewWeapon(viewScene, data, n => { const m = /^sndnt#(.+)$/.exec(n); if (m) sound(NOTE[m[1]] ?? m[1], .8); });
      vw.equip(def).then(() => {
        if (ended) { dropView(); return; }
        fixAnnihilatorMaterials(vw.pivot, THREE);
        if (fresh && vw.rig.actions.firstRaiseAnim) { vw.mode = 'raise'; vw.rig.play('firstRaiseAnim', false, 1, .04); }
        fresh = false;
      }).catch(e => { console.warn('[annihilator] model', e); dropView(); standIn(); });
    } else standIn();
    function standIn() {   // no BO3 files: a dark block of a revolver at the hip
      if (!viewScene) return;
      const m = new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: .8, roughness: .4 });
      stand = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 16), m); body.position.z = -6; stand.add(body);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2.6), m); grip.position.set(0, -4, 1); grip.rotation.x = -.35; stand.add(grip);
      stand.position.set(6, -7, -16); viewScene.add(stand);
    }
    function dropView() { if (!vw) return; vw.pivot.removeFromParent(); if (vw.root) disposeSkeletons(vw.root); vw = null; }
    const real = () => vw?.ready;
    const play = (k, mode = 'fire', speed = 1) => { if (!real() || !vw.rig.actions[k]) return false; vw.mode = mode; vw.rig.play(k, false, speed, .04); return true; };
    const d = def?.durations ?? {};
    const FIRE = d.fireAnim ?? .4, CHAMBER = (d.rechamberAnim ?? .77) / 1.4;   // the rechamber clip sped up: ~0.95 s a shot (BO3: 67 RPM)
    const baseFov = camera.fov, lastCam = camera.position.clone();
    let aiming = false, shotT = null, chambered = true, whip = 0, whipHit = 0;   // shotT: time since the last shot, until it's cocked again
    sound('seraph_first_raise', .5);

    function fire(down) {
      if (!down || shotT != null || whip > 0 || ctx.power <= 0) return;
      const ads = aiming && (vw?.aim ?? 1) > .5;
      if (real()) vw.shoot({ ads }); else if (stand) stand.position.z = -13;
      sound('wpn_annihilator_fire', .9); sound('wpn_annihilator_fire_lfe', .6); sound('wpn_annihilator_fire_act', .5);
      camera.rotation.x = Math.min(1.48, camera.rotation.x + (ads ? .02 : .035));
      ctx.drain(1 / SHOTS);
      shotT = 0; chambered = false;
      shoot(ads);
    }
    function aim(down) { aiming = !!down; }
    function melee() {
      if (whip > 0 || shotT != null) return;
      whip = d.meleeAnim ? Math.min(.8, d.meleeAnim) : .6; whipHit = whip * .45;
      play('meleeAnim', 'fire');
    }
    // the round: every zombie on the ray up to the first wall, nearest first (the dismemberment mod's crawler test included)
    function shoot(ads) {
      const dir = camera.getWorldDirection(new THREE.Vector3());
      if (!ads) { dir.x += (Math.random() - .5) * .02; dir.y += (Math.random() - .5) * .02; dir.z += (Math.random() - .5) * .02; dir.normalize(); }
      const ray = new THREE.Ray(camera.position.clone(), dir), wall = world.raycast?.(ray, 1, RANGE), far = wall?.distance ?? RANGE;
      const hits = [], all = enemies.list;
      try {
        for (let i = 0; i < PIERCE; i++) {
          const h = enemies.rayHit(ray, far); if (!h) break;
          hits.push(h); enemies.list = enemies.list.filter(z => z !== h.z);
        }
      } finally { enemies.list = all; }
      tracer(ray.origin, ray.origin.clone().addScaledVector(dir, hits.length ? Math.max(far, hits.at(-1).distance) : far));
      if (!hits.length && wall) globalThis.kino?.fx?.explosion?.(wall.position.clone(), .25, 0xffd27a);
      for (const h of hits) {
        const z = h.z; if (!enemies.list.includes(z)) continue;
        const insta = session.effects?.insta_kill > session.time;
        enemies.hurt(z, operator.damage(z, BOSS_SHOT), h.head, false, 'operator');
        if (!enemies.list.includes(z) && !insta) disintegrate(z, h.point);
        else globalThis.kino?.fx?.blood?.(h.point.toArray(), 1.2);
      }
    }
    // a yellow streak along the round's path
    const tracers = [];
    function tracer(a, b) {
      const g = new THREE.BufferGeometry().setFromPoints([a.clone().add(new THREE.Vector3(0, -2, 0)), b]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(l); tracers.push({ l, t: 0 });
    }
    // disintegration (BO3's "annihilate" death): the body vanishes in a burst of gore and blood mist
    const chunkGeo = new THREE.BoxGeometry(1, 1, 1), chunkMat = new THREE.MeshStandardMaterial({ color: 0x5a0d09, roughness: .6 });
    const chunks = [];
    function disintegrate(z, at) {
      const c = z.root.position.clone().add(new THREE.Vector3(0, z.kind === 'dog' ? 18 : 36, 0));
      z.root.visible = false; z.life = Math.min(z.life ?? 1, .05);
      for (let i = 0; i < 3; i++) globalThis.kino?.fx?.blood?.(c.clone().add(new THREE.Vector3((Math.random() - .5) * 20, (Math.random() - .3) * 40, (Math.random() - .5) * 20)).toArray(), 1.5);
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(chunkGeo, chunkMat), s = 1.5 + Math.random() * 3.5; m.scale.set(s, s * (.6 + Math.random()), s);
        m.position.copy(c).add(new THREE.Vector3((Math.random() - .5) * 16, (Math.random() - .5) * 40, (Math.random() - .5) * 16));
        const v = new THREE.Vector3(Math.random() - .5, Math.random() * .8 + .2, Math.random() - .5).normalize().multiplyScalar(80 + Math.random() * 160);
        scene.add(m); chunks.push({ m, v, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), t: 0 });
      }
      while (chunks.length > 120) { const o = chunks.shift(); o.m.removeFromParent(); }
      sound('wpn_annihilator_gibs_0' + Math.floor(Math.random() * 3), .55);
      if (at) globalThis.kino?.fx?.blood?.(at.toArray(), 1.5);
    }

    function update(dt) {
      if (shotT != null) {
        shotT += dt;
        if (!chambered && shotT >= FIRE) {   // the fire clip ended: cock the hammer
          chambered = true; const ads = aiming && (vw?.aim ?? 0) > .5;
          play(ads && vw?.rig.actions.adsRechamberAnim ? 'adsRechamberAnim' : 'rechamberAnim', 'fire', 1.4);
        }
        if (shotT >= FIRE + CHAMBER) shotT = null;
      }
      if (whip > 0) {
        whip = Math.max(0, whip - dt);
        if (whipHit > 0 && (whipHit -= dt) <= 0) {
          const f = camera.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
          let best = null, bd = 70;
          for (const z of enemies.list) { const p = z.root.position, o = new THREE.Vector3(p.x - camera.position.x, 0, p.z - camera.position.z), dd = o.length(); if (dd < bd && o.normalize().dot(f) > .5) { best = z; bd = dd; } }
          if (best) { enemies.hurt(best, operator.damage(best, BOSS_WHIP), false, true, 'operator'); audio.play('knife', .6); }
        }
      }
      if (vw?.ready) {
        const moved = camera.position.distanceTo(lastCam) / Math.max(dt, 1e-3); lastCam.copy(camera.position);
        const sprint = !!api.view?.input?.sprint && shotT == null && whip <= 0;
        vw.update(dt, { moving: moved > 20, sprint, ads: aiming && !sprint, time: session.time });
        // the engine eases the FOV back to the setting each frame before mods run: zoom from the weapon's own aim
        camera.fov = baseFov * (1 - vw.aim * (1 - ADS_FOV)); camera.updateProjectionMatrix();
        crosshair(vw.aim > .85);   // aimed in, the sight's own ring is the reticle (as the scopes mod does for red dots)
      } else if (stand) stand.position.z += (-16 - stand.position.z) * Math.min(1, dt * 10);
      for (let i = tracers.length - 1; i >= 0; i--) { const o = tracers[i]; o.t += dt; o.l.material.opacity = Math.max(0, .9 - o.t * 6);
        if (o.t > .15) { o.l.removeFromParent(); o.l.geometry.dispose(); o.l.material.dispose(); tracers.splice(i, 1); } }
      for (let i = chunks.length - 1; i >= 0; i--) { const o = chunks[i]; o.t += dt; o.v.y -= 600 * dt; o.m.position.addScaledVector(o.v, dt);
        o.m.rotation.x += o.spin.x * dt; o.m.rotation.y += o.spin.y * dt;
        if (o.t > 1.4) { o.m.removeFromParent(); chunks.splice(i, 1); } }
    }
    let hidCross = false;
    function crosshair(hide) { if (hide === hidCross) return; hidCross = hide; const ch = document.getElementById('crosshair'); if (ch) ch.style.visibility = hide ? 'hidden' : ''; }
    function end() {
      ended = true; dropView(); crosshair(false);
      if (stand) { stand.removeFromParent(); stand.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); stand = null; }
      for (const o of tracers) { o.l.removeFromParent(); o.l.geometry.dispose(); o.l.material.dispose(); } tracers.length = 0;
      // the gore lands on its own, then the shared geometry goes
      const left = chunks.splice(0); let k = 0;
      const tick = () => { k += 1 / 60; for (const o of left) { o.v.y -= 10; o.m.position.addScaledVector(o.v, 1 / 60); } if (k < 1.2) requestAnimationFrame(tick); else { for (const o of left) o.m.removeFromParent(); chunkGeo.dispose(); chunkMat.dispose(); } };
      tick();
    }
    return { update, fire, aim, melee, end, get shots() { return Math.round(ctx.power * SHOTS); } };
  }
}
