// Gorod Krovi's wearables (zm_stalingrad_wearables.gsc, spec scratch/gk/spec/side-eggs.md §9, 2026-11-15).
//   Mangler helmet: 5 Mangler arm cannons and 5 Mangler face masks shot off (raz.js 'raz:gun', 'raz:part' head).
//   Valkyrie hat: 5 drones with all three arms shot off and 5 drone cameras shot out (sentinel.js 'sentinel:part').
//   Dragon wings: the shield used (dragon_shield_used), the Gauntlet of Siegfried taken ('gauntlet:given'), the Dragon
//     Strike taken (dragonstrikeacquired), and a dragon ride from each of the three roosts (library, factory, judicial).
//   The counts are shared (co-op: every player's parts add up). Each counted step plays a short sting; the last one
//   puts the wearable on its stand (the department store's upper floors) and toasts it. Use it to wear it; only one
//   at a time (wearing another swaps); lost when the game ends.
//   While worn: the helmet halves Manglers' damage, the hat halves the drones', the wings halve fire and explosions
//   (gk.burn: the dragon's breath and street fire, napalm blasts, the fire trap; and every ':blast' boss hit, through
//   gk.dmgScale, which boss-common's kit.hitPlayer asks). The wings also show three small wings at the roosts, for the
//   wearer only: use one to fly to Pavlov's roof (counts as a dragon landing there).
// In first person the worn model isn't drawn (the characters mod has no hat socket yet). Host/solo only.
// Debug: kino.gorod.wear.{state, unlock(kind), wear(kind), step(kind)}.
import * as THREE from 'three';
import { settings } from '../../settings.js';
import { sceneData, makeProp, place, moved, W } from './scene-props.js';

const SPOTS = {
  raz: { key: 'wear_raz', at: [-1046.15, 1755.65, 240.234], ang: [273, 59.9976, -59.9978], name: 'Mangler Helmet', sound: 'wear_helmet' },
  sentinel: { key: 'wear_sentinel', at: [110.271, 1690.54, 242], ang: [270, 0, 3.99868], name: 'Valkyrie Hat', sound: 'wear_helmet' },
  wings: { key: 'wear_wings', at: [-738.994, 1454.91, 385.103], ang: [270, 0, 132.297], name: 'Dragon Wings', sound: 'wear_wings' },
};
const PADS = [[[263, 5872, 365], [270, 70.0169, 169.983]], [[-2632, 2919, 548], [270, 180, 180]], [[2716, 2825, 58], [270, 0, -180]]];
const PAVLOV = [[-2859, 21437.8, 684], [-2896.25, 21437.8, 684]];
const NEED = 5;

