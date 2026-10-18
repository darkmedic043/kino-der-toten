// Stamin-Up, Deadshot Daiquiri, Mule Kick and PhD Flopper for every map (not part of upstream). Moon has them natively and keeps its
// own versions (moon-session.js, maps/moon.js); everywhere else:
//   - the perk table gets their names, prices and HUD icons (the engine's buy prompt, HUD and Perk-a-Cola use it)
//   - their drinks come from data.json (Moon's bottles and drink animation, merged into the game data by the mod loader)
//   - Stamin-Up: walk and sprint speeds x1.1 / x1.16 (Moon's 190 -> 209, 285 -> 330). The speeds become getters over a
//     base value, so whatever else sets them (mech, suits) sets the base and the perk still applies on top.
//   - Deadshot: headshots deal 25% more (bullets); the tighter hip fire (x0.5 spread) is in engine.js
//   - Mule Kick: the third weapon slot is in rules.js (Session.giveWeapon / clearPerks)
//   - PhD Flopper (BO1's _zombiemode_perks.gsc / _zombiemode.gsc): no fall damage (the fall-damage mod), and a dive to
//     prone that would have taken fall damage explodes instead (radius 300, 5000 at the centre down to 1000 at the edge);
//     your own explosives can't hurt you (throwables mod, kino-features blast, the engine's grenade). Runs on Moon too
//     (Moon's session has the perk and its gas immunity natively, but no dive explosion).
import * as THREE from 'three';
import { BO7_PERKS, BO7_ICONS, setupBo7Perks } from './bo7-perks.js';
import { setupReaperPerks } from './reaper-perks.js';
export const MORE_PERKS = {
  specialty_longersprint: { name: 'Stamin-Up', price: 2000, color: '#ebbd4b', icon: 'S' },
  specialty_deadshot: { name: 'Deadshot Daiquiri', price: 1500, color: '#9da8ac', icon: 'DS' },
  specialty_additionalprimaryweapon: { name: 'Mule Kick', price: 4000, color: '#82a86c', icon: 'MK' },
  specialty_flakjacket: { name: 'PhD Flopper', price: 2000, color: '#be83da', icon: 'PhD' },
  ...BO7_PERKS,   // Vulture Aid, Widow's Wine, Wisp Tea, Death Perception, Elemental Pop, Melee Macchiato (bo7-perks.js)
};
// their purchase stings: Moon's (BO1) recordings, played by the engine as audio.play(<perk id>)
const STINGS = { specialty_longersprint: 'moon/audio/bce4d0477d3fb5e84e5d.ogg', specialty_deadshot: 'moon/audio/b08fede0bf04968b7f78.ogg',
  specialty_additionalprimaryweapon: 'moon/audio/5319f7e83b450594a1f5.ogg', specialty_flakjacket: 'moon/audio/dbcd7ae5a586bd35c097.ogg' };
const PHD = 'specialty_flakjacket', PHD_RADIUS = 300, PHD_MAX = 5000, PHD_MIN = 1000;
// HUD icons (git-ignored icons/: third-party art the user supplied, so not in the repo or Rind installs): the letter badge
// becomes the icon, as the hud mod does for Kino's four perks. Moon's HUD (same #perks, same titles) gets them too.
const ICONS = { 'Stamin-Up': 'staminup.webp', 'Deadshot Daiquiri': 'deadshot.webp', 'Mule Kick': 'mulekick.webp', 'PhD Flopper': 'phd.webp',
  'Quick Revive': 'quickrevive.webp', Juggernog: 'juggernog.webp', 'Speed Cola': 'speedcola.webp', 'Double Tap': 'doubletap.webp', ...BO7_ICONS };   // the last four replace the hud mod's BO1 icons
