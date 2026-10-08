// Stamin-Up, Deadshot Daiquiri, Mule Kick and PhD Flopper for every map (not part of upstream). Moon has them natively and keeps its
// own versions (moon-session.js, maps/moon.js); everywhere else:
//   - the perk table gets their names, prices and HUD icons (the engine's buy prompt, HUD and Perk-a-Cola use it)
//   - their drinks come from data.json (Moon's bottles and drink animation, merged into the game data by the mod loader)
//   - Stamin-Up: walk and sprint speeds x1.1 / x1.16 (Moon's 190 -> 209, 285 -> 330). The speeds become getters over a
//     base value, so whatever else sets them (mech, suits) sets the base and the perk still applies on top.
//   - Deadshot: headshots deal 25% more (bullets); the tighter hip fire (x0.5 spread) is in engine.js
//   - Mule Kick: the third weapon slot is in rules.js (Session.giveWeapon / clearPerks)
//   - PhD Flopper (BO1's _zombiemode_perks.gsc / _zombiemode.gsc): a dive to prone that lands from a fall sets off an
//     explosion instead of the fall (radius 300, 5000 damage at the centre down to 1000 at the edge, MOD_GRENADE_SPLASH);
//     your own explosives can't hurt you (throwables mod, kino-features blast, the engine's grenade). Runs on Moon too
//     (Moon's session has the perk and its gas immunity natively, but no dive explosion).
import * as THREE from 'three';
export const MORE_PERKS = {
  specialty_longersprint: { name: 'Stamin-Up', price: 2000, color: '#ebbd4b', icon: 'S' },
  specialty_deadshot: { name: 'Deadshot Daiquiri', price: 1500, color: '#9da8ac', icon: 'DS' },
  specialty_additionalprimaryweapon: { name: 'Mule Kick', price: 4000, color: '#82a86c', icon: 'MK' },
  specialty_flakjacket: { name: 'PhD Flopper', price: 2000, color: '#be83da', icon: 'PhD' },
};
// their purchase stings: Moon's (BO1) recordings, played by the engine as audio.play(<perk id>)
const STINGS = { specialty_longersprint: 'moon/audio/bce4d0477d3fb5e84e5d.ogg', specialty_deadshot: 'moon/audio/b08fede0bf04968b7f78.ogg',
  specialty_additionalprimaryweapon: 'moon/audio/5319f7e83b450594a1f5.ogg', specialty_flakjacket: 'moon/audio/dbcd7ae5a586bd35c097.ogg' };
// PhD Flopper: the landing must be at least this far below where the dive started (BO1 only flops on a dive that takes
// fall damage; this game has no fall damage, and a dive's own hop is about 22 high, so a flat-ground dive doesn't count)
const PHD = 'specialty_flakjacket', PHD_DROP = 36, PHD_RADIUS = 300, PHD_MAX = 5000, PHD_MIN = 1000;
// HUD icons (git-ignored icons/: third-party art the user supplied, so not in the repo or Rind installs): the letter badge
// becomes the icon, as the hud mod does for Kino's four perks. Moon's HUD (same #perks, same titles) gets them too.
const ICONS = { 'Stamin-Up': 'staminup.webp', 'Deadshot Daiquiri': 'deadshot.webp' };
function addIcons(base) {
  if (document.getElementById('perks-plus-icons')) return;
  const sel = Object.keys(ICONS).map(t => `#perks span[title="${t}"]`).join(',');
  const style = document.createElement('style'); style.id = 'perks-plus-icons';
  style.textContent = `:is(${sel}){border:0;border-radius:0;width:30px;height:30px;font-size:0;color:transparent;background-color:transparent!important;` +
    `background-size:contain!important;background-repeat:no-repeat!important;background-position:center!important;filter:drop-shadow(0 1px 2px #000)}` +
    Object.entries(ICONS).map(([t, f]) => `#perks span[title="${t}"]{background-image:url(${new URL('icons/' + f, base).href})!important}`).join('');
  document.head.append(style);
}
export default function setup({ host, session, player, world, map, audio, mod, enemies, scene }) {
  addIcons(mod?.url ?? import.meta.url);
  phdFlopper({ host, session, player, world, audio, enemies, scene });
  if (map?.id === 'moon') return;
  const table = world?.perkInfo;
  if (table) for (const [id, p] of Object.entries(MORE_PERKS)) table[id] ??= p;
  if (audio?.manifest) for (const [id, url] of Object.entries(STINGS)) audio.manifest[id] ??= { url };
  const has = id => session.perks?.has(id);
  for (const [key, factor] of [['moveSpeed', 209 / 190], ['sprintSpeed', 330 / 285]]) {
    let base = player[key];
    Object.defineProperty(player, key, { configurable: true, get: () => base * (has('specialty_longersprint') ? factor : 1), set: v => { base = v; } });
  }
  host.on('beforeEnemyDamage', e => { if (e.head && e.cause === 'bullet' && !e.melee && has('specialty_deadshot')) e.amount *= 1.25; });
}

// PhD Flopper's dive explosion. A dive is measured from its take-off; when it ends (diveLand, which can fire mid-air on a
// long fall) the explosion waits for the actual landing.
function phdFlopper({ host, session, player, world, audio, enemies, scene }) {
  let dive = null, ring = null;
  const feet = () => player.getFeetPosition();
  host.on('dive', () => { dive = { y: feet().y, landed: false }; });
  host.on('diveLand', () => { if (dive) dive.landed = true; });
  host.on('reset', () => { dive = null; });
  host.on('update', dt => {
    if (ring) { ring.t += dt; const k = ring.t / .45; ring.mesh.scale.setScalar(20 + k * PHD_RADIUS); ring.mesh.material.opacity = .8 * (1 - k); if (k >= 1) { ring.mesh.removeFromParent(); ring = null; } }
    if (!dive?.landed || !player.onFloor) return;
    const at = feet(), drop = dive.y - at.y; dive = null;
    if (session.perks?.has(PHD) && drop >= PHD_DROP) flop(at);
  });
  function flop(at) {
    const up = new THREE.Vector3(0, 30, 0), from = at.clone().add(up);
    for (const z of [...(enemies?.list ?? [])]) {
      const p = z.root.position.clone().add(up), d = p.distanceTo(from);
      if (d < PHD_RADIUS && (world.lineClear?.(from, p) ?? true)) enemies.hurt(z, THREE.MathUtils.lerp(PHD_MAX, PHD_MIN, d / PHD_RADIUS), false, false, 'explosion');
    }
    audio?.play?.('explosion');
    if (window.kino?.fx?.explosion) window.kino.fx.explosion(at.clone().add(new THREE.Vector3(0, 8, 0)), 1.2, 0xb36cff);
    else host.emit('effect', { position: at, color: 0xffb34e, count: 30, handled: false });
    // a purple shock ring across the floor, and the screen flash (BO1's dive2nuke visionset)
    if (scene) {
      ring?.mesh.removeFromParent();
      const mesh = new THREE.Mesh(new THREE.RingGeometry(.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xc58cff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.copy(at).y += 2; scene.add(mesh); ring = { mesh, t: 0 };
    }
    const veil = document.getElementById('phd-flash') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'phd-flash' }));
    veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;background:radial-gradient(ellipse,#c58cff33 20%,#7a2fd0aa);opacity:1;transition:none';
    void veil.offsetWidth; veil.style.transition = 'opacity .6s ease-out'; veil.style.opacity = 0;
  }
}
