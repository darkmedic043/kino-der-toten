// The Iron Man armors, map-independent (fork; from Cheese Cube's _iron_man_mk*.gsc port). Used by Cheese Cube's Hall of
// Armors (mods/cheese-cube/suits.js: stands, parts, holos) and by STARK.EXE on every other map (mods/stark/mod.js).
//   SUITS            the suits' stats (health, speed, weapons, price)
//   addSuitWeapons   the suits' weapons as defs cloned onto BO1 guns (the map's weapons/sp stats)
//   createArmor      wearing one: health, speed, the suit's weapons in place of yours, power (shots and flight drain it,
//                    it recharges while off), flight (hold Space in the air), JARVIS voice and HUD warnings, the Mk XVI
//                    cloak, and the suit coming off when you go down. Emits host 'suitChange' {suit, on} for the player model.
import * as THREE from 'three';

export const SUITS = [
  { id: 'mk3', name: 'Mark III', cost: 7500, hp: 285, speed: 1.05, weapons: ['iron_repulsor', 'iron_rocket'] },
  { id: 'mk1', name: 'Mark I', cost: 5000, hp: 350, speed: .85, noSprint: true, weapons: ['iron_mk1_flamer', 'iron_mk1_rocket'] },
  { id: 'mk4', name: 'Mark IV', cost: 10000, hp: 285, speed: 1.1, weapons: ['iron_repulsor', 'iron_rocket'] },
  { id: 'mk5', name: 'Mark V', cost: 12500, hp: 200, speed: 1.2, weapons: ['iron_repulsor'] },
  { id: 'mk6', name: 'Mark VI', cost: 15000, hp: 285, speed: 1.1, weapons: ['iron_repulsor', 'iron_mk6_rocket'] },
  { id: 'wm', name: 'War Machine', cost: 10000, hp: 320, speed: .95, weapons: ['iron_wm_minigun', 'iron_wm_handgun', 'iron_rocket'] },
  { id: 'mk16', name: 'Mark XVI Nightclub', cost: 0, hp: 200, speed: 1.1, weapons: ['iron_repulsor', 'iron_mk16_cloak'] },
];
export const MAX_POWER = 100, READY = 98, RECHARGE = .8;   // %/s while off: 0 -> ready in ~2 min (was 2, ~50 s; user 2026-10-15: more downtime)
// The JARVIS HUD art (hud/) and the voices and suit sounds (sounds/), shared by every map (git-ignored; built by
// .tools/waw_maps/cheese_cube_suit_assets.py from the Cheese Cube mod's .iwd)
export const JARVIS_DIR = 'mods/stark/jarvis/';
export const jarvisBase = () => new URL(JARVIS_DIR, document.baseURI).href;
const FLY_DRAIN = 6, THRUST = 1500, RISE_CAP = 260;