function addIcons(base) {
  if (document.getElementById('perks-plus-icons')) return;
  const sel = Object.keys(ICONS).map(t => `#perks span[title="${t}"]`).join(',');
  const style = document.createElement('style'); style.id = 'perks-plus-icons';
  style.textContent = `:is(${sel}){border:0;border-radius:0;width:30px;height:30px;font-size:0;color:transparent;background-color:transparent!important;` +
    `background-size:contain!important;background-repeat:no-repeat!important;background-position:center!important;filter:drop-shadow(0 1px 2px #000)}` +
    Object.entries(ICONS).map(([t, f]) => `#perks span[title="${t}"]{background-image:url(${new URL('icons/' + f, base).href})!important}`).join('');
  document.head.append(style);
}
export default function setup(api) {
  const { host, session, player, world, map, audio, mod, enemies, scene, perkInfo, camera, powerups, announce, toast } = api;
  addIcons(mod?.url ?? import.meta.url);
  phdFlopper({ host, session, player, world, audio, enemies, scene });
  // the Reaper Collection perks: working but switched off (cheat console only; reaper-perks.js, docs/fork/reaper-perks.md)
  const base = new URL('./', mod?.url ?? import.meta.url);
  fetch(new URL('reaper-perks.json', base)).then(r => r.ok ? r.json() : null).then(j => { if (j?.perks) setupReaperPerks(api, j.perks, base); })
    .catch(e => console.warn('[perks-plus] reaper perks', e));
  if (map?.id === 'moon') return;
  const table = world?.perkInfo ?? perkInfo;   // custom maps' table, else the engine's (Kino), so the terminal can sell them anywhere
  if (table) for (const [id, p] of Object.entries(MORE_PERKS)) table[id] ??= p;
  if (audio?.manifest) for (const [id, url] of Object.entries(STINGS)) audio.manifest[id] ??= { url };
  const has = id => session.perks?.has(id);
  for (const [key, factor] of [['moveSpeed', 209 / 190], ['sprintSpeed', 330 / 285]]) {
    let base = player[key];
    Object.defineProperty(player, key, { configurable: true, get: () => base * (has('specialty_longersprint') ? factor : 1) * (window.kino?.bo7Perks?.speedMul?.() ?? 1), set: v => { base = v; } });   // bo7Perks: Melee Macchiato's Stick 'n Move
  }
  host.on('beforeEnemyDamage', e => { if (e.head && e.cause === 'bullet' && !e.melee && has('specialty_deadshot')) e.amount *= 1.25; });
  setupBo7Perks({ host, session, player, enemies, scene, camera, audio, world, powerups, announce, toast });
}

// PhD Flopper (BO1 _zombiemode.gsc player_damage_override): no fall damage, and a dive to prone that would have taken
// fall damage (the fall-damage mod's 'fall' event, dive set) explodes instead.
function phdFlopper({ host, session, player, world, audio, enemies, scene }) {
  let ring = null;
  host.on('fall', e => {
    if (!session.perks?.has(PHD)) return;
    e.amount = 0;
    if (e.dive) flop(e.position);
  });
  host.on('update', dt => {
    if (ring) { ring.t += dt; const k = ring.t / .45; ring.mesh.scale.setScalar(20 + k * PHD_RADIUS * (ring.scale ?? 1)); ring.mesh.material.opacity = .8 * (1 - k); if (k >= 1) { ring.mesh.removeFromParent(); ring = null; } }
  });
  // research augments (mods/research) use it too: opts {power (damage ×), echo}; window.kino.phdScale() widens every blast,
  // and each blast emits host 'phdBlast' {at, echo}
  (window.kino ??= {}).phd = { flop: (at, opts) => flop(at, opts) };
  function flop(at, { power = 1, echo = false } = {}) {
    const R = PHD_RADIUS * (window.kino?.phdScale?.() ?? 1);
    const up = new THREE.Vector3(0, 30, 0), from = at.clone().add(up);
    for (const z of [...(enemies?.list ?? [])]) {
      const p = z.root.position.clone().add(up), d = p.distanceTo(from);
      if (d < R && (world.lineClear?.(from, p) ?? true)) enemies.hurt(z, power * THREE.MathUtils.lerp(PHD_MAX, PHD_MIN, d / R), false, false, 'explosion');
    }
    audio?.play?.('explosion');
    if (window.kino?.fx?.explosion) window.kino.fx.explosion(at.clone().add(new THREE.Vector3(0, 8, 0)), 1.2, 0xb36cff);
    else host.emit('effect', { position: at, color: 0xffb34e, count: 30, handled: false });
    // a purple shock ring across the floor, and the screen flash (BO1's dive2nuke visionset)
    if (scene) {
      ring?.mesh.removeFromParent();
      const mesh = new THREE.Mesh(new THREE.RingGeometry(.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xc58cff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.copy(at).y += 2; scene.add(mesh); ring = { mesh, t: 0, scale: R / PHD_RADIUS };
    }
    const veil = document.getElementById('phd-flash') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'phd-flash' }));
    veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;background:radial-gradient(ellipse,#c58cff33 20%,#7a2fd0aa);opacity:1;transition:none';
    void veil.offsetWidth; veil.style.transition = 'opacity .6s ease-out'; veil.style.opacity = 0;
    host.emit('phdBlast', { at: at.clone(), echo });
  }
}
