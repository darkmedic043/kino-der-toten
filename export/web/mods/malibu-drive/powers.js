// The heroes' powers in Malibu Drive (_hulk.gsc, _thor.gsc, _cap.gsc, _hawkeye.gsc, _widow.gsc, _quicksilver.gsc,
// _scarlet_witch.gsc, _spiderman.gsc, _rhodes.gsc, _vision.gsc, _unlock_characters.gsc and their parts of _zombiemode.gsc):
//   Hero melee (thunderPunch_think): with a hero weapon out (Mjolnir, the shield, the web shooter, Scarlet's hex, the bows,
//     the Hulk's fists) or an armor on, a melee flings up to four zombies right in front (60 units; Scarlet's reaches 250 and
//     costs her 20 power).
//   Bruce Banner: six valves on the Mean Juice tank (`mean_juice_trig`, Banner only) must be turned in an order you find by
//     trying (a wrong one drains the tank and you start over; the order stays); all six give him the serum. Drinking it
//     (fire) makes him the Hulk 8 s later: 900 health, slower, his fists (fire: a thunder clap that flings up to 21 zombies
//     in a 1000-unit corridor in front, 10 power), heavy steps. Hulk power (200) drains 1 a second and comes back 1 a second
//     as Banner; at 0, or holding F for 2 s, he calms down. The Hulk smashes Cap's shield down from where it hangs.
//   Thor: Mjolnir lies in the city (`thor_hammer_trig`): Thor or Vision can lift it (it leaves its stand until they change
//     hero). Throwing it calls lightning where it lands that chains through up to ten zombies (_zombiemode_tesla.gsc).
//   Captain America: his shield fell off the helicarrier and hangs on Tony's beach house (`cap_shield`); the Hulk knocks
//     it down, Cap picks it up there. Thrown, it ricochets through up to eight zombies within 1250 and comes back. Carried
//     on his back (another gun out), it stops hits from behind.
//   Hawkeye: his bows are in a shop in the city (`hawkeye_bow_trig`): Spearhead, Explosive and Electro-Shock arrows
//     (the electro arrow chains lightning through up to six, as the map's tesla script does).
//   Black Widow: her pistols (Natasha's Bad Boys); fast and tough.
//   Quicksilver: hold F for super speed.
//   Scarlet Witch: her hex (fire) raises a shield that makes her invulnerable but slow (10 power a second; 5 back a
//     second without it); aim to hold a zombie in front of her (telekinesis), release to drop it.
//   Spider-Man: webs (fire) glue a zombie where they land for 20 s; Spidey sense warns of a zombie close behind; web-zip
//     at the grapple points (`grapple_location`) with the web shooter out.
//   James Rhodes: bullets do double damage; War Machine is his (tony.js).
//   Vision: hold F for 1 s: Molecular Mode (invulnerable, fast, kills what he passes through within 80; 10 power a
//     second) ; the ghost points (`vision_ghost_trig`) let him phase through walls; he can lift Mjolnir.
import * as THREE from 'three';

const W_ = n => 'malibu_' + n;
const POWER_MAX = 200;