export function addSuitWeapons(W) {
  const clone = (id, base, extra) => { if (!W[base] || W[id]) return; W[id] = { ...W[base], id, baseId: base, price: 0, upgrade: undefined, attachment: undefined, suitWeapon: true, ...extra }; };
  clone('iron_repulsor', 'ray_gun_zm', { name: 'Repulsor', hideGun: true, damage: 2000, minDamage: 2000, fireTime: .33, fireType: 'Single Shot', automatic: false, clipSize: 10, startAmmo: 120, maxAmmo: 120,
    reloadTime: 1, reloadEmptyTime: 1, projectileSpeed: 3200, explosionRadius: 64, explosionInnerDamage: 1500, explosionOuterDamage: 300, suitSound: 'suit_repulsor', suitPower: 1 });
  clone('iron_rocket', 'm72_law_zm', { name: 'Wrist-Rocket', hideGun: true, damage: 10000, minDamage: 10000, fireTime: .33, clipSize: 3, startAmmo: 20, maxAmmo: 20, reloadTime: 1.2, reloadEmptyTime: 1.2,
    projectileSpeed: 2100, explosionRadius: 256, explosionInnerDamage: 600, explosionOuterDamage: 75, suitSound: 'suit_missile', suitPower: 5 });
  clone('iron_mk1_rocket', 'm72_law_zm', { name: 'Mk1 Wrist-Rocket', hideGun: true, damage: 10000, minDamage: 10000, fireTime: .33, clipSize: 1, startAmmo: 2, maxAmmo: 2, reloadTime: 1.2, reloadEmptyTime: 1.2,
    projectileSpeed: 2100, explosionRadius: 500, explosionInnerDamage: 20000, explosionOuterDamage: 150, suitSound: 'suit_missile', suitPower: 5 });
  clone('iron_mk6_rocket', 'm72_law_zm', { name: 'Mk6 Wrist-Rocket', hideGun: true, damage: 10000, minDamage: 10000, fireType: 'Full Auto', automatic: true, fireTime: .2, clipSize: 10, startAmmo: 30, maxAmmo: 30,
    reloadTime: 1.2, reloadEmptyTime: 1.2, projectileSpeed: 2300, explosionRadius: 200, explosionInnerDamage: 1200, explosionOuterDamage: 75, suitSound: 'suit_missile', suitPower: 5 });
  // Mk5 suitcase: carried as a weapon; firing it puts the Mark V on (Cheese Cube's stand hands it out)
  clone('iron_mk5_suitcase', 'm1911_zm', { name: 'Mk5 Suitcase', hideGun: true, suitcase: true, damage: 0, minDamage: 0, fireTime: 1, fireType: 'Single Shot', automatic: false,
    clipSize: 1, startAmmo: 1, maxAmmo: 1, reloadTime: 1, reloadEmptyTime: 1, suitPower: 0 });
  // Mk16 Stealth-Mode: firing it switches the cloak on or off (no damage)
  clone('iron_mk16_cloak', 'm1911_zm', { name: 'Mk16 Stealth-Mode', hideGun: true, cloakToggle: true, damage: 0, minDamage: 0, fireTime: 3.5, fireType: 'Single Shot', automatic: false,
    clipSize: 125, startAmmo: 500, maxAmmo: 500, reloadTime: 2, reloadEmptyTime: 2, suitPower: 0 });
  // the flamethrower mod (weapon-levels/flamer.js) burns for any weapon flagged `flamethrower`
  clone('iron_mk1_flamer', 'rpk_zm', { name: 'Mk1 Flamethrower', hideGun: true, flamethrower: true, clipSize: 100, startAmmo: 300, maxAmmo: 300, fireTime: .1, automatic: true, fireType: 'Full Auto',
    damage: 1, minDamage: 1, range: 40, pellets: 1, headMultiplier: 1, reloadTime: 1.83, reloadEmptyTime: 1.83, projectileSpeed: 0, explosionRadius: 0, suitPower: .25 });
  clone('iron_wm_minigun', 'hk21_zm', { name: 'War Machine Minigun', damage: 1000, minDamage: 90, fireTime: .1, clipSize: 125, startAmmo: 500, maxAmmo: 500, reloadTime: 5, reloadEmptyTime: 5,
    suitSound: 'suit_minigun', suitPower: .2 });
  clone('iron_wm_handgun', 'cz75_zm', { name: 'War Machine Handgun', fireType: 'Full Auto', automatic: true, damage: 750, minDamage: 90, fireTime: .15, clipSize: 125, startAmmo: 500, maxAmmo: 500,
    reloadTime: 2, reloadEmptyTime: 2, suitPower: .2 });
}

// Sounds (e.g. jarvisBase() + 'sounds/') played through the game's mixer.
export function soundPlayer(audio, base) {
  const LEVEL = 1 / .42, playing = new Set();
  const play = (name, { volume = .7, loop = false } = {}) => {
    try {
      const a = new Audio(base + name + '.ogg'); a.loop = loop;
      const ctx = audio?.ctx, master = audio?.master;
      if (ctx && master) {
        const g = ctx.createGain(); g.gain.value = volume * LEVEL; ctx.createMediaElementSource(a).connect(g).connect(master);
        Object.defineProperty(a, 'volume', { configurable: true, get: () => g.gain.value / LEVEL, set: v => { g.gain.value = Math.max(0, v) * LEVEL; } });
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } else a.volume = volume;
      a.play().catch(() => {}); playing.add(a); a.addEventListener('ended', () => playing.delete(a)); return a;
    } catch { return null; }
  };
  return { play, stopAll: () => { for (const a of playing) a.pause(); playing.clear(); } };
}

