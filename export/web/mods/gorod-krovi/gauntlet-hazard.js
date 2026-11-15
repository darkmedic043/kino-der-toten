// The dragon's fire on the streets and the napalm zombies (BO3 zm_stalingrad_dragon_strafe / _zm_ai_napalm, spec
// scratch/gk/spec/gauntlet.md step 1-2). A burn: 10 s of fire over one of BO3's eight burn volumes; a player inside
// takes 2% of their health every 0.1 s (through the shield's gk.burn when it is there: the held shield blocks it), and
// every ordinary zombie that walks into it catches fire and becomes a napalm zombie: 3/4 health, sprints, burns, and
// blows up when it dies (128 around: 70 to 30 damage to a player, kills ordinary zombies), leaving nothing.
// The map's dragon doesn't strafe yet (dragon.js only circles), so this module carries its own stand-in: while the egg
// quest needs fire (the egg lying on a cook spot, then the napalm-kills step) a burn starts every so often. Convention
// for a later dragon: call gk.hazard.start(area, dur, { dragon: true }) when it breathes on an area (that ends the
// stand-in for good), or listen to 'dragon:hazard' {area, on, dur, at, fallback} to draw its own breath.
import * as THREE from 'three';
import { makeSfx } from './dragon-sfx.js';

const W = (x, y, z) => new THREE.Vector3(x, z, -y);
// BO3's burn volumes (dragon_strafe_* triggers), centres in CoD coordinates; the four with a cook spot first
export const AREAS = {
  fountain: W(199, 953, 127), opera_street: W(-25, 4079, 59), red_brick: W(-879, 3055, 363), yellow: W(870, 2898, 244),
  alley: W(21, 2534, -49), factory: W(-2129, 2645, 355), library: W(2315, 2851, -43), department_store: W(-5, 1723, 384),
};
const R = 320, DY = 220, BLAST = 128;
export const inArea = (name, p) => { const c = AREAS[name]; return !!c && Math.hypot(p.x - c.x, p.z - c.z) < R && Math.abs(p.y - c.y) < DY; };
const tough = z => !!z?.boss || /raz|sentinel|mech|nikolai|mangler|panzer/.test(z?.kind ?? '');