export function setupPowers(kit, heroes, tony) {
  const { api, one, named, center, say, dialog, wait, move, nodes, show, sound, figure, model, remove, now, feet, v3 } = kit;
  const { world, session, host, player, data, scene, camera, enemies, toast } = api;
  const W = data.weapons;
  const is = id => heroes.is(id);
  const def = () => session.def?.id;
  const up = d => new THREE.Vector3(0, d, 0);
  const eye = () => camera.getWorldPosition(new THREE.Vector3());
  const fwd = () => camera.getWorldDirection(new THREE.Vector3());

  // ---- the original's fling test: zombies in a cylinder of `radius` along the view, within `range`, nearest first
  function inFront({ range, radius = 180, max = 4 }) {
    const o = eye(), f = fwd(), end = o.clone().addScaledVector(f, 1500), seg = new THREE.Line3(o, end), out = [];
    const list = enemies.list.map(z => ({ z, c: z.root.position.clone().add(up(40)) })).sort((a, b) => a.c.distanceTo(o) - b.c.distanceTo(o));
    for (const { z, c } of list) {
      if (out.length >= max) break;
      if (feet().distanceTo(z.root.position) > range) continue;
      if (c.clone().sub(o).dot(f) < 0) continue;
      if (seg.closestPointToPoint(c, true, new THREE.Vector3()).distanceTo(c) > radius) continue;
      if (!world.lineClear(o, c)) continue;
      out.push(z);
    }
    return out;
  }
  const fling = (z, cause = 'melee') => enemies.list.includes(z) && enemies.hurt(z, 1e6, false, cause === 'melee', cause);
  const shake = (s = .5) => { kit.flash(.05); const r = camera.rotation; r.x += (Math.random() - .5) * .03 * s; r.y += (Math.random() - .5) * .03 * s; };

  // ---- a hero power bar (Hulk, Scarlet Witch, Vision share the map's level.*_power pools)
  const power = { hulk: POWER_MAX, scarlet: POWER_MAX, vision: POWER_MAX };
  let bar = document.getElementById('malibu-power');
  if (!bar) { bar = document.createElement('div'); bar.id = 'malibu-power'; bar.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);width:220px;height:9px;border:1px solid #fff8;background:#0008;z-index:30;display:none;pointer-events:none'; bar.innerHTML = '<i style="display:block;height:100%;width:100%;background:#6fdc6f"></i><span style="position:absolute;left:0;right:0;top:-16px;text-align:center;font:700 10px Arial;letter-spacing:2px;color:#fff;text-shadow:0 1px 2px #000"></span>'; document.body.append(bar); }
  const showBar = (label, value, color) => { bar.style.display = 'block'; bar.firstChild.style.width = Math.max(0, value / POWER_MAX * 100) + '%'; bar.firstChild.style.background = color; bar.lastChild.textContent = label; };

  // ---- hold F (UseButtonPressed): Quicksilver's speed, the Hulk calming down, Vision's Molecular Mode
  let useDown = 0;
  addEventListener('keydown', e => { if (e.code === 'KeyF' && !e.repeat) useDown = performance.now(); });
  addEventListener('keyup', e => { if (e.code === 'KeyF') useDown = 0; });
  addEventListener('blur', () => { useDown = 0; });
  const held = () => useDown ? (performance.now() - useDown) / 1000 : 0;

  // ---- projectiles of our own (Mjolnir, the shield's first leg, webs, the electro arrow)
  const shots = [];
  let lastImpact = null;
  async function launch({ modelName, speed, gravity = 0, life = 3, spin = 0, onHit }) {
    const o = modelName ? await model(modelName) : new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    if (!o) return;
    const from = eye().addScaledVector(fwd(), 24).add(up(-6));
    o.position.copy(from); o.lookAt(from.clone().add(fwd())); scene.add(o);
    shots.push({ o, v: fwd().multiplyScalar(speed), gravity, life, spin, onHit, weapon: def() });
  }
  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.life -= step; s.v.y -= s.gravity * step;
      const travel = s.v.clone().multiplyScalar(step), dist = travel.length(), dir = travel.clone().normalize(), ray = new THREE.Ray(s.o.position.clone(), dir);
      const wall = world.raycast(ray, 0, dist + 1), hit = enemies.rayHit(ray, Math.min(dist, wall?.distance ?? dist));
      if (s.spin) s.o.rotation.z += s.spin * step;
      if (hit || wall || s.life <= 0) {
        const at = hit?.point ?? wall?.position ?? s.o.position;
        shots.splice(i, 1); s.o.removeFromParent(); lastImpact = { at: at.toArray().map(Math.round), z: !!hit, wall: !!wall, life: s.life }; kit.impact(at.clone(), s.weapon, 'projectile'); s.onHit?.(at.clone(), hit?.z ?? null);
        continue;
      }
      s.o.position.add(travel);
    }
  });
  const fireHooks = (host.fireHooks ??= []);
  const hook = fn => fireHooks.push(fn);

  // ---- hero melee
  let meleePrev = 0;
  host.on('update', () => {
    const m = session.meleeLeft ?? 0, started = m > meleePrev; meleePrev = m;
    if (!started) return;
    kit.impact(eye().addScaledVector(fwd(), 60), def(), 'melee');
    const h = heroes.hero(), id = def(), hulk = !!hulkOn;
    const heroWeapon = [W_('thor_hammer'), W_('cap_shield'), W_('spiderman'), W_('scarlet_witch'), W_('hawkeye_bow1'), W_('hawkeye_bow2'), W_('hawkeye_bow3'), W_('hulk_hands')].includes(id);
    if (!heroWeapon && !tony.armor.worn() && !hulk) return;
    if (is('scarlet') && power.scarlet < 20) return;
    const scarlet = is('scarlet');
    setTimeout(() => {
      const hits = inFront({ range: scarlet ? 250 : hulk ? 120 : 75, max: 4 });
      for (const z of hits) { fling(z); sound('iron_punch', { volume: .5 }); }
      if (hulk) power.hulk -= 2;
      if (scarlet) power.scarlet = Math.max(0, power.scarlet - 20 - 5 * hits.length);
    }, hulk || is('spiderman') ? 330 : is('cap') ? 200 : 125);
  });

  // ================================================================ Bruce Banner and the Hulk
  const valves = named('mean_juice_trig').map((e, i) => ({ i, e, order: null }));
  let next = 1, assigned = 0, serum = false, fill = 0, valveBusy = false;
  const assign = () => { const free = valves.filter(v => v.order == null); if (free.length) { free[Math.floor(Math.random() * free.length)].order = ++assigned; } };
  assign();
  for (const v of valves) world.addInteraction({ position: center(v.e), hidden: () => serum, text: () => 'Turn the valve', async use() {
    if (!is('banner') || hulkOn) { say(`${heroes.name()}: I should let ^2Bruce Banner^7 mess with this stuff.`); return false; }
    if (valveBusy) return false;
    if (!banterDone) { banterDone = true; say('^2Bruce Banner^7: I need to fill the tank in the correct order.'); }
    valveBusy = true; sound('malibu_console_beep', { volume: .4 });
    if (v.order !== next) {
      move('mean_juice_fill', up(-2 * fill), 1); fill = 0; next = 1;
      if (Math.random() < .4) say('^2Bruce Banner^7: Nope. I gotta get these in the right order.');
      await wait(1); valveBusy = false; return true;
    }
    next++; fill++; move('mean_juice_fill', up(2), 1); await wait(1);
    if (assigned === next - 1) assign();
    if (fill === 6) {
      serum = true; say('^2Bruce Banner^7: Yes!!! Now I have the serum.');
      heroes.giveGear('banner', W_('mean_juice'));
    }
    valveBusy = false; return true;
  } });
  let banterDone = false, hulkOn = false, hulkSaved = null, clapBusy = false, stepAt = 0, calmAt = 0, drinking = false;
  hook((d) => {
    if (d?.id === W_('mean_juice') && is('banner') && !hulkOn && !drinking) {
      drinking = true;
      (async () => { await wait(1.6); sound('hulk_suitup', { volume: .7 }); await wait(6.3); drinking = false; if (is('banner') && !hulkOn && session.phase !== 'reviving') becomeHulk(); })();
      return true;
    }
    if (d?.id === W_('hulk_hands') && hulkOn && !clapBusy) {
      clapBusy = true;
      (async () => {
        await wait(.9); sound('hulk_thunder_clap', { volume: .8 }); shake(2); kit.fx(eye().addScaledVector(fwd(), 60), 0x9fd0ff, 30);
        for (const d of [60, 140, 220]) kit.impact(eye().addScaledVector(fwd(), d), W_('hulk_hands'), 'melee');
        power.hulk -= 10;
        for (const z of inFront({ range: 1000, max: 21 })) fling(z, 'thunder');
        await wait(1); clapBusy = false;
      })();
      return true;
    }
    return false;
  });
  function becomeHulk() {
    hulkOn = true; sound('hulk_smash', { volume: .8 });
    session.cancelReload?.(); hulkSaved = { inventory: session.inventory.map(w => ({ ...w })), slot: session.slot };
    session.inventory = [{ id: W_('hulk_hands'), mag: 1, reserve: 40, upgraded: false }]; session.slot = 0;
    heroes.setForm({ hp: 600, speed: .85, hands: 'hulk_view', hud: 'hud_hulk', overlay: '1stperson_view_hulk' });
    session.health = session.maxHealth; api.equipView?.();
    announce('HULK SMASH', 'THE INCREDIBLE HULK', 3);
  }
  function hulkDone(why) {
    if (!hulkOn) return;
    hulkOn = false; sound('hulk_suitoff', { volume: .7 });
    heroes.setForm(null);
    if (hulkSaved) { session.cancelReload?.(); session.inventory = hulkSaved.inventory; session.slot = Math.min(hulkSaved.slot, session.inventory.length - 1); hulkSaved = null; api.equipView?.(); }
    if (why) say(why);
  }
  const announce = (a, b, s) => api.announce?.(a, b, s);
  heroes.block(() => hulkOn ? 'Please change back to Bruce Banner first' : null);
  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    // Hulk power: -1/s as the Hulk, +1/s as Banner (once he has the serum)
    if (hulkOn) power.hulk -= step; else if (serum) power.hulk = Math.min(POWER_MAX, power.hulk + step);
    if (hulkOn && power.hulk < 2) { power.hulk = 3; hulkDone(); }
    if (hulkOn && held() > 2 && now() > calmAt) { calmAt = now() + 3; hulkDone(); }
    if (hulkOn && ['reviving', 'gameover'].includes(session.phase)) hulkDone();
    if (hulkOn && player.velocity && Math.hypot(player.velocity.x, player.velocity.z) > 40 && (player.isGrounded ?? player.onFloor) && now() > stepAt) {
      stepAt = now() + .6; sound(['hulk_step2', 'hulk_step3', 'hulk_step_new'][Math.floor(Math.random() * 3)], { volume: .5 }); shake(.6);
    }
  });

  // chain lightning (_zombiemode_tesla.gsc treats Mjolnir and the Electro-Shock arrow as the Wunderwaffe): from where it
  // lands to the nearest zombie within 140, then hop to the next within 300, up to `max`, a bolt drawn for each hop
  function chain(at, max) {
    const hit = new Set(); let from = at.clone(), reach = 140;
    for (let k = 0; k < max; k++) {
      const z = enemies.list.filter(z => !hit.has(z) && z.root.position.clone().add(up(40)).distanceTo(from) < reach).sort((a, b) => a.root.position.distanceTo(from) - b.root.position.distanceTo(from))[0];
      if (!z) break;
      hit.add(z); const to = z.root.position.clone().add(up(40));
      bolt(from, to); from = to; reach = 300;
      enemies.hurt(z, 1e6, false, false, 'tesla');
    }
  }
  const boltMat = new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  function bolt(a, b) {
    const pts = [a.clone()]; for (let i = 1; i < 8; i++) pts.push(a.clone().lerp(b, i / 8).add(new THREE.Vector3((Math.random() - .5) * 18, (Math.random() - .5) * 18, (Math.random() - .5) * 18))); pts.push(b.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat); scene.add(line);
    setTimeout(() => { line.removeFromParent(); line.geometry.dispose(); }, 180);
  }

  // ================================================================ Mjolnir (Thor, Vision)
  const hammerTrig = one('thor_hammer_trig');
  let hammerWith = null;   // hero id holding it
  if (hammerTrig) world.addInteraction({ position: center(hammerTrig), hidden: () => !!hammerWith, text: () => 'Lift Mjolnir', use() {
    if (!is('thor') && !is('vision')) { if (!hulkOn) say(`${heroes.name()}: I can't lift this`); return false; }
    hammerWith = heroes.hero().id; heroes.find('hammer'); show('thor_hammer', false);
    say(is('thor') ? '^3Thor^7: The mighty power of Mjolnir is upon me!' : '^3Vision^7: I shall wield this weapon with nobility');
    heroes.give(W_('thor_hammer')); return true;
  } });
  heroes.onChange((h, prev) => {
    if (hammerWith && prev?.id === hammerWith) { hammerWith = null; show('thor_hammer', true); }
    if (h?.id !== 'banner') hulkDone();
    if (h?.id !== 'scarlet') shieldDown(false);
    if (h?.id !== 'vision') molecular(false);
    if (h?.id === 'thor' && hammerWith && hammerWith !== 'thor') say('^3Thor^7: Someone else has Mjolnir...');
    bar.style.display = 'none';
  });
  hook((d) => {
    if (d?.id !== W_('thor_hammer')) return false;
    sound('thor_hammer_fire', { volume: .7 });
    launch({ modelName: 'thor_hammer', speed: 2250, life: 1.5, spin: 18, onHit: at => {
      kit.fx(at, 0xcfe6ff, 40); shake(1);
      const bolt = new THREE.PointLight(0xbfe0ff, 12, 500); bolt.position.copy(at).add(up(60)); scene.add(bolt); setTimeout(() => bolt.removeFromParent(), 250);
      chain(at, 10);
    } });
    return true;
  });

  // ================================================================ Captain America's shield
  const shieldTrig = one('cap_shield_trig'), m1 = one('cap_shield_move_1'), m2 = one('cap_shield_move_2'), shieldEnt = one('cap_shield');
  let shieldState = 'hanging';   // hanging -> down -> taken
  const shieldBox = shieldTrig?.bounds ? new THREE.Box3(v3(shieldTrig.bounds[0]), v3(shieldTrig.bounds[1])).expandByScalar(60) : null;
  host.on('update', () => {
    // the Hulk's clap or punch near it brings it down
    if (shieldState === 'hanging' && hulkOn && shieldBox && (clapBusy || (session.meleeLeft ?? 0) > 0) && shieldBox.distanceToPoint(feet()) < 900 && fwd().dot(shieldBox.getCenter(new THREE.Vector3()).sub(eye()).normalize()) > .8) {
      shieldState = 'falling';
      (async () => {
        const o = nodes('cap_shield')[0], base = v3(shieldEnt.origin);
        await move('cap_shield', v3(m1.origin).sub(base), .5, { rot: new THREE.Euler(0, 0, Math.PI * 14) });
        await move('cap_shield', v3(m2.origin).sub(v3(m1.origin)), 1, { rot: new THREE.Euler(0, 0, Math.PI * 5) });
        shieldState = 'down';
      })();
    }
    if (shieldState === 'down') {
      const at = v3(m2.origin);
      if (feet().distanceTo(at) < 90) {
        if (is('cap')) {
          shieldState = 'taken'; show('cap_shield', false); heroes.find('shield'); heroes.giveGear('cap', W_('cap_shield'));
          say('^4Captain America^7: Yes!!! I have my shield now.');
        } else if (!hulkOn && now() > (shieldNagAt ?? 0)) { shieldNagAt = now() + 3; say(`${heroes.name()}: I should leave this for ^4Captain America`); }
      }
    }
  });
  let shieldNagAt = 0, shieldOut = false;
  if (shieldTrig) world.addInteraction({ position: center(shieldTrig), hidden: () => shieldState !== 'hanging' || hulkOn, text: () => "Captain America's shield", use() {
    say(`${heroes.name()}: ${['This isn\'t working. There must be a way to get that down.', 'I should find a way to get that down here.', 'This is not going to work. I better get someone more powerful.', 'I may need someone more powerful to get that down.'][Math.floor(Math.random() * 4)]}`);
    return false;
  } });
  hook((d) => {
    if (d?.id !== W_('cap_shield') || shieldOut) return false;
    shieldOut = true;
    (async () => {
      await wait(1.72);   // the throw animation
      if (!is('cap')) { shieldOut = false; return; }
      sound('cap_shield_throw_1', { volume: .7 });
      const i = session.inventory.findIndex(w => w.id === W_('cap_shield')); if (i >= 0) { session.inventory[i].mag = 0; }
      const o = await model('cap_shield'); if (!o) { shieldOut = false; return; }
      o.position.copy(eye().add(up(-10))); scene.add(o);
      const special = kit.shieldTarget?.(eye(), fwd());   // the Easter egg's dishes (quests.js)
      const targets = special ? [] : inFront({ range: 1250, max: 8 });
      const flyTo = async (getAt, speed = 1 / .0015) => {
        for (let t = 0; t < 4; t += 1 / 60) {
          const at = getAt(); if (!at) return;
          const d = at.clone().sub(o.position), dist = d.length();
          o.rotation.y += .5; if (Math.random() < .15) sound('cap_shield_throw_' + (1 + Math.floor(Math.random() * 4)), { volume: .3 });
          if (dist < 30) return;
          o.position.addScaledVector(d.normalize(), Math.min(dist, speed / 60));
          await new Promise(r => requestAnimationFrame(r));
        }
      };
      if (special) { await flyTo(() => special.at); special.hit(); }
      else if (targets.length) for (const z of targets) { await flyTo(() => enemies.list.includes(z) ? z.root.position.clone().add(up(40)) : null); if (enemies.list.includes(z)) { sound('iron_punch', { volume: .5 }); fling(z, 'shield'); } }
      else { const hit = world.raycast(new THREE.Ray(eye(), fwd()), 1, 1500), far = hit ? hit.point.clone() : eye().addScaledVector(fwd(), 1500); await flyTo(() => far); }
      await flyTo(() => eye().add(up(-10)));
      o.removeFromParent(); shieldOut = false;
      const j = session.inventory.findIndex(w => w.id === W_('cap_shield')); if (j >= 0) session.inventory[j].mag = W[W_('cap_shield')].clipSize;
    })();
    return true;
  });
  // carried on his back (another weapon out), the shield stops hits from behind
  host.on('beforeDamage', e => {
    if (!is('cap') || !heroes.found('shield') || def() === W_('cap_shield') || !session.inventory.some(w => w.id === W_('cap_shield'))) return;
    const p = feet(), f = fwd().setY(0).normalize();
    const z = enemies.list.filter(z => z.root.position.distanceTo(p) < 90).sort((a, b) => a.root.position.distanceTo(p) - b.root.position.distanceTo(p))[0];
    if (z && z.root.position.clone().sub(p).setY(0).normalize().dot(f) < 0) { e.amount = 0; sound('iron_punch', { volume: .25 }); }
  });

  // ================================================================ Hawkeye's bows
  const bowTrig = one('hawkeye_bow_trig');
  kit.prop('hawkeye_bow', 'worldmodel_hawkeye_bow1');
  if (bowTrig) world.addInteraction({ position: center(bowTrig), hidden: () => heroes.found('bows'), text: () => "Hawkeye's bow", use() {
    if (!is('hawkeye')) { if (!hulkOn) say(`${heroes.name()}: I should let ^6Hawkeye^7 mess with this.`); return false; }
    heroes.find('bows'); show('hawkeye_bow', false); sound('pickup_part', { volume: .6 });
    for (const b of ['hawkeye_bow1', 'hawkeye_bow2', 'hawkeye_bow3']) heroes.giveGear('hawkeye', W_(b));
    say('^6Hawkeye^7: There we go.'); return true;
  } });
  if (W[W_('hawkeye_bow1')]) Object.assign(W[W_('hawkeye_bow1')], { projectileType: 'bolt', fuseTime: 6, explosionRadius: 0 });
  hook((d) => {
    if (d?.id !== W_('hawkeye_bow3')) return false;
    sound('bow_fire', { volume: .6 });
    launch({ modelName: 'hawkeye_arrow1', speed: 3000, gravity: 200, life: 3, onHit: at => {
      kit.fx(at, 0x7fe0ff, 16);
      chain(at, 6);
    } });
    return true;
  });

  // ================================================================ Quicksilver
  let fast = false;
  host.on('update', () => {
    const want = is('quicksilver') && held() > .2 && session.phase !== 'reviving';
    if (want !== fast) { fast = want; heroes.setForm(fast ? { speed: 4 } : null); }
    if (fast && Math.random() < .3) kit.fx(feet().add(up(30)), 0xc8d4ff, 2);
  });

  // ================================================================ Scarlet Witch
  let shield = false, holding = null;
  function shieldDown(snd = true) { if (!shield) return; shield = false; heroes.setForm(null); if (snd) sound('scarlet_shield_down', { volume: .6 }); }
  hook((d) => {
    if (d?.id !== W_('scarlet_witch')) return false;
    (async () => {
      await wait(1);
      if (!is('scarlet')) return;
      if (shield) shieldDown();
      else if (!holding && power.scarlet > 10) { shield = true; heroes.setForm({ speed: .75 }); sound('scarlet_shield_up', { volume: .6 }); }
    })();
    return true;
  });
  host.on('beforeDamage', e => { if ((shield && is('scarlet')) || (molecularOn && is('vision'))) e.amount = 0; });
  let adsPrev = false;
  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    if (shield) { power.scarlet -= 10 * step; if (power.scarlet < 11) shieldDown(); } else if (is('scarlet')) power.scarlet = Math.min(POWER_MAX, power.scarlet + 5 * step);
    const ads = !!api.getState().input?.ads && def() === W_('scarlet_witch') && is('scarlet');
    if (ads && !adsPrev && !shield) {
      const z = inFront({ range: 200, max: 1 })[0];
      if (z) { holding = { z, ai: z.ai }; z.ai = () => {}; sound('scarlet_shield_up', { volume: .5 }); }
    }
    if (!ads && adsPrev && holding) { const { z, ai } = holding; holding = null; z.ai = ai; sound('scarlet_shield_down', { volume: .5 }); }
    adsPrev = ads;
    if (holding) {
      if (!enemies.list.includes(holding.z)) holding = null;
      else { const at = feet().add(fwd().setY(0).normalize().multiplyScalar(70)).add(up(40)); holding.z.root.position.lerp(at, Math.min(1, step * 6)); if (Math.random() < .2) kit.fx(holding.z.root.position.clone().add(up(40)), 0xff3355, 3); }
    }
    if (is('scarlet')) showBar('HEX POWER', power.scarlet, '#ff4d6a');
  });

  // ================================================================ Spider-Man
  const globs = [];
  hook((d) => {
    if (d?.id !== W_('spiderman')) return false;
    sound('web_fire_' + (1 + Math.floor(Math.random() * 3)), { volume: .6 });
    launch({ speed: 2000, gravity: 150, life: 2, onHit: async at => {
      sound('web_impact', { volume: .5, at });
      const z = enemies.list.filter(z => !z.glob && z.root.position.distanceTo(at) < 100).sort((a, b) => a.root.position.distanceTo(at) - b.root.position.distanceTo(at))[0];
      if (!z) return;
      const g = await model('malibu_web_glob'); if (g) { g.position.copy(z.root.position); scene.add(g); }
      z.glob = { until: now() + 20, ai: z.ai, g }; z.ai = () => {}; globs.push(z);
    } });
    return true;
  });
  let senseAt = 0;
  host.on('update', () => {
    for (let i = globs.length - 1; i >= 0; i--) { const z = globs[i]; if (!enemies.list.includes(z) || now() > z.glob.until) { if (enemies.list.includes(z)) z.ai = z.glob.ai; z.glob.g?.removeFromParent(); z.glob = null; globs.splice(i, 1); } }
    if (!is('spiderman') || now() < senseAt || enemies.list.length >= 7) return;
    const p = feet(), f = fwd().setY(0).normalize();
    if (enemies.list.some(z => z.root.position.distanceTo(p) < 100 && z.root.position.clone().sub(p).setY(0).normalize().dot(f) < Math.cos(70 * Math.PI / 180))) {
      senseAt = now() + 2; sound('spider_sense', { volume: .6 }); kit.flash(.15); say('^1Spider-Man^7: My spider-sense is tingling!');
    }
  });
  // web-zips at the grapple points: zip to the point, then to where it leads
  for (const e of named('grapple_location')) {
    const to = one(e.target); if (!to) continue;
    world.addInteraction({ position: center(e), hidden: () => !(is('spiderman') && def() === W_('spiderman')), text: () => 'Web-zip', async use() {
      say('^1Spider-Man^7: Yahoo!!!');
      await zip([center(e), v3(to.origin)], .5); return true;
    } });
  }
  async function zip(points, legTime) {
    for (const target of points) {
      const from = feet(), t0 = now();
      await new Promise(done => { const tick = () => { const k = Math.min(1, (now() - t0) / legTime), e2 = k * k * (3 - 2 * k); player.setPosition(from.clone().lerp(target, e2).add(up(2))); if (player.velocity) player.velocity.set(0, 0, 0); if (k >= 1) done(); else requestAnimationFrame(tick); }; tick(); });
    }
  }

  // ================================================================ James Rhodes: "Weapons do 2x the damage in my hands"
  host.on('beforeEnemyDamage', e => { if (is('rhodes') && !tony.armor.worn() && e.cause === 'bullet') e.amount *= 2; });

  // ================================================================ Vision
  let molecularOn = false;
  function molecular(on) {
    if (on === molecularOn) return;
    molecularOn = on; sound(on ? 'vision_start' : 'vision_end', { volume: .6 });
    heroes.setForm(on ? { speed: 1.6, hands: 'viewhands_vision_ghost' } : null);
  }
  let toggleAt = 0;
  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    if (is('vision')) {
      if (held() > 1 && now() > toggleAt) {
        toggleAt = now() + 1.5;
        if (window.kino.malibu?.inLobby?.()) say('[i] You cannot use Molecular Mode in Asgard'); else molecular(!molecularOn);
      }
      if (molecularOn) {
        power.vision -= 10 * step;
        for (const z of [...enemies.list]) if (z.root.position.distanceTo(feet()) < 80) { enemies.hurt(z, 1e6, false, false, 'vision'); kit.fx(z.root.position.clone().add(up(40)), 0xffe28a, 6); }
        if (power.vision < 2) { power.vision = 3; molecular(false); }
      } else power.vision = Math.min(POWER_MAX, power.vision + step);
      showBar('MOLECULAR', power.vision, '#ffd23f');
    }
    if (is('banner') && serum) showBar(hulkOn ? 'HULK' : 'BANNER', power.hulk, '#6fdc6f');
  });
  for (const e of named('vision_ghost_trig')) {
    const to = one(e.target); if (!to) continue;
    let busy = false;
    world.addInteraction({ position: center(e), hidden: () => !is('vision'), text: () => 'Phase through', async use() {
      if (busy) return false; busy = true;
      heroes.setForm({ ...(heroes.form()), hands: 'viewhands_vision_ghost' }); kit.flash(.3);
      await zip([v3(to.origin)], 1);
      await wait(.5); if (!molecularOn) heroes.setForm(null);
      busy = false; return true;
    } });
  }

  host.on('reset', () => {
    hulkOn = false; hulkSaved = null; serum = false; next = 1; assigned = 0; fill = 0; for (const v of valves) v.order = null; assign();
    hammerWith = null; shieldState = 'hanging'; shieldOut = false; shield = false; holding = null; molecularOn = false; fast = false;
    power.hulk = power.scarlet = power.vision = POWER_MAX; globs.length = 0; shots.length = 0; bar.style.display = 'none';
  });
  return { state: () => ({ lastImpact, shots: shots.length, hulk: hulkOn, serum, power: { ...power }, valveNext: next, valveOrder: valves.map(v => v.order), hammer: hammerWith, shield: shieldState, scarletShield: shield, molecular: molecularOn, fast, globs: globs.length }),
    becomeHulk, hulkDone, valves };
}