// Wearing a suit. `suits`: the caller's suit objects (SUITS entries plus `power`). hud: a createSuitHud() instance.
//   putOn(s, {quick}), takeOff(s, why), worn(), cloaked()
//   onOff(s): called after a suit comes off (Cheese Cube raises it back onto its stand)
export function createArmor({ api, host, session, player, sound, toast, announce, beep, hud, suits, onOff }) {
  const W = api.data?.weapons ?? {}, now = () => session.time, equipView = api.equipView;
  const voice = (n, v = .8) => sound?.('jarvis_' + n, { volume: v });
  let worn = null, originalSpeed = null, saved = null, spaceHeld = false, flying = false, wornBefore = false, lowWarned = false, critWarned = false, lastShots = 0, healthVoiceAt = 0;

  // suit weapons hide their base gun's mesh, leaving the arms; the view caches guns, so meshes are shown again after
  const hiddenGun = new Set(), isIn = (o, root) => { for (let p = o.parent; p; p = p.parent) if (p === root) return true; return false; };
  host.on('update', () => {
    const gun = api.view?.gun, hide = !!session.def?.hideGun;
    for (const o of hiddenGun) if (!hide || !gun || !o.parent || o.parent !== gun && !isIn(o, gun)) { o.visible = true; hiddenGun.delete(o); }
    if (hide && gun) gun.traverse(o => { if (o.isMesh && o.visible) { o.visible = false; hiddenGun.add(o); } });
  });
  // the suits' own fire sounds in place of the base guns'
  if (api.audio?.weapon) { const play = api.audio.weapon.bind(api.audio); api.audio.weapon = (kind, def, ...rest) => { if (kind === 'shot' && (def?.suitSound || def?.cloakToggle || def?.suitcase)) { if (def.suitSound) sound?.(def.suitSound, { volume: .7 }); return; } return play(kind, def, ...rest); }; }

  // the suit's health: maxHealth becomes the larger of the normal value and the suit's
  const own = Object.getOwnPropertyDescriptor(session, 'maxHealth');
  const baseMax = own?.get ? () => own.get.call(session) : () => own?.value ?? 100;
  Object.defineProperty(session, 'maxHealth', { configurable: true, get() { return Math.max(baseMax(), worn?.hp ?? 0); }, set() {} });

  addEventListener('keydown', e => { if (e.code === 'Space') spaceHeld = true; });
  addEventListener('keyup', e => { if (e.code === 'Space') spaceHeld = false; });
  addEventListener('blur', () => { spaceHeld = false; });
  const stats = () => { const b = window.kino.scoreboard?.stats?.() ?? {};
    return { kills: session.kills ?? b.k ?? 0, headshots: session.headshots ?? b.h ?? 0, gibs: window.kino.dismemberment?.gibs ?? 0,
      left: Math.max(0, (session.total ?? 0) - (session.killed ?? 0)), downs: b.d ?? 0, revives: b.r ?? 0 }; };
  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    for (const s of suits) if (s !== worn && s.power < MAX_POWER) s.power = Math.min(MAX_POWER, s.power + RECHARGE * step);
    if (!worn) { flying = false; lastShots = session.shots ?? 0; return; }
    if (['reviving', 'gameover'].includes(session.phase)) { takeOff(worn, 'The armor was lost'); return; }
    const grounded = player.isGrounded ?? player.onFloor;
    flying = spaceHeld && !grounded && worn.power > 0 && session.phase === 'fighting';
    if (flying) { worn.power -= FLY_DRAIN * step; player.velocity.y = Math.min(RISE_CAP, Math.max(player.velocity.y, 0) + THRUST * step); }
    const shots = session.shots ?? 0; if (shots > lastShots) worn.power -= (session.def?.suitPower ?? 0) * (shots - lastShots); lastShots = shots;
    worn.power = Math.max(0, worn.power); const power = worn.power;
    if (power < 25 && !lowWarned) { lowWarned = true; hud?.warn('POWER LEVELS LOW'); voice('power_low_' + Math.floor(Math.random() * 6)); }
    if (power < 11 && !critWarned) { critWarned = true; hud?.warn('POWER LEVELS CRITICAL'); voice('power_low_' + Math.floor(Math.random() * 6)); }
    if (session.health < 75 && now() >= healthVoiceAt) { healthVoiceAt = now() + 10; voice('health_low_' + Math.floor(Math.random() * 6)); }
    hud?.update(power, stats());
    if (power <= 0) takeOff(worn, 'Suit power depleted');
  });

  function putOn(s, { quick = false } = {}) {
    worn = s; session.health = session.maxHealth;
    if (!originalSpeed) originalSpeed = { move: player.moveSpeed, sprint: player.sprintSpeed };
    player.moveSpeed = originalSpeed.move * s.speed; player.sprintSpeed = s.noSprint ? player.moveSpeed : originalSpeed.sprint * s.speed;
    lowWarned = s.power < 25; critWarned = s.power < 11; lastShots = session.shots ?? 0;
    const kit = s.weapons.filter(id => W[id]);
    if (kit.length) {
      session.cancelReload?.(); saved = { inventory: session.inventory.map(w => ({ ...w })), slot: session.slot };
      session.inventory = kit.map(id => ({ id, mag: W[id].clipSize, reserve: Math.max(0, W[id].maxAmmo - W[id].clipSize), upgraded: false })); session.slot = 0; equipView?.();
    }
    hud?.show(s.id); sound?.(quick ? 'suit_up_quick' : s.id === 'mk1' ? 'suit_on_mk1' : 'suit_on', { volume: .7 });
    voice(wornBefore ? 'suit_up_0' + Math.floor(Math.random() * 3) : 'suit_up_first'); wornBefore = true;
    announce?.(`${s.name} armor`, 'SUIT ONLINE', 3); beep?.();
    host.emit('suitChange', { suit: s.id, on: true });
  }
  function takeOff(s, why) {
    if (worn !== s) return;
    if (cloaked) setCloak(false);
    worn = null;
    // your guns come back (anything bought while suited is kept, in front)
    if (saved) {
      const extra = session.inventory.filter(w => !W[w.id]?.suitWeapon);
      session.cancelReload?.(); session.inventory = [...extra, ...saved.inventory].slice(0, Math.max(saved.inventory.length, extra.length));
      session.slot = extra.length ? 0 : Math.min(saved.slot, session.inventory.length - 1); saved = null; equipView?.();
    }
    if (originalSpeed) { player.moveSpeed = originalSpeed.move; player.sprintSpeed = originalSpeed.sprint; }
    if (session.health > session.maxHealth) session.health = session.maxHealth;
    hud?.hide(); flying = false; sound?.(s.id === 'mk1' ? 'suit_off_mk1' : 'suit_off', { volume: .7 });
    voice('charging'); toast?.(why ?? `${s.name} armor is recharging`, 3);
    host.emit('suitChange', { suit: s.id, on: false });
    onOff?.(s);
  }

  // Stealth-Mode (the Mk XVI's cloak weapon): fire it to cloak, again to uncloak, each after 1.5 s. Cloaked, zombies that
  // would pick you wander instead, and the suit loses 1 power a second.
  let cloaked = false, cloakPrev = null;
  const cloakTarget = (z, local) => { const v = cloakPrev ? cloakPrev.call(api.enemies, z, local) : { position: local }; if (!cloaked || v?.id) return v;
    z.cloakSpot ??= z.root.position.clone().add(new THREE.Vector3((Math.random() - .5) * 160, 0, (Math.random() - .5) * 160));
    return { id: 'cloaked', down: true, position: z.cloakSpot }; };
  function setCloak(on) {
    if (cloaked === on) return; cloaked = on; hud?.setCloak?.(on); sound?.(on ? 'suit_cloak_on' : 'suit_cloak_off', { volume: .7 });
    const en = api.enemies;
    if (on) { if (en.targetFor !== cloakTarget) { cloakPrev = en.targetFor ?? null; en.targetFor = cloakTarget; } }
    else { if (en.targetFor === cloakTarget) en.targetFor = cloakPrev ?? undefined; cloakPrev = null; for (const z of en.list) z.cloakSpot = null; }
  }
  let cloakShots = 0, cloakAt = 0;
  host.on('update', dt => {
    const step = typeof dt === 'number' && dt > 0 && dt < .25 ? dt : 1 / 60;
    if (!worn?.weapons.includes('iron_mk16_cloak')) { if (cloaked) setCloak(false); cloakAt = 0; cloakShots = session.shots ?? 0; return; }
    const shots = session.shots ?? 0;
    if (shots > cloakShots && session.def?.cloakToggle && !cloakAt) cloakAt = now() + 1.5; cloakShots = shots;
    if (cloakAt && now() >= cloakAt) { cloakAt = 0; setCloak(!cloaked); }
    if (cloaked) { worn.power = Math.max(0, worn.power - step);
      if (api.enemies.targetFor !== cloakTarget) { cloakPrev = api.enemies.targetFor ?? null; api.enemies.targetFor = cloakTarget; } }   // co-op may swap the hook
  });

  host.on('reset', () => {
    wornBefore = false; if (cloaked) setCloak(false);
    if (worn) { const s = worn; worn = null; if (originalSpeed) { player.moveSpeed = originalSpeed.move; player.sprintSpeed = originalSpeed.sprint; } hud?.hide(); host.emit('suitChange', { suit: s.id, on: false }); }
    saved = null; for (const s of suits) s.power = MAX_POWER;
  });
  return { putOn, takeOff, worn: () => worn, cloaked: () => cloaked, voice };
}