export function setupHazard(api, gk, { want, sound } = {}) {
  const { host, enemies, session, player, world } = api;
  const kino = window.kino, sx = makeSfx(api);
  const H = { burn: null, dragon: false, timer: 20, lastArea: null, napalm: new Set(), spawnMark: 0 };
  const chest = z => z.root.position.clone().add(new THREE.Vector3(0, 40, 0));

  function start(area, dur = 10, { dragon = false, at = null } = {}) {
    if (!AREAS[area]) return false;
    if (dragon) H.dragon = true;
    H.burn = { area, t: 0, dur, tick: 0, fx: 0, by: dragon ? 'dragon' : 'fallback' };
    H.lastArea = area;
    if (!dragon) { sx.sfxAt('breath_pre', AREAS[area], .9, 4000); setTimeout(() => { if (H.burn?.area === area) sx.sfxAt('breath', AREAS[area], 1, 4000); }, 900); }
    gk.emit('dragon:hazard', { area, on: true, dur, at: at ?? AREAS[area].clone(), fallback: !dragon });
    return true;
  }
  function stop() { if (!H.burn) return; const area = H.burn.area; H.burn = null; gk.emit('dragon:hazard', { area, on: false, dur: 0, at: AREAS[area].clone(), fallback: false }); }

  // ---- napalm zombies ----
  function runner(z) {
    z.speed = Math.max(z.speed ?? 0, 205);
    const a = enemies.anims?.ai_zombie_sprint_v1 ?? enemies.anims?.ai_zombie_sprint_v2; if (!a || !z.rig) return;
    const was = z.rig.current === 'walk'; z.rig.actions.walk?.stop(); z.rig.add('walk', a, true);
    if (was) { z.rig.current = null; z.rig.play('walk'); }
  }
  function napalm(z) {
    if (!z || z.napalm || z.kind !== 'zombie' || tough(z) || z.special || !enemies.list.includes(z)) return false;
    z.napalm = true; z.elemental = 'napalm';
    z.health = Math.max(1, Math.round(z.health * .75)); z.maxHealth = Math.max(1, Math.round((z.maxHealth ?? z.health) * .75));
    runner(z); H.napalm.add(z); kino.fx?.burn?.(chest(z)); sound?.('body_burn', .5, z.root.position);
    return true;
  }
  host.on('kill', e => {
    const z = e?.enemy; if (!z?.napalm || !H.napalm.has(z)) return;
    H.napalm.delete(z); const at = chest(z);
    kino.fx?.explosion?.(at.clone(), .6, 0xff7a2a); sx.sfxAt('breath_pre', at, .5, 2000);
    // the blast: players 70 at the centre to 30 at the edge (MOD_EXPLOSIVE: a little), ordinary zombies die
    const feet = player.getFeetPosition(), d = feet.clone().add(new THREE.Vector3(0, 30, 0)).distanceTo(at);
    if (d < BLAST && !player.down && !session.down) { const n = Math.round(70 - 40 * d / BLAST); (gk.burn?.(n) ?? api.damage?.(n)); }
    for (const o of [...enemies.list]) if (o !== z && !tough(o) && !o.special && chest(o).distanceTo(at) < BLAST) { enemies.hurt(o, 1e9, false, false, 'napalm', false); }
    setTimeout(() => { if (!enemies.list.includes(z)) z.root.visible = false; }, 60);   // annihilated: no body left
    gk.emit('napalm:death', { z, at, cause: z.lastCause ?? null });
  });

  host.on('update', dt => {
    if (!dt || session.phase === 'over') return;
    // napalm zombies keep burning
    for (const z of H.napalm) { if (!enemies.list.includes(z)) { H.napalm.delete(z); continue; } if (Math.random() < dt * 9) kino.fx?.burn?.(chest(z)); }
    const b = H.burn;
    if (b) {
      b.t += dt; const c = AREAS[b.area];
      if ((b.fx -= dt) <= 0) {   // flames over the volume (the shield and a later dragon draw their own breath)
        b.fx = .05;
        for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R * .9, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
          const y = world.surfaceY?.(x, c.y + 60, z) ?? world.surfaceY?.(x, c.y, z) ?? c.y - 40;
          kino.fx?.emit?.({ key: 'fire', at: new THREE.Vector3(x, y + 10, z), vel: new THREE.Vector3(0, 70 + Math.random() * 60, 0), size: [30, 80], life: .7, fade: [.1, .5], additive: true, opacity: .85 }); }
      }
      if ((b.tick -= dt) <= 0) {
        b.tick = .1;
        const feet = player.getFeetPosition();
        if (inArea(b.area, feet) && !player.down && !session.down) { const n = Math.max(1, Math.round((session.maxHealth ?? 100) * .02)); gk.burn?.(n) ?? api.damage?.(n); }
        for (const z of [...enemies.list]) if (inArea(b.area, z.root.position)) napalm(z);
      }
      if (b.t >= b.dur) stop();
    }
    // the stand-in dragon: only while the quest needs fire and no real dragon has breathed yet
    const need = !H.dragon && !H.burn && want?.();
    if (need) {
      if ((H.timer -= dt) <= 0) {
        H.timer = need.every ?? 60 + Math.random() * 30;
        if (need.area) start(need.area, 10);
        else { const feet = player.getFeetPosition(); let best = null, bd = 1500;
          for (const [n, c] of Object.entries(AREAS)) { const d = c.distanceTo(feet); if (d < bd) { bd = d; best = n; } }
          if (best) start(best, 10);
          else if (need.spawnNapalm) { const z = enemies.list.filter(z => z.kind === 'zombie' && !z.napalm && z.state !== 'rising' && !tough(z)).sort((a, b) => a.root.position.distanceTo(feet) - b.root.position.distanceTo(feet))[0]; if (z) napalm(z); else H.timer = 3; } }
      }
    } else if (!H.burn) H.timer = Math.min(Math.max(H.timer, 15), 25);
  });
  host.on('reset', () => { H.burn = null; H.napalm.clear(); H.timer = 20; });

  const hazard = { start, stop, active: () => (H.burn ? { ...H.burn } : null), areas: AREAS, inArea, napalm, runner,
    get dragon() { return H.dragon; }, set timer(v) { H.timer = v; }, get timer() { return H.timer; } };
  gk.hazard = hazard;
  return hazard;
}