export default async function setupWearables(api, gk) {
  const { world, session, player, camera, scene } = api, host = api.host;
  if (api.sync && api.sync.isHost === false) return;
  const J = await sceneData();
  const models = {}, pads = [];
  if (J) {
    await Promise.all(Object.entries(SPOTS).map(async ([k, s]) => { models[k] = await makeProp(J, s.key).catch(() => null); }));
    for (let i = 0; i < 3; i++) pads.push(await makeProp(J, 'wear_wings').catch(() => null));
  }
  const BASE = new URL('../maps/gorod-krovi/audio/', import.meta.url).href;
  const level = v => (api.audio?.enabled === false ? 0 : Math.max(0, Math.min(1, v * (settings.volume ?? 1))));
  const sfx = (name, vol = 1) => { const a = new Audio(BASE + name + '.ogg'); a.volume = level(vol); a.play().catch(() => {}); return a; };

  const S = { worn: null, open: new Set(), raz: { arms: 0, masks: 0 }, sentinel: { arms: 0, cams: 0 }, wings: { shield: false, gauntlet: false, strike: false, roosts: new Set() }, rideFrom: null, log: [] };
  const note = m => { S.log.push(`${(session.time ?? 0).toFixed(1)} ${m}`); if (S.log.length > 40) S.log.shift(); };

  for (const [k, s] of Object.entries(SPOTS)) {
    const P = models[k]; if (P) { place(P, s.at, s.ang); P.root.visible = false; P.root.userData.noMerge = true; scene.add(P.root); }
    const at = W(...s.at);
    world.addInteraction({
      position: at, hidden: () => !S.open.has(k),
      text: () => (S.worn === k ? `${s.name} · equipped` : `Wear the ${s.name}`),
      use: () => { if (S.worn === k || session.phase === 'reviving') return false; wear(k); return true; },
    });
  }
  PADS.forEach(([p, a], i) => {
    const P = pads[i]; if (P) { place(P, p, a); P.root.scale.multiplyScalar(.3); moved(P.root); P.root.visible = false; scene.add(P.root); }
    world.addInteraction({ position: W(...p), hidden: () => S.worn !== 'wings', text: () => "Fly to Pavlov's House", use: () => fly(i) });
  });
  const showPads = () => { for (const P of pads) if (P) P.root.visible = S.worn === 'wings'; };

  function wear(k) {
    S.worn = k; sfx(SPOTS[k].sound, .9); showPads();
    api.toast?.(`${SPOTS[k].name} · ${k === 'raz' ? 'Manglers do half damage' : k === 'sentinel' ? 'Valkyrie drones do half damage' : 'fire and explosions do half damage · fly from the dragon roosts'}`, 4);
    note('wear ' + k); gk.emit('wear', k);
  }
  function unwear() { if (!S.worn) return; note('lost ' + S.worn); S.worn = null; showPads(); }
  function fly(i) {
    if (S.worn !== 'wings' || session.phase === 'reviving') return false;
    sfx('wear_teleport', .9);
    const slot = (api.sync?.slot?.() ?? 0) % 2, to = W(...PAVLOV[slot]);
    player.setPosition(to.add(new THREE.Vector3(0, 2, 0)));
    session.flags.add('zone:pavlovsb'); gk.emit('dragon:landed', 'pavlovsb'); note('wings flight ' + i);
    return true;
  }
  function unlock(k) {
    if (S.open.has(k)) return; S.open.add(k);
    if (models[k]) models[k].root.visible = true;
    sfx('challenge_all', .9); api.toast?.(`${SPOTS[k].name} unlocked · on the department store's upper floor`, 4); note('unlock ' + k); gk.emit('wear:unlock', k);
  }
  const step = () => sfx('challenge_done', .6);
  function check() {
    if (S.raz.arms >= NEED && S.raz.masks >= NEED) unlock('raz');
    if (S.sentinel.arms >= NEED && S.sentinel.cams >= NEED) unlock('sentinel');
    const w = S.wings; if (w.shield && w.gauntlet && w.strike && w.roosts.size >= 3) unlock('wings');
  }
  const count = (o, f) => { if (o[f] >= NEED) return; o[f]++; step(); check(); };
  gk.on('raz:gun', () => count(S.raz, 'arms'));
  gk.on('raz:part', e => { if (e?.part === 'head') count(S.raz, 'masks'); });
  gk.on('sentinel:part', e => {
    if (e?.part === 'camera') count(S.sentinel, 'cams');
    else if (/^arm/.test(e?.part ?? '') && ['armL', 'armR', 'armT'].every(a => e.z?.broken?.has(a))) count(S.sentinel, 'arms');
  });
  const wingStep = f => { const w = S.wings; if (w[f]) return; w[f] = true; step(); check(); };
  gk.on('gauntlet:given', () => wingStep('gauntlet'));
  gk.on('dragon:ride', site => { S.rideFrom = site; });
  gk.on('dragon:landed', () => {
    const r = S.rideFrom; S.rideFrom = null;
    if (r && !S.wings.roosts.has(r)) { S.wings.roosts.add(r); step(); check(); }
  });
  let poll = 0;
  host.on('update', dt => {
    if ((poll -= dt) > 0) return; poll = .5;
    if (!S.wings.shield && gk.hasFlag('dragon_shield_used')) wingStep('shield');
    if (!S.wings.strike && gk.hasFlag('dragonstrikeacquired')) wingStep('strike');
    if (S.worn && session.phase === 'gameover') unwear();
  });

  // ---- the halved damage ------------------------------------------------------------------------------------------------
  const me = id => !api.sync || id == null || id === 'solo' || id === api.sync.me;
  gk.dmgScale = (kind = '', id) => {
    if (!S.worn || !me(id)) return 1;
    if (S.worn === 'raz' && kind.startsWith('raz')) return .5;
    if (S.worn === 'sentinel' && kind.startsWith('sentinel')) return .5;
    if (S.worn === 'wings' && kind.endsWith(':blast')) return .5;
    return 1;
  };
  gk.on('parts:ready', () => {   // shield.js's gk.burn (fire on the player): the wings halve it
    const burn0 = gk.burn ?? (n => (api.damage?.(n), n));
    gk.burn = n => burn0(S.worn === 'wings' ? Math.max(1, Math.round(n / 2)) : n);
  });
  host.on('gameOver', () => unwear());
  host.on('reset', () => { unwear(); S.open.clear(); Object.assign(S.raz, { arms: 0, masks: 0 }); Object.assign(S.sentinel, { arms: 0, cams: 0 }); Object.assign(S.wings, { shield: false, gauntlet: false, strike: false, roosts: new Set() }); for (const P of Object.values(models)) if (P) P.root.visible = false; });

  const dbg = {
    get state() { return { worn: S.worn, open: [...S.open], raz: { ...S.raz }, sentinel: { ...S.sentinel }, wings: { ...S.wings, roosts: [...S.wings.roosts] }, log: S.log.slice(-15) }; },
    unlock, wear: k => (S.open.has(k) ? (wear(k), true) : false), fly,
    step: k => { if (k === 'raz') { S.raz.arms = S.raz.masks = NEED - 1; count(S.raz, 'arms'); count(S.raz, 'masks'); } else if (k === 'sentinel') { S.sentinel.arms = S.sentinel.cams = NEED - 1; count(S.sentinel, 'arms'); count(S.sentinel, 'cams'); } else { ['shield', 'gauntlet', 'strike'].forEach(wingStep); ['library', 'factory', 'judicial'].forEach(r => S.wings.roosts.add(r)); check(); } return [...S.open]; },
  };
  gk.wear = dbg; (globalThis.kino ??= {}).gorod ??= {}; globalThis.kino.gorod.wear = dbg;
  console.info(`[gorod-krovi] wearables: ${Object.values(models).filter(Boolean).length} stands, ${pads.filter(Boolean).length} pads`);
}
